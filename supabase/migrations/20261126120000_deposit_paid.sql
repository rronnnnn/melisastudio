-- Deposit paid yes/no, set by the admin from the booking cards.
-- Adds one column; every existing booking starts as "not paid".
-- Admins already have UPDATE on bookings ("Admins can update" policy),
-- and anon has no direct access, so no policy or grant changes are needed.

alter table public.bookings
  add column if not exists deposit_paid boolean not null default false;
