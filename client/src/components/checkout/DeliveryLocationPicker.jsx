import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Crosshair, MapPin, Loader2, AlertCircle, Check, Search } from 'lucide-react';
import { DEFAULT_CENTER, normaliseCoords, formatCoords, mapsUrlFor } from '../../utils/deliveryLocation';

/**
 * Pin the delivery doorstep on a map.
 *
 * Leaflet + OpenStreetMap rather than the Google Maps JS API: no key to
 * provision, no per-load billing, and nothing to break on the day a quota
 * lapses. Reverse geocoding is a separate concern and goes through our own
 * /api/geocode/reverse, which can be backed by Google if a key is configured.
 *
 * Leaflet is loaded on demand — the library and its stylesheet are ~150 kB
 * together, and only people who reach checkout should pay for that. Both come
 * from the installed package rather than a CDN, so there is no third-party
 * origin to allow in the CSP and no way for the JS and the CSS to end up on
 * different versions.
 *
 * Three ways to place the pin, because in practice each one fails for someone:
 * tapping the map, dragging the marker, and the browser's own geolocation —
 * which is the fastest when it works and denied outright often enough that it
 * can never be the only route.
 */

/* Zoomed in far enough that a doorstep is a distinguishable thing to aim at.
   Opening at city level invites a pin dropped on the right neighbourhood and
   the wrong building, which is exactly the failure this feature exists to fix. */
const PINNED_ZOOM = 18;
const CITY_ZOOM = 12;

/* Where a search result lands. Deliberately looser than PINNED_ZOOM: a result is
   the centre of a locality, and framing a whole block invites the customer to
   find their own roof rather than trust the spot the search chose. */
const SEARCH_ZOOM = 16;

/* Matches the server's floor, so a too-short query is refused here with a useful
   message instead of making a round trip to be told the same thing. */
const MIN_QUERY = 3;

/* A phone that reports a 2 km accuracy radius has answered with the tower it is
   attached to, not the handset's position. Placing a delivery pin there is worse
   than placing none, because it looks deliberate. */
const MAX_ACCURACY_M = 500;

let leafletPromise = null;

/** Load Leaflet once per page, whichever component asks first. */
const loadLeaflet = () => {
  if (leafletPromise) return leafletPromise;

  leafletPromise = (async () => {
    /* The stylesheet is not optional — without it Leaflet's tiles stack in a
       column instead of forming a map — so it is awaited alongside the library
       rather than fired off and hoped for. */
    const [module] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);

    /* Leaflet's default marker resolves its icon URLs relative to the CSS file,
       which the bundler rewrites and breaks. A divIcon sidesteps the whole
       problem and lets the pin carry the site's own colours. */
    return module.default || module;
  })();

  return leafletPromise;
};

const markerIcon = (L) =>
  L.divIcon({
    className: '',
    html:
      '<div style="position:relative;width:32px;height:42px;">' +
      '<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M16 0C7.163 0 0 7.163 0 16c0 11 16 26 16 26s16-15 16-26c0-8.837-7.163-16-16-16z" ' +
      'fill="#C33A14" stroke="#761713" stroke-width="1.5"/>' +
      '<circle cx="16" cy="16" r="6" fill="#FFF8EC"/>' +
      '</svg></div>',
    iconSize: [32, 42],
    iconAnchor: [16, 42],
  });

const DeliveryLocationPicker = ({ value, onChange, onResolved, disabled = false }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const leafletRef = useRef(null);
  /* Read inside async callbacks that must not re-subscribe when the pin moves. */
  const onChangeRef = useRef(onChange);
  const onResolvedRef = useRef(onResolved);
  const lookupSeq = useRef(0);
  const searchSeq = useRef(0);

  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [lookupState, setLookupState] = useState('idle'); // idle | loading | done | failed
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [searchNote, setSearchNote] = useState('');

  useEffect(() => {
    onChangeRef.current = onChange;
    onResolvedRef.current = onResolved;
  });

  /* Memoised on the coordinates rather than on `value`: normaliseCoords returns
     a fresh object every call, and the effect below must not re-run — and pan
     the map — on every unrelated render of the checkout form. */
  const pin = useMemo(() => normaliseCoords(value?.lat, value?.lng), [value?.lat, value?.lng]);

  /**
   * Ask the server what address sits at this point, and hand the answer up.
   *
   * Sequenced: dragging the marker fires several of these, and a slow earlier
   * reply must not overwrite the address for where the pin actually ended up.
   */
  const resolveAddress = useCallback(async (next) => {
    const seq = (lookupSeq.current += 1);
    setLookupState('loading');

    try {
      const response = await fetch(`/api/geocode/reverse?lat=${next.lat}&lng=${next.lng}`);
      const data = await response.json().catch(() => ({}));
      if (seq !== lookupSeq.current) return;

      if (response.ok && data.address) {
        setLookupState('done');
        onResolvedRef.current?.(data.address);
      } else {
        /* No address on file for this point is normal — a field, a new layout,
           an unnamed lane. The pin is still exactly where the driver must go. */
        setLookupState('failed');
      }
    } catch {
      if (seq === lookupSeq.current) setLookupState('failed');
    }
  }, []);

  /** Single path for every way the pin can move, so none can skip the lookup. */
  const placePin = useCallback(
    (lat, lng, { lookup = true } = {}) => {
      const next = normaliseCoords(lat, lng);
      if (!next) return;

      onChangeRef.current?.(next);
      if (lookup) resolveAddress(next);
    },
    [resolveAddress],
  );

  /* Build the map once. The pin is applied by a separate effect so that a value
     restored from sessionStorage lands on the same code path as a fresh tap. */
  useEffect(() => {
    let cancelled = false;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        leafletRef.current = L;

        const start = normaliseCoords(value?.lat, value?.lng);
        const map = L.map(containerRef.current, {
          center: start ? [start.lat, start.lng] : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
          zoom: start ? PINNED_ZOOM : CITY_ZOOM,
          /* Scroll-wheel zoom on a page this long hijacks the scroll on the way
             past. Ctrl+wheel and the +/- buttons still zoom. */
          scrollWheelZoom: false,
          tap: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        map.on('click', (event) => placePin(event.latlng.lat, event.latlng.lng));

        mapRef.current = map;
        setReady(true);

        /* Leaflet measures its container on creation. Inside a form that is
           still settling, that measurement can be stale and the tiles come out
           misaligned; one invalidate after layout fixes it. */
        requestAnimationFrame(() => map.invalidateSize());
      })
      .catch(() => {
        if (!cancelled) setMapError('The map could not be loaded. You can still type your address below.');
      });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    /* Mount only: `value` is read once for the initial centre, and re-running
       this would tear down the map on every pin change. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placePin]);

  /* Reflect the pin onto the map — including a pin restored from a previous
     session, which arrives after the map is built. */
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    if (!pin) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    if (markerRef.current) {
      markerRef.current.setLatLng([pin.lat, pin.lng]);
    } else {
      const marker = L.marker([pin.lat, pin.lng], {
        draggable: !disabled,
        icon: markerIcon(L),
        keyboard: true,
        /* Screen readers otherwise announce an unlabelled marker; a delivery
           pin needs to say what it is. */
        alt: 'Delivery location pin — drag to adjust',
      }).addTo(map);

      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng();
        placePin(lat, lng);
      });

      markerRef.current = marker;
    }

    /* Only pan when the pin has moved off-screen. Recentring on every drag
       fights the customer for control of the map. */
    if (!map.getBounds().contains([pin.lat, pin.lng])) {
      map.setView([pin.lat, pin.lng], Math.max(map.getZoom(), PINNED_ZOOM));
    }
  }, [pin, disabled, placePin]);

  useEffect(() => {
    if (markerRef.current) {
      if (disabled) markerRef.current.dragging?.disable();
      else markerRef.current.dragging?.enable();
    }
  }, [disabled]);

  /**
   * Find an area by name. Runs on submit only — never per keystroke — so the
   * shared Nominatim courtesy limit is not spent on half-typed words.
   */
  const runSearch = async () => {
    const term = query.trim();

    if (term.length < MIN_QUERY) {
      setResults([]);
      setSearchNote(`Type at least ${MIN_QUERY} characters — an area, a landmark or a PIN code.`);
      return;
    }

    const seq = (searchSeq.current += 1);
    setSearching(true);
    setSearchNote('');

    try {
      const response = await fetch(`/api/geocode/search?q=${encodeURIComponent(term)}`);
      const data = await response.json().catch(() => ({}));
      if (seq !== searchSeq.current) return;

      const found = Array.isArray(data.results) ? data.results : [];
      setResults(found);
      if (!found.length) {
        setSearchNote('No matches. Try a nearby landmark, or pan the map by hand.');
      }
    } catch {
      if (seq === searchSeq.current) {
        setResults([]);
        setSearchNote('Search is unavailable right now. Pan the map to find your area.');
      }
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  };

  /* Moves the map and stops there. A result is a locality centre, not a door —
     pinning it automatically would record precise-looking coordinates for the
     middle of somebody else's block, which is the exact failure this feature
     exists to prevent. */
  const goToResult = (result) => {
    setResults([]);
    setSearchNote('Map moved here — now tap your exact door.');
    mapRef.current?.setView([result.lat, result.lng], SEARCH_ZOOM);
  };

  const useMyLocation = () => {    setGeoError('');

    if (!navigator.geolocation) {
      setGeoError('This browser cannot share your location. Tap the map to place the pin instead.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const { latitude, longitude, accuracy } = position.coords;

        if (Number.isFinite(accuracy) && accuracy > MAX_ACCURACY_M) {
          /* Still placed — it is a reasonable starting point to drag from — but
             the customer is told, because an inaccurate pin they trust is worse
             than no pin at all. */
          setGeoError(
            `Your location is only accurate to about ${Math.round(accuracy)} m. Please drag the pin to your exact door.`,
          );
        }

        placePin(latitude, longitude);
        mapRef.current?.setView([latitude, longitude], PINNED_ZOOM);
      },
      (error) => {
        setLocating(false);
        /* Every branch ends the same way: the map is still there. Denied
           permission must never be a dead end. */
        const messages = {
          1: 'Location permission was denied. Tap the map to place your pin instead.',
          2: 'Your location is unavailable right now. Tap the map to place your pin instead.',
          3: 'Finding your location took too long. Tap the map to place your pin instead.',
        };
        setGeoError(messages[error.code] || 'Could not get your location. Tap the map to place your pin.');
      },
      /* No cached fix: someone who has moved since this morning would otherwise
         get this morning's position pinned as their doorstep. */
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  const clearPin = () => {
    lookupSeq.current += 1; // Abandon any lookup still in flight.
    setLookupState('idle');
    setGeoError('');
    onChangeRef.current?.(null);
  };

  return (
    <div className="min-w-0">
      {/* Search first: on a phone, panning a city-wide map to your own roof is
          the slowest possible way to start. Not a <form> — this renders inside
          the checkout form, and a nested one is invalid HTML. */}
      <div className="min-w-0">
        <label htmlFor="pin-search" className="sr-only">
          Search for your area, landmark or PIN code
        </label>
        <div className="flex min-w-0 gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: 'var(--text-subtle)' }}
              strokeWidth={2.2}
              aria-hidden="true"
            />
            <input
              id="pin-search"
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchNote('');
              }}
              /* Enter searches. Without this it would submit the checkout form
                 and place the order from a half-filled address. */
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runSearch();
                }
              }}
              disabled={disabled}
              placeholder="Search area, landmark or PIN code"
              autoComplete="off"
              className="input-premium min-h-[44px] w-full pl-9"
            />
          </div>
          <button
            type="button"
            onClick={runSearch}
            disabled={disabled || searching}
            aria-busy={searching}
            className="btn-outline min-h-[44px] shrink-0 px-4 text-sm"
          >
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            )}
            <span className="sr-only sm:not-sr-only">Search</span>
          </button>
        </div>

        {results.length > 0 && (
          <ul
            className="mt-2 overflow-hidden"
            style={{
              border: '1px solid var(--hairline-strong)',
              borderRadius: 'var(--r-md)',
              background: 'var(--surface-card)',
            }}
          >
            {results.map((result) => (
              <li key={`${result.lat},${result.lng}`} className="border-b last:border-b-0" style={{ borderColor: 'var(--hairline)' }}>
                <button
                  type="button"
                  onClick={() => goToResult(result)}
                  className="block w-full px-3 py-2.5 text-left text-sm"
                  style={{ color: 'var(--text-body)' }}
                >
                  {result.label}
                </button>
              </li>
            ))}
          </ul>
        )}

        {searchNote && (
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }} aria-live="polite">
            {searchNote}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={disabled || locating || !ready}
          aria-busy={locating}
          className="btn-outline min-h-[44px] text-sm"
        >
          {locating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Crosshair className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          )}
          {locating ? 'Finding you…' : 'Use My Current Location'}
        </button>

        {pin && (
          <button
            type="button"
            onClick={clearPin}
            disabled={disabled}
            className="min-h-[44px] px-3 text-sm font-semibold underline underline-offset-4"
            style={{ color: 'var(--text-muted)' }}
          >
            Remove pin
          </button>
        )}
      </div>

      <div
        className="dlp-map relative mt-3 overflow-hidden"
        style={{
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--hairline-strong)',
        }}
      >
        <div
          ref={containerRef}
          className="h-full w-full"
          style={{ background: 'var(--surface-sunken)' }}
          role="application"
          aria-label="Delivery location map. Tap to place your pin, or drag the pin to adjust it."
        />

        {!ready && !mapError && (
          <div
            className="absolute inset-0 flex items-center justify-center gap-2 text-sm"
            style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading map…
          </div>
        )}

        {mapError && (
          <div
            className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm"
            style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}
          >
            {mapError}
          </div>
        )}
      </div>

      {/* Status. aria-live so the pin's arrival is announced, not just drawn. */}
      <div className="mt-3 min-w-0" aria-live="polite">
        {pin ? (
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3"
            style={{
              background: 'rgba(44, 122, 83, 0.10)',
              border: '1px solid rgba(44, 122, 83, 0.32)',
              borderRadius: 'var(--r-md)',
            }}
          >
            <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--leaf-600)' }}>
              <MapPin className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              Location pinned
            </span>
            <span className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
              {formatCoords(pin)}
            </span>
            <a
              href={mapsUrlFor(pin)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold underline underline-offset-2"
              style={{ color: 'var(--ember-600)' }}
            >
              Preview on Google Maps
            </a>

            {lookupState === 'loading' && (
              <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Looking up the address…
              </span>
            )}
            {lookupState === 'done' && (
              <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--leaf-600)' }}>
                <Check className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
                Address filled in below — please check it
              </span>
            )}
            {lookupState === 'failed' && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                No address found here — please type it below. Your pin is saved.
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Tap the map to drop a pin at your door, or use the button above.
          </p>
        )}

        {geoError && (
          <p
            className="mt-2 flex items-start gap-1.5 text-xs font-semibold"
            style={{ color: 'var(--ember-600)' }}
          >
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden="true" />
            <span>{geoError}</span>
          </p>
        )}
      </div>
    </div>
  );
};

export default DeliveryLocationPicker;
