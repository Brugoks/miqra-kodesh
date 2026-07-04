import { useCallback, useEffect, useRef, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../../../lib/supabaseClient';

export default function useMessageSearch({ activeOrgId, setError }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef(null);

  const search = useCallback(async (value) => {
    const clean = value.trim();
    if (!hasSupabaseConfig || !activeOrgId || clean.length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    const { data, error } = await supabase.rpc('chat_search_messages', {
      org_id: activeOrgId,
      q: clean,
    });
    if (error) {
      setError(error.message || 'Could not search messages.');
      setResults([]);
    } else {
      setResults(data || []);
    }
    setSearching(false);
  }, [activeOrgId, setError]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      search(query);
    }, query.trim() ? 250 : 0);
    return () => window.clearTimeout(timeout);
  }, [query, search]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    inputRef,
    query,
    results,
    searching,
    setQuery,
    setResults,
  };
}
