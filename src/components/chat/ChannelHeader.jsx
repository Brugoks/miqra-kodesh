import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Ellipsis, Hash, Inbox, Loader2, Lock, Music, Pencil, Pin, Search, SlidersHorizontal, Trash2, UserPlus, Users } from 'lucide-react';
import { previewText } from './chatUtils';

const stripHeadline = (value) => String(value || '').replace(/<\/?[^>]+>/g, '');

const activityCopy = (item) => {
  if (item.item_type === 'reaction') return `reacted ${item.emoji || ''}`;
  if (item.item_type === 'reply') return 'replied to you';
  return 'mentioned you';
};

export default function ChannelHeader({
  activityItems = [],
  activityLoading,
  activeChannel,
  activePref,
  canManagePins,
  isModerator,
  onAddPeople,
  onBackToChannels,
  onDeleteChannel,
  onActivitySelect,
  onJumpToMessage,
  onRefreshActivity,
  onSearchResult,
  onSavePref,
  onStartRename,
  onTogglePin,
  onToggleMembers,
  onToggleSongs,
  songCount = 0,
  onlineCount,
  pinnedRows,
  searchInputRef,
  searchQuery,
  searchResults,
  searching,
  setSearchQuery,
  userId,
}) {
  const [activityOpen, setActivityOpen] = useState(false);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef(null);
  const toolsButtonRef = useRef(null);
  const toolsId = useId();
  const muted = activePref?.muted_until && new Date(activePref.muted_until) > new Date();

  const closeTools = () => {
    setToolsOpen(false);
    setActivityOpen(false);
    setPinsOpen(false);
    setPrefsOpen(false);
  };

  useEffect(() => {
    if (!toolsOpen) return undefined;
    const closeOutside = (event) => {
      if (toolsRef.current?.contains(event.target)) return;
      setToolsOpen(false);
      setActivityOpen(false);
      setPinsOpen(false);
      setPrefsOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      setToolsOpen(false);
      setActivityOpen(false);
      setPinsOpen(false);
      setPrefsOpen(false);
      toolsButtonRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [toolsOpen]);

  const muteForHours = (hours) => {
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    onSavePref(activeChannel.id, { muted_until: until });
    setPrefsOpen(false);
  };

  return (
    <header className="chat-main-head">
      {onBackToChannels && (
        <button
          type="button"
          className="chat-mobile-back"
          onClick={onBackToChannels}
          aria-label="Back to channels"
        >
          <ArrowLeft size={18} />
        </button>
      )}
      {activeChannel ? (
        <>
          <div className="chat-channel-info">
            <div className="chat-main-title">
              {activeChannel.is_private ? <Lock size={16} /> : <Hash size={18} />}
              <strong title={activeChannel.display_name || activeChannel.name}>{activeChannel.display_name || activeChannel.name}</strong>
              {/* DM names are deterministic (how the deep-link finds them) — no rename */}
              {activeChannel.is_private && !activeChannel.is_dm && (
                <button
                  type="button"
                  className="chat-rename-channel"
                  onClick={onStartRename}
                  title="Rename chat"
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>
            <div className="chat-channel-meta">
              {activeChannel.description && <span className="chat-main-desc" title={activeChannel.description}>{activeChannel.description}</span>}
              {onlineCount > 0 && <span className="chat-online-count">{onlineCount} online</span>}
            </div>
          </div>
          <div className="chat-search-wrap">
            <Search size={14} />
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search messages"
            />
            {searching && <Loader2 size={14} className="spin" />}
            {searchQuery.trim().length >= 2 && (
              <div className="chat-search-results">
                {searchResults.length === 0 && !searching ? (
                  <p className="chat-muted">No matches.</p>
                ) : searchResults.map((result) => (
                  <button key={result.id} type="button" onClick={() => onSearchResult(result)}>
                    <strong>#{result.channel_name}</strong>
                    <span>{stripHeadline(result.headline || previewText(result)).slice(0, 110)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="chat-header-actions" ref={toolsRef}>
            <button
              ref={toolsButtonRef}
              type="button"
              className="chat-header-icon-btn chat-header-more"
              aria-label="Channel tools"
              aria-expanded={toolsOpen}
              aria-controls={toolsId}
              onClick={() => {
                if (toolsOpen) closeTools();
                else setToolsOpen(true);
              }}
            >
              <Ellipsis size={20} />
            </button>
            <div id={toolsId} className={`chat-header-tools${toolsOpen ? ' open' : ''}`}>
              <div className="chat-activity-menu">
                <button
                  type="button"
                  className="chat-header-icon-btn"
                  onClick={() => {
                    setActivityOpen((open) => !open);
                    setPinsOpen(false);
                    setPrefsOpen(false);
                    if (!activityOpen) onRefreshActivity?.();
                  }}
                  title="Recent chat activity"
                  aria-label="Recent chat activity"
                >
                  <Inbox size={15} />
                  <span className="chat-tool-label">Activity</span>
                </button>
                {activityOpen && (
                  <div className="chat-activity-dropdown">
                    {activityLoading ? (
                      <p className="chat-muted">Loading activity...</p>
                    ) : activityItems.length === 0 ? (
                      <p className="chat-muted">No activity in the last 7 days.</p>
                    ) : activityItems.map((item) => (
                      <button
                        key={`${item.item_type}-${item.message_id}-${item.created_at}`}
                        type="button"
                        onClick={() => {
                          setActivityOpen(false);
                          onActivitySelect(item);
                        }}
                      >
                        <strong>{item.actor_name || 'Someone'} {activityCopy(item)}</strong>
                        <span>#{item.channel_name}: {previewText(item).slice(0, 100)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="chat-prefs-menu">
                <button
                  type="button"
                  className={`chat-header-icon-btn ${muted ? 'muted' : ''}`}
                  onClick={() => { setPrefsOpen((open) => !open); setActivityOpen(false); setPinsOpen(false); }}
                  title="Channel notification preferences"
                  aria-label="Channel notification preferences"
                >
                  <SlidersHorizontal size={15} />
                  <span className="chat-tool-label">Notifications</span>
                </button>
                {prefsOpen && (
                  <div className="chat-prefs-dropdown">
                    <button type="button" className={activePref.level === 'all' ? 'active' : ''} onClick={() => onSavePref(activeChannel.id, { level: 'all' })}>All messages</button>
                    <button type="button" className={activePref.level === 'mentions' ? 'active' : ''} onClick={() => onSavePref(activeChannel.id, { level: 'mentions' })}>Mentions only</button>
                    <button type="button" className={activePref.level === 'none' ? 'active' : ''} onClick={() => onSavePref(activeChannel.id, { level: 'none' })}>Nothing</button>
                    <div className="chat-prefs-divider" />
                    <button type="button" onClick={() => muteForHours(1)}>Mute for 1h</button>
                    <button type="button" onClick={() => muteForHours(8)}>Mute for 8h</button>
                    <button type="button" onClick={() => onSavePref(activeChannel.id, { muted_until: null })}>Unmute</button>
                  </div>
                )}
              </div>
              {pinnedRows.length > 0 && (
                <div className="chat-pins-menu">
                  <button type="button" className="chat-header-icon-btn" onClick={() => { setPinsOpen((open) => !open); setActivityOpen(false); setPrefsOpen(false); }} title="Pinned messages" aria-label="Pinned messages">
                    <Pin size={15} />
                    <span className="chat-tool-label">Pins</span>
                    <span>{pinnedRows.length}</span>
                  </button>
                  {pinsOpen && (
                    <div className="chat-pins-dropdown">
                      {pinnedRows.map((row) => (
                        <div key={row.message_id} className="chat-pin-row">
                          <button
                            type="button"
                            onClick={() => {
                              setPinsOpen(false);
                              onJumpToMessage(row.message_id);
                            }}
                          >
                            <strong>{row.message?.author_name || 'Member'}</strong>
                            <span>{previewText(row.message).slice(0, 90)}</span>
                          </button>
                          {canManagePins && (
                            <button type="button" className="chat-pin-unpin" onClick={() => onTogglePin(row.message)} title="Unpin message">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {songCount > 0 && onToggleSongs && (
                <button type="button" className="chat-header-icon-btn" onClick={() => { closeTools(); onToggleSongs(); }} title="Songs posted in this channel" aria-label="Songs posted in this channel">
                  <Music size={15} />
                  <span className="chat-tool-label">Songs</span>
                  <span>{songCount}</span>
                </button>
              )}
              <button type="button" className="chat-header-icon-btn" onClick={() => { closeTools(); onToggleMembers(); }} title="Members" aria-label="Members">
                <Users size={15} />
                <span className="chat-tool-label">Members</span>
              </button>
              {activeChannel.is_private && (
                <button type="button" className="chat-add-people" onClick={() => { closeTools(); onAddPeople(); }} title="Add people">
                  <UserPlus size={15} />
                  <span>Add people</span>
                </button>
              )}
              {(activeChannel.created_by === userId || isModerator) && (
                <button type="button" className="chat-delete-channel" onClick={onDeleteChannel} title="Delete chat" aria-label="Delete chat">
                  <Trash2 size={15} />
                  <span className="chat-tool-label">Delete chat</span>
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <strong>Select a channel</strong>
      )}
    </header>
  );
}
