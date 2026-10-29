# Career page feed diagnosis

Checked on 2026-10-29: the public source used by the app, [Opportunities for Youth RSS](https://opportunitiesforyouth.org/feed/), responded to a fresh fetch and contained RSS item content. The deployed Career page route is part of the signed-in app, so its Supabase Edge Function response could not be independently reproduced without the user's authenticated session or project deployment credentials.

The app's `career-opportunities` Edge Function returns structured JSON for upstream feed failures (including an upstream HTTP status), but the React page previously surfaced only Supabase's generic `Edge Function returned a non-2xx status code` message. The fix parses the JSON response body and retains a validated last-successful feed in browser storage so a temporary upstream failure does not blank an already loaded page.
