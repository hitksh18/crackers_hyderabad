import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, CheckCircle2, Info } from 'lucide-react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { modalVariants } from '../lib/motion';

const TONES = {
  warning: { Icon: AlertTriangle, colour: 'var(--saffron-400)', wash: 'rgba(247, 174, 44, 0.14)' },
  danger: { Icon: AlertTriangle, colour: 'var(--crimson-600)', wash: 'rgba(203, 42, 42, 0.12)' },
  success: { Icon: CheckCircle2, colour: 'var(--leaf-600)', wash: 'rgba(44, 122, 83, 0.12)' },
  info: { Icon: Info, colour: 'var(--gold-600)', wash: 'rgba(210, 166, 79, 0.14)' },
  confirm: { Icon: AlertTriangle, colour: 'var(--ember-600)', wash: 'rgba(195, 58, 20, 0.12)' },
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

const CustomModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = 'confirm',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  requiresInput = false,
  inputPlaceholder = '',
  expectedInput = '',
  busy = false,
  busyText = '',
}) => {
  const [inputValue, setInputValue] = useState('');
  const reduced = useReducedMotion();
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  const tone = TONES[type] || TONES.confirm;
  const { Icon } = tone;
  const confirmDisabled = busy || (requiresInput && inputValue !== expectedInput);

  // Fresh input for every opening so a previous typed confirmation can never
  // leak into the next modal.
  useEffect(() => {
    if (isOpen) setInputValue('');
  }, [isOpen]);

  const handleCancel = useCallback(() => {
    setInputValue('');
    onClose();
  }, [onClose]);

  const handleConfirm = () => {
    if (busy) return;
    if (requiresInput) {
      if (inputValue === expectedInput) {
        onConfirm(inputValue);
        setInputValue('');
      }
      return;
    }
    onConfirm();
  };

  // Lock the page behind the dialog, remember focus, and restore it on close.
  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocused.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const focusFirst = window.setTimeout(() => {
      const node = panelRef.current?.querySelector(FOCUSABLE);
      node?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusFirst);
      document.body.style.overflow = overflow;
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, [isOpen]);

  // Escape closes; Tab stays inside the dialog.
  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        handleCancel();
        return;
      }

      if (event.key !== 'Tab') return;

      const nodes = panelRef.current?.querySelectorAll(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, handleCancel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.001 : 0.18 }}
            onClick={handleCancel}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="custom-modal-title"
            aria-describedby="custom-modal-message"
            variants={modalVariants(reduced)}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="glass-strong relative max-h-[90vh] w-full max-w-md overflow-y-auto"
          >
            <div
              className="relative px-6 py-5 text-white"
              style={{ background: 'var(--grad-maroon)' }}
            >
              <h3
                id="custom-modal-title"
                className="subsection-title pr-10"
                style={{ color: '#FFFFFF' }}
              >
                {title}
              </h3>
              <button
                type="button"
                onClick={handleCancel}
                aria-label="Close dialog"
                className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
              >
                <X className="h-5 w-5" strokeWidth={2.2} />
              </button>
            </div>

            <div className="px-6 py-7">
              <div className="flex flex-col items-center space-y-4 text-center">
                <span
                  aria-hidden="true"
                  className="flex h-16 w-16 items-center justify-center rounded-full"
                  style={{ background: tone.wash }}
                >
                  <Icon className="h-8 w-8" style={{ color: tone.colour }} strokeWidth={1.8} />
                </span>

                <p
                  id="custom-modal-message"
                  className="whitespace-pre-line text-base leading-relaxed"
                  style={{ color: 'var(--text-body)' }}
                >
                  {message}
                </p>

                {requiresInput && (
                  <div className="w-full text-left">
                    <label
                      htmlFor="custom-modal-input"
                      className="label-caps mb-2 block text-center"
                    >
                      Type to confirm
                    </label>
                    <input
                      id="custom-modal-input"
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder={inputPlaceholder}
                      disabled={busy}
                      aria-invalid={inputValue.length > 0 && confirmDisabled}
                      className="input-premium text-center font-semibold"
                      autoFocus
                    />
                    {inputValue.length > 0 && confirmDisabled && (
                      <p className="mt-2 text-center text-xs" style={{ color: 'var(--crimson-600)' }}>
                        That does not match. Enter exactly: {expectedInput}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div
              className="flex flex-col-reverse gap-3 px-6 py-4 sm:flex-row sm:justify-end"
              style={{ background: 'var(--surface-sunken)', borderTop: '1px solid var(--hairline)' }}
            >
              <button type="button" onClick={handleCancel} className="btn-outline">
                {cancelText}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirmDisabled}
                aria-busy={busy}
                className="btn-primary"
                style={
                  type === 'danger'
                    ? { background: 'linear-gradient(122deg, #AA1F1F, #CB2A2A)' }
                    : type === 'success'
                    ? { background: 'linear-gradient(122deg, #245F42, #2C7A53)' }
                    : undefined
                }
              >
                {busy ? (busyText || 'Working...') : confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default CustomModal;
