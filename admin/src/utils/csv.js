/**
 * CSV export.
 *
 * The shop's records end up in spreadsheets, so every table on the analytics
 * dashboard can be downloaded as-is rather than retyped.
 */

/* A leading =, +, - or @ makes a spreadsheet treat the cell as a formula. Any
   value here comes from page paths, referrer hosts and product names, so it is
   prefixed with a quote to stay inert when opened in Excel or Sheets. */
const RISKY_FIRST_CHARS = ['=', '+', '-', '@'];

function escapeCell(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  const guarded = RISKY_FIRST_CHARS.includes(raw.charAt(0)) ? `'${raw}` : raw;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/**
 * Build CSV text from rows and a column spec.
 *
 * @param {Array<object>} rows
 * @param {Array<{key: string, header: string, value?: (row: object) => unknown}>} columns
 */
export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows.map((row) =>
    columns.map((c) => escapeCell(c.value ? c.value(row) : row[c.key])).join(','),
  );
  return [header, ...body].join('\r\n');
}

/** Trigger a download without a round trip to the server. */
export function downloadCsv(filename, csvText) {
  // The BOM is what makes Excel read UTF-8 rather than mangling it.
  const blob = new Blob([`\uFEFF${csvText}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportCsv(filename, rows, columns) {
  downloadCsv(filename, toCsv(rows, columns));
}
