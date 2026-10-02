import { Phone, Mail, MapPin, Send, Headset } from 'lucide-react';
import { FaFacebookF, FaInstagram, FaYoutube } from 'react-icons/fa';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import toast from '../utils/toast';
import ScrollReveal from './ui/ScrollReveal';
import { categoryDefs } from './home/homeData';
import { readSiteSettings } from '../lib/siteSettings';

const quickLinks = [
  { to: '/', label: 'Home' },
  { to: '/products', label: 'Products' },
  { to: '/my-orders', label: 'My Orders' },
  { to: '/track-order', label: 'Track Order' }
];

/* The footer shows a shortlist of categories, but their names and product-query
   values come from categoryDefs — the single source of truth shared with the
   homepage — so a rename there never leaves the footer pointing at a dead
   filter. Order follows this list, not categoryDefs. */
const FOOTER_CATEGORY_SLUGS = [
  'rockets',
  'sparkles',
  'gift-boxes',
  'flower-pots',
  'bombs',
  'fancy-fireworks'
];

const categories = FOOTER_CATEGORY_SLUGS.map(slug =>
  categoryDefs.find(cat => cat.slug === slug)
).filter(Boolean);

const BOTTOM_BORDER = '1px solid rgba(210, 166, 79, 0.12)';

/* Column heading — gold small-caps. */
const FooterHeading = ({ children }) => (
  <h3 className="label-caps mb-2 sm:mb-3" style={{ color: 'var(--gold-400)' }}>
    {children}
  </h3>
);

const FooterLink = ({ to, children }) => (
  <Link
    to={to}
    className="py-1 text-[13px] font-medium transition-colors hover:text-[color:var(--saffron-400)] sm:py-1.5"
    style={{ color: '#B7AEA2', fontFamily: 'var(--font-body)' }}
  >
    {children}
  </Link>
);

const ContactRow = ({ href, external, icon: Icon, children }) => {
  const body = (
    <>
      <span
        aria-hidden="true"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full sm:h-7 sm:w-7"
        style={{ background: 'rgba(195, 58, 20, 0.16)', border: '1px solid rgba(210, 166, 79, 0.22)' }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color: 'var(--ember-400)' }} strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1 break-words text-[13px] font-medium">{children}</span>
    </>
  );

  const shared = 'flex items-center gap-2.5 py-1 sm:gap-3 sm:py-1.5';
  const style = { fontFamily: 'var(--font-body)' };

  if (!href) {
    return (
      <div className={shared} style={{ ...style, color: '#B7AEA2' }}>
        {body}
      </div>
    );
  }

  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`${shared} transition-colors hover:text-[color:var(--saffron-400)]`}
      style={{ ...style, color: '#B7AEA2' }}
    >
      {body}
    </a>
  );
};

/* `preview` ({ phone, email, address, logoUrl, instagram }) overrides the saved
   settings so the homepage canvas can show unsaved edits live. */
const Footer = ({ preview } = {}) => {
  const currentYear = new Date().getFullYear();
  const [footerSettings, setFooterSettings] = useState({
    phone: '+91 98765 43210',
    email: 'info@crackershyderabad.com',
    address: 'Hyderabad, Telangana'
  });
  const [siteSettings, setSiteSettings] = useState(null);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterError, setNewsletterError] = useState('');

  useEffect(() => {
    const fetchFooterSettings = async () => {
      try {
        const docRef = doc(db, 'footerSettings', 'main');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setFooterSettings(prev => ({ ...prev, ...docSnap.data() }));
        }
      } catch (error) {
        console.error('Error fetching footer settings:', error);
      }
    };
    fetchFooterSettings();
  }, []);

  useEffect(() => {
    readSiteSettings().then(s => {
      setSiteSettings(s);
      // Use centralized contact email if available
      if (s.contact?.email) {
        setFooterSettings(prev => ({ ...prev, email: s.contact.email }));
      }
      // Update favicon if configured
      if (s.branding?.faviconUrl) {
        let link = document.querySelector("link[rel*='icon']");
        if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
        link.href = s.branding.faviconUrl;
      }
    });
  }, []);

  const logoUrl = preview?.logoUrl || siteSettings?.branding?.logoUrl || footerSettings.logoUrl || '/images/website/crackerhyderabadlogo.png';
  const instagramUrl = preview?.instagram ?? siteSettings?.socialLinks?.instagram ?? '';
  const phone = preview?.phone ?? footerSettings.phone;
  const email = preview?.email ?? footerSettings.email;
  const address = preview?.address ?? footerSettings.address;
  const dynamicSocialLinks = [
    ...(instagramUrl ? [{ href: instagramUrl, label: 'Instagram', Icon: FaInstagram }] : []),
    { href: 'https://facebook.com', label: 'Facebook', Icon: FaFacebookF },
    { href: 'https://youtube.com', label: 'YouTube', Icon: FaYoutube }
  ];

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (!newsletterEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newsletterEmail.trim())) {
      setNewsletterError('Please enter a valid email address');
      toast.error('Please enter a valid email address');
      return;
    }
    setNewsletterError('');
    setNewsletterEmail('');
    toast.success('Subscribed! You will get all festival offers first.');
  };

  return (
    <footer
      className="relative overflow-hidden"
      style={{
        background: 'linear-gradient(178deg, var(--maroon-900) 0%, #2A0C0B 34%, #1A1714 100%)',
        color: 'var(--text-on-dark)'
      }}
    >
      {/* Gold hairline rule across the top edge. */}
      <div
        aria-hidden="true"
        className="h-px w-full"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(210, 166, 79, 0.18) 12%, var(--gold-400) 50%, rgba(210, 166, 79, 0.18) 88%, transparent 100%)'
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-32"
        style={{ background: 'radial-gradient(62% 100% at 50% 0%, rgba(195, 58, 20, 0.22), transparent 72%)' }}
      />

      <div className="shell relative py-4 sm:py-8 lg:py-10">
        {/* Phones run a 2-column grid so Quick Links and Categories sit
            side-by-side instead of stacking — brand and contact span both
            columns. From sm up the original 2-col / 12-col layout is restored
            untouched. */}
        <ScrollReveal
          stagger={0.06}
          className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-10 lg:grid-cols-12 lg:gap-8"
        >
          {/* Brand + newsletter + social */}
          <ScrollReveal.Item className="col-span-2 sm:col-span-1 lg:col-span-4">
            <div className="mb-2 flex items-center gap-3 sm:mb-3">
              <img
                src={logoUrl}
                alt="Crackers Hyderabad Logo"
                className="h-9 object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <p className="subsection-title text-lg" style={{ color: '#FFFFFF' }}>
                Crackers <span style={{ color: 'var(--ember-400)' }}>Hyderabad</span>
              </p>
            </div>

            <p
              className="text-pretty mb-2.5 max-w-sm text-sm leading-relaxed sm:mb-4"
              style={{ fontFamily: 'var(--font-body)', color: '#B7AEA2' }}
            >
              Premium fireworks for every celebration — safe doorstep delivery across Hyderabad.
            </p>

            <div className="mb-2.5 sm:mb-5">
              <FooterHeading>Newsletter</FooterHeading>
              <form onSubmit={handleSubscribe} className="flex max-w-sm gap-2" noValidate>
                <label htmlFor="footer-newsletter-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="footer-newsletter-email"
                  type="email"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder="Your email"
                  aria-invalid={newsletterError ? 'true' : undefined}
                  aria-describedby={newsletterError ? 'footer-newsletter-error' : undefined}
                  className={`h-11 min-w-0 flex-1 rounded-xl px-3.5 text-sm transition-colors placeholder:text-[#A79E92] sm:h-10 ${
                    newsletterError
                      ? 'border-[color:var(--crimson-600)]'
                      : 'border-[color:rgba(210,166,79,0.24)] focus:border-[color:var(--ember-500)]'
                  }`}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-body)'
                  }}
                />
                <button
                  type="submit"
                  aria-label="Subscribe to newsletter"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white transition-transform hover:-translate-y-0.5 sm:h-10 sm:w-10"
                  style={{ background: 'var(--grad-ember)', boxShadow: 'var(--shadow-ember)' }}
                >
                  <Send className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
                </button>
              </form>
              {newsletterError && (
                <p
                  id="footer-newsletter-error"
                  className="mt-2 text-xs font-semibold"
                  style={{ color: '#F7A6A6', fontFamily: 'var(--font-body)' }}
                >
                  {newsletterError}
                </p>
              )}
            </div>

            <div>
              <FooterHeading>Follow Us</FooterHeading>
              <div className="flex items-center gap-2.5">
                {dynamicSocialLinks.map(({ href, label, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="flex h-9 w-9 items-center justify-center rounded-full transition-transform duration-200 hover:-translate-y-0.5"
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(210, 166, 79, 0.26)',
                      color: 'var(--text-on-dark)'
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
          </ScrollReveal.Item>

          {/* Quick links */}
          <ScrollReveal.Item className="lg:col-span-2">
            <FooterHeading>Quick Links</FooterHeading>
            <nav aria-label="Footer quick links" className="flex flex-col items-start">
              {quickLinks.map(link => (
                <FooterLink key={link.label} to={link.to}>
                  {link.label}
                </FooterLink>
              ))}
            </nav>
          </ScrollReveal.Item>

          {/* Categories */}
          <ScrollReveal.Item className="lg:col-span-3">
            <FooterHeading>Categories</FooterHeading>
            <nav aria-label="Footer categories" className="flex flex-col items-start">
              {categories.map((cat) => (
                <FooterLink key={cat.slug} to={`/products?category=${encodeURIComponent(cat.link)}`}>
                  {cat.name}
                </FooterLink>
              ))}
              <FooterLink to="/products">View All</FooterLink>
            </nav>
          </ScrollReveal.Item>

          {/* Contact */}
          <ScrollReveal.Item className="col-span-2 sm:col-span-1 lg:col-span-3">
            <FooterHeading>Contact Us</FooterHeading>
            <div className="flex flex-col">
              <ContactRow href={`tel:${phone}`} icon={Phone}>
                <span className="tabular">{phone}</span>
              </ContactRow>
              <ContactRow href={`mailto:${email}`} icon={Mail}>
                {email}
              </ContactRow>
              <ContactRow icon={MapPin}>{address}</ContactRow>
            </div>
          </ScrollReveal.Item>
        </ScrollReveal>
      </div>

      {/* Bottom bar */}
      <div className="relative" style={{ background: 'rgba(0, 0, 0, 0.32)', borderTop: BOTTOM_BORDER }}>
        <div className="shell flex flex-col items-start justify-between gap-1.5 py-2.5 sm:flex-row sm:items-center sm:gap-2 sm:py-3">
          <p className="text-xs" style={{ fontFamily: 'var(--font-body)', color: '#9C9488' }}>
            © <span className="tabular">{currentYear}</span> CrackersHyderabad | All Rights Reserved
          </p>
          <p
            className="flex items-center gap-1.5 text-xs"
            style={{ fontFamily: 'var(--font-body)', color: '#9C9488' }}
          >
            <Headset
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: 'var(--ember-400)' }}
              strokeWidth={2.2}
              aria-hidden="true"
            />
            24/7 Customer Support
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;