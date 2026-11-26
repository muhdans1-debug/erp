/**
 * Unified Keyboard-Aware Focus & Auto-Scroll Utility
 * Eliminates blind typing on landscape POS devices (such as the Sunmi D2 Mini 1280x800)
 * where the on-screen software keyboard consumes the bottom 45%-55% of the screen.
 */

/**
 * Handles explicit focus events on individual input/textarea elements.
 */
export function handleKeyboardFocus(e: React.FocusEvent<HTMLElement>): void {
  const el = e.currentTarget;
  if (!el) return;

  // Allow Android virtual keyboard transition to settle and trigger adjustResize
  setTimeout(() => {
    try {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    } catch {
      el.scrollIntoView(true);
    }
  }, 260);
}

/**
 * Attaches a global, zero-overhead focus listener to window.
 * Whenever any text input or textarea is tapped, it automatically scrolls it
 * into the visible upper half of the screen.
 */
export function initGlobalKeyboardAutoScroll(): () => void {
  if (typeof window === 'undefined') return () => {};

  const onGlobalFocusIn = (e: FocusEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const tagName = target.tagName?.toLowerCase();
    const isTextInput =
      tagName === 'textarea' ||
      (tagName === 'input' &&
        !['checkbox', 'radio', 'button', 'submit', 'color', 'range', 'file'].includes(
          (target as HTMLInputElement).type
        ));

    if (isTextInput) {
      setTimeout(() => {
        try {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
        } catch {
          target.scrollIntoView(true);
        }
      }, 260);
    }
  };

  window.addEventListener('focusin', onGlobalFocusIn);
  return () => {
    window.removeEventListener('focusin', onGlobalFocusIn);
  };
}

