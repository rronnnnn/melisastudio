# Studio Melisa — Booking Platform

A production booking system built for Studio Melisa, a nail salon in North Macedonia.

**Live:** [studiomelisa.com](https://studiomelisa.com)

## About

Salons in the region take bookings over Instagram DMs and phone calls. That works until two practitioners are working different services at overlapping times and someone double-books a chair. This replaces that with a self-service booking flow customers can use at any hour, and an admin panel the salon actually runs its day from.

Built and maintained end to end — data model, interface, email delivery and deployment.

## Features

**For customers**

- Multi-step booking wizard: service → practitioner → date → time → details
- Duration-aware slot generation, so a 90-minute service only offers slots with 90 minutes genuinely free
- Confirmation email on booking

**For the salon**

- Admin panel with per-practitioner separation, so each worker sees and manages her own schedule
- Blocked hours and blocked days, scoped per service — a practitioner can be unavailable for one service while still bookable for another
- Email notifications routed to the right admin depending on which practitioner was booked
- Full booking overview with status management

## Stack

| | |
|---|---|
| Front end | Vanilla JavaScript, single-page HTML, custom SVG icon set |
| Database & auth | Supabase (PostgreSQL) |
| Server logic | Supabase Edge Functions |
| Email | Resend |
| Hosting | Vercel |

No framework. The whole customer-facing app is one HTML file, which keeps first paint fast on the mobile connections most customers book from.

## Architecture notes

**Slot generation.** Availability isn't a fixed grid. Slots are computed against service duration, existing bookings, working hours and any blocks applying to that practitioner and service, so the times offered are always genuinely bookable.

**Email routing.** Notifications go out through Supabase Edge Functions rather than the client, which keeps the Resend API key server-side. Recipients resolve per practitioner via function secrets.

**Access control.** Customer-facing reads and writes run through row-level security policies; admin operations are authenticated separately.

## Running locally

```bash
git clone <this-repo>
cd <this-repo>
```

Serve the directory with any static server:

```bash
npx serve .
```

Supabase URL and anon key are configured in the app's config block. Edge Function secrets — the Resend key and admin recipient addresses — are set in the Supabase dashboard, never in this repository.

## Status

Live and in daily production use since 2025. Built and maintained by [Rron Tuda](https://github.com/rronnnnn) under [High Level](https://www.highlevel.mk).

## Contact

mkhighlevel@gmail.com
