const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');

// Production KVM root — Nginx serves https://crackershyderabad.com/uploads/ from here.
const DEFAULT_MEDIA_ROOT = '/var/www/crackershyderabad-media';
const DEFAULT_PUBLIC_BASE = 'https://crackershyderabad.com/uploads';

// Allow-list of writable subdirectories. Prevents arbitrary writes.
const ALLOWED_DIRS = new Set([
  'products',
  'canvas/hero',
  'canvas/side-promos',
  'canvas/banners',
  'canvas/product-banners',
  'categories',
  'general',
  'brands',
]);

const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function getMediaRoot() {
  if (process.env.MEDIA_ROOT) return process.env.MEDIA_ROOT;
  if (process.env.UPLOAD_DIR) return process.env.UPLOAD_DIR;
  if (process.env.KVM_MEDIA_ROOT) return process.env.KVM_MEDIA_ROOT;
  // On Windows dev, prod path does not exist — use local folder under api/media
  return DEFAULT_MEDIA_ROOT;
}

function getPublicBase() {
  return (process.env.MEDIA_PUBLIC_BASE || DEFAULT_PUBLIC_BASE).replace(/\/+$/, '');
}

function normalizeDir(dir) {
  if (!dir || typeof dir !== 'string') return 'products';
  let d = String(dir).trim().replace(/^\/+/, '').replace(/\/+$/, '');
  // collapse and block traversal
  d = path.posix.normalize(d).replace(/\\/g, '/');
  if (d === '.' || d === '') return 'products';
  if (d.includes('..')) throw new Error('Invalid media directory');
  if (!ALLOWED_DIRS.has(d)) throw new Error(`Media directory "${d}" is not allowed. Allowed: ${[...ALLOWED_DIRS].join(', ')}`);
  return d;
}

function ensureMediaDirs() {
  const root = getMediaRoot();
  for (const dir of ALLOWED_DIRS) {
    const full = path.join(root, ...dir.split('/'));
    try {
      fs.mkdirSync(full, { recursive: true });
    } catch (e) {
      console.warn(`[media] mkdir failed for ${full}:`, e.message);
    }
  }
}

async function validateImage(buffer, mimetype) {
  if (!ALLOWED_IMAGE_TYPES[mimetype]) {
    throw new Error('Only JPEG, PNG, WebP or GIF images are allowed');
  }
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch (e) {
    throw new Error('That file is not a valid image');
  }
  if (!meta.format || !['jpeg', 'png', 'webp', 'gif'].includes(meta.format)) {
    throw new Error(`Unsupported image content: ${meta.format || 'unknown'}`);
  }
  return meta;
}

function extensionForMime(mimetype) {
  return ALLOWED_IMAGE_TYPES[mimetype] || '.bin';
}

function generateFilename(ext) {
  const rand = crypto.randomBytes(4).toString('hex');
  return `${Date.now()}_${rand}${ext}`;
}

// If the destination file already exists, suffix until unique.
function uniqueFilePath(dirFull, filename) {
  let target = path.join(dirFull, filename);
  if (!fs.existsSync(target)) return target;
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  for (let i = 1; i < 100; i++) {
    const alt = `${base}_${i}${ext}`;
    const p = path.join(dirFull, alt);
    if (!fs.existsSync(p)) return p;
  }
  // fallback with crypto
  return path.join(dirFull, `${base}_${crypto.randomBytes(3).toString('hex')}${ext}`);
}

async function storeMedia(buffer, dir, filename, contentType) {
  /* Persistence is gated on the media directory actually being writable —
     never on the NODE_ENV string. A KVM process started without
     `--env production` previously threw here even though
     /var/www/crackershyderabad-media existed and was writable, which broke
     every production upload with "Local media persistence is disabled".
     On a machine without a writable media root (e.g. Windows dev with no
     MEDIA_ROOT set) this still refuses, with an actionable message. */
  const normalized = normalizeDir(dir);
  const root = getMediaRoot();
  const dirFull = path.join(root, ...normalized.split('/'));
  let writable = false;
  try {
    await fs.promises.mkdir(dirFull, { recursive: true });
    await fs.promises.access(dirFull, fs.constants.W_OK);
    writable = true;
  } catch (_) {
    writable = false;
  }
  if (!writable) {
    throw new Error(
      `Media storage is not writable at ${root}. On the KVM this directory must exist and be writable by the API process; in development set MEDIA_ROOT to a writable local folder.`
    );
  }
  const safePath = uniqueFilePath(dirFull, filename);
  const finalName = path.basename(safePath);
  await fs.promises.writeFile(safePath, buffer);
  // Ensure readable by Nginx www-data
  try {
    await fs.promises.chmod(safePath, 0o644);
  } catch (_) {}
  const publicBase = getPublicBase();
  const url = `${publicBase}/${normalized}/${encodeURIComponent(finalName)}`;
  return { publicUrl: url, filename: finalName, dir: normalized, absolutePath: safePath };
}

// Watermark — same logic as previous server.js, reused here.
const WATERMARK_LABEL = 'Crackers Hyderabad';

async function watermarkImage(buffer) {
  const meta = await sharp(buffer).metadata();
  const width = meta.width || 800;
  const height = meta.height || 600;
  if (width < 160 || height < 120) return false;
  const fontSize = Math.max(13, Math.round(Math.min(width, height) * 0.032));
  const approxTextWidth = WATERMARK_LABEL.length * fontSize * 0.62;
  const pad = Math.round(fontSize * 0.55);
  const pillW = Math.round(approxTextWidth + pad * 2);
  const pillH = Math.round(fontSize * 1.65);
  const margin = Math.max(8, Math.round(fontSize * 0.55));
  const x = Math.max(0, width - pillW - margin);
  const y = Math.max(0, height - pillH - margin);
  const svg = Buffer.from(
    `<svg width="${pillW}" height="${pillH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${pillW}" height="${pillH}" rx="${Math.round(pillH / 2)}" fill="rgba(0,0,0,0.45)"/>
      <text x="${pillW / 2}" y="${pillH / 2 + 1}" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="rgba(255,255,255,0.92)" text-anchor="middle" dominant-baseline="central">${WATERMARK_LABEL}</text>
    </svg>`
  );
  let pipeline = sharp(buffer).composite([{ input: svg, top: y, left: x }]);
  if (meta.format === 'png') pipeline = pipeline.png({ compressionLevel: 9 });
  else if (meta.format === 'webp') pipeline = pipeline.webp({ quality: 92 });
  else if (meta.format === 'gif') return false;
  else pipeline = pipeline.jpeg({ quality: 92 });
  return pipeline.toBuffer();
}

const UPSCALE_TARGET = 1600;
const UPSCALE_MAX_FACTOR = 4;

async function upscaleImage(buffer, filename) {
  const meta = await sharp(buffer).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  const maxDim = Math.max(width, height);
  const scale = maxDim >= UPSCALE_TARGET ? 1 : Math.min(UPSCALE_TARGET / maxDim, UPSCALE_MAX_FACTOR);
  let newName = `${path.basename(filename, path.extname(filename))}.png`;
  if (newName === filename) newName = `${path.basename(filename, path.extname(filename))}_up${Date.now()}.png`;
  const processed = await sharp(buffer)
    .resize({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { buffer: processed, name: newName };
}

function isAllowedPublicUrl(url) {
  const base = getPublicBase();
  return typeof url === 'string' && url.startsWith(base + '/');
}

// Extract relative dir/filename from public URL, validating allowlist.
function parsePublicUrl(url) {
  const base = getPublicBase();
  if (!url || typeof url !== 'string' || !url.startsWith(base + '/')) return null;
  const rel = url.slice(base.length + 1); // e.g. products/abc.webp
  const decoded = decodeURIComponent(rel);
  if (decoded.includes('..') || decoded.includes('\\')) return null;
  const posix = path.posix.normalize(decoded);
  if (posix.includes('..')) return null;
  const parts = posix.split('/');
  const dirParts = parts.slice(0, -1).join('/');
  const filename = parts[parts.length - 1];
  if (!filename || !/^[A-Za-z0-9._-]+\.(jpg|png|webp|gif)$/i.test(filename)) return null;
  if (!ALLOWED_DIRS.has(dirParts) && dirParts !== '') return null;
  // categories case where dirParts is e.g. "products" — must be exactly allowed
  if (dirParts && !ALLOWED_DIRS.has(dirParts)) return null;
  return { dir: dirParts || 'products', filename, relative: posix };
}

async function deleteMediaByUrl(publicUrl) {
  const parsed = parsePublicUrl(publicUrl);
  if (!parsed) throw new Error('Invalid or non-KVM media URL');
  const root = getMediaRoot();
  const full = path.join(root, ...parsed.dir.split('/'), parsed.filename);
  const normalizedRoot = path.resolve(root);
  const normalizedFull = path.resolve(full);
  if (!normalizedFull.startsWith(normalizedRoot + path.sep) && normalizedFull !== normalizedRoot) {
    throw new Error('Path traversal blocked');
  }
  if (!fs.existsSync(normalizedFull)) return false;
  await fs.promises.unlink(normalizedFull);
  return true;
}

module.exports = {
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
  isAllowedPublicUrl,
  parsePublicUrl,
  deleteMediaByUrl,
  ALLOWED_DIRS,
  ALLOWED_IMAGE_TYPES,
};
