# Miqra Kodesh

## Accessing Feedback Tickets

Feedback data lives in the linked Supabase project. The anon key cannot read tickets (RLS requires authentication), so use the **Supabase CLI** with the `--linked` flag, which connects as a privileged role.

### Prerequisites

- Supabase CLI installed and authenticated (`supabase login`)
- Project linked in this repo (already configured)

### Query tickets

```sh
supabase db query --linked "SELECT * FROM feedback_tickets ORDER BY created_at DESC;"
```

### Query the board view (includes vote/comment counts and rank scores)

```sh
supabase db query --linked "SELECT * FROM feedback_board ORDER BY rank_score DESC;"
```

### Query comments on a ticket

```sh
supabase db query --linked "SELECT * FROM feedback_ticket_comments WHERE ticket_id = '<TICKET_ID>' ORDER BY created_at;"
```

### Query activity events on a ticket

```sh
supabase db query --linked "SELECT * FROM feedback_ticket_events WHERE ticket_id = '<TICKET_ID>' ORDER BY created_at;"
```

### List and download screenshot attachments

```sh
supabase storage ls ss:///feedback-screenshots/ --recursive --experimental --linked
supabase storage cp --experimental --linked ss:///feedback-screenshots/<path> /tmp/screenshot.png
```

### Key tables and views

| Name | Type | Description |
|------|------|-------------|
| `feedback_tickets` | table | All ticket data (title, description, status, priority, screenshots, etc.) |
| `feedback_board` | view | Tickets enriched with vote count, comment count, rank score, and author name |
| `feedback_ticket_votes` | table | One row per user-vote on a ticket |
| `feedback_ticket_comments` | table | Comment threads on tickets (supports @mentions) |
| `feedback_ticket_events` | table | Activity log (status changes, assignments, edits, etc.) |
| `feedback-screenshots` | storage bucket | Uploaded screenshot attachments |
