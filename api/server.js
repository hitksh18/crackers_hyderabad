const express = require('express');
const cors = require('cors');
// firebase-admin v14 removed the namespaced accessors from the default export
// in favour of these subpath modules. On this version `admin.auth()` is
// undefined and would throw at runtime.
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
// nodemailer is only used through lib/email.js (single Gmail SMTP config).
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const sharp = require('sharp');
const {
  getMediaRoot,
  getPublicBase,
  normalizeDir,
  ensureMediaDirs,
  validateImage,
  extensionForMime,
  generateFilename,
  storeMedia,
  watermarkImage,
  upscaleImage,
  parsePublicUrl,
  deleteMediaByUrl,
  isLocalPublicUrl,
  ALLOWED_DIRS,
} = require('./lib/media');

const {
  STAFF_ROLES,
  canonicalRole,
  normalizeRole,
  escapeHtml,
  sanitiseSmsText,
  createRateLimiter,
  securityHeaders,
} = require('./lib/security');
const {
  createOrder,
  createPosOrder,
  trackOrder,
  handlePublicTrack,
  consumeNotifyToken,
  isValidEmail,
  readHighestUsedSequence,
  setOnlineCounterTo,
  priceCart,
  updateOrderItems,
  listEligibleCoupons,
  applyOrderCoupon,
  applyAdminPercentDiscount,
  removeOrderCoupon,
} = require('./lib/orders');
const {
  normalizeCode: normalizeCouponCode,
  validateCouponInput,
  validateCouponForCart,
  computeDiscountAmount,
  getCouponByCode,
} = require('./lib/coupons');
const {
  readOrderIdConfig,
  writeOrderIdConfig,
  defaultConfig: defaultOrderIdConfig,
} = require('./lib/orderId');
// Single source of truth for SMTP (Gmail App Password via SMTP_*, EMAIL_*
// fallback) — order confirmations, password resets and manual resends.
// The compact confirmation template + payment note live in
// lib/emailTemplates + lib/email so every mail path renders identically.
const { readEmailConfig, createSmtpTransporter, orderPaymentNote, maybeSendOrderConfirmationEmail, sendStatusUpdateEmail } = require('./lib/email');
const { orderConfirmationHtml, orderConfirmationText } = require('./lib/emailTemplates');
// Email Automation (rules, templates, branding, logs, manual sends). The
// order-id style applies: one module owns validation + persistence + send.
const {
  EVENTS: EMAIL_AUTOMATION_EVENTS,
  readAutomationRules,
  validateRulesInput,
  writeAutomationRules,
  readTemplates: readEmailTemplates,
  validateTemplatesInput,
  writeEmailTemplates,
  readBranding: readEmailBranding,
  validateBrandingInput,
  writeEmailBranding,
  readLogs: readEmailLogs,
  readLastTriggered: readEmailLastTriggered,
  sendManualEmail,
  sendDetailsUpdatedEmail,
} = require('./lib/emailAutomation');
// WhatsApp Cloud API sender (order status + invoice document). Staff-only
// endpoint below; credentials live in WHATSAPP_* env vars, never in code.
const whatsapp = require('./lib/whatsapp');
const { handleReverseGeocode, handleSearchPlaces, handleGeocodeConfig } = require('./lib/geocode');
// Order ID generation. The generator, its validation and the messages the admin
// sees all live in one module so the API can never mint an id the settings
// screen would have rejected, or vice versa.
const {
  TOKENS: ORDER_ID_TOKENS,
  DEFAULT_FORMAT: ORDER_ID_DEFAULT_FORMAT,
  DEFAULT_PREFIX: ORDER_ID_DEFAULT_PREFIX,
  DEFAULT_SEQUENCE_LENGTH: ORDER_ID_DEFAULT_SEQUENCE_LENGTH,
  MIN_SEQUENCE_LENGTH: ORDER_ID_MIN_SEQUENCE_LENGTH,
  MAX_SEQUENCE_LENGTH: ORDER_ID_MAX_SEQUENCE_LENGTH,
  MAX_ORDER_ID_LENGTH: ORDER_ID_MAX_LENGTH,
  normalizeConfig: normalizeOrderIdConfig,
  validateConfig: validateOrderIdConfig,
  renderOrderId: renderConfiguredOrderId,
  isSafeOrderId,
  carriesOwnEntropy: orderIdCarriesOwnEntropy,
  /* The single customer-facing Order ID reader (shortCode, strict — never
     the document id). Used by every mail/SMS path below. */
  getDisplayOrderId: displayOrderCode,
} = require('./lib/orderId');
// OFFLINE/STORE Order IDs — fully independent module (own config doc +
// own counter). Imported only for the offline routes + POS path; the ONLINE
// routes above never use it.
const {
  defaultOfflineConfig,
  normalizeOfflineConfig,
  validateOfflineConfig,
  readOfflineOrderIdConfig,
  writeOfflineOrderIdConfig,
  readHighestUsedOfflineSequence,
  setOfflineCounterTo,
  renderOfflineOrderId,
  buildOfflinePreview,
} = require('./lib/offlineOrderId');

/**
 * Environment loading — one place, one documented precedence.
 *
 *   1. Variables already present in the process environment (PM2/systemd)
 *      always win and are never overwritten.
 *   2. <repo>/.env        THE SINGLE SOURCE OF TRUTH for production secrets.
 *      On KVM: /root/crackers-deploy/.env — created by
 *      deploy/kvm/setup-and-deploy.sh and preserved by deploy/kvm/update.sh.
 *      It lives OUTSIDE the API directory on purpose: update.sh does
 *      `rm -rf $DEPLOY_DIR/api`, so a secret inside that directory is one
 *      deploy away from being destroyed.
 *   3. <repo>/.env.email  LEGACY FALLBACK ONLY (local-dev convenience).
 *      Supplies any key that .env does not define. Production must NOT depend
 *      on this file: it is git-ignored, no deploy script creates it, and it is
 *      invisible to `pm2 env`. If production email config lives only here it is
 *      one redeploy from silently losing every customer email — which is exactly
 *      the failure this ordering exists to prevent.
 *
 * process.loadEnvFile() never overwrites a variable that is already set, so
 * loading .env BEFORE .env.email gives .env precedence automatically. That
 * behaviour is load-bearing: reversing these two calls would silently invert
 * precedence, so keep .env first.
 */
function loadEnvFileKeys(file) {
  if (!fs.existsSync(file)) return null;
  try {
    process.loadEnvFile(file);
  } catch (e) {
    console.warn(`Could not load ${path.basename(file)}: ${e.message}`);
    return null;
  }
  try {
    return new Set(
      fs
        .readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/))
        .filter(Boolean)
        .map((m) => m[1])
    );
  } catch {
    return new Set();
  }
}

const primaryEnvKeys = loadEnvFileKeys(path.join(__dirname, '..', '.env'));
const legacyEmailEnvKeys = loadEnvFileKeys(path.join(__dirname, '..', '.env.email'));

// Loud, value-free warning: production must get its email config from .env.
if (process.env.NODE_ENV === 'production' && primaryEnvKeys) {
  const EMAIL_KEYS = [
    'EMAIL_ENABLED',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'EMAIL_FROM_NAME',
    'EMAIL_FROM_ADDRESS',
    'ADMIN_NOTIFICATION_EMAIL',
    'TRACK_BASE_URL',
  ];
  const missingEverywhere = EMAIL_KEYS.filter((k) => !process.env[k]);
  const onlyInLegacy = EMAIL_KEYS.filter(
    (k) => process.env[k] && !primaryEnvKeys.has(k) && legacyEmailEnvKeys && legacyEmailEnvKeys.has(k)
  );
  if (onlyInLegacy.length) {
    console.warn(
      `[env] WARNING: ${onlyInLegacy.join(', ')} resolved from .env.email, not .env. ` +
        'Move them into the primary .env (KVM: /root/crackers-deploy/.env) — ' +
        '.env.email is not preserved by the deployment scripts.'
    );
  }
  if (missingEverywhere.length) {
    console.warn(
      `[env] WARNING: email not configured, missing ${missingEverywhere.join(', ')}. ` +
        'Order emails will be skipped. See KVM_DEPLOYMENT.md.'
    );
  }
}

const app = express();

// Behind Replit/Hostinger proxies req.ip is only meaningful with this set,
// and the rate limiters key on it.
app.set('trust proxy', 1);
app.disable('x-powered-by');

/* ---------------------------------------------------------------------------
   CORS
   Wildcard suffix matching on *.web.app / *.firebaseapp.com used to allow any
   Firebase project on earth to make credentialed calls here — anyone can create
   one. Origins are now an explicit allow-list driven by configuration.
   --------------------------------------------------------------------------- */

const DEFAULT_ORIGINS = [
  'http://localhost:5000',
  'http://localhost:3000',
  'http://localhost:5173',
  'https://crackershyderabad.com',
  'https://www.crackershyderabad.com',
  'https://admin.crackershyderabad.com',
  'https://billing.crackershyderabad.com',
];

const ALLOWED_ORIGINS = [
  ...DEFAULT_ORIGINS,
  ...(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  // Aliases requested by deployment docs — same allow-list, friendlier names.
  ...(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  ...[process.env.CLIENT_URL, process.env.FRONTEND_URL].map((o) => (o || '').trim()).filter(Boolean),
];

const corsOptions = {
  origin(origin, callback) {
    // Same-origin and non-browser callers send no Origin header. They are still
    // subject to authentication on every route that matters.
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);

    // Local development: Vite may bind any free port (5173, 5174, ...), and
    // localhost only resolves to the loopback interface, so this does not open
    // up the allowed-origin list to anyone off-machine.
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    console.warn(`[cors] blocked origin: ${origin}`);
    return callback(new Error('CORS not allowed'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(express.json({ limit: '256kb' }));

// Local media static serving — mirrors production Nginx /uploads → /var/www/crackershyderabad-media
// Production Nginx handles this, but Node must serve it for local Windows testing where Nginx is absent.
// This makes http://localhost:3001/uploads/<dir>/<file> behave like https://crackershyderabad.com/uploads/<dir>/<file>
app.use('/uploads', express.static(getMediaRoot(), { maxAge: '1d', etag: true, lastModified: true }));

/* ---------------------------------------------------------------------------
   Rate limits
   --------------------------------------------------------------------------- */

const adminLimiter = createRateLimiter({ windowMs: 60_000, max: 60, name: 'admin' });
const uploadLimiter = createRateLimiter({ windowMs: 60_000, max: 20, name: 'upload' });
const notifyLimiter = createRateLimiter({ windowMs: 60_000, max: 10, name: 'notify' });

/* ---------------------------------------------------------------------------
   Firebase Admin
   --------------------------------------------------------------------------- */

let firebaseInitialized = false;
/* Project id parsed from the service account itself, so the Storage bucket
   default stays correct even when FIREBASE_PROJECT_ID is not set in the
   server environment (previously it fell back to a hardcoded bucket name
   that may not exist, and every upload silently became a local-disk URL). */
let serviceAccountProjectId = process.env.FIREBASE_PROJECT_ID || '';

function initializeFirebase() {
  if (firebaseInitialized) return true;

  try {
    let serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (!serviceAccount) {
      const saPath = path.join(__dirname, '..', 'service-account.json');
      if (fs.existsSync(saPath)) {
        serviceAccount = fs.readFileSync(saPath, 'utf8');
      }
    }

    if (!serviceAccount) {
      console.error('FIREBASE_SERVICE_ACCOUNT_KEY not found in environment or service-account.json');
      return false;
    }

    const parsed = JSON.parse(serviceAccount);
    if (parsed && parsed.project_id && !serviceAccountProjectId) {
      serviceAccountProjectId = parsed.project_id;
    }
    initializeApp({ credential: cert(parsed) });
    firebaseInitialized = true;
    console.log('Firebase Admin SDK initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK:', error.message);
    return false;
  }
}

initializeFirebase();

// KVM media dirs — ensure they exist once at boot.
try {
  ensureMediaDirs();
  console.log(`KVM media root: ${getMediaRoot()} → ${getPublicBase()}`);
} catch (e) {
  console.warn('[media] ensure dirs failed:', e.message);
}

const requireFirebase = (req, res, next) => {
  if (!firebaseInitialized) {
    return res.status(503).json({
      error: 'Firebase Admin SDK not initialized. Please add FIREBASE_SERVICE_ACCOUNT_KEY secret.',
      setupRequired: true,
    });
  }
  return next();
};

/**
 * Verify the caller's Firebase ID token and resolve their role.
 *
 * This is the control that was missing entirely: every /api/admin route was
 * previously gated only on "is the SDK initialized", which meant an
 * unauthenticated request could list every user and mint a password-reset link
 * for any account — including the owner's.
 */
async function authenticate(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  try {
    // checkRevoked: a disabled or signed-out account must stop working at once.
    const decoded = await getAuth().verifyIdToken(match[1].trim(), true);

    let role = null;
    try {
      const snap = await getFirestore().collection('roles').doc(decoded.uid).get();
      // Normalise so a legacy mod/billing/packer document can never pass a
      // role check here while the frontends treat the same user as a customer.
      if (snap.exists) role = normalizeRole(snap.data().role);
    } catch (error) {
      console.error('Role lookup failed:', error.message);
    }

    return { uid: decoded.uid, email: decoded.email || null, role };
  } catch (error) {
    console.warn('Token verification failed:', error.message);
    return null;
  }
}

const requireRole = (allowed) => async (req, res, next) => {
  if (!firebaseInitialized) {
    return res.status(503).json({ error: 'Service unavailable', setupRequired: true });
  }

  const caller = await authenticate(req);
  if (!caller) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!allowed.includes(caller.role)) {
    console.warn(`[authz] ${caller.uid} (${caller.role || 'no role'}) denied ${req.method} ${req.path}`);
    return res.status(403).json({ error: 'You do not have permission to perform this action' });
  }

  req.caller = caller;
  return next();
};

const requireAdmin = requireRole(['admin']);

/* ---------------------------------------------------------------------------
   KVM Media Storage — permanent filesystem store for ALL uploads.
   https://crackershyderabad.com/uploads/<subdir>/<file>
   Files live in /var/www/crackershyderabad-media/<subdir>/ on production.
   No Firebase Storage, no Cloudinary, no localhost fallback.
   --------------------------------------------------------------------------- */

const UPLOAD_ALLOWED_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_BYTES, files: 1, fields: 10 },
  fileFilter: (req, file, cb) => {
    if (UPLOAD_ALLOWED_TYPES[file.mimetype]) return cb(null, true);
    // status 400: a rejected type is a client validation failure, so the
    // central error handler must return 400 JSON in every environment
    // (without it, production maps this to a generic 500).
    const err = new Error('Only JPEG, PNG, WebP or GIF images are allowed');
    err.status = 400;
    return cb(err);
  },
});

/* Invoice PDF upload for the staff WhatsApp send (POST
   /api/orders/:orderId/whatsapp). Memory-only like image uploads: the bytes
   go straight to the Meta media endpoint and are never written to disk. */
const uploadWhatsappPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: whatsapp.MAX_PDF_BYTES, files: 1, fields: 5 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    const err = new Error('Only a PDF invoice can be attached');
    err.status = 400;
    return cb(err);
  },
});

// Legacy endpoint compatibility: /api/images/:name is now dead (moved to KVM/Nginx).
// Keep a 410 so old DB URLs fail loudly instead of silently returning a wrong image.
app.get('/api/images/:name', (req, res) => {
  return res.status(410).json({ error: 'Moved to KVM: https://crackershyderabad.com/uploads/ — this endpoint is retired.' });
});

app.post(
  '/api/upload',
  uploadLimiter,
  requireAdmin,
  upload.single('image'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Optional dir: which KVM subdirectory to store in. Must be in ALLOWED_DIRS.
    const requestedDir = (req.body.dir || req.query.dir || 'products').toString();
    let dir;
    try {
      dir = normalizeDir(requestedDir);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    // Validate actual image content (not just MIME)
    try {
      await validateImage(req.file.buffer, req.file.mimetype);
    } catch (error) {
      console.warn('[upload] rejected not-an-image:', error.message);
      return res.status(400).json({ error: 'That file is not a valid image' });
    }

    const ext = UPLOAD_ALLOWED_TYPES[req.file.mimetype] || extensionForMime(req.file.mimetype) || '.webp';
    const shouldUpscale = req.body.upscale === 'true';
    const shouldWatermark = req.body.watermark !== 'false';

    let buffer = req.file.buffer;
    let finalName = generateFilename(ext);

    try {
      if (shouldUpscale) {
        const result = await upscaleImage(buffer, finalName);
        buffer = result.buffer;
        finalName = result.name;
      }
      if (shouldWatermark) {
        const marked = await watermarkImage(buffer);
        if (marked !== false) buffer = marked;
      }
    } catch (error) {
      console.error('[upload] image processing failed, keeping original:', error.message);
    }

    try {
      const destDir = path.join(getMediaRoot(), dir);
      const safeOriginal = String(req.file.originalname || '').replace(/[\r\n\t]+/g, ' ').slice(0, 120);
      console.log(`[upload] storing file... dir=${dir} mimetype=${req.file.mimetype} originalName=${safeOriginal} size=${buffer.length}`);
      console.log(`[upload] storage path: ${path.join(destDir, finalName)}`);
      const { publicUrl, absolutePath, filename: storedFilename } = await storeMedia(buffer, dir, finalName);
      console.log('[upload] file stored successfully');
      console.log(`[upload] dir=${dir} mimetype=${req.file.mimetype} originalName=${safeOriginal} size=${buffer.length} upscale=${shouldUpscale} watermark=${shouldWatermark}`);
      console.log(`[upload] generatedFilename=${finalName} storedFilename=${storedFilename} destDir=${destDir} absolutePath=${absolutePath}`);
      console.log(`[upload] public URL: ${publicUrl}`);
      // `local` tells the frontend whether this URL only loads on this
      // machine (local development) or is permanent KVM media. Existing
      // fields are unchanged so current callers keep working.
      return res.json({ url: publicUrl, publicUrl, dir, filename: storedFilename, local: isLocalPublicUrl(publicUrl) });
    } catch (error) {
      // Log the detail server-side; the browser gets a safe generic message
      // (the raw detail can contain internal filesystem paths).
      console.error('[upload] KVM store failed:', error.message);
      return res.status(500).json({ error: 'Failed to store image' });
    }
  }
);

// Generic media delete — admin only, dir inferred from URL.
app.delete('/api/media', uploadLimiter, requireAdmin, async (req, res) => {
  const url = String(req.body?.url || req.query.url || '').trim();
  if (!url) return res.status(400).json({ error: 'Missing url' });
  try {
    const ok = await deleteMediaByUrl(url);
    return res.json({ ok, deleted: ok });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// Health for KVM media (admin only)
app.get('/api/admin/media-health', adminLimiter, requireAdmin, async (req, res) => {
  const root = getMediaRoot();
  const base = getPublicBase();
  const checks = [];
  for (const dir of ALLOWED_DIRS) {
    const full = path.join(root, ...dir.split('/'));
    let ok = false;
    let error = null;
    try {
      await fs.promises.mkdir(full, { recursive: true });
      await fs.promises.access(full, fs.constants.W_OK);
      ok = true;
    } catch (e) {
      error = e.message;
    }
    checks.push({ dir, path: full, ok, error });
  }
  const probeFile = `health_${Date.now()}.png`;
  let probeOk = false;
  try {
    const { absolutePath } = await storeMedia(Buffer.from('health'), 'general', probeFile);
    await fs.promises.access(absolutePath, fs.constants.F_OK);
    await fs.promises.unlink(absolutePath);
    probeOk = true;
  } catch (e) {
    console.warn('[media-health] probe failed:', e.message);
  }
  return res.json({ ok: checks.every((c) => c.ok) && probeOk, root, base, dirs: checks, probeOk });
});

/* ---------------------------------------------------------------------------
   Admin user management — all admin-only, all rate limited
   --------------------------------------------------------------------------- */

const toUserPayload = (userRecord) => ({
  uid: userRecord.uid,
  email: userRecord.email || null,
  displayName: userRecord.displayName || null,
  photoURL: userRecord.photoURL || null,
  phoneNumber: userRecord.phoneNumber || null,
  emailVerified: userRecord.emailVerified,
  disabled: userRecord.disabled,
  providers: (userRecord.providerData || []).map((p) => p.providerId),
  creationTime: userRecord.metadata.creationTime,
  lastSignInTime: userRecord.metadata.lastSignInTime,
  lastRefreshTime: userRecord.metadata.lastRefreshTime || null,
});

/* ---------------------------------------------------------------------------
   Combined User Management object — Auth is the source of truth for which
   accounts exist; Firestore users/{uid} + roles/{uid} are profile data only.

   Flow: Auth users → users/{uid} → roles/{uid} → combined object.
   NEVER the reverse: Firestore-only UIDs are orphans and are never merged
   into the list (see POST /api/admin/users/reconcile for cleanup).

   users/{uid} schema observed in this repo (do not invent fields):
     name, displayName, email, phone, phoneNumber, createdAt, updatedAt,
     wishlist (array — preserved, never edited here).
   NOTE: no `address` field exists in users/{uid}; it is intentionally absent
   from the editable allow-list below.
   roles/{uid} schema: { role: 'admin' | 'sales' | 'customer' }.
   --------------------------------------------------------------------------- */

const toPlainProfile = (data) => {
  if (!data || typeof data !== 'object') return null;
  const out = {};
  if (typeof data.name === 'string') out.name = data.name;
  if (typeof data.displayName === 'string') out.displayName = data.displayName;
  if (typeof data.email === 'string') out.email = data.email;
  if (typeof data.phone === 'string') out.phone = data.phone;
  if (typeof data.phoneNumber === 'string') out.phoneNumber = data.phoneNumber;
  if (data.createdAt !== undefined) {
    try {
      out.createdAt = typeof data.createdAt.toDate === 'function'
        ? data.createdAt.toDate().toISOString()
        : data.createdAt;
    } catch { out.createdAt = null; }
  }
  if (data.updatedAt !== undefined) {
    try {
      out.updatedAt = typeof data.updatedAt.toDate === 'function'
        ? data.updatedAt.toDate().toISOString()
        : data.updatedAt;
    } catch { out.updatedAt = null; }
  }
  if (Array.isArray(data.wishlist)) out.wishlistCount = data.wishlist.length;
  return out;
};

const buildCombinedUser = (userRecord, profileDataOrNull, roleValue) => {
  const base = toUserPayload(userRecord);
  const hasProfile = profileDataOrNull !== null && profileDataOrNull !== undefined;
  const profile = hasProfile ? toPlainProfile(profileDataOrNull) : null;
  const role = normalizeRole(roleValue);
  // Firestore profile conveniences — empty/default values when the doc is
  // missing. The Auth row still appears; nothing fake is created.
  const profileName = hasProfile
    ? (profileDataOrNull.name || profileDataOrNull.displayName || '')
    : '';
  const profileEmail = hasProfile ? (profileDataOrNull.email || '') : '';
  const profilePhone = hasProfile
    ? (profileDataOrNull.phone || profileDataOrNull.phoneNumber || '')
    : '';
  return {
    ...base,
    id: userRecord.uid,
    name: base.displayName || profileName || null,
    role,
    hasProfile,
    profileMissing: !hasProfile,
    profile,
    profileName,
    profileEmail,
    profilePhone,
    // Raw Firestore field aliases (empty string when missing) for the table.
    firestoreName: hasProfile ? (profileDataOrNull.name || '') : '',
    firestoreDisplayName: hasProfile ? (profileDataOrNull.displayName || '') : '',
    firestoreEmail: profileEmail,
    firestorePhone: hasProfile ? (profileDataOrNull.phone || '') : '',
    firestorePhoneNumber: hasProfile ? (profileDataOrNull.phoneNumber || '') : '',
  };
};

const isValidUidParam = (value) =>
  typeof value === 'string' && value.length >= 1 && value.length <= 128 && !/[\s/]/.test(value);

const sanitizeNameField = (value, max = 120) =>
  String(value).trim().slice(0, max);

const sanitizePhoneField = (value, max = 32) =>
  String(value).trim().slice(0, max);

const isPlausiblePhone = (value) => /^[\d+\-()\s]{0,32}$/.test(value);

app.get('/api/admin/users', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const authRecords = [];
    let nextPageToken;

    try {
      do {
        const result = await getAuth().listUsers(1000, nextPageToken);
        result.users.forEach((u) => authRecords.push(u));
        nextPageToken = result.pageToken;
      } while (nextPageToken);
    } catch (e) {
      // Phase 1 — Auth enumeration. The ONLY fatal phase: without the Auth
      // list there is no source of truth, so this is a genuine 500.
      console.error('[admin/users] listUsers failed:',
        'code=', e.code || '(none)',
        'message=', e.message || '(none)');
      return res.status(500).json({ error: 'Failed to list users' });
    }

    // Bulk-fetch Firestore companions once (logically: for each UID, read
    // users/{uid} + roles/{uid}). Firestore-only UIDs are ignored here.
    // Phase 2 — enrichment is best-effort: a Firestore outage must never
    // turn into a 500; the Auth rows go out unenriched instead.
    const db = getFirestore();
    let profileByUid = {};
    let roleByUid = {};
    try {
      const [usersSnap, rolesSnap] = await Promise.all([
        db.collection('users').get(),
        db.collection('roles').get(),
      ]);
      usersSnap.docs.forEach((d) => { profileByUid[d.id] = d.data() || null; });
      rolesSnap.docs.forEach((d) => { roleByUid[d.id] = d.data()?.role; });
    } catch (e) {
      console.error('[admin/users] companion fetch failed, returning Auth-only rows:',
        'code=', e.code || '(none)',
        'message=', e.message || '(none)');
      profileByUid = {};
      roleByUid = {};
    }

    // Phase 3 — per-user combine. A malformed profile/role for ONE user must
    // never fail the whole list: that row falls back to its Auth payload
    // (role customer) and the exception is logged with the UID.
    const users = authRecords.map((u) => {
      try {
        return buildCombinedUser(
          u,
          Object.prototype.hasOwnProperty.call(profileByUid, u.uid) ? profileByUid[u.uid] : null,
          roleByUid[u.uid],
        );
      } catch (e) {
        console.error(`[admin/users] combine failed for ${u.uid}, returning Auth-only row:`,
          'message=', e.message || '(none)');
        return buildCombinedUser(u, null, undefined);
      }
    });

    console.log(`[admin/users] ${req.caller.uid} listed ${users.length} users`);
    res.json({ users, total: users.length });
  } catch (error) {
    console.error('[admin/users] unexpected failure:',
      'code=', error.code || '(none)',
      'message=', error.message || '(none)',
      error.stack ? `\n${error.stack}` : '');
    res.status(500).json({ error: 'Failed to list users' });
  }
});

app.get('/api/admin/users/:uid', adminLimiter, requireAdmin, async (req, res) => {
  try {
    if (!isValidUidParam(req.params.uid)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const userRecord = await getAuth().getUser(req.params.uid);
    const db = getFirestore();
    const [profileSnap, roleSnap] = await Promise.all([
      db.collection('users').doc(req.params.uid).get().catch(() => null),
      db.collection('roles').doc(req.params.uid).get().catch(() => null),
    ]);
    res.json(buildCombinedUser(
      userRecord,
      profileSnap && profileSnap.exists ? profileSnap.data() : null,
      roleSnap && roleSnap.exists ? roleSnap.data()?.role : undefined,
    ));
  } catch (error) {
    console.error('[admin/users/:uid] failed:',
      'code=', error.code || '(none)',
      'message=', error.message || '(none)');
    res.status(404).json({ error: 'User not found' });
  }
});

app.post('/api/admin/users/:uid/reset-password', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const userRecord = await getAuth().getUser(req.params.uid);

    if (!userRecord.email) {
      return res.status(400).json({ error: 'User does not have an email address' });
    }

    // The link is a bearer credential for that account. It is generated and
    // delivered to the account's own inbox; it is never returned to the caller,
    // which is what previously turned this endpoint into account takeover.
    const link = await getAuth().generatePasswordResetLink(userRecord.email);

    if (checkEmailConfig()) {
      await getEmailTransporter().sendMail({
        from: `"Crackers Hyderabad" <${process.env.EMAIL_USER}>`,
        to: userRecord.email,
        subject: 'Reset your Crackers Hyderabad password',
        html: `<p>Hello,</p>
               <p>An administrator has started a password reset for your account.
               Use the link below within the next hour:</p>
               <p><a href="${escapeHtml(link)}">Reset your password</a></p>
               <p>If you did not expect this, you can ignore this email — your
               current password will keep working.</p>`,
      });

      console.log(`[admin] ${req.caller.uid} sent a password reset to ${userRecord.uid}`);
      return res.json({ success: true, message: `Reset link emailed to ${userRecord.email}`, email: userRecord.email });
    }

    console.warn('[admin] password reset generated but email is not configured');
    return res.status(503).json({
      error: 'Email service is not configured, so the reset link could not be delivered.',
      setupRequired: true,
    });
  } catch (error) {
    console.error('Error generating password reset:', error);
    return res.status(500).json({ error: 'Failed to send password reset' });
  }
});

app.post('/api/admin/users/:uid/disable', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const disabled = req.body?.disabled === true;

    if (req.params.uid === req.caller.uid && disabled) {
      return res.status(400).json({ error: 'You cannot disable your own account' });
    }

    await getAuth().updateUser(req.params.uid, { disabled });
    console.log(`[admin] ${req.caller.uid} set disabled=${disabled} on ${req.params.uid}`);
    res.json({ success: true, message: disabled ? 'User account disabled' : 'User account enabled', disabled });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

/* Role change — the single path for assigning admin | sales | customer.
   Admin token + server-side allow-list: the browser never writes roles/{uid}
   directly, so a patched frontend cannot hand itself a role outside the
   vocabulary (and no legacy mod/billing/packer value can be written back). */
app.post('/api/admin/users/:uid/role', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const role = canonicalRole(req.body?.role);
    if (!role) {
      return res.status(400).json({ error: 'Invalid role. Allowed roles: admin, sales, customer' });
    }

    // An admin may promote or demote anyone but themselves: losing the last
    // admin (or locking yourself out mid-edit) is a self-inflicted outage.
    if (req.params.uid === req.caller.uid && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot remove your own admin privileges' });
    }

    try {
      await getAuth().getUser(req.params.uid);
    } catch (error) {
      if ((error.code || '').includes('user-not-found')) {
        return res.status(404).json({ error: 'User not found' });
      }
      throw error;
    }

    await getFirestore().collection('roles').doc(req.params.uid).set({ role }, { merge: true });
    console.log(`[admin] ${req.caller.uid} set role=${role} on ${req.params.uid}`);
    res.json({ success: true, role, message: `Role updated to ${role}` });
  } catch (error) {
    console.error('Error updating role:', error.code, error.message);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

app.delete('/api/admin/users/:uid', adminLimiter, requireAdmin, async (req, res) => {
  try {
    if (req.params.uid === req.caller.uid) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    let authDeleted = false;

    // Attempt to delete the Firebase Auth account
    try {
      await getAuth().deleteUser(req.params.uid);
      authDeleted = true;
      console.log(`[admin] ${req.caller.uid} deleted auth user ${req.params.uid}`);
    } catch (authError) {
      const code = authError.code || '';
      if (code.includes('user-not-found')) {
        // Auth account already gone — continue with Firestore cleanup
        console.log(`[admin] ${req.caller.uid} delete: auth user ${req.params.uid} already missing, cleaning Firestore`);
      } else if (code.includes('invalid-uid')) {
        return res.status(400).json({ error: 'Invalid user ID' });
      } else {
        // Other auth errors are fatal
        console.error('Error deleting auth user:', authError.code, authError.message);
        return res.status(500).json({ error: 'Failed to delete user' });
      }
    }

    // Clean up Firestore documents — always attempt, even if auth was already missing
    let rolesDeleted = false;
    let usersDeleted = false;

    try {
      await getFirestore().collection('roles').doc(req.params.uid).delete();
      rolesDeleted = true;
    } catch (e) {
      console.warn('[admin] roles cleanup failed for', req.params.uid, e.message);
    }

    try {
      await getFirestore().collection('users').doc(req.params.uid).delete();
      usersDeleted = true;
    } catch (e) {
      console.warn('[admin] users cleanup failed for', req.params.uid, e.message);
    }

    console.log(`[admin] ${req.caller.uid} deleted ${req.params.uid} (authDeleted=${authDeleted}, rolesDeleted=${rolesDeleted}, usersDeleted=${usersDeleted})`);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error.code, error.message);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * Reconcile orphaned Firestore user documents.
 *
 * Compares Firebase Auth users against Firestore 'users' and 'roles' collections.
 * Removes Firestore documents that have no corresponding Auth account.
 * NEVER deletes Auth accounts or order records.
 * Admin-only, rate-limited, requires valid admin token.
 */
app.post('/api/admin/users/reconcile', adminLimiter, requireAdmin, async (req, res) => {
  try {
    // 1. Get all Firebase Auth users
    const authUids = new Set();
    let nextPageToken;
    do {
      const result = await getAuth().listUsers(1000, nextPageToken);
      result.users.forEach((u) => authUids.add(u.uid));
      nextPageToken = result.pageToken;
    } while (nextPageToken);

    // 2. Get all Firestore users
    const usersSnapshot = await getFirestore().collection('users').get();
    const rolesSnapshot = await getFirestore().collection('roles').get();

    const firestoreUserUids = new Set();
    usersSnapshot.docs.forEach((doc) => firestoreUserUids.add(doc.id));

    const firestoreRoleUids = new Set();
    rolesSnapshot.docs.forEach((doc) => firestoreRoleUids.add(doc.id));

    // 3. Find orphans: Firestore UIDs not in Auth
    const orphanUserUids = [...firestoreUserUids].filter((uid) => !authUids.has(uid));
    const orphanRoleUids = [...firestoreRoleUids].filter((uid) => !authUids.has(uid));

    // 4. Delete orphan documents (batched for efficiency)
    const db = getFirestore();
    const batch = db.batch();

    let usersCleaned = 0;
    let rolesCleaned = 0;

    for (const uid of orphanUserUids) {
      batch.delete(db.collection('users').doc(uid));
      usersCleaned++;
    }
    for (const uid of orphanRoleUids) {
      batch.delete(db.collection('roles').doc(uid));
      rolesCleaned++;
    }

    if (usersCleaned > 0 || rolesCleaned > 0) {
      await batch.commit();
    }

    console.log(`[admin] ${req.caller.uid} reconciled users: ${usersCleaned} users, ${rolesCleaned} roles removed`);

    res.json({
      success: true,
      message: 'Reconciliation complete',
      summary: {
        authUsersChecked: authUids.size,
        firestoreUsersFound: firestoreUserUids.size,
        firestoreRolesFound: firestoreRoleUids.size,
        orphanUsersRemoved: usersCleaned,
        orphanRolesRemoved: rolesCleaned,
      },
    });
  } catch (error) {
    console.error('Error during reconciliation:', error.code, error.message);
    res.status(500).json({ error: 'Failed to reconcile users' });
  }
});

app.post('/api/admin/users/:uid/update', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const { displayName, email, emailVerified, photoURL } = req.body || {};
    const updateData = {};

    if (typeof displayName === 'string') updateData.displayName = displayName.slice(0, 120);
    if (typeof email === 'string') updateData.email = email.slice(0, 254);
    if (typeof emailVerified === 'boolean') updateData.emailVerified = emailVerified;
    if (typeof photoURL === 'string' && /^https:\/\//i.test(photoURL)) updateData.photoURL = photoURL;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await getAuth().updateUser(req.params.uid, updateData);
    console.log(`[admin] ${req.caller.uid} updated ${req.params.uid}`);
    res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/* Combined Admin edit — PATCH /api/admin/users/:uid.
   1. requireAdmin (ID token + admin role, server-side).
   2. Validate UID.
   3. Update allowed Auth fields via Admin SDK.
   4. Update allow-listed users/{uid} profile fields with merge (never
      overwrite: wishlist, createdAt and every non-allow-listed key survive).
   5. Update roles/{uid} when `role` is supplied (admin|sales|customer only).
   6. Return the complete combined user object.
   NEVER touches the orders collection. */
app.patch('/api/admin/users/:uid', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const uid = req.params.uid;
    if (!isValidUidParam(uid)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const body = req.body || {};

    let current;
    try {
      current = await getAuth().getUser(uid);
    } catch (e) {
      if ((e.code || '').includes('user-not-found')) {
        return res.status(404).json({ error: 'User not found' });
      }
      throw e;
    }

    // ---- Auth allow-list ----
    const authUpdate = {};
    if (body.displayName !== undefined) {
      if (typeof body.displayName !== 'string') {
        return res.status(400).json({ error: 'Invalid displayName' });
      }
      const v = sanitizeNameField(body.displayName);
      authUpdate.displayName = v === '' ? null : v;
    }
    if (body.email !== undefined) {
      if (typeof body.email !== 'string' || !isValidEmail(body.email.trim())) {
        return res.status(400).json({ error: 'Invalid email address' });
      }
      authUpdate.email = body.email.trim().slice(0, 254);
    }
    if (body.disabled !== undefined) {
      if (typeof body.disabled !== 'boolean') {
        return res.status(400).json({ error: 'Invalid disabled flag' });
      }
      if (uid === req.caller.uid && body.disabled === true) {
        return res.status(400).json({ error: 'You cannot disable your own account' });
      }
      authUpdate.disabled = body.disabled;
    }
    if (body.emailVerified !== undefined) {
      if (typeof body.emailVerified !== 'boolean') {
        return res.status(400).json({ error: 'Invalid emailVerified flag' });
      }
      authUpdate.emailVerified = body.emailVerified;
    }
    if (body.photoURL !== undefined) {
      if (typeof body.photoURL !== 'string') {
        return res.status(400).json({ error: 'Invalid photoURL' });
      }
      const v = body.photoURL.trim();
      if (v !== '' && !/^https:\/\//i.test(v)) {
        return res.status(400).json({ error: 'Invalid photoURL' });
      }
      authUpdate.photoURL = v === '' ? null : v.slice(0, 2048);
    }

    // ---- Firestore profile allow-list (existing schema only) ----
    const profileUpdate = {};
    if (body.name !== undefined) {
      if (typeof body.name !== 'string') return res.status(400).json({ error: 'Invalid name' });
      profileUpdate.name = sanitizeNameField(body.name);
    }
    if (body.firestoreDisplayName !== undefined || body.profileDisplayName !== undefined || body.displayName !== undefined) {
      // Mirror the Auth displayName into the profile when the admin edited it,
      // unless an explicit profile displayName override was supplied.
      const explicit = body.firestoreDisplayName !== undefined ? body.firestoreDisplayName
        : body.profileDisplayName !== undefined ? body.profileDisplayName
        : undefined;
      const raw = explicit !== undefined ? explicit : body.displayName;
      if (raw !== undefined) {
        if (typeof raw !== 'string') return res.status(400).json({ error: 'Invalid profile displayName' });
        profileUpdate.displayName = sanitizeNameField(raw);
      }
    }
    if (body.phone !== undefined) {
      if (typeof body.phone !== 'string' || !isPlausiblePhone(body.phone.trim())) {
        return res.status(400).json({ error: 'Invalid phone number' });
      }
      profileUpdate.phone = sanitizePhoneField(body.phone);
    }
    if (body.phoneNumber !== undefined) {
      if (typeof body.phoneNumber !== 'string' || !isPlausiblePhone(body.phoneNumber.trim())) {
        return res.status(400).json({ error: 'Invalid phone number' });
      }
      profileUpdate.phoneNumber = sanitizePhoneField(body.phoneNumber);
    }
    if (body.profileEmail !== undefined || body.firestoreEmail !== undefined) {
      const raw = body.profileEmail !== undefined ? body.profileEmail : body.firestoreEmail;
      if (typeof raw !== 'string') return res.status(400).json({ error: 'Invalid profile email' });
      const v = raw.trim();
      if (v !== '' && !isValidEmail(v)) return res.status(400).json({ error: 'Invalid profile email' });
      profileUpdate.email = v.slice(0, 254);
    } else if (authUpdate.email) {
      // Keep the Firestore email mirror in sync when the Auth email changes.
      profileUpdate.email = authUpdate.email;
    }

    // ---- Role ----
    let nextRole = null;
    if (body.role !== undefined) {
      nextRole = canonicalRole(body.role);
      if (!nextRole) {
        return res.status(400).json({ error: 'Invalid role. Allowed roles: admin, sales, customer' });
      }
      if (uid === req.caller.uid && nextRole !== 'admin') {
        return res.status(400).json({ error: 'You cannot remove your own admin privileges' });
      }
    }

    if (Object.keys(authUpdate).length === 0 && Object.keys(profileUpdate).length === 0 && !nextRole) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const db = getFirestore();
    if (Object.keys(authUpdate).length > 0) {
      try {
        await getAuth().updateUser(uid, authUpdate);
      } catch (e) {
        if ((e.code || '').includes('email-already-exists')) {
          return res.status(409).json({ error: 'That email is already in use by another account' });
        }
        throw e;
      }
    }
    if (Object.keys(profileUpdate).length > 0) {
      profileUpdate.updatedAt = FieldValue.serverTimestamp();
      await db.collection('users').doc(uid).set(profileUpdate, { merge: true });
    }
    if (nextRole) {
      await db.collection('roles').doc(uid).set({ role: nextRole }, { merge: true });
    }

    const [freshAuth, freshProfileSnap, freshRoleSnap] = await Promise.all([
      getAuth().getUser(uid),
      db.collection('users').doc(uid).get().catch(() => null),
      db.collection('roles').doc(uid).get().catch(() => null),
    ]);
    console.log(`[admin] ${req.caller.uid} patched ${uid} (auth=${Object.keys(authUpdate).join(',') || '—'}, profile=${Object.keys(profileUpdate).join(',') || '—'}, role=${nextRole || '—'})`);
    return res.json({
      success: true,
      message: 'User updated successfully',
      user: buildCombinedUser(
        freshAuth,
        freshProfileSnap && freshProfileSnap.exists ? freshProfileSnap.data() : null,
        freshRoleSnap && freshRoleSnap.exists ? freshRoleSnap.data()?.role : undefined,
      ),
    });
  } catch (error) {
    console.error('Error patching user:', error.code, error.message);
    // Auth email collision or missing user surface as 4xx above; anything
    // reaching here is a genuine server failure.
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to update user' });
    }
  }
});

/* Create the missing users/{uid} profile for an existing Auth account.
   Idempotent: when the doc already exists nothing is overwritten. Used by the
   Admin UI banner for Auth users with hasProfile === false. */
app.post('/api/admin/users/:uid/profile', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const uid = req.params.uid;
    if (!isValidUidParam(uid)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    let authRecord;
    try {
      authRecord = await getAuth().getUser(uid);
    } catch (e) {
      if ((e.code || '').includes('user-not-found')) {
        return res.status(404).json({ error: 'User not found' });
      }
      throw e;
    }
    const db = getFirestore();
    const ref = db.collection('users').doc(uid);
    const existing = await ref.get();
    if (existing.exists) {
      const roleSnap = await db.collection('roles').doc(uid).get().catch(() => null);
      return res.json({
        success: true,
        created: false,
        message: 'Profile already exists',
        user: buildCombinedUser(
          authRecord,
          existing.data(),
          roleSnap && roleSnap.exists ? roleSnap.data()?.role : undefined,
        ),
      });
    }
    const seed = {
      name: sanitizeNameField(authRecord.displayName || ''),
      displayName: sanitizeNameField(authRecord.displayName || ''),
      email: (authRecord.email || '').slice(0, 254),
      phone: sanitizePhoneField(authRecord.phoneNumber || ''),
      phoneNumber: sanitizePhoneField(authRecord.phoneNumber || ''),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await ref.set(seed, { merge: true });
    const [snap, roleSnap] = await Promise.all([
      ref.get(),
      db.collection('roles').doc(uid).get().catch(() => null),
    ]);
    console.log(`[admin] ${req.caller.uid} created missing profile for ${uid}`);
    return res.json({
      success: true,
      created: true,
      message: 'Profile created',
      user: buildCombinedUser(
        authRecord,
        snap.exists ? snap.data() : null,
        roleSnap && roleSnap.exists ? roleSnap.data()?.role : undefined,
      ),
    });
  } catch (error) {
    console.error('Error ensuring profile:', error.code, error.message);
    return res.status(500).json({ error: 'Failed to create profile' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/admin/firebase-health', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const firestoreOk = await (async () => {
      try {
        await getFirestore().collection('roles').limit(1).get();
        return true;
      } catch (e) {
        console.error('[health] firestore check failed:', e.message);
        return false;
      }
    })();

    const authOk = await (async () => {
      try {
        await getAuth().listUsers(1);
        return true;
      } catch (e) {
        console.error('[health] auth check failed:', e.message);
        return false;
      }
    })();

    const media = await (async () => {
      const root = getMediaRoot();
      const base = getPublicBase();
      try {
        await fs.promises.mkdir(path.join(root, 'products'), { recursive: true });
        await fs.promises.access(root, fs.constants.W_OK);
        const probe = `health_${Date.now()}.png`;
        const { absolutePath } = await storeMedia(Buffer.from('health'), 'general', probe);
        await fs.promises.unlink(absolutePath).catch(() => {});
        return { ok: true, root, base, mediaOk: true };
      } catch (e) {
        console.error('[health] KVM media check failed:', e.message);
        return { ok: false, root, base, mediaOk: false, error: e.message };
      }
    })();

    const ok = firebaseInitialized && firestoreOk && authOk && media.ok;
    res.json({
      ok,
      auth: authOk,
      firestore: firestoreOk,
      storage: media,
      media,
      projectId: serviceAccountProjectId || process.env.FIREBASE_PROJECT_ID || 'standard-crackers-store',
      initialized: firebaseInitialized,
    });
  } catch (e) {
    console.error('[health] unexpected:', e.message);
    res.status(500).json({ ok: false, error: 'Health check failed' });
  }
});

/* KVM probe — definitive "can this server write to KVM" check */
app.post('/api/admin/storage-probe', adminLimiter, requireAdmin, async (req, res) => {
  const base = getPublicBase();
  try {
    const name = `kvm-probe-${Date.now()}.png`;
    const { publicUrl, absolutePath } = await storeMedia(Buffer.from('kvm-probe'), 'general', name);
    const exists = fs.existsSync(absolutePath);
    await fs.promises.unlink(absolutePath).catch(() => {});
    if (!exists) {
      return res.status(500).json({ ok: false, base, error: 'Probe object missing right after write' });
    }
    console.log(`[storage-probe] KVM OK (${publicUrl})`);
    return res.json({ ok: true, base, publicUrl });
  } catch (e) {
    console.error('[storage-probe] KVM FAILED:', e.message);
    return res.status(500).json({ ok: false, base, error: e.message });
  }
});

/* ---------------------------------------------------------------------------
   Recommendations + analytics engine
   Public surfaces (events, home, search, similar, cart, recent, category,
   trending) are rate-limited but unauthenticated — they operate on
   sessionId/userId passed by the storefront. Admin surfaces (analytics,
   config) require an admin role.
   --------------------------------------------------------------------------- */

const rec = require('./lib/recommendation');

const eventLimiter = createRateLimiter({ windowMs: 60_000, max: 120, name: 'events' });
const recLimiter = createRateLimiter({ windowMs: 60_000, max: 120, name: 'rec' });

const withDb = (handler) => (req, res) => {
  req.firestore = getFirestore();
  return handler(req, res);
};

app.post('/api/events', requireFirebase, eventLimiter, withDb(async (req, res) => {
  // Optional auth: bind attribution to the verified caller so a client cannot
  // POST events under another account's userId (which would corrupt that
  // account's learned preference vector). Guests remain session-scoped.
  req.caller = await authenticate(req);
  return rec.handleRecordEvent(req, res);
}));
app.post('/api/recommendations/events', requireFirebase, eventLimiter, withDb(rec.handleRecEvent));

app.get('/api/recommendations/home', requireFirebase, recLimiter, withDb(rec.handleHome));
app.get('/api/recommendations/search', requireFirebase, recLimiter, withDb(rec.handleSearch));
app.get('/api/recommendations/similar/:productId', requireFirebase, recLimiter, withDb(rec.handleSimilar));
app.post('/api/recommendations/cart', requireFirebase, recLimiter, withDb(rec.handleCart));
app.get('/api/recommendations/recent', requireFirebase, recLimiter, withDb(rec.handleRecent));
app.get('/api/recommendations/category/:category', requireFirebase, recLimiter, withDb(rec.handleCategory));
app.get('/api/trending', requireFirebase, recLimiter, withDb(rec.handleTrending));

app.get('/api/admin/recommendations/analytics', requireFirebase, requireAdmin, adminLimiter, withDb(rec.handleAnalytics));
app.get('/api/admin/recommendations/config', requireFirebase, requireAdmin, adminLimiter, withDb(rec.handleGetConfig));
app.put('/api/admin/recommendations/config', requireFirebase, requireAdmin, adminLimiter, withDb(rec.handlePutConfig));

/* ---------------------------------------------------------------------------
   Order ID settings — Settings → Orders → Order ID.

   Order ids are minted on the server (lib/orders.js, inside the transaction
   that writes the order), so this endpoint only ever *configures* the format.
   It cannot and does not touch an order that already exists: changing the
   format changes what the NEXT order is called, never what a past one was.

   GET  returns the saved config plus the sequence facts the UI needs to render
        a preview and to keep the form honest (highest sequence ever issued, the
        sequence the next order will take).
   PUT  validates, then saves. The sequence floor is enforced against the live
        counter, not against the value the browser sent, so a stale form cannot
        rewind the sequence and re-issue an id that is already out in the world.
   POST previews an unsaved draft, so the admin sees exactly what would be
        minted — rendered by the same function that mints it.
   --------------------------------------------------------------------------- */

/**
 * Render the two ids the settings screen shows: the next one that would be
 * minted, and the one after it. Both are pure — nothing is reserved — so an
 * admin can preview all afternoon without consuming a number.
 */
function buildOrderIdPreview(config, baseSequence) {
  const now = new Date();
  const first = Math.max(1, Number(baseSequence) || 1);
  return {
    next: renderConfiguredOrderId(config, { sequence: first, now }),
    afterNext: renderConfiguredOrderId(config, { sequence: first + 1, now }),
    sequence: first,
  };
}

app.get(
  '/api/admin/order-id',
  requireFirebase,
  requireAdmin,
  adminLimiter,
  withDb(async (req, res) => {
    try {
      const db = req.firestore;
      const [{ config, isUsable }, highestUsedSequence] = await Promise.all([
        readOrderIdConfig(db),
        readHighestUsedSequence(db),
      ]);

      /* The next sequence is the counter, not the stored `nextSequence`. The
         stored value is only the floor the last save asked for; the counter is
         what has actually been issued, and it may have moved on since. */
      const nextSequence = Math.max(highestUsedSequence + 1, Number(config.nextSequence) || 1);

      return res.json({
        config: { ...config, nextSequence },
        defaults: defaultOrderIdConfig(),
        tokens: ORDER_ID_TOKENS,
        limits: {
          minSequenceLength: ORDER_ID_MIN_SEQUENCE_LENGTH,
          maxSequenceLength: ORDER_ID_MAX_SEQUENCE_LENGTH,
          maxOrderIdLength: ORDER_ID_MAX_LENGTH,
        },
        highestUsedSequence,
        preview: buildOrderIdPreview(config, nextSequence),
        // False means the stored document was present but unusable and the
        // default is in force — the UI says so rather than silently showing a
        // format that is not what orders are actually getting.
        storedConfigUsable: isUsable,
      });
    } catch (error) {
      console.error('[orderId] failed to load config:', error);
      return res.status(500).json({ error: 'Could not load the Order ID settings' });
    }
  })
);

app.post(
  '/api/admin/order-id/preview',
  requireFirebase,
  requireAdmin,
  adminLimiter,
  withDb(async (req, res) => {
    try {
      const db = req.firestore;
      const highestUsedSequence = await readHighestUsedSequence(db);
      const { config: saved } = await readOrderIdConfig(db);

      // Preview the draft as typed, falling back to the saved values for
      // anything the form has not sent, so a half-filled form still previews.
      const { config } = normalizeOrderIdConfig({
        format: req.body?.format ?? saved.format,
        prefix: req.body?.prefix ?? saved.prefix,
        sequenceLength: req.body?.sequenceLength ?? saved.sequenceLength,
        nextSequence: req.body?.nextSequence ?? saved.nextSequence,
      });

      const validation = validateOrderIdConfig(req.body || {}, { highestUsedSequence });
      const sequence = Math.max(1, Number(req.body?.nextSequence) || highestUsedSequence + 1);

      return res.json({
        valid: validation.ok,
        errors: validation.errors,
        // Rendering the draft is what the admin is actually looking at, so the
        // preview deliberately bypasses validation — an invalid draft still gets
        // a preview, marked invalid, rather than a blank panel.
        preview: buildOrderIdPreview(config, sequence),
        highestUsedSequence,
      });
    } catch (error) {
      console.error('[orderId] preview failed:', error);
      return res.status(500).json({ error: 'Could not preview that format' });
    }
  })
);

app.put(
  '/api/admin/order-id',
  requireFirebase,
  requireAdmin,
  adminLimiter,
  withDb(async (req, res) => {
    try {
      const db = req.firestore;
      const highestUsedSequence = await readHighestUsedSequence(db);
      const validation = validateOrderIdConfig(req.body || {}, { highestUsedSequence });

      if (!validation.ok) {
        return res.status(400).json({
          error: 'Please fix the highlighted fields',
          errors: validation.errors,
        });
      }

      await writeOrderIdConfig(db, validation.value, { userEmail: req.caller?.email });

      /* Position the ONLINE counter exactly (never the offline one). Rewinds
         are allowed on purpose (reset flow); taken ids are stepped over at
         commit time, so a rewound counter can never re-issue an existing id. */
      await setOnlineCounterTo(db, validation.value.nextSequence);

      console.log(
        `[orderId] format updated to "${validation.value.format}" (prefix ${validation.value.prefix}, seq ${validation.value.sequenceLength}) by ${req.caller?.email || req.caller?.uid}`
      );

      const preview = buildOrderIdPreview(validation.value, validation.value.nextSequence);
      return res.json({
        success: true,
        config: validation.value,
        highestUsedSequence,
        preview,
      });
    } catch (error) {
      console.error('[orderId] failed to save config:', error);
      return res.status(500).json({ error: 'Could not save the Order ID settings' });
    }
  })
);

app.post(
  '/api/admin/order-id/reset',
  requireFirebase,
  requireAdmin,
  adminLimiter,
  withDb(async (req, res) => {
    try {
      const db = req.firestore;
      const nextSequence = Math.trunc(Number(req.body?.nextSequence ?? req.body?.nextNumber));
      if (!Number.isInteger(nextSequence) || nextSequence < 1 || nextSequence > 9999) {
        return res.status(400).json({ error: 'Next sequence must be a whole number between 1 and 9999.' });
      }
      // ONLINE counter only. Existing orders are NOT changed — only the number
      // used for the next NEW online order is reset. Taken ids are stepped
      // over at commit time, so resetting to 0001 never overwrites existing
      // orders. The OFFLINE counter (counters/offlineOrders) is never touched.
      await setOnlineCounterTo(db, nextSequence);
      const [{ config }] = await Promise.all([readOrderIdConfig(db)]);
      const updated = { ...config, nextSequence };
      await writeOrderIdConfig(db, updated, { userEmail: req.caller?.email });
      console.log(`[orderId] counter reset to ${nextSequence} by ${req.caller?.email || req.caller?.uid}`);
      const highestUsedSequence = await readHighestUsedSequence(db);
      return res.json({
        success: true,
        config: updated,
        highestUsedSequence,
        preview: buildOrderIdPreview(updated, nextSequence),
      });
    } catch (error) {
      console.error('[orderId] reset failed:', error);
      return res.status(500).json({ error: 'Could not reset the online counter' });
    }
  })
);

/* ---------------------------------------------------------------------------
   OFFLINE / STORE Order ID settings — Admin → Site Settings → ORDER ID SETTINGS.

   Fully independent from ONLINE (/api/admin/order-id):
   - config  : adminSettings/offlineOrderId { prefix, year, separator,
               padding, nextNumber }
   - counter : counters/offlineOrders
   - ONLINE counter (counters/orders) is never read or written here.
   - Existing orders are never rewritten; changes affect NEW offline orders only.
   - nextNumber may rewind (reset to 0001 is supported): the POS commit steps
     over taken trackingCodes instead of reusing them, so rewind is safe.
   --------------------------------------------------------------------------- */

function buildOfflineAdminPayload(config, highestUsedOfflineSequence) {
  const nextNumber = Math.max(1, Number(config.nextNumber) || highestUsedOfflineSequence + 1 || 1);
  return {
    config: { ...config, nextNumber },
    defaults: defaultOfflineConfig(),
    limits: {
      minPadding: 3,
      maxPadding: 12,
      maxOrderIdLength: 40,
      maxOrderNumber: 9999,
    },
    highestUsedSequence: highestUsedOfflineSequence,
    preview: buildOfflinePreview(config, nextNumber),
  };
}

app.get(
  '/api/admin/offline-order-id',
  requireFirebase,
  requireAdmin,
  adminLimiter,
  withDb(async (req, res) => {
    try {
      const db = req.firestore;
      const [{ config, isUsable }, highestUsedOfflineSequence] = await Promise.all([
        readOfflineOrderIdConfig(db),
        readHighestUsedOfflineSequence(db),
      ]);
      const payload = buildOfflineAdminPayload(config, highestUsedOfflineSequence);
      return res.json({ ...payload, storedConfigUsable: isUsable });
    } catch (error) {
      console.error('[offlineOrderId] failed to load config:', error);
      return res.status(500).json({ error: 'Could not load the offline Order ID settings' });
    }
  })
);

app.post(
  '/api/admin/offline-order-id/preview',
  requireFirebase,
  requireAdmin,
  adminLimiter,
  withDb(async (req, res) => {
    try {
      const db = req.firestore;
      const highestUsedOfflineSequence = await readHighestUsedOfflineSequence(db);
      const { config: saved } = await readOfflineOrderIdConfig(db);
      const { config } = normalizeOfflineConfig({
        prefix: req.body?.prefix ?? saved.prefix,
        year: req.body?.year ?? saved.year,
        separator: req.body?.separator ?? saved.separator,
        padding: req.body?.padding ?? req.body?.sequenceLength ?? saved.padding,
        nextNumber: req.body?.nextNumber ?? req.body?.nextSequence ?? saved.nextNumber,
      });
      const validation = validateOfflineConfig(req.body || {});
      const sequence = Math.max(1, Number(req.body?.nextNumber ?? req.body?.nextSequence) || highestUsedOfflineSequence + 1);
      return res.json({
        valid: validation.ok,
        errors: validation.errors,
        preview: buildOfflinePreview(config, sequence),
        highestUsedSequence: highestUsedOfflineSequence,
      });
    } catch (error) {
      console.error('[offlineOrderId] preview failed:', error);
      return res.status(500).json({ error: 'Could not preview that offline format' });
    }
  })
);

app.put(
  '/api/admin/offline-order-id',
  requireFirebase,
  requireAdmin,
  adminLimiter,
  withDb(async (req, res) => {
    try {
      const db = req.firestore;
      const highestUsedOfflineSequence = await readHighestUsedOfflineSequence(db);
      const validation = validateOfflineConfig(req.body || {});
      if (!validation.ok) {
        return res.status(400).json({ error: 'Please fix the highlighted fields', errors: validation.errors });
      }
      await writeOfflineOrderIdConfig(db, validation.value, { userEmail: req.caller?.email });
      // Position the OFFLINE counter only (never the online one). May rewind
      // on purpose (reset flow); collisions are stepped over at commit time.
      await setOfflineCounterTo(db, validation.value.nextNumber);
      console.log(
        `[offlineOrderId] updated to prefix=${validation.value.prefix} year=${validation.value.year} sep=${JSON.stringify(validation.value.separator)} padding=${validation.value.padding} next=${validation.value.nextNumber} by ${req.caller?.email || req.caller?.uid}`
      );
      const preview = buildOfflinePreview(validation.value, validation.value.nextNumber);
      return res.json({ success: true, config: validation.value, highestUsedSequence: highestUsedOfflineSequence, preview });
    } catch (error) {
      console.error('[offlineOrderId] failed to save config:', error);
      return res.status(500).json({ error: 'Could not save the offline Order ID settings' });
    }
  })
);

app.post(
  '/api/admin/offline-order-id/reset',
  requireFirebase,
  requireAdmin,
  adminLimiter,
  withDb(async (req, res) => {
    try {
      const db = req.firestore;
      const nextNumber = Math.trunc(Number(req.body?.nextNumber ?? req.body?.nextSequence));
      if (!Number.isInteger(nextNumber) || nextNumber < 1 || nextNumber > 9999) {
        return res.status(400).json({ error: 'Next number must be a whole number between 1 and 9999.' });
      }
      // OFFLINE counter only. Existing orders are NOT changed — only the number
      // used for the next NEW offline order is reset. Taken ids are stepped
      // over at commit time, so resetting to 0001 never overwrites 0001-0004.
      await setOfflineCounterTo(db, nextNumber);
      const [{ config }] = await Promise.all([readOfflineOrderIdConfig(db)]);
      const updated = { ...config, nextNumber };
      await writeOfflineOrderIdConfig(db, updated, { userEmail: req.caller?.email });
      console.log(`[offlineOrderId] counter reset to ${nextNumber} by ${req.caller?.email || req.caller?.uid}`);
      const highestUsedOfflineSequence = await readHighestUsedOfflineSequence(db);
      return res.json({
        success: true,
        config: updated,
        highestUsedSequence: highestUsedOfflineSequence,
        preview: buildOfflinePreview(updated, nextNumber),
      });
    } catch (error) {
      console.error('[offlineOrderId] reset failed:', error);
      return res.status(500).json({ error: 'Could not reset the offline counter' });
    }
  })
);

/* ---------------------------------------------------------------------------
   Reset All Orders — Site Settings → Danger Zone.

   Intentionally destructive and admin-only: deletes every order and tracking
   code, zeroes the product sales ledger (Best Sellers rank from salesCount)
   and re-arms the sequence counter so the next order mints the configured
   next sequence. Requires the typed phrase RESET ORDERS — a plain click can
   never trigger this. Bulk work runs here, server-side, in bounded batches
   (never a client-side loop), and nothing already issued is renamed: past
   shortCodes simply stop existing along with their orders.
   --------------------------------------------------------------------------- */
app.post(
  '/api/admin/orders/reset',
  requireFirebase,
  requireAdmin,
  adminLimiter,
  withDb(async (req, res) => {
    try {
      if (String(req.body?.confirm || '').trim().toUpperCase() !== 'RESET ORDERS') {
        return res.status(400).json({ error: 'Type RESET ORDERS to confirm.' });
      }
      const db = req.firestore;
      const BATCH = 400;

      const deleteCollection = async (name) => {
        let total = 0;
        for (;;) {
          const snap = await db.collection(name).limit(BATCH).get();
          if (snap.empty) break;
          const batch = db.batch();
          snap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
          total += snap.size;
          if (snap.size < BATCH) break;
        }
        return total;
      };

      const [ordersDeleted, trackingCodesDeleted] = await Promise.all([
        deleteCollection('orders'),
        deleteCollection('trackingCodes'),
      ]);

      /* Best Sellers rank from products.salesCount, incremented in the same
         transaction that creates each order — leaving them behind would keep
         showing best sellers for orders that no longer exist. */
      let productsReset = 0;
      for (;;) {
        const snap = await db.collection('products').where('salesCount', '>', 0).limit(BATCH).get();
        if (snap.empty) break;
        const batch = db.batch();
        snap.docs.forEach((d) => batch.update(d.ref, { salesCount: 0 }));
        await batch.commit();
        productsReset += snap.size;
        if (snap.size < BATCH) break;
      }

      /* Re-arm the counter so the next order mints the configured next
         sequence. version 2 must match ORDER_SEQUENCE_VERSION in
         lib/orders.js — anything else would trigger a legacy migration. */
      const { config } = await readOrderIdConfig(db);
      const nextSequence = Math.max(1, Math.trunc(Number(config.nextSequence) || 1));
      await db.collection('counters').doc('orders').set({
        value: nextSequence - 1,
        version: 2,
        resetAt: new Date().toISOString(),
        resetBy: (req.caller && (req.caller.email || req.caller.uid)) || null,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      console.log(
        `[orders/reset] by ${(req.caller && (req.caller.email || req.caller.uid)) || 'unknown'}: ` +
        `orders=${ordersDeleted} trackingCodes=${trackingCodesDeleted} ` +
        `products=${productsReset} counter->${nextSequence}`
      );

      return res.json({
        success: true,
        ordersDeleted,
        trackingCodesDeleted,
        feedbackDeleted: 0,
        productsReset,
        counterReset: nextSequence,
      });
    } catch (error) {
      console.error('[orders/reset] failed:', error);
      return res.status(500).json({ error: 'Reset failed — the data was left untouched where possible.' });
    }
  })
);

/* ---------------------------------------------------------------------------
   Email Automation — rules, templates, branding, manual sends, delivery log.

   Every route is admin-only. Sends go through the same SMTP transport as
   order mail; credentials never leave the server (emailStatus reports only
   whether mail is configured and why not). Toggles gate the automated hooks
   in lib/email.js; templates/branding override presentation only.
   --------------------------------------------------------------------------- */

const emailAutomationLimiter = adminLimiter;

app.get(
  '/api/admin/email-automation',
  requireFirebase,
  requireAdmin,
  emailAutomationLimiter,
  withDb(async (req, res) => {
    try {
      const db = req.firestore;
      const [rules, templates, branding, lastTriggered] = await Promise.all([
        readAutomationRules(db),
        readEmailTemplates(db),
        readEmailBranding(db),
        readEmailLastTriggered(db),
      ]);
      const emailConfig = readEmailConfig();
      return res.json({
        events: EMAIL_AUTOMATION_EVENTS,
        rules,
        templates,
        branding,
        lastTriggered,
        emailStatus: {
          enabled: emailConfig.enabled,
          ok: emailConfig.ok,
          problems: emailConfig.problems,
        },
      });
    } catch (error) {
      console.error('[automation] load failed:', error);
      return res.status(500).json({ error: 'Could not load Email Automation settings' });
    }
  })
);

app.put(
  '/api/admin/email-automation/rules',
  requireFirebase,
  requireAdmin,
  emailAutomationLimiter,
  withDb(async (req, res) => {
    try {
      const validation = validateRulesInput(req.body || {});
      if (!validation.ok) {
        return res.status(400).json({ error: 'Please fix the highlighted toggles', errors: validation.errors });
      }
      const saved = await writeAutomationRules(req.firestore, validation.value, { userEmail: req.caller?.email });
      console.log(`[automation] rules updated by ${req.caller?.email || req.caller?.uid}`);
      return res.json({ success: true, rules: saved });
    } catch (error) {
      console.error('[automation] rules save failed:', error);
      return res.status(500).json({ error: 'Could not save automation rules' });
    }
  })
);

app.put(
  '/api/admin/email-automation/templates',
  requireFirebase,
  requireAdmin,
  emailAutomationLimiter,
  withDb(async (req, res) => {
    try {
      const validation = validateTemplatesInput(req.body || {});
      if (!validation.ok) {
        return res.status(400).json({ error: 'Please fix the highlighted fields', errors: validation.errors });
      }
      const saved = await writeEmailTemplates(req.firestore, validation.value, { userEmail: req.caller?.email });
      console.log(`[automation] templates updated by ${req.caller?.email || req.caller?.uid}`);
      return res.json({ success: true, templates: saved });
    } catch (error) {
      console.error('[automation] templates save failed:', error);
      return res.status(500).json({ error: 'Could not save email templates' });
    }
  })
);

app.put(
  '/api/admin/email-automation/branding',
  requireFirebase,
  requireAdmin,
  emailAutomationLimiter,
  withDb(async (req, res) => {
    try {
      const validation = validateBrandingInput(req.body || {});
      if (!validation.ok) {
        return res.status(400).json({ error: 'Please fix the highlighted fields', errors: validation.errors });
      }
      const saved = await writeEmailBranding(req.firestore, validation.value, { userEmail: req.caller?.email });
      console.log(`[automation] branding updated by ${req.caller?.email || req.caller?.uid}`);
      return res.json({ success: true, branding: saved });
    } catch (error) {
      console.error('[automation] branding save failed:', error);
      return res.status(500).json({ error: 'Could not save email branding' });
    }
  })
);

app.get(
  '/api/admin/email-automation/logs',
  requireFirebase,
  requireAdmin,
  emailAutomationLimiter,
  withDb(async (req, res) => {
    try {
      const rows = await readEmailLogs(req.firestore, {
        event: String(req.query.event || ''),
        status: String(req.query.status || ''),
        search: String(req.query.q || ''),
        limit: req.query.limit,
      });
      return res.json({ logs: rows });
    } catch (error) {
      console.error('[automation] logs read failed:', error);
      return res.status(500).json({ error: 'Could not load the delivery log' });
    }
  })
);

app.post(
  '/api/admin/email-automation/test',
  requireFirebase,
  requireAdmin,
  emailAutomationLimiter,
  withDb(async (req, res) => {
    try {
      const to = String(req.body?.to || '').trim();
      const emailConfig = readEmailConfig();
      if (!emailConfig.enabled) return res.status(400).json({ error: 'Email is disabled on the server (EMAIL_ENABLED=false).' });
      if (!emailConfig.ok) {
        return res.status(400).json({ error: `Email is not configured: ${emailConfig.problems.join(', ')}` });
      }
      // No order is read or touched — this only proves the real transport.
      const result = await sendManualEmail(req.firestore, {
        to,
        subject: 'Test email from your store',
        message: 'Hello from {STORE_NAME},\n\nThis is a test email. If you received it, the store email system is working.\n\n{STORE_URL}',
        orderId: null,
      });
      if (!result.ok) return res.status(400).json({ error: result.error || 'Test email failed.' });
      await require('./lib/emailAutomation').logDelivery(req.firestore, {
        event: 'test', orderId: '', recipient: to,
        subject: result.subject || '', status: 'sent', error: '', messageId: result.messageId || '',
      }).catch(() => {});
      return res.json({ success: true, messageId: result.messageId || null });
    } catch (error) {
      console.error('[automation] test send failed:', error);
      return res.status(500).json({ error: 'Test email failed.' });
    }
  })
);

app.post(
  '/api/admin/email-automation/compose',
  requireFirebase,
  requireAdmin,
  emailAutomationLimiter,
  withDb(async (req, res) => {
    try {
      const result = await sendManualEmail(req.firestore, {
        to: req.body?.to,
        subject: req.body?.subject,
        message: req.body?.message,
        orderId: req.body?.orderId || null,
      });
      if (!result.ok) return res.status(400).json({ error: result.error || 'Send failed.' });
      await require('./lib/emailAutomation').logDelivery(req.firestore, {
        event: 'compose', orderId: String(req.body?.orderId || ''), recipient: String(req.body?.to || ''),
        subject: result.subject || '', status: 'sent', error: '', messageId: result.messageId || '',
      }).catch(() => {});
      return res.json({ success: true, messageId: result.messageId || null });
    } catch (error) {
      console.error('[automation] compose send failed:', error);
      return res.status(500).json({ error: 'Send failed.' });
    }
  })
);

app.post(
  '/api/admin/email-automation/notify-details',
  requireFirebase,
  requireAdmin,
  emailAutomationLimiter,
  withDb(async (req, res) => {
    try {
      const orderId = String(req.body?.orderId || '').trim();
      if (!orderId) return res.status(400).json({ error: 'Missing order id.' });
      const result = await sendDetailsUpdatedEmail(req.firestore, orderId);
      if (!result.ok) {
        if (result.skipped === 'already-sent') return res.json({ success: true, skipped: true });
        return res.status(400).json({ error: result.error || 'Notification not sent.' });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error('[automation] notify-details failed:', error);
      return res.status(500).json({ error: 'Notification failed.' });
    }
  })
);

/* ---------------------------------------------------------------------------
   Site analytics (first-party)
   Ingestion is public — a visitor is not signed in — but it is rate limited
   and stores no IP address. Reading is admin-only: traffic, referrers and
   revenue are business data, so these two routes carry the same guard chain
   as every other /api/admin surface.
   --------------------------------------------------------------------------- */

const site = require('./lib/siteAnalytics');
const { commerceSnapshot } = require('./lib/commerceAnalytics');

// A generous ceiling: every SPA navigation posts one pageview, so a customer
// browsing quickly is normal traffic, not abuse. Still bounded per IP.
const siteLimiter = createRateLimiter({ windowMs: 60_000, max: 240, name: 'site' });

const safeSite = async (handler, res) => {
  try {
    const result = await handler();
    if (result && result.error) return res.status(400).json(result);
    return res.json(result);
  } catch (error) {
    console.error('[site] handler failed:', error.message);
    return res.status(500).json({ error: 'Analytics service error' });
  }
};

app.post('/api/site/pageview', requireFirebase, siteLimiter, withDb((req, res) =>
  /* The request is forwarded whole so geography can be resolved from the
     caller's address on a session's first hit. That address is used and
     discarded inside lib/geo — only the country, state and city it resolves to
     are ever stored. Edge geo headers, where a real edge sets them, win. */
  safeSite(() => site.recordPageview(req.firestore, req.body, req), res)));

app.post('/api/site/funnel', requireFirebase, siteLimiter, withDb((req, res) =>
  safeSite(() => site.recordFunnelStage(req.firestore, req.body), res)));

app.get('/api/admin/analytics/site', requireFirebase, requireAdmin, adminLimiter, withDb((req, res) =>
  safeSite(
    () =>
      site.siteSnapshot(req.firestore, {
        days: req.query.days,
        from: req.query.from,
        to: req.query.to,
      }),
    res,
  )));

app.get('/api/admin/analytics/live', requireFirebase, requireAdmin, adminLimiter, withDb((req, res) =>
  safeSite(() => site.liveVisitors(req.firestore), res)));

/* Aggregated commerce + traffic snapshot for the Admin Analytics dashboard.
   ONE request returns the traffic snapshot (siteSnapshot) merged with the
   commerce block (orders/products/Auth), so the page loads with a single
   fetch plus the lightweight live poll. Same guard chain as the other
   /api/admin/analytics routes. The legacy /site and /live routes stay. */
app.get('/api/admin/analytics/commerce', requireFirebase, requireAdmin, adminLimiter, withDb(async (req, res) => {
  const started = Date.now();
  /* Hard ceiling so the dashboard can never wait forever: if the merged
     snapshot is not ready within 9s the page gets a controlled 503 (with a
     Retry button) instead of a permanently pending request. The frontend's
     own timeout sits above this (12s). */
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('Analytics snapshot timed out'), { status: 503 })), 9_000);
  });
  try {
    const query = { days: req.query.days, from: req.query.from, to: req.query.to };
    const [traffic, commerce] = await Promise.race([
      Promise.all([
        site.siteSnapshot(req.firestore, query),
        commerceSnapshot(req.firestore, query),
      ]).finally(() => clearTimeout(timer)),
      timeout,
    ]);
    if (traffic && traffic.error) return res.status(400).json(traffic);
    console.log(`[commerce] snapshot ${Date.now() - started}ms`);
    return res.json({ ...traffic, commerce });
  } catch (error) {
    clearTimeout(timer);
    console.error(`[commerce] handler failed after ${Date.now() - started}ms:`, error.message);
    const status = Number(error && error.status) || 500;
    const message = status === 503
      ? 'Analytics took too long to respond. Please try again.'
      : 'Analytics service error';
    return res.status(status).json({ error: message });
  }
}));

/* ---------------------------------------------------------------------------
   Deploy endpoint (Hostinger only)
   The auto-deploy pipeline uploads a tarball over HTTPS instead of SSH, so
   GitHub runner IPs never need to reach port 22. The token lives only in the
   server file system; this route does not exist when it is absent.
   --------------------------------------------------------------------------- */

const DEPLOY_TOKEN =
  process.env.DEPLOY_TOKEN ||
  (() => {
    const tokenPath = '/root/crackers-deploy/.deploy-token';
    if (!fs.existsSync(tokenPath)) return '';
    return fs.readFileSync(tokenPath, 'utf8').trim();
  })();

const deployLimiter = createRateLimiter({ windowMs: 60_000, max: 10, name: 'deploy' });

app.post(
  '/api/deploy',
  deployLimiter,
  express.raw({ type: 'application/gzip', limit: '64mb' }),
  async (req, res) => {
    if (!DEPLOY_TOKEN) return res.status(404).json({ error: 'Not found' });

    const provided = String(req.get('x-deploy-token') || '');
    const a = Buffer.from(provided);
    const b = Buffer.from(DEPLOY_TOKEN);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Invalid deploy token' });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'Missing tarball body' });
    }

    try {
      fs.writeFileSync('/root/deploy-latest.tar.gz', req.body);
      const { stdout, stderr } = await execFile('bash', ['/root/crackers-deploy/deploy.sh'], {
        timeout: 300_000,
        maxBuffer: 8 * 1024 * 1024,
      });
      res.json({ ok: true, output: `${stdout}\n${stderr}`.trim() });
    } catch (error) {
      console.error('[deploy] failed:', error.message);
      res.status(500).json({ ok: false, error: error.message });
    }
  }
);

/* ---------------------------------------------------------------------------
   Order notifications
   Content is always read from Firestore, never from the request body. The old
   endpoints accepted a whole order object and a free-text recipient, which made
   them an open relay for mail and SMS sent from the shop's own identity.
   --------------------------------------------------------------------------- */

/* Email readiness + transporter for the two legacy callers (staff password
   reset, manual invoice resend). Both delegate to lib/email.js so every mail
   path uses the same Gmail SMTP configuration as order confirmations. */
function checkEmailConfig() {
  return readEmailConfig().ok;
}

function getEmailTransporter() {
  return createSmtpTransporter();
}

async function loadOrderRef(orderId) {
  if (typeof orderId !== 'string' || !orderId || orderId.length > 128) return null;
  const ref = getFirestore().collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { ref, order: { id: snap.id, ...snap.data() } };
}

/**
 * Decide whether this caller may make the shop send a message about this order.
 *
 * "The order exists and is recent" is NOT proof of anything: order creation used
 * to be open, so an attacker could plant a document and then have it mailed to a
 * victim from the shop's own authenticated SMTP session. Authorisation is now
 * either a single-use token handed to whoever actually placed the order, or a
 * verified staff identity.
 *
 * Returns 'staff' | 'token' | false: the caller kind matters downstream, because
 * a token-driven send is an automatic notification (deduped exactly once) while
 * a staff send is an explicit manual resend.
 */
async function authoriseNotification(req, entry, channel) {
  const caller = await authenticate(req);
  if (caller && STAFF_ROLES.includes(caller.role)) return 'staff';

  const ok = await consumeNotifyToken(
    getFirestore(),
    entry.ref,
    entry.order,
    req.body?.notifyToken,
    channel
  );
  return ok ? 'token' : false;
}

/* Manual resend (POST /api/orders/email) renders the SAME confirmation
// template as the automatic mail — itemised section included. The full
// itemised invoice is generated client-side from the tracking page behind
// DOWNLOAD INVOICE. */
function buildOrderEmailHtml(order) {
  /* The single customer-facing Order ID (shortCode, e.g. CHYD26-3001). Never
     the Firestore document id: `displayOrderCode` refuses to fall back to it
     and logs a diagnostic naming the document instead. */
  const code = displayOrderCode(order) || 'N/A';
  const items = Array.isArray(order.items) ? order.items : [];
  const quantity = items.reduce((n, item) => n + (Number(item.quantity) || 0), 0);
  const trackBase = (process.env.TRACK_BASE_URL || process.env.PUBLIC_SITE_URL || 'https://crackershyderabad.com').replace(/\/+$/, '');
  return orderConfirmationHtml({
    orderCode: code,
    status: order.status || 'Pending',
    quantity,
    total: order.total ?? 0,
    trackUrl: `${trackBase}/track/${encodeURIComponent(code)}`,
    invoiceUrl: `${trackBase}/track-order?id=${encodeURIComponent(code)}`,
    customerName: order.customer?.name || '',
    note: orderPaymentNote(order),
    items,
    subtotal: order.subtotal,
    discount: order.discount,
    couponCode: order.coupon?.code,
  });
}

function buildOrderEmailText(order) {
  /* The single customer-facing Order ID (shortCode, e.g. CHYD26-3001). Never
     the Firestore document id: `displayOrderCode` refuses to fall back to it
     and logs a diagnostic naming the document instead. */
  const code = displayOrderCode(order) || 'N/A';
  const items = Array.isArray(order.items) ? order.items : [];
  const quantity = items.reduce((n, item) => n + (Number(item.quantity) || 0), 0);
  const trackBase = (process.env.TRACK_BASE_URL || process.env.PUBLIC_SITE_URL || 'https://crackershyderabad.com').replace(/\/+$/, '');
  return orderConfirmationText({
    orderCode: code,
    status: order.status || 'Pending',
    quantity,
    total: order.total ?? 0,
    trackUrl: `${trackBase}/track/${encodeURIComponent(code)}`,
    invoiceUrl: `${trackBase}/track-order?id=${encodeURIComponent(code)}`,
    customerName: order.customer?.name || '',
    note: orderPaymentNote(order),
    items,
    subtotal: order.subtotal,
    discount: order.discount,
    couponCode: order.coupon?.code,
  });
}

/**
 * Order placement. Open to guests by design — this is checkout — but every
 * price, the total, the status and the order code are decided server-side from
 * the products collection, and `orders.create` is closed in the rules so this
 * is the only way an order can come into existence.
 *
 * A signed-in caller is bound to their order via the optional bearer token.
 *
 * Rate limit: 12 a minute per caller. Checkout is not a retried operation by
 * design — the storefront disables its submit button while a request is in
 * flight — but a customer double-tapping or a flaky mobile connection can
 * produce a second attempt, and this is a ceiling that keeps one impatient
 * customer from spending the shop's whole order budget.
 */
/**
 * The ceiling, overridable only when explicitly opted into.
 *
 * ORDER_RATE_LIMIT_MAX exists so the local emulator suite (tests/order-id.e2e.js),
 * which places dozens of orders in a minute, is not throttled by a control that
 * exists to slow down a real customer. It is clamped so no value can disable the
 * limiter outright, and it is ignored in production — a shop must never be able
 * to relax its own abuse ceiling by editing the environment. Leave it unset in
 * production and the limit is 12 a minute.
 */
const parseOrderRateLimit = (raw) => {
  const fallback = 12;
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 1000);
};

const ORDER_RATE_LIMIT_MAX =
  process.env.NODE_ENV === 'production'
    ? 12
    : parseOrderRateLimit(process.env.ORDER_RATE_LIMIT_MAX);

const orderLimiter = createRateLimiter({ windowMs: 60_000, max: ORDER_RATE_LIMIT_MAX, name: 'orders' });

app.post('/api/orders', orderLimiter, requireFirebase, async (req, res) => {
  req.caller = await authenticate(req); // null for guests, which is allowed
  return createOrder(req, res);
});

/**
 * Reverse geocoding for the checkout map pin.
 *
 * Open to guests for the same reason /api/orders is — the people using it have
 * not signed in. The limit is set by what one honest customer does: nudging a
 * pin around a courtyard is a handful of lookups, and the module caches by an
 * ~11 m grid on top of that, so 30 a minute is generous for a checkout and
 * still far below the courtesy rate Nominatim asks visitors to respect.
 *
 * No requireFirebase: this touches no Firestore, and a database outage should
 * not take the address lookup with it.
 */
const geoLimiter = createRateLimiter({ windowMs: 60_000, max: 30, name: 'geocode' });

app.get('/api/geocode/reverse', geoLimiter, handleReverseGeocode);
/* Place search runs only when the customer submits the box — never per
   keystroke — which keeps this inside Nominatim's one-request-a-second
   courtesy limit without needing a separate budget. */
app.get('/api/geocode/search', geoLimiter, handleSearchPlaces);

// Which provider is live, for the admin settings screen. Never the key itself.
app.get('/api/geocode/config', geoLimiter, requireAdmin, handleGeocodeConfig);

// Counter billing (staff only). Same pricing discipline as /api/orders, but
// prices from the staff-only productPricing collection and records the payment
// mode, discount and a Completed status on a walk-in sale. `orders.create` is
// closed in the rules, so this endpoint is the only way a counter bill exists.
app.post(
  '/api/orders/pos',
  orderLimiter,
  requireFirebase,
  requireRole(['admin', 'sales']),
  createPosOrder
);

/* ---------------------------------------------------------------------------
   Coupons — validation is public (guest checkout applies codes) but the
   discount is always computed here from the server-priced cart. The browser
   sends items + code; this endpoint answers what the order would pay.
   Admin CRUD below is admin-only; the admin UI never writes coupons direct.
   --------------------------------------------------------------------------- */
const couponLimiter = createRateLimiter({ windowMs: 60_000, max: 30, name: 'coupons' });

/* Public storefront listing: active, in-window, under-limit coupons with ONLY
   the fields a customer needs to decide (code, discount, minimum, windows,
   restrictions). Usage counts, revenue and internal notes never leave the
   server. Eligibility against the live cart is indicative only — Apply always
   revalidates through /api/coupons/validate and order creation re-checks. */
app.get('/api/coupons/active', couponLimiter, requireFirebase, withDb(async (req, res) => {
  try {
    const now = Date.now();
    const snap = await req.firestore.collection('coupons').where('status', '==', 'active').get();
    const offers = [];
    snap.docs.forEach((d) => {
      const c = d.data() || {};
      if (c.usageLimit != null && Number(c.usageCount || 0) >= Number(c.usageLimit)) return;
      if (c.startsAt) {
        const start = new Date(c.startsAt).getTime();
        if (Number.isFinite(start) && now < start) return;
      }
      if (c.expiresAt) {
        const end = new Date(c.expiresAt).getTime();
        if (Number.isFinite(end) && now > end) return;
      }
      offers.push({
        code: c.normalizedCode || c.code,
        description: String(c.description || ''),
        discountType: c.discountType,
        discountValue: Number(c.discountValue) || 0,
        minimumOrderValue: Number(c.minimumOrderValue) || 0,
        maximumDiscount: c.maximumDiscount ?? null,
        startsAt: c.startsAt || null,
        expiresAt: c.expiresAt || null,
        perCustomerLimit: c.perCustomerLimit ?? null,
        applicableProductIds: Array.isArray(c.applicableProductIds) ? c.applicableProductIds : [],
        applicableCategoryIds: Array.isArray(c.applicableCategoryIds) ? c.applicableCategoryIds : [],
      });
    });
    offers.sort((a, b) => String(a.code).localeCompare(String(b.code)));
    return res.json({ offers });
  } catch (error) {
    console.error('[coupons] active list failed:', error);
    return res.status(500).json({ error: 'Could not load offers.' });
  }
}));

const couponCustomerKey = (req, body) =>
  req.caller?.uid || String(body?.email || body?.customer?.email || '').trim().toLowerCase()
  || String(body?.phone || body?.customer?.phone || '').replace(/\D/g, '').slice(-10) || null;

app.post('/api/coupons/validate', couponLimiter, requireFirebase, withDb(async (req, res) => {
  try {
    const db = req.firestore;
    const body = req.body || {};
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ valid: false, message: 'Your cart is empty.' });
    }
    const priced = await priceCart(db, body.items);
    if (!priced.ok) return res.status(400).json({ valid: false, message: priced.error });
    const check = await validateCouponForCart(db, {
      code: body.code,
      pricedItems: priced.value.items,
      customerKey: couponCustomerKey(req, body),
    });
    if (!check.ok) return res.status(200).json({ valid: false, message: check.error });
    const subtotal = Math.round(priced.value.total * 100) / 100;
    const total = Math.max(0, Math.round((subtotal - check.discountAmount) * 100) / 100);
    return res.json({
      valid: true,
      couponId: check.coupon.id,
      code: check.coupon.normalizedCode,
      discountType: check.coupon.discountType,
      discountValue: check.coupon.discountValue,
      discountAmount: check.discountAmount,
      minimumOrderValue: Number(check.coupon.minimumOrderValue) || 0,
      maximumDiscount: check.coupon.maximumDiscount ?? null,
      subtotal,
      total,
    });
  } catch (error) {
    console.error('[coupons] validate failed:', error);
    return res.status(500).json({ valid: false, message: 'Could not validate the coupon. Please try again.' });
  }
}));

/* ---------------- Admin coupon management (admin-only) ---------------- */

app.get('/api/admin/coupons', requireFirebase, requireAdmin, adminLimiter, withDb(async (req, res) => {
  try {
    const snap = await req.firestore.collection('coupons').get();
    const coupons = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
    return res.json({ coupons });
  } catch (error) {
    console.error('[coupons] list failed:', error);
    return res.status(500).json({ error: 'Could not load coupons' });
  }
}));

app.get('/api/admin/coupons/stats', requireFirebase, requireAdmin, adminLimiter, withDb(async (req, res) => {
  try {
    // Aggregated live on the coupon documents (maintained inside the order
    // transaction) — no order-table scans, no N+1.
    const snap = await req.firestore.collection('coupons').get();
    let activeOffers = 0;
    let couponUses = 0;
    let discountGiven = 0;
    snap.docs.forEach((d) => {
      const c = d.data() || {};
      if (c.status === 'active') activeOffers += 1;
      couponUses += Number(c.usageCount) || 0;
      discountGiven += Number(c.totalDiscountGiven) || 0;
    });
    return res.json({
      activeOffers,
      couponUses,
      discountGiven: Math.round(discountGiven * 100) / 100,
    });
  } catch (error) {
    console.error('[coupons] stats failed:', error);
    return res.status(500).json({ error: 'Could not load coupon statistics' });
  }
}));

app.post('/api/admin/coupons', requireFirebase, requireAdmin, adminLimiter, withDb(async (req, res) => {
  try {
    const validation = validateCouponInput(req.body || {});
    if (!validation.ok) {
      return res.status(400).json({ error: 'Please fix the highlighted fields', errors: validation.errors });
    }
    const db = req.firestore;
    const existing = await db.collection('coupons').where('normalizedCode', '==', validation.value.normalizedCode).limit(1).get();
    if (!existing.empty) {
      return res.status(409).json({ error: `A coupon with code "${validation.value.code}" already exists.`, errors: { code: 'Duplicate coupon code.' } });
    }
    const now = new Date().toISOString();
    const ref = await db.collection('coupons').add({
      ...validation.value,
      usageCount: 0,
      totalDiscountGiven: 0,
      totalRevenue: 0,
      createdAt: now,
      updatedAt: now,
      updatedBy: req.caller?.email || null,
    });
    const snap = await ref.get();
    console.log(`[coupons] created ${validation.value.code} by ${req.caller?.email || req.caller?.uid}`);
    return res.status(201).json({ success: true, coupon: { id: ref.id, ...snap.data() } });
  } catch (error) {
    console.error('[coupons] create failed:', error);
    return res.status(500).json({ error: 'Could not create the coupon' });
  }
}));

app.put('/api/admin/coupons/:id', requireFirebase, requireAdmin, adminLimiter, withDb(async (req, res) => {
  try {
    const validation = validateCouponInput(req.body || {});
    if (!validation.ok) {
      return res.status(400).json({ error: 'Please fix the highlighted fields', errors: validation.errors });
    }
    const db = req.firestore;
    const ref = db.collection('coupons').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Coupon not found.' });
    const current = snap.data() || {};
    // The code is the coupon's identity across issued orders — once it has
    // been used, renaming it would orphan history. Block the rename, allow
    // everything else.
    if (Number(current.usageCount || 0) > 0 && validation.value.normalizedCode !== current.normalizedCode) {
      return res.status(409).json({ error: 'This coupon has already been used — its code cannot be changed.', errors: { code: 'Code is locked after first use.' } });
    }
    if (validation.value.normalizedCode !== current.normalizedCode) {
      const clash = await db.collection('coupons').where('normalizedCode', '==', validation.value.normalizedCode).limit(1).get();
      if (!clash.empty && clash.docs[0].id !== ref.id) {
        return res.status(409).json({ error: `A coupon with code "${validation.value.code}" already exists.`, errors: { code: 'Duplicate coupon code.' } });
      }
    }
    await ref.update({
      ...validation.value,
      updatedAt: new Date().toISOString(),
      updatedBy: req.caller?.email || null,
    });
    const fresh = await ref.get();
    console.log(`[coupons] updated ${validation.value.code} by ${req.caller?.email || req.caller?.uid}`);
    return res.json({ success: true, coupon: { id: ref.id, ...fresh.data() } });
  } catch (error) {
    console.error('[coupons] update failed:', error);
    return res.status(500).json({ error: 'Could not update the coupon' });
  }
}));

app.delete('/api/admin/coupons/:id', requireFirebase, requireAdmin, adminLimiter, withDb(async (req, res) => {
  try {
    const db = req.firestore;
    const ref = db.collection('coupons').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Coupon not found.' });
    // Used coupons keep their document so historical orders (which snapshot
    // the coupon at purchase time) stay explainable — deactivate instead.
    if (Number((snap.data() || {}).usageCount || 0) > 0) {
      return res.status(409).json({ error: 'This coupon has been used in orders and cannot be deleted. Deactivate it instead.' });
    }
    await ref.delete();
    console.log(`[coupons] deleted ${req.params.id} by ${req.caller?.email || req.caller?.uid}`);
    return res.json({ success: true });
  } catch (error) {
    console.error('[coupons] delete failed:', error);
    return res.status(500).json({ error: 'Could not delete the coupon' });
  }
}));

app.post('/api/admin/coupons/:id/duplicate', requireFirebase, requireAdmin, adminLimiter, withDb(async (req, res) => {
  try {
    const db = req.firestore;
    const ref = db.collection('coupons').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Coupon not found.' });
    const src = snap.data() || {};
    const base = `${src.normalizedCode || src.code || 'COUPON'}-COPY`;
    let code = base;
    for (let n = 2; n <= 99; n += 1) {
      const clash = await db.collection('coupons').where('normalizedCode', '==', code).limit(1).get();
      if (clash.empty) break;
      code = `${base}-${n}`;
    }
    const now = new Date().toISOString();
    const created = await db.collection('coupons').add({
      code,
      normalizedCode: code,
      description: src.description || '',
      discountType: src.discountType,
      discountValue: src.discountValue,
      minimumOrderValue: src.minimumOrderValue || 0,
      maximumDiscount: src.maximumDiscount ?? null,
      usageLimit: src.usageLimit ?? null,
      perCustomerLimit: src.perCustomerLimit ?? null,
      startsAt: src.startsAt || null,
      expiresAt: src.expiresAt || null,
      status: 'inactive',
      applicableProductIds: src.applicableProductIds || [],
      applicableCategoryIds: src.applicableCategoryIds || [],
      usageCount: 0,
      totalDiscountGiven: 0,
      totalRevenue: 0,
      createdAt: now,
      updatedAt: now,
      updatedBy: req.caller?.email || null,
    });
    const fresh = await created.get();
    return res.status(201).json({ success: true, coupon: { id: created.id, ...fresh.data() } });
  } catch (error) {
    console.error('[coupons] duplicate failed:', error);
    return res.status(500).json({ error: 'Could not duplicate the coupon' });
  }
}));

/* ---------------------------------------------------------------------------
   Order status changes.

   Status is written HERE, not by the browser. Three writers used to bypass
   the server completely — Orders.jsx and OrderDetail.jsx (staff) and
   MyOrders.jsx (customer self-cancel) all `updateDoc`'d the document — so no
   server code ever saw a status event: sendStatusUpdateEmail had no caller
   and could neither send nor dedupe. Owning the write gives us the
   transition guard in one place: a save that selects the status an order
   already has produces no event, so it sends nothing downstream.

   Authorization mirrors firestore.rules on the orders collection: any staff
   role may move the status along; a signed-in customer may only cancel their
   OWN order, only from a state the rules still consider cancellable.
   --------------------------------------------------------------------------- */

const ORDER_STATUSES = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Completed'];
/* Exactly the customer-cancellable set from firestore.rules. */
const CUSTOMER_CANCELLABLE_FROM = ['Pending', 'Confirmed', 'Processing'];

app.post('/api/orders/status', adminLimiter, requireFirebase, async (req, res) => {
  try {
    const orderId = String(req.body?.orderId || '').trim();
    const status = String(req.body?.status || '').trim();
    if (!orderId || orderId.length > 128) {
      return res.status(400).json({ error: 'Missing order id' });
    }
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid order status' });
    }

    const caller = await authenticate(req);
    if (!caller) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const isStaffCaller = STAFF_ROLES.includes(caller.role);

    const db = getFirestore();
    const orderRef = db.collection('orders').doc(orderId);

    let order = null;
    let changed = false;
    try {
      await db.runTransaction(async (tx) => {
        // The callback can re-run on contention; never inherit side effects.
        order = null;
        changed = false;
        const snap = await tx.get(orderRef);
        if (!snap.exists) return;
        const current = snap.data() || {};
        order = { ...current, id: snap.id };
        const previousStatus = String(current.status || 'Pending');

        // Authorise first: a non-owner must not be able to probe an order's
        // current status by watching whether a same-status save "succeeds".
        if (!isStaffCaller) {
          const ownsOrder =
            (current.userId && current.userId === caller.uid) ||
            (current.customer?.email &&
              String(current.customer.email).toLowerCase() === String(caller.email || '').toLowerCase());
          if (!ownsOrder || status !== 'Cancelled' || !CUSTOMER_CANCELLABLE_FROM.includes(previousStatus)) {
            const denied = new Error('Not permitted for this order');
            denied.status = 403;
            throw denied;
          }
        }

        // Same-status save: not a transition, so not an event.
        if (previousStatus === status) return;

        const patch = {
          status,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: caller.uid,
        };
        if (status === 'Cancelled') {
          patch.cancelledAt = FieldValue.serverTimestamp();
          patch.cancelledBy = isStaffCaller ? 'staff' : 'customer';
        }
        tx.update(orderRef, patch);
        changed = true;
      });
    } catch (txError) {
      if (txError && txError.status === 403) {
        return res.status(403).json({ error: txError.message });
      }
      console.error('[orders/status] transaction failed:', txError.message);
      return res.status(500).json({ error: 'Could not update the order status' });
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (!changed) {
      return res.json({ success: true, changed: false });
    }

    /* ONE customer email for this status event, strictly AFTER the Firestore
       write committed, deduped per event key (notify.statusEmails.<key>) so a
       retry or a repeat of the same transition mails nothing. Best-effort: a
       mail failure is logged but never fails the status update. */
    let emailed = false;
    try {
      const result = await sendStatusUpdateEmail(db, orderRef, { ...order, status }, status);
      emailed = Boolean(result && result.ok);
    } catch (emailError) {
      console.warn(`[orders/status] email hook threw for ${order.shortCode || orderId}:`, emailError.message);
    }

    return res.json({ success: true, changed: true, emailed });
  } catch (error) {
    console.error('Error updating order status:', error);
    return res.status(500).json({ error: 'Could not update the order status' });
  }
});

/**
 * Admin order item editing: POST /api/admin/orders/:orderId/items
 * Body: { items: [{ id, quantity }], adminNote? }
 *
 * Admin-only. The single authoritative write path for changing an order's
 * items after placement: the server reprices from the products records,
 * recalculates subtotal/discount/total from the current lines, persists them
 * together, then sends the updated-order customer email. The admin UI renders
 * the returned order — never a locally computed total. Order ids are untouched.
 */
app.post('/api/admin/orders/:orderId/items', adminLimiter, requireFirebase, requireAdmin, async (req, res) => {
  return updateOrderItems(req, res);
});

/**
 * Admin order discount management. The frontend sends ONLY a coupon code (or
 * nothing, for preview/removal) — every amount is calculated server-side
 * from the current persisted lines. Order ids are untouched.
 */
app.get('/api/admin/orders/:orderId/eligible-coupons', adminLimiter, requireFirebase, requireAdmin, async (req, res) => {
  return listEligibleCoupons(req, res);
});

app.post('/api/admin/orders/:orderId/coupon', adminLimiter, requireFirebase, requireAdmin, async (req, res) => {
  return applyOrderCoupon(req, res);
});

app.delete('/api/admin/orders/:orderId/coupon', adminLimiter, requireFirebase, requireAdmin, async (req, res) => {
  return removeOrderCoupon(req, res);
});

app.post('/api/admin/orders/:orderId/discount-percent', adminLimiter, requireFirebase, requireAdmin, async (req, res) => {
  return applyAdminPercentDiscount(req, res);
});
/**
 * Public order tracking.
 *
 * This endpoint exists because tracking codes are sequential (CH01, CH02)
 * and therefore guessable. `trackingCodes.get` is staff-only in the rules, so
 * this is the only public route from a code to an order, and it requires the
 * last four digits of the order's phone number. Staff, holding a verified
 * token, look up by code alone.
 *
 * The limit is per IP and sits on top of the per-code lockout in lib/orders.js.
 * 20 a minute is far more than a customer checking a delivery needs, and the
 * per-code counter is what actually bounds guessing.
 */
const trackLimiter = createRateLimiter({ windowMs: 60_000, max: 20, name: 'track' });

app.post('/api/orders/track', trackLimiter, requireFirebase, async (req, res) => {
  req.caller = await authenticate(req); // null for guests, who must supply the digits
  return trackOrder(req, res);
});

/**
 * Public tracking timeline source: GET /api/orders/track/:orderCode.
 *
 * Unauthenticated by design — this is what https://crackershyderabad.com/track/CH01
 * (and a future email link) reads. It answers with the minimal customer-safe
 * payload only (code, status, quantity, total, timestamps): no customer PII,
 * no item details, no tokens. Rate-limited like the phone-gated POST above.
 */
app.get('/api/orders/track/:orderCode', trackLimiter, requireFirebase, withDb(handlePublicTrack));

app.post('/api/orders/email', notifyLimiter, requireFirebase, async (req, res) => {
  try {
    const entry = await loadOrderRef(req.body?.orderId);
    if (!entry) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const grant = await authoriseNotification(req, entry, 'email');
    if (!grant) {
      return res.status(403).json({ error: 'Not permitted for this order' });
    }

    const { order } = entry;

    // The recipient comes from the stored order — and must still be exactly one
    // well-formed address. Nodemailer parses `to` as an address *list*, so an
    // unvalidated value containing commas would fan a single send out to many
    // recipients.
    const customerEmail = order.customer?.email || order.userEmail;
    if (!isValidEmail(customerEmail)) {
      return res.status(400).json({ error: 'This order has no usable email address' });
    }

    if (!checkEmailConfig()) {
      return res.status(503).json({
        error: 'Email service not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD (or EMAIL_HOST, EMAIL_USER, EMAIL_PASS) in the server environment.',
        setupRequired: true,
      });
    }

    /* Token-driven send = an AUTOMATIC confirmation, so it goes through the
       same guarded hook the post-commit send uses: notify.confirmationEmailSentAt
       makes it exactly-once no matter how many callers ask. The storefront used
       to fire this endpoint on every checkout WHILE the server also mailed the
       confirmation itself — two hooks, two flags neither checked, two emails
       per order. Staff sends (below) stay plain manual resends. */
    if (grant === 'token') {
      const result = await maybeSendOrderConfirmationEmail(getFirestore(), entry.ref, order);
      if (result.skipped === 'already-sent') {
        return res.json({ success: true, skipped: 'already-sent' });
      }
      if (!result.ok) {
        return res.status(500).json({ error: 'Failed to send order email' });
      }
      console.log(`Order email sent for ${order.id} (messageId: ${result.messageId})`);
      return res.json({ success: true, messageId: result.messageId });
    }

    /* Staff manual resend renders the same canonical id as the automatic
       confirmation — never the document id. A record missing its shortCode is
       refused outright, so staff never mail a customer "Order Confirmed -
       #N/A": the record must be migrated first. */
    const displayOrderId = displayOrderCode(order);
    if (!displayOrderId) {
      console.error(`[orders/email] refusing resend for ${order.id}: missing shortCode`);
      return res.status(422).json({ error: 'This order has no customer Order ID yet (missing shortCode). Migrate the record before resending.', code: 'ORDER_ID_MISSING' });
    }

    const info = await getEmailTransporter().sendMail({
      from: `"Crackers Hyderabad" <${process.env.EMAIL_USER}>`,
      // Structured single recipient: nodemailer cannot expand this into a list.
      to: [{ address: customerEmail, name: '' }],
      subject: `Order Confirmed - #${displayOrderId} | Crackers Hyderabad`,
      html: buildOrderEmailHtml(order),
      text: buildOrderEmailText(order),
    });

    console.log(`Order email sent for ${order.id} (messageId: ${info.messageId})`);
    res.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('Error sending order email:', error);
    res.status(500).json({ error: 'Failed to send order email' });
  }
});

app.post('/api/orders/sms', notifyLimiter, requireFirebase, async (req, res) => {
  try {
    const authKey = process.env.MSG91_AUTH_KEY;
    if (!authKey) {
      return res.status(200).json({
        success: false,
        setupRequired: true,
        error: 'SMS service not configured. Add MSG91_AUTH_KEY to the server environment.',
      });
    }

    const entry = await loadOrderRef(req.body?.orderId);
    if (!entry) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!(await authoriseNotification(req, entry, 'sms'))) {
      return res.status(403).json({ error: 'Not permitted for this order' });
    }

    const { order } = entry;

    // Recipient and message content both come from the stored order.
    const rawPhone = order.customer?.phone || order.userPhone;
    if (!rawPhone) {
      return res.status(400).json({ error: 'This order has no phone number' });
    }

    const digits = String(rawPhone).replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 12) {
      return res.status(400).json({ error: 'This order has an unusable phone number' });
    }
    const mobile = digits.startsWith('91') ? digits : `91${digits}`;

    const type = req.body?.type === 'status' ? 'status' : 'placed';
    const customerName = sanitiseSmsText(order.customer?.name || 'Customer', 40);
    /* The customer SMS quotes the same canonical id as the email and the
       invoice — never the document id. A record missing its shortCode is
       refused outright rather than texted with a wrong id. */
    const displayCode = displayOrderCode(order);
    if (!displayCode) {
      console.error(`[orders/sms] refusing send for ${order.id}: missing shortCode`);
      return res.status(422).json({ error: 'This order has no customer Order ID yet (missing shortCode). Migrate the record before sending.', code: 'ORDER_ID_MISSING' });
    }
    const code = sanitiseSmsText(displayCode, 24);

    const message =
      type === 'status'
        ? `Dear ${customerName}, your order #${code} is now ${sanitiseSmsText(order.status || 'updated', 24)}. Thank you for shopping with Crackers Hyderabad!`
        : `Dear ${customerName}, your order #${code} (Rs.${Number(order.total || 0)}) has been placed successfully. We will update you on its status. - Crackers Hyderabad`;

    const params = new URLSearchParams({
      authkey: authKey,
      mobiles: mobile,
      message,
      sender: process.env.MSG91_SENDER_ID || 'CRAKER',
      route: process.env.MSG91_ROUTE || '4',
      country: '91',
    });

    const response = await fetch(`https://api.msg91.com/api/sendhttp.php?${params.toString()}`, {
      signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    // Log the outcome, not the provider payload, which can echo the auth key.
    console.log(`[SMS] ${type} for order ${order.id}: ${response.ok ? 'sent' : 'provider error'}`);
    res.json({ success: text.includes('type:success') });
  } catch (error) {
    console.error('Error sending SMS:', error);
    res.status(500).json({ success: false, error: 'Failed to send SMS' });
  }
});

/* Staff WhatsApp send: order status + invoice document via the Meta Cloud API.
 *
 * The frontend generates the invoice with the SAME pdfGenerator the
 * Download/Print buttons use and uploads it as `invoice`; every
 * customer-facing word here — name, shortCode, status, total, filename — is
 * re-derived server-side from the stored order, so the document id can never
 * leak into the message and a tampered upload cannot change what the
 * customer reads. Phone numbers are logged redacted, like the email path.
 *
 * Errors carry machine-readable `code`s the admin UI switches on:
 * ORDER_ID_MISSING / CUSTOMER_PHONE_MISSING / CUSTOMER_PHONE_INVALID /
 * INVOICE_MISSING / WHATSAPP_NOT_CONFIGURED / WHATSAPP_MEDIA_FAILED /
 * WHATSAPP_SEND_FAILED.
 */
app.post(
  '/api/orders/:orderId/whatsapp',
  notifyLimiter,
  requireFirebase,
  requireAdmin,
  uploadWhatsappPdf.single('invoice'),
  async (req, res) => {
    try {
      const entry = await loadOrderRef(req.params.orderId);
      if (!entry) {
        return res.status(404).json({ error: 'Order not found' });
      }
      const { order } = entry;

      let payload;
      try {
        payload = whatsapp.resolveOrderWhatsapp(order);
      } catch (validationError) {
        if (validationError instanceof whatsapp.WhatsappError) {
          return res.status(validationError.status || 422).json({
            code: validationError.code,
            error: validationError.message,
          });
        }
        throw validationError;
      }

      if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
        return res.status(422).json({
          code: 'INVOICE_MISSING',
          error: 'Attach the generated invoice PDF (Invoice_<Order ID>.pdf).',
        });
      }

      const config = whatsapp.readWhatsappConfig();
      if (!config.enabled || !config.ok) {
        if (config.problems.length > 0) {
          console.warn(`[orders/whatsapp] not configured for ${order.id}: ${config.problems.join(', ')}`);
        }
        return res.status(503).json({
          code: 'WHATSAPP_NOT_CONFIGURED',
          error: 'WhatsApp is not configured.',
          setupRequired: true,
        });
      }

      try {
        const mediaId = await whatsapp.uploadWhatsappMedia({
          config,
          buffer: req.file.buffer,
          filename: payload.filename,
          mimeType: 'application/pdf',
        });
        const messageId = await whatsapp.sendWhatsappDocument({
          config,
          to: payload.to,
          mediaId,
          filename: payload.filename,
          caption: payload.message,
        });
        // Log the outcome, never the recipient number or the message body.
        console.log(`[orders/whatsapp] status + invoice sent for ${payload.code} (messageId: ${messageId})`);
        return res.json({ success: true, messageId, orderCode: payload.code, to: payload.to });
      } catch (sendError) {
        if (sendError instanceof whatsapp.WhatsappError) {
          console.warn(`[orders/whatsapp] send failed for ${payload.code}: ${sendError.message}`);
          return res.status(sendError.status >= 500 ? 502 : sendError.status || 502).json({
            code: sendError.code,
            error: sendError.message,
          });
        }
        throw sendError;
      }
    } catch (error) {
      console.error('Error sending WhatsApp message:', error.message || error);
      res.status(500).json({ success: false, error: 'Failed to send WhatsApp message' });
    }
  }
);

/* ---------------------------------------------------------------------------
   Errors
   --------------------------------------------------------------------------- */

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Image must be 10MB or smaller' });
    }
    return res.status(400).json({ error: 'Upload failed' });
  }

  if (err && /CORS not allowed/.test(err.message || '')) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  if (err) {
    console.error('Unhandled error:', err);
    // Never leak internals to browsers in production; 400 carries the safe
    // validation message, anything else becomes a generic 500.
    if (process.env.NODE_ENV === 'production') {
      const status = err.status && Number.isInteger(err.status) ? err.status : 500;
      if (status >= 500) return res.status(status).json({ error: 'Something went wrong. Please try again.' });
    }
    return res.status(400).json({ error: err.message || 'Request failed' });
  }

  return next();
});

// Unknown /api/* routes must be JSON (Nginx serves the SPA for the rest,
// so a missing API route would otherwise fall through to index.html).
app.use('/api', (req, res) => {
  return res.status(404).json({ error: 'Not found' });
});

// Standard Node entry point: process managers such as PM2 run this file.
// Only bind when executed directly so `require('./server')` (tests) stays side-effect free.
const PORT = Number(process.env.PORT || process.env.API_PORT || 3001);
let server = null;
if (require.main === module) {
  server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`Admin API server running on port ${PORT}`);
    console.log(`CORS allow-list: ${ALLOWED_ORIGINS.join(', ')}`);
    if (!firebaseInitialized) {
      console.log('Warning: Firebase Admin SDK not initialized. Add FIREBASE_SERVICE_ACCOUNT_KEY secret.');
    }
  });
}

// Graceful shutdown for PM2 / systemd: finish in-flight requests, then exit.
const shutdown = (signal) => {
  console.log(`Received ${signal}, closing HTTP server...`);
  if (!server) process.exit(0);
  server.close((err) => {
    if (err) {
      console.error('Error during shutdown:', err.message);
      process.exit(1);
    }
    process.exit(0);
  });
  // Force-exit if connections hang (PM2 kill_timeout is 10s in ecosystem file).
  setTimeout(() => process.exit(0), 9000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
