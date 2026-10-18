// A canvas opens full window by itself, and remembers the person's choice, on a desktop and on a phone.
import * as d from './driver.mjs';
const { check, near, ev, send, click, tap, rect, open, sleep, hit, waitFor } = d;
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };
const inFullscreen = () => ev(`!!document.querySelector('.lc-workspace--fullscreen')`);
const pref = () => ev(`localStorage.getItem('miqra_canvas_fullscreen_v1:u1')`);
// Open the saved canvas again from the library, as a returning visitor would (the harness has already seeded it).
async function reopen(mobile) {
  await send('Page.navigate', { url: `http://127.0.0.1:${process.env.LC_CHECK_HTTP}/index.html` });
  await waitFor(`!!document.querySelector('.moment-library li button')`, 'library');
  if (mobile) { await ev(`document.querySelector('.moment-library li button').scrollIntoView({ block: 'center' })`); await sleep(200); const r = await rect('.moment-library li button'); await tap(r.cx, r.cy); }
  else await d.clickText('.moment-library li button', 'friend brought dinner');
  await waitFor(`document.querySelectorAll('.react-flow__node').length >= 4 || !!document.querySelector('.lc-outline')`, 'the canvas', 20000);
  await sleep(400);
}
const exitButton = async (mobile) => { const r = await rect('.lc-bar__exit'); if (mobile) await tap(r.cx, r.cy); else await click(r.cx, r.cy); await sleep(400); };
const enterButton = async (mobile) => { const r = await rect('[aria-label="Full screen"]'); if (mobile) await tap(r.cx, r.cy); else await click(r.cx, r.cy); await sleep(400); };

try {
  // ======================= desktop
  await open('small', null, { auto: true });
  check('desktop: a canvas opens full window with nothing chosen', await inFullscreen());
  const ws = await rect('.lc-workspace--fullscreen');
  check('…filling the whole browser window', ws && near(ws.w, 1280, 0.5) && near(ws.h, 900, 0.5) && near(ws.x, 0, 0.5) && near(ws.y, 0, 0.5), `${Math.round(ws.w)}×${Math.round(ws.h)}`);
  check('…over the app\'s sidebar and header', (await hit(10, 300, '.lc-workspace--fullscreen')) && (await hit(640, 20, '.lc-workspace--fullscreen')));
  check('focus is on the dialog, not on a button or the hidden page heading', await ev(`document.activeElement?.classList.contains('lc-workspace--fullscreen')`));
  check('no real screen full screen was asked for with a mouse', await ev(`document.fullscreenElement === null`));
  check('it is the page, not an overlay: no extra Back entry was made', await ev(`!(history.state && history.state.usr && history.state.usr.miqraBackDismiss)`));
  check('nothing has been decided yet, so nothing is saved', (await pref()) === null);

  await exitButton(false);
  check('Exit goes back to the inline layout', !(await inFullscreen()));
  check('…and is remembered as off', (await pref()) === 'off');
  await reopen(false);
  check('so the next visit opens inline', !(await inFullscreen()) && (await rect('.lc-board')).w < 1100, `board ${Math.round((await rect('.lc-board')).w)}px wide`);

  await enterButton(false);
  check('choosing Full screen again works, and is remembered as on', (await inFullscreen()) && (await pref()) === 'on');
  check('as the person\'s own overlay, it now has its Back entry', await ev(`history.state?.usr?.miqraBackDismiss === true`));
  await ev(`history.back()`); await sleep(700);
  check('Back peels it off, and is not taken for a choice', !(await inFullscreen()) && (await pref()) === 'on');
  await reopen(false);
  check('so it opens full window again next time', await inFullscreen());

  // ======================= phone
  await ev(`localStorage.removeItem('miqra_canvas_fullscreen_v1:u1')`);
  await send('Emulation.setDeviceMetricsOverride', PHONE); await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await reopen(true);
  check('phone: a canvas opens full window too', await inFullscreen());
  const pws = await rect('.lc-workspace--fullscreen');
  check('…over the page header and the tab bar', pws && near(pws.w, 390, 0.5) && near(pws.h, 844, 0.5) && (await hit(195, 810, '.lc-workspace--fullscreen')) && !(await hit(195, 810, '.bottom-tabs')));
  check('…keeping only what the work needs in the bar', await ev(`[...document.querySelectorAll('.lc-bar button')].filter((b) => b.getClientRects().length > 0).map((b) => (b.getAttribute('aria-label') || b.textContent).trim()).join('|').match(/^Exit full screen\\|Canvas\\|Outline$/) !== null`));
  check('it could not ask for real full screen without a tap, so the layer alone is on', await ev(`document.fullscreenElement === null`));
  check('the board reaches the bottom of the screen', near((await rect('.lc-board')).b, 844, 1));
  await exitButton(true);
  check('phone: Exit goes back inline and is remembered', !(await inFullscreen()) && (await pref()) === 'off');
  check('…with the tab bar and header back', (await rect('.bottom-tabs')) && (await rect('.layout-topbar')));
  await enterButton(true);
  check('the Full screen button then asks for real full screen as well (it is a tap)', (await inFullscreen()) && (await pref()) === 'on');
  console.log('info    real browser full screen after the tap:', (await ev(`document.fullscreenElement !== null`)) ? 'granted' : 'not granted');
} catch (e) { d.check('scenario completed', false, String(e.message || e)); }
const failed = d.results.filter((r) => !r.ok).length;
console.log(`\n${d.results.length - failed}/${d.results.length} passed`);
d.cleanup(); process.exit(failed ? 1 : 0);
