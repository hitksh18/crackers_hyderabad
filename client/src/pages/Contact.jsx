import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Mail,
  Phone,
  MapPin,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  PackageSearch,
  Store,
} from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import Seo from '../components/Seo';
import { readSiteSettings } from '../lib/siteSettings';
import { normalizeWhatsappLinkNumber } from '../lib/whatsappContact';

/* Verified contact details only — the same Firestore sources the footer
   uses (footerSettings/main for phone/WhatsApp, settings/siteSettings for
   the contact email). Nothing invented: every number/address below either
   loaded from settings or falls back to the exact default the footer
   already publishes. */
const FALLBACK_EMAIL = 'crackershyderabad@gmail.com';
const FALLBACK_PHONE = '+91 98765 43210';
const FALLBACK_ADDRESS = 'Hyderabad, Telangana';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ContactInfoRow = ({ icon: Icon, label, children, href }) => {
  const body = (
    <>
      <span aria-hidden="true" className="contact-info-ico">
        <Icon className="h-[18px] w-[18px]" strokeWidth={2.1} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="contact-info-label">{label}</span>
        <span className="contact-info-value">{children}</span>
      </span>
    </>
  );
  if (href) {
    return (
      <a href={href} className="contact-info-row">
        {body}
      </a>
    );
  }
  return <div className="contact-info-row">{body}</div>;
};

const Contact = () => {
  const [details, setDetails] = useState({
    email: FALLBACK_EMAIL,
    phone: FALLBACK_PHONE,
    address: FALLBACK_ADDRESS,
    whatsapp: '',
  });
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [status, setStatus] = useState({ state: 'idle', error: '' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [footerSnap, site] = await Promise.all([
          getDoc(doc(db, 'footerSettings', 'main')).catch(() => null),
          readSiteSettings().catch(() => null),
        ]);
        if (cancelled) return;
        const saved = footerSnap && footerSnap.exists() ? footerSnap.data() : {};
        setDetails({
          email: site?.contact?.email || saved.email || FALLBACK_EMAIL,
          phone: saved.phone || FALLBACK_PHONE,
          address: saved.address || FALLBACK_ADDRESS,
          whatsapp: normalizeWhatsappLinkNumber(saved.whatsapp),
        });
      } catch {
        /* Verified fallbacks above stay — the page never renders empty. */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const set = (key) => (e) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    if (status.state !== 'idle') setStatus({ state: 'idle', error: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    /* Duplicate-submit guard: the button disables the moment a send starts,
       and this re-entry check covers keyboard double-activation. */
    if (status.state === 'sending') return;

    const name = form.name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    const subject = form.subject.trim();
    const message = form.message.trim();

    if (!name || !EMAIL_RE.test(email) || !subject || message.length < 10) {
      setStatus({ state: 'error', error: 'Please complete every field with a valid email and a message of at least 10 characters.' });
      return;
    }

    setStatus({ state: 'sending', error: '' });
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, subject, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && data.ok) {
        setForm({ name: '', email: '', phone: '', subject: '', message: '' });
        setStatus({ state: 'success', error: '' });
      } else {
        setStatus({
          state: 'error',
          error: (data && data.error) || 'Unable to send your message right now. Please try again.',
        });
      }
    } catch {
      setStatus({ state: 'error', error: 'Unable to send your message right now. Please try again.' });
    }
  };

  const sending = status.state === 'sending';
  const whatsappUrl = details.whatsapp
    ? `https://wa.me/${details.whatsapp}?text=${encodeURIComponent('Hi, I have a question about Crackers Hyderabad.')}`
    : '';

  return (
    <div className="contact-page min-h-screen">
      <Seo
        title="Contact Us | Crackers Hyderabad"
        description="Contact Crackers Hyderabad for help with fireworks orders, wholesale enquiries and delivery across Hyderabad."
        canonical="/contact"
      />

      {/* ---- Centered hero ---- */}
      <section className="contact-hero">
        <div className="contact-shell">
          <span className="section-eyebrow justify-center">Get In Touch</span>
          <h1 className="contact-title mt-4">Contact Crackers Hyderabad</h1>
          <p className="contact-sub">
            We are here to help with orders, product questions and wholesale enquiries.
          </p>
        </div>
      </section>

      {/* ---- Info + form ---- */}
      <section className="contact-main">
        <div className="contact-shell contact-grid">
          <div>
            <h2 className="contact-h2">Let&apos;s Talk</h2>
            <p className="contact-body mt-3">
              Have a question about an order, product or delivery? Send us a
              message and our team will get back to you.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <ContactInfoRow icon={Mail} label="Email" href={`mailto:${details.email}`}>
                {details.email}
              </ContactInfoRow>
              <ContactInfoRow icon={Phone} label="Phone" href={`tel:${details.phone.replace(/[\s-]/g, '')}`}>
                <span className="tabular">{details.phone}</span>
              </ContactInfoRow>
              <ContactInfoRow icon={MapPin} label="Location">
                {details.address}
              </ContactInfoRow>
            </div>
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="contact-wa"
              >
                <FaWhatsapp className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span>
                  <span className="contact-wa-title">Chat on WhatsApp</span>
                  <span className="contact-wa-sub">Usually replies within hours</span>
                </span>
              </a>
            )}
          </div>

          <div className="contact-card">
            <h2 className="contact-h2">Send Us a Message</h2>
            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4" noValidate={false}>
              <div>
                <label htmlFor="contact-name" className="contact-label">Full Name</label>
                <input
                  id="contact-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={form.name}
                  onChange={set('name')}
                  placeholder="Your full name"
                  className="input-premium"
                  required
                  disabled={sending}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="contact-email" className="contact-label">Email Address</label>
                  <input
                    id="contact-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={set('email')}
                    placeholder="you@example.com"
                    className="input-premium"
                    required
                    disabled={sending}
                  />
                </div>
                <div>
                  <label htmlFor="contact-phone" className="contact-label">Phone Number</label>
                  <input
                    id="contact-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={set('phone')}
                    placeholder="+91 ..."
                    className="input-premium"
                    disabled={sending}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="contact-subject" className="contact-label">Subject</label>
                <input
                  id="contact-subject"
                  name="subject"
                  type="text"
                  value={form.subject}
                  onChange={set('subject')}
                  placeholder="How can we help?"
                  className="input-premium"
                  required
                  disabled={sending}
                />
              </div>
              <div>
                <label htmlFor="contact-message" className="contact-label">Message</label>
                <textarea
                  id="contact-message"
                  name="message"
                  rows={5}
                  value={form.message}
                  onChange={set('message')}
                  placeholder="Tell us about your order or enquiry..."
                  className="input-premium resize-y"
                  style={{ minHeight: 120 }}
                  required
                  disabled={sending}
                />
              </div>

              <div role="status" aria-live="polite">
                {status.state === 'success' && (
                  <p className="contact-notice contact-notice-success">
                    <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
                    Message sent successfully. We&apos;ll get back to you soon.
                  </p>
                )}
                {status.state === 'error' && (
                  <p className="contact-notice contact-notice-error">
                    <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
                    {status.error}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={sending}
                aria-busy={sending}
                className="btn-maroon nav-login-btn w-full sm:w-auto sm:px-8"
                style={{ minHeight: 50 }}
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                    Sending message...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                    Send Message
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* ---- Quick contact cards ---- */}
      <section className="contact-quick">
        <div className="contact-shell">
          <div className="contact-quick-grid">
            <article className="contact-mini">
              <span className="contact-mini-ico" aria-hidden="true">
                <PackageSearch className="h-[18px] w-[18px]" strokeWidth={2.1} aria-hidden="true" />
              </span>
              <span className="contact-mini-body">
                <h3 className="contact-mini-title">Order Support</h3>
                <p className="contact-mini-text">Track an existing order</p>
              </span>
              <Link to="/track-order" className="btn-outline px-4 py-2.5 text-sm">
                Track Your Order
              </Link>
            </article>
            <article className="contact-mini">
              <span className="contact-mini-ico" aria-hidden="true">
                <Store className="h-[18px] w-[18px]" strokeWidth={2.1} aria-hidden="true" />
              </span>
              <span className="contact-mini-body">
                <h3 className="contact-mini-title">Wholesale</h3>
                <p className="contact-mini-text">Planning a larger festive order?</p>
              </span>
              <Link to="/products" className="btn-outline px-4 py-2.5 text-sm">
                Wholesale Enquiry
              </Link>
            </article>
            <article className="contact-mini">
              <span className="contact-mini-ico" aria-hidden="true">
                <FaWhatsapp className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <span className="contact-mini-body">
                <h3 className="contact-mini-title">WhatsApp</h3>
                <p className="contact-mini-text">Prefer a quick conversation?</p>
              </span>
              {whatsappUrl ? (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline px-4 py-2.5 text-sm"
                >
                  <FaWhatsapp className="h-4 w-4" aria-hidden="true" />
                  Chat on WhatsApp
                </a>
              ) : (
                <a href={`mailto:${details.email}`} className="btn-outline px-4 py-2.5 text-sm">
                  <Mail className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  Email Us Instead
                </a>
              )}
            </article>
          </div>
        </div>
      </section>

      {/* ---- Maroon help banner ---- */}
      <section className="contact-banner">
        <div className="contact-shell">
          <h2 className="contact-banner-title">Need Help With Your Order?</h2>
          <p className="contact-banner-sub">
            Our team is here to help before, during and after your purchase.
          </p>
          <div className="contact-cta-row">
            <Link to="/products" className="btn-gold px-7 py-3 text-sm">
              Shop Products
              <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            </Link>
            <Link to="/track-order" className="contact-ghost px-7 py-3 text-sm">
              <PackageSearch className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              Track Order
            </Link>
          </div>
          <p className="contact-banner-note">
            <Store className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
            Retailers and event teams — ask us about wholesale supply.
          </p>
        </div>
      </section>
    </div>
  );
};

export default Contact;
