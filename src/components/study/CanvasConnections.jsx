import { Link } from 'react-router-dom';
import { ArrowUpRight, Map } from 'lucide-react';
import { combinedSources } from '../../lib/studyCanvasModel';

/** People and places indexed in the canvas's chapters, and the way into the Atlas. */
export default function CanvasConnections({ passages, selectedSource }) {
  const entities = combinedSources(passages).filter((source) => source.kind !== 'verse');
  const chapters = [...new Set(passages.map((passage) => passage.chapterId))];
  return <aside className="canvas-connections" aria-label="Related people and places">
    <div className="canvas-section-heading"><h2>{chapters.length > 1 ? 'In these chapters' : 'In this chapter'}</h2></div>
    <p className="canvas-context-note">Chapter-level Wiki connections; some may fall outside your selected verses.</p>
    <Link className="canvas-atlas" to={`/atlas?chapters=${encodeURIComponent(chapters.join(','))}`}><Map size={22} /><span><strong>Explore the setting</strong><small>Open {chapters.length > 1 ? 'these chapters' : 'this chapter'} in Ancient World</small></span><ArrowUpRight size={17} /></Link>
    {entities.map((source) => <article id={`canvas-${source.id}`} tabIndex={-1} key={source.id} className={`canvas-card ${selectedSource === source.id ? 'canvas-selected' : ''}`}><span className="canvas-kind">{source.kind === 'person' ? 'Person' : 'Place'}</span><h3><Link to={`/wiki/${encodeURIComponent(source.slug)}`}>{source.title} <ArrowUpRight size={14} /></Link></h3><p>{source.text}</p></article>)}
    {!entities.length && <p>No related Wiki entries are indexed for {chapters.length > 1 ? 'these chapters' : 'this chapter'} yet.</p>}
    <p className="canvas-context-note">Wiki foundation: Theographic Bible Metadata and OpenBible.info (CC BY), with curated app notes. Explanations are AI-generated interpretations; inspect their linked evidence.</p>
  </aside>;
}
