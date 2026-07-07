import { useEffect, useMemo, useRef } from 'react';
import { REACTION_EMOJIS } from './chatUtils';

const RECENT_KEY = 'chat-recent-emojis';

const readRecent = () => {
  try {
    return JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
};

const writeRecent = (emoji) => {
  try {
    const next = [emoji, ...readRecent().filter((item) => item !== emoji)].slice(0, 8);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Recent emoji are a convenience only.
  }
};

export default function EmojiPickerPopover({ onSelect, onClose }) {
  const pickerRef = useRef(null);
  const rootRef = useRef(null);
  const quickRow = useMemo(() => Array.from(new Set([...readRecent(), ...REACTION_EMOJIS])).slice(0, 8), []);

  useEffect(() => {
    import('emoji-picker-element');
  }, []);

  useEffect(() => {
    if (!onClose) return undefined;

    const handlePointerDown = (event) => {
      // The wrapper around the popover also holds its toggle button; closing
      // here on that button's press would make its click immediately reopen.
      const boundary = rootRef.current?.parentElement || rootRef.current;
      if (boundary && boundary.contains(event.target)) return;
      onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return undefined;

    const handleEmojiClick = (event) => {
      const emoji = event.detail?.unicode;
      if (!emoji) return;
      writeRecent(emoji);
      onSelect(emoji);
    };

    picker.addEventListener('emoji-click', handleEmojiClick);
    return () => picker.removeEventListener('emoji-click', handleEmojiClick);
  }, [onSelect]);

  return (
    <div className="chat-emoji-popover" ref={rootRef}>
      <div className="chat-emoji-quick-row">
        {quickRow.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              writeRecent(emoji);
              onSelect(emoji);
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
      <emoji-picker ref={pickerRef} class="chat-emoji-web-picker" />
    </div>
  );
}
