/**
 * Single source of truth for the shop's order-value floor.
 *
 * Cart (free-shipping/COD banner), Checkout (minimum gate + messages) and the
 * Express backend fallback all resolve to this number, so the three surfaces
 * can never disagree. The live Firestore `adminSettings/main` document still
 * wins wherever it is read — keep its `minimumOrderValue` at this same value.
 */
export const MINIMUM_ORDER_VALUE = 2500;
