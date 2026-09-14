import { supabase } from './supabaseClient';
import { getFunctionErrorMessage } from './functionErrors';
import { canvasReference, normalizeCanvas } from './studyCanvasModel';

export { normalizeCanvas } from './studyCanvasModel';

export async function requestCanvas(body, signal) {
  if (!supabase) throw new Error('Sign in to use Living Study Canvas.');
  const { data, error } = await supabase.functions.invoke('study-canvas', {
    body, signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
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

const summarize = (canvas) => ({ id: canvas.id, title: canvas.title, reference: canvasReference(canvas.passages), stepCount: canvas.steps.length, savedAt: canvas.savedAt, shared: Boolean(canvas.share?.token) });

function readLocalKey(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(data) ? data.map(normalizeCanvas).filter(Boolean) : [];
  } catch { return []; }
}

/** Device-local canvases — the fallback when sync is unavailable, and the source of the one-time upload. */
export function readCanvases(userId, orgId) {
  return userId ? readLocalKey(storageKey(userId, orgId)).slice(0, LOCAL_LIMIT) : [];
}

// Sharing fields are deliberately absent: an autosave must never re-share or
// un-share a canvas. Only setCanvasSharing writes those.
const toRow = (canvas) => ({
  id: canvas.id,
  title: (canvas.title?.trim() || canvas.steps[0].explanation.title).slice(0, 160),
  reference: canvasReference(canvas.passages).slice(0, 500),
  passages: canvas.passages,
  steps: canvas.steps,
  pins: canvas.pins || [],
});

// Canvases saved before sync existed are stranded on whichever device made
// them. Upload every org's local saves for this user, and only clear a key
// once its upload succeeded, so a failed request never loses a study.
async function uploadLocalCanvases(userId) {
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(localPrefix(userId))) keys.push(key);
  }
  for (const key of keys) {
    const items = readLocalKey(key);
    if (items.length) {
      const rows = items.map((item) => ({ ...toRow(item), ...(item.savedAt ? { created_at: item.savedAt } : {}) }));
      const { error } = await supabase.from('study_canvases').upsert(rows);
      if (error) throw error;
    }
    localStorage.removeItem(key);
  }
}

export async function listCanvases(userId, orgId) {
  if (!userId) return [];
  if (!supabase) return readCanvases(userId, orgId).map(summarize);
  try { await uploadLocalCanvases(userId); } catch { /* keep local copies; retried next visit */ }
  const { data, error } = await supabase.from('study_canvases')
    .select('id, title, reference, step_count, share_token, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []).map((row) => ({ id: row.id, title: row.title, reference: row.reference, stepCount: row.step_count, savedAt: row.updated_at, shared: Boolean(row.share_token) }));
}

export async function loadCanvas(userId, orgId, id) {
  if (!supabase) {
    const canvas = readCanvases(userId, orgId).find((item) => item.id === id);
    if (!canvas) throw new Error('This saved canvas could not be found.');
    return canvas;
  }
  const { data, error } = await supabase.from('study_canvases')
    .select('id, title, passages, steps, pins, share_token, share_includes_notes, updated_at').eq('id', id).maybeSingle();
  if (error) throw error;
  const canvas = normalizeCanvas(data);
  if (!canvas) throw new Error('This saved canvas could not be opened.');
  return canvas;
}

/** Upserts a canvas and returns the refreshed saved list. */
export async function saveCanvas(userId, orgId, canvas) {
  if (!userId) throw new Error('Sign in before saving a canvas.');
  if (!supabase) {
    const entry = { ...toRow(canvas), savedAt: new Date().toISOString() };
    const saved = [entry, ...readCanvases(userId, orgId).filter((item) => item.id !== canvas.id)].slice(0, LOCAL_LIMIT);
    localStorage.setItem(storageKey(userId, orgId), JSON.stringify(saved));
    return saved.map(normalizeCanvas).filter(Boolean).map(summarize);
  }
  const { error } = await supabase.from('study_canvases').upsert(toRow(canvas));
  if (error) throw error;
  return listCanvases(userId, orgId);
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
