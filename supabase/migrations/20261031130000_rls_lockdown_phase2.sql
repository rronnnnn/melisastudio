-- RLS lockdown, phase 2 of 2. Run only after the new frontend is live and
-- send-booking-email has ALLOW_LEGACY_EMAIL turned off.
--
-- From here the public key can: call get_availability, create_booking,
-- get_booking_by_token, cancel_booking; read blocked_days / blocked_hours.
-- Nothing else. Admins (app_metadata.admin_role) keep their phase-1 policies.
--
-- Touches no existing rows: only policies and grants.

-- bookings: anon loses all direct access (reads, inserts, updates, deletes)
drop policy if exists "Public can read"          on public.bookings;
drop policy if exists "Public can insert"        on public.bookings;
drop policy if exists "Public can update status" on public.bookings;
drop policy if exists "bookings_cancel_by_token" on public.bookings;
revoke all on public.bookings from anon;

-- blocked days / hours: anon keeps read, loses write
drop policy if exists "Public can insert blocked days" on public.blocked_days;
drop policy if exists "Public can delete blocked days" on public.blocked_days;
drop policy if exists "Public can insert blocked hours" on public.blocked_hours;
drop policy if exists "Public can delete blocked hours" on public.blocked_hours;
revoke all on public.blocked_days, public.blocked_hours from anon;
grant select on public.blocked_days, public.blocked_hours to anon;

-- signed-in users: nothing beyond what the admin policies use
revoke truncate, references, trigger on public.bookings, public.blocked_days, public.blocked_hours
  from authenticated;
revoke update on public.blocked_days, public.blocked_hours from authenticated;
