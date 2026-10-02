/**
 * The pinned delivery location: one shape, one set of URL builders.
 *
 * Checkout writes the pin, the API validates and stores it, and the admin order
 * page and the invoice PDF read it back. All four need to agree on the number
 * of decimals and on what a "navigate here" link looks like, so none of that
 * is written twice.
 */

/* Six decimals is ~0.11 m at the equator — finer than any consumer GPS fix, and
   short enough to keep the QR code inside a low symbol version. Going further
   would only make the printed modules smaller for no navigational gain. */
const PRECISION = 6;

/** Hyderabad. Where the map opens before the customer has pinned anything. */
export const DEFAULT_CENTER = { lat: 17.385044, lng: 78.486671 };

const round = (n) => Number(Number(n).toFixed(PRECISION));

/**
 * Accept a coordinate pair only if it is a real point on Earth.
 *
 * Returns null rather than throwing: every caller here is on a path where a
 * bad pin must degrade to "no pin", never to a broken checkout.
 */
export const normaliseCoords = (lat, lng) => {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  /* Exactly 0,0 is in the Gulf of Guinea. Nobody is ordering crackers from
     there; it is what a client sends when its own coordinates were empty. */
  if (latitude === 0 && longitude === 0) return null;

  return { lat: round(latitude), lng: round(longitude) };
};

/** The pin as stored on an order, or null when the order has none. */
export const pinOf = (order) => {
  const location = order?.deliveryLocation;
  if (!location) return null;
  return normaliseCoords(location.lat, location.lng);
};

/** Human-readable coordinates, for staff to sanity-check against the address. */
export const formatCoords = (pin) =>
  pin ? `${pin.lat.toFixed(PRECISION)}, ${pin.lng.toFixed(PRECISION)}` : '';

/** A plain map link — drops a pin, does not start navigating. */
export const mapsUrlFor = (pin) =>
  pin ? `https://www.google.com/maps?q=${pin.lat},${pin.lng}` : '';

/**
 * The link the QR code carries.
 *
 * `maps/dir/?api=1&destination=` with `dir_action=navigate` is what actually
 * opens turn-by-turn navigation in the Google Maps app; a plain `?q=` link only
 * shows the point and leaves the driver to press Directions themselves. Travel
 * mode is left off deliberately — driving is the default, and the two-wheelers
 * most deliveries go out on are better served by whatever the driver has set.
 */
export const navUrlFor = (pin) =>
  pin ? `https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}&dir_action=navigate` : '';

/** Label printed beside the QR code, and used as its accessible name. */
export const QR_LABEL = 'Customer Delivery Location — Scan to Navigate';
