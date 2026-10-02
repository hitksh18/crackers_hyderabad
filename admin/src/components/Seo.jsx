import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export const SITE_URL = 'https://crackershyderabad.com';
export const SITE_IMAGE = `${SITE_URL}/images/website/crackerhyderabadlogo.png`;

const upsert = (selector, tag, attrs) => {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement(tag);
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
};

const Seo = ({
  title,
  description,
  canonical,
  image = SITE_IMAGE,
  noindex = false,
  jsonLd = null,
}) => {
  const { pathname } = useLocation();

  useEffect(() => {
    if (title) document.title = title;
    if (description) {
      upsert('meta[name="description"]', 'meta', { name: 'description', content: description });
    }

    const url = canonical
      ? canonical.startsWith('http')
        ? canonical
        : `${SITE_URL}${canonical}`
      : `${SITE_URL}${pathname}`;
    upsert('link[rel="canonical"]', 'link', { rel: 'canonical', href: url });

    const ogImage = image.startsWith('http') ? image : `${SITE_URL}${image}`;
    upsert('meta[property="og:title"]', 'meta', { property: 'og:title', content: title || document.title });
    if (description) {
      upsert('meta[property="og:description"]', 'meta', { property: 'og:description', content: description });
    }
    upsert('meta[property="og:url"]', 'meta', { property: 'og:url', content: url });
    upsert('meta[property="og:image"]', 'meta', { property: 'og:image', content: ogImage });
    upsert('meta[name="twitter:title"]', 'meta', { name: 'twitter:title', content: title || document.title });
    if (description) {
      upsert('meta[name="twitter:description"]', 'meta', { name: 'twitter:description', content: description });
    }
    upsert('meta[name="twitter:image"]', 'meta', { name: 'twitter:image', content: ogImage });
    upsert('meta[name="robots"]', 'meta', {
      name: 'robots',
      content: noindex ? 'noindex, nofollow' : 'index, follow',
    });
  }, [canonical, description, image, noindex, pathname, title]);

  return jsonLd ? (
    Array.isArray(jsonLd) ? (
      <>
        {jsonLd.map((block, index) => (
          <script
            key={block['@type'] || index}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
          />
        ))}
      </>
    ) : (
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    )
  ) : null;
};

export default Seo;