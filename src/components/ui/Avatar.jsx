import { useState } from 'react';
import './Avatar.css';

// Up to two initials from a name ("Daniel Quiambao" → "DQ", "Sarah" → "S").
function getInitials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Stable, pleasant background color derived from the name, so the same person is
// always the same color. Spreads hues around the wheel via a simple string hash.
function colorFromName(name) {
  const key = name || '?';
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  // Fixed 45% lightness keeps every generated color dark enough for white text.
  return `hsl(${hue}, 55%, 45%)`;
}

/**
 * Avatar — shows a user's photo when available, otherwise a colored circle with
 * their initials. Falls back to initials automatically if the image fails to load.
 */
export default function Avatar({ src, name, size = 36, className = '', title }) {
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;
  const dimension = typeof size === 'number' ? `${size}px` : size;

  if (showImg) {
    return (
      <img
        src={src}
        alt={name || 'avatar'}
        title={title || name || undefined}
        className={`avatar avatar-img ${className}`}
        style={{ width: dimension, height: dimension }}
        onError={() => setFailed(true)}
      />
    );
  }

  const bg = colorFromName(name);
  return (
    <span
      className={`avatar avatar-initials ${className}`}
      title={title || name || undefined}
      aria-label={name || 'avatar'}
      style={{
        width: dimension,
        height: dimension,
        background: bg,
        color: '#fff',
        fontSize: `calc(${dimension} * 0.4)`,
      }}
    >
      {getInitials(name)}
    </span>
  );
}
