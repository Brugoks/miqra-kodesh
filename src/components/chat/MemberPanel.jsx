import { useMemo, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import Avatar from '../ui/Avatar';

export default function MemberPanel({
  activeChannel,
  channelMemberIds,
  members,
  onClose,
  onlineUserIds,
  userId,
}) {
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const visibleMembers = useMemo(() => {
    if (!activeChannel) return [];
    const list = activeChannel.is_private
      ? members.filter((member) => channelMemberIds.includes(member.id))
      : members;
    return [...list].sort((a, b) => {
      const aOnline = onlineUserIds?.has(a.id) ? 0 : 1;
      const bOnline = onlineUserIds?.has(b.id) ? 0 : 1;
      if (aOnline !== bOnline) return aOnline - bOnline;
      return a.display.localeCompare(b.display);
    });
  }, [activeChannel, channelMemberIds, members, onlineUserIds]);

  const onlineMembers = visibleMembers.filter((member) => onlineUserIds?.has(member.id));
  const offlineMembers = visibleMembers.filter((member) => !onlineUserIds?.has(member.id));
  const selectedMember = visibleMembers.find((member) => member.id === selectedMemberId);

  const startDm = (memberId) => {
    const params = new URLSearchParams(window.location.search);
    params.set('dm', memberId);
    window.location.href = `${window.location.pathname}?${params.toString()}`;
  };

  return (
    <aside className="chat-member-panel" aria-label="Channel members">
      <header className="chat-member-panel-head">
        <div>
          <strong>Members</strong>
          <span>{onlineMembers.length} online</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close members">
          <X size={18} />
        </button>
      </header>

      {selectedMember && (
        <div className="chat-member-card">
          <Avatar src={selectedMember.avatar_url} name={selectedMember.display} size={44} />
          <div>
            <strong>{selectedMember.display}</strong>
            <span>{onlineUserIds?.has(selectedMember.id) ? 'Online' : 'Offline'}</span>
          </div>
          {selectedMember.id !== userId && (
            <button type="button" className="btn-secondary" onClick={() => startDm(selectedMember.id)}>
              <MessageCircle size={15} />
              Message
            </button>
          )}
        </div>
      )}

      <div className="chat-member-panel-scroll">
        <MemberGroup title="Online" members={onlineMembers} onlineUserIds={onlineUserIds} onSelect={setSelectedMemberId} />
        <MemberGroup title="Offline" members={offlineMembers} onlineUserIds={onlineUserIds} onSelect={setSelectedMemberId} />
      </div>
    </aside>
  );
}

function MemberGroup({ title, members, onlineUserIds, onSelect }) {
  if (!members.length) return null;
  return (
    <section className="chat-member-group-panel">
      <h3>{title}</h3>
      {members.map((member) => (
        <button key={member.id} type="button" className="chat-member-row" onClick={() => onSelect(member.id)}>
          <span className="chat-avatar-wrap small">
            <Avatar src={member.avatar_url} name={member.display} size={28} />
            {onlineUserIds?.has(member.id) && <span className="chat-online-dot" aria-label="Online" />}
          </span>
          <span>{member.display}</span>
        </button>
      ))}
    </section>
  );
}
