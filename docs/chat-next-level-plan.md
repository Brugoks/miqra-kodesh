# Chat Next-Level Plan

Goal: evolve the org chat ([src/components/Chat.jsx](../src/components/Chat.jsx), ~1,200 lines) from a solid Discord-lite into a full-featured, ultra-modern chat. This document is written to be executed phase-by-phase by a coding agent (Codex/Gemini/Claude). Each phase is independently shippable; do them in order — Phase 0 unblocks everything after it.

## Current state (what already exists — do NOT rebuild)

- Org-scoped channels with categories, private channels, and deterministic 2-person DMs (`dmChannelName` in `src/lib/discipleship.js`, `?dm=<userId>` deep link).
- Realtime via Supabase `postgres_changes` for messages, reactions, channels, and membership.
- Reactions (fixed set of 8 emoji), quote-style replies (`reply_to_id`), edit/delete own messages, moderator delete.
- @mentions via `react-mentions`, stored as `@[Name](id)` markup; `chat_mentions` table + DB trigger `notify_chat_mention` → `send-push` edge function.
- Image attachments (client compression via `src/lib/imageCompression.js`, paste-to-attach, `chat-images` public bucket, lightbox).
- GIF picker (`src/components/GifPicker.jsx`) — Giphy, but requires each user to paste their own API key (localStorage). This is a UX bug to fix (Phase 4).
- Per-channel unread badges (`chat_unread_counts` RPC + `chat_channel_reads` upsert).
- Link previews (`src/components/LinkPreview.jsx` + `link-preview` edge function), URL linkification (`src/lib/linkUtils.js`).
- Web push infra: `src/lib/push.js` (VAPID), `push_subscriptions` table, `send-push` edge function, `public/sw.js`.

Key tables: `chat_channels`, `chat_messages`, `chat_message_reactions`, `chat_mentions`, `chat_channel_members`, `chat_channel_reads`. RLS is org-scoped via `get_my_organization_id()`; private channels gate via `chat_channel_members`. Migrations of record: `supabase/migrations/20260613030000_chat_system.sql`, `20260613040000_chat_enhancements.sql`, `20260613070000_private_chats.sql`, `20260613080000_chat_last_read.sql`, `20260613090000_per_channel_reads.sql`, `20260613100000_chat_mention_push_trigger.sql`.

Conventions to follow:
- Plain JSX (no TypeScript), Vite + React, CSS files per component (`Chat.css`), lucide-react icons, existing `btn-primary`/`btn-secondary`/`card` classes.
- New SQL goes in `supabase/migrations/<YYYYMMDDNNNNNN>_<name>.sql`, idempotent (`if not exists`, `create or replace`), RLS on every table, org-scoped policies matching the existing chat policies.
- Optimistic UI updates with rollback-on-error, and realtime handlers that dedupe by id (see existing `setMessages` patterns).

---

## Phase 0 — Refactor + performance foundation

The component is a 1,200-line monolith that loads **every message in a channel** on open and re-renders the whole list on any change. Fix this first or every later feature compounds the problem.

### 0.1 Split Chat.jsx into modules (no behavior change)

Create `src/components/chat/` and extract:

- `ChatSidebar.jsx` — channel groups, unread badges, new-channel button.
- `MessageList.jsx` — the messages pane (virtualization-ready).
- `MessageItem.jsx` — one message: avatar, body, reactions, actions. Wrap in `React.memo`.
- `Composer.jsx` — MentionsInput, attach/GIF buttons, reply bar, image preview.
- `ChannelModals.jsx` — create/rename/add-people modals.
- `useChatChannels.js`, `useChatMessages.js`, `useChatRealtime.js`, `useUnreadCounts.js` — hooks in `src/components/chat/hooks/` holding the data logic currently inline in Chat.jsx.
- `Chat.jsx` stays as the page-level orchestrator (< 250 lines).

Keep `Chat.css` (split later only if convenient). All existing tests must still pass (`npm test`); run `npm run lint`.

### 0.2 Message pagination (infinite scroll upward)

- `loadMessages` fetches the **latest 50** (`.order('created_at', { ascending: false }).limit(50)` then reverse).
- On scroll near top, fetch the previous 50 with `.lt('created_at', oldestLoaded.created_at)`; prepend while preserving scroll position (record `scrollHeight` before prepend, restore offset after).
- Show a small "Loading earlier messages…" row while fetching; stop when a page returns < 50.
- Reactions load only for the fetched ids (already the pattern).

### 0.3 Fix the firehose unread subscription

The `chat-unread-side-${userId}` subscription listens to **all** `chat_messages` inserts table-wide (realtime respects RLS but this still streams every org message to every client). Keep it, but add a channel-membership guard client-side is not enough for scale; acceptable for now — however, resubscribe only once per user (it currently tears down on every `activeChannelId` change because of the dependency array). Use a ref for `activeChannelId` inside the handler instead of a dep.

### 0.4 Message day separators + grouping

- Insert a date divider ("Today", "Yesterday", "June 30") between messages on different days.
- Collapse consecutive messages by the same author within 5 minutes: hide avatar/name, show hover timestamp. This is what makes chat feel modern more than any single feature.
- Add a "New messages" divider at the first unread message when opening a channel (use `chat_channel_reads.last_read_at`).

### 0.5 Scroll behavior polish

- Only auto-scroll to bottom on new messages if the user is already within ~120px of the bottom; otherwise show a floating "↓ N new messages" pill that scrolls down on click.
- Keep the existing instant-scroll on channel switch.

---

## Phase 1 — Presence layer: typing indicators, online status, read receipts

Uses Supabase Realtime **broadcast + presence** (no DB writes for typing).

### 1.1 Typing indicators

- In `Composer`, broadcast `{ userId, name }` on a `typing` event to channel `chat-typing-${channelId}`, throttled to once per 2.5s while the draft changes; broadcast `stop_typing` on send/clear.
- In `MessageList` footer, show "Sarah is typing…", "Sarah and Ben are typing…", "Several people are typing…". Expire each typer 4s after their last event.

### 1.2 Online presence

- One org-wide presence channel `chat-presence-${orgId}`; track `{ userId }` on mount of the chat page.
- Green dot on avatars of online members (message list + member pickers).
- Optional: online-count in the channel header ("12 online").

### 1.3 Read receipts (channel-level "seen")

- `chat_channel_reads` already stores `last_read_at` per user — no new table.
- New migration `chat_read_receipts_select.sql`: add a SELECT policy so channel co-members can read each other's `chat_channel_reads` rows (currently users likely only read their own — verify `20260613090000_per_channel_reads.sql` and widen with: org members for public channels, `chat_channel_members` for private).
- Under the last message you sent, show mini avatar stack of members whose `last_read_at` ≥ that message's `created_at` (cap at 5 + "+N"). Subscribe to `chat_channel_reads` updates for the active channel.
- For DMs render as a simple "Seen" label instead of avatars.

---

## Phase 2 — Threads, pins, and better replies

### 2.1 Proper threads

- Migration `chat_threads.sql`:
  - `alter table chat_messages add column if not exists thread_root_id uuid references chat_messages(id) on delete cascade;`
  - `alter table chat_messages add column if not exists reply_count integer not null default 0;`
  - `alter table chat_messages add column if not exists last_reply_at timestamptz;`
  - Trigger to maintain `reply_count`/`last_reply_at` on the root when a message with `thread_root_id` is inserted/deleted.
  - Index `(thread_root_id, created_at)`.
- Main channel query excludes thread replies (`.is('thread_root_id', null)`).
- `ThreadPanel.jsx`: right-side panel (overlays on mobile, full-height drawer) opened from a "Reply in thread" action; shows root message + replies + its own composer. Realtime filter `thread_root_id=eq.<rootId>`.
- Root messages with replies show a "🧵 3 replies · last 2h ago" bar that opens the panel.
- Keep the existing lightweight quote-reply (`reply_to_id`) as "Quote" — the two coexist (like Telegram quote vs Slack thread).
- Clicking a quote-reply preview scrolls to and briefly highlights the original message (if loaded; otherwise fetch its page).

### 2.2 Pinned messages

- Migration `chat_pins.sql`: `chat_pinned_messages (channel_id, message_id, pinned_by, created_at, pk (channel_id, message_id))`, RLS: read = channel visibility; write = `can_manage_channels()` or channel creator.
- Pin/unpin in message actions (leaders); pin icon + count in channel header opens a dropdown listing pinned messages; click jumps to the message.

### 2.3 Edited indicator + delete tombstones

- Migration: `add column if not exists edited_at timestamptz` on `chat_messages`; set it in `saveEdit`. Render a subtle "(edited)" suffix.
- Change delete to soft-delete for non-moderators: `deleted_at timestamptz` column; render "This message was deleted" tombstone so thread/quote context survives. Moderator delete stays hard-delete. Update RLS so authors can only set `deleted_at`, not modify others.

---

## Phase 3 — Composer upgrades: emoji, markdown, drafts, delivery states

### 3.1 Full emoji picker + emoji autocomplete

- Add dependency `emoji-picker-element` (web component, lazy-load on first open; no React wrapper needed — mount in a `ref` div).
- Replace the 8-emoji reaction popover with it (keep the 8 as a quick-row on top). Also add an emoji button in the composer that inserts at cursor.
- `:pray:`-style autocomplete in the composer: on `:xxx` (≥2 chars) show a small suggestion list (reuse the emoji-picker-element database API for search).
- Persist each user's recently-used reactions in localStorage; quick-row shows those.

### 3.2 Markdown-lite rendering

- Support **bold**, *italic*, ~~strikethrough~~, `inline code`, ``` fenced code blocks ```, and > blockquotes in message bodies.
- Implement as a small tokenizer extending the existing `renderBody`/`linkifyText` pipeline in a new `src/lib/chatMarkdown.jsx` — do NOT pull in a full markdown lib (react-markdown) unless the hand-rolled version proves insufficient; mention markup `@[Name](id)` and URL linkification must keep working inside it. No raw HTML ever.
- Composer formatting: Cmd/Ctrl+B/I wrap selection with `**`/`*`.

### 3.3 Optimistic sends with delivery states

- On send, immediately append a local message `{ id: temp-uuid, pending: true, ... }`; replace with the server row on success; on failure mark `failed: true` with a "Retry / discard" affordance.
- Subtle clock icon while pending, red warning on failure. Remove the current "whole composer disabled while sending" behavior — allow rapid-fire sends (queue image uploads).

### 3.4 Per-channel draft persistence

- Persist `draft` + `replyTo` per channel in a `useRef` map (and localStorage keyed `chat-draft-<channelId>`), restore on channel switch. Show a pencil "Draft" hint next to channels with a saved draft in the sidebar.

### 3.5 Multi-image + drag-and-drop + file attachments

- Allow up to 4 images per message: migration adds `attachments jsonb` (`[{url, type, name, size}]`) on `chat_messages`; keep `image_url` read path for old rows.
- Drag-and-drop onto the message pane with a drop overlay ("Drop to share").
- Non-image files (pdf, docx — allowlist, ≤ 10 MB) upload to a new private `chat-files` bucket (signed URLs, 1-week expiry, re-sign on demand); render as a file chip with name/size/download.

---

## Phase 4 — Notifications & channel controls

### 4.1 Fix the GIF picker key problem

- New edge function `giphy-proxy` (copy the pattern of `supabase/functions/youtube-proxy`): server-side `GIPHY_API_KEY` secret, endpoints for trending + search, small in-DB cache like `youtube_search_cache` if convenient. Remove the localStorage key-entry UI from `GifPicker.jsx` entirely.

### 4.2 Channel notification preferences + mute

- Migration `chat_channel_prefs.sql`: `chat_channel_prefs (channel_id, user_id, level text check (level in ('all','mentions','none')) default 'mentions', muted_until timestamptz, pk (channel_id, user_id))`, RLS self-only.
- Channel header ⋮ menu: notification level (All messages / @mentions only / Nothing) + "Mute for 1h / 8h / until I turn it back on".
- Muted channels render dimmed in the sidebar and suppress the unread badge (show a small dot instead).

### 4.3 Push for DMs and "all messages" channels

- Extend the existing DB trigger approach (`20260613100000_chat_mention_push_trigger.sql`): new trigger on `chat_messages` insert that pushes to members of private channels (and to users with `level='all'` on any channel), excluding the author, respecting `muted_until`, and skipping users whose `chat_channel_reads` show them likely active (optional: skip if last_read within 30s). Batch via the existing `send-push` function. Dedupe: a message that also creates a mention row must not double-push — mention push wins (check in the message trigger whether recipient is mentioned).
- Update `public/sw.js` notification click-through to deep-link `/chat?channel=<id>`; Chat.jsx reads `?channel=` the way it already reads `?dm=`.

### 4.4 Unread aggregation in app nav

- Surface total unread (sum of unmuted channels) as a badge on the Chat nav item in `Layout.jsx` (an org-level `chat_last_read_at` mechanism already exists — replace/augment it with the per-channel counts RPC).

---

## Phase 5 — Search, member panel, and jump navigation

### 5.1 Message search

- Migration `chat_search.sql`: `alter table chat_messages add column if not exists fts tsvector generated always as (to_tsvector('english', coalesce(body,''))) stored;` + GIN index. RPC `chat_search_messages(org_id uuid, q text, channel uuid default null)` (security invoker so RLS applies) returning matches with channel name + snippet (`ts_headline`), limit 40.
- Search UI: input in the chat header (Cmd/Ctrl+K focuses it); results dropdown grouped by channel; strip mention markup in snippets; click → switch channel, load the page containing that message (fetch 25 around its `created_at`), scroll + highlight.

### 5.2 Member panel & profiles

- Toggleable right sidebar listing channel members (private: `chat_channel_members`; public: org members) with online dots (Phase 1 presence), grouped Online/Offline.
- Click a member → mini profile popover: avatar, name, role, "Message" button (reuses the `?dm=` flow).

### 5.3 Mention & activity inbox

- A bell/inbox icon in the chat header showing recent `chat_mentions` (read/unread), replies to your messages, and reactions to your messages (last 7 days). Click → jump to message. This reuses `chat_mentions`; add a lightweight `chat_activity` view or query replies/reactions directly.

---

## Phase 6 — Voice messages & delight (optional, do last)

- **Voice messages**: MediaRecorder → webm/opus (fallback mp4/aac on Safari), ≤ 60s, upload to `chat-files`; waveform-ish playback bar (peaks computed client-side at record time, stored in `attachments` json). Mic button appears when the composer is empty.
- **Message forwarding**: "Forward to…" action → channel picker → inserts a message with a `forwarded_from jsonb` stamp rendered as a small header.
- **Slash commands**: `/giphy <term>` (sends top result), `/shrug`, `/verse John 3:16` (fetch via existing `bible-proxy` and send formatted quote — high delight for this app).
- **Custom reactions per org** (leader-managed emoji set) — only if requested.

---

## Cross-cutting requirements (every phase)

- **Mobile**: the sidebar must collapse to a drawer/tab on < 720px; thread panel and member panel become full-screen overlays. Test at 375px width.
- **A11y**: all icon buttons keep `aria-label`s; emoji picker, modals, and popovers trap focus and close on Escape (lightbox already does this — copy the pattern).
- **RLS first**: never rely on client filtering for private-channel data. Any new table gets org-scoped + membership-scoped policies mirroring `20260613070000_private_chats.sql`.
- **Multi-tenant**: every new row carries `organization_id` where applicable (see `20260612000000_multi_tenant_support.sql`).
- **Realtime hygiene**: dedupe inserts by id, tolerate out-of-order events, always `removeChannel` in effect cleanup.
- **Verification per phase**: `npm run lint`, `npm test`, then manual two-browser test (two accounts) covering: send/receive, typing, unread badges, push, private-channel isolation (user B must not see channel A's data — verify in network tab, not just UI).

## Suggested execution order & sizing

| Phase | Size | Depends on |
|-------|------|------------|
| 0 Refactor + pagination + grouping | L | — |
| 1 Typing/presence/read receipts | M | 0 |
| 2 Threads + pins + edited/tombstones | L | 0 |
| 3 Composer (emoji, markdown, optimistic, drafts, files) | L | 0 |
| 4 Notifications + giphy-proxy + mute | M | 0 (4.3 pairs well with 1) |
| 5 Search + member panel + inbox | M | 0, 1 |
| 6 Voice + forwarding + slash commands | M | 3 |
