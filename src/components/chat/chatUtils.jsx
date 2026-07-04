import { renderChatMarkdown } from '../../lib/chatMarkdown';

export const REACTION_EMOJIS = ['🙏', '❤️', '🔥', '👍', '😂', '🎵', '🙌', '😮'];
export const MESSAGE_PAGE_SIZE = 50;
export const MENTION_RE = /@\[([^\]]*)\]\(([^)]+)\)/g;

export const formatTime = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
};

export const formatDayLabel = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, yesterday)) return 'Yesterday';

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  }).format(date);
};

export const isSameDay = (left, right) => {
  if (!left || !right) return false;
  const a = left instanceof Date ? left : new Date(left);
  const b = right instanceof Date ? right : new Date(right);
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
};

export const shouldGroupWithPrevious = (message, previous) => {
  if (!message || !previous) return false;
  if (message.reply_to_id) return false;
  if (message.author_id !== previous.author_id) return false;
  if (!isSameDay(message.created_at, previous.created_at)) return false;
  return Math.abs(new Date(message.created_at) - new Date(previous.created_at)) <= 5 * 60 * 1000;
};

export const sortMessagesByCreatedAt = (messages) => (
  [...messages].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
);

export const mergeMessagesById = (current, incoming) => {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return sortMessagesByCreatedAt(Array.from(byId.values()));
};

export function renderBody(text) {
  return renderChatMarkdown(text);
}

export function parseMentionIds(text) {
  const ids = [];
  const re = new RegExp(MENTION_RE);
  let match;

  while ((match = re.exec(text || '')) !== null) {
    if (!ids.includes(match[2])) ids.push(match[2]);
  }

  return ids;
}

export const previewText = (message) => {
  if (!message) return '';
  if (message.deleted_at) return 'This message was deleted';
  if (message.body) return message.body.replace(MENTION_RE, '@$1');
  if (message.image_url) return 'photo';
  return '';
};
