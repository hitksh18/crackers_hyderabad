import { useCallback, useRef, useState } from 'react';

/**
 * Canvas edit history — undo / redo for the whole Canvas draft.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DESIGN NOTE
 * The Canvas already drives every edit through one `setDraft` call. This hook
 * simply BECOMES that setter: the page swaps
 *
 *     const [draft, setDraft] = useState(null);
 *
 * for
 *
 *     const { draft, setDraft, undo, ... } = useCanvasHistory(null);
 *
 * and no existing edit site changes. Every patchText / patchSite / setBuilderEnabled /
 * moveSection / duplicateSection call is captured automatically, which is why this
 * is additive rather than a rewrite.
 *
 * Coalescing: an admin typing a heading produces a `setDraft` per keystroke.
 * Recording each one would make Undo step a single character, so edits that land
 * within COALESCE_MS of each other collapse into one history entry — one Undo
 * returns the field to the value it had before the burst of typing. Structural
 * edits (add / remove / duplicate / reorder) are separated by more than the
 * window, so they always get their own entry.
 *
 * The stack is bounded: a long session cannot grow it without limit, and the
 * oldest entries are dropped first.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const COALESCE_MS = 700;
const MAX_ENTRIES = 60;

export function useCanvasHistory(initial) {
  const [state, setState] = useState({ past: [], present: initial ?? null, future: [] });

  // Mirrors `state` so the callbacks below can read the latest value without
  // being re-created (and therefore without stale-closure bugs at ~40 edit sites).
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastEditAt = useRef(0);

  const setDraft = useCallback((updater) => {
    const current = stateRef.current;
    const next = typeof updater === 'function' ? updater(current.present) : updater;

    // Same value (or no-op updater): nothing to record.
    if (Object.is(next, current.present)) return;

    const now = Date.now();
    const coalesce = now - lastEditAt.current < COALESCE_MS;
    lastEditAt.current = now;

    setState({
      // While coalescing we keep the older `past` so the whole burst undoes at once.
      past: coalesce
        ? current.past
        : [...current.past.slice(-(MAX_ENTRIES - 1)), current.present],
      present: next,
      // Any new edit invalidates the redo branch.
      future: [],
    });
  }, []);

  const undo = useCallback(() => {
    const current = stateRef.current;
    if (current.past.length === 0) return;
    const previous = current.past[current.past.length - 1];
    // Break coalescing so the next edit starts a fresh entry rather than being
    // merged into the one we just rewound.
    lastEditAt.current = 0;
    setState({
      past: current.past.slice(0, -1),
      present: previous,
      future: [current.present, ...current.future].slice(0, MAX_ENTRIES),
    });
  }, []);

  const redo = useCallback(() => {
    const current = stateRef.current;
    if (current.future.length === 0) return;
    const next = current.future[0];
    lastEditAt.current = 0;
    setState({
      past: [...current.past, current.present].slice(-MAX_ENTRIES),
      present: next,
      future: current.future.slice(1),
    });
  }, []);

  /**
   * Replace the draft outright and clear the history.
   *
   * Used when the Canvas loads the stored configuration (a fresh starting point,
   * not something the admin can Undo back to) and when Discard returns the draft
   * to the last saved state.
   */
  const reset = useCallback((value) => {
    lastEditAt.current = 0;
    setState({ past: [], present: value ?? null, future: [] });
  }, []);

  return {
    draft: state.present,
    setDraft,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    reset,
  };
}

export default useCanvasHistory;