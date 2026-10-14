/**
 * Storefront SEO wiring — the tests that matter.
 *
 * Run: node --test tests/storefront-seo.test.js
 *
 * Contract: Admin → Site Settings → SEO (Firestore `settings/siteSettings`,
 * key `seo`) is the single source of truth. The homepage head metadata must
 * render every stored field — including the dedicated X/Twitter title and
 * description, which previously saved yet never reached any tag.
 */
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const fs = require('node:fs');
const path = require('node:path');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

test('the head manager renders dedicated X title and description', () => {
  const source = read('client', 'src', 'components', 'Seo.jsx');
  assert.match(source, /twitterTitle,/, 'Seo accepts the X title prop');
  assert.match(source, /twitterDescription,/, 'Seo accepts the X description prop');
  assert.match(
    source,
    /const twTitle = twitterTitle \|\| shareTitle;/,
    'the X title prefers the stored value, falling back to the share title'
  );
  assert.match(
    source,
    /const twDescription = twitterDescription \|\| shareDescription;/,
    'the X description prefers the stored value, falling back to the share description'
  );
  assert.match(source, /content: twTitle/, 'twitter:title renders the resolved X title');
  assert.match(source, /content: twDescription/, 'twitter:description renders the resolved X description');
});

test('the homepage passes the stored X values into the head manager', () => {
  const source = read('client', 'src', 'pages', 'Home.jsx');
  assert.match(source, /twitterTitle=\{seo\?\.twitterTitle \|\| undefined\}/, 'X title comes from the settings document');
  assert.match(
    source,
    /twitterDescription=\{seo\?\.twitterDescription \|\| undefined\}/,
    'X description comes from the settings document'
  );
});

test('the head manager reads no settings itself (single source of truth)', () => {
  const source = read('client', 'src', 'components', 'Seo.jsx');
  assert.ok(!/firebase|firestore|getDoc/.test(source), 'Seo renders props only — fetching lives in exactly one place');
});

test('the static shell carries the homepage canonical', () => {
  const html = read('client', 'index.html');
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/crackershyderabad\.com\/" \/>/,
    'crawlers without JavaScript still see the canonical URL'
  );
});
