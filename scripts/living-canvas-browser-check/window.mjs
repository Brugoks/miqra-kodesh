// Full screen on a desktop: the canvas fills the whole browser window, over the app's real sidebar and header.
import * as d from './driver.mjs';
const { check, near, ev, click, drag, key, rect, nodeRect, viewport, count, open, sleep, hit, waitFor, stored, settle } = d;
const W = 1280; const H = 900;
const inFullscreen = () => ev(`!!document.querySelector('.lc-workspace--fullscreen')`);
const press = async (k, code) => { await key('keyDown', k, code); await key('keyUp', k, code); await sleep(250); };
const fullScreenButton = () => rect('[aria-label="Full screen"]');

try {
  await open('small');
  await d.fitAll();
  const inline = { board: await rect('.lc-board'), pane: await rect('.react-flow__pane') };
  check('inline, the canvas is boxed in by the app\'s sidebar and page width', inline.board.w < W - 200, `${Math.round(inline.board.w)}px of a ${W}px window`);

  const button = await fullScreenButton();
  check('a desktop shows the Full screen button', button && button.w >= 36 && button.h >= 36, button ? `${Math.round(button.w)}×${Math.round(button.h)}` : 'hidden');
  await click(button.cx, button.cy);
  await waitFor(`!!document.querySelector('.lc-workspace--fullscreen')`, 'full screen');
  await sleep(400);

  // ---- it fills the window, over the app's own chrome
  const ws = await rect('.lc-workspace--fullscreen');
  check('the workspace fills the whole browser window', ws && near(ws.x, 0, 0.5) && near(ws.y, 0, 0.5) && near(ws.w, W, 0.5) && near(ws.h, H, 0.5), ws ? `${Math.round(ws.w)}×${Math.round(ws.h)} at ${Math.round(ws.x)},${Math.round(ws.y)}` : 'none');
  const chrome = await ev(`(() => { const out = {}; for (const sel of ['.sidebar', '.layout-topbar', 'aside', 'nav']) { const e = document.querySelector(sel); if (e && !e.closest('.lc-workspace')) { const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) out[sel] = { x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 200) }; } } return out; })()`);
  const covered = Object.entries(chrome);
  console.log('info    app chrome found under it:', covered.map(([sel]) => sel).join(', ') || 'none');
  let allCovered = true; for (const [, at] of covered) allCovered = allCovered && (await hit(at.x, at.y, '.lc-workspace--fullscreen'));
  check('it covers the sidebar and header, so nothing behind it can be hit', covered.length > 0 && allCovered);
  check('real screen full screen is not requested with a mouse', (await ev(`document.fullscreenElement === null`)));
  check('the page behind does not scroll', await ev(`document.body.classList.contains('lc-fullscreen-lock') && getComputedStyle(document.body).overflow === 'hidden'`));

  // ---- the canvas takes the room
  const full = { board: await rect('.lc-board'), pane: await rect('.react-flow__pane'), bar: await rect('.lc-bar') };
  check('the canvas spans the window and reaches its bottom edge', near(full.board.w, W, 1) && near(full.board.b, H, 1), `board ${Math.round(full.board.w)}×${Math.round(full.board.h)}`);
  check('it is much larger than inline', full.pane.w * full.pane.h > inline.pane.w * inline.pane.h * 1.3, `${Math.round(inline.pane.w)}×${Math.round(inline.pane.h)} → ${Math.round(full.pane.w)}×${Math.round(full.pane.h)}`);
  check('the bar is one slim row', full.bar.h <= 64, `${Math.round(full.bar.h)} px`);
  const labels = await ev(`[...document.querySelectorAll('.lc-bar button, .lc-bar input')].filter((b) => b.getClientRects().length > 0).map((b) => (b.getAttribute('aria-label') || b.textContent).trim()).join(' | ')`);
  check('a window has room for the rest of the bar: Exit, the name, the view switch, library and settings', /Exit full screen/.test(labels) && /Canvas title/.test(labels) && /Outline/.test(labels) && /Your canvases/.test(labels) && /Canvas settings/.test(labels), labels);
  check('the Exit button has focus', await ev(`document.activeElement?.textContent.trim() === 'Exit full screen'`));
  check('no sideways page scroll', await ev(`document.documentElement.scrollWidth <= window.innerWidth`));

  // ---- the canvas still works, in the larger space
  await d.fitAll();
  const header = await rect('.react-flow__node[data-id="entry:b"] .lc-card__header'); const before = await nodeRect('entry:b');
  await drag({ x: header.cx, y: header.cy }, { x: header.cx + 90, y: header.cy + 50 });
  const after = await nodeRect('entry:b');
  check('dragging a card still works', near(after.x - before.x, 90, 7) && near(after.y - before.y, 50, 7), `Δ ${Math.round(after.x - before.x)},${Math.round(after.y - before.y)}`);
  await settle();
  check('…and saves', (await stored()).board.nodes.find((n) => n.id === 'entry:b').x > 880);

  // ---- panels open inside the window and Escape closes the topmost thing first
  await d.clickText('.lc-bar button', 'Canvas settings'); await sleep(400);
  const panel = await rect('.lc-workspace--fullscreen > .lc-details');
  check('Canvas settings opens inside the window, at its right edge', panel && near(panel.r, W, 1) && panel.h >= H - 2, panel ? `${Math.round(panel.w)}px wide` : 'none');
  await press('Escape', 'Escape');
  check('Escape closes the panel first and stays in full screen', (await count('.lc-workspace--fullscreen > .lc-details')) === 0 && (await inFullscreen()));
  const text = await rect('.react-flow__node[data-id="entry:a"] .lc-card__text'); await click(text.cx, text.cy);
  check('a card is selected', (await count('.lc-card.is-selected')) === 1);
  await ev(`document.querySelector('.lc-board').focus?.()`);
  await press('Escape', 'Escape');
  check('Escape clears the selection next, still in full screen', (await count('.lc-card.is-selected')) === 0 && (await inFullscreen()));
  await press('Escape', 'Escape');
  check('Escape with nothing left to cancel leaves full screen', !(await inFullscreen()));
  check('…and the page is back: sidebar reachable, scrolling restored', (await ev(`getComputedStyle(document.body).overflow !== 'hidden'`)) && (await rect('.lc-board')).w < W - 200);
  check('focus returns to the Full screen button', await ev(`document.activeElement?.getAttribute('aria-label') === 'Full screen'`));

  // ---- the browser's Back button, and the Exit button
  const pathBefore = await ev(`location.pathname`);
  const again = await fullScreenButton(); await click(again.cx, again.cy);
  await waitFor(`!!document.querySelector('.lc-workspace--fullscreen')`, 'full screen again');
  await ev(`history.back()`); await sleep(700);
  check('the browser Back button leaves full screen, not the page', !(await inFullscreen()) && (await ev(`location.pathname`)) === pathBefore);
  const third = await fullScreenButton(); await click(third.cx, third.cy);
  await waitFor(`!!document.querySelector('.lc-workspace--fullscreen')`, 'full screen a third time');
  await d.clickText('.lc-bar button', 'Exit full screen'); await sleep(400);
  check('Exit full screen closes it', !(await inFullscreen()));
  check('the canvas is the size it was', near((await rect('.lc-board')).w, inline.board.w, 2) && near((await rect('.lc-board')).h, inline.board.h, 2));
} catch (e) { d.check('scenario completed', false, String(e.message || e)); }
const failed = d.results.filter((r) => !r.ok).length;
console.log(`\n${d.results.length - failed}/${d.results.length} passed`);
d.cleanup(); process.exit(failed ? 1 : 0);
