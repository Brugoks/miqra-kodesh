import { memo } from 'react';
import { BookOpen } from 'lucide-react';
import Anchors from './Anchors';
import { cardClasses } from './nodeClasses';

/** A passage on the board: its reference leads, with a line of the text or the person's own note. */
function ScriptureNode({ data, selected }) {
  return <div className={cardClasses(data, selected)}>
    <Anchors />
    <header className="lc-card__header"><span className="lc-card__kind"><BookOpen size={13} aria-hidden="true" /> {data.label}</span><time>{data.date}</time></header>
    <p className="lc-card__reference">{data.reference}</p>
    <p className="lc-card__text lc-card__text--short">{data.text}</p>
    {data.links > 0 && <footer className="lc-card__links">{data.links} {data.links === 1 ? 'connection' : 'connections'}</footer>}
  </div>;
}

export default memo(ScriptureNode);
