/**
 * Email Automation — rules, templates, branding, compose and delivery log.
 *
 * Everything here is a thin editor over server state: toggles, templates and
 * branding persist through /api/admin/email-automation/*, and every send
 * (automated, composed or test) is executed by the backend. No SMTP secrets
 * ever reach this page — the status card reports only whether mail works.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  BellRing,
  FileText,
  Palette,
  PenLine,
  ScrollText,
  Save,
  Send,
  FlaskConical,
  RefreshCw,
} from 'lucide-react';
import AdminHeader from '../components/admin/AdminHeader';
import { authFetch, readApiError } from '../utils/apiClient';
import toast from '../utils/toast';

const TABS = [
  { id: 'automation', label: 'Automation', icon: BellRing },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'branding', label: 'Branding', icon: Palette },
  { id: 'compose', label: 'Compose', icon: PenLine },
  { id: 'logs', label: 'Logs', icon: ScrollText },
];

const TEMPLATE_FIELDS = [
  { key: 'subject', label: 'Subject', kind: 'input' },
  { key: 'preheader', label: 'Preheader', kind: 'input' },
  { key: 'heading', label: 'Heading', kind: 'input' },
  { key: 'body', label: 'Body', kind: 'textarea', hint: 'Blank lines separate paragraphs. First paragraph becomes the intro.' },
  { key: 'buttonText', label: 'Button text', kind: 'input' },
  { key: 'buttonUrl', label: 'Button URL', kind: 'input' },
];

const TOKEN_GROUPS = [
  ['CUSTOMER_NAME', 'CUSTOMER_EMAIL', 'MOBILE'],
  ['ORDER_ID', 'ORDER_DATE', 'ORDER_STATUS', 'ORDER_ITEMS'],
  ['SUBTOTAL', 'DISCOUNT', 'COUPON_CODE', 'ORDER_TOTAL', 'SAVINGS'],
  ['DELIVERY_ADDRESS', 'CITY', 'PINCODE'],
  ['TRACKING_NUMBER', 'TRACKING_URL', 'COURIER_NAME'],
  ['PAYMENT_METHOD', 'PAYMENT_STATUS', 'CANCELLATION_REASON', 'REFUND_AMOUNT'],
  ['STORE_NAME', 'STORE_PHONE', 'STORE_EMAIL', 'STORE_URL', 'ORDER_URL'],
];

const inputStyle = {
  borderColor: 'var(--hairline)',
  color: 'var(--text-strong)',
  background: 'var(--surface-sunken)',
};
const cardStyle = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-card)',
};

/* SMTP status in four distinct states: connected / missing credentials /
   disabled / connection error. Disabled and missing-creds are different
   problems with different fixes; the message says which. */
const MailStatusCard = ({ emailStatus }) => {
  const problems = emailStatus?.problems || [];
  const join = (list) => list.join(', ');
  let dot = 'var(--leaf-600, #3ecf8e)';
  let title = 'Email service • Connected';
  let body = 'SMTP authentication successful — automated emails are being delivered.';
  let border = 'var(--hairline)';
  if (!emailStatus) {
    dot = 'var(--text-subtle)';
    title = 'Email service • Checking…';
    body = 'Contacting the mail configuration.';
  } else if (!emailStatus.ok) {
    const text = join(problems);
    const disabled = /disabled/i.test(text);
    const missing = /missing/i.test(text);
    border = 'var(--crimson-600)';
    if (disabled && !missing) {
      dot = 'var(--gold-400)';
      title = 'Email service • Disabled';
      body = 'EMAIL_ENABLED is currently false on the server. Enable it in the server environment to resume delivery.';
    } else if (missing) {
      dot = 'var(--crimson-600)';
      title = 'Email service • Not configured';
      body = `SMTP credentials are missing on the server (${text}). Configure them in the server .env — never in the browser. ${disabled ? 'EMAIL_ENABLED is also false.' : ''}`;
    } else {
      dot = 'var(--crimson-600)';
      title = 'Email service • Connection error';
      body = `Unable to use the SMTP server (${text}). Check host, port, and credentials on the server.`;
    }
  }
  return (
    <div
      className="mb-4 rounded-2xl border px-4 py-3"
      style={{ borderColor: border, background: 'var(--surface-card)' }}
      role="status"
    >
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} aria-hidden="true" />
        <p className="text-xs font-bold" style={{ color: 'var(--text-strong)' }}>{title}</p>
      </div>
      <p className="mt-1 pl-4 text-xs" style={{ color: 'var(--text-muted)' }}>{body}</p>
    </div>
  );
};

const EmailAutomation = () => {
  const [tab, setTab] = useState('automation');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [events, setEvents] = useState([]);
  const [rules, setRules] = useState({});
  const [savedRules, setSavedRules] = useState(null);
  const [templates, setTemplates] = useState({});
  const [savedTemplates, setSavedTemplates] = useState(null);
  const [branding, setBranding] = useState(null);
  const [savedBranding, setSavedBranding] = useState(null);
  const [emailStatus, setEmailStatus] = useState(null);
  const [lastTriggered, setLastTriggered] = useState({});

  const [templateEvent, setTemplateEvent] = useState('placed');
  const [tokenTarget, setTokenTarget] = useState(null);
  const fieldRefs = useRef({});

  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logEvent, setLogEvent] = useState('');
  const [logStatus, setLogStatus] = useState('');
  const [logSearch, setLogSearch] = useState('');
  /* Debounced search: every keystroke must not fire /logs?q=. */
  const [debouncedLogSearch, setDebouncedLogSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedLogSearch(logSearch.trim()), 400);
    return () => clearTimeout(t);
  }, [logSearch]);

  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [compose, setCompose] = useState({ to: '', orderId: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);

  /* Stable: selecting a template must not refetch the whole page.
     Previously `load` depended on `templateEvent`, so every template
     <select> change re-GET /api/admin/email-automation. */
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await authFetch('/api/admin/email-automation');
      if (!response.ok) throw new Error(await readApiError(response, 'Failed to load Email Automation'));
      const data = await response.json();
      setEvents(data.events || []);
      setRules(data.rules?.events || {});
      setSavedRules(JSON.stringify(data.rules?.events || {}));
      setTemplates(data.templates || {});
      setSavedTemplates(JSON.stringify(data.templates || {}));
      setBranding(data.branding || null);
      setSavedBranding(JSON.stringify(data.branding || null));
      setEmailStatus(data.emailStatus || null);
      setLastTriggered(data.lastTriggered || {});
      if (data.events?.length > 0) {
        const keys = new Set(data.events.map((e) => e.key));
        setTemplateEvent((prev) => (prev && keys.has(prev) ? prev : data.events[0].key));
      }
    } catch (error) {
      console.error('[automation] load failed:', error);
      setLoadError(error.message || 'Failed to load Email Automation');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams();
      if (logEvent) params.set('event', logEvent);
      if (logStatus) params.set('status', logStatus);
      if (debouncedLogSearch) params.set('q', debouncedLogSearch);
      const response = await authFetch(`/api/admin/email-automation/logs?${params.toString()}`);
      if (!response.ok) throw new Error(await readApiError(response, 'Failed to load logs'));
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (error) {
      toast.error(error.message || 'Could not load the delivery log');
    } finally {
      setLogsLoading(false);
    }
  }, [logEvent, logStatus, debouncedLogSearch]);

  useEffect(() => {
    if (tab === 'logs') loadLogs();
  }, [tab, loadLogs]);

  const rulesDirty = savedRules !== null && JSON.stringify(rules) !== savedRules;
  const templatesDirty = savedTemplates !== null && JSON.stringify(templates) !== savedTemplates;
  const brandingDirty = savedBranding !== null && JSON.stringify(branding) !== savedBranding;

  const saveRules = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const response = await authFetch('/api/admin/email-automation/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: rules }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save rules');
      setSavedRules(JSON.stringify(data.rules?.events || rules));
      toast.success('Automation rules saved');
    } catch (error) {
      toast.error(error.message || 'Could not save rules');
    } finally {
      setSaving(false);
    }
  };

  const saveTemplates = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const response = await authFetch('/api/admin/email-automation/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templates),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.errors) Object.values(data.errors).forEach((m) => toast.error(m));
        else toast.error(data.error || 'Could not save templates');
        return;
      }
      setSavedTemplates(JSON.stringify(templates));
      toast.success('Templates saved');
    } catch (error) {
      toast.error(error.message || 'Could not save templates');
    } finally {
      setSaving(false);
    }
  };

  const saveBranding = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const response = await authFetch('/api/admin/email-automation/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(branding),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.errors) Object.values(data.errors).forEach((m) => toast.error(m));
        else toast.error(data.error || 'Could not save branding');
        return;
      }
      setSavedBranding(JSON.stringify(branding));
      toast.success('Branding saved');
    } catch (error) {
      toast.error(error.message || 'Could not save branding');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async (e) => {
    e.preventDefault();
    if (testing || !testTo.trim()) return;
    setTesting(true);
    try {
      const response = await authFetch('/api/admin/email-automation/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Test email failed.');
      toast.success('Test email sent — check the inbox.');
      setTestTo('');
    } catch (error) {
      toast.error(error.message || 'Test email failed.');
    } finally {
      setTesting(false);
    }
  };

  const sendCompose = async () => {
    if (sending) return;
    if (!confirmSend) {
      setConfirmSend(true);
      return;
    }
    setSending(true);
    try {
      const response = await authFetch('/api/admin/email-automation/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(compose),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Send failed.');
      toast.success('Email sent.');
      setCompose({ to: '', orderId: '', subject: '', message: '' });
      setConfirmSend(false);
    } catch (error) {
      toast.error(error.message || 'Send failed.');
    } finally {
      setSending(false);
    }
  };

  const insertToken = (token) => {
    const target = tokenTarget && fieldRefs.current[tokenTarget];
    const apply = (key, updater) => {
      if (key === 'compose-message') {
        setCompose((c) => ({ ...c, message: updater(c.message) }));
        return;
      }
      if (key === 'compose-subject') {
        setCompose((c) => ({ ...c, subject: updater(c.subject) }));
        return;
      }
      setTemplates((t) => ({
        ...t,
        [templateEvent]: { ...(t[templateEvent] || {}), [key]: updater((t[templateEvent] || {})[key] || '') },
      }));
    };
    if (target && typeof target.selectionStart === 'number') {
      const { selectionStart, selectionEnd, value } = target;
      const next = `${value.slice(0, selectionStart)}{${token}}${value.slice(selectionEnd)}`;
      apply(tokenTarget, () => next);
      requestAnimationFrame(() => {
        try {
          target.focus();
          target.selectionStart = target.selectionEnd = selectionStart + token.length + 2;
        } catch { /* caret restore is best-effort */ }
      });
    } else if (tokenTarget) {
      apply(tokenTarget, (v) => `${v}{${token}}`);
    }
  };

  const activeTemplate = useMemo(
    () => ({ subject: '', preheader: '', heading: '', body: '', buttonText: '', buttonUrl: '', ...(templates[templateEvent] || {}) }),
    [templates, templateEvent]
  );

  const previewHtml = useMemo(() => {
    const accent = branding?.accentColor || '#C33A14';
    const paras = String(activeTemplate.body || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    return { paras, accent };
  }, [activeTemplate.body, branding]);

  const setBrand = (patch) => setBranding((b) => ({ ...(b || {}), ...patch }));

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-page)' }}>
      <AdminHeader title="Email Automation" />
      <main className="mx-auto w-full max-w-[1800px] px-4 pb-16 pt-6 lg:px-8 xl:px-10">
        {loading ? (
          <div aria-label="Loading Email Automation" aria-busy="true">
            <div className="mb-4 rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
              <div className="h-3 w-40 animate-pulse rounded-full" style={{ background: 'var(--surface-sunken)' }} />
              <div className="mt-2 h-3 w-72 max-w-full animate-pulse rounded-full" style={{ background: 'var(--surface-sunken)' }} />
            </div>
            <div className="mb-4 flex gap-1 overflow-hidden rounded-full border p-1" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }} aria-hidden="true">
              {TABS.map((t) => (
                <span key={t.id} className="h-9 w-24 flex-none animate-pulse rounded-full" style={{ background: 'var(--surface-card)' }} />
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }} />
              ))}
            </div>
            <p className="sr-only">Loading Email Automation…</p>
          </div>
        ) : loadError ? (
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--crimson-600)' }}>{loadError}</p>
            <button type="button" onClick={load} className="mt-2 text-xs font-semibold underline" style={{ color: 'var(--text-strong)' }}>
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Backend status — distinct states, never secrets. The local dev
                server intentionally reports disabled/unconfigured (root .env
                has EMAIL_ENABLED=false and no credentials); production KVM
                reads its own /root/crackers-deploy/.env. SMTP passwords are
                never exposed here. */}
            <MailStatusCard emailStatus={emailStatus} />

            <div className="mb-4 flex gap-1 overflow-x-auto rounded-full border p-1" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }} role="tablist" aria-label="Email Automation sections">
              {TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => setTab(t.id)}
                    className="inline-flex flex-none items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold"
                    style={tab === t.id
                      ? { background: 'var(--text-strong)', color: 'var(--surface-card)' }
                      : { color: 'var(--text-muted)' }}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {tab === 'automation' && (
              <section aria-label="Automation rules">
                <form
                  onSubmit={sendTest}
                  className="mb-4 flex flex-col gap-2 rounded-2xl border p-4 sm:flex-row sm:items-end"
                  style={cardStyle}
                >
                  <label className="block flex-1">
                    <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--text-body)' }}>
                      <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" /> Send a test email
                    </span>
                    <input
                      type="email"
                      className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm"
                      style={inputStyle}
                      value={testTo}
                      onChange={(e) => setTestTo(e.target.value)}
                      placeholder="you@example.com"
                      aria-label="Test recipient"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={testing || !testTo.trim()}
                    className="inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-40"
                    style={{ background: 'var(--text-strong)', color: 'var(--surface-card)' }}
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    {testing ? 'Sending…' : 'Send Test'}
                  </button>
                </form>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {events.map((event) => {
                    const enabled = rules[event.key]?.enabled !== false;
                    const last = lastTriggered[event.key];
                    return (
                      <div key={event.key} className="rounded-2xl border p-4" style={cardStyle}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>{event.label}</p>
                            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>{event.desc}</p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            aria-label={`${event.label} automation`}
                            onClick={() => setRules((r) => ({ ...r, [event.key]: { enabled: !enabled } }))}
                            className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
                            style={{ background: enabled ? 'var(--leaf-600, #3ecf8e)' : 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}
                          >
                            <span
                              className="absolute top-0.5 h-[18px] w-[18px] rounded-full transition-all"
                              style={{ left: enabled ? '22px' : '2px', background: '#fff' }}
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px] tabular" style={{ color: 'var(--text-subtle)' }}>
                          <span>TO {event.recipient === 'staff' ? 'STAFF' : 'CUSTOMER'}</span>
                          <span>{last ? `Last sent ${new Date(last).toLocaleString()}` : 'Never sent yet'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={saveRules}
                  disabled={saving || !rulesDirty}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-40"
                  style={{ background: 'var(--text-strong)', color: 'var(--surface-card)' }}
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {saving ? 'Saving…' : 'Save Automation'}
                </button>
              </section>
            )}

            {tab === 'templates' && (
              <section aria-label="Email templates" className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <div className="min-w-0 rounded-2xl border p-4" style={cardStyle}>
                  <label className="mb-3 block">
                    <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Event</span>
                    <select
                      className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm"
                      style={inputStyle}
                      value={templateEvent}
                      onChange={(e) => setTemplateEvent(e.target.value)}
                    >
                      {events.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
                    </select>
                  </label>
                  {TEMPLATE_FIELDS.map((field) => (
                    <label key={field.key} className="mb-3 block">
                      <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>
                        {field.label}
                        <span className="ml-1 font-normal" style={{ color: 'var(--text-subtle)' }}>— blank uses default</span>
                      </span>
                      {field.kind === 'textarea' ? (
                        <textarea
                          ref={(el) => { fieldRefs.current[field.key] = el; }}
                          onFocus={() => setTokenTarget(field.key)}
                          className="min-h-[120px] w-full rounded-[var(--r-md)] border px-3 py-2.5 text-sm"
                          style={inputStyle}
                          value={activeTemplate[field.key]}
                          onChange={(e) => setTemplates((t) => ({
                            ...t,
                            [templateEvent]: { ...(t[templateEvent] || {}), [field.key]: e.target.value },
                          }))}
                        />
                      ) : (
                        <input
                          ref={(el) => { fieldRefs.current[field.key] = el; }}
                          onFocus={() => setTokenTarget(field.key)}
                          className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm"
                          style={inputStyle}
                          value={activeTemplate[field.key]}
                          onChange={(e) => setTemplates((t) => ({
                            ...t,
                            [templateEvent]: { ...(t[templateEvent] || {}), [field.key]: e.target.value },
                          }))}
                        />
                      )}
                      {field.hint && <span className="mt-1 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>{field.hint}</span>}
                    </label>
                  ))}
                  <div className="mb-3">
                    <p className="mb-1.5 text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Insert token at cursor</p>
                    <div className="flex flex-wrap gap-1.5">
                      {TOKEN_GROUPS.flat().map((token) => (
                        <button
                          key={token}
                          type="button"
                          onClick={() => insertToken(token)}
                          className="rounded-full border px-2 py-1 font-mono text-[10px]"
                          style={{ borderColor: 'var(--hairline)', color: 'var(--text-muted)', background: 'var(--surface-sunken)' }}
                        >
                          {`{${token}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={saveTemplates}
                    disabled={saving || !templatesDirty}
                    className="inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-40"
                    style={{ background: 'var(--text-strong)', color: 'var(--surface-card)' }}
                  >
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {saving ? 'Saving…' : 'Save Templates'}
                  </button>
                </div>

                {/* Live preview — local render, no API per keystroke. */}
                <div className="min-w-0">
                  <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--hairline)', background: '#FFFFFF' }}>
                    <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: '#EFE7D6' }}>
                      <span className="text-sm font-bold" style={{ color: '#211A15', fontFamily: 'Georgia,serif' }}>
                        {branding?.storeName || 'Crackers Hyderabad'}
                      </span>
                    </div>
                    <div className="px-4 py-4">
                      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#761713' }}>Preview</p>
                      <p className="mt-1 text-lg font-bold" style={{ color: '#211A15', fontFamily: 'Georgia,serif' }}>
                        {activeTemplate.heading || 'Thank you, Customer'}
                      </p>
                      {previewHtml.paras.length > 0 ? (
                        previewHtml.paras.map((p, i) => (
                          <p key={i} className="mt-2 text-sm" style={{ color: '#4A423B' }}>{p}</p>
                        ))
                      ) : (
                        <p className="mt-2 text-sm" style={{ color: '#4A423B' }}>Your order has been successfully placed.</p>
                      )}
                      <div
                        className="mt-3 inline-block rounded-[10px] px-5 py-3 text-sm font-bold"
                        style={{ background: previewHtml.accent, color: '#FFFFFF' }}
                      >
                        {activeTemplate.buttonText || 'TRACK YOUR ORDER'}
                      </div>
                      <p className="mt-3 text-xs" style={{ color: '#6B6259' }}>
                        Subject: {activeTemplate.subject || '(default subject)'}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {tab === 'branding' && (
              <section aria-label="Email branding" className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <div className="min-w-0 rounded-2xl border p-4" style={cardStyle}>
                  {[
                    ['storeName', 'Store name'],
                    ['senderName', 'Sender name'],
                    ['logoUrl', 'Logo URL'],
                    ['storeUrl', 'Store URL'],
                    ['replyTo', 'Reply-To'],
                    ['supportEmail', 'Support email'],
                    ['supportPhone', 'Support phone'],
                    ['accentColor', 'Accent color (hex)'],
                  ].map(([key, label]) => (
                    <label key={key} className="mb-3 block">
                      <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>{label}</span>
                      <input
                        className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm"
                        style={inputStyle}
                        value={branding?.[key] || ''}
                        onChange={(e) => setBrand({ [key]: e.target.value })}
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={saveBranding}
                    disabled={saving || !brandingDirty}
                    className="inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-40"
                    style={{ background: 'var(--text-strong)', color: 'var(--surface-card)' }}
                  >
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {saving ? 'Saving…' : 'Save Branding'}
                  </button>
                </div>
                <div className="min-w-0">
                  <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--hairline)', background: '#FFFFFF' }}>
                    <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: '#EFE7D6' }}>
                      {branding?.logoUrl && (
                        <img src={branding.logoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                      )}
                      <span className="text-base font-bold" style={{ color: '#211A15', fontFamily: 'Georgia,serif' }}>
                        {branding?.storeName || 'Crackers Hyderabad'}
                      </span>
                    </div>
                    <div className="px-4 py-4">
                      <p className="text-sm" style={{ color: '#4A423B' }}>
                        From {branding?.senderName || 'Crackers Hyderabad'}
                        {branding?.replyTo ? ` · replies to ${branding.replyTo}` : ''}
                      </p>
                      <p className="mt-1 text-sm" style={{ color: '#4A423B' }}>
                        {[branding?.supportEmail, branding?.supportPhone].filter(Boolean).join(' • ') || 'Support details appear here'}
                      </p>
                      <a href={branding?.storeUrl || '#'} className="mt-1 inline-block text-sm underline" style={{ color: '#9E7029' }}>
                        {(branding?.storeUrl || '').replace(/^https?:\/\//, '') || 'store url'}
                      </a>
                      <div
                        className="mt-3 inline-block rounded-[10px] px-5 py-3 text-sm font-bold"
                        style={{ background: branding?.accentColor || '#C33A14', color: '#FFFFFF' }}
                      >
                        TRACK YOUR ORDER
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {tab === 'compose' && (
              <section aria-label="Compose email" className="rounded-2xl border p-4" style={cardStyle}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Recipient</span>
                    <input
                      type="email"
                      className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm"
                      style={inputStyle}
                      value={compose.to}
                      onChange={(e) => { setCompose((c) => ({ ...c, to: e.target.value })); setConfirmSend(false); }}
                      placeholder="customer@example.com"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Order ID (optional — enables order tokens)</span>
                    <input
                      className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm tabular"
                      style={inputStyle}
                      value={compose.orderId}
                      onChange={(e) => { setCompose((c) => ({ ...c, orderId: e.target.value })); setConfirmSend(false); }}
                      placeholder="CHYD26-0001"
                    />
                  </label>
                </div>
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Subject</span>
                  <input
                    ref={(el) => { fieldRefs.current['compose-subject'] = el; }}
                    onFocus={() => setTokenTarget('compose-subject')}
                    className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm"
                    style={inputStyle}
                    value={compose.subject}
                    onChange={(e) => { setCompose((c) => ({ ...c, subject: e.target.value })); setConfirmSend(false); }}
                  />
                </label>
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Message</span>
                  <textarea
                    ref={(el) => { fieldRefs.current['compose-message'] = el; }}
                    onFocus={() => setTokenTarget('compose-message')}
                    className="min-h-[140px] w-full rounded-[var(--r-md)] border px-3 py-2.5 text-sm"
                    style={inputStyle}
                    value={compose.message}
                    onChange={(e) => { setCompose((c) => ({ ...c, message: e.target.value })); setConfirmSend(false); }}
                  />
                </label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {TOKEN_GROUPS.flat().map((token) => (
                    <button
                      key={token}
                      type="button"
                      onClick={() => insertToken(token)}
                      className="rounded-full border px-2 py-1 font-mono text-[10px]"
                      style={{ borderColor: 'var(--hairline)', color: 'var(--text-muted)', background: 'var(--surface-sunken)' }}
                    >
                      {`{${token}}`}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={sendCompose}
                  disabled={sending || !compose.to.trim() || !compose.subject.trim() || !compose.message.trim()}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-40"
                  style={{ background: confirmSend ? 'var(--crimson-600)' : 'var(--text-strong)', color: '#fff' }}
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {sending ? 'Sending…' : confirmSend ? 'Click again to confirm send' : 'Send Email'}
                </button>
              </section>
            )}

            {tab === 'logs' && (
              <section aria-label="Delivery log">
                <div className="mb-3 flex flex-col gap-2 rounded-2xl border p-3 sm:flex-row" style={cardStyle}>
                  <select
                    className="h-10 rounded-[var(--r-md)] border px-3 text-sm"
                    style={inputStyle}
                    value={logEvent}
                    onChange={(e) => setLogEvent(e.target.value)}
                    aria-label="Filter by event"
                  >
                    <option value="">All events</option>
                    {events.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
                    <option value="compose">Compose</option>
                    <option value="test">Test</option>
                  </select>
                  <select
                    className="h-10 rounded-[var(--r-md)] border px-3 text-sm"
                    style={inputStyle}
                    value={logStatus}
                    onChange={(e) => setLogStatus(e.target.value)}
                    aria-label="Filter by status"
                  >
                    <option value="">All statuses</option>
                    <option value="sent">Sent</option>
                    <option value="failed">Failed</option>
                    <option value="skipped">Skipped</option>
                  </select>
                  <input
                    className="h-10 flex-1 rounded-[var(--r-md)] border px-3 text-sm"
                    style={inputStyle}
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Search order, recipient, subject…"
                    aria-label="Search logs"
                  />
                  <button
                    type="button"
                    onClick={loadLogs}
                    disabled={logsLoading}
                    className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-40"
                    style={{ border: '1px solid var(--hairline)', color: 'var(--text-strong)' }}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    {logsLoading ? 'Loading…' : 'Refresh'}
                  </button>
                </div>
                <div className="overflow-x-auto rounded-2xl border" style={cardStyle}>
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead>
                      <tr style={{ color: 'var(--text-subtle)' }}>
                        {['Date', 'Event', 'Order', 'Recipient', 'Subject', 'Status'].map((h) => (
                          <th key={h} className="px-3 py-2.5 font-semibold uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((row) => (
                        <tr key={row.id} className="border-t" style={{ borderColor: 'var(--hairline)', color: 'var(--text-body)' }}>
                          <td className="whitespace-nowrap px-3 py-2.5 tabular" style={{ color: 'var(--text-muted)' }}>
                            {row.at?.toDate ? row.at.toDate().toLocaleString() : '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">{row.event}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 tabular">{row.orderId || '—'}</td>
                          <td className="max-w-[180px] truncate px-3 py-2.5">{row.recipient}</td>
                          <td className="max-w-[220px] truncate px-3 py-2.5">{row.subject || '—'}</td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <span
                              className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                              style={row.status === 'sent'
                                ? { background: 'rgba(79,180,131,0.15)', color: 'var(--delta-up, #4fb483)' }
                                : row.status === 'failed'
                                  ? { background: 'rgba(242,113,107,0.12)', color: 'var(--delta-down, #f2716b)' }
                                  : { background: 'rgba(210,166,79,0.12)', color: 'var(--gold-400)' }}
                              title={row.error || row.status}
                            >
                              {String(row.status || '').toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {logs.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                            {logsLoading ? 'Loading…' : 'No delivery records yet.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default EmailAutomation;
