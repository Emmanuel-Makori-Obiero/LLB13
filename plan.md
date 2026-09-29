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
Run `supabase/schema.sql` in the Supabase SQL Editor. The current browser read policies are intentionally open for the first slice; add authentication and tighten policies before using real private student data. Realtime can later target `discussions`, discussion notes, and notifications.

## Verification
- Run `npm run check`.
- Run `npm run build`.
- Request `/manus-routes.json` and confirm the app serves on port 3000.
