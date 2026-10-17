// Where a connection meets two cards. A link runs between the nearest points of
// their edges rather than from fixed handles, so it follows a card wherever it
// is dragged and reads as attached to the card, not to a dot on it. Pure, with
// rectangles in world coordinates, so the maths is tested without a renderer.

/** The point on `rect`'s border that lies on the line from its centre toward `toward`'s centre. */
export function borderPoint(rect, toward) {
  const halfW = rect.width / 2;
  const halfH = rect.height / 2;
  const cx = rect.x + halfW;
  const cy = rect.y + halfH;
  const dx = toward.x + toward.width / 2 - cx;
  const dy = toward.y + toward.height / 2 - cy;
  if (!dx && !dy) return { x: cx, y: cy + halfH };
  // Scale the direction until it touches whichever side it reaches first.
  const scale = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/** Which side of `rect` a border point sits on, as React Flow's position names. */
export function sideOf(rect, point) {
  const eps = 1;
  if (point.x <= rect.x + eps) return 'left';
  if (point.x >= rect.x + rect.width - eps) return 'right';
  if (point.y <= rect.y + eps) return 'top';
  return 'bottom';
}

export function floatingEdge(source, target) {
  const from = borderPoint(source, target);
  const to = borderPoint(target, source);
  return { sx: from.x, sy: from.y, tx: to.x, ty: to.y, sourcePosition: sideOf(source, from), targetPosition: sideOf(target, to) };
}
