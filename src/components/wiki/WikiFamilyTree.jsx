import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';

// Compact three-generation family view built from the foundation `rel` data:
// parents on top, the subject with spouse(s) and siblings in the middle,
// children below. Clicking any relative recenters the tree by navigating to
// their page — an explorable genealogy without a graph library.
export default function WikiFamilyTree({ entry, bySlug }) {
  const navigate = useNavigate();

  const tree = useMemo(() => {
    const rel = entry.rel;
    if (!rel) return null;
    const resolve = (v) => [].concat(v || []).map((s) => bySlug.get(s)).filter(Boolean);
    const parents = [...resolve(rel.fa), ...resolve(rel.mo)];
    const spouses = resolve(rel.pt);
    const siblings = resolve(rel.sib);
    const children = resolve(rel.ch);
    if (!parents.length && !spouses.length && !siblings.length && !children.length) return null;
    return { parents, spouses, siblings, children };
  }, [entry, bySlug]);

  if (!tree) return null;

  const node = (person, variant = '') => (
    <button
      key={person.s}
      className={`wft-node ${variant}`}
      onClick={() => navigate(`/wiki/${person.s}`)}
      title={person.desc || person.name}
    >
      {person.name}
    </button>
  );

  return (
    <section className="wft-section">
      <h2 className="bw-section-title"><Users size={15} /> Family tree</h2>
      <div className="wft-tree" data-no-scripture>
        {tree.parents.length > 0 && (
          <div className="wft-row wft-parents">
            {tree.parents.map((p) => node(p))}
          </div>
        )}
        {tree.parents.length > 0 && <div className="wft-connector" aria-hidden="true" />}
        <div className="wft-row wft-center">
          {tree.siblings.map((p) => node(p, 'wft-sibling'))}
          <span className="wft-node wft-self">{entry.name}</span>
          {tree.spouses.map((p) => node(p, 'wft-spouse'))}
        </div>
        {tree.children.length > 0 && <div className="wft-connector" aria-hidden="true" />}
        {tree.children.length > 0 && (
          <div className="wft-row wft-children">
            {tree.children.map((p) => node(p))}
          </div>
        )}
      </div>
      <p className="wft-legend">
        {tree.parents.length > 0 && <span>▲ parents</span>}
        {tree.siblings.length > 0 && <span>siblings (left)</span>}
        {tree.spouses.length > 0 && <span>spouse (right)</span>}
        {tree.children.length > 0 && <span>▼ children</span>}
        <span>tap a name to recenter</span>
      </p>
    </section>
  );
}
