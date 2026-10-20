# Kenya Law proxy and PVP event setup

## Kenya Law proxy

The repository already uses `supabase/functions/kenya-law-search` as the server-side proxy. The browser sends an authenticated request to the Edge Function; the function fetches public pages from Kenya Law and public search indexes, normalizes only official `kenyalaw.org` / `new.kenyalaw.org` judgment, Act, bill, and legal-notice links, and returns those links to the app. It never sends provider credentials to the browser and it does not bypass a login, CAPTCHA, or access control.

Deploy it with the Supabase CLI from the repository root:

```bash
supabase functions deploy kenya-law-search
```

For production, keep the upstream request timeout, official-domain allowlist, result deduplication, and query-length limit. To expand coverage safely, add another public discovery provider inside the Edge Function, normalize its links through `officialLawUrl`, and keep the official Kenya Law domain as the final authority check. Do not treat search-engine snippets as legal text. A result becomes an AI case source only after the official judgment/legislation URL is fetched and its readable text is available.

A durable case repository should be added as a separate ingestion layer rather than writing search results directly into `materials`:

1. Create a `kenya_law_cases` table with the canonical official URL as a unique key, title, citation, court, judgment date, source URL, fetched text or storage path, content hash, `last_checked_at`, and ingestion status.
2. Run a scheduled authenticated/service-role ingestion job that searches by court, year, and legal topic, fetches the official source, hashes the normalized text, and upserts only changed documents.
3. Keep the browser search path read-only. Search can return repository matches first, then live proxy results; the UI should show `repository`, `live`, or `degraded` provenance.
4. Store the original HTML/PDF in private storage when permitted, retain the canonical public source link, and show a freshness/source warning in every AI brief.
5. Add rate limiting, bounded concurrency, retry backoff, and a dead-letter/error record. Never scrape behind access controls or silently replace an unavailable judgment with invented text.

This separates discovery from the study library and allows the repository to grow across Supreme Court, Court of Appeal, High Court, ELRC, ELC, Magistrates’ Courts, statutes, and legal notices without making the frontend responsible for scraping.

## PVP debate event

The Arena is already wired to the `debate_rooms`, `debate_messages`, `debate_leaderboard`, and `evaluate-debate` services. Apply the Arena migrations after the existing Legal Arena migrations:

```bash
supabase db push
# or apply only the reviewed migration in the SQL editor:
# 028_self_serve_pvp_rooms.sql
# 029_arena_points_matchmaking_ai.sql
# 030_matchmaking_status_poll_fix.sql
supabase functions deploy evaluate-debate
```

Migration `028_self_serve_pvp_rooms.sql` changes the event flow as follows:

- Any authenticated member can host a room; the old super-admin-only gate is removed.
- Each room still has exactly two seats, with the database RPC rejecting a third participant.
- The host chooses Proposer or Opposer. The invitee explicitly chooses the other open side; the server rejects a taken side.
- The AI-generated motion/case packet is stored with the room, and only official Kenya Law links in the packet are accepted.
- Six alternating turns are enforced server-side as opening, rebuttal, and closing phases.
- Each side gets the room’s server-generated turn clock. Expired turns are recorded as no submission.
- The secure evaluator scores the completed transcript and updates the live leaderboard; clients cannot write scores directly.

The player-facing language is intentionally simple: **Proposer** means “supports the motion,” and **Opposer** means “challenges the motion.” A player can press **Find an opponent** after making a case. The server first looks for a signed-in student with the same level and time control. If nobody joins during the short search window, **AI • BriefBot** joins automatically. It is clearly marked as AI, and the demo AI rows on the universal leaderboard are also labelled as AI/demo entries rather than pretending to be real students.

The universal leaderboard uses points as its main score. A completed debate adds the player’s judge score plus a result bonus, so points keep increasing instead of resetting after each match. Real students are stored in the authenticated leaderboard table; AI/demo players are stored separately and combined through a read-only universal view, preserving the real-user foreign-key protection.

For today’s event, use a signed-in host account, select a library source, choose the motion/topic and 10- or 20-minute control, generate the packet, create the room, and share the `/arena?join=...` invite link. The second participant signs in, chooses the open side, and joins. Do not start the round until both names and roles are visible in the room.
