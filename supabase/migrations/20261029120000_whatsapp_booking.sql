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

-- Short code (e.g. SM-X7K2) the client sends on WhatsApp so Melisa can match the chat.
-- Unique when present; old rows have none.
create unique index if not exists bookings_booking_code_key
  on public.bookings (booking_code);

-- Email is optional for WhatsApp bookings.
alter table public.bookings
  alter column email drop not null;
