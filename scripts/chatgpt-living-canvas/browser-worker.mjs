// Reuses the repository's isolated Chrome driver because the installed
// chrome-devtools-axi bridge currently fails to provide a pageId.
import { writeFileSync } from 'node:fs';
import { send, ev, waitFor, check, results, cleanup, sleep } from '../living-canvas-browser-check/driver.mjs';
const origin = `http://127.0.0.1:${process.env.LC_CHECK_HTTP}`;
try {
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${origin}/index.html?public=1` });
  await waitFor("document.querySelectorAll('.react-flow__node').length >= 13", 'published board', 25000);
  check('published snapshot renders 13 selected cards', await ev("document.querySelectorAll('details').length === 13"));
  check('public view excludes private reflection and original question', await ev("!document.body.textContent.includes('PRIVATE TEST') && !document.body.textContent.includes('How can we help others discover truth')"));
  check('eight Scripture references render on published cards', await ev("document.querySelectorAll('.lc-card__reference').length === 8"));
  check('read-only view has no editing controls', await ev("![...document.querySelectorAll('button')].some(b => /edit|save|delete|publish/i.test(b.textContent))"));
  await waitFor("document.querySelectorAll('.react-flow__edge').length === 2", 'published connections');
  check('valid directed connections render', true);
  await ev("document.querySelectorAll('details').forEach(d => d.open = true)");
  check('verified KJV quotes render with translation attribution', await ev("document.querySelectorAll('blockquote').length === 63 && document.body.textContent.includes('KJV') && document.body.textContent.includes('Counsel in the heart of man')"));
  await ev("document.querySelectorAll('details').forEach(d => d.open = false)");
  await sleep(300);
  let screenshot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('/tmp/miqra-published-canvas.png', Buffer.from(screenshot.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  check('mobile public view fits viewport', await ev('document.documentElement.scrollWidth <= window.innerWidth + 1'));
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${origin}/index.html` });
  await waitFor("document.querySelectorAll('.react-flow__node').length >= 15", 'private board deep link', 25000);
  await ev("window.__errors=[]; window.addEventListener('error', e=>window.__errors.push(e.message))");
  check('private deep link opens the real editable app workspace', await ev("!!document.querySelector('.lc-workspace') && document.querySelectorAll('.lc-card').length === 15"));
  check('all private Scripture cards render', await ev("document.querySelectorAll('.lc-card__reference').length === 8"));
  check('private central question remains visible to owner', await ev("document.body.textContent.includes('How can we help others discover truth')"));
  await sleep(300);
  screenshot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('/tmp/miqra-private-canvas.png', Buffer.from(screenshot.data, 'base64'));
  // Choose a concept via the existing outline, edit through the real editor,
  // and verify the app's save preserves integration metadata and Bible quotes.
  await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Outline').click()");
  try { await waitFor("!!document.querySelector('.moment-words')", 'outline'); }
  catch (e) { console.log(await ev("({ errors:window.__errors, text:document.body.innerText.slice(0,3000) })")); throw e; }
  const edits = await ev("[...document.querySelectorAll('button')].filter(b => /Edit thought/.test(b.textContent)).length");
  check('imported concepts are editable through the app', edits > 0);
  if (edits > 0) {
    await ev("document.querySelector('article[aria-label^=\"Observation\"] button').click()");
    await waitFor("!!document.querySelector('form[aria-label=\"Edit thought\"] textarea')", 'thought editor');
    await ev(`(() => { const el=document.querySelector('form[aria-label="Edit thought"] textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'An owner refined this observation.'); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Save changes').click()");
    await sleep(1200);
    check('authorized app edits persist and retain category metadata', await ev("(() => { const c=JSON.parse(localStorage.getItem('miqra_canvas_v1:acceptance:personal'))[0]; return c.journey.entries.some(e=>e.text==='An owner refined this observation.' && e.category==='observation') && c.journey.entries.filter(e=>e.biblePassage).length===8; })()"));
  }
  check('harness has no Supabase session or account credentials', await ev("![...Object.keys(localStorage)].some(k=>k.startsWith('sb-'))"));
  if (results.some((r) => !r.ok)) process.exitCode = 1;
} finally { cleanup(); }
