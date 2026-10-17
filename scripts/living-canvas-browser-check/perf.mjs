import * as d from './driver.mjs';
const { check, ev, mouse, drag, rect, nodeRect, viewport, count, open, fitAll, sleep, send, clickText } = d;
const startFrames = () => ev(`(() => { const gen = (window.__gen = (window.__gen || 0) + 1); window.__frames = []; const loop = (t) => { if (window.__gen !== gen) return; window.__frames.push(t); requestAnimationFrame(loop); }; requestAnimationFrame(loop); })()`);
const stopFrames = () => ev(`(() => { window.__gen += 1; const f = window.__frames; const d = f.slice(1).map((t, i) => t - f[i]).sort((a, b) => a - b); return { n: d.length, p50: d[Math.floor(d.length * 0.5)], p95: d[Math.floor(d.length * 0.95)], max: d[d.length - 1], over50: d.filter((x) => x > 50).length }; })()`);
const fmt = (s) => `${s.n} frames, median ${s.p50.toFixed(1)} ms, p95 ${s.p95.toFixed(1)} ms, worst ${s.max.toFixed(0)} ms, ${s.over50} over 50 ms`;
try {
  const t0 = Date.now();
  const opened = await open('full');
  await d.waitFor(`document.querySelectorAll('.react-flow__node').length >= 100`, 'cards', 20000);
  const drawn = await count('.react-flow__node');
  check('a full board draws', drawn >= 100, `${drawn} nodes drawn (the viewport hides off-screen ones? no: all rendered), ${opened} ms to the first nodes`);
  check('the whole page builds a full board in under 4 s in software-rendered headless Chrome', Date.now() - t0 < 4000 + 3000, `${Date.now() - t0} ms including the harness load`);
  await fitAll();
  const pane = await rect('.react-flow__pane');

  // dragging a card across a full board
  const hdr = await ev(`(() => { const e = [...document.querySelectorAll('.react-flow__node[data-id^="entry:e"] .lc-card__header')].find((h) => { const r = h.getBoundingClientRect(); const p = document.querySelector('.react-flow__pane').getBoundingClientRect(); return r.x > p.x + 20 && r.right < p.right - 20 && r.y > p.y + 20 && r.bottom < p.bottom - 20 && r.width > 14; }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await startFrames();
  await drag({ x: hdr.x, y: hdr.y }, { x: hdr.x + 160, y: hdr.y + 90 }, { steps: 60, pace: 16 });
  const dragStats = await stopFrames();
  console.log('drag   ', fmt(dragStats));
  check('dragging a card on a full board stays smooth (median frame under 34 ms ≈ 30 fps)', dragStats.p50 < 34, fmt(dragStats));

  // panning by wheel and zooming with Ctrl+wheel
  await startFrames();
  for (let i = 0; i < 60; i += 1) { await mouse('mouseWheel', pane.cx, pane.cy, { deltaX: 8, deltaY: 14 }); await sleep(16); }
  const panStats = await stopFrames();
  console.log('pan    ', fmt(panStats));
  check('panning a full board stays smooth', panStats.p50 < 34, fmt(panStats));
  await startFrames();
  for (let i = 0; i < 40; i += 1) { await mouse('mouseWheel', pane.cx, pane.cy, { deltaX: 0, deltaY: i < 20 ? -6 : 6, modifiers: 2 }); await sleep(16); }
  const zoomStats = await stopFrames();
  console.log('zoom   ', fmt(zoomStats));
  check('zooming a full board stays smooth', zoomStats.p50 < 34, fmt(zoomStats));

  // typing while the board is mounted
  await fitAll();
  await fitAll();
  const tb = await ev(`(() => { const e = [...document.querySelectorAll('.react-flow__node:not(.react-flow__node-section) .lc-card__text')].find((h) => { const r = h.getBoundingClientRect(); const p = document.querySelector('.react-flow__pane').getBoundingClientRect(); return r.x > p.x + 20 && r.right < p.right - 20 && r.y > p.y + 80 && r.bottom < p.bottom - 20 && r.width > 14; }); const r = e.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; })()`);
  await d.click(tb.cx, tb.cy); await clickText('.lc-selection button', 'Edit'); await sleep(300);
  await ev(`document.querySelector('.lc-details textarea').focus()`);
  await startFrames();
  const per = [];
  for (let i = 0; i < 60; i += 1) { const t = Date.now(); await send('Input.insertText', { text: 'x' }); await ev(`new Promise((r) => requestAnimationFrame(() => r()))`); per.push(Date.now() - t); }
  const typing = await stopFrames(); per.sort((a, b) => a - b);
  console.log('typing ', `median ${per[30]} ms, p95 ${per[57]} ms per character (includes protocol round trips); ${fmt(typing)}`);
  check('typing in the details panel is not slowed by a full board (p95 under 100 ms per character, round trips included)', per[57] < 100, `median ${per[30]} ms, p95 ${per[57]} ms`);
  const memory = await ev(`performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null`);
  console.log('heap   ', memory === null ? 'n/a' : `${memory} MB used`);
} catch (e) { d.check('scenario completed', false, String(e.message || e)); }
const failed = d.results.filter((r) => !r.ok).length;
console.log(`\n${d.results.length - failed}/${d.results.length} passed`);
d.cleanup(); process.exit(failed ? 1 : 0);
