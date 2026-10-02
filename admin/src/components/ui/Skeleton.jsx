/**
 * Branded loading placeholders.
 *
 * Every skeleton reserves the same box the real content will occupy so nothing
 * shifts when data lands. Screen readers get a single polite "loading" message
 * per group rather than a stream of empty boxes.
 */

export const Skeleton = ({ className = '', style, rounded = 'var(--r-md)' }) => (
  <span
    aria-hidden="true"
    className={`skeleton block ${className}`}
    style={{ borderRadius: rounded, ...style }}
  />
);

export const SkeletonText = ({ lines = 3, className = '' }) => (
  <span aria-hidden="true" className={`block space-y-2 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        className="h-3.5"
        style={{ width: i === lines - 1 ? '62%' : '100%' }}
      />
    ))}
  </span>
);

export const ProductCardSkeleton = ({ compact = false }) => (
  <div
    aria-hidden="true"
    className="card-premium overflow-hidden"
    style={{ borderRadius: 'var(--r-lg)' }}
  >
    {compact ? (
      <>
        <Skeleton className="aspect-[8/5] w-full" rounded="var(--r-lg) var(--r-lg) 0 0" />
        <div className="space-y-2.5 p-3">
          <Skeleton className="h-2 w-1/3" />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-9 w-full" rounded="var(--r-md)" />
        </div>
      </>
    ) : (
      <>
        <Skeleton className="h-60 w-full" rounded="var(--r-lg) var(--r-lg) 0 0" />
        <div className="space-y-3 p-4 md:p-5">
          <Skeleton className="h-2.5 w-1/3" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-11 w-full" rounded="var(--r-md)" />
        </div>
      </>
    )}
  </div>
);

export const ProductGridSkeleton = ({ count = 8, label = 'Loading products' }) => (
  <div
    role="status"
    aria-live="polite"
    aria-busy="true"
    className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
  >
    <span className="sr-only">{label}</span>
    {Array.from({ length: count }).map((_, i) => (
      <ProductCardSkeleton key={i} />
    ))}
  </div>
);

export const ProductDetailSkeleton = () => (
  <div
    role="status"
    aria-live="polite"
    aria-busy="true"
    className="grid gap-10 lg:grid-cols-2"
  >
    <span className="sr-only">Loading product</span>
    <Skeleton className="aspect-square w-full" rounded="var(--r-xl)" />
    <div className="space-y-5">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-10 w-4/5" />
      <Skeleton className="h-7 w-40" />
      <SkeletonText lines={4} />
      <Skeleton className="h-12 w-full" rounded="var(--r-md)" />
    </div>
  </div>
);

export const TableSkeleton = ({ rows = 6, cols = 5, label = 'Loading records' }) => (
  <div role="status" aria-live="polite" aria-busy="true" className="space-y-2">
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((__, c) => (
          <Skeleton key={c} className="h-10" />
        ))}
      </div>
    ))}
  </div>
);

export const StatCardSkeleton = ({ count = 4 }) => (
  <div
    role="status"
    aria-live="polite"
    aria-busy="true"
    className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
  >
    <span className="sr-only">Loading metrics</span>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="card-premium space-y-3 p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-2.5 w-20" />
      </div>
    ))}
  </div>
);

export default Skeleton;
