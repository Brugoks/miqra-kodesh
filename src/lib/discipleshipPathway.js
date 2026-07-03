// The discipleship pathway: five stages from identity to multiplication,
// three sessions each. Titles, passages, and focus are fixed here; the
// discussion guide for each session (opener, questions, practice) is
// generated once by the discipleship-guide edge function and cached for
// everyone. Session ids are stable — they key the cache and progress rows.

export const PATHWAY_STAGES = [
  { key: 'rooted', label: 'Rooted', description: 'Who you are in Christ' },
  { key: 'rhythms', label: 'Rhythms', description: 'Habits that feed a life with God' },
  { key: 'serving', label: 'Serving', description: 'Using what you have for others' },
  { key: 'sharing', label: 'Sharing', description: 'Telling the story you live in' },
  { key: 'multiplying', label: 'Multiplying', description: 'Helping someone else grow' },
];

export const PATHWAY_SESSIONS = [
  // ── Rooted ──
  { id: 'rooted-loved', stage: 'rooted', title: 'Loved before you did anything', passage: 'Ephesians 2:1-10', focus: 'Grace comes first — identity is received, not earned.' },
  { id: 'rooted-new', stage: 'rooted', title: 'A new creation', passage: '2 Corinthians 5:14-21', focus: 'The old has gone; learning to see yourself the way God now does.' },
  { id: 'rooted-adopted', stage: 'rooted', title: 'Adopted, not auditioning', passage: 'Romans 8:14-17', focus: 'Assurance: living as a son or daughter instead of performing for approval.' },

  // ── Rhythms ──
  { id: 'rhythms-word', stage: 'rhythms', title: 'Feeding on the Word', passage: 'Psalm 1:1-6', focus: 'Building a sustainable, honest habit of Scripture — delight over duty.' },
  { id: 'rhythms-prayer', stage: 'rhythms', title: 'Learning to pray honestly', passage: 'Matthew 6:5-15', focus: 'Prayer as real conversation with a Father, not a performance.' },
  { id: 'rhythms-community', stage: 'rhythms', title: 'Built for together', passage: 'Hebrews 10:19-25', focus: 'Why following Jesus was never meant to be done alone.' },

  // ── Serving ──
  { id: 'serving-towel', stage: 'serving', title: 'The towel and the basin', passage: 'John 13:1-17', focus: 'Greatness measured by service — Jesus washing feet.' },
  { id: 'serving-gifts', stage: 'serving', title: 'Your gifts are for others', passage: '1 Peter 4:8-11', focus: 'Discovering what God has put in your hands and using it.' },
  { id: 'serving-hidden', stage: 'serving', title: 'Serving when no one sees', passage: 'Matthew 6:1-4', focus: 'Motives: serving for an audience of One.' },

  // ── Sharing ──
  { id: 'sharing-story', stage: 'sharing', title: 'Your story is evidence', passage: 'John 9:1-25', focus: '"One thing I do know" — learning to tell what God has done in you.' },
  { id: 'sharing-hope', stage: 'sharing', title: 'Ready to give a reason', passage: '1 Peter 3:13-17', focus: 'Speaking about hope with gentleness and respect, not pressure.' },
  { id: 'sharing-compassion', stage: 'sharing', title: 'Seeing people like Jesus does', passage: 'Luke 15:1-10', focus: 'The heart behind sharing: people matter to God.' },

  // ── Multiplying ──
  { id: 'multiplying-entrust', stage: 'multiplying', title: 'Entrust it to faithful people', passage: '2 Timothy 2:1-7', focus: 'The four-generation vision: Paul → Timothy → faithful people → others.' },
  { id: 'multiplying-jesus', stage: 'multiplying', title: 'How Jesus made disciples', passage: 'Mark 3:13-19', focus: 'Called first to be with him — presence before program.' },
  { id: 'multiplying-go', stage: 'multiplying', title: 'Your turn to go', passage: 'Matthew 28:16-20', focus: 'Naming the person you could begin walking with next.' },
];

export function getSession(sessionId) {
  return PATHWAY_SESSIONS.find((s) => s.id === sessionId) || null;
}

export function getStage(stageKey) {
  return PATHWAY_STAGES.find((s) => s.key === stageKey) || null;
}

// The next session a relationship should work through: the first one not yet
// completed, in pathway order. Returns null when the pathway is finished.
export function nextSession(completedIds) {
  const done = new Set(completedIds || []);
  return PATHWAY_SESSIONS.find((s) => !done.has(s.id)) || null;
}

export function sessionNumber(sessionId) {
  const index = PATHWAY_SESSIONS.findIndex((s) => s.id === sessionId);
  return index === -1 ? null : index + 1;
}
