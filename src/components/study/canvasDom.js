/** Scrolls a cited source into view and focuses it, so a citation lands the reader on its evidence. */
export function revealCanvasSource(id) {
  const element = document.getElementById(`canvas-${id}`);
  element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  element?.focus({ preventScroll: true });
}
