import { useEffect, useRef, useState } from 'react';
import {
  EllipsisVertical,
  Monitor,
  Smartphone,
  Tablet,
} from 'lucide-react';

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

/* ================= Collapsible editor section ================= */

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
        <button type="button" aria-pressed={mode === 'desktop' || mode === undefined} onClick={() => onChange('desktop')}>
          <Monitor aria-hidden="true" /> Desktop
        </button>
        <button type="button" aria-pressed={mode === 'tablet'} onClick={() => onChange('tablet')}>
          <Tablet aria-hidden="true" /> Tablet
        </button>
        <button type="button" aria-pressed={mode === 'mobile'} onClick={() => onChange('mobile')}>
          <Smartphone aria-hidden="true" /> Mobile
        </button>
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
