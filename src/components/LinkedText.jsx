import { splitScriptureReferences } from '../lib/scripture';
import { matchEntitySegments, dispatchWikiEntityOpen } from '../lib/wikiEntityLinker';
import './LinkedText.css';

// Renders prose with clickable scripture references and Bible Wiki / Church
// History names — for panels the global auto-linkers (scriptureLinker.js,
// wikiEntityLinker.js) deliberately skip, e.g. Bible Lookup's own Insights
// tab. `entityIndex` is the object resolved by loadEntityLinkIndex()
// (loadEntityLinkIndex from lib/wikiEntityLinker); pass null while it's still
// loading — entity names just won't be clickable yet until it resolves.
export default function LinkedText({ text, entityIndex, onRefClick, selfSlug, bookCode, as: Tag = 'span', className = '' }) {
  if (!text) return null;
  const refSegments = splitScriptureReferences(text);

  return (
    <Tag className={`linked-text ${className}`.trim()}>
      {refSegments.map((seg, i) => {
        if (seg.ref) {
          return onRefClick ? (
            <button
              key={i}
              type="button"
              className="linked-text-ref"
              onClick={() => onRefClick(seg.ref)}
            >
              {seg.text}
            </button>
          ) : <span key={i}>{seg.text}</span>;
        }
        const entitySegments = matchEntitySegments(seg.text, entityIndex, selfSlug, bookCode);
        return (
          <span key={i}>
            {entitySegments.map((es, j) => (
              es.slug ? (
                <button
                  key={j}
                  type="button"
                  className="linked-text-entity"
                  onClick={(e) => dispatchWikiEntityOpen(e.currentTarget, es.slug, es.entryType)}
                >
                  {es.text}
                </button>
              ) : <span key={j}>{es.text}</span>
            ))}
          </span>
        );
      })}
    </Tag>
  );
}
