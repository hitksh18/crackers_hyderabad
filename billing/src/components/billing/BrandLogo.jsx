import { useState } from 'react';
import { BRAND_LOGO_SRC, BRAND_NAME, BRAND_NAME_UPPER } from '../../lib/branding';

/**
 * The AYYAPA FIREWORKS brand lockup.
 *
 * Renders the official logo when BRAND_LOGO_SRC resolves, and the wordmark
 * either way. The logo file is not in the repository yet, so today every
 * surface shows the name alone — see the note in lib/branding.js for the one
 * path to drop the artwork into. A missing image therefore never shows as a
 * broken-image icon on a live register or on a customer's printed bill.
 *
 * Two variants, matching the two rendering contracts in this app:
 *   'screen' — the dark POS chrome, styled with the app's design tokens.
 *   'print'  — the monochrome invoice, styled with plain inline rules so it
 *              prints identically on a black-and-white printer (see
 *              BillPrintSheet, which deliberately avoids tokens for this).
 *
 * The logo is drawn with object-fit: contain inside a square box, so a
 * non-square asset is letterboxed rather than stretched or cropped.
 */
export default function BrandLogo({
  size = 32,
  variant = 'screen',
  nameClassName = '',
  showName = true,
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const isPrint = variant === 'print';
  const showLogo = !logoFailed;

  const imgStyle = isPrint
    ? { display: 'block', width: `${size}px`, height: `${size}px`, objectFit: 'contain' }
    : { width: `${size}px`, height: `${size}px` };

  const imgClassName = isPrint
    ? ''
    : 'shrink-0 object-contain';

  const nameStyle = isPrint
    ? { fontSize: `${Math.max(16, Math.round(size * 0.66))}px`, fontWeight: 700, margin: 0, color: '#000000' }
    : undefined;

  const nameClass = isPrint
    ? ''
    : `truncate font-bold uppercase tracking-[0.14em] leading-tight ${nameClassName}`;

  return (
    <>
      {showLogo && (
        <img
          src={BRAND_LOGO_SRC}
          alt={BRAND_NAME}
          width={size}
          height={size}
          onError={() => setLogoFailed(true)}
          draggable={false}
          style={imgStyle}
          className={imgClassName}
        />
      )}
      {showName && (
        <p style={nameStyle} className={nameClass}>
          {isPrint ? BRAND_NAME : BRAND_NAME_UPPER}
        </p>
      )}
    </>
  );
}