import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Sparkles } from 'lucide-react';
import { readSiteSettings, announcementTexts } from '../lib/siteSettings';

const DEFAULT_MESSAGES = [
  'Free Delivery above Rs. 2,000',
  '100% Licensed Products',
  'Secure Payments',
  'Festival Offers Live',
  'Same-Day Delivery in Hyderabad',
];

/* Rangoli band — a single low-opacity ornament for the strip. Decorative. */
const RANGOLI_BAND =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='36' viewBox='0 0 72 36'%3E%3Cg fill='none' stroke='%23D2A64F' stroke-opacity='0.30' stroke-width='1'%3E%3Cpath d='M36 5 L43 18 L36 31 L29 18 Z'/%3E%3Ccircle cx='0' cy='18' r='5'/%3E%3Ccircle cx='72' cy='18' r='5'/%3E%3Cpath d='M9 18 H24 M48 18 H63'/%3E%3C/g%3E%3C/svg%3E\")";

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Repeat an array N times. */
function repeat(arr, n) {
  const result = [];
  for (let i = 0; i < n; i++) result.push(...arr);
  return result;
}

/* Measure the track and pick enough copies + duration for a seamless loop.
   Shared by the storefront bar and the canvas live preview. */
function useMarqueeCopies(messageCount) {
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const [copies, setCopies] = useState(4);
  const [trackDuration, setTrackDuration] = useState(30);

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track || messageCount === 0) return;

    const viewportWidth = viewport.offsetWidth;

    /* First, figure out how wide a single message-set is using the minimum copies
       we already rendered. We temporarily set the track to 1 copy to measure. */
    const prevCopies = track.children.length / messageCount;

    /* Measure width of one copy by temporarily rendering just 2 sets. */
    const oneSetWidth = (track.scrollWidth / Math.max(prevCopies, 1));

    /* We need the total track to be at least 2× the viewport so that -50%
       always covers the full viewport. */
    const neededCopies = Math.max(4, Math.ceil((viewportWidth * 2.2) / Math.max(oneSetWidth, 1)));

    if (neededCopies !== prevCopies) {
      setCopies(neededCopies);
    }

    /* Set animation duration proportional to content width so perceived
       scroll speed (~40px/s) is consistent regardless of content length. */
    const speed = 40; /* px per second */
    const totalWidth = oneSetWidth * neededCopies;
    setTrackDuration(totalWidth / (speed * 2)); /* /2 because we animate to -50% */
  }, [messageCount]);

  useEffect(() => {
    /* Small delay to let the track render so measurement works. */
    const raf = requestAnimationFrame(() => {
      measure();
    });
    return () => cancelAnimationFrame(raf);
  }, [measure, messageCount]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const ro = new ResizeObserver(() => measure());
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [measure]);

  return { viewportRef, trackRef, copies, trackDuration };
}

/* The scrolling strip itself, shared by the storefront and the canvas preview. */
const BannerStrip = ({ messages, copies, viewportRef, trackRef, trackDuration }) => {
  const track = repeat(messages, copies);

  return (
    <div
      className="relative isolate overflow-hidden w-full max-w-full"
      style={{
        background:
          'linear-gradient(96deg, var(--maroon-900) 0%, var(--maroon-700) 36%, var(--maroon-600) 64%, var(--ember-600) 100%)',
        fontFamily: 'var(--font-body)',
        maxWidth: '100%',
        overflow: 'clip',
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: RANGOLI_BAND, backgroundSize: '72px 36px', opacity: 0.45 }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(58% 150% at 14% 0%, rgba(247, 174, 44, 0.24), transparent 62%)' }}
      />

      <div className="relative flex min-h-9 w-full max-w-full items-center overflow-hidden py-1.5 sm:py-2" aria-hidden="true" style={{ maxWidth: '100%', overflow: 'clip' }}>
        <div ref={viewportRef} className="marquee-viewport w-full max-w-full overflow-hidden" style={{ maxWidth: '100%', overflow: 'clip' }}>
          <div
            ref={trackRef}
            className="marquee-track flex w-max items-center"
            style={{
              animationDuration: `${trackDuration}s`,
              animationPlayState: prefersReducedMotion ? 'paused' : undefined,
            }}
          >
            {track.map((message, index) => (
              <span
                key={index}
                className="flex shrink-0 items-center gap-2.5 px-6 text-xs font-semibold tracking-[0.015em] sm:text-sm"
                style={{ color: '#FFFFFF' }}
              >
                <span
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: 'rgba(210, 166, 79, 0.18)',
                    border: '1px solid rgba(210, 166, 79, 0.45)',
                  }}
                >
                  <Sparkles
                    className="h-3 w-3"
                    strokeWidth={2.4}
                    style={{ color: 'var(--gold-400)' }}
                  />
                </span>
                <span className="whitespace-nowrap">{message}</span>
                <span
                  aria-hidden="true"
                  className="ml-3 h-1 w-1 shrink-0 rotate-45"
                  style={{ background: 'var(--gold-400)', opacity: 0.85 }}
                />
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Gold hairline seals the strip against the navbar. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(210, 166, 79, 0.75), transparent)' }}
      />
    </div>
  );
};

/* Canvas live preview: the real strip driven by draft state, no Firestore. */
export const TopBannerPreview = ({ messages, enabled = true }) => {
  const list = Array.isArray(messages) ? messages.filter(Boolean) : [];
  const { viewportRef, trackRef, copies, trackDuration } = useMarqueeCopies(list.length);
  if (enabled === false) return null;
  if (list.length === 0) return null;
  return (
    <BannerStrip
      messages={list}
      copies={copies}
      viewportRef={viewportRef}
      trackRef={trackRef}
      trackDuration={trackDuration}
    />
  );
};

/* `preview` ({ messages: string[], enabled }) renders the canvas live preview
   without touching Firestore. Otherwise the saved configuration is read. */
const TopBanner = ({ preview } = {}) => {
  const [bannerSettings, setBannerSettings] = useState({
    topBannerEnabled: true,
    topBannerMessages: [],
    topBannerText: 'Free Delivery above Rs. 2,000',
    promoMessage: 'SPECIAL FESTIVE OFFERS!',
  });

  useEffect(() => {
    if (preview) return undefined;
    const fetchBannerSettings = async () => {
      try {
        // New centralized siteSettings takes precedence
        const site = await readSiteSettings();
        if (site.announcementBar && Array.isArray(site.announcementBar.messages) && site.announcementBar.messages.length > 0) {
          setBannerSettings(prev => ({
            ...prev,
            topBannerEnabled: site.announcementBar.enabled !== false,
            topBannerMessages: announcementTexts(site.announcementBar).slice(0, 5),
          }));
          return;
        }
        const bannerDoc = await getDoc(doc(db, 'bannerSettings', 'main'));
        if (bannerDoc.exists()) {
          setBannerSettings(prev => ({ ...prev, ...bannerDoc.data() }));
        }
      } catch (error) {
        console.error('Error fetching banner settings:', error);
      }
    };

    fetchBannerSettings();
  }, [preview]);

  if (preview) {
    return <TopBannerPreview messages={preview.messages} enabled={preview.enabled} />;
  }

  const stored = Array.isArray(bannerSettings.topBannerMessages)
    ? bannerSettings.topBannerMessages
    : [];
  const messages = stored.length > 0
    ? stored
    : [bannerSettings.topBannerText, bannerSettings.promoMessage].filter(Boolean);

  return (
    <TopBannerBody
      enabled={bannerSettings.topBannerEnabled}
      messages={messages}
    />
  );
};

const TopBannerBody = ({ enabled, messages }) => {
  const { viewportRef, trackRef, copies, trackDuration } = useMarqueeCopies(messages.length);
  const bannerRef = useRef(null);

  /* Publish measured height for hero viewport calc (header stack). */
  useEffect(() => {
    const el = bannerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      document.documentElement.style.setProperty('--top-banner-h', '0px');
      return undefined;
    }
    const root = document.documentElement;
    const publish = () => {
      const h = enabled && messages.length > 0 ? Math.round(el.getBoundingClientRect().height) : 0;
      root.style.setProperty('--top-banner-h', `${h}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty('--top-banner-h', '0px');
    };
  }, [enabled, messages.length]);

  if (!enabled) {
    // Ensure header variable cleared when disabled
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--top-banner-h', '0px');
    }
    return null;
  }
  if (messages.length === 0) {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--top-banner-h', '0px');
    }
    return null;
  }

  return (
    <div ref={bannerRef}>
      <BannerStrip
        messages={messages}
        copies={copies}
        viewportRef={viewportRef}
        trackRef={trackRef}
        trackDuration={trackDuration}
      />
    </div>
  );
};

export default TopBanner;
