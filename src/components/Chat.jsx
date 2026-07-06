import { useEffect, useMemo, useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import './Chat.css';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { canAccessLeaderTools, isAdminRole } from '../lib/roles';
import ChatSidebar from './chat/ChatSidebar';
import ChannelHeader from './chat/ChannelHeader';
import ChannelModals from './chat/ChannelModals';
import Composer from './chat/Composer';
import ForwardModal from './chat/ForwardModal';
import ImageLightbox from './chat/ImageLightbox';
import MemberPanel from './chat/MemberPanel';
import MessageList from './chat/MessageList';
import PushBanner from './chat/PushBanner';
import ThreadPanel from './chat/ThreadPanel';
import useActivityInbox from './chat/hooks/useActivityInbox';
import useChannelModalState from './chat/hooks/useChannelModalState';
import useChatChannels from './chat/hooks/useChatChannels';
import useChatComposer from './chat/hooks/useChatComposer';
import useChatMembers from './chat/hooks/useChatMembers';
import useChatMessages from './chat/hooks/useChatMessages';
import useChatPresence from './chat/hooks/useChatPresence';
import useChannelPrefs from './chat/hooks/useChannelPrefs';
import useMessageSearch from './chat/hooks/useMessageSearch';
import usePinnedMessages from './chat/hooks/usePinnedMessages';
import useChatRealtime from './chat/hooks/useChatRealtime';
import useReadReceipts from './chat/hooks/useReadReceipts';
import useTypingIndicators from './chat/hooks/useTypingIndicators';
import useUnreadCounts from './chat/hooks/useUnreadCounts';
export default function Chat({ session, userRole, activeOrgId, displayName: profileDisplayName, myAvatarUrl, onChatSeen }) {
  const user = session?.user;
  const userId = user?.id;
  const displayName = profileDisplayName || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Member';
  const canManage = canAccessLeaderTools(userRole);
  const isModerator = isAdminRole(userRole);
  const [error, setError] = useState('');
  const [lightboxImage, setLightboxImage] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [membersOpen, setMembersOpen] = useState(false);
  // Mobile two-screen flow: false = channel list, true = conversation.
  // Desktop ignores this (the CSS class only applies inside the mobile media query).
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [threadRoot, setThreadRoot] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const {
    activeChannel,
    activeChannelId,
    channels,
    createChannel,
    deleteChannel,
    groupedChannels,
    loadChannels,
    loadingChannels,
    renameChannel,
    setActiveChannelId,
  } = useChatChannels({ activeOrgId, userId, canManage, setError });
  const {
    appendOptimisticMessage,
    deleteMessage,
    discardOptimisticMessage,
    hasMoreMessages,
    insertMessage,
    loadedMessageIdsRef,
    loadingEarlierMessages,
    loadingMessages,
    loadMessagesAround,
    loadEarlierMessages,
    messages,
    markOptimisticMessageFailed,
    reactions,
    replaceOptimisticMessage,
    saveEdit,
    setMessages,
    setReactions,
    toggleReaction,
  } = useChatMessages({ activeChannelId, setError, userId });
  const { onlineCount, onlineUserIds } = useChatPresence({ activeOrgId, userId });
  const { sendStopTyping, sendTyping, typingNames } = useTypingIndicators({ activeChannelId, displayName, userId });
  const { readByUserId } = useReadReceipts({ activeChannelId, userId });
  const { pinnedMessageIds, pinnedRows, togglePin } = usePinnedMessages({ activeChannelId, activeOrgId, setError, userId });
  const { activePref, mutedChannelIds, savePref } = useChannelPrefs({ activeChannelId, setError, userId });
  const messageSearch = useMessageSearch({ activeOrgId, setError });
  const activityInbox = useActivityInbox({ setError });
  const composer = useChatComposer({
    activeChannel,
    activeOrgId,
    appendOptimisticMessage,
    displayName,
    discardOptimisticMessage,
    insertMessage,
    markOptimisticMessageFailed,
    onStopTyping: sendStopTyping,
    onTyping: sendTyping,
    replaceOptimisticMessage,
    saveEditMessage: saveEdit,
    setError,
    userId,
  });
  const {
    addPeopleToChannel,
    avatarByUser,
    channelMemberIds,
    members,
    mentionableMembers,
  } = useChatMembers({ activeOrgId, activeChannel, activeChannelId, displayName, myAvatarUrl, userId });
  const modals = useChannelModalState({
    activeChannel,
    addPeopleToChannel,
    canManage,
    createChannel,
    renameChannel,
    setError,
  });
  useChatRealtime({
    activeChannelId,
    activeOrgId,
    loadedMessageIdsRef,
    loadChannels,
    setMessages,
    setReactions,
    userId,
  });
  const { lastReadByChannel, markChannelRead, unreadByChannel } = useUnreadCounts({
    activeChannelId,
    activeOrgId,
    channels,
    userId,
  });

  useEffect(() => {
    if (!hasSupabaseConfig || !userId) return;
    (async () => {
      const now = new Date().toISOString();
      await supabase.from('chat_mentions')
        .update({ read_at: now })
        .eq('mentioned_user_id', userId)
        .is('read_at', null);
      await supabase.from('profiles').update({ chat_last_read_at: now }).eq('id', userId);
      onChatSeen?.();
    })();
  }, [onChatSeen, userId]);

  useEffect(() => {
    if (activeChannelId) markChannelRead(activeChannelId, { capture: true });
  }, [activeChannelId, markChannelRead]);

  const reactionsByMessage = useMemo(() => {
    const map = {};
    reactions.forEach((reaction) => {
      (map[reaction.message_id] ||= []).push(reaction);
    });
    return map;
  }, [reactions]);

  const messagesById = useMemo(
    () => Object.fromEntries(messages.map((message) => [message.id, message])),
    [messages]
  );
  const activeThreadRoot = threadRoot ? (messagesById[threadRoot.id] || threadRoot) : null;
  const canManagePins = Boolean(activeChannel && (canManage || isModerator || activeChannel.created_by === userId));
  const openChannel = (channelId) => {
    setActiveChannelId(channelId);
    setMobileChatOpen(true);
  };

  const handleSearchResult = async (result) => {
    setThreadRoot(null);
    openChannel(result.channel_id);
    await loadMessagesAround(result.channel_id, result.created_at);
    setHighlightedMessageId(result.id);
    messageSearch.setQuery('');
    messageSearch.setResults([]);
  };

  const handleActivitySelect = async (item) => {
    setThreadRoot(null);
    openChannel(item.channel_id);
    await loadMessagesAround(item.channel_id, item.created_at);
    setHighlightedMessageId(item.message_id);
  };

  const handleForwardMessage = async (targetChannelId) => {
    if (!forwardingMessage || !targetChannelId) return;
    setError('');

    const originalAttachments = forwardingMessage.attachments || [];
    const safeAttachments = originalAttachments.filter((attachment) => (
      attachment.type === 'image' || !attachment.path
    ));
    const privateAttachments = originalAttachments.filter((attachment) => (
      attachment.type !== 'image' && attachment.path
    ));
    const privateNote = privateAttachments.length
      ? `Forwarded ${privateAttachments.length} private attachment${privateAttachments.length === 1 ? '' : 's'} from the original chat: ${privateAttachments.map((attachment) => attachment.name || 'file').join(', ')}.`
      : '';
    const body = [forwardingMessage.body, privateNote].filter(Boolean).join('\n\n') || null;
    const imageUrl = forwardingMessage.image_url || safeAttachments.find((attachment) => attachment.type === 'image')?.url || null;

    const { data, error: forwardError } = await supabase
      .from('chat_messages')
      .insert({
        attachments: safeAttachments,
        author_id: userId,
        author_name: displayName,
        body,
        channel_id: targetChannelId,
        forwarded_from: {
          author_id: forwardingMessage.author_id,
          author_name: forwardingMessage.author_name,
          channel_id: forwardingMessage.channel_id,
          created_at: forwardingMessage.created_at,
          message_id: forwardingMessage.id,
        },
        image_url: imageUrl,
        organization_id: activeOrgId,
      })
      .select('*')
      .single();

    if (forwardError) {
      setError(forwardError.message || 'Could not forward message.');
      return;
    }

    setForwardingMessage(null);
    setThreadRoot(null);
    openChannel(targetChannelId);
    await loadMessagesAround(targetChannelId, data.created_at);
    setHighlightedMessageId(data.id);
  };

  if (!hasSupabaseConfig) {
    return (
      <div className="chat-page">
        <section className="chat-empty-page card">
          <MessagesSquare size={34} />
          <div>
            <h1>Chat</h1>
            <p>Connect Supabase to use channels and messaging.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="chat-page">
      <PushBanner activeOrgId={activeOrgId} userId={userId} />

      <div className={`chat-shell card ${activeThreadRoot ? 'has-thread' : ''} ${membersOpen ? 'has-members' : ''} ${mobileChatOpen ? 'mobile-chat-open' : ''}`}>
        <ChatSidebar
          activeChannelId={activeChannelId}
          canManage={canManage}
          draftChannelIds={composer.draftChannelIds}
          groupedChannels={groupedChannels}
          loadingChannels={loadingChannels}
          mutedChannelIds={mutedChannelIds}
          onOpenChannelModal={modals.openChannelModal}
          onSelectChannel={openChannel}
          unreadByChannel={unreadByChannel}
        />

        <section className="chat-main">
          <ChannelHeader
            activityItems={activityInbox.activityItems}
            activityLoading={activityInbox.activityLoading}
            activeChannel={activeChannel}
            activePref={activePref}
            canManagePins={canManagePins}
            isModerator={isModerator}
            onAddPeople={modals.openAddPeople}
            onBackToChannels={() => setMobileChatOpen(false)}
            onActivitySelect={handleActivitySelect}
            onDeleteChannel={() => deleteChannel(activeChannel)}
            onJumpToMessage={setHighlightedMessageId}
            onRefreshActivity={activityInbox.loadActivity}
            onSearchResult={handleSearchResult}
            onSavePref={savePref}
            onStartRename={modals.startRename}
            onTogglePin={togglePin}
            onToggleMembers={() => setMembersOpen((open) => !open)}
            onlineCount={onlineCount}
            pinnedRows={pinnedRows}
            searchInputRef={messageSearch.inputRef}
            searchQuery={messageSearch.query}
            searchResults={messageSearch.results}
            searching={messageSearch.searching}
            setSearchQuery={messageSearch.setQuery}
            userId={userId}
          />

          <MessageList
            activeChannel={activeChannel}
            activeChannelId={activeChannelId}
            avatarByUser={avatarByUser}
            editingMessageId={composer.editingMessageId}
            editingText={composer.editingText}
            hasMoreMessages={hasMoreMessages}
            highlightedMessageId={highlightedMessageId}
            isModerator={isModerator}
            loadingEarlierMessages={loadingEarlierMessages}
            loadingMessages={loadingMessages}
            members={members}
            messages={messages}
            messagesById={messagesById}
            newMessagesAfter={lastReadByChannel[activeChannelId]}
            onCancelEdit={composer.cancelEdit}
            onDeleteMessage={(message) => deleteMessage(message, { hardDelete: isModerator })}
            onDiscardFailed={discardOptimisticMessage}
            onFilesDropped={composer.attachFiles}
            onForwardMessage={setForwardingMessage}
            onLoadEarlier={loadEarlierMessages}
            onMarkRead={() => { if (activeChannelId) markChannelRead(activeChannelId); }}
            onOpenThread={setThreadRoot}
            onOpenImage={setLightboxImage}
            onSaveEdit={composer.saveEdit}
            onSetEditingText={composer.setEditingText}
            onStartEdit={composer.startEdit}
            onStartReply={composer.startReply}
            onToggleReaction={toggleReaction}
            onlineUserIds={onlineUserIds}
            pinnedMessageIds={pinnedMessageIds}
            reactingFor={composer.reactingFor}
            readByUserId={readByUserId}
            reactionsByMessage={reactionsByMessage}
            setReactingFor={composer.setReactingFor}
            typingNames={typingNames}
            onTogglePin={canManagePins ? togglePin : null}
            onRetryFailed={composer.retryFailedMessage}
            userId={userId}
          />

          {error && <p className="chat-error">{error}</p>}

          <Composer
            activeChannel={activeChannel}
            composerInputRef={composer.composerInputRef}
            draft={composer.draft}
            mentionableMembers={mentionableMembers}
            onClearImage={composer.clearImage}
            onClearReply={() => composer.setReplyTo(null)}
            onInsertEmoji={composer.insertEmoji}
            onPaste={composer.handlePaste}
            onPickImage={(event) => composer.attachFiles(event.target.files)}
            onRemoveAttachment={composer.removePendingAttachment}
            onSend={composer.sendMessage}
            onSendGif={composer.sendGif}
            onSetDraft={composer.setDraft}
            onStartVoiceRecording={composer.startVoiceRecording}
            onStopVoiceRecording={composer.stopVoiceRecording}
            onWrapSelection={composer.wrapSelection}
            pendingAttachments={composer.pendingAttachments}
            recording={composer.recording}
            replyTo={composer.replyTo}
            setShowGifPicker={composer.setShowGifPicker}
            showGifPicker={composer.showGifPicker}
          />
        </section>
        <ThreadPanel
          activeOrgId={activeOrgId}
          avatarByUser={avatarByUser}
          displayName={displayName}
          mentionableMembers={mentionableMembers}
          onClose={() => setThreadRoot(null)}
          onlineUserIds={onlineUserIds}
          rootMessage={activeThreadRoot}
          setError={setError}
          userId={userId}
        />
        {membersOpen && (
          <MemberPanel
            activeChannel={activeChannel}
            channelMemberIds={channelMemberIds}
            members={members}
            onClose={() => setMembersOpen(false)}
            onlineUserIds={onlineUserIds}
            userId={userId}
          />
        )}
      </div>

      <ChannelModals
        activeChannel={activeChannel}
        addPeopleOpen={modals.addPeopleOpen}
        addPicked={modals.addPicked}
        canManage={canManage}
        channelForm={modals.channelForm}
        channelMemberIds={channelMemberIds}
        channelModalOpen={modals.channelModalOpen}
        creatingChannel={modals.creatingChannel}
        error={error}
        handleRenameChannel={modals.renameFromModal}
        members={members}
        newName={modals.newName}
        onAddPeople={modals.addPeopleFromModal}
        onCreateChannel={modals.createFromModal}
        onSetAddPeopleOpen={modals.setAddPeopleOpen}
        onSetAddPicked={modals.setAddPicked}
        onSetChannelForm={modals.setChannelForm}
        onSetChannelModalOpen={modals.setChannelModalOpen}
        onSetNewName={modals.setNewName}
        onSetPickedMembers={modals.setPickedMembers}
        onSetRenamingChannelId={modals.setRenamingChannelId}
        onlineUserIds={onlineUserIds}
        pickedMembers={modals.pickedMembers}
        renamingChannelId={modals.renamingChannelId}
        userId={userId}
      />

      <ForwardModal
        channels={channels}
        message={forwardingMessage}
        onClose={() => setForwardingMessage(null)}
        onForward={handleForwardMessage}
      />

      <ImageLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />
    </div>
  );
}
