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
- A model/route failure that will repeat for the same model is skipped for the rest of that request; quota failures can still try alternate keys and models.
- Keep currently documented Gemini, Groq, and OpenRouter model IDs and preserve useful provider/model/status diagnostics when all fallbacks fail.
