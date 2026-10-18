import * as d from './driver.mjs';
const { check, near, ev, send, touch, tap, rect, nodeRect, viewport, count, text, clickText, open, sleep } = d;
const swipe = async (from, to, steps = 12) => { await touch('touchStart', [from]); for (let i = 1; i <= steps; i += 1) { await touch('touchMove', [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }]); await sleep(16); } await touch('touchEnd', []); await sleep(200); };
const tapText = async (sel, label) => { const r = await ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((b) => b.textContent.trim().includes(${JSON.stringify(label)}) || (b.getAttribute('aria-label') || '').startsWith(${JSON.stringify(label)})); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); if (!r) throw new Error(`No ${sel} "${label}"`); await tap(r.x, r.y); };

try {
  await open('small', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  check('the phone reports a coarse pointer', await ev(`matchMedia('(pointer: coarse)').matches`));
  check('the phone is under the 760px layout', await ev(`matchMedia('(max-width: 760px)').matches`));
  const board = await rect('.lc-board'); const tools = await rect('.lc-toolbar'); const flow = await rect('.react-flow');
  check('the board is on screen and tall enough to use', board.x >= 0 && board.r <= 391 && board.h >= 440 && board.b <= 845, `${Math.round(board.w)}×${Math.round(board.h)} at y=${Math.round(board.y)}`);
  check('tools run along the bottom of the board, inside the screen', tools.y > flow.y + flow.h - 2 && tools.b <= 845 && tools.w <= 391, `toolbar y=${Math.round(tools.y)}–${Math.round(tools.b)}`);
  check('no sideways page scroll', await ev(`document.documentElement.scrollWidth <= window.innerWidth`));
  const tabs = await rect('.bottom-tabs');
  check('the board and its toolbar clear the app\'s tab bar without scrolling the page', tabs && board.b <= tabs.y + 1 && tools.b <= tabs.y + 1, `board bottom ${Math.round(board.b)}, tab bar top ${tabs ? Math.round(tabs.y) : 'n/a'}`);
  const small = await ev(`[...document.querySelectorAll('.lc-toolbar button, .lc-nav button')].filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return { n: (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((b) => b.w < 44 || b.h < 44)`);
  check('every tool and navigation button is at least 44×44', small.length === 0, small.length ? JSON.stringify(small) : 'all ≥ 44px');
  check('the toolbar offers Select several on touch', (await count('.lc-toolbar button')) > 0 && (await ev(`!![...document.querySelectorAll('.lc-toolbar button')].find((b) => b.textContent.includes('Select several'))`)));
  check('the canvas hands touch gestures to the board (no page scroll under a pan)', await ev(`['none'].includes(getComputedStyle(document.querySelector('.react-flow__pane')).touchAction) || ['none'].includes(getComputedStyle(document.querySelector('.react-flow__renderer')).touchAction) || ['none'].includes(getComputedStyle(document.querySelector('.react-flow')).touchAction)`));

  // ---- one finger pans
  const pane = await rect('.react-flow__pane'); const v0 = await viewport();
  const findEmpty = () => ev(`(() => { const p = document.querySelector('.react-flow__pane').getBoundingClientRect(); for (let y = p.y + 20; y < p.bottom - 20; y += 24) for (let x = p.x + 20; x < p.right - 20; x += 24) { const e = document.elementFromPoint(x, y); if (e && e.closest('.react-flow__pane') && !e.closest('.react-flow__node, .react-flow__panel, .lc-overlay')) return { x, y }; } return null; })()`);
  const empty = await findEmpty();
  check('the swipe starts on empty space', await ev(`document.elementFromPoint(${empty.x}, ${empty.y}).closest('.react-flow__pane') !== null`));
  await swipe(empty, { x: empty.x + 60, y: empty.y - 40 });
  const v1 = await viewport();
  check('one finger on the background pans', near(v1.x - v0.x, 60, 8) && near(v1.y - v0.y, -40, 8), `Δ ${Math.round(v1.x - v0.x)},${Math.round(v1.y - v0.y)}`);
  check('…and it did not select an area or scroll the page', (await count('.lc-card.is-selected')) === 0 && (await ev(`window.scrollY`)) === 0);

  // ---- two fingers pinch
  const c = empty; const s0 = (await viewport()).s;
  await touch('touchStart', [{ x: c.x - 40, y: c.y }, { x: c.x + 40, y: c.y }]);
  for (let i = 1; i <= 10; i += 1) { await touch('touchMove', [{ x: c.x - 40 - i * 8, y: c.y }, { x: c.x + 40 + i * 8, y: c.y }]); await sleep(16); }
  await touch('touchEnd', []); await sleep(250);
  const s1 = (await viewport()).s;
  check('two fingers pinch to zoom', s1 > s0 * 1.5, `${s0.toFixed(2)}→${s1.toFixed(2)}`);
  await tapText('.lc-nav button', 'Fit all'); await sleep(500);

  // ---- tap selects; Edit opens a sheet at the bottom
  const body = await rect('.react-flow__node[data-id="entry:a"] .lc-card__text'); await tap(body.cx, body.cy);
  check('tapping a card selects it', (await count('.lc-card.is-selected')) === 1 && (await count('.lc-selection')) === 1);
  const bar = await rect('.lc-selection'); const b2 = await rect('.lc-board');
  check('the selection bar fits the screen width', bar.x >= 0 && bar.r <= 391, `${Math.round(bar.w)}px wide`);
  await tapText('.lc-selection button', 'Edit'); await sleep(300);
  const sheet = await rect('.lc-board .lc-details'); const b3 = await rect('.lc-board');
  check('Edit opens a sheet over the bottom of the board', sheet && near(sheet.b, b3.b, 2) && near(sheet.w, b3.w, 2) && sheet.h <= b3.h * 0.73 + 2, sheet ? `${Math.round(sheet.w)}×${Math.round(sheet.h)} of ${Math.round(b3.h)}` : 'none');
  const fonts = await ev(`[...document.querySelectorAll('.lc-details input:not([type=checkbox]):not([type=radio]), .lc-details textarea, .lc-details select')].map((e) => parseFloat(getComputedStyle(e).fontSize))`);
  check('form fields are 16px or larger, so iOS does not zoom the page when they are focused', fonts.length > 0 && fonts.every((f) => f >= 16), `sizes ${[...new Set(fonts)].join(', ')}`);
  await tapText('.lc-details__bar button', 'Close');
  await sleep(250);

  // ---- select several by tapping
  const blank = await findEmpty(); await tap(blank.x, blank.y); await sleep(200); // clear the last selection: its bar would sit over the canvas
  await tapText('.lc-toolbar button', 'Select several');
  // Tap only points that are really on the card (the canvas is short on a phone, and a bar can cover part of it).
  const onCard = async (id) => ev(`(() => { const t = document.querySelector('.react-flow__node[data-id="${id}"] .lc-card__header').getBoundingClientRect(); const p = document.querySelector('.react-flow__pane').getBoundingClientRect(); const x = t.x + t.width / 2; const y = t.y + t.height / 2; const e = document.elementFromPoint(x, y); return e && e.closest('.react-flow__node[data-id="${id}"]') && y > p.y && y < p.bottom ? { x, y } : null; })()`);
  const ta = await onCard('entry:a'); const tb = await onCard('entry:b');
  check('both cards can be tapped on a short phone canvas', ta && tb);
  await tap(ta.x, ta.y); await tap(tb.x, tb.y);
  check('Select several lets taps build a selection', (await count('.lc-card.is-selected')) === 2 && /2 thoughts selected/.test((await text('.lc-selection')) || ''), (await ev(`document.querySelector('.lc-selection')?.textContent`)) || 'no bar');
  await tapText('.lc-toolbar button', 'Select several'); const blank2 = await findEmpty(); await tap(blank2.x, blank2.y); await sleep(200);

  // ---- a finger drags a card by its header
  const hdr = await rect('.react-flow__node[data-id="entry:b"] .lc-card__header'); const before = await nodeRect('entry:b');
  await swipe({ x: hdr.cx, y: hdr.cy }, { x: hdr.cx - 40, y: hdr.cy + 50 });
  const after = await nodeRect('entry:b');
  check('a finger drags a card by its header', near(after.x - before.x, -40, 14) && near(after.y - before.y, 50, 14), `Δ ${Math.round(after.x - before.x)},${Math.round(after.y - before.y)}`);
} catch (e) { d.check('scenario completed', false, String(e.message || e)); }
const failed = d.results.filter((r) => !r.ok).length;
console.log(`\n${d.results.length - failed}/${d.results.length} passed`);
d.cleanup(); process.exit(failed ? 1 : 0);
