import { Hash, Lock, Pencil, Plus } from 'lucide-react';

export default function ChatSidebar({
  activeChannelId,
  canManage,
  draftChannelIds,
  groupedChannels,
  loadingChannels,
  mutedChannelIds,
  onOpenChannelModal,
  onSelectChannel,
  unreadByChannel,
}) {
  return (
    <aside className="chat-sidebar">
      <div className="chat-sidebar-head">
        <h2>Channels</h2>
        <button
          type="button"
          className="chat-new-channel"
          onClick={onOpenChannelModal}
          title={canManage ? 'New channel or private chat' : 'New private chat'}
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="chat-channel-scroll">
        {loadingChannels ? (
          <p className="chat-muted">Loading...</p>
        ) : groupedChannels.length === 0 ? (
          <p className="chat-muted">No channels yet.</p>
        ) : groupedChannels.map(([category, list]) => {
          // Float channels with unmuted unreads to the top of their category
          // (stable sort keeps the original order within each tier)
          const orderedList = [...list].sort((a, b) => {
            const aUnread = unreadByChannel[a.id] > 0 && !mutedChannelIds?.has(a.id) ? 1 : 0;
            const bUnread = unreadByChannel[b.id] > 0 && !mutedChannelIds?.has(b.id) ? 1 : 0;
            return bUnread - aUnread;
          });
          return (
          <div key={category} className="chat-channel-group">
            <div className="chat-channel-category">{category}</div>
            {orderedList.map((channel) => (
              <button
                key={channel.id}
                type="button"
                className={`chat-channel-btn ${activeChannelId === channel.id ? 'active' : ''} ${unreadByChannel[channel.id] && activeChannelId !== channel.id ? 'has-unread' : ''} ${mutedChannelIds?.has(channel.id) ? 'muted' : ''}`}
                onClick={() => onSelectChannel(channel.id)}
              >
                {channel.is_private ? <Lock size={14} /> : <Hash size={15} />}
                <span>{channel.display_name || channel.name}</span>
                {unreadByChannel[channel.id] > 0 && activeChannelId !== channel.id && mutedChannelIds?.has(channel.id) && (
                  <span className="chat-channel-muted-dot" aria-label="Muted unread" />
                )}
                {unreadByChannel[channel.id] > 0 && activeChannelId !== channel.id && !mutedChannelIds?.has(channel.id) && (
                  <span className="chat-channel-unread">
                    {unreadByChannel[channel.id] > 99 ? '99+' : unreadByChannel[channel.id]}
                  </span>
                )}
                {draftChannelIds?.has(channel.id) && <Pencil className="chat-channel-draft" size={12} aria-label="Draft" />}
              </button>
            ))}
          </div>
          );
        })}
      </div>
    </aside>
  );
}
