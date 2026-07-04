import { useEffect, useState } from 'react';
import { Download, FileAudio, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

const formatBytes = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function AttachmentList({ attachments = [], fallbackImageUrl, onImageLoad, onOpenImage }) {
  const normalized = attachments.length
    ? attachments
    : (fallbackImageUrl ? [{ type: 'image', url: fallbackImageUrl, name: 'shared image' }] : []);

  if (!normalized.length) return null;

  return (
    <div className="chat-attachments">
      {normalized.map((attachment, index) => (
        attachment.type === 'image' ? (
          <button
            key={attachment.url || index}
            type="button"
            className="chat-msg-image-button"
            onClick={() => onOpenImage({ url: attachment.url, authorName: attachment.authorName || 'Member' })}
            aria-label="Open shared image"
          >
            <img src={attachment.url} alt={attachment.name || 'shared'} className="chat-msg-image" onLoad={onImageLoad} />
          </button>
        ) : attachment.type === 'audio' ? (
          <AudioAttachment key={attachment.path || attachment.url || index} attachment={attachment} />
        ) : (
          <FileAttachment key={attachment.path || attachment.url || index} attachment={attachment} />
        )
      ))}
    </div>
  );
}

function useAttachmentHref(attachment) {
  const [href, setHref] = useState(attachment.url || '');

  useEffect(() => {
    if (attachment.url || !attachment.path) return undefined;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.storage
        .from(attachment.bucket || 'chat-files')
        .createSignedUrl(attachment.path, 60 * 60 * 24 * 7);
      if (!cancelled) setHref(data?.signedUrl || '');
    })();

    return () => {
      cancelled = true;
    };
  }, [attachment.bucket, attachment.path, attachment.url]);

  return href;
}

function AudioAttachment({ attachment }) {
  const href = useAttachmentHref(attachment);
  const peaks = Array.isArray(attachment.peaks) ? attachment.peaks : [];

  return (
    <div className="chat-audio-chip">
      <FileAudio size={18} />
      <span>
        <strong>{attachment.name || 'Voice message'}</strong>
        <small>{formatBytes(attachment.size)}</small>
      </span>
      {peaks.length > 0 && (
        <div className="chat-audio-peaks" aria-hidden="true">
          {peaks.map((peak, index) => (
            <i key={`${peak}-${index}`} style={{ height: `${Math.max(4, Math.round(peak * 30))}px` }} />
          ))}
        </div>
      )}
      <audio controls src={href || undefined} />
    </div>
  );
}

function FileAttachment({ attachment }) {
  const href = useAttachmentHref(attachment);

  return (
    <a className="chat-file-chip" href={href || undefined} target="_blank" rel="noopener noreferrer">
      <FileText size={18} />
      <span>
        <strong>{attachment.name || 'File'}</strong>
        <small>{formatBytes(attachment.size)}</small>
      </span>
      <Download size={16} />
    </a>
  );
}
