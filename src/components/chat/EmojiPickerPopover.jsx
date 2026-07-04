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

export default function EmojiPickerPopover({ onSelect }) {
  const pickerRef = useRef(null);
  const quickRow = useMemo(() => Array.from(new Set([...readRecent(), ...REACTION_EMOJIS])).slice(0, 8), []);

  useEffect(() => {
    import('emoji-picker-element');
  }, []);

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
    <div className="chat-emoji-popover">
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
