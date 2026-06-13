import { useEffect } from 'react';
import { initScriptureLinks } from '../lib/scriptureLinker';
import './ScriptureLinker.css';

// Mount once near the app root. Activates app-wide auto-linking of scripture
// references; clicks are handled globally and open the BibleLookup modal.
export default function ScriptureLinker() {
  useEffect(() => {
    const cleanup = initScriptureLinks();
    return cleanup;
  }, []);
  return null;
}
