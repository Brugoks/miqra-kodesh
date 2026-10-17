import { cardContent, excerpt } from '../../../lib/canvasBoard';

/** How a card is named in lists and pickers: its kind and the start of its words. */
export function cardTitle(canvas, node, max = 60) {
  const content = cardContent(canvas, node);
  if (!content) return 'Removed card';
  const words = excerpt(content, max);
  return `${content.label}${words ? ` · ${words}` : ''}`;
}

export const sectionName = (section) => section.title.trim() || 'Untitled section';
