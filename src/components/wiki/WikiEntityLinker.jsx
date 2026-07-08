import { useEffect } from 'react';
import { initWikiEntityLinks } from '../../lib/wikiEntityLinker';
import './WikiEntityLinker.css';

// Mount once near the app root, alongside ScriptureLinker. Activates app-wide
// auto-linking of Bible Wiki / Church History names; clicks are handled
// globally and open the WikiEntityPeek popover.
export default function WikiEntityLinker() {
  useEffect(() => {
    const cleanup = initWikiEntityLinks();
    return cleanup;
  }, []);
  return null;
}
