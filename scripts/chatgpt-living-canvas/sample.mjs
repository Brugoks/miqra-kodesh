import { applyIntegrationChange } from '../../src/lib/canvasIntegration.js';
import { loadScripture } from '../../supabase/functions/living-canvas-api/scripture.ts';
export const SAMPLE_REFERENCES = ['Exodus 18:13–26', 'Proverbs 20:5', '1 Samuel 8:4–22', 'Mark 10:42–45', '1 Corinthians 10:23–24', '1 Corinthians 12:12–27', 'Ephesians 4:11–16', 'James 3:17'];
export const SAMPLE_INPUT = {
  idempotency_key: 'acceptance-sample-create',
  title: 'Wisdom Without Control: Authority, Discovery, and Equipping Others',
  moment: 'How can we help others discover truth, reconsider assumptions, and grow in wisdom without becoming the authority that determines their conclusions?',
  insights: [
    { category: 'observation', text: 'Exodus 18 describes Moses hearing disputes and Jethro advising him to share the work with capable people.' },
    { category: 'interpretation', text: 'Jethro’s counsel can be read as a pattern of equipping others while retaining responsibility for difficult cases.' },
    { category: 'application', text: 'Draw Out → Reframe → Examine Scripture → Wrestle → Refine. This is a proposed study heuristic, not a biblical quotation.' },
    { category: 'counterargument', text: 'Does decentralizing a decision always help? Consider how the passage also retains an accountable role for Moses.' },
    { category: 'open_question', text: 'How can we invite another person to reconsider an assumption without choosing their conclusion for them?' },
    { category: 'reflection', text: 'PRIVATE TEST REFLECTION: I want to listen before giving an answer.' },
  ],
  scriptures: SAMPLE_REFERENCES.map((reference) => ({ reference, translation: 'KJV' })),
};
export async function buildSample() {
  const scripture = await Promise.all(SAMPLE_INPUT.scriptures.map((s) => loadScripture(s.reference, s.translation)));
  let n = 0;
  const ids = () => `10000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  let row = applyIntegrationChange(null, 'create_canvas', SAMPLE_INPUT, { scripture, id: ids, now: '2026-10-31T12:00:00.000Z' });
  const entries = row.journey.entries;
  row = { ...row, ...applyIntegrationChange(row, 'update_canvas', { placements: [
    { node_id: `entry:${entries[5].id}`, x: 0, y: 250 },
    ...entries.filter((e) => e.kind === 'scripture').map((e, index) => ({ node_id: `entry:${e.id}`, x: 440 + (index % 3) * 368, y: 600 + Math.floor(index / 3) * 224 })),
  ], sections: [
    { id: 'theme:wisdom', title: 'Wisdom and equipping', entry_ids: entries.slice(0, 5).map((e) => e.id), color: 'teal' },
    { id: 'theme:scripture', title: 'Examine Scripture', entry_ids: entries.filter((e) => e.kind === 'scripture').map((e) => e.id), color: 'purple' },
  ] }) };
  row = { ...row, ...applyIntegrationChange(row, 'connect_concepts', { source: `entry:${entries[0].id}`, target: `entry:${entries[1].id}`, label: 'invites this reading', direction: 'forward' }, { id: ids }) };
  row = { ...row, ...applyIntegrationChange(row, 'connect_concepts', { source: `entry:${entries[1].id}`, target: `entry:${entries[6].id}`, label: 'examine in context', direction: 'forward' }, { id: ids }) };
  return row;
}
