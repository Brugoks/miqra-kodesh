import { CornerUpRight, ImagePlus, Mic, Send, SmilePlus, Square, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Mention, MentionsInput } from 'react-mentions';
import GifPicker from '../GifPicker';
import EmojiPickerPopover from './EmojiPickerPopover';
import { previewText } from './chatUtils';

const SHORTCODE_OPTIONS = [
  { name: 'pray', emoji: '🙏' },
  { name: 'heart', emoji: '❤️' },
  { name: 'fire', emoji: '🔥' },
  { name: 'thumbsup', emoji: '👍' },
  { name: 'joy', emoji: '😂' },
  { name: 'music', emoji: '🎵' },
  { name: 'raised_hands', emoji: '🙌' },
  { name: 'open_mouth', emoji: '😮' },
];

export default function Composer({
  activeChannel,
  composerInputRef,
  draft,
  onInsertEmoji,
  mentionableMembers,
  onClearImage,
  onClearReply,
  onPaste,
  onPickImage,
  onRemoveAttachment,
  onSend,
  onSendGif,
  onSetDraft,
  onStartVoiceRecording,
  onStopVoiceRecording,
  onWrapSelection,
  pendingAttachments,
  recording,
  replyTo,
  setShowGifPicker,
  showGifPicker,
}) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const shortcodeSuggestions = useMemo(() => {
    const match = draft.match(/(^|\s):([a-z_]{2,})$/);
    if (!match) return [];
    const term = match[2].toLowerCase();
    return SHORTCODE_OPTIONS
      .filter((option) => option.name.includes(term))
      .slice(0, 5);
  }, [draft]);

  const applyShortcode = (option) => {
    onSetDraft(draft.replace(/(^|\s):([a-z_]{2,})$/, `$1${option.emoji}`));
  };

  const handleComposerKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 'b' || key === 'i') {
        event.preventDefault();
        onWrapSelection(key === 'b' ? '**' : '*');
        return;
      }
    }

    if (
      event.key !== 'Enter'
      || event.shiftKey
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || event.nativeEvent?.isComposing
    ) {
      return;
    }

    event.preventDefault();
    onSend();
  };

  return (
    <>
      {replyTo && (
        <div className="chat-reply-bar">
          <CornerUpRight size={14} />
          <span>Replying to <strong>{replyTo.author_name || 'Member'}</strong>: {previewText(replyTo).slice(0, 60)}</span>
          <button type="button" onClick={onClearReply} aria-label="Cancel reply"><X size={14} /></button>
        </div>
      )}

      {pendingAttachments.length > 0 && (
        <div className="chat-attachment-preview">
          {pendingAttachments.map((attachment) => (
            <div key={attachment.id} className="chat-attachment-preview-item">
              {attachment.kind === 'audio' && attachment.previewUrl ? (
                <audio controls src={attachment.previewUrl} />
              ) : attachment.previewUrl ? (
                <img src={attachment.previewUrl} alt={attachment.name || 'preview'} />
              ) : (
                <span>{attachment.name}</span>
              )}
              <button type="button" onClick={() => onRemoveAttachment(attachment.id)} aria-label="Remove attachment"><X size={14} /></button>
            </div>
          ))}
          <button type="button" className="chat-attachment-clear" onClick={onClearImage}>Clear all</button>
        </div>
      )}

      {showGifPicker && (
        <GifPicker
          onSelect={onSendGif}
          onClose={() => setShowGifPicker(false)}
        />
      )}

      <form className="chat-composer" onSubmit={onSend} onPaste={onPaste}>
        {(recording || (!draft.trim() && pendingAttachments.length === 0)) && (
          <button
            type="button"
            className={`chat-composer-icon-btn ${recording ? 'recording' : ''}`}
            onClick={recording ? onStopVoiceRecording : onStartVoiceRecording}
            title={recording ? 'Stop recording' : 'Record voice message'}
            disabled={!activeChannel}
          >
            {recording ? <Square size={17} /> : <Mic size={18} />}
          </button>
        )}
        <label className="chat-attach" title="Attach image">
          <ImagePlus size={18} />
          <input
            type="file"
            accept="image/*,audio/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv"
            onChange={onPickImage}
            disabled={!activeChannel}
            multiple
            hidden
          />
        </label>
        <button
          type="button"
          className={`chat-gif-btn ${showGifPicker ? 'active' : ''}`}
          onClick={() => setShowGifPicker(!showGifPicker)}
          title="Search and send GIFs"
          disabled={!activeChannel}
        >
          GIF
        </button>
        <div className="chat-composer-emoji-wrap">
          <button
            type="button"
            className={`chat-composer-icon-btn ${emojiOpen ? 'active' : ''}`}
            onClick={() => setEmojiOpen((open) => !open)}
            title="Insert emoji"
            disabled={!activeChannel}
          >
            <SmilePlus size={18} />
          </button>
          {emojiOpen && (
            <EmojiPickerPopover
              onSelect={(emoji) => {
                onInsertEmoji(emoji);
                setEmojiOpen(false);
              }}
            />
          )}
        </div>
        <div className="chat-composer-input-wrap">
          {shortcodeSuggestions.length > 0 && (
            <div className="chat-shortcode-popover">
              {shortcodeSuggestions.map((option) => (
                <button key={option.name} type="button" onClick={() => applyShortcode(option)}>
                  <span>{option.emoji}</span>
                  <strong>:{option.name}:</strong>
                </button>
              ))}
            </div>
          )}
          <MentionsInput
            className="chat-mentions-input"
            value={draft}
            onChange={(event) => onSetDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            inputRef={composerInputRef}
            placeholder={activeChannel ? `Message #${activeChannel.name} - use @ to mention` : 'Select a channel...'}
            disabled={!activeChannel}
            allowSuggestionsAboveCursor
          >
            <Mention
              trigger="@"
              data={mentionableMembers}
              markup="@[__display__](__id__)"
              displayTransform={(id, display) => `@${display}`}
              onAdd={() => null}
              onRemove={() => null}
              appendSpaceOnAdd
            />
          </MentionsInput>
        </div>
        <button type="submit" className="btn-primary chat-send" disabled={recording || ((!draft.trim() && !pendingAttachments.length) || !activeChannel)}>
          <Send size={16} />
        </button>
      </form>
    </>
  );
}
