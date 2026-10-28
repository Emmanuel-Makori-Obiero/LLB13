-- Reset metadata that came from archive folder/date labels instead of paper contents.
update public.materials
set unit = 'Unclassified',
    course_code = null,
    organization_status = 'pending',
    organization_error = null,
    organized_at = null
where archive_path is not null
  and (
    unit ~* '^(jan|january|april|may|aug|august|sept|september|dec|december)[ _-]*20[0-9]{2}$'
    or course_code ~* '^(jan|january|april|may|aug|august|sept|september|dec|december)[ _-]*20[0-9]{2}$'
  );
