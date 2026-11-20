

## Law Reels feature

### Product and design
Create an Android-first, authenticated vertical video feed for law students. The feed uses a full-height snap-scrolling stage with one video per viewport, muted autoplay when visible, pause/play, mute/unmute, progress, captions, topic labels, and previous/next controls. Reuse the hub's forest, oxblood, cream, and moss palette: focused, editorial, and low-distraction rather than a generic social-media clone.

The administrator gets a management panel inside Admin with upload fields for video, title, caption, topic, optional cover image, order, and visibility. Videos use the existing `media` bucket and signed URLs; only super administrators can create, update, publish, or delete feed items.

### Implementation
- Add a `law_reels` migration with metadata, ordering, visibility, timestamps, indexes, RLS, grants, and storage policies.
- Add `LawReel` shared type and repository methods for student listing, admin listing, upload, update, and deletion.
- Add `/reels` route and navigation entry. Load signed video/cover URLs and use IntersectionObserver to control playback.
- Add `AdminLawReels` to the authenticated admin dashboard.
- Update the public feature catalog and route manifest.
- Validate with `npm run build` and `git diff --check`, then commit and push to `origin/main`.

### Project structure
`src/LawReelsPage.tsx` owns the student feed; `src/AdminLawReels.tsx` owns admin upload and management; `src/data/types.ts` and `src/data/repository.ts` own the data contract; `supabase/migrations/` owns database and RLS; `src/law-reels.css` owns responsive feed styling.
