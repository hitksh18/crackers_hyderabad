/**
 * Storefront WhatsApp button number source — the tests that matter.
 *
 * Run: node --test tests/storefront-whatsapp.test.js
 *
 * Contract: Admin → Site Settings → Store Contact → WhatsApp number
 * (Firestore `footerSettings/main`, field `whatsapp`) is the SINGLE SOURCE
 * OF TRUTH for the storefront floating button. The button carries no
 * hardcoded number, normalises the saved value for wa.me, renders nothing
 * until a usable number loads, and never touches the Meta Cloud API
 * credentials (those drive automated order messages, not this contact link).
 */
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const fs = require('node:fs');
const path = require('node:path');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

let contact;
test.before(async () => {
  contact = await import('../client/src/lib/whatsappContact.js');
});

/* -------------------------------------------------------------------------
   Normalisation — the acceptance cases and the guard rails
   ------------------------------------------------------------------------- */

test('the saved Store Contact number becomes the wa.me number', () => {
  // Acceptance: admin saves "91212 98383" → button opens wa.me/919121298383.
  assert.equal(contact.normalizeWhatsappLinkNumber('91212 98383'), '919121298383');
  assert.equal(contact.normalizeWhatsappLinkNumber('9121298383'), '919121298383');
});

test('a number that already carries the country code is left alone', () => {
  assert.equal(contact.normalizeWhatsappLinkNumber('91 91212 98383'), '919121298383');
  assert.equal(contact.normalizeWhatsappLinkNumber('+91-9121298383'), '919121298383');
  assert.equal(contact.normalizeWhatsappLinkNumber('919121298383'), '919121298383');
  assert.equal(contact.normalizeWhatsappLinkNumber('+919121298383'), '919121298383');
});

test('trunk-prefixed and decorated numbers normalise safely', () => {
  assert.equal(contact.normalizeWhatsappLinkNumber('09121298383'), '919121298383');
  assert.equal(contact.normalizeWhatsappLinkNumber('(91212) 98383'), '919121298383');
});

test('unusable values yield no number instead of a wrong link', () => {
  for (const bad of ['', '   ', 'abc', '12345', '123456789012345', null, undefined]) {
    assert.equal(contact.normalizeWhatsappLinkNumber(bad), '', `must yield '' for ${JSON.stringify(bad)}`);
  }
});

/* -------------------------------------------------------------------------
   Button wiring — single source, no hardcoded number, safe loading
   ------------------------------------------------------------------------- */

test('the button reads the Store Contact setting and nothing else', () => {
  const source = read('client', 'src', 'components', 'WhatsAppButton.jsx');
  assert.match(source, /footerSettings/, 'reads the settings document');
  assert.match(source, /snap\.data\(\)\?\.whatsapp/, 'reads the Store Contact whatsapp field');
  assert.ok(!/data\.phone/.test(source), 'must not fall back to any other field');
  assert.match(source, /normalizeWhatsappLinkNumber/, 'normalises through the shared helper');
});

test('zero hardcoded numbers survive in the button', () => {
  const source = read('client', 'src', 'components', 'WhatsAppButton.jsx');
  assert.ok(!/1234567890/.test(source), 'the old hardcoded default must be gone');
  assert.ok(!/9876543210/.test(source), 'no other fake number may take its place');
  assert.ok(!/\d{7,}/.test(source), 'no long digit run may hide a dialable number');
});

test('the button renders nothing until a usable number loads', () => {
  const source = read('client', 'src', 'components', 'WhatsAppButton.jsx');
  assert.match(source, /useState\(''\)/, 'starts with no number, not a placeholder');
  assert.ok(
    /!settingsLoaded \|\| !whatsappNumber/.test(source),
    'loading, failed and empty states must all render nothing'
  );
  assert.match(
    source,
    /wa\.me\/\$\{whatsappNumber\}/,
    'the link uses the already-normalised number, with no inline reformatting'
  );
});

test('the contact link stays separate from order-message credentials', () => {
  const source = read('client', 'src', 'components', 'WhatsAppButton.jsx');
  assert.ok(!/WHATSAPP_ACCESS_TOKEN/.test(source), 'no Meta token in the storefront');
  assert.ok(!/WHATSAPP_PHONE_NUMBER_ID/.test(source), 'no Cloud API number id in the storefront');
});

/* -------------------------------------------------------------------------
   Admin side of the contract — the setting the button reads
   ------------------------------------------------------------------------- */

test('Site Settings saves the number the button reads', () => {
  const source = read('admin', 'src', 'pages', 'SiteSettings.jsx');
  assert.match(source, /footerSettings/, 'saves to the settings document');
  assert.match(source, /\{\s*whatsapp:\s*whatsapp\.trim\(\)/, 'saves the trimmed whatsapp field');
  assert.match(source, /\{\s*merge:\s*true\s*\}/, 'merges so sibling footer settings survive');
});
