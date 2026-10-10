import { forwardRef, useState } from 'react';
import { BRAND_NAME_UPPER, BRAND_TAGLINE, BRAND_LOGO_SRC } from '../../lib/branding';
import { chunkItems } from '../../lib/paginateInvoice';
import './BillPrintSheet.css';

/**
 * The printed counter invoice.
 *
 * Screen-hidden, print-visible (see the inline <style> in pages/Billing.jsx).
 * Visual layer only: every figure is passed in already calculated by Billing,
 * and the prop list is the same contract it has always been.
 *
 * PAGINATION — explicit 20 products per page (see lib/paginateInvoice):
 * items are sliced in React instead of left to browser auto-break. Each
 * chunk below is one physical page (max 20 rows), a compact continuation
 * header on pages 2+, and an AYYAPA FIREWORKS footer with dynamic Page X
 * of N on every page. Totals + thank-you print on the final chunk only.
 * Chunks are content-sized blocks with no min-height/fixed height, the last
 * chunk never forces a page break — so pagination alone can never emit a
 * blank page. Every row carries break-inside:avoid so a row never splits.
 *
 * BRANDING — page 1 and every continuation page render the same logo at the
 * same explicit size (see --bps-logo in BillPrintSheet.css), the same brand
 * block, and the same canonical Order ID, so all pages read as one document.
 */

/**
 * The official Ayyapa Fireworks mark ONLY
 * (billing/public/images/website/ayyappa-fireworks-logo.png — byte-identical
 * copy of billing/images/Ayyappa Fireworks Logo.png, the source artwork).
 * One asset, one explicit size: the CSS custom property --bps-logo fixes the
 * rendered width AND height on every page, so page 1, page 2 and page 3 can
 * never disagree. object-fit:contain keeps the square artwork undistorted.
 * If the file ever goes missing the mark hides itself and the wordmark
 * beside it carries the brand, so no broken-image icon can print.
 * Never use the online-store logo on this offline invoice.
 */
const LOGO_SRC = BRAND_LOGO_SRC;

/**
 * Four-point spark, used as the fireworks accent. Decorative only: it is
 * absolutely positioned, tiny, low-contrast, and never placed inside the table
 * or over any text. aria-hidden — never read out on print.
 */
function Spark({ className }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path
        d="M50 0 C54 34 66 46 100 50 C66 54 54 66 50 100 C46 66 34 54 0 50 C34 46 46 34 50 0 Z"
        fill="currentColor"
      />
    </svg>
  );
}

const BillPrintSheet = forwardRef(function BillPrintSheet(
  {
    customerName,
    customerPhone,
    paymentMode,
    items,
    subtotal,
    discountPercent,
    discountAmount,
    total,
    orderId,
  },
  ref
) {
  const [markFailed, setMarkFailed] = useState(false);

  const stamp = new Date();
  const dateLabel = stamp.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timeLabel = stamp.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  /**
   * The OFFLINE Order ID printed on the receipt — ONE source of truth.
   *
   * Received as a prop (`savedOrderId`, set from `result.shortCode` — the id
   * minted once on the server when the bill was saved). This component NEVER
   * generates an id: it prints exactly what it was given, so Billing UI,
   * Firebase order, order details, preview, PDF and filename all show the
   * identical string.
   *
   * Billing flushes that state into the DOM before window.print() (see
   * saveBill), so the print snapshot always carries the id. The guard below
   * is defensive only: if no id was ever supplied the row is omitted rather
   * than invented — a slip with no order id is honest about not being an
   * order record yet.
   */
  const hasOrderId = typeof orderId === 'string' && orderId.trim().length > 0;

  const chunks = chunkItems(items);
  const pageCount = chunks.length;

  const renderRows = (rows, offset) =>
    rows.map((item, index) => {
      const mrp = item.offlineMRP || item.offlinePrice || item.onlinePrice || 0;
      const price =
        item.offlineDiscountPrice ||
        item.offlineMRP ||
        item.offlinePrice ||
        item.onlinePrice ||
        0;
      const lineTotal = price * item.quantity;
      const discounted = Boolean(item.offlineDiscountPrice);

      return (
        <tr key={item.id || `${offset + index}`} className="bps-avoid-break">
          <td style={{ color: '#8d857d', fontVariantNumeric: 'tabular-nums' }}>
            {offset + index + 1}
          </td>
          <td className="bps-name">{item.name}</td>
          <td className="bps-centre" style={{ fontWeight: 700 }}>
            {item.quantity}
          </td>
          <td
            className={`bps-num bps-mrp${discounted ? ' bps-mrp-off' : ''}`}
          >
            ₹{mrp.toFixed(2)}
          </td>
          <td
            className={`bps-num ${
              discounted ? 'bps-price' : 'bps-price bps-price--plain'
            }`}
          >
            ₹{price.toFixed(2)}
          </td>
          <td className="bps-num bps-line-total">₹{lineTotal.toFixed(2)}</td>
        </tr>
      );
    });

  return (
    <div className="bill-print-sheet">
      <div ref={ref} className="bps-pages">
        {chunks.map((rows, pageIndex) => {
          const isFirst = pageIndex === 0;
          const isLast = pageIndex === pageCount - 1;
          const offset = chunks
            .slice(0, pageIndex)
            .reduce((sum, chunk) => sum + chunk.length, 0);
          return (
            <div className="bps-page" key={pageIndex}>
              <div className="bps-topbar" />

              <div className="bps-body">
                {isFirst ? (
                  <header className="bps-header">
                    <Spark className="bps-spark bps-spark--hdr-1" />
                    <Spark className="bps-spark bps-spark--hdr-2" />

                    <div className="bps-brand">
                      {!markFailed && (
                        <img
                          className="bps-brand-mark"
                          src={LOGO_SRC}
                          alt="Ayyapa Fireworks"
                          onError={() => setMarkFailed(true)}
                          draggable={false}
                        />
                      )}
                      <div className="bps-brand-text">
                        <h1 className="bps-brand-name">{BRAND_NAME_UPPER}</h1>
                        <p className="bps-brand-tagline">{BRAND_TAGLINE}</p>
                      </div>
                    </div>

                    <div className="bps-doc">
                      <p className="bps-doc-title">Invoice</p>
                      <div className="bps-doc-rule" />
                      <div className="bps-meta-list">
                        {hasOrderId && (
                          <div className="bps-meta-row bps-meta-row--order">
                            <span className="bps-meta-key">Order ID</span>
                            <span className="bps-meta-val bps-meta-val--order">{orderId.trim()}</span>
                          </div>
                        )}
                        <div className="bps-meta-row">
                          <span className="bps-meta-key">Date</span>
                          <span className="bps-meta-val">{dateLabel}</span>
                        </div>
                        <div className="bps-meta-row">
                          <span className="bps-meta-key">Time</span>
                          <span className="bps-meta-val">{timeLabel}</span>
                        </div>
                      </div>
                    </div>
                  </header>
                ) : (
                  /* Continuation pages carry the SAME mark at the SAME size as
                     page 1 — one asset, one CSS size variable — so a page-2
                     logo can never differ from the page-1 logo. Compact, but
                     still the full letterhead: brand + tagline on the left,
                     INVOICE and the canonical ORDER ID on the right, so a sheet
                     separated from its stack can still be identified. */
                  <header className="bps-header bps-header--cont">
                    <div className="bps-brand">
                      {!markFailed && (
                        <img
                          className="bps-brand-mark"
                          src={LOGO_SRC}
                          alt="Ayyapa Fireworks"
                          onError={() => setMarkFailed(true)}
                          draggable={false}
                        />
                      )}
                      <div className="bps-brand-text">
                        <p className="bps-cont-name">{BRAND_NAME_UPPER}</p>
                        <p className="bps-brand-tagline">{BRAND_TAGLINE}</p>
                      </div>
                    </div>

                    <div className="bps-doc bps-doc--cont">
                      <p className="bps-doc-title bps-doc-title--cont">Invoice</p>
                      <div className="bps-doc-rule" />
                      <div className="bps-meta-list">
                        {hasOrderId && (
                          <div className="bps-meta-row bps-meta-row--order">
                            <span className="bps-meta-key">Order ID</span>
                            <span className="bps-meta-val bps-meta-val--order">{orderId.trim()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </header>
                )}

                {isFirst && (
                  <>
                    <section className="bps-panel">
                      <div className="bps-panel-head">Billing Information</div>
                      <div className="bps-strip">
                        <div className="bps-strip-cell">
                          <span className="bps-strip-key">Date</span>
                          <span className="bps-strip-val bps-strip-val-num">{dateLabel}</span>
                        </div>
                        <div className="bps-strip-cell">
                          <span className="bps-strip-key">Payment</span>
                          <span className="bps-strip-val">{paymentMode}</span>
                        </div>
                        <div className="bps-strip-cell">
                          <span className="bps-strip-key">Status</span>
                          <span className="bps-badge">Paid</span>
                        </div>
                        <div className="bps-strip-cell">
                          <span className="bps-strip-key">Items</span>
                          <span className="bps-strip-val bps-strip-val-num">{(items || []).length}</span>
                        </div>
                      </div>
                    </section>

                    <section className="bps-panel">
                      <div className="bps-panel-head">Bill To</div>
                      <div className="bps-billto">
                        <div className="bps-billto-cell">
                          <span className="bps-billto-key">Customer Name</span>
                          <span className="bps-billto-val">{customerName}</span>
                        </div>
                        <div className="bps-billto-cell">
                          <span className="bps-billto-key">Mobile</span>
                          <span className="bps-billto-val bps-billto-val-num">{customerPhone}</span>
                        </div>
                      </div>
                    </section>
                  </>
                )}

                <div className="bps-section">
                  <span className="bps-section-title">Items</span>
                  <span className="bps-section-line" />
                </div>

                <table className="bps-rows">
                  <thead>
                    <tr>
                      <th style={{ width: '26px' }}>#</th>
                      <th>Product</th>
                      <th style={{ width: '46px', textAlign: 'center' }}>Qty</th>
                      <th style={{ width: '74px', textAlign: 'right' }}>MRP</th>
                      <th style={{ width: '78px', textAlign: 'right' }}>Price</th>
                      <th style={{ width: '86px', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renderRows(rows, offset)}
                  </tbody>
                </table>

                {isLast && (
                  <>
                    <div className="bps-section" style={{ marginTop: 13 }}>
                      <span className="bps-section-title">Payment Summary</span>
                      <span className="bps-section-line" />
                    </div>

                    <div className="bps-bottom">
                      <div className="bps-summary">
                        <div className="bps-summary-row">
                          <span className="bps-summary-key">Subtotal</span>
                          <span className="bps-summary-val">₹{subtotal.toFixed(2)}</span>
                        </div>
                        {discountAmount > 0 && (
                          <div className="bps-summary-row">
                            <span className="bps-summary-key">Discount ({discountPercent}%)</span>
                            <span className="bps-summary-val bps-summary-val-off">
                              -₹{discountAmount.toFixed(2)}
                            </span>
                          </div>
                        )}
                        <div className="bps-grand">
                          <span className="bps-grand-key">Grand Total</span>
                          <span className="bps-grand-val">₹{total.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <footer className="bps-footer">
                <Spark className="bps-spark bps-spark--ftr-1" />
                <Spark className="bps-spark bps-spark--ftr-2" />

                <div className="bps-footer-rule" />
                {isLast && (
                  <>
                    <p className="bps-footer-thanks">Thank you for your purchase!</p>
                    <p className="bps-footer-line">Have a safe and happy celebration!</p>
                  </>
                )}
                <p className="bps-footer-brand">AYYAPA FIREWORKS</p>
                <p className="bps-page-num">
                  Page {pageIndex + 1} of {pageCount}
                </p>
              </footer>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default BillPrintSheet;
