import { MessagesSquare, ExternalLink } from 'lucide-react';
import './DiscordChat.css';

// Renders an embedded WidgetBot Discord client in place of the native chat module.
// Activated per-organization from the Admin panel (discord_enabled + discord_guild_id).
// WidgetBot (https://widgetbot.io) embeds the real Discord experience — channel list,
// message history, @mentions, reactions, and sending — inside an iframe. The org must
// add the WidgetBot bot to their server (https://add.widgetbot.io) for the embed to work.
export default function DiscordChat({ organization }) {
  const guildId = organization?.discord_guild_id?.trim();
  const channelId = organization?.discord_channel_id?.trim();
  const orgName = organization?.name || 'Community';

  if (!guildId) {
    return (
      <div className="discord-chat-page">
        <div className="discord-chat-empty">
          <MessagesSquare size={40} />
          <h2>Discord chat isn’t set up yet</h2>
          <p>An administrator needs to add this organization’s Discord Server ID in the Admin panel.</p>
        </div>
      </div>
    );
  }

  // WidgetBot embed: https://e.widgetbot.io/channels/<server>/<channel>
  // Channel is optional — WidgetBot falls back to the server's default channel.
  const embedSrc = `https://e.widgetbot.io/channels/${encodeURIComponent(guildId)}${
    channelId ? `/${encodeURIComponent(channelId)}` : ''
  }`;

  return (
    <div className="discord-chat-page">
      <div className="discord-chat-header">
        <div className="discord-chat-title">
          <MessagesSquare size={20} />
          <span>{orgName} on Discord</span>
        </div>
        <a
          className="discord-chat-open"
          href={`https://discord.com/channels/${encodeURIComponent(guildId)}${channelId ? `/${encodeURIComponent(channelId)}` : ''}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Discord
          <ExternalLink size={14} />
        </a>
      </div>

      <iframe
        title={`${orgName} Discord`}
        className="discord-chat-frame"
        src={embedSrc}
        allow="clipboard-write; encrypted-media"
        sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-forms"
        frameBorder="0"
      />

      <p className="discord-chat-hint">
        Sign in with Discord inside the chat to send messages. Don’t see the server? The owner must
        add the <strong>WidgetBot</strong> bot at add.widgetbot.io.
      </p>
    </div>
  );
}
