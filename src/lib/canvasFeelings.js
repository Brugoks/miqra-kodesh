// Ways into a raw moment. A feeling chip does two things and neither is an AI
// call: on the capture form it drops an honest sentence-starter into the box
// (the words are the data, so nothing about the model of a moment changes), and
// on the Scripture panel it is sent with the pull so the passage choice can meet
// the feeling instead of guessing at it. The server holds the matching guidance
// (study-canvas/feelings.ts); a test keeps the two lists in step.
//
// Stems are first person, unfinished and unflattering on purpose: the point is to
// make the honest version easier to start than the polished one.

export const CANVAS_FEELINGS = [
  { key: 'overwhelmed', label: 'Overwhelmed', stem: 'I’m overwhelmed right now. Everything feels like… ' },
  { key: 'anxious', label: 'Anxious', stem: 'I can’t stop worrying about… ' },
  { key: 'angry', label: 'Angry', stem: 'I’m angry, and the honest version is… ' },
  { key: 'grieving', label: 'Grieving', stem: 'I’m grieving… ' },
  { key: 'numb', label: 'Numb', stem: 'I feel numb. I don’t even know if I… ' },
  { key: 'ashamed', label: 'Ashamed', stem: 'I feel ashamed about… ' },
  { key: 'lonely', label: 'Lonely', stem: 'I feel alone. It seems like nobody… ' },
  { key: 'doubting', label: 'Doubting', stem: 'I’m struggling to believe… ' },
  { key: 'confused', label: 'Confused', stem: 'I don’t understand why… ' },
  { key: 'grateful', label: 'Grateful', stem: 'I’m thankful for… ' },
  { key: 'hopeful', label: 'Hopeful', stem: 'Something is giving me hope… ' },
  { key: 'joyful', label: 'Joyful', stem: 'I’m so glad about… ' },
];

// Questions that turn a feeling into something to explore. Each fills the focus
// box, where the person can reword it; they are not sent until the pull.
export const FOCUS_PROMPTS = [
  'Where is God in this?',
  'What am I afraid to admit?',
  'What does Scripture say to someone who feels this way?',
  'What could I honestly bring to God about this?',
  'What is one thing I can hold onto?',
];

const BY_KEY = new Map(CANVAS_FEELINGS.map((feeling) => [feeling.key, feeling]));

/** The feeling for a key, or null for anything we do not offer. */
export const feelingByKey = (key) => (typeof key === 'string' ? BY_KEY.get(key) || null : null);

/**
 * The capture text after choosing a feeling. Nothing the person already wrote is
 * touched: a stem goes in an empty box as it is, and after existing words on a
 * new paragraph. Choosing the same one twice does not repeat it, and a stem that
 * would push the note past `max` is not added.
 */
export function withFeelingStem(text, key, max = Infinity) {
  const feeling = feelingByKey(key);
  if (!feeling) return text;
  if (!text.trim()) return feeling.stem;
  if (text.trimEnd().endsWith(feeling.stem.trimEnd())) return text;
  const next = `${text.trimEnd()}\n\n${feeling.stem}`;
  return next.length > max ? text : next;
}

// The feeling chosen at capture is remembered on this device for that moment, so
// the Scripture panel can open already knowing it. It is a convenience, not a
// record: it never leaves the device and a moment works the same without it.
const hintKey = (canvasId) => `miqra_moment_feeling_v1:${canvasId}`;

export function rememberFeeling(canvasId, key) {
  try {
    if (feelingByKey(key)) localStorage.setItem(hintKey(canvasId), key);
    else localStorage.removeItem(hintKey(canvasId));
  } catch { /* the choice still applies for this visit */ }
}

export function recalledFeeling(canvasId) {
  try {
    const key = localStorage.getItem(hintKey(canvasId));
    return feelingByKey(key) ? key : '';
  } catch { return ''; }
}
