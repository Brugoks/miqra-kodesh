// Shared helpers: starts the harness server and headless Chrome, and drives it with trusted input over the DevTools protocol.
// Run through run.mjs, which builds the harness and sets LC_CHECK_OUT, LC_CHECK_HTTP and LC_CHECK_CDP.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.env.LC_CHECK_OUT;
const PORT = Number(process.env.LC_CHECK_CDP || 9333); const HTTP = Number(process.env.LC_CHECK_HTTP || 8765);
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;

const server = spawn('python3', ['-m', 'http.server', String(HTTP), '--bind', '127.0.0.1', '--directory', OUT], { stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'lc-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1280,900', '--force-device-scale-factor=1', '--no-first-run', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); server.kill('SIGKILL'); } catch { /* gone */ } };
process.on('exit', cleanup);

async function connect() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
        let id = 0; const pending = new Map();
        ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); } });
        return (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
      }
    } catch { /* chrome is still starting */ }
    await sleep(250);
  }
  throw new Error('Chrome did not start');
}

const send = await connect();
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${expression.slice(0, 80)} → ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
};
const waitFor = async (expression, label, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expression)) return true; } catch { /* page not ready */ } await sleep(100); } throw new Error(`Timed out waiting for ${label}`); };

// Trusted input
const mouse = (type, x, y, o = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: o.button || 'none', buttons: o.buttons ?? 0, clickCount: o.clickCount ?? 0, modifiers: o.modifiers ?? 0, deltaX: o.deltaX ?? 0, deltaY: o.deltaY ?? 0 });
const click = async (x, y, o = {}) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: o.clickCount ?? 1, modifiers: o.modifiers }); await mouse('mouseReleased', x, y, { button: 'left', clickCount: o.clickCount ?? 1, modifiers: o.modifiers }); await sleep(60); };
const drag = async (from, to, o = {}) => {
  const button = o.button || 'left'; const buttons = { left: 1, right: 2, middle: 4 }[button]; const steps = o.steps || 12;
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1; const ux = (to.x - from.x) / len; const uy = (to.y - from.y) / len;
  await mouse('mouseMoved', from.x, from.y);
  await mouse('mousePressed', from.x, from.y, { button, buttons, clickCount: 1, modifiers: o.modifiers });
  // A real hand starts slowly: a pixel or two at a time, so the library's small drag threshold costs what it costs a person.
  for (let i = 1; i <= 6 && i < len; i += 1) await mouse('mouseMoved', from.x + ux * i, from.y + uy * i, { button, buttons, modifiers: o.modifiers });
  for (let i = 1; i <= steps; i += 1) { await mouse('mouseMoved', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps, { button, buttons, modifiers: o.modifiers }); if (o.pace) await sleep(o.pace); }
  await mouse('mouseReleased', to.x, to.y, { button, clickCount: 1, modifiers: o.modifiers });
  await sleep(120);
};
const key = (type, k, code, o = {}) => send('Input.dispatchKeyEvent', { type, key: k, code, text: o.text, modifiers: o.modifiers ?? 0 });
const touch = (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i + 1, radiusX: 4, radiusY: 4, force: 1 })) });
const tap = async (x, y) => { await touch('touchStart', [{ x, y }]); await sleep(40); await touch('touchEnd', []); await sleep(120); };

// Page helpers
const rect = (sel, i = 0) => ev(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${i}]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, r: r.right, b: r.bottom }; })()`);
const nodeRect = (id) => rect(`.react-flow__node[data-id="${id}"]`);
const viewport = () => ev(`(() => { const m = /translate\\((-?[\\d.e-]+)px,\\s*(-?[\\d.e-]+)px\\) scale\\((-?[\\d.e-]+)\\)/.exec(document.querySelector('.react-flow__viewport').style.transform); return { x: +m[1], y: +m[2], s: +m[3] }; })()`);
const stored = () => ev(`JSON.parse(localStorage.getItem('miqra_canvas_v1:u1:org'))[0]`);
const settle = () => sleep(1000); // autosave debounce
const hit = (x, y, sel) => ev(`(() => { const e = document.elementFromPoint(${x}, ${y}); return e ? !!e.closest(${JSON.stringify(sel)}) : false; })()`);
const count = (sel) => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const text = (sel) => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
const clickText = async (sel, label) => { const r = await ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((b) => b.textContent.trim().includes(${JSON.stringify(label)}) || b.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); if (!r) throw new Error(`No ${sel} "${label}"`); await click(r.x, r.y); };

async function open(kind, metrics) {
  await send('Page.enable');
  if (metrics) { await send('Emulation.setDeviceMetricsOverride', metrics); await send('Emulation.setTouchEmulationEnabled', { enabled: metrics.mobile, maxTouchPoints: 5 }); }
  else { await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }); await send('Emulation.setTouchEmulationEnabled', { enabled: false }); }
  await send('Page.navigate', { url: `http://127.0.0.1:${HTTP}/index.html` });
  await waitFor(`typeof window.__seed === 'function'`, 'harness');
  await ev(`window.__seed(${JSON.stringify(kind)})`);
  await ev(`localStorage.setItem('miqra_living_canvas_board', 'on')`); // a production build ships with the switch off
  await send('Page.navigate', { url: `http://127.0.0.1:${HTTP}/index.html` });
  await waitFor(`!!document.querySelector('.moment-library li button')`, 'library');
  const t0 = Date.now();
  if (metrics?.mobile) { await ev(`document.querySelector('.moment-library li button').scrollIntoView({ block: 'center' })`); await sleep(200); const r = await rect('.moment-library li button'); await tap(r.cx, r.cy); } else await clickText('.moment-library li button', 'friend brought dinner');
  await waitFor(`document.querySelectorAll('.react-flow__node').length >= 4`, 'board nodes', 20000);
  return Date.now() - t0;
}
const fitAll = async () => { await clickText('.lc-nav button', 'Fit all'); await sleep(500); };
const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number);
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const [hi, lo] = [lum(rgb(a)), lum(rgb(b))].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

export { check, near, send, ev, waitFor, mouse, click, drag, key, touch, tap, rect, nodeRect, viewport, stored, settle, hit, count, text, clickText, open, fitAll, contrast, sleep, results, cleanup };
