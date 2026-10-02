import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  EllipsisVertical,
  ExternalLink,
  Loader2,
  Monitor,
  Save,
  Smartphone,
} from 'lucide-react';
import AccountMenu from '../AccountMenu';

/* ================= Canvas navbar ================= */

export function CanvasNav({ dirty, saving, saveError, onSave }) {
  const stateLabel = saving ? 'Saving...' : dirty ? 'Unsaved Changes' : 'Saved';
  const stateClass = saving
    ? 'cv-save-state'
    : `cv-save-state${dirty ? ' is-dirty' : ''}${saveError ? ' is-error' : ''}`;
  return (
    <header className="cv-nav">
      <div className="cv-nav-inner">
        <Link to="/dashboard" className="cv-back" aria-label="Back to dashboard">
          <ArrowLeft aria-hidden="true" />
          <span>Back to Dashboard</span>
        </Link>
        <div className="cv-title">CANVAS</div>
        <div className="cv-nav-right">
          <span className={stateClass}>{saveError || stateLabel}</span>
          <a href="/" target="_blank" rel="noopener noreferrer" className="cv-btn">
            <ExternalLink aria-hidden="true" />
            <span className="cv-btn-label">Preview Homepage</span>
          </a>
          <button type="button" onClick={onSave} disabled={saving || !dirty} className="cv-btn cv-btn-primary">
            {saving
              ? <Loader2 className="animate-spin" aria-hidden="true" />
              : <Save aria-hidden="true" />}
            <span className="cv-btn-label">Save Changes</span>
          </button>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

/* ================= Anchor nav ================= */

/* ================= Single-section tabs =================
   The ONLY section navigation. Selecting a tab mounts that section's
   editor + preview; nothing else is rendered. */

export function SectionTabs({ sections, active, onSelect }) {
  return (
    <nav className="cv-tabs" aria-label="Canvas sections">
      <div className="cv-tabs-inner" role="tablist">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={active === s.id}
            className="cv-tab"
            onClick={() => onSelect(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

/* ================= Workspace head ================= */

export function WorkspaceHead({ icon: Icon, title, desc, enabled }) {
  return (
    <div className="cv-work-head">
      <div className="min-w-0">
        <h2 className="cv-work-title">
          {Icon && <Icon aria-hidden="true" />}
          {title}
        </h2>
        {desc && <p className="cv-work-desc">{desc}</p>}
      </div>
      {enabled !== undefined && (
        <span className={`cv-enabled-dot${enabled ? ' is-on' : ''}`}>
          <i aria-hidden="true" />
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
      )}
    </div>
  );
}

/* ================= Collapsible editor/preview section ================= */

export function CanvasSection({
  id,
  icon: Icon,
  title,
  desc,
  enabled,
  collapsed,
  onToggleCollapse,
  collapsible = true,
  children,
}) {
  return (
    <section className="cv-section" id={id}>
      <button
        type="button"
        className={`cv-sec-head${collapsible ? ' is-collapsible' : ''}`}
        onClick={collapsible ? onToggleCollapse : undefined}
        aria-expanded={collapsible ? !collapsed : undefined}
      >
        <span className="cv-sec-head-text">
          <span className="cv-sec-title">
            {Icon && <Icon aria-hidden="true" />}
            {title}
          </span>
          {desc && <span className="cv-sec-desc block">{desc}</span>}
        </span>
        {enabled !== undefined && (
          <span className={`cv-enabled-dot${enabled ? ' is-on' : ''}`}>
            <i aria-hidden="true" />
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        )}
        {collapsible && (
          collapsed
            ? <ChevronDown className="cv-collapse-icon" aria-hidden="true" />
            : <ChevronUp className="cv-collapse-icon" aria-hidden="true" />
        )}
      </button>
      {!collapsed && <div className="cv-sec-body">{children}</div>}
    </section>
  );
}

/* ================= Editor / preview panes ================= */

export function EditorPane({ title, children }) {
  return (
    <div className="min-w-0">
      <p className="cv-pane-title">{title}</p>
      {children}
    </div>
  );
}

export function DeviceToggle({ mode, onChange, label = 'Preview' }) {
  return (
    <div className="cv-preview-head">
      <p className="cv-pane-title" style={{ marginBottom: 0 }}>{label}</p>
      <div className="cv-device" role="group" aria-label="Preview device">
        <button type="button" aria-pressed={mode !== 'mobile'} onClick={() => onChange('desktop')}>
          <Monitor aria-hidden="true" /> Desktop
        </button>
        <button type="button" aria-pressed={mode === 'mobile'} onClick={() => onChange('mobile')}>
          <Smartphone aria-hidden="true" /> Mobile
        </button>
      </div>
    </div>
  );
}

export function PreviewFrame({ mode, maxHeight = 560, children }) {
  const phone = mode === 'mobile';
  return (
    <div className={`cv-preview-frame${phone ? ' is-phone' : ''}`}>
      <div className="cv-preview-scroll" style={{ maxHeight }}>
        {children}
      </div>
    </div>
  );
}

/* ================= Compact form fields ================= */

export function Field({ label, hint, children }) {
  return (
    <div className="cv-field">
      {label && <label className="cv-label">{label}</label>}
      {children}
      {hint && <p className="cv-hint">{hint}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="cv-check">
      <span className="cv-switch">
        <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
        <i aria-hidden="true" />
      </span>
      {label}
    </label>
  );
}

/* ================= Row ⋮ menu (move up/down + actions, no clutter) ================= */

export function RowMenu({ onMoveUp, onMoveDown, onEdit, onDelete, onDuplicate, extra }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open ]);

  const act = (fn) => () => {
    setOpen(false);
    fn?.();
  };

  return (
    <div className="cv-menu-wrap" ref={ref}>
      <button type="button" className="cv-icon-btn" onClick={() => setOpen((v) => !v)} aria-label="Row actions" aria-expanded={open}>
        <EllipsisVertical aria-hidden="true" />
      </button>
      {open && (
        <div className="cv-menu" role="menu">
          <button type="button" onClick={act(onMoveUp)}>Move up</button>
          <button type="button" onClick={act(onMoveDown)}>Move down</button>
          {onEdit && <button type="button" onClick={act(onEdit)}>Edit</button>}
          {onDuplicate && <button type="button" onClick={act(onDuplicate)}>Duplicate</button>}
          {extra}
          {onDelete && (
            <button type="button" onClick={act(onDelete)} style={{ color: 'var(--delta-down)' }}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
