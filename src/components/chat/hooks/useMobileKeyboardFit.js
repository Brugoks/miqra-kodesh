import { useEffect } from 'react';

/* iOS ignores `interactive-widget=resizes-content`: when the on-screen
 * keyboard opens it pans the whole page upward to expose the focused input,
 * hiding the topbar and channel header. While the keyboard is up, publish the
 * visible height as --chat-vvh and set body.chat-keyboard-open so the CSS can
 * shrink the chat shell to fit above the keyboard, then undo the pan — with
 * everything already visible, the browser has nothing left to scroll away.
 *
 * Android with resizes-content never trips the keyboard check here
 * (window.innerHeight shrinks along with the visual viewport), so this is
 * effectively iOS-only at runtime. */
export default function useMobileKeyboardFit() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;

    const update = () => {
      const keyboardOpen = window.innerHeight - viewport.height > 80;
      if (keyboardOpen) {
        document.documentElement.style.setProperty('--chat-vvh', `${viewport.height}px`);
        document.body.classList.add('chat-keyboard-open');
        if (viewport.offsetTop > 0 || window.scrollY > 0) window.scrollTo(0, 0);
      } else {
        document.documentElement.style.removeProperty('--chat-vvh');
        document.body.classList.remove('chat-keyboard-open');
      }
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      document.documentElement.style.removeProperty('--chat-vvh');
      document.body.classList.remove('chat-keyboard-open');
    };
  }, []);
}
