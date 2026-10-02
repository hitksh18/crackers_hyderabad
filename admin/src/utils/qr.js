import QRCode from 'qrcode';

/**
 * QR encoding, synchronously.
 *
 * The library's `toDataURL` is promise-based, but the invoice generator in
 * utils/pdfGenerator is synchronous and called from four screens. Rather than
 * make all of them async for one image, this uses `create()` — the library's
 * sync core — and renders the module matrix directly: as SVG for the browser,
 * and as filled rectangles for jsPDF.
 *
 * Drawing the modules as PDF rectangles rather than embedding a raster keeps the
 * symbol vector, so it stays sharp at whatever size the shop's printer runs and
 * cannot pick up the resampling fringes that stop a phone camera locking on.
 */

/* Medium recovery: a packing slip lives in a delivery bag and gets creased and
   thumbed. L would fit in a smaller symbol, but the printed module would have
   to shrink for no benefit — at the size used on the invoice, M still leaves
   each module comfortably above what a phone camera resolves. */
const ERROR_CORRECTION = 'M';

/* The mandatory light border. Below 4 modules, scanners struggle to find the
   symbol's edge against surrounding ink. */
const QUIET_ZONE = 4;

/**
 * Encode `text` into a module matrix.
 *
 * Returns null when the payload cannot be encoded at all, so every caller
 * treats "no QR" as an ordinary case rather than an error — an invoice must
 * still print if the symbol cannot be built.
 */
export const qrMatrix = (text) => {
  const payload = String(text || '');
  if (!payload) return null;

  try {
    const { modules } = QRCode.create(payload, { errorCorrectionLevel: ERROR_CORRECTION });
    const { size, data } = modules;
    return {
      size,
      quietZone: QUIET_ZONE,
      /* The matrix is a flat Uint8Array in row-major order. */
      isDark: (row, col) => data[row * size + col] === 1,
    };
  } catch (error) {
    console.warn('[qr] could not encode payload:', error.message);
    return null;
  }
};

/**
 * Render a matrix as an SVG string.
 *
 * Every dark module becomes one subpath of a single `<path>`, which keeps the
 * markup small enough to sit in an inline data URL.
 */
export const qrSvg = (text, { dark = '#000000', light = '#FFFFFF' } = {}) => {
  const matrix = qrMatrix(text);
  if (!matrix) return '';

  const { size, quietZone, isDark } = matrix;
  const extent = size + quietZone * 2;

  let path = '';
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (isDark(row, col)) path += `M${col + quietZone} ${row + quietZone}h1v1h-1z`;
    }
  }

  /* A fixed viewBox in module units with no width/height: the symbol then
     scales to whatever box the layout gives it and stays square. */
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}" shape-rendering="crispEdges">` +
    `<rect width="${extent}" height="${extent}" fill="${light}"/>` +
    `<path d="${path}" fill="${dark}"/>` +
    `</svg>`
  );
};

/** The same SVG, ready for an `<img src>`. */
export const qrSvgDataUrl = (text, options) => {
  const svg = qrSvg(text, options);
  return svg ? `data:image/svg+xml,${encodeURIComponent(svg)}` : '';
};
