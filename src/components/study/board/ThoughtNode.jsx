import { memo } from 'react';
import Anchors from './Anchors';
import { cardClasses } from './nodeClasses';

/** A reflection, prayer, question, response or the original glimpse: a short excerpt, never the whole note. */
function ThoughtNode({ data, selected }) {
  return <div className={cardClasses(data, selected)}>
    <Anchors />
    <header className="lc-card__header"><span className="lc-card__kind">{data.label}</span><time>{data.date}</time></header>
    <p className="lc-card__text">{data.text}</p>
    {data.links > 0 && <footer className="lc-card__links">{data.links} {data.links === 1 ? 'connection' : 'connections'}</footer>}
  </div>;
}

export default memo(ThoughtNode);
