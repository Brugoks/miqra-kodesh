import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function GifPicker({ onSelect, onClose }) {
  const [search, setSearch] = useState("");
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const searchTimer = useRef(null);

  const loadGifs = useCallback(async (query) => {
    setLoading(true);
    setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("giphy-proxy", {
        body: { query, limit: 20 },
      });
      if (invokeError) throw invokeError;
      setGifs(data?.gifs || []);
    } catch (err) {
      setError(err.message || "An error occurred fetching GIFs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      loadGifs(search);
    }, search ? 400 : 0);
    return () => clearTimeout(searchTimer.current);
  }, [search, loadGifs]);

  return (
    <div className="gif-picker-popover">
      <div className="gif-picker-header">
        <span className="gif-picker-title">GIF Search</span>
        <div className="gif-picker-header-actions">
          <button type="button" className="gif-picker-close-btn" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      <>
          <div className="gif-picker-search-bar">
            <Search size={14} className="gif-picker-search-icon" />
            <input
              type="text"
              placeholder="Search GIPHY..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="gif-picker-search-input"
              autoFocus
            />
          </div>

          <div className="gif-picker-results">
            {loading ? (
              <div className="gif-picker-loading">
                <Loader2 className="gif-picker-spinner" size={20} />
                <span>Loading GIFs...</span>
              </div>
            ) : error ? (
              <div className="gif-picker-error">
                <p>{error}</p>
                <button
                  type="button"
                  className="gif-picker-retry-btn"
                  onClick={() => loadGifs(search)}
                >
                  Retry
                </button>
              </div>
            ) : gifs.length === 0 ? (
              <div className="gif-picker-empty">No GIFs found.</div>
            ) : (
              <div className="gif-picker-grid">
                {gifs.map((gif) => (
                  <button
                    key={gif.id}
                    type="button"
                    className="gif-picker-item"
                    onClick={() => onSelect(gif.url)}
                    title={gif.title}
                  >
                    <img
                      src={gif.previewUrl}
                      alt={gif.title}
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="gif-picker-footer">
            Powered by <span className="giphy-brand">GIPHY</span>
          </div>
      </>
    </div>
  );
}
