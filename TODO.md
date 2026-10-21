# TODO

## Multi-admin access and secure account management
- The original verified primary administrator can grant and revoke administrator access for existing verified registered accounts from the Admin dashboard.
- Newly designated administrators are recognized by the application and server-side authorization checks, can use the existing admin dashboard, and can create, update and delete shared timetable lessons and proposals.
- Non-primary administrators cannot grant or revoke admin roles, delete the primary admin, or delete another admin account; the primary admin cannot accidentally remove their own primary role.
- Role status is visible beside each registered account, and account removal does not delete files before an authorization rejection.

## Shared timetable editing and history
- Administrators can update existing shared timetable lessons and revise saved timetable proposals using the existing admin workflow.
- An earlier saved proposal remains in history when edited; the revised draft is separately reviewable and only changes the live timetable after approval.
- Routine new/current timetable proposals continue rejecting invalid weekend dates and accidental past schedules; an explicitly historical proposal can be edited intentionally.

## AI timetable proposer fallback reliability
- Default and environment-configured fallback chains remove duplicate entries before calls while preserving intentional alternative API keys.
- The `exam_analysis` feature makes one bounded attempt per model; a failure, 400/429, network error or timeout immediately advances to the next model with the same request. Rotate to the next configured key slot on the next route for that provider, without retrying the same model or sibling keys. Use an eight-second cap for ordinary prompts and a longer bounded cap for large document analyses.
- Keep currently supported Gemini, Groq, and OpenRouter model IDs, remove model routes that return confirmed 404s, and preserve useful provider/model/status diagnostics when all fallbacks fail.
- Try configured independent-provider fallbacks before slower routes; each request starts at the newest numbered key slot (such as `GEMINI_API_KEY_7`) and rotates through older slots only as later models are attempted. Diagnostics identify missing key names and the exact attempted slot without exposing values.


## Exam-analysis persistence
- Every successful question-by-question exam analysis is saved automatically to the requesting user's private history with paper title, source-document reference, supplied answers, result and timestamp.
- Users can reopen prior saved analyses after navigating away or refreshing; records remain owner-scoped with database-enforced RLS.
- A failed save leaves the generated analysis visible, reports that it was not saved, restores an account-keyed tab draft after navigation or refresh, warns on page exit, and provides an idempotent retry; the UI never shows success until Supabase confirms.
- No exam paper or analysis is silently copied into the shared Library. Run typecheck, all tests and production build; verify the live table, grants and owner policy without mutating real analysis data.
- Exam analysis uses document-wide retrieval for exactly one selected paper instead of embedding the full paper twice in one request; it includes every indexed chunk up to the explicit 24-chunk cap and rejects larger papers rather than silently sampling. Submitted answers are preserved up to the visible 17,000-character limit; a 10,000-character paper receives the longer bounded timeout.
