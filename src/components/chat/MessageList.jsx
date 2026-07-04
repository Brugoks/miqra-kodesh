import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import Avatar from '../ui/Avatar';
import MessageItem from './MessageItem';
import { formatDayLabel, isSameDay, shouldGroupWithPrevious } from './chatUtils';

const isNearBottom = (element) => {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight < 120;
};

export default function MessageList({
  activeChannel,
  activeChannelId,
  avatarByUser,
  editingMessageId,
  editingText,
  hasMoreMessages,
  highlightedMessageId,
  isModerator,
  loadingEarlierMessages,
  loadingMessages,
  members,
  messages,
  messagesById,
  newMessagesAfter,
  onCancelEdit,
  onDeleteMessage,
  onDiscardFailed,
  onFilesDropped,
  onForwardMessage,
  onLoadEarlier,
  onMarkRead,
  onOpenThread,
  onOpenImage,
  onSaveEdit,
  onSetEditingText,
  onStartEdit,
  onStartReply,
  onToggleReaction,
  onlineUserIds,
  pinnedMessageIds,
  reactingFor,
  readByUserId,
  reactionsByMessage,
  setReactingFor,
  typingNames,
  onTogglePin,
  onRetryFailed,
  userId,
}) {
  const scrollerRef = useRef(null);
  const previousChannelRef = useRef(activeChannelId);
  const previousLastIdRef = useRef(null);
  const loadEarlierInFlightRef = useRef(false);
  const wasAtBottomRef = useRef(true);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [draggingFiles, setDraggingFiles] = useState(false);

  const scrollToBottom = useCallback((behavior = 'auto') => {
    requestAnimationFrame(() => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      scroller.scrollTo({ top: scroller.scrollHeight, behavior });
      wasAtBottomRef.current = true;
      setNewMessagesCount(0);
      onMarkRead?.();
    });
  }, [onMarkRead]);

  const handleScroll = useCallback(async () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const nearBottom = isNearBottom(scroller);
    wasAtBottomRef.current = nearBottom;
    if (nearBottom) {
      setNewMessagesCount(0);
      onMarkRead?.();
    }

    if (
      scroller.scrollTop > 96
      || !hasMoreMessages
      || loadingEarlierMessages
      || loadEarlierInFlightRef.current
    ) {
      return;
    }

    loadEarlierInFlightRef.current = true;
    const previousHeight = scroller.scrollHeight;
    const previousTop = scroller.scrollTop;
    await onLoadEarlier();
    requestAnimationFrame(() => {
      const nextScroller = scrollerRef.current;
      if (nextScroller) {
        nextScroller.scrollTop = nextScroller.scrollHeight - previousHeight + previousTop;
      }
      loadEarlierInFlightRef.current = false;
    });
  }, [hasMoreMessages, loadingEarlierMessages, onLoadEarlier, onMarkRead]);

  useEffect(() => {
    if (loadingMessages) return;

    const lastMessage = messages[messages.length - 1] || null;
    const lastId = lastMessage?.id || null;
    const channelChanged = previousChannelRef.current !== activeChannelId;
    const lastMessageChanged = previousLastIdRef.current !== lastId;

    if (channelChanged) {
      previousChannelRef.current = activeChannelId;
      previousLastIdRef.current = lastId;
      scrollToBottom('auto');
      return;
    }

    if (lastMessageChanged && lastId) {
      const shouldScroll = wasAtBottomRef.current || lastMessage.author_id === userId;
      if (shouldScroll) {
        scrollToBottom('smooth');
      } else {
        setNewMessagesCount((current) => current + 1);
      }
    }

    previousLastIdRef.current = lastId;
  }, [activeChannelId, loadingMessages, messages, scrollToBottom, userId]);

  const rows = useMemo(() => {
    const firstUnreadIndex = newMessagesAfter
      ? messages.findIndex((message) => new Date(message.created_at) > new Date(newMessagesAfter))
      : -1;

    return messages.flatMap((message, index) => {
      const previous = messages[index - 1] || null;
      const dayBoundary = !previous || !isSameDay(previous.created_at, message.created_at);
      const unreadBoundary = index === firstUnreadIndex;
      const items = [];

      if (dayBoundary) {
        items.push({ id: `day-${message.id}`, type: 'day', label: formatDayLabel(message.created_at) });
      }
      if (unreadBoundary) {
        items.push({ id: `new-${message.id}`, type: 'new' });
      }

      items.push({
        id: message.id,
        type: 'message',
        isGrouped: !dayBoundary && !unreadBoundary && shouldGroupWithPrevious(message, previous),
        message,
      });
      return items;
    });
  }, [messages, newMessagesAfter]);

  const lastOwnMessageId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].author_id === userId) return messages[index].id;
    }
    return null;
  }, [messages, userId]);

  const handleImageLoad = useCallback(() => {
    if (isNearBottom(scrollerRef.current)) scrollToBottom('auto');
  }, [scrollToBottom]);

  const typingLabel = useMemo(() => {
    if (!typingNames.length) return '';
    if (typingNames.length === 1) return `${typingNames[0]} is typing...`;
    if (typingNames.length === 2) return `${typingNames[0]} and ${typingNames[1]} are typing...`;
    return 'Several people are typing...';
  }, [typingNames]);

  useEffect(() => {
    if (!highlightedMessageId || !scrollerRef.current) return;
    const target = scrollerRef.current.querySelector(`[data-message-id="${highlightedMessageId}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('highlighted');
    const timeout = window.setTimeout(() => target.classList.remove('highlighted'), 1600);
    return () => window.clearTimeout(timeout);
  }, [highlightedMessageId]);

  return (
    <div
      className="chat-messages"
      ref={scrollerRef}
      onDragEnter={(event) => {
        if (event.dataTransfer?.types?.includes('Files')) setDraggingFiles(true);
      }}
      onDragOver={(event) => {
        if (event.dataTransfer?.types?.includes('Files')) {
          event.preventDefault();
          setDraggingFiles(true);
        }
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDraggingFiles(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer?.files?.length) return;
        event.preventDefault();
        setDraggingFiles(false);
        onFilesDropped?.(event.dataTransfer.files);
      }}
      onScroll={handleScroll}
    >
      {draggingFiles && <div className="chat-drop-overlay">Drop to share</div>}
      {loadingMessages ? (
        <p className="chat-muted chat-center">Loading messages...</p>
      ) : messages.length === 0 ? (
        <div className="chat-no-messages">
          <MessagesSquare size={26} />
          <p>{activeChannel ? 'No messages yet. Say hello!' : 'Pick a channel to start chatting.'}</p>
        </div>
      ) : (
        <>
          {loadingEarlierMessages && (
            <div className="chat-loading-earlier">Loading earlier messages...</div>
          )}
          {rows.map((row) => {
            if (row.type === 'day') {
              return (
                <div key={row.id} className="chat-day-divider">
                  <span>{row.label}</span>
                </div>
              );
            }

            if (row.type === 'new') {
              return (
                <div key={row.id} className="chat-new-divider">
                  <span>New messages</span>
                </div>
              );
            }

            return (
              <Fragment key={row.message.id}>
                <MessageItem
                  avatarUrl={avatarByUser[row.message.author_id]}
                  editingMessageId={editingMessageId}
                  editingText={editingText}
                  isGrouped={row.isGrouped}
                  isModerator={isModerator}
                  isOnline={onlineUserIds?.has(row.message.author_id)}
                  isPinned={pinnedMessageIds?.has(row.message.id)}
                  message={row.message}
                  onCancelEdit={onCancelEdit}
                  onDeleteMessage={onDeleteMessage}
                  onDiscardFailed={onDiscardFailed}
                  onForwardMessage={onForwardMessage}
                  onImageLoad={handleImageLoad}
                  onOpenThread={onOpenThread}
                  onOpenImage={onOpenImage}
                  onSaveEdit={onSaveEdit}
                  onSetEditingText={onSetEditingText}
                  onStartEdit={onStartEdit}
                  onStartReply={onStartReply}
                  onToggleReaction={onToggleReaction}
                  onTogglePin={onTogglePin}
                  parent={row.message.reply_to_id ? messagesById[row.message.reply_to_id] : null}
                  reactingFor={reactingFor}
                  reactions={reactionsByMessage[row.message.id] || []}
                  setReactingFor={setReactingFor}
                  onRetryFailed={onRetryFailed}
                  userId={userId}
                />
                {row.message.id === lastOwnMessageId && (
                  <ReadReceiptRow
                    activeChannel={activeChannel}
                    members={members}
                    message={row.message}
                    readByUserId={readByUserId}
                  />
                )}
              </Fragment>
            );
          })}
          {typingLabel && (
            <div className="chat-typing-indicator">{typingLabel}</div>
          )}
        </>
      )}
      {newMessagesCount > 0 && (
        <button type="button" className="chat-new-messages-pill" onClick={() => scrollToBottom('smooth')}>
          {newMessagesCount} new {newMessagesCount === 1 ? 'message' : 'messages'}
        </button>
      )}
    </div>
  );
}

function ReadReceiptRow({ activeChannel, members, message, readByUserId }) {
  const seenMembers = (members || []).filter((member) => {
    const readAt = readByUserId?.[member.id];
    return readAt && new Date(readAt) >= new Date(message.created_at);
  });

  if (!seenMembers.length) return null;
  if (activeChannel?.is_private) {
    return <div className="chat-read-receipts">Seen</div>;
  }

  const visibleMembers = seenMembers.slice(0, 5);
  const hiddenCount = seenMembers.length - visibleMembers.length;
  return (
    <div className="chat-read-receipts" aria-label={`${seenMembers.length} people have seen this message`}>
      <span>Seen by</span>
      <div className="chat-read-avatar-stack">
        {visibleMembers.map((member) => (
          <Avatar key={member.id} src={member.avatar_url} name={member.display} size={18} />
        ))}
        {hiddenCount > 0 && <span className="chat-read-more">+{hiddenCount}</span>}
      </div>
    </div>
  );
}
