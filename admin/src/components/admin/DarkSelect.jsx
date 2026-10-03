import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * DarkSelect — theme-owned replacement for native <select>.
 *
 * A native select's opened list is rendered by the OS/browser (light/blue on
 * Chrome/Windows) and cannot be themed reliably, so brand and other admin
 * dropdowns use this instead. WAI-ARIA combobox/listbox pattern:
 * - Enter/Space/ArrowUp/ArrowDown open and move, Enter/Space select
 * - Escape closes and returns focus, Tab closes
 * - click outside closes, selecting closes
 * - options expose role=option + aria-selected; the trigger carries
 *   aria-expanded and aria-activedescendant.
 *
 * Visuals reuse the existing tokens only: surface-card panel, hairline
 * borders, ember focus ring, gold/ember selected marker. Trigger matches
 * .input-premium/.btn-outline height (44px) so control rows align.
 */
const DarkSelect = ({
  id,
  value,
  onChange,
  options = [],
  placeholder = 'Select an option',
  disabled = false,
  describedBy,
  invalid = false,
  className = '',
}) => {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const optionRefs = useRef([]);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const close = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  // Close on outside interaction (pointer + focus leaving the control).
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) close();
    };
    const onFocusIn = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open ]);

  // Keep the keyboard-active option visible without moving the page.
  useEffect(() => {
    if (open && activeIndex >= 0) {
      optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeIndex]);

  const choose = (index) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    close();
  };

  const openWithIndex = (index) => {
    setActiveIndex(index);
    setOpen(true);
  };

  const onTriggerKeyDown = (event) => {
    if (disabled) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) openWithIndex(selectedIndex >= 0 ? selectedIndex : 0);
        else setActiveIndex((i) => Math.min(options.length - 1, (i < 0 ? selectedIndex : i) + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) openWithIndex(selectedIndex >= 0 ? selectedIndex : options.length - 1);
        else setActiveIndex((i) => Math.max(0, (i < 0 ? selectedIndex : i) - 1));
        break;
      case 'Home':
        if (open) { event.preventDefault(); setActiveIndex(0); }
        break;
      case 'End':
        if (open) { event.preventDefault(); setActiveIndex(options.length - 1); }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!open) openWithIndex(selectedIndex >= 0 ? selectedIndex : 0);
        else if (activeIndex >= 0) choose(activeIndex);
        break;
      case 'Escape':
        if (open) { event.preventDefault(); close(); }
        break;
      case 'Tab':
        if (open) close();
        break;
      default:
        break;
    }
  };

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid ? 'true' : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openWithIndex(selectedIndex >= 0 ? selectedIndex : 0))}
        onKeyDown={onTriggerKeyDown}
        className="input-premium flex items-center justify-between gap-2 text-left"
      >
        <span className="min-w-0 flex-1 truncate" style={{ color: selected ? 'var(--text-strong)' : 'var(--text-subtle)' }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform duration-150"
          style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : undefined }}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={id}
          className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-60 overflow-y-auto rounded-[var(--r-md)] border py-1.5"
          style={{
            background: 'var(--surface-card)',
            borderColor: 'var(--hairline-strong)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {options.length === 0 && (
            <li className="px-4 py-2.5 text-sm" style={{ color: 'var(--text-subtle)' }}>
              No options yet.
            </li>
          )}
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li key={`${option.value}-${index}`} role="none">
                <button
                  ref={(node) => { optionRefs.current[index] = node; }}
                  id={`${listId}-opt-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  onClick={() => choose(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors"
                  style={{
                    background: isActive ? 'var(--surface-sunken)' : 'transparent',
                    borderLeft: `2px solid ${isSelected ? 'var(--ember-600)' : 'transparent'}`,
                    color: isSelected ? 'var(--text-strong)' : 'var(--text-body)',
                    fontWeight: isSelected ? 600 : 400,
                    cursor: option.disabled ? 'not-allowed' : 'pointer',
                    opacity: option.disabled ? 0.5 : 1,
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {isSelected && (
                    <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default DarkSelect;
