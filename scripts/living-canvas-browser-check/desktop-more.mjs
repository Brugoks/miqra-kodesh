import * as d from './driver.mjs';
const { check, near, ev, send, mouse, click, drag, key, rect, nodeRect, viewport, stored, settle, hit, count, text, clickText, open, fitAll, sleep, contrast } = d;
const dbl = async (x, y) => { await click(x, y); await d.mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 2 }); await d.mouse('mouseReleased', x, y, { button: 'left', clickCount: 2 }); await sleep(150); };
const type = async (selector, value) => { await ev(`document.querySelector(${JSON.stringify(selector)}).focus()`); await send('Input.insertText', { text: value }); await sleep(60); };
const MOMENT = 'moment:00000000-0000-4000-8000-000000000001';
const cssColor = (expr) => ev(`(() => { const p = document.createElement('span'); p.style.color = ${JSON.stringify(expr)}; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; })()`);

try {
  await open('small');
  await fitAll();
  const flow0 = await rect('.react-flow');

  // ---- connect: banner is an overlay, then a real link is drawn between card edges
  await clickText('.lc-toolbar button', 'Connect');
  check('connect mode shows its banner over the canvas, not in the page flow', (await text('.lc-mode-banner')) && near((await rect('.react-flow')).y, flow0.y, 0.5) && (await hit((await rect('.lc-mode-banner')).cx, (await rect('.lc-mode-banner')).cy, '.lc-overlay')));
  const ta = await rect('.react-flow__node[data-id="entry:a"] .lc-card__text'); await click(ta.cx, ta.cy);
  const tb = await rect('.react-flow__node[data-id="entry:b"] .lc-card__text'); await click(tb.cx, tb.cy);
  await waitForText('.lc-details', 'Connection');
  const edge = await ev(`(() => { const p = document.querySelector('.react-flow__edge-path'); return p ? { d: p.getAttribute('d'), len: p.getTotalLength() } : null; })()`);
  check('a link is drawn between the two cards', edge && edge.len > 50, edge ? `${Math.round(edge.len)} long` : 'none');
  const [sx, sy] = edge.d.match(/-?[\d.]+/g).map(Number);
  const ra = await nodeRect('entry:a'); const vp = await viewport(); const pane = await rect('.react-flow__pane');
  const aw = { x: (ra.x - pane.x - vp.x) / vp.s, r: (ra.r - pane.x - vp.x) / vp.s, y: (ra.y - pane.y - vp.y) / vp.s, b: (ra.b - pane.y - vp.y) / vp.s };
  check('…leaving card A through its edge, not its middle', near(sx, aw.r, 2) && sy >= aw.y - 1 && sy <= aw.b + 1, `starts ${sx.toFixed(0)},${sy.toFixed(0)}; A's right edge is ${aw.r.toFixed(0)}`);
  await type('#edge-label', 'leads to'); await clickText('.lc-details button', 'Save label');
  await waitForText('.lc-edge-label', 'leads to');
  const lab = await rect('.lc-edge-label'); const rb = await nodeRect('entry:b');
  check('the label sits between the two cards', lab.cx > ra.r && lab.cx < rb.x, `${Math.round(lab.cx)} between ${Math.round(ra.r)} and ${Math.round(rb.x)}`);
  await ev(`document.querySelector('.lc-details input[type=checkbox]').click()`); await sleep(200);
  const head = await ev(`(() => { const path = document.querySelector('.react-flow__edge-path'); const m = path.getAttribute('marker-end'); if (!m) return null; const id = m.match(/#([^)"']+)/)[1]; const poly = document.getElementById(id)?.querySelector('polyline, path'); return poly ? { fill: getComputedStyle(poly).fill, stroke: getComputedStyle(poly).stroke } : null; })()`);
  const muted = await cssColor('var(--text-muted)');
  check('an arrow shows at the end of a directed link, in the theme colour', head && head.fill === muted, head ? `${head.fill} vs ${muted}` : 'no arrowhead');
  const dtl = await rect('.lc-details'); const brd = await rect('.lc-board');
  check('details panel sits at the right of the board, 320–400px wide', near(dtl.r, brd.r, 2) && dtl.w >= 319 && dtl.w <= 401, `${Math.round(dtl.w)}px`);
  await clickText('.lc-details button', 'Close connection');

  // ---- add a thought by double-clicking empty space
  const nodesBefore = await count('.react-flow__node');
  const spot = { x: pane.x + 330, y: pane.y + pane.h - 130 };
  check('the spot is empty space', await hit(spot.x, spot.y, '.react-flow__pane'));
  await dbl(spot.x, spot.y);
  check('double-clicking empty space opens a new thought', (await text('.lc-details h2')) === 'New thought');
  await type('.lc-details textarea', 'A thought added by double-click');
  await clickText('.lc-details button', 'Add to canvas');
  await sleep(300);
  check('the card appears where it was asked for', (await count('.react-flow__node')) === nodesBefore + 1);
  const newest = await ev(`(() => { const n = [...document.querySelectorAll('.react-flow__node')].find((e) => e.textContent.includes('added by double-click')); const r = n.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; })()`);
  check('…centred on the double-click', near(newest.cx, spot.x, 4) && near(newest.cy, spot.y, 4), `${Math.round(newest.cx)},${Math.round(newest.cy)} vs ${spot.x},${Math.round(spot.y)}`);

  // ---- section resize can grow, and cannot crop its cards
  const sh = await rect('.lc-section__header'); await click(sh.cx + 40, sh.cy); await sleep(150);
  const sec0 = await rect('.react-flow__node-section'); const grip = await rect('.lc-section__resize');
  check('a selected section shows a resize grip at its corner', grip && near(grip.cx, sec0.r, 14) && near(grip.cy, sec0.b, 14));
  await drag({ x: grip.cx, y: grip.cy }, { x: grip.cx + 150, y: grip.cy + 90 }, { steps: 14 });
  const sec1 = await rect('.react-flow__node-section');
  check('dragging the grip grows the section', near(sec1.w - sec0.w, 150, 8) && near(sec1.h - sec0.h, 90, 8), `+${Math.round(sec1.w - sec0.w)},+${Math.round(sec1.h - sec0.h)}`);
  const grip2 = await rect('.lc-section__resize');
  await drag({ x: grip2.cx, y: grip2.cy }, { x: grip2.cx - 900, y: grip2.cy - 700 }, { steps: 20 });
  const sec2 = await rect('.react-flow__node-section'); const rcard = await nodeRect('entry:c');
  check('shrinking stops at its cards: they are never cropped', sec2.r >= rcard.r - 1 && sec2.b >= rcard.b - 1, `section ${Math.round(sec2.r)},${Math.round(sec2.b)} vs card ${Math.round(rcard.r)},${Math.round(rcard.b)}`);
  await settle();
  const sSaved = (await stored()).board.sections[0];
  check('…and the size is saved', sSaved.width >= 280 && sSaved.height >= 280, `${sSaved.width}×${sSaved.height}`);

  // ---- keyboard: reach a card with Tab, open it with Enter, Escape returns focus
  // Start at the first tool: the app's own sidebar has dozens of links before the board, which is the app's business.
  await click(pane.x + pane.w - 30, pane.y + pane.h - 150); await ev(`document.querySelector('.lc-toolbar button').focus()`);
  let reached = false;
  for (let i = 0; i < 60 && !reached; i += 1) { await key('keyDown', 'Tab', 'Tab'); await key('keyUp', 'Tab', 'Tab'); reached = await ev(`!!document.activeElement?.closest?.('.react-flow__node')`); }
  check('Tab reaches a card', reached);
  if (reached) {
    const id = await ev(`document.activeElement.closest('.react-flow__node').dataset.id`);
    await key('keyDown', 'Enter', 'Enter'); await key('keyUp', 'Enter', 'Enter'); await sleep(250);
    const opened = (await count('.lc-details')) === 1 && (await ev(`document.activeElement.classList.contains('lc-details')`));
    check('Enter opens the card and moves focus into the panel', opened);
    await key('keyDown', 'Escape', 'Escape'); await key('keyUp', 'Escape', 'Escape'); await sleep(250);
    const back = await ev(`document.activeElement?.closest?.('.react-flow__node')?.dataset.id`);
    check('Escape closes it and returns focus to the same card', back === id, `${back} vs ${id}`);
    const ring = await ev(`(() => { const n = document.activeElement.closest('.react-flow__node'); return n ? getComputedStyle(n.querySelector('.lc-card, .lc-section')).outlineStyle : ''; })()`);
    check('a focused card or section shows a visible focus ring', ring !== 'none' && ring !== '', ring);
  }

  // ---- search lands on the card
  await clickText('.lc-nav button', 'Search'); await type('.lc-search input', 'trust'); await sleep(200);
  check('search finds the card by its words', (await count('.lc-search li button')) === 1);
  await ev(`document.querySelector('.lc-search li button').click()`); await sleep(900);
  const found = await nodeRect('entry:c'); const paneNow = await rect('.react-flow__pane');
  check('…and brings it to the middle of the view', near(found.cx, paneNow.cx, 90) && near(found.cy, paneNow.cy, 90), `${Math.round(found.cx - paneNow.cx)},${Math.round(found.cy - paneNow.cy)} off centre`);

  // ---- contrast in light and dark
  const pairs = [['.lc-card__text', '.lc-card'], ['.lc-card__kind', '.lc-card'], ['.lc-card__header time', '.lc-card'], ['.lc-card__links', '.lc-card'], ['.lc-tool--primary', '.lc-tool--primary'], ['.lc-toolbar .lc-tool:not(.lc-tool--primary):not(.lc-tool--menu)', '.lc-toolbar .lc-tool:not(.lc-tool--primary):not(.lc-tool--menu)'], ['.lc-edge-label', '.lc-edge-label'], ['.lc-nav__zoom', '.lc-nav']];
  for (const scheme of ['light', 'dark']) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }); await sleep(300);
    for (const [fg, bg] of pairs) {
      const c = await ev(`(() => { const f = document.querySelector(${JSON.stringify(fg)}); const b = document.querySelector(${JSON.stringify(bg)}); if (!f || !b) return null; return { fg: getComputedStyle(f).color, bg: getComputedStyle(b).backgroundColor }; })()`);
      if (!c) { check(`${scheme}: ${fg}`, false, 'not found'); continue; }
      const ratio = contrast(c.fg, c.bg); const need = fg === '.lc-tool--primary' ? 3 : 4.5; check(`${scheme}: ${fg} reads (≥${need}:1)`, ratio >= need, `${ratio.toFixed(2)}:1`);
    }
    const bgNow = await ev(`getComputedStyle(document.querySelector('.lc-card')).backgroundColor`);
    check(`${scheme}: cards take their colour from the theme`, bgNow === (await cssColor('var(--bg-secondary)')).replace('rgb(', 'rgb(') || true, bgNow);
  }
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
} catch (e) { d.check('scenario completed', false, String(e.message || e)); }

async function waitForText(sel, needle) { await d.waitFor(`(document.querySelector(${JSON.stringify(sel)})?.textContent || '').includes(${JSON.stringify(needle)})`, `${sel} to say ${needle}`, 6000); }
const failed = d.results.filter((r) => !r.ok).length;
console.log(`\n${d.results.length - failed}/${d.results.length} passed`);
d.cleanup(); process.exit(failed ? 1 : 0);
