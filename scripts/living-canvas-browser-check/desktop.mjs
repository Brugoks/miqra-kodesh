import * as d from './driver.mjs';
const { check, near, ev, mouse, click, drag, key, rect, nodeRect, viewport, stored, settle, hit, count, text, clickText, open, fitAll, sleep } = d;

try {
  const opened = await open('small');
  check('board opens', true, `${opened} ms from click to nodes drawn`);

  // ---- layout
  const flow = await rect('.react-flow'); const board = await rect('.lc-board'); const tools = await rect('.lc-toolbar');
  check('board has real size', flow.h > 350 && flow.w > 700, `${Math.round(flow.w)}×${Math.round(flow.h)}`);
  check('toolbar sits at the left, inside the board', tools.x >= board.x - 1 && tools.r < board.x + 200 && tools.h > 100, `${Math.round(tools.w)}px wide`);
  check('no sideways page scroll', await ev(`document.documentElement.scrollWidth <= window.innerWidth`));
  await fitAll();
  const ids = ['moment:00000000-0000-4000-8000-000000000001', 'entry:a', 'entry:b', 'entry:c'];
  for (const id of ids) { const r = await nodeRect(id); check(`card ${id.slice(0, 8)} visible after Fit all`, r && r.w > 100 && r.x >= flow.x - 1 && r.r <= flow.r + 1 && r.y >= flow.y - 1 && r.b <= flow.b + 1, r ? `${Math.round(r.w)}×${Math.round(r.h)} at ${Math.round(r.x)},${Math.round(r.y)}` : 'missing'); }
  const vp0 = await viewport();
  const cardA = await nodeRect('entry:a'); check('card is 320×176 world units', near(cardA.w / vp0.s, 320, 1) && near(cardA.h / vp0.s, 176, 1), `${(cardA.w / vp0.s).toFixed(1)}×${(cardA.h / vp0.s).toFixed(1)} at ${vp0.s.toFixed(2)}×`);

  // ---- hit testing: the section frame must not swallow pointer events
  const sec = await rect('.react-flow__node-section');
  check('empty space inside a section reaches the pane (pan/select work over it)', await hit(sec.x + 8, sec.y + sec.h - 12, '.react-flow__pane') && !(await hit(sec.x + 8, sec.y + sec.h - 12, '.react-flow__node')));
  check('the section header takes the pointer (it drags the group)', await hit(sec.x + sec.w / 2, sec.y + 20 * vp0.s, '.lc-section__header'));
  const textBox = await rect('.react-flow__node[data-id="entry:b"] .lc-card__text'); check('card text takes the pointer', await hit(textBox.cx, textBox.cy, '.lc-card'));

  // ---- drag a card by its header (world delta == pointer delta / zoom)
  const hdr = await rect('.react-flow__node[data-id="entry:b"] .lc-card__header');
  const before = await nodeRect('entry:b');
  await drag({ x: hdr.cx, y: hdr.cy }, { x: hdr.cx + 120, y: hdr.cy + 60 });
  const after = await nodeRect('entry:b');
  const vpD = await viewport();
  check('the selection bar did not shift the board when the card was picked up', near((await rect('.react-flow')).y, flow.y, 0.5));
  check('header drag moves the card with the pointer (within the 4px drag threshold)', near(after.x - before.x, 120, 6) && near(after.y - before.y, 60, 6), `Δ ${Math.round(after.x - before.x)},${Math.round(after.y - before.y)}`);
  await settle();
  const saved1 = (await stored()).board.nodes.find((n) => n.id === 'entry:b');
  check('the drag was saved in world coordinates', near(saved1.x, 880 + 120 / vpD.s, 6 / vpD.s) && near(saved1.y, 40 + 60 / vpD.s, 6 / vpD.s), `saved ${saved1.x},${saved1.y}`);

  const body = await rect('.react-flow__node[data-id="entry:a"] .lc-card__text'); const aBefore = await nodeRect('entry:a');
  await drag({ x: body.cx, y: body.cy }, { x: body.cx + 100, y: body.cy + 40 });
  const aAfter = await nodeRect('entry:a');
  check('dragging the body does not move the card (text stays selectable)', near(aAfter.x, aBefore.x, 1) && near(aAfter.y, aBefore.y, 1));

  // ---- a section drags with what is in it
  const secBefore = await rect('.react-flow__node-section'); const cBefore = await nodeRect('entry:c');
  const sh = await rect('.lc-section__header');
  await drag({ x: sh.cx + 30, y: sh.cy }, { x: sh.cx + 110, y: sh.cy - 30 });
  const secAfter = await rect('.react-flow__node-section'); const cAfter = await nodeRect('entry:c');
  check('section header drag moves the frame', near(secAfter.x - secBefore.x, 80, 6) && near(secAfter.y - secBefore.y, -30, 6));
  check('…and the card inside it by the same amount', near(cAfter.x - cBefore.x, secAfter.x - secBefore.x, 1) && near(cAfter.y - cBefore.y, secAfter.y - secBefore.y, 1));
  await settle();
  const s2 = await stored(); const cs = s2.board.nodes.find((n) => n.id === 'entry:c');
  check('…and it stays in the section when saved', cs.sectionId === 'section:one');

  // ---- drop a card into the section, then out
  const secNow = await rect('.react-flow__node-section'); const bNow = await nodeRect('entry:b'); const bh = await rect('.react-flow__node[data-id="entry:b"] .lc-card__header');
  await drag({ x: bh.cx, y: bh.cy }, { x: secNow.x + 60 + (bh.cx - bNow.x), y: secNow.y + 70 + (bh.cy - bNow.y) }, { steps: 20 });
  await settle();
  check('a card dropped inside a section joins it', (await stored()).board.nodes.find((n) => n.id === 'entry:b').sectionId === 'section:one');
  const bIn = await nodeRect('entry:b'); const bhIn = await rect('.react-flow__node[data-id="entry:b"] .lc-card__header'); const secAgain = await rect('.react-flow__node-section');
  await drag({ x: bhIn.cx, y: bhIn.cy }, { x: bhIn.cx, y: secAgain.b + 260 + (bhIn.cy - bIn.y) }, { steps: 20 });
  await settle();
  const bOut = (await stored()).board.nodes.find((n) => n.id === 'entry:b'); check('dragged fully out, it leaves the section where it was dropped', bOut.sectionId === null, `y=${Math.round(bOut.y)}`);

  // ---- marquee selection, then deselect by pressing empty space
  await fitAll();
  const pane = await rect('.react-flow__pane'); const ra = await nodeRect('entry:a'); const rc = await nodeRect('entry:c');
  await click(pane.x + pane.w - 30, pane.y + pane.h - 120); // nothing selected, so the bar is not over the canvas
  const start = { x: pane.x + 12, y: pane.y + 12 };
  check('marquee start is empty space', await hit(start.x, start.y, '.react-flow__pane'));
  await drag(start, { x: Math.max(ra.r, rc.r) + 10, y: Math.max(ra.b, rc.b) + 10 }, { steps: 10 });
  const picked = await count('.lc-card.is-selected');
  check('dragging empty space selects the cards it covers', picked >= 2, `${picked} selected; bar says “${await text('.lc-selection strong')}”`);
  await click(pane.x + pane.w - 30, pane.y + pane.h - 120);
  await sleep(150);
  check('pressing empty space clears the selection', (await count('.lc-card.is-selected')) === 0 && (await count('.lc-selection')) === 0);

  // ---- pan and zoom
  const v0 = await viewport(); const mid = { x: pane.cx, y: pane.cy };
  await mouse('mouseWheel', mid.x, mid.y, { deltaX: 0, deltaY: 120 }); await sleep(150);
  const v1 = await viewport();
  check('trackpad/wheel scroll pans (does not zoom)', near(v1.s, v0.s, 0.001) && v1.y < v0.y - 20, `y ${Math.round(v0.y)}→${Math.round(v1.y)}`);
  const px = pane.x + 700, py = pane.y + 260; const wBefore = { x: (px - pane.x - v1.x) / v1.s, y: (py - pane.y - v1.y) / v1.s };
  await mouse('mouseWheel', px, py, { deltaX: 0, deltaY: -4, modifiers: 2 }); await sleep(250);
  const v2 = await viewport(); const wAfter = { x: (px - pane.x - v2.x) / v2.s, y: (py - pane.y - v2.y) / v2.s };
  check('Ctrl+wheel (pinch) zooms in', v2.s > v1.s * 1.005, `${v1.s.toFixed(2)}→${v2.s.toFixed(2)}`);
  check('…around the pointer', near(wBefore.x, wAfter.x, 2) && near(wBefore.y, wAfter.y, 2), `world ${wBefore.x.toFixed(0)},${wBefore.y.toFixed(0)} → ${wAfter.x.toFixed(0)},${wAfter.y.toFixed(0)}`);
  await key('keyDown', ' ', 'Space', { text: ' ' });
  await drag({ x: pane.x + 40, y: pane.y + 40 }, { x: pane.x + 140, y: pane.y + 90 }, { steps: 8 });
  await key('keyUp', ' ', 'Space');
  const v3 = await viewport();
  check('Space+drag pans', near(v3.x - v2.x, 100, 3) && near(v3.y - v2.y, 50, 3), `Δ ${Math.round(v3.x - v2.x)},${Math.round(v3.y - v2.y)}`);
  await drag({ x: pane.x + 40, y: pane.y + 60 }, { x: pane.x + 20, y: pane.y + 110 }, { button: 'middle', steps: 8 });
  const v4 = await viewport();
  check('middle-button drag pans', near(v4.x - v3.x, -20, 3) && near(v4.y - v3.y, 50, 3), `Δ ${Math.round(v4.x - v3.x)},${Math.round(v4.y - v3.y)}`);
  await sleep(500);
  check('the viewport is remembered on this device, not saved to the canvas', await ev(`!!localStorage.getItem('miqra_canvas_viewport_v1:u1:00000000-0000-4000-8000-000000000001')`));
} catch (e) { d.check('scenario completed', false, String(e.message || e)); }
const failed = d.results.filter((r) => !r.ok).length;
console.log(`\n${d.results.length - failed}/${d.results.length} passed`);
d.cleanup();
process.exit(failed ? 1 : 0);
