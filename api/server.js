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
  ALLOWED_DIRS,
} = require('./lib/media');

const {
  STAFF_ROLES,
  escapeHtml,
  sanitiseSmsText,
  createRateLimiter,
  securityHeaders,
} = require('./lib/security');
const { createOrder, createPosOrder, trackOrder, handlePublicTrack, consumeNotifyToken, isValidEmail } = require('./lib/orders');
// Single source of truth for SMTP (Gmail App Password via SMTP_*, EMAIL_*
// fallback) — order confirmations, password resets and manual resends.
// The compact confirmation template + payment note live in
// lib/emailTemplates + lib/email so every mail path renders identically.
const { readEmailConfig, createSmtpTransporter, orderPaymentNote, maybeSendOrderConfirmationEmail, sendStatusUpdateEmail } = require('./lib/email');
const { orderConfirmationHtml, orderConfirmationText } = require('./lib/emailTemplates');
const { handleReverseGeocode, handleSearchPlaces, handleGeocodeConfig } = require('./lib/geocode');

if (process.env.NODE_ENV === 'production') try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
} catch (e) {
  console.warn('Could not load .env file:', e.message);
}

// Email-only env (server, git-ignored). Loaded in ALL environments so local
// dev picks up SMTP without exporting vars by hand. Root .env still wins
// when both set the same key (loaded second in production).
try {
  const emailEnvPath = path.join(__dirname, '..', '.env.email');
  if (fs.existsSync(emailEnvPath)) {
    process.loadEnvFile(emailEnvPath);
  }
} catch (e) {
  console.warn('Could not load .env.email file:', e.message);
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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
      if (snap.exists) role = snap.data().role || null;
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 1, fields: 10 },
  fileFilter: (req, file, cb) => {
    if (UPLOAD_ALLOWED_TYPES[file.mimetype]) return cb(null, true);
    return cb(new Error('Only JPEG, PNG, WebP or GIF images are allowed'));
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
      const { publicUrl, absolutePath, filename: storedFilename } = await storeMedia(buffer, dir, finalName);
      const destDir = path.join(getMediaRoot(), dir);
      const safeOriginal = String(req.file.originalname || '').replace(/[\r\n\t]+/g, ' ').slice(0, 120);
      console.log(`[upload] dir=${dir} mimetype=${req.file.mimetype} originalName=${safeOriginal} size=${buffer.length} upscale=${shouldUpscale} watermark=${shouldWatermark}`);
      console.log(`[upload] generatedFilename=${finalName} storedFilename=${storedFilename} destDir=${destDir} absolutePath=${absolutePath}`);
      console.log(`[upload] ${dir}/${storedFilename} → ${publicUrl}`);
      return res.json({ url: publicUrl, publicUrl, dir, filename: storedFilename });
    } catch (error) {
      console.error('[upload] KVM store failed:', error.message);
      return res.status(500).json({ error: `Image upload failed: ${error.message}` });
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

app.get('/api/admin/users', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const users = [];
    let nextPageToken;

    do {
      const result = await getAuth().listUsers(1000, nextPageToken);
      result.users.forEach((u) => users.push(toUserPayload(u)));
      nextPageToken = result.pageToken;
    } while (nextPageToken);

    res.json({ users, total: users.length });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

app.get('/api/admin/users/:uid', adminLimiter, requireAdmin, async (req, res) => {
  try {
    res.json(toUserPayload(await getAuth().getUser(req.params.uid)));
  } catch (error) {
    console.error('Error getting user:', error);
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

app.delete('/api/admin/users/:uid', adminLimiter, requireAdmin, async (req, res) => {
  try {
    if (req.params.uid === req.caller.uid) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    await getAuth().deleteUser(req.params.uid);
    // Clean application data if present — do not fail the whole request if these are missing
    try { await getFirestore().collection('roles').doc(req.params.uid).delete(); } catch (e) { console.warn('[admin] roles cleanup failed for', req.params.uid, e.message); }
    try { await getFirestore().collection('users').doc(req.params.uid).delete(); } catch (e) { console.warn('[admin] users cleanup failed for', req.params.uid, e.message); }
    console.log(`[admin] ${req.caller.uid} deleted ${req.params.uid} (auth + roles/users)`);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error.code, error.message);
    // Map known auth errors to safe messages
    const code = error.code || '';
    if (code.includes('user-not-found')) return res.status(404).json({ error: 'User not found' });
    if (code.includes('invalid-uid')) return res.status(400).json({ error: 'Invalid user ID' });
    res.status(500).json({ error: 'Failed to delete user' });
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
   Site analytics (first-party)
   Ingestion is public — a visitor is not signed in — but it is rate limited
   and stores no IP address. Reading is admin-only: traffic, referrers and
   revenue are business data, so these two routes carry the same guard chain
   as every other /api/admin surface.
   --------------------------------------------------------------------------- */

const site = require('./lib/siteAnalytics');

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

/* Manual resend (POST /api/orders/email) renders the SAME compact,
// item-free confirmation template as the automatic mail — summary, live
// status, note and actions only. The itemised invoice is generated
// client-side from the tracking page behind DOWNLOAD INVOICE. */
function buildOrderEmailHtml(order) {
  const code = String(order.shortCode || order.orderId || order.id || 'N/A').toUpperCase();
  const items = Array.isArray(order.items) ? order.items : [];
  const quantity = items.reduce((n, item) => n + (Number(item.quantity) || 0), 0);
  const trackBase = (process.env.TRACK_BASE_URL || process.env.PUBLIC_SITE_URL || 'https://crackershyderabad.com').replace(/\/+$/, '');
  return orderConfirmationHtml({
    orderCode: code,
    status: order.status || 'Pending',
    quantity,
    total: order.total ?? 0,
    trackUrl: `${trackBase}/track/${code}`,
    invoiceUrl: `${trackBase}/track-order?id=${encodeURIComponent(code)}`,
    customerName: order.customer?.name || '',
    note: orderPaymentNote(order),
  });
}

function buildOrderEmailText(order) {
  const code = String(order.shortCode || order.orderId || order.id || 'N/A').toUpperCase();
  const items = Array.isArray(order.items) ? order.items : [];
  const quantity = items.reduce((n, item) => n + (Number(item.quantity) || 0), 0);
  const trackBase = (process.env.TRACK_BASE_URL || process.env.PUBLIC_SITE_URL || 'https://crackershyderabad.com').replace(/\/+$/, '');
  return orderConfirmationText({
    orderCode: code,
    status: order.status || 'Pending',
    quantity,
    total: order.total ?? 0,
    trackUrl: `${trackBase}/track/${code}`,
    invoiceUrl: `${trackBase}/track-order?id=${encodeURIComponent(code)}`,
    customerName: order.customer?.name || '',
    note: orderPaymentNote(order),
  });
}

/**
 * Order placement. Open to guests by design — this is checkout — but every
 * price, the total, the status and the order code are decided server-side from
 * the products collection, and `orders.create` is closed in the rules so this
 * is the only way an order can come into existence.
 *
 * A signed-in caller is bound to their order via the optional bearer token.
 */
const orderLimiter = createRateLimiter({ windowMs: 60_000, max: 12, name: 'orders' });

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

    const displayOrderId = String(order.shortCode || order.id).toUpperCase();

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
    const code = sanitiseSmsText(order.shortCode || order.id, 24);

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

/* ---------------------------------------------------------------------------
   Errors
   --------------------------------------------------------------------------- */

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 6MB or smaller' : 'Upload failed';
    return res.status(400).json({ error: message });
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
