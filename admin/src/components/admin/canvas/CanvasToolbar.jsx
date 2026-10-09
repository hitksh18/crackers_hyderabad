import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  Eye,
  Loader2,
  Pencil,
  Redo2,
  Rocket,
  Save,
  Trash2,
  Undo2,
} from 'lucide-react';
import { DeviceToggle } from '../homepage/CanvasChrome';
import './canvas-toolbar.css';

/**
 * Canvas editor toolbar.
 *
 * Purely presentational: it owns no Canvas state. Every handler is passed in, so
 * the existing save/publish flow, the existing DeviceToggle and the existing
 * Firestore persistence are reused rather than duplicated.
 *
 * Save Draft vs Save & Publish
 *   Both call the same save routine. The only difference is the `status` written
 *   into settings/homepageConfig ('draft' vs 'published'). See the note on the
 *   Draft button below for the caveat that currently applies to drafts.
 */
export default function CanvasToolbar({
  pageLabel = 'Home',
  pageSubLabel = 'Canvas',
  editorMode,
  onModeChange,
  device,
  onDeviceChange,
  deviceLocked = false,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onDiscard,
  canDiscard = false,
  onSaveDraft,
  onSavePublish,
  saving = false,
  saveState = 'saved',
  saveError = '',
}) {
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef(null);

  /* Close the discard confirmation on outside click or Escape — an inline
     confirm must never be able to strand the toolbar open. */
  useEffect(() => {
    if (!confirming) return undefined;
    const onDown = (e) => {
      if (confirmRef.current && !confirmRef.current.contains(e.target)) setConfirming(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setConfirming(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [confirming]);

  const state = saveError ? 'error' : saving ? 'saving' : saveState;
  const statusText = saveError
    ? 'Save failed'
    : saving
      ? 'Saving…'
      : saveState === 'dirty'
        ? 'Unsaved changes'
        : 'Saved';

  return (
    <div className="cv-toolbar" role="toolbar" aria-label="Canvas editor controls">
      {/* -------- left: navigation + page + mode -------- */}
      <div className="cv-tb-group">
        <a href="/dashboard" className="cv-tb-btn">
          <ChevronLeft aria-hidden="true" />
          <span className="cv-tb-label">Back to Admin</span>
        </a>
      </div>

      <div className="cv-tb-sep" aria-hidden="true" />

      <div className="cv-tb-page">
        <span className="cv-tb-page-label">{pageLabel}</span>
        <span className="cv-tb-page-sub">{pageSubLabel}</span>
      </div>

      <div className="cv-tb-group" role="group" aria-label="Editor mode">
        <div className="cv-tb-seg">
          <button
            type="button"
            aria-pressed={editorMode === 'edit'}
            onClick={() => onModeChange('edit')}
          >
            <Pencil aria-hidden="true" />
            Edit
          </button>
          <button
            type="button"
            aria-pressed={editorMode === 'preview'}
            onClick={() => onModeChange('preview')}
          >
            <Eye aria-hidden="true" />
            Preview
          </button>
        </div>
      </div>

      <div className="cv-tb-sep" aria-hidden="true" />

      {/* -------- device: the existing DeviceToggle, reused -------- */}
      <div className="cv-tb-device">
        {deviceLocked ? (
          <span className="cv-tb-page-sub">Device preview not applicable</span>
        ) : (
          <DeviceToggle mode={device} onChange={onDeviceChange} />
        )}
      </div>

      <div className="cv-tb-spacer" />

      {/* -------- right: history, discard, save, status -------- */}
      <div className="cv-tb-group">
        <button
          type="button"
          className="cv-tb-btn cv-tb-btn--icon"
          onClick={onUndo}
          disabled={!canUndo || saving}
          title="Undo"
          aria-label="Undo"
        >
          <Undo2 aria-hidden="true" />
        </button>
        <button
          type="button"
          className="cv-tb-btn cv-tb-btn--icon"
          onClick={onRedo}
          disabled={!canRedo || saving}
          title="Redo"
          aria-label="Redo"
        >
          <Redo2 aria-hidden="true" />
        </button>
      </div>

      <div className="cv-tb-group">
        {confirming ? (
          <div className="cv-tb-confirm" ref={confirmRef}>
            <span>Discard unsaved changes?</span>
            <button
              type="button"
              className="cv-tb-btn"
              onClick={() => {
                setConfirming(false);
                onDiscard();
              }}
            >
              Discard
            </button>
            <button type="button" className="cv-tb-btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="cv-tb-btn cv-tb-btn--danger"
            onClick={() => setConfirming(true)}
            disabled={!canDiscard || saving}
            title="Discard unsaved changes"
          >
            <Trash2 aria-hidden="true" />
            <span className="cv-tb-label">Discard</span>
          </button>
        )}
      </div>

      <div className="cv-tb-group">
        {/* ─────────────────────────────────────────────────────────────────
            Save Draft writes the same configuration with status: 'draft'.

            CAVEAT, stated in the UI rather than hidden: the public homepage
            reader does not currently filter on `status`, so a draft is visible on
            the live site until it is published. Making drafts truly private
            would mean changing the customer website, which is outside the Canvas
            scope. The button is real — it persists and marks the document as a
            draft — it just does not yet shield the live page.
            ───────────────────────────────────────────────────────────────── */}
        <button
          type="button"
          className="cv-tb-btn"
          onClick={onSaveDraft}
          disabled={saving}
          title="Save changes without publishing"
        >
          <Save aria-hidden="true" />
          <span className="cv-tb-label">Save Draft</span>
        </button>

        <button
          type="button"
          className="cv-tb-btn cv-tb-btn--primary"
          onClick={onSavePublish}
          disabled={saving}
          title="Save and publish to the live website"
        >
          {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Rocket aria-hidden="true" />}
          <span className="cv-tb-label">Save &amp; Publish</span>
        </button>
      </div>

      <div
        className={`cv-tb-status cv-tb-status--${state}`}
        title={saveError || statusText}
        role="status"
        aria-live="polite"
      >
        <span className="cv-tb-status-dot" aria-hidden="true" />
        <span>{statusText}</span>
      </div>
    </div>
  );
}