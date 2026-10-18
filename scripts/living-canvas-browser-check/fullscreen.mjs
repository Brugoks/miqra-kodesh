import * as d from './driver.mjs';
const { check, near, ev, send, touch, tap, rect, nodeRect, viewport, count, open, sleep, hit, waitFor } = d;
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };
const swipe = async (from, to, steps = 10) => { await touch('touchStart', [from]); for (let i = 1; i <= steps; i += 1) { await touch('touchMove', [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }]); await sleep(16); } await touch('touchEnd', []); await sleep(200); };
const inFullscreen = () => ev(`!!document.querySelector('.lc-workspace--fullscreen')`);
const metrics = (m) => send('Emulation.setDeviceMetricsOverride', m);
const findEmpty = () => ev(`(() => { const p = document.querySelector('.react-flow__pane').getBoundingClientRect(); for (let y = p.y + 20; y < p.bottom - 20; y += 24) for (let x = p.x + 20; x < p.right - 20; x += 24) { const e = document.elementFromPoint(x, y); if (e && e.closest('.react-flow__pane') && !e.closest('.react-flow__node, .react-flow__panel, .lc-overlay')) return { x, y }; } return null; })()`);

// LC_NO_NATIVE_FULLSCREEN=1 is iPhone Safari: no Fullscreen API on elements, so only the page-filling layer is left.
const IPHONE = process.env.LC_NO_NATIVE_FULLSCREEN === '1';
try {
  if (IPHONE) { await send('Page.enable'); await send('Page.addScriptToEvaluateOnNewDocument', { source: 'delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen;' }); }
  await open('small', PHONE);
  if (IPHONE) check('this run has no Fullscreen API, like iPhone Safari', await ev(`typeof document.querySelector('.lc-workspace').requestFullscreen === 'undefined'`));
  const inline = { board: await rect('.lc-board'), pane: await rect('.react-flow__pane') };

  // ---- the button
  await ev(`document.querySelector('[aria-label="Full screen"]').scrollIntoView({ block: 'center' })`); await sleep(200);
  const toggle = await rect('[aria-label="Full screen"]');
  check('a phone shows a Full screen button, at least 44×44', toggle && toggle.w >= 44 && toggle.h >= 44, toggle ? `${Math.round(toggle.w)}×${Math.round(toggle.h)}` : 'hidden');
  check('the app\'s header and tab bar are there before', (await rect('.layout-topbar')) && (await rect('.bottom-tabs')));
  await tap(toggle.cx, toggle.cy);
  await waitFor(`!!document.querySelector('.lc-workspace--fullscreen')`, 'full screen');
  await sleep(400);

  // ---- it fills the screen, over the app's own chrome
  const ws = await rect('.lc-workspace--fullscreen');
  check('the workspace fills the whole screen', ws && near(ws.x, 0, 0.5) && near(ws.y, 0, 0.5) && near(ws.w, 390, 0.5) && near(ws.h, 844, 0.5), ws ? `${Math.round(ws.w)}×${Math.round(ws.h)} at ${Math.round(ws.x)},${Math.round(ws.y)}` : 'none');
  check('…over the page header', await hit(195, 30, '.lc-workspace--fullscreen'));
  check('…and over the tab bar, so it cannot be tapped by mistake', await hit(195, 810, '.lc-workspace--fullscreen') && !(await hit(195, 810, '.bottom-tabs')));
  check('the page behind does not scroll', await ev(`getComputedStyle(document.body).overflow === 'hidden' && document.body.classList.contains('lc-fullscreen-lock')`));
  check('it announces itself as a dialog with the canvas name', await ev(`(() => { const e = document.querySelector('.lc-workspace--fullscreen'); return e.getAttribute('role') === 'dialog' && /full screen$/.test(e.getAttribute('aria-label')); })()`));
  const native = await ev(`document.fullscreenElement ? document.fullscreenElement.className : null`);
  console.log('info    real browser full screen:', native ? 'granted' : 'not granted: the page-filling layer is what shows');
  if (IPHONE) check('no real full screen was attempted, and the layer alone does the job', !native);
  check('the Exit button has focus', await ev(`document.activeElement?.textContent.trim() === 'Exit full screen'`));

  // ---- more room for the canvas
  const full = { board: await rect('.lc-board'), pane: await rect('.react-flow__pane'), tools: await rect('.lc-toolbar') };
  check('the canvas is much taller than inline', full.pane.h > inline.pane.h * 1.6, `${Math.round(inline.pane.h)} → ${Math.round(full.pane.h)} px of canvas`);
  check('the canvas reaches the bottom of the screen', near(full.board.b, 844, 1), `board bottom ${Math.round(full.board.b)}`);
  check('the tools stay on screen, along the bottom', full.tools.b <= 844.5 && full.tools.y > full.pane.y);
  check('the bar is one or two short rows, not three', (await rect('.lc-bar')).h <= 110, `${Math.round((await rect('.lc-bar')).h)} px`);
  const bar = await ev(`[...document.querySelectorAll('.lc-bar button')].filter((b) => b.getClientRects().length > 0).map((b) => (b.getAttribute('aria-label') || b.textContent).trim()).join(' | ')`);
  check('the bar shows only what is visible: Exit and the view switch, nothing that leaves the page', /Exit full screen/.test(bar) && /Canvas/.test(bar) && !/All canvases|settings|Your canvases/.test(bar), bar);

  // ---- the canvas still works with a finger
  const v0 = await viewport(); const empty = await findEmpty();
  await swipe(empty, { x: empty.x + 50, y: empty.y + 30 });
  const v1 = await viewport();
  check('one finger still pans', near(v1.x - v0.x, 50, 10) && near(v1.y - v0.y, 30, 10), `Δ ${Math.round(v1.x - v0.x)},${Math.round(v1.y - v0.y)}`);
  await ev(`[...document.querySelectorAll('.lc-nav button')].find((b) => b.textContent.includes('Fit all')).click()`); await sleep(600);
  const card = await ev(`(() => { const t = document.querySelector('.react-flow__node[data-id="entry:a"] .lc-card__header').getBoundingClientRect(); const p = document.querySelector('.react-flow__pane').getBoundingClientRect(); const x = t.x + t.width / 2; const y = t.y + t.height / 2; const e = document.elementFromPoint(x, y); return e && e.closest('.react-flow__node[data-id="entry:a"]') && y > p.y && y < p.bottom ? { x, y } : null; })()`);
  check('a card can be tapped', Boolean(card));
  await tap(card.x, card.y);
  check('…and selects', (await count('.lc-card.is-selected')) === 1);
  await ev(`[...document.querySelectorAll('.lc-selection button')].find((b) => b.textContent.includes('Edit')).click()`); await sleep(400);
  const sheet = await rect('.lc-board .lc-details');
  check('the details sheet opens inside the screen', sheet && sheet.b <= 844.5 && sheet.y >= 0 && sheet.w <= 391, sheet ? `${Math.round(sheet.w)}×${Math.round(sheet.h)}` : 'none');
  await ev(`document.querySelector('.lc-details__bar button').click()`); await sleep(250);

  // ---- the keyboard: the page asks for resizes-content, so the viewport shrinks and the workspace must follow it
  await metrics({ ...PHONE, height: 480 }); await sleep(500);
  const small = await rect('.lc-workspace--fullscreen');
  check('with a short screen (the on-screen keyboard) it shrinks to fit', near(small.h, 480, 1) && (await rect('.lc-toolbar')).b <= 481, `${Math.round(small.h)} px tall`);
  await metrics(PHONE); await sleep(400);

  // ---- landscape
  await metrics({ width: 844, height: 390, deviceScaleFactor: 2, mobile: true }); await sleep(600);
  const land = await rect('.lc-workspace--fullscreen'); const landBoard = await rect('.lc-board'); const landTools = await rect('.lc-toolbar');
  check('rotated, it fills the wider screen', land && near(land.w, 844, 1) && near(land.h, 390, 1), `${Math.round(land.w)}×${Math.round(land.h)}`);
  check('…with the tools at the side and a usable canvas', landTools.x < 100 && landBoard.h >= 250 && landBoard.b <= 391, `board ${Math.round(landBoard.h)} px tall`);
  check('…and nothing scrolls sideways', await ev(`document.documentElement.scrollWidth <= window.innerWidth`));
  await metrics(PHONE); await sleep(500);

  // ---- Outline works in full screen and scrolls inside it
  await ev(`[...document.querySelectorAll('.lc-bar__views button')].find((b) => b.textContent.includes('Outline')).click()`); await sleep(500);
  const body = await ev(`(() => { const b = document.querySelector('.lc-body'); const r = b.getBoundingClientRect(); return { top: r.y, bottom: r.bottom, canScroll: b.scrollHeight > b.clientHeight, overflowY: getComputedStyle(b).overflowY }; })()`);
  check('Outline fills the space under the bar and scrolls on its own', body.bottom <= 844.5 && body.overflowY === 'auto' && body.canScroll, `scrolls: ${body.canScroll}`);
  await ev(`[...document.querySelectorAll('.lc-bar__views button')].find((b) => b.textContent.includes('Canvas')).click()`); await sleep(500);

  // ---- Back closes it and leaves the page where it was
  const pathBefore = await ev(`location.pathname`);
  await ev(`history.back()`); await sleep(700);
  check('the device Back gesture closes full screen', !(await inFullscreen()));
  check('…and stays on the same page', (await ev(`location.pathname`)) === pathBefore);
  check('…with the tab bar back and the page scrolling again', (await hit(195, 810, '.bottom-tabs')) && (await ev(`getComputedStyle(document.body).overflow !== 'hidden'`)));

  // ---- the Exit button, and a second round trip keeps the work
  await ev(`document.querySelector('[aria-label="Full screen"]').scrollIntoView({ block: 'center' })`); await sleep(200);
  const again = await rect('[aria-label="Full screen"]'); await tap(again.cx, again.cy);
  await waitFor(`!!document.querySelector('.lc-workspace--fullscreen')`, 'full screen again');
  await ev(`[...document.querySelectorAll('.lc-bar button')].find((b) => b.textContent.includes('Exit full screen')).click()`); await sleep(500);
  check('Exit full screen closes it', !(await inFullscreen()));
  check('focus returns to the Full screen button', await ev(`document.activeElement?.getAttribute('aria-label') === 'Full screen'`));
  check('the canvas is the same size as before', near((await rect('.lc-board')).h, inline.board.h, 2), `${Math.round((await rect('.lc-board')).h)} vs ${Math.round(inline.board.h)}`);
  check('no sideways page scroll afterwards', await ev(`document.documentElement.scrollWidth <= window.innerWidth`));
} catch (e) { d.check('scenario completed', false, String(e.message || e)); }
const failed = d.results.filter((r) => !r.ok).length;
console.log(`\n${d.results.length - failed}/${d.results.length} passed`);
d.cleanup(); process.exit(failed ? 1 : 0);
