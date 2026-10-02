import { forwardRef } from 'react';

/**
 * The printed counter invoice.
 *
 * Screen-hidden, print-visible. Deliberately styled with plain inline rules
 * rather than design tokens: the sheet must render identically on a monochrome
 * printer regardless of the app theme.
 *
 * Pure presentation — every figure is passed in already calculated by Billing.
 */

const CELL = { padding: '7px 6px', verticalAlign: 'top' };
const NUM = {
  ...CELL,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};
const HEAD = {
  padding: '8px 6px',
  fontSize: '10px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 700,
  borderBottom: '1.5px solid #000000',
};

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
  },
  ref
) {
  const stamp = new Date();

  return (
    <div className="bill-print-sheet">
      <div ref={ref} style={{ padding: '0', maxWidth: '800px', margin: '0 auto', color: '#000000' }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: '16px',
            borderBottom: '2px solid #000000',
            paddingBottom: '10px',
            marginBottom: '14px',
          }}
        >
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
              Crackers Hyderabad
            </h1>
            <p style={{ fontSize: '11px', margin: '2px 0 0 0', color: '#444444' }}>
              Premium Quality Fireworks
            </p>
          </div>
          <div style={{ textAlign: 'right', fontSize: '11px', color: '#444444' }}>
            <p style={{ margin: 0, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              Invoice
            </p>
            <p style={{ margin: '2px 0 0 0', fontVariantNumeric: 'tabular-nums' }}>
              {stamp.toLocaleDateString()}
            </p>
            <p style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>
              {stamp.toLocaleTimeString()}
            </p>
          </div>
        </header>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginBottom: '14px',
            fontSize: '12px',
            border: '1px solid #999999',
          }}
        >
          <tbody>
            <tr>
              <th style={{ ...CELL, textAlign: 'left', width: '110px', fontWeight: 700 }}>Customer</th>
              <td style={CELL}>{customerName}</td>
              <th style={{ ...CELL, textAlign: 'left', width: '110px', fontWeight: 700 }}>Payment Mode</th>
              <td style={CELL}>{paymentMode}</td>
            </tr>
            <tr>
              <th style={{ ...CELL, textAlign: 'left', fontWeight: 700 }}>Mobile Number</th>
              <td style={{ ...CELL, fontVariantNumeric: 'tabular-nums' }}>{customerPhone}</td>
              <th style={{ ...CELL, textAlign: 'left', fontWeight: 700 }}>Items</th>
              <td style={{ ...CELL, fontVariantNumeric: 'tabular-nums' }}>{items.length}</td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px', fontSize: '12px' }}>
          <thead>
            <tr>
              <th style={{ ...HEAD, textAlign: 'left', width: '32px' }}>#</th>
              <th style={{ ...HEAD, textAlign: 'left' }}>Product Name</th>
              <th style={{ ...HEAD, textAlign: 'center', width: '52px' }}>Qty</th>
              <th style={{ ...HEAD, textAlign: 'right', width: '82px' }}>MRP</th>
              <th style={{ ...HEAD, textAlign: 'right', width: '82px' }}>Price</th>
              <th style={{ ...HEAD, textAlign: 'right', width: '92px' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const mrp = item.offlineMRP || item.offlinePrice || item.onlinePrice || 0;
              const price =
                item.offlineDiscountPrice ||
                item.offlineMRP ||
                item.offlinePrice ||
                item.onlinePrice ||
                0;
              const lineTotal = price * item.quantity;

              return (
                <tr key={item.id} style={{ borderBottom: '1px solid #DDDDDD', breakInside: 'avoid' }}>
                  <td style={{ ...CELL, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>
                    {index + 1}
                  </td>
                  <td style={{ ...CELL, textAlign: 'left' }}>{item.name}</td>
                  <td
                    style={{
                      ...CELL,
                      textAlign: 'center',
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {item.quantity}
                  </td>
                  <td
                    style={{
                      ...NUM,
                      textDecoration: item.offlineDiscountPrice ? 'line-through' : 'none',
                      color: item.offlineDiscountPrice ? '#777777' : '#000000',
                    }}
                  >
                    ₹{mrp.toFixed(2)}
                  </td>
                  <td style={{ ...NUM, fontWeight: item.offlineDiscountPrice ? 700 : 400 }}>
                    ₹{price.toFixed(2)}
                  </td>
                  <td style={{ ...NUM, fontWeight: 700 }}>₹{lineTotal.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end', breakInside: 'avoid' }}>
          <table
            style={{
              width: '290px',
              borderCollapse: 'collapse',
              fontSize: '12px',
              borderTop: '2px solid #000000',
            }}
          >
            <tbody>
              <tr>
                <td style={CELL}>Subtotal</td>
                <td style={{ ...NUM, fontWeight: 700 }}>₹{subtotal.toFixed(2)}</td>
              </tr>
              {discountAmount > 0 && (
                <tr>
                  <td style={CELL}>Discount ({discountPercent}%)</td>
                  <td style={{ ...NUM, fontWeight: 700 }}>- ₹{discountAmount.toFixed(2)}</td>
                </tr>
              )}
              <tr style={{ borderTop: '1.5px solid #000000' }}>
                <td style={{ ...CELL, fontSize: '15px', fontWeight: 700 }}>Grand Total</td>
                <td style={{ ...NUM, fontSize: '15px', fontWeight: 700 }}>₹{total.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer
          style={{
            textAlign: 'center',
            marginTop: '26px',
            paddingTop: '12px',
            borderTop: '1px dashed #999999',
            fontSize: '11px',
            color: '#444444',
          }}
        >
          <p style={{ margin: '4px 0', fontWeight: 700, color: '#000000' }}>
            Thank you for your purchase!
          </p>
          <p style={{ margin: '4px 0' }}>Have a safe and happy celebration!</p>
          <p style={{ margin: '8px 0 0 0', fontSize: '10px' }}>For any queries, please contact us</p>
        </footer>
      </div>
    </div>
  );
});

export default BillPrintSheet;
