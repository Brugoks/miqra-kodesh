import { Mention, MentionsInput } from 'react-mentions';
import { Send, X } from 'lucide-react';
import Avatar from '../ui/Avatar';
import { firstUrl } from '../../lib/linkUtils';
import AttachmentList from './AttachmentList';
import useThreadMessages from './hooks/useThreadMessages';
import SmartLinkPreview from './SmartLinkPreview';
import { formatTime, renderBody } from './chatUtils';

export default function ThreadPanel({
  activeOrgId,
  avatarByUser,
  displayName,
  mentionableMembers,
  onClose,
  onlineUserIds,
  rootMessage,
  setError,
  userId,
}) {
  const { draft, loading, replies, sending, sendReply, setDraft } = useThreadMessages({
    activeOrgId,
    displayName,
    rootMessage,
    setError,
    userId,
  });

  if (!rootMessage) return null;

  return (
    <aside className="chat-thread-panel" aria-label="Thread">
      <header className="chat-thread-head">
        <div>
          <strong>Thread</strong>
          <span>{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close thread">
          <X size={18} />
        </button>
      </header>

      <div className="chat-thread-scroll">
        <ThreadMessage message={rootMessage} avatarByUser={avatarByUser} onlineUserIds={onlineUserIds} root />
        <div className="chat-thread-divider" />
        {loading ? (
          <p className="chat-muted">Loading thread...</p>
        ) : replies.length === 0 ? (
          <p className="chat-muted">No thread replies yet.</p>
        ) : replies.map((reply) => (
          <ThreadMessage key={reply.id} message={reply} avatarByUser={avatarByUser} onlineUserIds={onlineUserIds} />
        ))}
      </div>

      <form className="chat-thread-composer" onSubmit={sendReply}>
        <MentionsInput
          className="chat-mentions-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter'
              && !event.shiftKey
              && !event.altKey
              && !event.ctrlKey
              && !event.metaKey
              && !event.nativeEvent?.isComposing
            ) {
              event.preventDefault();
              sendReply();
            }
          }}
          placeholder="Reply in thread..."
          allowSuggestionsAboveCursor
        >
          <Mention
            trigger="@"
            data={mentionableMembers}
            markup="@[__display__](__id__)"
            displayTransform={(id, display) => `@${display}`}
            appendSpaceOnAdd
          />
        </MentionsInput>
        <button type="submit" className="btn-primary chat-send" disabled={sending || !draft.trim()}>
          <Send size={16} />
        </button>
      </form>
    </aside>
  );
}

function ThreadMessage({ avatarByUser, message, onlineUserIds, root = false }) {
  const deleted = Boolean(message.deleted_at);

  return (
    <article className={`chat-thread-message ${root ? 'root' : ''}`}>
      <span className="chat-avatar-wrap">
        <Avatar className="chat-msg-avatar" src={avatarByUser[message.author_id]} name={message.author_name || 'Member'} size={32} />
        {onlineUserIds?.has(message.author_id) && <span className="chat-online-dot" aria-label="Online" />}
      </span>
      <div className="chat-thread-message-body">
        <div className="chat-msg-meta">
          <strong>{message.author_name || 'Member'}</strong>
          <span>{formatTime(message.created_at)}</span>
        </div>
        {deleted ? (
          <p className="chat-deleted-message">This message was deleted</p>
        ) : (
          <>
            {message.body && <div className="chat-msg-text">{renderBody(message.body)}</div>}
            {message.edited_at && <span className="chat-edited-indicator">(edited)</span>}
            {message.body && firstUrl(message.body) && <SmartLinkPreview key={firstUrl(message.body)} url={firstUrl(message.body)} />}
            <AttachmentList attachments={message.attachments || []} fallbackImageUrl={message.image_url} onOpenImage={() => null} />
          </>
        )}
      </div>
    </article>
  );
}
