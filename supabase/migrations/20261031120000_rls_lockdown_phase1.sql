-- RLS lockdown, phase 1 of 2 (additive).
-- New RPCs for the public site, admin-only policies for signed-in users.
-- Anon keeps every current policy until phase 2, so the live site keeps working
-- while the new frontend and send-booking-email roll out.
--
-- Touches no existing rows: only functions, policies and grants.
--
-- Before running, add the two Vault secrets the email queue reads:
--   select vault.create_secret('https://dnhtvflvjxcdzkqpuhwh.supabase.co/functions/v1/send-booking-email', 'booking_email_url');
--   select vault.create_secret('<EMAIL_WEBHOOK_SECRET>', 'booking_email_secret');


-- ============================================================
-- 1. Signed-in users: admins only (app_metadata.admin_role).
--    Replaces the "any signed-in user" policies from 20261030120000.
-- ============================================================

drop policy if exists "Authenticated can read"   on public.bookings;
drop policy if exists "Authenticated can insert" on public.bookings;
drop policy if exists "Authenticated can update" on public.bookings;
drop policy if exists "Authenticated can delete" on public.bookings;
drop policy if exists "Authenticated can read blocked days"   on public.blocked_days;
drop policy if exists "Authenticated can insert blocked days" on public.blocked_days;
drop policy if exists "Authenticated can delete blocked days" on public.blocked_days;
drop policy if exists "Authenticated can read blocked hours"   on public.blocked_hours;
drop policy if exists "Authenticated can insert blocked hours" on public.blocked_hours;
drop policy if exists "Authenticated can delete blocked hours" on public.blocked_hours;

create policy "Admins can read" on public.bookings
  for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'admin_role') in ('main', 'pedicure'));
create policy "Admins can insert" on public.bookings
  for insert to authenticated
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'admin_role') in ('main', 'pedicure'));
create policy "Admins can update" on public.bookings
  for update to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'admin_role') in ('main', 'pedicure'));
create policy "Admins can delete" on public.bookings
  for delete to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'admin_role') in ('main', 'pedicure'));

-- Everyone can read blocks (the public calendar needs them); only admins write.
create policy "Signed-in can read blocked days" on public.blocked_days
  for select to authenticated using (true);
create policy "Admins can insert blocked days" on public.blocked_days
  for insert to authenticated
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'admin_role') in ('main', 'pedicure'));
create policy "Admins can delete blocked days" on public.blocked_days
  for delete to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'admin_role') in ('main', 'pedicure'));

create policy "Signed-in can read blocked hours" on public.blocked_hours
  for select to authenticated using (true);
create policy "Admins can insert blocked hours" on public.blocked_hours
  for insert to authenticated
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'admin_role') in ('main', 'pedicure'));
create policy "Admins can delete blocked hours" on public.blocked_hours
  for delete to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'admin_role') in ('main', 'pedicure'));


-- ============================================================
-- 2. Internal helpers (not callable through the API)
-- ============================================================

-- Same rules as normalizePhone() in index.html (default country 389): returns
-- international digits. Used to compare new phones with old rows saved as typed.
create or replace function public._normalize_phone(raw text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  s text := btrim(coalesce(raw, ''));
  d text := regexp_replace(s, '\D', '', 'g');
begin
  if d = '' then return ''; end if;
  if left(s, 1) = '+' then return d; end if;
  if left(d, 2) = '00' then return substr(d, 3); end if;
  -- typed with 389 but without + ("38970123456"): MK numbers have 8 digits after it
  if left(d, 3) = '389' and length(d) - 3 = 8 then return d; end if;
  return '389' || regexp_replace(d, '^0+', '');
end;
$$;

-- 'HH:MM' -> minutes since midnight
create or replace function public._to_min(hhmm text)
returns int
language sql
immutable
set search_path = ''
as $$ select split_part(hhmm, ':', 1)::int * 60 + split_part(hhmm, ':', 2)::int $$;

-- Queue a call to send-booking-email (runs after commit; never blocks the caller).
create or replace function public._queue_booking_email(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  fn_secret text;
begin
  select decrypted_secret into fn_url
    from vault.decrypted_secrets where name = 'booking_email_url';
  select decrypted_secret into fn_secret
    from vault.decrypted_secrets where name = 'booking_email_secret';
  if fn_url is null or fn_secret is null then
    raise warning '_queue_booking_email: vault secrets missing, email skipped';
    return;
  end if;
  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', fn_secret),
    body    := payload,
    timeout_milliseconds := 10000
  );
exception when others then
  raise warning '_queue_booking_email failed: %', sqlerrm;
end;
$$;

revoke all on function public._normalize_phone(text)        from public, anon, authenticated;
revoke all on function public._to_min(text)                 from public, anon, authenticated;
revoke all on function public._queue_booking_email(jsonb)   from public, anon, authenticated;


-- ============================================================
-- 3. get_availability — what slot blocking needs, nothing personal
-- ============================================================

create or replace function public.get_availability(p_from date, p_to date, p_services text[] default null)
returns table (date text, "time" text, status text, service text, duration_minutes int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 93 then
    raise exception 'invalid date range' using errcode = '22023';
  end if;
  return query
    select b.date, b.time, b.status, b.service, b.duration_minutes
    from public.bookings b
    where b.date >= to_char(p_from, 'YYYY-MM-DD')
      and b.date <= to_char(p_to,   'YYYY-MM-DD')
      and b.status in ('pending', 'approved')
      and (p_services is null or b.service = any (p_services))
    order by b.date, b.time, b.service;
end;
$$;


-- ============================================================
-- 4. create_booking — validates, re-checks the slot, limits pending per phone
--    Returns {ok:true,id} or {ok:false,reason[,field]}.
--    reason: invalid | slot_taken | too_many_pending
-- ============================================================

create or replace function public.create_booking(
  p_service text, p_date text, p_time text, p_name text, p_phone text,
  p_email text, p_options text, p_channel text, p_lang text,
  p_nail_type text, p_service_type text, p_duration_minutes int
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  now_local timestamp := now() at time zone 'Europe/Skopje';
  v_date    date;
  v_start   int;
  v_step    int;
  v_scope   text[];
  v_name    text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_phone   text := public._normalize_phone(p_phone);
  v_email   text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_id      uuid;
begin
  -- ---- input ----
  if p_service is null or p_service not in ('manicure', 'pedicure', 'eyebrows', 'lipblush') then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'field', 'service');
  end if;
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'field', 'date');
  end if;
  begin
    v_date := p_date::date;
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'field', 'date');
  end;
  if v_date < now_local::date or v_date > now_local::date + 730 then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'field', 'date');
  end if;
  -- slot grid, as in the wizard: 08:00–22:00, every 15 min (eyebrows) or 30 min (others)
  if p_time is null or p_time !~ '^([01]\d|2[0-3]):[0-5]\d$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'field', 'time');
  end if;
  v_start := public._to_min(p_time);
  v_step  := case when p_service = 'eyebrows' then 15 else 30 end;
  if v_start < 480 or v_start > 1320 or (v_start - 480) % v_step <> 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'field', 'time');
  end if;
  -- durations the wizard can produce for each service
  if p_duration_minutes is null or not (p_duration_minutes = any (case p_service
       when 'manicure' then array[59, 90]
       when 'pedicure' then array[59]
       when 'eyebrows' then array[14, 44]
       when 'lipblush' then array[119] end)) then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'field', 'duration');
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'field', 'name');
  end if;
  if v_phone !~ '^\d{8,15}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'field', 'phone');
  end if;
  if p_channel is null or p_channel not in ('email', 'whatsapp') then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'field', 'channel');
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'field', 'email');
  end if;
  if p_channel = 'email' and v_email is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'field', 'email');
  end if;
  if p_lang is null or p_lang not in ('sq', 'en', 'mk') then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'field', 'lang');
  end if;
  if char_length(coalesce(p_options, '')) > 300
     or char_length(coalesce(p_nail_type, '')) > 100
     or char_length(coalesce(p_service_type, '')) > 100 then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'field', 'options');
  end if;

  -- One booking at a time per day and chair, so two people can't take the same slot.
  perform pg_advisory_xact_lock(hashtext('booking:' || p_date || ':' ||
    case when p_service = 'pedicure' then 'pedicure' else 'main' end));

  -- ---- slot, with the wizard's rules ----
  -- past (today: slots up to now are unavailable)
  if v_date + make_interval(mins => v_start) <= now_local then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end if;
  -- blocked day: pedicure honours only pedicure blocks; others only "all services" (NULL) blocks
  if exists (
    select 1 from public.blocked_days d
    where d.date = p_date
      and (case when p_service = 'pedicure' then d.service = 'pedicure' else d.service is null end)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end if;
  -- blocked hour at the start time: pedicure → pedicure blocks; others → NULL or own service
  if exists (
    select 1 from public.blocked_hours h
    where h.date = v_date and h.time = p_time
      and (case when p_service = 'pedicure' then h.service = 'pedicure'
                else (h.service is null or h.service = p_service) end)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end if;
  -- overlap with any pending or approved booking of the same chair
  -- (manicure, eyebrows and lip blush share Melisa; pedicure is separate)
  v_scope := case when p_service = 'pedicure' then array['pedicure']
                  else array['manicure', 'eyebrows', 'lipblush'] end;
  if exists (
    select 1 from public.bookings b
    where b.date = p_date
      and b.service = any (v_scope)
      and b.status in ('pending', 'approved')
      and b.time ~ '^\d{1,2}:\d{2}$'
      and public._to_min(b.time) < v_start + p_duration_minutes
      and public._to_min(b.time) + coalesce(nullif(b.duration_minutes, 0),
            case b.service when 'manicure' then 59 when 'pedicure' then 59
                           when 'eyebrows' then 15 when 'lipblush' then 119 else 60 end) > v_start
  ) then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end if;

  -- ---- at most 3 upcoming pending bookings per phone ----
  if (
    select count(*) from public.bookings b
    where b.status = 'pending'
      and b.date >= to_char(now_local::date, 'YYYY-MM-DD')
      and public._normalize_phone(b.phone) = v_phone
  ) >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_pending');
  end if;

  insert into public.bookings
    (service, date, time, name, phone, email, options, status, channel, lang,
     nail_type, service_type, duration_minutes)
  values
    (p_service, p_date, p_time, v_name, v_phone, v_email, nullif(p_options, ''), 'pending', p_channel, p_lang,
     nullif(p_nail_type, ''), nullif(p_service_type, ''), p_duration_minutes)
  returning id into v_id;

  -- studio "new request" email (+ customer "awaiting confirmation" for email bookings)
  perform public._queue_booking_email(jsonb_build_object('event', 'new_booking', 'id', v_id));

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;


-- ============================================================
-- 5. Customer cancel link (?cancel=<token>)
-- ============================================================

-- Details for the cancel page. NULL when the token doesn't match a pending or
-- approved booking. can_cancel = more than 24 hours to go (what the email promises).
create or replace function public.get_booking_by_token(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', b.name, 'service', b.service, 'date', b.date, 'time', b.time,
    'can_cancel', (b.date::date + make_interval(mins => public._to_min(b.time)))
                  - (now() at time zone 'Europe/Skopje') >= interval '24 hours'
  )
  from public.bookings b
  where p_token is not null and b.cancel_token = p_token and b.status in ('pending', 'approved')
$$;

-- Cancels (deletes, as before) the one booking with this token.
-- Returns {ok:true} or {ok:false, reason: not_found | too_late}.
create or replace function public.cancel_booking(p_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
begin
  if p_token is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select * into b from public.bookings
    where cancel_token = p_token and status in ('pending', 'approved')
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if (b.date::date + make_interval(mins => public._to_min(b.time)))
     - (now() at time zone 'Europe/Skopje') < interval '24 hours' then
    return jsonb_build_object('ok', false, 'reason', 'too_late');
  end if;

  delete from public.bookings where id = b.id;

  -- the row is gone, so the studio notice carries the details
  perform public._queue_booking_email(jsonb_build_object(
    'event', 'client_cancelled',
    'booking', jsonb_build_object('name', b.name, 'service', b.service, 'date', b.date,
                                  'time', b.time, 'phone', b.phone, 'channel', b.channel)
  ));
  return jsonb_build_object('ok', true);
end;
$$;


-- ============================================================
-- 6. Who can call what
-- ============================================================

revoke all on function public.get_availability(date, date, text[]) from public, anon, authenticated;
revoke all on function public.create_booking(text, text, text, text, text, text, text, text, text, text, text, int)
  from public, anon, authenticated;
revoke all on function public.get_booking_by_token(uuid) from public, anon, authenticated;
revoke all on function public.cancel_booking(uuid)       from public, anon, authenticated;

grant execute on function public.get_availability(date, date, text[]) to anon, authenticated;
grant execute on function public.create_booking(text, text, text, text, text, text, text, text, text, text, text, int)
  to anon, authenticated;
grant execute on function public.get_booking_by_token(uuid) to anon, authenticated;
grant execute on function public.cancel_booking(uuid)       to anon, authenticated;
