-- Admin login through Supabase Auth + push notifications for new bookings.
--
-- Before running this, create the two Vault secrets the trigger reads
-- (values are NOT in this file):
--   select vault.create_secret('https://dnhtvflvjxcdzkqpuhwh.supabase.co/functions/v1/send-booking-push', 'booking_push_url');
--   select vault.create_secret('<PUSH_WEBHOOK_SECRET>', 'booking_push_secret');


-- 1. Signed-in admin = role "authenticated", which has no policies yet: every
--    policy so far is TO anon. Mirror them exactly so the panel keeps working
--    after login. Anon policies are left untouched; both get tightened in the
--    RLS lockdown.

create policy "Authenticated can read" on public.bookings
  for select to authenticated using (true);
create policy "Authenticated can insert" on public.bookings
  for insert to authenticated with check (true);
create policy "Authenticated can update" on public.bookings
  for update to authenticated using (true);
create policy "Authenticated can delete" on public.bookings
  for delete to authenticated using (true);

create policy "Authenticated can read blocked days" on public.blocked_days
  for select to authenticated using (true);
create policy "Authenticated can insert blocked days" on public.blocked_days
  for insert to authenticated with check (true);
create policy "Authenticated can delete blocked days" on public.blocked_days
  for delete to authenticated using (true);

create policy "Authenticated can read blocked hours" on public.blocked_hours
  for select to authenticated using (true);
create policy "Authenticated can insert blocked hours" on public.blocked_hours
  for insert to authenticated with check (true);
create policy "Authenticated can delete blocked hours" on public.blocked_hours
  for delete to authenticated using (true);


-- 2. Push subscriptions, one row per device that enabled notifications.

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text not null unique,
  keys       jsonb not null,
  admin_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

revoke all on public.push_subscriptions from anon;
revoke all on public.push_subscriptions from authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;
-- send-booking-push reads every subscription and prunes dead ones (bypasses RLS).
grant select, delete on public.push_subscriptions to service_role;

create policy "Admins read own subscriptions" on public.push_subscriptions
  for select to authenticated using (admin_id = (select auth.uid()));
create policy "Admins add own subscriptions" on public.push_subscriptions
  for insert to authenticated with check (admin_id = (select auth.uid()));
create policy "Admins remove own subscriptions" on public.push_subscriptions
  for delete to authenticated using (admin_id = (select auth.uid()));


-- 3. New booking → pg_net → send-booking-push edge function.

create extension if not exists pg_net;

create or replace function public.notify_booking_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  fn_secret text;
begin
  select decrypted_secret into fn_url
    from vault.decrypted_secrets where name = 'booking_push_url';
  select decrypted_secret into fn_secret
    from vault.decrypted_secrets where name = 'booking_push_secret';
  if fn_url is null or fn_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', fn_secret
    ),
    body    := jsonb_build_object('record', jsonb_build_object(
      'id', new.id,
      'service', new.service,
      'nail_type', new.nail_type,
      'date', new.date,
      'time', new.time,
      'channel', new.channel
    )),
    -- edge function cold start + npm import can exceed pg_net's 5s default
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  -- A notification problem must never block a booking.
  raise warning 'notify_booking_push failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_booking_push() from public, anon, authenticated;

drop trigger if exists bookings_push_on_insert on public.bookings;
create trigger bookings_push_on_insert
  after insert on public.bookings
  for each row execute function public.notify_booking_push();
