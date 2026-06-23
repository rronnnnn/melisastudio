# Manicure/Pedicure Multi-Step Flow + Duration-Aware Time Blocking

**Date:** 2026-06-24
**Project:** Studio Melisa booking site (`melisastudio/index.html`)
**Status:** Approved design — ready for implementation plan

## Summary

Two coupled changes to the single-file booking app:

1. **Multi-step service form** for Manicure and Pedicure: insert a nail-type / service-type / style sequence between the contact form and the calendar. The chosen style determines the appointment duration (60 or 90 min).
2. **Duration-aware time blocking** across all four services: a booking blocks its entire `[start, start + duration)` window so no overlapping booking can be made, with conflict checks scoped to the worker who owns the service.

All work is in `index.html` plus one tracked Supabase migration. The `send-booking-email` edge function is **not** changed.

## Constraints / non-goals

- No new colors, fonts, or components. Reuse existing CSS classes (`.opt`, `.box`, `.dot`, `.bar`, `.slot`, etc.).
- Match the existing vanilla-JS, single-file structure. No build step, no framework.
- Keep the existing pending/approved slot coloring semantics.
- Do not refactor unrelated code.

## 1. Database migration (apply via Supabase `apply_migration`)

Project ref: `dnhtvflvjxcdzkqpuhwh`. Currently **0 tracked migrations** (schema was built in the dashboard) and **10 existing rows** in `bookings`. RLS is enabled.

Add three nullable columns and backfill existing rows by service:

```sql
alter table public.bookings
  add column if not exists nail_type        text,
  add column if not exists service_type      text,
  add column if not exists duration_minutes  integer;

update public.bookings set duration_minutes = 15
  where service = 'eyebrows' and duration_minutes is null;
update public.bookings set duration_minutes = 120
  where service = 'lipblush' and duration_minutes is null;
update public.bookings set duration_minutes = 60
  where service in ('manicure','pedicure') and duration_minutes is null;
```

Columns are nullable, so the existing anon `insert` continues to work unchanged. After applying, verify columns exist and the 10 rows are backfilled (no null `duration_minutes`).

## 2. Sequence-driven modal steps

Replace the hardcoded numeric steps (1–5) with a **sequence array** computed from the current service. Each step is a DOM block keyed by a string (`data-stepkey`). Navigation, validation, and the progress dots all derive from the sequence.

### Step sequences

- **Manicure & Pedicure:**
  `['contact', 'nailtype', 'servicetype', 'style', 'date', 'time', 'review']`
  - `servicetype` is **omitted from the sequence when `nailType === 'Natural'`**. The sequence is recomputed from state, so picking Natural (or switching away from it) and using Back both behave correctly.
- **Eyebrows & Lip Blush:**
  `['contact', 'date', 'time', 'options', 'review']` (current behavior, unchanged questions)

### New step blocks (reuse existing styling)

- **Nail type** — question "What type of nails do you have?", single-select: Natural / Gel / Acrylic → `state.nailType`.
- **Service type** — question "What service do you need?", single-select: Refill / New Set (artificial tips) → `state.serviceType`.
- **Style** — question "Choose your style", single-select: One Color (60 Min) / Design (90 Min) → `state.style` and `state.duration` (60 or 90).

These reuse the existing `.opt` / `.box` markup but behave as **single-select**: choosing one option clears the others (add a `buildSingleSelect(containerId, options, onPick)` helper). Visuals (checkmark box, `.on` state) are identical to the current multi-select options step.

### Progress dots

Render `.dot` + `.bar` elements dynamically from the active sequence length in `openBooking` (and on Natural toggle, since the count changes). Highlight active/done exactly as today.

### Navigation & validation

- State tracks the current step by key (e.g. `state.stepKey`) instead of a fixed number.
- `next()` validates the current step, then advances to the next key in the freshly computed sequence:
  - `contact`: existing `validateStep1`
  - `nailtype`: `state.nailType` set
  - `servicetype`: `state.serviceType` set
  - `style`: `state.style` set (duration assigned)
  - `date`: `state.date` set
  - `time`: `state.time` set
  - `options`: `state.opts.length > 0`
- `back` moves to the previous key in the sequence.
- Entering `time` triggers `loadAndRenderSlots()`. Entering `review` triggers `renderSummary()`.
- Duration is always known before `time`: mani/pedi set it on the `style` step; eyebrows/lipblush use a fixed service default.

### State additions

`state` gains `nailType`, `serviceType`, `style`, `duration`. Reset in `openBooking`. For mani/pedi the generic `opts` array is unused.

## 3. Duration-aware time blocking (all services)

### Service durations

- Eyebrows — 15 min (fixed)
- Lip Blush — 120 min (fixed)
- Manicure / Pedicure — 60 (One Color) or 90 (Design), dynamic from style step

Store a default duration per service in the `SERVICES` config so eyebrows/lipblush and the conflict fallback have a source of truth.

### Slot generation

- **Generate candidate start times every 15 minutes for every service** (currently 30 for mani/pedi/lip, 15 for eyebrows). This is required so 15-min Eyebrows slots aren't lost and all services align to a common grid.
- A candidate slot at minute `S` is only shown when `S + duration <= CLOSE_MIN` (20:00). Otherwise it is not offered.
- `today` cutoff (past times disabled) is preserved.

### Worker grouping — REQUIRED, do not miss

The conflict query **must filter by worker before running the overlap check.**

- **Melisa's services** (`SHARED_WORKER_SERVICES = ['manicure', 'eyebrows', 'lipblush']`) share one calendar and **cross-block each other**.
- **Pedicure is a separate worker.** It must **not** block, and must **not** be blocked by, Melisa's services. A Pedicure booking only conflicts with other Pedicure bookings.

Concretely: when loading slots, if the service being booked is in `SHARED_WORKER_SERVICES`, fetch bookings where `service IN ('manicure','eyebrows','lipblush')`; if booking Pedicure, fetch only `service = 'pedicure'`. (This preserves the existing `servicesToCheck` logic.) The overlap check runs **only against that filtered set**.

### Query change

The slots query selects `time, status, service, duration_minutes` for the selected `date`, filtered by `servicesToCheck` and `status IN ('pending','approved')`.

### Conflict / overlap test

Parse each booking `time` ("HH:MM") to minutes (`Bstart`) and read its `duration_minutes` (`Bdur`; if null, fall back to the service default). For a candidate slot start `S` with the new booking's duration `D`:

```
overlaps = Bstart < S + D  &&  Bstart + Bdur > S
```

Per candidate slot, across the filtered booking set:

- Overlaps an **approved** booking → slot **disabled** (taken, grey — existing disabled style).
- Else overlaps only a **pending** booking → slot **pending** (orange `.pending`, disabled, reserved — existing style; show the legend).
- Else → **available** (selectable).

### Verification cases (must all hold)

- Manicure 13:00 × 60 → 13:00 blocked, 14:00 available.
- Lip Blush 13:00 × 120 → 13:00–14:59 blocked, 15:00 available.
- Eyebrows 13:00 × 15 → only 13:00 blocked, 13:15 available.
- Cross-service (same worker): Manicure 13:00 × 90 → Lip Blush attempt at 14:00 same day is blocked.
- Cross-worker isolation: a Pedicure booking does **not** block any Manicure/Eyebrows/Lip Blush slot, and vice versa.

## 4. Submit + review + admin

### Submit (`confirmBtn`)

`bookingData` gains:

- `nail_type`: `state.nailType` for mani/pedi, else `null`.
- `service_type`: `state.serviceType` for mani/pedi (null when Natural), else `null`.
- `duration_minutes`: `state.duration` for mani/pedi; fixed `15` (eyebrows) / `120` (lipblush), hardcoded at submission time.

For Manicure/Pedicure, compose the existing `options` text column from the selections, e.g. `"Gel · New Set · Design (90 min)"` (omit service type when Natural), so the admin card and WhatsApp message read naturally without special-casing. Eyebrows/Lip Blush keep composing `options` from the generic multi-select as today.

### Review screen

For mani/pedi, summary rows show: Service, Name, Phone, Email, Date, Time, Nail Type, Service Type (only when set), Style, Duration. Eyebrows/Lip Blush summary unchanged.

### Admin card

Add a duration item to the booking-meta line (e.g. `⏱ 90 min`) using `b.duration_minutes` when present. No other admin changes; the composed `options` string already carries the mani/pedi detail.

## Files touched

- `index.html` — HTML step blocks, dynamic dots, sequence navigation, single-select helper, slot generation (15-min grid + duration fit), overlap conflict logic, query column, submit payload, summary rows, admin meta line.
- Supabase migration — applied via `apply_migration` to project `dnhtvflvjxcdzkqpuhwh`.

## Out of scope

- Edge function / email template changes.
- Pedicure worker reassignment (stays a separate worker).
- Any change to Eyebrows / Lip Blush questions (only their duration blocking and 15-min grid change).
