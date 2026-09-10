import { supabase } from './supabaseClient';
import { getFunctionErrorMessage } from './functionErrors';

export async function requestCanvas(body, signal) {
  if (!supabase) throw new Error('Sign in to use Living Study Canvas.');
  const { data, error } = await supabase.functions.invoke('study-canvas', {
    body, signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
  });
  if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
  if (error || data?.error) throw new Error(data?.error || await getFunctionErrorMessage(error, 'Could not load this study. Please retry.'));
  return data;
}

const storageKey = (userId, orgId) => `miqra_canvas_v1:${userId}:${orgId || 'personal'}`;

export function readCanvases(userId, orgId) {
  if (!userId) return [];
  try {
    const data = JSON.parse(localStorage.getItem(storageKey(userId, orgId)) || '[]');
    return Array.isArray(data) ? data.filter((item) => typeof item?.id === 'string' && typeof item?.title === 'string'
      && typeof item?.workspace?.reference === 'string' && typeof item.workspace.chapterId === 'string'
      && Array.isArray(item.workspace.sources) && item.workspace.sources.every((s) => typeof s?.id === 'string' && typeof s?.text === 'string' && typeof s?.title === 'string'
        && (s.kind === 'verse' ? typeof s.ref === 'string' : ['person', 'place'].includes(s.kind) && typeof s.slug === 'string'))
      && Array.isArray(item?.explanation?.cards) && item.explanation.cards.every((c) => typeof c?.id === 'string' && typeof c?.title === 'string' && typeof c?.body === 'string' && Array.isArray(c.sourceIds))
      && Array.isArray(item.explanation.questions) && item.explanation.questions.every((q) => typeof q === 'string')
      && Array.isArray(item.turns) && item.turns.every((t) => ['user', 'assistant'].includes(t?.role) && typeof t.content === 'string')).slice(0, 10) : [];
  } catch { return []; }
}

export function saveCanvas(userId, orgId, canvas) {
  if (!userId) throw new Error('Sign in before saving a canvas.');
  const saved = [canvas, ...readCanvases(userId, orgId).filter((item) => item.id !== canvas.id)].slice(0, 10);
  localStorage.setItem(storageKey(userId, orgId), JSON.stringify(saved));
  return saved;
}

export function deleteCanvas(userId, orgId, id) {
  const saved = readCanvases(userId, orgId).filter((item) => item.id !== id);
  localStorage.setItem(storageKey(userId, orgId), JSON.stringify(saved));
  return saved;
}
