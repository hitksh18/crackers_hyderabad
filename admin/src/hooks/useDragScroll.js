import { useCallback, useEffect, useRef } from 'react';

/**
 * Pointer-based drag-to-scroll for horizontal rails (desktop grab, touch
 * swipe). Vertical touch scrolling is left to the browser via
 * `touch-action: pan-y` on the rail. Clicks on cards are suppressed when the
 * pointer actually dragged instead of tapped.
 */
const useDragScroll = (railRef) => {
  const state = useRef({ down: false, startX: 0, startScroll: 0, moved: 0 });

  const onPointerDown = useCallback(
    (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = railRef.current;
      if (!el) return;
      state.current = { down: true, startX: e.clientX, startScroll: el.scrollLeft, moved: 0 };
      el.classList.add('is-dragging');
    },
    [railRef]
  );

  const onPointerMove = useCallback(
    (e) => {
      const s = state.current;
      const el = railRef.current;
      if (!s.down || !el) return;
      const dx = e.clientX - s.startX;
      if (Math.abs(dx) > s.moved) s.moved = Math.abs(dx);
      el.scrollLeft = s.startScroll - dx;
    },
    [railRef]
  );

  const endDrag = useCallback(() => {
    const s = state.current;
    const el = railRef.current;
    if (!s.down) return;
    state.current = { ...s, down: false };
    el?.classList.remove('is-dragging');
    if (el && s.moved > 6) {
      el.dataset.dragHappened = '1';
      setTimeout(() => { delete el.dataset.dragHappened; }, 0);
    }
  }, [railRef]);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const suppressClick = (e) => {
      if (el.dataset.dragHappened) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('pointerleave', endDrag);
    el.addEventListener('click', suppressClick, true);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
      el.removeEventListener('pointerleave', endDrag);
      el.removeEventListener('click', suppressClick, true);
    };
  }, [railRef, onPointerDown, onPointerMove, endDrag]);
};

export default useDragScroll;