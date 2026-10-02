# Security notes

Read this before deploying. Two of the changes below alter how the app is
deployed, and the rules files do nothing until they are pushed.

---

## Deploy checklist

Nothing here takes effect until these run, and **the order matters**.

### 1. Ship the code first, then the rules — back to back

Push to `main` and let the Hostinger workflow finish, then immediately:

```bash
firebase deploy --only firestore:rules,storage --project standard-crackers-store
```

Code first, because the new rules make `trackingCodes` staff-only and the
currently-live bundle resolves tracking codes by reading that collection from the
browser. Rules first would break tracking for every customer until the new
bundle lands — the `/api/orders/track` endpoint that replaces the direct read
ships with the code.

Do not leave a gap between the two. The new code issues bare sequential codes
(`CH1042`), and until the rules land, public `trackingCodes.get` is still allowed
— which turns a guessable code into an enumeration oracle over customer names,
addresses and phone numbers.

### 2. Then move the wholesale pricing

All 99 products currently carry `offlineMRP` / `offlineDiscountPrice` on the
**world-readable** `products` document. This moves them into the staff-only
`productPricing` collection and strips them from the public copy.

```bash
node scripts/migrate-trade-pricing.js           # dry run, prints what it will do
node scripts/migrate-trade-pricing.js --commit  # apply
```

> **Do not run `--commit` before deploying the rules.** The currently deployed
> rules have no `productPricing` match, so Firestore default-denies it. Moving
> the data first would leave Billing and the price list with no trade prices at
> the counter until the rules catch up.

Until the migration runs, the app works either way — the staff screens read the
new collection and fall back to whatever is still on the product — but the
public exposure stays open, so run it soon after deploying.

### 3. Set the environment on the API host

| Variable | Why |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Preferred over the on-disk `service-account.json`, which is now gitignored. |
| `ALLOWED_ORIGINS` | Comma-separated production origins. **The API rejects every origin not on this list**, and only `localhost:5000` / `localhost:3000` are allowed by default. Set this or the deployed site cannot call the API. |
| `EMAIL_HOST` `EMAIL_USER` `EMAIL_PASS` | Order emails and admin password resets. |
| `MSG91_AUTH_KEY` `MSG91_SENDER_ID` `MSG91_ROUTE` | Order SMS. |

**Rotate the Firebase service-account key.** It sat in plaintext in
`service-account.json` and in `attached_assets/`. Both are gitignored now, but
the key itself should be considered exposed.

---

## The API is now required for checkout

Orders used to be written straight from the browser to Firestore. They are now
created by `POST /api/orders`, and `orders.create` is `false` in the rules.

This is deliberate. The browser previously chose its own prices — the rule only
checked that `total` was *a number*, so a customer could buy a ₹10,000 order for
₹1. It also meant anyone could plant an order document, which the notification
endpoints would then mail out under the shop's identity.

The trade-off: **if the API is down, checkout is down.** Previously checkout
survived an API outage because it wrote directly to Firestore. Monitor the API
process accordingly.

---

## How the model works

### Order identifiers are capabilities

`orders.get` is public, because a guest who checked out without an account must
still be able to track their delivery. That is only safe while the identifier
cannot be guessed: order IDs are 20-character Firestore auto-IDs.

Tracking codes are **not** unguessable. They are plain running numbers — `CH01`,
`CH02`, … — because the shop reads them aloud over the phone and prints them on
invoices. A second factor carries the weight instead:

- **`POST /api/orders/track` is the only public way to turn a code into an
  order.** It requires the last 4 digits of the phone number on that order.
- **`trackingCodes.get` is staff-only.** This is what makes the check
  unavoidable. If the browser could resolve a code to an order ID, an attacker
   would walk `CH01, CH02, …`, collect the unguessable auto-IDs, and read the
  orders straight through the public `orders.get` — never touching the phone
  check. The endpoint reads with the Admin SDK, so rules do not restrict it.
- **Staff skip the digits.** A verified Firebase token with a staff role already
  proves who they are, so counter staff can look up `CH1042` from a slip alone.
- Legacy `CH1042-K7QMX3` codes still work without digits — the six random
  characters are the same defence the phone check replaces, so nothing needed
  migrating.

Four digits is only 10,000 guesses, which an IP-keyed limiter does not stop on
its own — an attacker rotates addresses. So failures are also counted **per
tracking code**: 5 wrong attempts locks that code for 15 minutes. A correct
answer clears the counter. The cost is that someone can lock a stranger out of
their own tracking page for the window; that trade is deliberate, because
tracking has an obvious fallback (phone the shop) and leaked PII does not.

"No such code", "wrong digits" and "locked out" all return the **same** 404. Any
difference between them is an oracle confirming which order numbers exist, and
running numbers are trivial to enumerate.

**Never make `trackingCodes` readable, and never widen `orders.get`.** Either one
alone re-opens the enumeration hole that leaked every customer's name, phone,
email and address.

**Never put an order ID or tracking code in a collection that can be listed.**
This is subtle and it already happened once: `/feedback` granted
`allow read: if true`, which in Firestore covers `list` as well as `get`, and the
documents stored `orderId` and `orderCode`. Anyone could enumerate the collection
and harvest every order. Feedback is now keyed *by* the order ID and stores
neither value.

### Who may do what

| Data | Read | Write |
|---|---|---|
| Products, site settings | anyone | admin |
| Orders — list | staff, or your own (by `userId`, or verified email) | — |
| Orders — get | anyone with the ID | API only (`create: false`) |
| Orders — update | staff; owner may only cancel, only from a cancellable state, only the cancellation fields | |
| Users, roles | self or staff; list is admin-only | self (own profile), admin |
| Invoices (Storage) | staff | staff |
| Feedback | get by order ID; list is staff-only | one per order, capped, no identifiers |

Email is accepted as proof of identity **only when verified** — self-service
signup accepts any address, so an unverified claim would otherwise let anyone
read the orders of a customer whose address they typed.

### API authentication

Every `/api/admin/*` route requires a verified Firebase ID token
(`verifyIdToken(..., true)` so revoked sessions stop working) plus an `admin`
role resolved server-side. Client route guards decide what a user *sees*; these
decide what they can *do*.

Notification endpoints accept either a staff token or the **single-use notify
token** returned once by `POST /api/orders`. Document freshness is not
authentication — a planted or replayed order must not be able to make the shop
send anything.

---

## Verifying the rules

Rules are declarative and easy to get subtly wrong, especially `list`, which
Firestore evaluates against the *query's constraints* rather than against
documents. `tests/firestore-rules.test.js` encodes the model above.

Running it needs Java (the Firebase emulator depends on it):

```bash
npm install --save-dev @firebase/rules-unit-testing firebase-tools vitest
npx firebase emulators:exec --only firestore "npx vitest run tests/"
```

---

## Known and accepted

- **6 moderate npm advisories** in the root, all in one transitive chain
  (`firebase-admin` → `google-gax` → `uuid`). `firebase-admin` is already on the
  latest 14.2.0; npm's only suggested "fix" is a downgrade to v10, which is
  worse. Recheck when upstream publishes.
- **No Firebase App Check.** `feedback.create` is the only remaining
  unauthenticated write and it is tightly bounded (one per order, rating 1–5,
  1000-character comment, no identifiers, cannot be overwritten), but App Check
  would remove the residual automation surface. Enabling it needs a reCAPTCHA
  Enterprise site key from the Firebase console.
- **The rules have never been executed.** They are validated by reading and by
  tracing every query in the codebase against them, but the emulator needs Java,
  which was not available. Run `tests/firestore-rules.test.js` before trusting
  them in production.
- **Trade pricing is still on the public product documents until you run the
  migration** (step 2 of the deploy checklist). The code is ready on both sides;
  the data has not moved.

---

## If you change the access model

Keep these three in step — they describe the same rules and drift silently:

1. `firestore.rules` / `storage.rules`
2. `ORDERS_ROLES` and `PRICE_LIST_ROLES` in `client/src/App.jsx`
3. The nav predicates in `Navbar.jsx` and `MobileMenu.jsx`

A link shown to a role the guard rejects is how staff end up bouncing off their
own tools.
