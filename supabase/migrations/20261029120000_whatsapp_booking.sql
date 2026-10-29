-- WhatsApp booking channel.
-- Additive only: existing rows keep working (channel defaults to 'email', no code,
-- never messaged). Old phone values are left exactly as typed; the app normalizes
-- them when it builds a wa.me link.

alter table public.bookings
  add column if not exists channel text not null default 'email',
  add column if not exists booking_code text,
  add column if not exists whatsapp_last_sent_at timestamptz;

alter table public.bookings
  drop constraint if exists bookings_channel_check;
alter table public.bookings
  add constraint bookings_channel_check check (channel in ('email', 'whatsapp'));

-- booking_code: UNUSED. Planned as a short code (SM-X7K2) to match WhatsApp chats, then
-- dropped from the app before launch. Nothing reads or writes it; safe to drop later with
--   drop index if exists bookings_booking_code_key;
--   alter table public.bookings drop column if exists booking_code;
create unique index if not exists bookings_booking_code_key
  on public.bookings (booking_code);

-- Email is optional for WhatsApp bookings.
alter table public.bookings
  alter column email drop not null;
