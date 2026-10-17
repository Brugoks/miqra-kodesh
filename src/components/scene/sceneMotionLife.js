// A small, deterministic performance schedule shared by skinned actors and the
// distant crowd. Captured gestures get breathing room instead of looping forever.
const STANDING = new Set(['breathing-idle', 'weight-shift', 'look-around', 'thinking', 'nod-yes', 'talk-ask', 'talk-chat']);
const TALKING = new Set(['talk-ask', 'talk-chat']);
const KNEELING = new Set(['kneel-idle', 'kneel-pray']);
// Handling something at the feet (bending to a basket, a net, the ground). It is one long movement, so it is
// played whole, between spells of standing at ease.
const WORKING = new Set(['pick-up']);
// FNV-1a with a final mix. The first hash here was `n * 31 + c`, under which ids that differ in their last
// digit differ by a few units and so got schedules a few hundredths of a second apart: the village's talkers
// fell into two clusters and gestured together half the time.
const hash = (value) => {
  let n = 2166136261;
  for (const c of String(value || '')) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  n ^= n >>> 16; n = Math.imul(n, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16;
  return n >>> 0;
};

export function motionPlanFor(entry) {
  if (entry.motionLife === false || entry.route || entry.lying || entry.hold?.length || entry.props?.length) return null;
  // An explicitly authored idle already is continuous. Keep its original phase:
  // another actor may have been fitted against it for a touch or embrace.
  if (entry.motion === 'breathing-idle' || entry.motion === 'kneel-idle') return null;
  let gesture = entry.motion;
  // Authored interactions keep their hand placement. Only explicitly opted-in
  // tableaux replace common poses; custom poses remain entirely scene-owned.
  if (!gesture && entry.motion === undefined && entry.motionLife && !entry.hold?.length && !entry.carryChild) {
    gesture = { standIdle: 'look-around', standListen: 'nod-yes', standTalk: 'talk-ask', kneelListen: 'kneel-idle', kneelBowed: 'kneel-pray' }[entry.pose];
  }
  if (!STANDING.has(gesture) && !KNEELING.has(gesture) && !WORKING.has(gesture)) return null;
  const seed = hash(entry.conversationId || entry.fallbackId || entry.id);
  const talking = TALKING.has(gesture);
  const working = WORKING.has(gesture);
  return {
    rest: KNEELING.has(gesture) ? 'kneel-idle' : 'breathing-idle',
    gesture,
    period: talking ? 24 : working ? 26 + seed % 11 : 19 + seed % 9,
    offset: entry.conversationId ? seed % 24 + (entry.conversationSlot || 0) * 12 : (seed % 1700) / 100,
    // `pick-up` is 9.55 s long; the rest of the clips are looped or clipped to a few seconds.
    duration: talking ? 6 : working ? 9.4 : gesture === 'nod-yes' ? 3 : 5,
  };
}

export function motionKeysFor(entry) {
  const plan = motionPlanFor(entry);
  return [...new Set([entry.motion, plan?.rest, plan?.gesture].filter(Boolean))];
}

export function sampleMotionPlan(plan, elapsed) {
  if (!plan) return null;
  const time = Math.max(0, elapsed) + plan.offset;
  if (plan.rest === plan.gesture) return { key: plan.rest, time, once: false };
  const cycle = time % plan.period;
  const gesturing = cycle >= 1 && cycle < 1 + plan.duration;
  return { key: gesturing ? plan.gesture : plan.rest, time: gesturing ? cycle - 1 : time, once: gesturing };
}

export function motionSampleTime(sample, duration) {
  return sample.once ? Math.min(sample.time, Math.max(0, duration - 0.001)) : sample.time % duration;
}
