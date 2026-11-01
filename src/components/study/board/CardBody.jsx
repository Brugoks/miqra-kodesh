import { BookOpen } from 'lucide-react';
import { ScriptureEvidence } from '../RelatedScripture';
import { SermonSource } from '../SermonInsights';

/** A card's full words, Scripture and evidence — the same in the outline and the details panel. */
export default function CardBody({ content, canvas, readOnly = false }) {
  const { entry } = content;
  return <>
    {content.reference && (readOnly ? <p>{content.reference}</p> : <button className="moment-scripture-link" onClick={() => window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref: content.reference } }))}><BookOpen size={15} /> Read {content.reference}</button>)}
    {entry?.sermon && <SermonSource sermon={entry.sermon} />}
    {entry?.scripture && <ScriptureEvidence scripture={entry.scripture} currentGlimpse={canvas.journey.moment} />}
    {entry?.provenance === 'ai' && <small>AI-assisted · editable · weigh against Scripture</small>}
    {entry?.biblePassage && <section aria-label={`${entry.biblePassage.translation} Scripture`}>
      <h3>{entry.biblePassage.reference} · {entry.biblePassage.translation}</h3>
      {entry.biblePassage.verses.map((verse) => <blockquote key={verse.reference}><strong>{verse.reference}</strong> {verse.text}</blockquote>)}
    </section>}
    {content.text && <p className="moment-words">{content.text}</p>}
    {entry?.kind === 'scripture' && content.text && <small>{entry.scripture || entry.sermon ? 'My reflection' : 'My connection to Scripture'}</small>}
  </>;
}
