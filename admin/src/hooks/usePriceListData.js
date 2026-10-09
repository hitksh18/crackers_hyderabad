import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection } from 'firebase/firestore';
import { db } from '../firebase';
import { cachedGetDocs, invalidateCache } from '../lib/firestoreCache';
import { mergeTradePricing } from '../lib/tradePricing';
import toast from '../utils/toast';

/**
 * Price List data: catalogue + wholesale pricing as independent streams.
 *
 * - Products and trade pricing load in parallel through the shared read
 *   cache, so returning from Products/Orders/Canvas reuses them instead of
 *   re-downloading two full collections.
 * - Separate loading flags: the table renders as soon as products land;
 *   price cells show placeholders until pricing arrives. A pricing failure
 *   never blanks the catalogue.
 * - refresh() bypasses the cache for both streams; filters/search/scroll
 *   live in the page component and are untouched by it.
 */
export function usePriceListData() {
  const [rawProducts, setRawProducts] = useState([]);
  const [pricingRows, setPricingRows] = useState(null);
  const [productsLoading, setProductsLoading] = useState(true);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [productsError, setProductsError] = useState(null);
  const [pricingError, setPricingError] = useState(null);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setProductsLoading(true);
    setPricingLoading(true);
    setProductsError(null);
    setPricingError(null);

    cachedGetDocs(collection(db, 'products'), 'products')
      .then((data) => {
        if (cancelled) return;
        setRawProducts(data);
        setProductsLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Error fetching products:', error);
        setProductsError(error);
        setProductsLoading(false);
      });

    cachedGetDocs(collection(db, 'productPricing'), 'productPricing')
      .then((data) => {
        if (cancelled) return;
        setPricingRows(data);
        setPricingLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Error fetching trade pricing:', error);
        setPricingError(error);
        setPricingLoading(false);
        toast.error('Trade pricing is unavailable — showing catalogue prices only.');
      });

    return () => {
      cancelled = true;
    };
  }, [epoch]);

  const products = useMemo(() => {
    if (!pricingRows) return rawProducts;
    return mergeTradePricing(
      rawProducts,
      new Map(pricingRows.map((p) => [p.id, p]))
    );
  }, [rawProducts, pricingRows]);

  const refresh = useCallback(() => {
    invalidateCache('coll:products');
    invalidateCache('coll:productPricing');
    setEpoch((e) => e + 1);
  }, []);

  return {
    products,
    productsLoading,
    pricingLoading,
    productsError,
    pricingError,
    refresh,
  };
}
