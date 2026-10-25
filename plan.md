# Group 13 Hub — implementation plan

## Product outcome
Deliver a navigable, responsive academic operating system shell for Group 13 with Supabase-backed data and a design system that feels editorial and law-school specific rather than AI-generated or generic SaaS.

## Architecture
- **Frontend:** React + TypeScript + Vite SPA, managed with npm.
- **Database:** Supabase via `@supabase/supabase-js`, using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`.
- **Data boundary:** `src/data/repository.ts` exposes a typed `Group13Repository`. Supabase is the only data source; configuration and query failures are surfaced in the UI.
- **Meetings:** Browser WebRTC carries audio/video peer-to-peer. Supabase Realtime Broadcast/Presence provides free signaling and room presence.
- **State:** Local React state for navigation, filters, search, status transitions, and modal/drawer states in this first slice.
- **Styling:** Plain CSS with design tokens in `src/styles.css`; avoid heavy UI libraries to keep the visual system intentional.
- **Serving:** Static SPA build output in `dist`; preview listener on port 3000. If later published with dynamic APIs, route `/api/*` to the server and `/*` to static SPA fallback; personalized responses remain private/no-store.

## Product structure
- `src/App.tsx`: shell, route-like view switching, data orchestration, responsive navigation.
- `src/data/types.ts`: shared data types used by the Supabase repository and UI.
- `src/data/repository.ts`: Supabase-only typed repository.
- `supabase/schema.sql`: tables, read/update policies, and initial project records.
- `src/styles.css`: visual system and responsive layout.
- `public/`: favicon, route manifest, and icon assets.

## Implemented first slice
1. Dashboard: date masthead, next discussion docket, tasks, progress, unit snapshot, recent library activity, upcoming deadlines.
2. Units: unit lead, progress, upcoming session, and selected unit detail panel.
3. Library: search/filterable material table with source types and unit metadata.
4. Assignments: status flow, assignment rows, detail panel, and research-oriented helper checklist.
5. Discussions: Tuesday/Thursday cadence, upcoming session detail, discussion history, join/live-room affordance.
6. Legal Arena: Quick Debate and Full Moot mode cards, active scenario, round progression, scoring rubric.
7. Members: roster with roles and unit responsibility.
8. Settings: live Supabase connection state and schema checklist.

## Supabase setup
Apply `supabase/migrations/001_ai.sql` first so `ai_documents` exists, then run `supabase/schema.sql` for the core workspace and synchronized baseline `admin_users`/`exam_analyses` tables. Apply the remaining ordered migrations afterward; they remain authoritative for admin RPCs, private-history grants and source-ownership policy. Do not rely on `schema.sql` alone for AI document persistence or RLS. Realtime can later target `discussions`, discussion notes, and notifications.

## Verification
- Run `npm run check`.
- Run `npm run build`.
- Request `/manus-routes.json` and confirm the app serves on port 3000.

## Music and Legal Games Hub expansion

### Product direction
Group 13 becomes a quiet legal study workspace: the music queue is a movable, resizable, minimizable widget, and Legal Arena becomes a Games Hub for grounded Kenyan-law practice.

### Design decisions

- **Design movement:** editorial study console: restrained, tactile controls with a courtroom-notebook feel rather than a loud arcade skin.
- **Core principles:** quiet by default; source-grounded; timed and fair; progressive disclosure so study content remains primary.
- **Color philosophy:** forest green signals active/live state, warm paper keeps reading comfortable, oxblood marks challenge and evaluation, and muted ink keeps controls secondary.
- **Layout paradigm:** a dockable floating utility layer for music; a card-based game launcher that opens focused rooms without taking over the rest of the workspace.
- **Signature elements:** compact player handle/resize affordance, source badges showing which material grounded a challenge, and a visible round/timer rail.
- **Interaction philosophy:** pause/minimize is always one click away; keyboard and mobile controls remain usable; no autoplay or disruptive full-screen takeover.
- **Animation:** short transitions only for docking, round changes, and evaluation; respect reduced-motion preferences.
- **Typography:** existing Group 13 editorial typography; large ink headings, small uppercase labels, compact readable controls.
- **Brand essence:** “A Kenyan law study room that lets you read, listen, argue, and improve.” Personality: rigorous, calm, communal.

### MVP outcomes

1. Global music player supports drag, resize presets, minimize/restore, dock position, and local persistence; it remains responsive and does not cover primary study content on mobile.
2. Games Hub is visible from navigation and preserves the existing AI judge/practice tools.
3. Grounded AI Case Debate lets a user choose uploaded/library material, choose 10 or 20 minutes, submit opening/rebuttal/closing turns, receive concise AI counterarguments, and receive a final rubric evaluation with source warnings.
4. Choices game generates a branching Kenyan-law scenario from selected material, records choices, shows consequences, and gives a grounded debrief.
5. PVP Debate has a real session model and realtime message flow so two signed-in users can join a shared room, choose a timer, exchange structured turns, and request an AI evaluation of the recorded debate. It must not claim a room is live when realtime/database setup is unavailable. Rooms are persistent and participant-scoped: users can restore in-progress rooms and reopen results after navigating away. An invitee counts as joined only after the secured join operation succeeds, and the host sees an explicit participant/side confirmation. Keep the actual court motion visible throughout the room.

### Project structure

- `src/App.tsx`: app-shell navigation, persistent player state, player widget, and Games Hub route wiring.
- `src/GamesHub.tsx`: game launcher, AI debate room, Choices room, and PVP lobby/room UI.
- `src/games.css`: responsive game-room and player utility styling.
- `src/lib/ai.ts`: existing grounded AI invocation and feature types.
- `src/lib/debate.ts`: typed Supabase session/message helpers and realtime subscriptions.
- `supabase/migrations/007-legal-games.sql`: debate sessions/messages, RLS, indexes, and realtime publication.
- `public/manus-routes.json`: `/arena` and any new route aliases.

### Grounding and safety decisions

AI prompts must identify the selected source IDs and use the existing `materials`/`library` modes. The UI must show source basis and warnings, distinguish generated hypotheticals from legal authorities, and state that scores are practice feedback rather than legal advice. PVP evaluation must only use stored debate messages and selected sources. Case setting, live opponents, and final evaluation must stay focused on material legal issues, evidence, verified authority, inference, procedure, and remedies; reject fabricated unrelated Boolean/search/computer-support narratives. No user secret or provider key is placed in the frontend.


## Requested admin and reliability improvements

- Keep the existing React/TypeScript SPA, Supabase repository boundary, and editorial Group 13 dashboard design.
- Extend the current server-verified administrator identity to additional verified accounts. Preserve the original primary administrator as the only account that can grant or revoke admin roles; all admins may use the existing admin dashboard and timetable controls.
- Let admins directly update and edit existing shared timetable lessons and revise saved proposals. Preserve RLS authorization and ensure older proposals can be edited without losing their history.
- Normalize configured AI fallback chains so duplicate provider/model entries do not cause repeated futile calls. Use one key per model attempt, rotate to the next configured key slot on subsequent models for the same provider, cap ordinary provider calls at eight seconds and allow a longer but bounded timeout for large document analysis. On terminal failure, immediately send the same request to the next route and retain actionable, non-secret diagnostics.


## Exam paper review persistence

- Keep exam-review data behind the existing typed Supabase repository; save only a successful review result and its paper title, source-document reference, and the student's supplied answers.
- Store each review in an owner-scoped table with row-level security; never add it to the shared Library automatically.
- Automatically save after AI completion, expose recent saved reviews for reopening, and retain a failed-to-save result in account-keyed tab storage with an idempotent retry instead of claiming it was saved.
- Give paper analysis its own document-wide retrieval path for exactly one selected source, include every indexed section up to 24 chunks, and reject larger papers with a clear split-and-retry message instead of silently sampling. Keep 10,000-character papers intact, preserve student answers up to the visible 17,000-character limit without truncation, and apply a longer bounded provider timeout to these requests.


## Research-backed notes review
- **Product outcome:** add `/review`, where a signed-in law student can paste or upload transcribed/typed notes, run an intensive Kenyan-law review, see spelling/meaning/case/citation corrections, edit the corrected notes, save private review history, and explicitly publish a corrected Markdown note to the shared Library.
- **Accuracy design:** do not promise 100% correctness. AI proposes neutral research queries; the server-backed `kenya-law-search` service discovers Kenya Law links and opens official judgment/legislation pages. A source is labelled verified only when an official document was readable; search-result metadata alone is not proof of a case holding. The review must expose not-found/not-checked and unresolved items, link every legal correction to source records where possible, and preserve original input.
- **AI and limits:** use the current AI fallback chain, no new paid provider. Phase the work into bounded research planning and source-based review; include every indexed chunk up to 24, reject larger notes rather than silently sampling, and review the source in bounded passages when needed. Keep provider and output failures visible, never silently replace the notes.
- **Transcript integration:** from generated transcript notes, let the student open Review with those notes prefilled or rerun note generation from the generated/edited notes rather than the original recording transcript. Keep original transcript and generated notes distinct.
- **Data/security:** store saved reviews in an owner-scoped Supabase table with RLS. Library publishing is optional, uses the existing materials repository and upload/indexing path, and must only publish the final corrected version after a user action.
- **Project structure:** `src/NotesReviewPage.tsx` provides upload/review/history/edit/share UI; `src/lib/notesReview.ts` normalizes AI output and safe official-source records; `src/TranscriptAI.tsx` provides the notes handoff/rerun; `src/App.tsx` wires `/review` and library publishing; `supabase/functions/ai/{index.ts,prompts.ts}` adds bounded research-plan/review features; `supabase/migrations/*_notes_reviews.sql` enforces private history; `public/manus-routes.json` declares the new route.
- Research reference: `docs/notes-review-research.md` records why source-grounded analysis and official Kenya Law verification are preferred over unverified general web answers.
