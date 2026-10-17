import { BookOpen } from 'lucide-react';
import { ScriptureEvidence } from '../RelatedScripture';

/** A card's full words, Scripture and evidence — the same in the outline and the details panel. */
export default function CardBody({ content, canvas }) {
  const { entry } = content;
  return <>
    {content.reference && <button className="moment-scripture-link" onClick={() => window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref: content.reference } }))}><BookOpen size={15} /> Read {content.reference}</button>}
    {entry?.scripture && <ScriptureEvidence scripture={entry.scripture} currentGlimpse={canvas.journey.moment} />}
    {content.text && <p className="moment-words">{content.text}</p>}
    {entry?.kind === 'scripture' && content.text && <small>{entry.scripture ? 'My reflection' : 'My connection to Scripture'}</small>}
  </>;
}
