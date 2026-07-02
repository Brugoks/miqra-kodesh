import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Key, Settings, Loader2 } from "lucide-react";

export default function GifPicker({ onSelect, onClose }) {
  const [apiKey, setApiKey] = useState(() => {
    return (
      localStorage.getItem("gencon_giphy_api_key") ||
      (import.meta.env.VITE_GIPHY_API_KEY || "")
    );
  });
  const [keyInput, setKeyInput] = useState(apiKey);
  const [showKeySetup, setShowKeySetup] = useState(!apiKey);
  const [search, setSearch] = useState("");
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const searchTimer = useRef(null);

  const handleSaveKey = (e) => {
    e.preventDefault();
    const cleanKey = keyInput.trim();
    if (!cleanKey) return;
    localStorage.setItem("gencon_giphy_api_key", cleanKey);
    setApiKey(cleanKey);
    setShowKeySetup(false);
    setError("");
  };

  const handleClearKey = () => {
    localStorage.removeItem("gencon_giphy_api_key");
    setApiKey("");
    setKeyInput("");
    setShowKeySetup(true);
    setGifs([]);
  };

  const loadGifs = useCallback(async (query) => {
    if (!apiKey) return;
    setLoading(true);
    setError("");
    try {
      const endpoint = query
        ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(
            query
          )}&limit=20&rating=pg`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=20&rating=pg`;

      const res = await fetch(endpoint);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.meta?.msg || "Failed to fetch GIFs");
      }
      const data = await res.json();
      setGifs(data.data || []);
    } catch (err) {
      setError(err.message || "An error occurred fetching GIFs");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey) return;
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      loadGifs(search);
    }, search ? 400 : 0);
    return () => clearTimeout(searchTimer.current);
  }, [search, apiKey, loadGifs]);

  return (
    <div className="gif-picker-popover">
      <div className="gif-picker-header">
        <span className="gif-picker-title">GIF Search</span>
        <div className="gif-picker-header-actions">
          {apiKey && (
            <button
              type="button"
              className="gif-picker-settings-btn"
              onClick={() => setShowKeySetup(!showKeySetup)}
              title="GIPHY API Settings"
            >
              <Settings size={14} />
            </button>
          )}
          <button type="button" className="gif-picker-close-btn" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      {showKeySetup ? (
        <form onSubmit={handleSaveKey} className="gif-picker-setup">
          <div className="gif-picker-setup-title">
            <Key size={14} style={{ marginRight: "4px" }} />
            GIPHY API Key Setup
          </div>
          <p className="gif-picker-setup-text">
            To view and search GIFs, GIPHY requires an API Key. You can obtain a free key by creating an app on the{" "}
            <a href="https://developers.giphy.com/" target="_blank" rel="noopener noreferrer">
              GIPHY Developer Portal
            </a>
            .
          </p>
          <input
            type="text"
            placeholder="Paste GIPHY API Key..."
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            required
            className="gif-picker-key-input"
          />
          <div className="gif-picker-setup-actions">
            {apiKey && (
              <button
                type="button"
                className="gif-picker-danger-btn"
                onClick={handleClearKey}
              >
                Clear Key
              </button>
            )}
            <button type="submit" className="btn-primary">
              Save Key
            </button>
          </div>
        </form>
      ) : (
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
                  onClick={() => setShowKeySetup(true)}
                >
                  Configure API Key
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
                    onClick={() => onSelect(gif.images.fixed_height.url)}
                    title={gif.title}
                  >
                    <img
                      src={gif.images.fixed_height_small.url}
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
      )}
    </div>
  );
}
