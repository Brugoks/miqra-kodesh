import { useCallback, useEffect, useRef, useState } from 'react';
import { compressImage } from '../../../lib/imageCompression';
import { passageIdToDisplay, refToPassageId } from '../../../lib/scripture';
import { supabase } from '../../../lib/supabaseClient';
import { friendlySendError, isNetworkError, parseMentionIds } from '../chatUtils';

const readDraftIds = () => {
  try {
    return new Set(Object.keys(window.localStorage)
      .filter((key) => key.startsWith('chat-draft-'))
      .map((key) => key.replace('chat-draft-', '')));
  } catch {
    return new Set();
  }
};

const readStoredDraft = (channelId) => {
  try {
    const raw = window.localStorage.getItem(`chat-draft-${channelId}`);
    if (!raw) return { draft: '', replyTo: null };
    return JSON.parse(raw);
  } catch {
    return { draft: '', replyTo: null };
  }
};

const FILE_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
]);

const AUDIO_MIME_TYPES = new Set([
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_RECORDING_MS = 60 * 1000;
const EMOJI_SHORTCODES = {
  fire: '🔥',
  heart: '❤️',
  joy: '😂',
  music: '🎵',
  open_mouth: '😮',
  pray: '🙏',
  raised_hands: '🙌',
  thumbsup: '👍',
};

const extensionForAudioType = (type) => {
  if (type.includes('mp4') || type.includes('aac')) return 'm4a';
  if (type.includes('mpeg')) return 'mp3';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('wav')) return 'wav';
  return 'webm';
};

const cleanPassageContent = (content) => String(content || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const calculateAudioPeaks = async (blob, sampleCount = 28) => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return [];

  const context = new AudioContextClass();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const channel = buffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channel.length / sampleCount));

    return Array.from({ length: sampleCount }, (_, index) => {
      const start = index * blockSize;
      const end = Math.min(channel.length, start + blockSize);
      let max = 0;
      for (let i = start; i < end; i += 1) {
        max = Math.max(max, Math.abs(channel[i]));
      }
      return Math.round(max * 100) / 100;
    });
  } catch {
    return [];
  } finally {
    await context.close?.();
  }
};

const expandEmojiShortcodes = (text) => String(text || '').replace(
  /:(fire|heart|joy|music|open_mouth|pray|raised_hands|thumbsup):/g,
  (match, name) => EMOJI_SHORTCODES[name] || match
);

export default function useChatComposer({
  activeChannel,
  activeOrgId,
  appendOptimisticMessage,
  displayName,
  discardOptimisticMessage,
  insertMessage,
  markOptimisticMessageFailed,
  onStopTyping,
  onTyping,
  replaceOptimisticMessage,
  saveEditMessage,
  setError,
  userId,
}) {
  const [draft, setDraft] = useState('');
  const [draftChannelIds, setDraftChannelIds] = useState(() => readDraftIds());
  const [sending, setSending] = useState(false);
  const [reactingFor, setReactingFor] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [recording, setRecording] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const composerInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingStreamRef = useRef(null);
  const recordingTimeoutRef = useRef(null);
  const activeChannelId = activeChannel?.id || null;

  const persistDraft = useCallback((nextDraft, nextReplyTo) => {
    if (!activeChannelId) return;
    try {
      if (nextDraft.trim() || nextReplyTo) {
        window.localStorage.setItem(`chat-draft-${activeChannelId}`, JSON.stringify({ draft: nextDraft, replyTo: nextReplyTo }));
        setDraftChannelIds((current) => new Set([...current, activeChannelId]));
      } else {
        window.localStorage.removeItem(`chat-draft-${activeChannelId}`);
        setDraftChannelIds((current) => {
          const next = new Set(current);
          next.delete(activeChannelId);
          return next;
        });
      }
    } catch {
      // Draft persistence is a convenience; storage failures should not block chat.
    }
  }, [activeChannelId]);

  useEffect(() => {
    if (!activeChannelId) return undefined;
    const timeout = window.setTimeout(() => {
      const stored = readStoredDraft(activeChannelId);
      setDraft(stored.draft || '');
      setReplyTo(stored.replyTo || null);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [activeChannelId]);

  useEffect(() => () => {
    if (recordingTimeoutRef.current) window.clearTimeout(recordingTimeoutRef.current);
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const setDraftValue = useCallback((value) => {
    setDraft(value);
    persistDraft(value, replyTo);
    if (value.trim()) onTyping?.();
    else onStopTyping?.();
  }, [onStopTyping, onTyping, persistDraft, replyTo]);

  const setReplyToValue = useCallback((message) => {
    setReplyTo(message);
    persistDraft(draft, message);
  }, [draft, persistDraft]);

  const insertEmoji = useCallback((emoji) => {
    const input = composerInputRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? draft.length;
    const nextDraft = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    setDraftValue(nextDraft);
    requestAnimationFrame(() => {
      input?.focus();
      const cursor = start + emoji.length;
      input?.setSelectionRange?.(cursor, cursor);
    });
  }, [draft, setDraftValue]);

  const wrapSelection = useCallback((marker) => {
    const input = composerInputRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? draft.length;
    const selected = draft.slice(start, end);
    const nextDraft = `${draft.slice(0, start)}${marker}${selected}${marker}${draft.slice(end)}`;
    setDraftValue(nextDraft);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange?.(start + marker.length, end + marker.length);
    });
  }, [draft, setDraftValue]);

  const clearImage = useCallback(() => {
    setPendingAttachments((current) => {
      current.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
      return [];
    });
  }, []);

  const removePendingAttachment = useCallback((id) => {
    setPendingAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  }, []);

  const attachFiles = useCallback((files) => {
    const nextFiles = Array.from(files || []);
    if (!nextFiles.length) return;

    setPendingAttachments((current) => {
      const next = [...current];

      nextFiles.forEach((file) => {
        const isImage = file.type?.startsWith('image/');
        const isAudio = file.type?.startsWith('audio/') && AUDIO_MIME_TYPES.has(file.type);
        if (isImage && next.filter((attachment) => attachment.kind === 'image').length >= 4) return;
        if (!isImage && !isAudio && (!FILE_MIME_TYPES.has(file.type) || file.size > MAX_FILE_SIZE)) return;
        if (isAudio && file.size > MAX_FILE_SIZE) return;

        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          kind: isImage ? 'image' : (isAudio ? 'audio' : 'file'),
          name: file.name,
          previewUrl: isImage || isAudio ? URL.createObjectURL(file) : null,
          size: file.size,
        });
      });

      return next;
    });
  }, []);

  const attachImage = useCallback((file) => {
    if (file) attachFiles([file]);
  }, [attachFiles]);

  const handlePaste = useCallback((event) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type?.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          attachFiles([file]);
        }
        return;
      }
    }
  }, [attachFiles]);

  const stopVoiceRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.stop();
  }, []);

  const startVoiceRecording = useCallback(async () => {
    if (!activeChannel || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('Voice recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = window.MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (window.MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
      const recorder = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordingChunksRef.current = [];
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) recordingChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        if (recordingTimeoutRef.current) {
          window.clearTimeout(recordingTimeoutRef.current);
          recordingTimeoutRef.current = null;
        }
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;
        setRecording(false);

        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(recordingChunksRef.current, { type });
        recordingChunksRef.current = [];
        if (!blob.size) return;

        const file = new File(
          [blob],
          `voice-${Date.now()}.${extensionForAudioType(type)}`,
          { type: type.split(';')[0] || 'audio/webm' }
        );
        const previewUrl = URL.createObjectURL(blob);
        const peaks = await calculateAudioPeaks(blob);
        setPendingAttachments((current) => [
          ...current,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            file,
            kind: 'audio',
            name: 'Voice message',
            peaks,
            previewUrl,
            size: file.size,
          },
        ]);
      };

      recorder.start();
      setRecording(true);
      recordingTimeoutRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      }, MAX_RECORDING_MS);
    } catch (err) {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      setRecording(false);
      setError(err.message || 'Could not start voice recording.');
    }
  }, [activeChannel, recording, setError]);

  const uploadAttachment = useCallback(async (attachment) => {
    if (attachment.kind !== 'image') {
      const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${activeOrgId}/${activeChannel.id}/${userId}/${Date.now()}_${safeName}`;
      const { error } = await supabase.storage
        .from('chat-files')
        .upload(path, attachment.file, { contentType: attachment.file.type });
      if (error) throw error;
      return {
        bucket: 'chat-files',
        name: attachment.name,
        path,
        peaks: attachment.peaks || [],
        size: attachment.size,
        type: attachment.kind === 'audio' ? 'audio' : 'file',
      };
    }

    const file = attachment.file;
    const compressed = await compressImage(file);
    const ext = (compressed.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from('chat-images')
      .upload(path, compressed, { contentType: compressed.type });
    if (error) throw error;
    return {
      name: attachment.name,
      size: compressed.size,
      type: 'image',
      url: supabase.storage.from('chat-images').getPublicUrl(path).data.publicUrl,
    };
  }, [activeChannel, activeOrgId, userId]);

  const resolveSlashCommand = useCallback(async (rawBody) => {
    const clean = rawBody.trim();
    if (!clean.startsWith('/')) return { body: expandEmojiShortcodes(clean) };

    const [commandToken, ...rest] = clean.split(/\s+/);
    const command = commandToken.toLowerCase();
    const arg = rest.join(' ').trim();

    if (command === '/shrug') {
      return { body: '¯\\_(ツ)_/¯' };
    }

    if (command === '/giphy') {
      if (!arg) throw new Error('Try /giphy followed by a search term.');
      const { data, error } = await supabase.functions.invoke('giphy-proxy', {
        body: { query: arg, limit: 1 },
      });
      if (error) throw error;
      const gif = data?.gifs?.[0];
      if (!gif?.url) throw new Error('No GIF found for that search.');
      return { body: null, imageUrl: gif.url };
    }

    if (command === '/verse') {
      if (!arg) throw new Error('Try /verse followed by a reference, like John 3:16.');
      const passageId = refToPassageId(arg);
      if (!passageId) throw new Error('Could not understand that Bible reference.');
      const { data, error } = await supabase.functions.invoke('bible-proxy', {
        body: { bibleId: 'free:web', passageId },
      });
      if (error) throw error;
      const content = cleanPassageContent(data?.data?.content);
      if (!content) throw new Error('No verse text returned.');
      const reference = data?.data?.reference || passageIdToDisplay(passageId) || arg;
      return { body: `**${reference}**\n${content}` };
    }

    return { body: expandEmojiShortcodes(clean) };
  }, []);

  const sendMessage = useCallback(async (event) => {
    event?.preventDefault();
    const rawBody = draft.trim();
    if ((!rawBody && !pendingAttachments.length) || !activeChannel) return;

    setSending(true);
    setError('');
    let tempId = null;

    try {
      const resolved = await resolveSlashCommand(rawBody);
      const body = (resolved.body || '').trim();
      const commandImageUrl = resolved.imageUrl || null;
      if (!body && !pendingAttachments.length && !commandImageUrl) return;

      tempId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const attachmentsToSend = pendingAttachments;
      const replyTarget = replyTo;
      const optimisticImageUrl = commandImageUrl
        || attachmentsToSend.find((attachment) => attachment.kind === 'image')?.previewUrl
        || null;

      appendOptimisticMessage({
        id: tempId,
        channel_id: activeChannel.id,
        organization_id: activeOrgId,
        author_id: userId,
        author_name: displayName,
        body: body || null,
        attachments: attachmentsToSend.map((attachment) => ({
          name: attachment.name,
          peaks: attachment.peaks || [],
          size: attachment.size,
          type: attachment.kind,
          url: attachment.previewUrl,
        })),
        image_url: optimisticImageUrl,
        created_at: createdAt,
        pending: true,
        reply_to_id: replyTarget?.id || null,
        retryPayload: { attachments: attachmentsToSend, body: rawBody, replyTo: replyTarget },
      });
      setDraft('');
      persistDraft('', null);
      onStopTyping?.();
      clearImage();
      setReplyTo(null);
      setPendingAttachments([]);

      const attachments = [];
      for (const attachment of attachmentsToSend) {
        attachments.push(await uploadAttachment(attachment));
      }
      const imageUrl = attachments.find((attachment) => attachment.type === 'image')?.url || null;
      const data = await insertMessage({
        id: tempId,
        channel_id: activeChannel.id,
        organization_id: activeOrgId,
        author_id: userId,
        author_name: displayName,
        body: body || null,
        attachments,
        image_url: commandImageUrl || imageUrl,
        reply_to_id: replyTarget?.id || null,
      });
      replaceOptimisticMessage(tempId, data);

      const mentionIds = parseMentionIds(body).filter((id) => id !== userId);
      if (mentionIds.length) {
        await supabase.from('chat_mentions').insert(mentionIds.map((id) => ({
          message_id: data.id,
          channel_id: activeChannel.id,
          organization_id: activeOrgId,
          mentioned_user_id: id,
          actor_id: userId,
          actor_name: displayName,
        })));
      }
    } catch (err) {
      if (tempId) markOptimisticMessageFailed(tempId, friendlySendError(err));
      // The failed message keeps its inline Retry/Discard controls, so the
      // global banner is redundant for a routine network drop — only surface
      // real server/validation errors there.
      if (!isNetworkError(err)) setError(err.message || 'Could not send your message.');
    } finally {
      setSending(false);
    }
  }, [activeChannel, activeOrgId, appendOptimisticMessage, clearImage, displayName, draft, insertMessage, markOptimisticMessageFailed, onStopTyping, pendingAttachments, persistDraft, replaceOptimisticMessage, replyTo, resolveSlashCommand, setError, uploadAttachment, userId]);

  const sendGif = useCallback(async (gifUrl) => {
    if (sending || !activeChannel) return;
    setSending(true);
    setError('');

    try {
      await insertMessage({
        channel_id: activeChannel.id,
        organization_id: activeOrgId,
        author_id: userId,
        author_name: displayName,
        body: null,
        image_url: gifUrl,
        reply_to_id: replyTo?.id || null,
      });
      onStopTyping?.();
      setReplyToValue(null);
      setShowGifPicker(false);
    } catch (err) {
      setError(isNetworkError(err) ? 'Couldn’t send the GIF — check your connection and try again.' : (err.message || 'Could not send the GIF.'));
    } finally {
      setSending(false);
    }
  }, [activeChannel, activeOrgId, displayName, insertMessage, onStopTyping, replyTo, sending, setError, setReplyToValue, userId]);

  const startReply = useCallback((message) => {
    setReplyToValue(message);
    setReactingFor(null);
    requestAnimationFrame(() => composerInputRef.current?.focus());
  }, [setReplyToValue]);

  const startEdit = useCallback((message) => {
    setEditingMessageId(message.id);
    setEditingText(message.body || '');
    setReactingFor(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingText('');
  }, []);

  const saveEdit = useCallback(async (messageId) => {
    const saved = await saveEditMessage(messageId, editingText);
    if (saved) cancelEdit();
  }, [cancelEdit, editingText, saveEditMessage]);

  const retryFailedMessage = useCallback((message) => {
    const payload = message?.retryPayload;
    if (!payload) return;
    setDraftValue(payload.body || '');
    setPendingAttachments(payload.attachments || []);
    setReplyToValue(payload.replyTo || null);
    discardOptimisticMessage(message.id);
    requestAnimationFrame(() => composerInputRef.current?.focus());
  }, [discardOptimisticMessage, setDraftValue, setReplyToValue]);

  return {
    attachImage,
    attachFiles,
    cancelEdit,
    clearImage,
    composerInputRef,
    draft,
    draftChannelIds,
    editingMessageId,
    editingText,
    handlePaste,
    insertEmoji,
    pendingAttachments,
    reactingFor,
    recording,
    removePendingAttachment,
    retryFailedMessage,
    replyTo,
    saveEdit,
    sending,
    sendGif,
    sendMessage,
    setDraft: setDraftValue,
    setEditingText,
    setReactingFor,
    setReplyTo: setReplyToValue,
    setShowGifPicker,
    showGifPicker,
    startVoiceRecording,
    startEdit,
    startReply,
    stopVoiceRecording,
    wrapSelection,
  };
}
