import { useState } from 'react';
import { Search, Loader2, Sparkles, BookOpen, AlertCircle, CornerDownRight } from 'lucide-react';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';
import './SemanticSearch.css';

export default function SemanticSearch({ onNavigateToVerse }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    const queryText = query.trim();
    if (!queryText) return;

    setLoading(true);
    setError('');
    setResults(null);

    if (!hasSupabaseConfig) {
      setError('Supabase is not configured. Please check your environment settings.');
      setLoading(false);
      return;
    }

    try {
      // 1. Invoke hf-proxy to generate embedding for the search query
      const { data: embedData, error: embedError } = await supabase.functions.invoke('hf-proxy', {
        body: {
          prompt: queryText,
          provider: 'huggingface',
          task: 'embed'
        }
      });

      if (embedError) {
        throw new Error(embedError.message || 'Failed to generate search embedding');
      }

      if (!embedData || !embedData.embedding) {
        throw new Error('No embedding returned from hf-proxy. Please try again.');
      }

      // 2. Call the RPC database function search_verses with query_embedding
      const { data: searchData, error: searchError } = await supabase.rpc('search_verses', {
        query_embedding: embedData.embedding,
        match_count: 10
      });

      if (searchError) {
        throw new Error(searchError.message || 'Error executing similarity search');
      }

      setResults(searchData || []);
    } catch (err) {
      console.error('Semantic search failure:', err);
      setError(err.message || 'Search failed. The embedding service might be busy. Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ss-container animate-fade-in">
      <form className="ss-form" onSubmit={handleSearch}>
        <div className="ss-input-wrapper">
          <input
            className="ss-input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (error) setError('');
            }}
            placeholder="Search by topic or meaning, e.g. 'anxiety and peace'..."
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
          />
          <Search size={16} className="ss-input-icon" />
        </div>
        <button type="submit" className="ss-submit-btn" disabled={loading || !query.trim()}>
          {loading ? (
            <>
              <Loader2 size={15} className="ss-spin" />
              <span>Searching…</span>
            </>
          ) : (
            <>
              <Sparkles size={14} />
              <span>Search</span>
            </>
          )}
        </button>
      </form>

      <div className="ss-content">
        {error && (
          <div className="ss-notice">
            <AlertCircle size={24} className="ss-notice-icon" />
            <p className="ss-empty-title">Something went wrong</p>
            <p className="ss-empty-desc">{error}</p>
          </div>
        )}

        {loading && (
          <div className="ss-loading">
            <Loader2 size={24} className="ss-spin" />
            <span>AI is understanding context &amp; searching scripture…</span>
          </div>
        )}

        {!loading && !error && results === null && (
          <div className="ss-empty">
            <Sparkles size={24} className="ss-empty-icon" />
            <p className="ss-empty-title">Semantic Bible Search</p>
            <p className="ss-empty-desc">
              Type a theme, emotion, or phrase. AI will search the scriptures based on meaning rather than exact keywords.
            </p>
          </div>
        )}

        {!loading && !error && results !== null && results.length === 0 && (
          <div className="ss-empty">
            <Search size={24} className="ss-empty-icon" />
            <p className="ss-empty-title">No matching verses found</p>
            <p className="ss-empty-desc">
              We couldn't find any relevant verses. Try rephrasing your search query (e.g., "strength in hard times").
            </p>
          </div>
        )}

        {!loading && !error && results && results.length > 0 && (
          <>
            <h3 className="ss-results-header">Top Relevance Matches</h3>
            {results.map((verse) => {
              const reference = `${verse.book} ${verse.chapter}:${verse.verse}`;
              const similarityPercentage = Math.round(verse.similarity * 100);
              
              return (
                <div
                  key={verse.id}
                  className="ss-card"
                  onClick={() => onNavigateToVerse && onNavigateToVerse(reference)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      onNavigateToVerse && onNavigateToVerse(reference);
                    }
                  }}
                  title={`Read ${reference} in passage compare`}
                >
                  <div className="ss-card-header">
                    <span className="ss-card-reference">{reference}</span>
                    <span className="ss-similarity-badge">
                      {similarityPercentage}% match
                    </span>
                  </div>
                  <p className="ss-card-text">“{verse.text}”</p>
                  <div className="ss-card-action-hint">
                    <CornerDownRight size={11} />
                    <BookOpen size={11} />
                    <span>Compare translations &amp; study words</span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
