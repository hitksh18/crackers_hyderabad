import { Mail, Send } from 'lucide-react';
import { CornerFiligree } from '../ui/Ornaments';

/**
 * Newsletter sign-up. The submit handler and its validation live in Home.jsx
 * and are passed in untouched. `copy` ({ heading, description, buttonText })
 * overrides the default editorial copy — used by the homepage canvas.
 */
const NewsletterBlock = ({ email, onEmailChange, onSubmit, copy }) => (
  <div
    className="relative flex h-full flex-col overflow-hidden p-5 sm:p-6 md:p-8"
    style={{
      background: 'var(--grad-maroon)',
      borderRadius: 'var(--r-2xl)',
      boxShadow: 'var(--shadow-lg)',
    }}
  >
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
      style={{
        background:
          'radial-gradient(40% 44% at 12% 16%, rgba(210,166,79,0.24) 0%, transparent 100%),' +
          'radial-gradient(38% 40% at 92% 88%, rgba(247,174,44,0.18) 0%, transparent 100%)',
      }}
    />
    <CornerFiligree position="top-right" className="opacity-70" />

    <div className="relative flex flex-1 flex-col">
      <span
        className="inline-flex w-fit items-center gap-2 rounded-[var(--r-pill)] border border-[rgba(210,166,79,0.42)] bg-[rgba(210,166,79,0.12)] px-3.5 py-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.2em]"
        style={{ fontFamily: 'var(--font-body)', color: 'var(--gold-400)' }}
      >
        <Mail className="h-3.5 w-3.5" strokeWidth={2.3} aria-hidden="true" />
        Newsletter
      </span>

      <h2 className="section-title mt-4" style={{ color: 'var(--white-soft)' }}>
        {copy?.heading || 'Stay Updated with Festival Offers'}
      </h2>

      <p
        className="mt-3 max-w-prose text-pretty"
        style={{ fontFamily: 'var(--font-body)', color: 'var(--text-on-dark)', lineHeight: 1.65 }}
      >
        {copy?.description || 'Get exclusive deals, early sale access and festive surprises straight to your inbox.'}
      </p>

      <form onSubmit={onSubmit} className="mt-auto flex flex-col gap-3 pt-6 sm:flex-row">
        <div className="relative flex-1">
          <label htmlFor="newsletter-email" className="sr-only">
            Email address
          </label>
          <Mail
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2"
            strokeWidth={2.1}
            style={{ color: 'var(--text-subtle)' }}
            aria-hidden="true"
          />
          <input
            id="newsletter-email"
            type="email"
            value={email}
            onChange={onEmailChange}
            placeholder="Enter your email address"
            aria-label="Email address"
            className="input-premium pl-12"
          />
        </div>

        <button type="submit" className="btn-gold shrink-0 px-7 py-3.5">
          <Send className="h-5 w-5" strokeWidth={2.3} aria-hidden="true" />
          {copy?.buttonText || 'Subscribe'}
        </button>
      </form>
    </div>
  </div>
);

export default NewsletterBlock;
