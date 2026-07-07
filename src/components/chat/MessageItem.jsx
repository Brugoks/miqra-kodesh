import { memo, useMemo } from 'react';
import { CornerUpRight, Forward, MessageSquareText, Pencil, Pin, Reply, SmilePlus, Trash2 } from 'lucide-react';
import LinkPreview from '../LinkPreview';
import Avatar from '../ui/Avatar';
import { firstUrl } from '../../lib/linkUtils';
import AttachmentList from './AttachmentList';
import EmojiPickerPopover from './EmojiPickerPopover';
import { formatTime, previewText, renderBody } from './chatUtils';

function MessageItem({
  avatarUrl,
  editingMessageId,
  editingText,
  isGrouped,
  isModerator,
  isOnline,
  isPinned,
  message,
  onOpenThread,
  onDiscardFailed,
  onCancelEdit,
  onDeleteMessage,
  onForwardMessage,
  onImageLoad,
  onOpenImage,
  onSaveEdit,
  onSetEditingText,
  onStartEdit,
  onStartReply,
  onToggleReaction,
  onTogglePin,
  parent,
  reactingFor,
  reactions,
  setReactingFor,
  onRetryFailed,
  userId,
}) {
  const groupedReactions = useMemo(() => reactions.reduce((acc, reaction) => {
    (acc[reaction.emoji] ||= []).push(reaction);
    return acc;
  }, {}), [reactions]);
  const canDelete = message.author_id === userId || isModerator;
  const isDeleted = Boolean(message.deleted_at);

  return (
    <div className={`chat-message ${isGrouped ? 'grouped' : ''} ${isDeleted ? 'deleted' : ''}`} data-message-id={message.id}>
      {isGrouped ? (
        <div className="chat-msg-avatar-spacer" aria-hidden="true">
          <span className="chat-hover-time">{formatTime(message.created_at)}</span>
        </div>
      ) : (
        <span className="chat-avatar-wrap">
          <Avatar className="chat-msg-avatar" src={avatarUrl} name={message.author_name || 'Member'} size={36} />
          {isOnline && <span className="chat-online-dot" aria-label="Online" />}
        </span>
      )}
      <div className="chat-msg-body">
        {message.forwarded_from && (
          <div className="chat-forwarded-label">
            <Forward size={12} />
            <span>Forwarded from {message.forwarded_from.author_name || 'Member'}</span>
          </div>
        )}
        {message.reply_to_id && (
          <div className="chat-reply-quote">
            <CornerUpRight size={12} />
            {parent ? (
              <>
                <strong>{parent.author_name || 'Member'}</strong>
                <span>{previewText(parent).slice(0, 90)}</span>
              </>
            ) : (
              <span className="chat-muted">original message deleted</span>
            )}
          </div>
        )}
        {!isGrouped && (
          <div className="chat-msg-meta">
            <strong>{message.author_name || 'Member'}</strong>
            <span>{formatTime(message.created_at)}</span>
          </div>
        )}
        {isDeleted ? (
          <p className="chat-deleted-message">This message was deleted</p>
        ) : editingMessageId === message.id ? (
          <div className="chat-edit-container">
            <textarea
              className="chat-edit-input"
              value={editingText}
              onChange={(event) => onSetEditingText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  onSaveEdit(message.id);
                } else if (event.key === 'Escape') {
                  onCancelEdit();
                }
              }}
              rows={2}
              autoFocus
            />
            <div className="chat-edit-actions">
              <button type="button" className="btn-secondary" onClick={onCancelEdit}>Cancel</button>
              <button type="button" className="btn-primary" onClick={() => onSaveEdit(message.id)} disabled={!editingText.trim()}>Save</button>
            </div>
          </div>
        ) : (
          message.body && (
            <>
              <div className="chat-msg-text">{renderBody(message.body)}</div>
              {message.edited_at && <span className="chat-edited-indicator">(edited)</span>}
              {firstUrl(message.body) && <LinkPreview key={firstUrl(message.body)} url={firstUrl(message.body)} />}
            </>
          )
        )}
        {!isDeleted && (
          <AttachmentList
            attachments={(message.attachments || []).map((attachment) => ({ ...attachment, authorName: message.author_name || 'Member' }))}
            fallbackImageUrl={message.image_url}
            onOpenImage={onOpenImage}
            onImageLoad={onImageLoad}
          />
        )}
        {message.reply_count > 0 && (
          <button type="button" className="chat-thread-summary" onClick={() => onOpenThread(message)}>
            <MessageSquareText size={13} />
            <span>{message.reply_count} {message.reply_count === 1 ? 'reply' : 'replies'}</span>
            {message.last_reply_at && <span>{formatTime(message.last_reply_at)}</span>}
          </button>
        )}
        {!isDeleted && (
        <div className="chat-msg-reactions">
          {Object.entries(groupedReactions).map(([emoji, list]) => {
            const mine = list.some((reaction) => reaction.user_id === userId);
            return (
              <button
                key={emoji}
                type="button"
                className={`chat-reaction ${mine ? 'mine' : ''}`}
                onClick={() => onToggleReaction(message.id, emoji)}
              >
                <span>{emoji}</span>
                <strong>{list.length}</strong>
              </button>
            );
          })}
          <div className="chat-react-wrap">
            <button
              type="button"
              className="chat-react-add"
              onClick={() => setReactingFor(reactingFor === message.id ? null : message.id)}
              title="Add reaction"
            >
              <SmilePlus size={15} />
            </button>
            {reactingFor === message.id && (
              <EmojiPickerPopover
                onSelect={(emoji) => {
                  onToggleReaction(message.id, emoji);
                  setReactingFor(null);
                }}
                onClose={() => setReactingFor(null)}
              />
            )}
          </div>
          <button type="button" className="chat-react-add" onClick={() => onStartReply(message)} title="Reply">
            <Reply size={15} />
          </button>
          <button type="button" className="chat-react-add" onClick={() => onOpenThread(message)} title="Reply in thread">
            <MessageSquareText size={15} />
          </button>
          <button type="button" className="chat-react-add" onClick={() => onForwardMessage(message)} title="Forward message">
            <Forward size={15} />
          </button>
          {onTogglePin && (
            <button type="button" className={`chat-react-add ${isPinned ? 'active' : ''}`} onClick={() => onTogglePin(message)} title={isPinned ? 'Unpin message' : 'Pin message'}>
              <Pin size={14} />
            </button>
          )}
          {message.author_id === userId && (
            <button type="button" className="chat-react-add" onClick={() => onStartEdit(message)} title="Edit message">
              <Pencil size={14} />
            </button>
          )}
          {canDelete && (
            <button type="button" className="chat-msg-delete" onClick={() => onDeleteMessage(message)} title="Delete message">
              <Trash2 size={14} />
            </button>
          )}
        </div>
        )}
        {message.pending && <div className="chat-delivery-state">Sending...</div>}
        {message.failed && (
          <div className="chat-delivery-state failed">
            <span>{message.errorMessage || 'Could not send.'}</span>
            <button type="button" onClick={() => onRetryFailed(message)}>Retry</button>
            <button type="button" onClick={() => onDiscardFailed(message.id)}>Discard</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MessageItem);
