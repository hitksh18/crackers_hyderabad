import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Wholesale / counter pricing.
 *
 * These figures live in `productPricing`, not on the product document, because
 * `products` is world-readable. Keeping trade margins there meant the only
 * thing protecting them was a client-side route guard — which does nothing
 * against a direct Firestore read with the public web config.
 *
 * Reads here require a staff role; the rules enforce it. Callers are all staff
 * screens (Billing, Price List, product management).
 */

export const TRADE_FIELDS = ['offlineMRP', 'offlineDiscountPrice', 'offlinePrice'];

const toNumberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Pull only the trade fields out of a mixed form/product object. */
export const pickTradeFields = (source = {}) => ({
  offlineMRP: toNumberOrNull(source.offlineMRP),
  offlineDiscountPrice: toNumberOrNull(source.offlineDiscountPrice),
  offlinePrice: toNumberOrNull(source.offlinePrice),
});

/** Everything except the trade fields — what is safe to store on `products`. */
export const stripTradeFields = (source = {}) => {
  const clone = { ...source };
  for (const field of TRADE_FIELDS) delete clone[field];
  return clone;
};

/**
 * Merge into a product UPDATE to actively remove trade fields from a document
 * that still carries them.
 *
 * Omitting the keys is not enough: an update only writes what it names, so a
 * product written before the migration keeps its public copy of the trade price
 * forever, and the two copies then drift apart on every edit. Any writer that
 * touches `products` should fold this in.
 */
export const TRADE_FIELD_DELETIONS = Object.freeze(
  TRADE_FIELDS.reduce((acc, field) => ({ ...acc, [field]: deleteField() }), {})
);

/** All trade pricing, as a Map keyed by product id. Staff only. */
export const fetchTradePricingMap = async () => {
  const snapshot = await getDocs(collection(db, 'productPricing'));
  const map = new Map();
  snapshot.docs.forEach((d) => map.set(d.id, d.data()));
  return map;
};

/** Trade pricing for one product, or null. Staff only. */
export const fetchTradePricing = async (productId) => {
  if (!productId) return null;
  const snap = await getDoc(doc(db, 'productPricing', productId));
  return snap.exists() ? snap.data() : null;
};

/**
 * Attach trade pricing to products for display on staff screens.
 * Products with no pricing document simply come back without those fields.
 *
 * Only the three known fields are copied across. Spreading the whole pricing
 * document would let any stray key written into it — `name`, `category`,
 * `onlinePrice` — silently shadow the catalogue value on every staff screen.
 */
export const mergeTradePricing = (products, pricingMap) =>
  products.map((product) => {
    const pricing = pricingMap?.get(product.id);
    if (!pricing) return product;

    const merged = { ...product };
    for (const field of TRADE_FIELDS) {
      if (field in pricing) merged[field] = pricing[field];
    }
    return merged;
  });

export const saveTradePricing = async (productId, source) => {
  if (!productId) return;
  await setDoc(doc(db, 'productPricing', productId), pickTradeFields(source), { merge: true });
};

export const deleteTradePricing = async (productId) => {
  if (!productId) return;
  try {
    await deleteDoc(doc(db, 'productPricing', productId));
  } catch (error) {
    // A product may never have had trade pricing; losing this is not fatal.
    console.error('Could not remove trade pricing:', error);
  }
};
