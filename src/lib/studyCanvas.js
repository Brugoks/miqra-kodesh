import { supabase } from './supabaseClient';
import { getFunctionErrorMessage } from './functionErrors';
import { canvasReference, normalizeCanvas } from './studyCanvasModel';
import { boardEnabled } from './canvasFlags';

export { normalizeCanvas } from './studyCanvasModel';

export async function requestCanvas(body, signal) {
  if (!supabase) throw new Error('Sign in to use Living Study Canvas.');
  // Related Scripture makes two provider calls with a Bible lookup between them.
  const timeout = body.action === 'related' ? 120000 : 60000;
  const { data, error } = await supabase.functions.invoke('study-canvas', {
    body, signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]),
  });
  if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
  if (error || data?.error) throw new Error(data?.error || await getFunctionErrorMessage(error, 'Could not load this study. Please retry.'));
  return data;
}

// Storage for canvases (shape: src/lib/studyCanvasModel.js). Synced to the
// account through `study_canvases` when Supabase is configured; otherwise kept
// on this device, which is also where canvases lived before sync existed.
const LOCAL_LIMIT = 10;
const localPrefix = (userId) => `miqra_canvas_v1:${userId}:`;
const storageKey = (userId, orgId) => `${localPrefix(userId)}${orgId || 'personal'}`;

/** Saves sync to the account when Supabase is configured; otherwise they stay on this device. */
export const isCanvasSyncAvailable = () => Boolean(supabase);

const summarize = (canvas) => ({ id: canvas.id, title: canvas.title, reference: canvasReference(canvas.passages), stepCount: canvas.steps.length, savedAt: canvas.savedAt, shared: Boolean(canvas.share?.token), ...(canvas.journey ? { isMoment: true, revisitOn: canvas.journey.revisitOn } : {}) });

function readRawKey(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}
const readLocalKey = (key) => readRawKey(key).map(normalizeCanvas).filter(Boolean);

/** Device-local canvases — the fallback when sync is unavailable, and the source of the one-time upload. */
export function readCanvases(userId, orgId) {
  return userId ? readLocalKey(storageKey(userId, orgId)).slice(0, LOCAL_LIMIT) : [];
}

// Sharing fields are deliberately absent: an autosave must never re-share or
// un-share a canvas. Only setCanvasSharing writes those.
// `board` is written only when there is a readable layout to write. A canvas
// that was never arranged leaves the column alone, and one whose saved layout
// couldn't be read (boardIssue) must not replace it with anything.
const toRow = (canvas) => ({
  id: canvas.id,
  title: (canvas.title?.trim() || canvas.journey?.moment || canvas.steps[0].explanation.title).slice(0, 160),
  reference: canvasReference(canvas.passages).slice(0, 500) || (canvas.journey ? 'Personal moment' : ''),
  passages: canvas.passages,
  steps: canvas.steps,
  pins: canvas.pins || [],
  ...(canvas.journey ? { journey: canvas.journey } : {}),
  ...(canvas.journey && canvas.board && !canvas.boardIssue ? { board: canvas.board } : {}),
});

// Canvases saved before sync existed are stranded on whichever device made
// them. Upload every org's local saves for this user, and only clear a key
// once its upload succeeded, so a failed request never loses a study.
// Uploading never overwrites: an id the account already holds is a collision.
// The account's copy wins when it is at least as new; a newer device copy is
// kept on this device, untouched, rather than replace what the account has.
async function uploadLocalCanvases(userId) {
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(localPrefix(userId))) keys.push(key);
  }
  for (const key of keys) {
    const raw = readRawKey(key);
    const items = raw.map(normalizeCanvas).filter(Boolean);
    let kept = [];
    if (items.length) {
      const { data: existing, error: lookup } = await supabase.from('study_canvases').select('id, updated_at').in('id', items.map((item) => item.id));
      if (lookup) throw lookup;
      const accountAt = new Map((existing || []).map((row) => [row.id, row.updated_at]));
      const missing = items.filter((item) => !accountAt.has(item.id));
      if (missing.length) {
        const { error } = await supabase.from('study_canvases').insert(missing.map((item) => ({ ...toRow(item), ...(item.savedAt ? { created_at: item.savedAt } : {}) })));
        if (error) throw error;
      }
      const newer = new Set(items.filter((item) => accountAt.has(item.id) && Date.parse(item.savedAt) > Date.parse(accountAt.get(item.id))).map((item) => item.id));
      kept = raw.filter((row) => newer.has(row?.id));
    }
    if (kept.length) localStorage.setItem(key, JSON.stringify(kept));
    else localStorage.removeItem(key);
  }
}

export async function listCanvases(userId, orgId) {
  if (!userId) return [];
  if (!supabase) return readCanvases(userId, orgId).map(summarize);
  try { await uploadLocalCanvases(userId); } catch { /* keep local copies; retried next visit */ }
  const { data, error } = await supabase.from('study_canvases')
    .select('id, title, reference, step_count, share_token, updated_at, journey_kind:journey->>kind, revisit_on:journey->>revisitOn')
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []).map((row) => ({ id: row.id, title: row.title, reference: row.reference, stepCount: row.step_count, savedAt: row.updated_at, shared: Boolean(row.share_token), ...(row.journey_kind === 'moment' ? { isMoment: true, revisitOn: row.revisit_on } : {}) }));
}

// The `board` column is only read while the spatial workspace is switched on (canvasFlags.js). With it off the
// frontend never touches the column, so it can be deployed before the board migration is applied.
export async function loadCanvas(userId, orgId, id) {
  if (!supabase) {
    const canvas = readCanvases(userId, orgId).find((item) => item.id === id);
    if (!canvas) throw new Error('This saved canvas could not be found.');
    return canvas;
  }
  const { data, error } = await supabase.from('study_canvases')
    .select(`id, title, passages, steps, pins, journey, ${boardEnabled() ? 'board, ' : ''}share_token, share_includes_notes, updated_at`).eq('id', id).maybeSingle();
  if (error) throw error;
  const canvas = normalizeCanvas(data);
  if (!canvas) throw new Error('This saved canvas could not be opened.');
  return canvas;
}

/**
 * Upserts a Scripture study and returns the refreshed saved list. A personal
 * canvas never goes through here: its saves are compare-and-swap, one request at
 * a time, and never recreate a canvas deleted elsewhere (see saveMoment).
 */
export async function saveCanvas(userId, orgId, canvas) {
  if (!userId) throw new Error('Sign in before saving a canvas.');
  if (canvas.journey) throw new Error('A personal canvas is saved with saveMoment.');
  if (!normalizeCanvas(canvas)) throw new Error('This canvas could not be saved. Check its contents and try again.');
  if (!supabase) {
    const entry = { ...toRow(canvas), savedAt: new Date().toISOString() };
    const others = readCanvases(userId, orgId).filter((item) => item.id !== canvas.id);
    if (others.length >= LOCAL_LIMIT) throw new Error('This device holds 10 canvases. Export and delete one before adding another.');
    const saved = [entry, ...others];
    localStorage.setItem(storageKey(userId, orgId), JSON.stringify(saved));
    return saved.map(normalizeCanvas).filter(Boolean).map(summarize);
  }
  const { error } = await supabase.from('study_canvases').upsert(toRow(canvas));
  if (error) throw error;
  return listCanvases(userId, orgId);
}

/** Why a save was refused, in terms the autosave can act on. */
export class CanvasSaveError extends Error {
  constructor(code, message) { super(message); this.name = 'CanvasSaveError'; this.code = code; }
}

/**
 * Saves a personal canvas and returns only its new timestamp, so a drag never
 * re-reads the library and an acknowledgement can't overwrite later edits.
 *
 * `baseSavedAt` is the timestamp of the version this save builds on; without
 * one the canvas is new and is inserted. An update applies only while the row
 * still has that timestamp (compare-and-swap), and there is no fallback
 * upsert: a canvas deleted on another device is reported ('gone'), never
 * quietly recreated by a retry.
 */
export async function saveMoment(userId, orgId, canvas, baseSavedAt = null) {
  if (!userId) throw new CanvasSaveError('signed-out', 'Sign in before saving a canvas.');
  if (!canvas.journey || !normalizeCanvas(canvas)) throw new CanvasSaveError('invalid', 'This canvas could not be saved. Check its contents and try again.');
  if (!supabase) {
    const all = readCanvases(userId, orgId);
    const current = all.find((item) => item.id === canvas.id);
    if (baseSavedAt && !current) throw new CanvasSaveError('gone', 'This canvas was deleted on this device from another tab.');
    if (!baseSavedAt && current) throw new CanvasSaveError('conflict', 'This canvas already exists on this device.');
    if (baseSavedAt && current.savedAt !== baseSavedAt) throw new CanvasSaveError('conflict', 'This canvas changed in another tab on this device.');
    if (!current && all.length >= LOCAL_LIMIT) throw new CanvasSaveError('local-full', 'This device holds 10 canvases. Export and delete one before adding another.');
    const savedAt = new Date().toISOString();
    // A save that carries no layout leaves the stored one alone — whether it
    // couldn't be read or was deliberately hidden — exactly as a server update would.
    const stored = readRawKey(storageKey(userId, orgId));
    const keepLayout = (item) => {
      if (item.journey && !item.board) {
        const raw = item.boardIssue ? item.boardIssue.raw : stored.find((row) => row?.id === item.id)?.board;
        if (raw != null) return { board: raw };
      }
      return {};
    };
    const row = (item, at) => ({ ...toRow(item), ...keepLayout(item), savedAt: at });
    localStorage.setItem(storageKey(userId, orgId), JSON.stringify([row(canvas, savedAt), ...all.filter((item) => item.id !== canvas.id).map((item) => row(item, item.savedAt))]));
    return { savedAt };
  }
  if (!baseSavedAt) {
    const { data, error } = await supabase.from('study_canvases').insert(toRow(canvas)).select('updated_at').single();
    if (error?.code === '23505') throw new CanvasSaveError('conflict', 'This canvas already exists on your account.');
    if (error) throw error;
    return { savedAt: data.updated_at };
  }
  const { data, error } = await supabase.from('study_canvases').update(toRow(canvas))
    .eq('id', canvas.id).eq('updated_at', baseSavedAt).select('updated_at').maybeSingle();
  if (error) throw error;
  if (data) return { savedAt: data.updated_at };
  // Nothing matched: either another device changed it, or deleted it.
  const { data: row, error: lookup } = await supabase.from('study_canvases').select('id').eq('id', canvas.id).maybeSingle();
  if (lookup) throw lookup;
  if (!row) throw new CanvasSaveError('gone', 'This canvas was deleted on another device.');
  throw new CanvasSaveError('conflict', 'This canvas changed on another device.');
}

export async function deleteCanvas(userId, orgId, id) {
  if (!supabase) {
    const saved = readCanvases(userId, orgId).filter((item) => item.id !== id);
    localStorage.setItem(storageKey(userId, orgId), JSON.stringify(saved));
    return saved.map(summarize);
  }
  const { error } = await supabase.from('study_canvases').delete().eq('id', id);
  if (error) throw error;
  return listCanvases(userId, orgId);
}

/**
 * Turns link sharing on or off. Keeping `currentToken` while sharing keeps the
 * link stable when only the notes setting changes; turning sharing off drops
 * the token, so sharing again mints a new link and the old one stops working.
 */
export async function setCanvasSharing(id, { enabled, includeNotes, currentToken = null }) {
  if (!supabase) throw new Error('Sharing needs a synced account.');
  const token = enabled ? currentToken || crypto.randomUUID() : null;
  const { error } = await supabase.from('study_canvases').update({ share_token: token, share_includes_notes: Boolean(includeNotes) }).eq('id', id);
  if (error) throw error;
  return { token, includeNotes: Boolean(includeNotes) };
}

/** A canvas someone shared by link, or null when the link is wrong or sharing was turned off. */
export async function loadSharedCanvas(token) {
  if (!supabase) throw new Error('Sign in to open a shared canvas.');
  const { data, error } = await supabase.rpc('get_shared_study_canvas', { p_token: token });
  if (error) {
    if (error.code === '22P02') return null; // not a uuid: a mangled link
    throw error;
  }
  const canvas = data ? normalizeCanvas(data) : null;
  return canvas && { ...canvas, ownerName: data.ownerName || '', includesNotes: data.includesNotes === true };
}
