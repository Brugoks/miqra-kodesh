import { useMemo, useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import LinkPreview from '../LinkPreview';
import { musicEmbedFor, playInMiniPlayer } from '../../lib/musicEmbed';

export default function SmartLinkPreview({ url }) {
  const embed = useMemo(() => musicEmbedFor(url), [url]);
  const [sent, setSent] = useState(false);

  if (!embed) return <LinkPreview url={url} />;

  const playInDock = () => {
    playInMiniPlayer(embed, url);
    setSent(true);
  };

  return (
    <div className="chat-media-preview">
      <div className="chat-media-preview-body">
        <span className="chat-media-preview-site">{embed.provider}</span>
        <strong>{sent ? 'Playing in mini-player' : 'Music player available'}</strong>
      </div>
      <button type="button" className="chat-media-load" onClick={playInDock}>
        <Play size={14} />
        Play
      </button>
      <a className="chat-media-open" href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open in ${embed.provider}`}>
        <ExternalLink size={14} />
      </a>
    </div>
  );
}
