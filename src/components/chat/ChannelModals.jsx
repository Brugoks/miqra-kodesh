import { X } from 'lucide-react';

export default function ChannelModals({
  activeChannel,
  addPeopleOpen,
  addPicked,
  canManage,
  channelForm,
  channelMemberIds,
  channelModalOpen,
  creatingChannel,
  error,
  handleRenameChannel,
  members,
  newName,
  onAddPeople,
  onCreateChannel,
  onSetAddPeopleOpen,
  onSetAddPicked,
  onSetChannelForm,
  onSetChannelModalOpen,
  onSetNewName,
  onSetPickedMembers,
  onSetRenamingChannelId,
  onlineUserIds,
  pickedMembers,
  renamingChannelId,
  userId,
}) {
  const otherMembers = members.filter((member) => member.id !== userId);
  const addableMembers = members.filter((member) => !channelMemberIds.includes(member.id));

  return (
    <>
      {channelModalOpen && (
        <div className="chat-modal-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onSetChannelModalOpen(false); }}>
          <div className="chat-modal card" role="dialog" aria-modal="true" aria-label="Create channel">
            <form onSubmit={onCreateChannel} className="chat-modal-form">
              <div className="chat-modal-head">
                <h2>{(canManage ? channelForm.isPrivate : true) ? 'New Private Chat' : 'New Channel'}</h2>
                <button type="button" className="chat-modal-close" onClick={() => onSetChannelModalOpen(false)} aria-label="Close"><X size={18} /></button>
              </div>
              {canManage && (
                <label className="chat-inline-check">
                  <input
                    type="checkbox"
                    checked={channelForm.isPrivate}
                    onChange={(event) => onSetChannelForm((form) => ({ ...form, isPrivate: event.target.checked }))}
                  />
                  <span>Private chat (only people you add can see it)</span>
                </label>
              )}
              <label>
                <span>{(canManage ? channelForm.isPrivate : true) ? 'Chat name' : 'Channel name'}</span>
                <input
                  type="text"
                  value={channelForm.name}
                  onChange={(event) => onSetChannelForm((form) => ({ ...form, name: event.target.value }))}
                  placeholder="e.g. youth-group"
                />
              </label>
              {canManage && !channelForm.isPrivate && (
                <label>
                  <span>Category</span>
                  <input
                    type="text"
                    value={channelForm.category}
                    onChange={(event) => onSetChannelForm((form) => ({ ...form, category: event.target.value }))}
                    placeholder="e.g. Community, Faith"
                  />
                </label>
              )}
              <label>
                <span>Description (optional)</span>
                <input
                  type="text"
                  value={channelForm.description}
                  onChange={(event) => onSetChannelForm((form) => ({ ...form, description: event.target.value }))}
                  placeholder="What's this chat for?"
                />
              </label>
              {(canManage ? channelForm.isPrivate : true) && (
                <div className="chat-member-picker">
                  <span className="chat-member-picker-label">Add people</span>
                  <div className="chat-member-list">
                    {otherMembers.map((member) => {
                      const checked = pickedMembers.includes(member.id);
                      return (
                        <label key={member.id} className="chat-member-item">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => onSetPickedMembers((current) => (
                              event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id)
                            ))}
                          />
                          <span className="chat-member-name">
                            {onlineUserIds?.has(member.id) && <span className="chat-member-online-dot" aria-label="Online" />}
                            {member.display}
                          </span>
                        </label>
                      );
                    })}
                    {otherMembers.length === 0 && <p className="chat-muted">No other members yet.</p>}
                  </div>
                </div>
              )}
              <div className="chat-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => onSetChannelModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={creatingChannel || !channelForm.name.trim()}>
                  {creatingChannel ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {addPeopleOpen && activeChannel && (
        <div className="chat-modal-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onSetAddPeopleOpen(false); }}>
          <div className="chat-modal card" role="dialog" aria-modal="true" aria-label="Add people">
            <div className="chat-modal-form">
              <div className="chat-modal-head">
                <h2>Add people to #{activeChannel.name}</h2>
                <button type="button" className="chat-modal-close" onClick={() => onSetAddPeopleOpen(false)} aria-label="Close"><X size={18} /></button>
              </div>
              <div className="chat-member-picker">
                <div className="chat-member-list">
                  {addableMembers.map((member) => {
                    const checked = addPicked.includes(member.id);
                    return (
                      <label key={member.id} className="chat-member-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => onSetAddPicked((current) => (
                            event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id)
                          ))}
                        />
                        <span className="chat-member-name">
                          {onlineUserIds?.has(member.id) && <span className="chat-member-online-dot" aria-label="Online" />}
                          {member.display}
                        </span>
                      </label>
                    );
                  })}
                  {addableMembers.length === 0 && <p className="chat-muted">Everyone is already in this chat.</p>}
                </div>
              </div>
              <div className="chat-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => onSetAddPeopleOpen(false)}>Cancel</button>
                <button type="button" className="btn-primary" onClick={onAddPeople} disabled={!addPicked.length}>Add</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {renamingChannelId && (
        <div className="chat-modal-overlay" role="presentation" onClick={() => onSetRenamingChannelId(null)}>
          <div className="chat-modal card" role="dialog" aria-modal="true" aria-label="Rename chat" onClick={(event) => event.stopPropagation()}>
            <form onSubmit={handleRenameChannel} className="chat-modal-form">
              <div className="chat-modal-head">
                <h2>Rename Chat</h2>
                <button type="button" className="chat-modal-close" onClick={() => onSetRenamingChannelId(null)} aria-label="Close"><X size={18} /></button>
              </div>
              <label>
                <span>New Chat name</span>
                <input
                  type="text"
                  value={newName}
                  onChange={(event) => onSetNewName(event.target.value)}
                  placeholder="e.g. new-name"
                  required
                />
              </label>
              {error && <p className="chat-error">{error}</p>}
              <div className="chat-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => onSetRenamingChannelId(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={!newName.trim()}>
                  Rename
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
