import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import Seo from '../components/Seo';

/* Verified contact email from site settings (settings/siteSettings.contact).
   No phone number or street address is published here — those are not
   currently available as verified business information. */
const CONTACT_EMAIL = 'crackershyderabad@gmail.com';

/**
 * Contact Crackers Hyderabad — only verified contact information.
 * No invented phone numbers, addresses, hours or map data.
 */
const Contact = () => (
  <div className="min-h-screen">
    <Seo
      title="Contact Us | Crackers Hyderabad"
      description="Contact Crackers Hyderabad for help with fireworks orders, wholesale enquiries and delivery across Hyderabad."
      canonical="/contact"
    />
    <div className="shell-narrow section-pad-sm">
      <span className="section-eyebrow">Get In Touch</span>
      <h1 className="section-title mt-4" style={{ color: 'var(--text-strong)' }}>
        Contact Crackers Hyderabad
      </h1>
      <div className="panel-editorial glass-card mt-6 p-5 sm:p-6">
        <p className="text-base" style={{ color: 'var(--text-body)' }}>
          For help with an order, a wholesale enquiry, or anything about our
          fireworks, email us and we will get back to you.
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 text-base font-semibold"
          style={{ color: 'var(--ember-600)' }}
        >
          <Mail className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          {CONTACT_EMAIL}
        </a>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link to="/products" className="btn-primary px-6 py-3 text-sm">
            Shop Products
          </Link>
          <Link to="/track-order" className="btn-outline px-6 py-3 text-sm">
            Track Order
          </Link>
        </div>
      </div>
    </div>
  </div>
);

export default Contact;
