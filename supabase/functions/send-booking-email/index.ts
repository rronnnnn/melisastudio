import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const STUDIO_EMAIL = Deno.env.get("STUDIO_EMAIL") ?? "onboarding@resend.dev";
const PEDICURE_EMAIL = Deno.env.get("PEDICURE_EMAIL") ?? "";

type Lang = "sq" | "en" | "mk";
const LANGS = ["sq", "en", "mk"];
const LOCALES: Record<Lang, string> = { sq: "sq-AL", en: "en-GB", mk: "mk-MK" };

const SERVICE_NAMES: Record<Lang, Record<string, string>> = {
  sq: { manicure: "Manikyr", pedicure: "Pedikyr", eyebrows: "Vetullat", lipblush: "Lip Blush" },
  en: { manicure: "Manicure", pedicure: "Pedicure", eyebrows: "Eyebrows", lipblush: "Lip Blush" },
  mk: { manicure: "Маникир", pedicure: "Педикир", eyebrows: "Веѓи", lipblush: "Lip Blush" },
};

// "2026-10-05" -> localized long date. Anything else (already formatted) passes through.
function formatDate(d: string, lang: Lang): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  try {
    return new Date(d + "T12:00:00Z").toLocaleDateString(LOCALES[lang], {
      // Albanian copy reads "më <date>", so skip the weekday there.
      ...(lang === "sq" ? {} : { weekday: "long" as const }),
      day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
    });
  } catch {
    return d;
  }
}

type Ctx = { name: string; svc: string; date: string; time: string; cancelUrl: string };
type Copy = {
  hi: string; service: string; dateL: string; timeL: string; bye: string;
  approved: { subject: string; intro: string; statusL: string; status: string; deposit: string; outro: string;
    cancelTitle: string; cancelBody: string; cancelBtn: string; cancelNote: string };
  rejected: { subject: string; body: (c: Ctx) => string; outro: string };
  admin_cancelled: { subject: string; body: (c: Ctx) => string; apology: string; outro: string; sign: string };
  pending_confirmation: { subject: string; headline: string; banner: string; detailsTitle: string;
    statusL: string; status: string; outro: string; sign: string };
};

const COPY: Record<Lang, Copy> = {
  en: {
    hi: "Hi", service: "Service", dateL: "Date", timeL: "Time", bye: "— Studio Melisa",
    approved: {
      subject: "Your booking has been approved! 🌸",
      intro: "Great news, your booking at <strong>Studio Melisa</strong> has been approved! 🌸",
      statusL: "Status", status: "Approved",
      deposit: "⚠️ To confirm your booking, the deposit must be paid at Studio Melisa premises at least 3 days before your appointment. If the deposit is not paid within this period, the booking will be cancelled and the appointment slot will be released for other clients.",
      outro: "If anything changes, just reply to let us know. See you soon! 💕",
      cancelTitle: "Need to cancel? No problem.",
      cancelBody: "If your plans change, you can cancel your appointment by clicking the link below. Please cancel at least 24 hours in advance.",
      cancelBtn: "Cancel my appointment →",
      cancelNote: "Note: this link is for cancellations only. If you'd like to reschedule, please contact us directly.",
    },
    rejected: {
      subject: "Your booking has been declined!",
      body: (c) => `Regarding your booking request at Studio Melisa, unfortunately the slot you chose (${c.date} at ${c.time}) isn't available.`,
      outro: "Please pick another time — we'd be happy to welcome you! 🌸",
    },
    admin_cancelled: {
      subject: "Your booking has been cancelled",
      body: (c) => `We're letting you know that your booking for <strong>${c.svc}</strong>, on <strong>${c.date}</strong>, at <strong>${c.time}</strong>, has been cancelled for personal reasons!`,
      apology: "We apologize for any inconvenience and thank you for your understanding. 🌸",
      outro: `If you'd like to book a new appointment, please visit <a href="https://studiomelisa.com" style="color:#9A7A60;">studiomelisa.com</a> and choose one of the available times.`,
      sign: "Studio Melisa 🌸",
    },
    pending_confirmation: {
      subject: "Your request was sent successfully! 🌸",
      headline: "Your request was sent successfully! 🌸",
      banner: "⏳ Your booking is currently awaiting confirmation.",
      detailsTitle: "Booking details:",
      statusL: "Status", status: "Pending",
      outro: "Please wait for the status update.<br>As soon as your booking is accepted or declined, you'll be notified by email.",
      sign: "Studio Melisa 🌸",
    },
  },
  sq: {
    hi: "Përshëndetje", service: "Shërbimi", dateL: "Data", timeL: "Ora", bye: "— Studio Melisa",
    approved: {
      subject: "Rezervimi juaj është aprovuar! 🌸",
      intro: "Lajme të mira rezervimi juaj në <strong>Studio Melisa</strong> është Aprovuar! 🌸",
      statusL: "Statusi", status: "Aprovuar",
      deposit: "⚠️ Për të konfirmuar rezervimin tuaj, kapari duhet të paguhet në ambientet e Studio Melisa të paktën 3 ditë para terminit. Nëse kapari nuk paguhet brenda këtij afati, rezervimi do të anulohet dhe termini do të lirohet për klientë të tjerë.",
      outro: "Nëse diçka ndryshon, thjesht përgjigjuni te ky email. Shihemi së shpejti! 💕",
      cancelTitle: "Duhet ta anuloni? Nuk ka problem.",
      cancelBody: "Nëse planet tuaja ndryshojnë, mund ta anuloni terminin duke klikuar lidhjen më poshtë. Ju lutemi anuloni të paktën 24 orë përpara.",
      cancelBtn: "Anuloni terminin tim →",
      cancelNote: "Shënim: kjo lidhje është vetëm për anulim. Nëse dëshironi ta zhvendosni terminin, ju lutemi na kontaktoni drejtpërdrejt.",
    },
    rejected: {
      subject: "Termini juaj është refuzuar!",
      body: (c) => `Për kërkesën tuaj për rezervim në Studio Melisa fatkeqësisht, termini që zgjodhët (${c.date} në ${c.time}) nuk është në dispozicion.`,
      outro: "Ju lutemi zgjidhni një termin tjetër, ju mirëpresim! 🌸",
    },
    admin_cancelled: {
      subject: "Rezervimi juaj është anuluar",
      body: (c) => `Ju njoftojmë se rezervimi juaj për <strong>${c.svc}</strong>, më <strong>${c.date}</strong>, në orën <strong>${c.time}</strong>, është anuluar për arsye personale!`,
      apology: "Ju kërkojmë ndjesë për çdo shqetësim të mundshëm dhe ju falënderojmë për mirëkuptimin. 🌸",
      outro: `Nëse dëshironi të rezervoni një termin të ri, ju lutemi vizitoni <a href="https://studiomelisa.com" style="color:#9A7A60;">studiomelisa.com</a> dhe zgjidhni një nga terminet e disponueshme.`,
      sign: "Studio Melisa 🌸",
    },
    pending_confirmation: {
      subject: "Kërkesa juaj u dërgua me sukses! 🌸",
      headline: "Kërkesa juaj u dërgua me sukses! 🌸",
      banner: "⏳ Rezervimi juaj është aktualisht në pritje të konfirmimit.",
      detailsTitle: "Detajet e rezervimit:",
      statusL: "Statusi", status: "Në pritje",
      outro: "Ju lutemi prisni për përditësimin e statusit.<br>Në momentin që rezervimi juaj pranohet ose refuzohet, do të njoftoheni përmes një emaili.",
      sign: "Studio Melisa 🌸",
    },
  },
  mk: {
    hi: "Здраво", service: "Услуга", dateL: "Датум", timeL: "Време", bye: "— Studio Melisa",
    approved: {
      subject: "Вашата резервација е одобрена! 🌸",
      intro: "Одлична вест, вашата резервација во <strong>Studio Melisa</strong> е одобрена! 🌸",
      statusL: "Статус", status: "Одобрена",
      deposit: "⚠️ За да ја потврдите вашата резервација, капарот мора да се плати во просториите на Studio Melisa најмалку 3 дена пред терминот. Доколку капарот не се плати во овој рок, резервацијата ќе биде откажана и терминот ќе биде ослободен за други клиенти.",
      outro: "Ако нешто се промени, само одговорете на оваа порака. Се гледаме наскоро! 💕",
      cancelTitle: "Треба да откажете? Нема проблем.",
      cancelBody: "Ако вашите планови се променат, можете да го откажете терминот со клик на линкот подолу. Ве молиме откажете најмалку 24 часа однапред.",
      cancelBtn: "Откажи го мојот термин →",
      cancelNote: "Напомена: овој линк е само за откажување. Ако сакате да го преместите терминот, ве молиме контактирајте нѐ директно.",
    },
    rejected: {
      subject: "Вашиот термин е одбиен!",
      body: (c) => `За вашето барање за резервација во Studio Melisa, за жал, терминот што го избравте (${c.date} во ${c.time}) не е достапен.`,
      outro: "Ве молиме изберете друг термин, со задоволство ќе ве пречекаме! 🌸",
    },
    admin_cancelled: {
      subject: "Вашата резервација е откажана",
      body: (c) => `Ве известуваме дека вашата резервација за <strong>${c.svc}</strong>, на <strong>${c.date}</strong>, во <strong>${c.time}</strong>, е откажана поради лични причини!`,
      apology: "Се извинуваме за евентуалната непријатност и ви благодариме за разбирањето. 🌸",
      outro: `Ако сакате да резервирате нов термин, ве молиме посетете го <a href="https://studiomelisa.com" style="color:#9A7A60;">studiomelisa.com</a> и изберете еден од достапните термини.`,
      sign: "Studio Melisa 🌸",
    },
    pending_confirmation: {
      subject: "Вашето барање е успешно испратено! 🌸",
      headline: "Вашето барање е успешно испратено! 🌸",
      banner: "⏳ Вашата резервација моментално чека потврда.",
      detailsTitle: "Детали за резервацијата:",
      statusL: "Статус", status: "На чекање",
      outro: "Ве молиме почекајте за ажурирање на статусот.<br>Штом резервацијата биде прифатена или одбиена, ќе добиете мејл.",
      sign: "Studio Melisa 🌸",
    },
  },
};

function customerEmail(lang: Lang, kind: string, c: Ctx): { subject: string; html: string } {
  const L = COPY[lang];
  const wrap = (inner: string) =>
    `<div style="font-family:Arial,sans-serif;color:#5A4636;line-height:1.6;">\n${inner}\n</div>`;
  const hi = `  <p>${L.hi} ${c.name},</p>`;

  if (kind === "approved") {
    const A = L.approved;
    // Cancellation section — only included when we actually have a token.
    const cancelSection = c.cancelUrl
      ? `
  <div style="margin-top:28px;padding:20px 22px;border-radius:14px;background:#F6EEE6;border:1px solid #EADBCE;">
    <p style="margin:0 0 8px;font-weight:600;color:#5A4636;">${A.cancelTitle}</p>
    <p style="margin:0 0 16px;color:#7A5C45;">${A.cancelBody}</p>
    <p style="margin:0 0 16px;">
      <a href="${c.cancelUrl}" style="display:inline-block;padding:12px 22px;border-radius:12px;background:#9A7A60;color:#ffffff;text-decoration:none;font-weight:600;">${A.cancelBtn}</a>
    </p>
    <p style="margin:0;font-size:12px;color:#9A7A60;">${A.cancelNote}</p>
  </div>`
      : "";
    return {
      subject: A.subject,
      html: wrap(`${hi}
  <p>${A.intro}</p>
  <p><strong>${L.service}:</strong> ${c.svc}<br><strong>${L.dateL}:</strong> ${c.date}<br><strong>${L.timeL}:</strong> ${c.time}<br><strong>${A.statusL}:</strong> ${A.status}</p>
  <p style="margin:16px 0;padding:14px 16px;border-radius:10px;background:#FBF3EC;border:1px solid #EADBCE;color:#7A5C45;">${A.deposit}</p>
  <p>${A.outro}</p>
  <p>${L.bye}</p>${cancelSection}`),
    };
  }

  if (kind === "pending_confirmation") {
    const P = L.pending_confirmation;
    // Deliberately unlike the approval email: no greeting, amber "awaiting
    // confirmation" banner, bulleted details with an explicit status.
    return {
      subject: P.subject,
      html: wrap(`  <p>${P.headline}</p>
  <p style="margin:16px 0;padding:14px 16px;border-radius:10px;background:#FFF4D6;border:1px solid #F0D48A;color:#7A5A12;"><strong>${P.banner}</strong></p>
  <p style="margin:16px 0 4px;"><strong>${P.detailsTitle}</strong></p>
  <ul style="margin:0 0 16px;padding-left:22px;">
    <li>${L.service}: ${c.svc}</li>
    <li>${L.dateL}: ${c.date}</li>
    <li>${L.timeL}: ${c.time}</li>
    <li>${P.statusL}: <strong>${P.status}</strong></li>
  </ul>
  <p>${P.outro}</p>
  <p>${P.sign}</p>`),
    };
  }

  // Free Slot removes an approved booking, so the client reads it as a cancellation.
  if (kind === "admin_cancelled" || kind === "freed") {
    const K = L.admin_cancelled;
    return {
      subject: K.subject,
      html: wrap(`${hi}
  <p>${K.body(c)}</p>
  <p>${K.apology}</p>
  <p>${K.outro}</p>
  <p>${K.sign}</p>`),
    };
  }

  // Rejected: only for pending → rejected.
  const K = L.rejected;
  return {
    subject: K.subject,
    html: wrap(`${hi}
  <p>${K.body(c)}</p>
  <p>${K.outro}</p>
  <p>${L.bye}</p>`),
  };
}


/* ============================================================
   Request handling.
   Nothing in an email comes from the request: the function loads the booking
   with the service role and builds every message itself.

   Two kinds of caller:
   - The database (create_booking / cancel_booking via pg_net), with the
     x-webhook-secret header:
       { event: "new_booking", id }
       { event: "client_cancelled", booking: {name, service, date, time, phone, channel} }
   - The admin panel, with the signed-in admin's access token:
       { event: "approved" | "rejected", id }          status must already match
       { event: "freed" | "admin_cancelled", id }      booking must be approved; the
                                                       function deletes it, then emails
   ============================================================ */

const EMAIL_WEBHOOK_SECRET = Deno.env.get("EMAIL_WEBHOOK_SECRET") ?? "";
// Temporary, for the switch-over only: accept the old {booking, newStatus} payload.
const ALLOW_LEGACY_EMAIL = Deno.env.get("ALLOW_LEGACY_EMAIL") === "true";

const STUDIO_SERVICE_LABELS: Record<string, string> = {
  manicure: "Manicure", pedicure: "Pedicure", eyebrows: "Eyebrows", lipblush: "Lip Blush",
};
const ADMIN_EVENTS = ["approved", "rejected", "freed", "admin_cancelled"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function esc(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function safeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Studio emails: "Thursday 5 November 2026", like the wizard's fmtDate().
function studioDate(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}
// Eyebrows show a start–end range (display +1 min, as in the wizard); others the start.
function displayTime(b: Booking): string {
  if (b.service !== "eyebrows" || !b.duration_minutes) return b.time;
  const [h, m] = b.time.split(":").map(Number);
  const end = h * 60 + m + b.duration_minutes + 1;
  return `${b.time} - ${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

type Booking = {
  id: string; service: string; date: string; time: string; name: string; phone: string;
  email: string | null; options: string | null; status: string; channel: string;
  lang: string | null; cancel_token: string | null; duration_minutes: number | null;
};
type Msg = { to: string; subject: string; html: string };

const studioWrap = (inner: string) =>
  `<div style="font-family:Arial,sans-serif;color:#5A4636;line-height:1.6;">\n${inner}\n</div>`;
const studioRecipient = (service: string) =>
  service === "pedicure" && PEDICURE_EMAIL ? PEDICURE_EMAIL : STUDIO_EMAIL;

function customerMessage(b: Booking, kind: string, time = b.time): Msg | null {
  if (!b.email || b.channel === "whatsapp") return null;
  const lang: Lang = LANGS.includes(b.lang ?? "") ? b.lang as Lang : "en";
  const { subject, html } = customerEmail(lang, kind, {
    name: esc(b.name),
    svc: esc(SERVICE_NAMES[lang][b.service] || b.service),
    date: esc(formatDate(b.date, lang)),
    time: esc(time),
    cancelUrl: b.cancel_token ? `https://studiomelisa.com/?cancel=${encodeURIComponent(b.cancel_token)}` : "",
  });
  return { to: b.email, subject, html };
}

function newBookingMessages(b: Booking): Msg[] {
  const svc = STUDIO_SERVICE_LABELS[b.service] || b.service;
  const date = studioDate(b.date), time = displayTime(b);
  const wa = b.channel === "whatsapp";
  const msgs: Msg[] = [{
    to: studioRecipient(b.service),
    subject: `New Booking Request — ${svc} — ${date} at ${time}`,
    html: studioWrap(`  <p>A new booking request has come in:</p>
  <p><strong>Customer:</strong> ${esc(b.name)}<br><strong>Phone:</strong> ${esc(b.phone)}<br><strong>Email:</strong> ${esc(b.email || "—")}<br>${wa ? `<strong>Booked via:</strong> WhatsApp<br>` : ""}<strong>Service:</strong> ${esc(svc)}<br><strong>Date:</strong> ${esc(date)}<br><strong>Time:</strong> ${esc(time)}${b.options ? `<br><strong>Options:</strong> ${esc(b.options)}` : ""}</p>
  <p>Please review and approve or reject it in the admin panel.${wa ? " The client will message you on WhatsApp; reply from the panel." : ""}</p>`),
  }];
  const customer = customerMessage(b, "pending_confirmation", displayTime(b));
  if (customer) msgs.push(customer);
  return msgs;
}

function clientCancelledMessage(b: Pick<Booking, "name" | "service" | "date" | "time">): Msg {
  const svc = STUDIO_SERVICE_LABELS[b.service] || b.service;
  return {
    to: studioRecipient(b.service),
    subject: "A booking has been cancelled — Studio Melisa",
    html: studioWrap(`  <p>A booking has been cancelled:</p>
  <p><strong>${esc(b.name)}</strong>, ${esc(svc)}, ${esc(studioDate(b.date))} at ${esc(b.time)}.</p>
  <p>The slot is now free again.</p>`),
  };
}

function adminMessages(b: Booking, event: string, skipStudioCopy: boolean): Msg[] {
  const msgs: Msg[] = [];
  const customer = customerMessage(b, event);
  if (customer) msgs.push(customer);
  if ((event === "approved" || event === "rejected") && !skipStudioCopy && customer) {
    const svc = STUDIO_SERVICE_LABELS[b.service] || b.service;
    const heading = event === "approved" ? "New confirmed booking" : "Booking rejected";
    const intro = event === "approved" ? "A booking was confirmed:" : "A booking was rejected:";
    msgs.push({
      to: studioRecipient(b.service),
      subject: `${heading} — ${svc} — ${b.date} at ${b.time}`,
      html: studioWrap(`  <p>${intro}</p>
  <p><strong>Customer:</strong> ${esc(b.name)}<br><strong>Service:</strong> ${esc(svc)}<br><strong>Date:</strong> ${esc(b.date)}<br><strong>Time:</strong> ${esc(b.time)}</p>`),
    });
  }
  return msgs;
}

async function sendAll(msgs: Msg[]): Promise<{ sent: number; failed: number }> {
  const res = await Promise.all(msgs.map((m) =>
    fetch(RESEND_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Studio Melisa <bookings@studiomelisa.com>", ...m }),
    }).then((r) => r.ok).catch(() => false)
  ));
  const sent = res.filter(Boolean).length;
  return { sent, failed: res.length - sent };
}

const RESEND_URL = Deno.env.get("RESEND_URL") ?? "https://api.resend.com/emails";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function loadBooking(id: unknown): Promise<Booking | null> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from("bookings").select("*").eq("id", id).maybeSingle();
  return data as Booking | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const event = String(body.event ?? "");

  // ---- from the database (create_booking / cancel_booking) ----
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== null) {
    if (!safeEqual(secret, EMAIL_WEBHOOK_SECRET)) return json({ error: "unauthorized" }, 401);
    if (event === "new_booking") {
      const b = await loadBooking(body.id);
      if (!b || b.status !== "pending") return json({ error: "booking not found or not pending" }, 404);
      return json(await sendAll(newBookingMessages(b)));
    }
    if (event === "client_cancelled") {
      const b = body.booking as Booking | undefined;
      if (!b || typeof b.name !== "string" || typeof b.service !== "string") return json({ error: "bad booking" }, 400);
      return json(await sendAll([clientCancelledMessage(b)]));
    }
    return json({ error: "unknown event" }, 400);
  }

  // ---- old payload, only while switching over ----
  if (!body.event && body.booking && ALLOW_LEGACY_EMAIL) return legacy(body);

  // ---- from the admin panel: a signed-in admin only ----
  if (!ADMIN_EVENTS.includes(event)) return json({ error: "unknown event" }, 400);
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = jwt ? await db.auth.getUser(jwt) : { data: { user: null } };
  const role = auth?.user?.app_metadata?.admin_role;
  if (role !== "main" && role !== "pedicure") return json({ error: "admins only" }, 403);

  const b = await loadBooking(body.id);
  if (!b) return json({ error: "booking not found" }, 404);
  if (role === "pedicure" && b.service !== "pedicure") return json({ error: "not your booking" }, 403);
  const skipStudioCopy = body.skipStudioCopy === true;

  if (event === "approved" || event === "rejected") {
    if (b.status !== event) return json({ error: `booking is ${b.status}, not ${event}` }, 409);
    return json(await sendAll(adminMessages(b, event, skipStudioCopy)));
  }

  // freed / admin_cancelled: remove the approved booking, then tell the client
  if (b.status !== "approved") return json({ error: `booking is ${b.status}, not approved` }, 409);
  const { error } = await db.from("bookings").delete().eq("id", b.id);
  if (error) return json({ error: "could not delete: " + error.message }, 500);
  return json({ deleted: true, ...(await sendAll(adminMessages(b, event, skipStudioCopy))) });
});

/* ---- Legacy handler: the pre-lockdown request format, verbatim.
   Reached only when ALLOW_LEGACY_EMAIL=true. Delete after the switch-over. ---- */
// deno-lint-ignore no-explicit-any
async function legacy(payload: any): Promise<Response> {
  const { booking, newStatus, services, cancelToken, skipStudioCopy } = payload;
  const svcLabel = services?.[booking.service]?.title || booking.service;
  const token = cancelToken || booking.cancel_token || "";
  const studioRecipient =
    booking.service === "pedicure" && PEDICURE_EMAIL ? PEDICURE_EMAIL : STUDIO_EMAIL;

  let subject, html, to;
  if (newStatus === "cancelled" || newStatus === "request") {
    if (newStatus === "cancelled") {
      to = studioRecipient;
      subject = "A booking has been cancelled — Studio Melisa";
      html = `<div style="font-family:Arial,sans-serif;color:#5A4636;line-height:1.6;">
  <p>A booking has been cancelled:</p>
  <p><strong>${booking.name}</strong>, ${svcLabel}, ${booking.date} at ${booking.time}.</p>
  <p>The slot is now free again.</p>
</div>`;
    } else {
      to = studioRecipient;
      subject = `New Booking Request — ${svcLabel} — ${booking.date} at ${booking.time}`;
      html = `<div style="font-family:Arial,sans-serif;color:#5A4636;line-height:1.6;">
  <p>A new booking request has come in:</p>
  <p><strong>Customer:</strong> ${booking.name}<br><strong>Phone:</strong> ${booking.phone}<br><strong>Email:</strong> ${booking.email || "—"}<br>${booking.channel === "whatsapp" ? `<strong>Booked via:</strong> WhatsApp<br>` : ""}<strong>Service:</strong> ${svcLabel}<br><strong>Date:</strong> ${booking.date}<br><strong>Time:</strong> ${booking.time}${booking.options ? `<br><strong>Options:</strong> ${booking.options}` : ""}</p>
  <p>Please review and approve or reject it in the admin panel.${booking.channel === "whatsapp" ? " The client will message you on WhatsApp; reply from the panel." : ""}</p>
</div>`;
    }
  } else {
    const lang: Lang = LANGS.includes(booking.lang) ? booking.lang : "en";
    const kind = ["approved", "admin_cancelled", "freed", "pending_confirmation"].includes(newStatus)
      ? newStatus
      : "rejected";
    to = booking.email;
    ({ subject, html } = customerEmail(lang, kind, {
      name: booking.name,
      svc: SERVICE_NAMES[lang][booking.service] || svcLabel,
      date: formatDate(booking.date, lang),
      time: booking.time,
      cancelUrl: token ? `https://studiomelisa.com/?cancel=${token}` : "",
    }));
  }

  const messages = to ? [{ to, subject, html }] : [];
  if ((newStatus === "approved" || newStatus === "rejected") && !skipStudioCopy) {
    const heading = newStatus === "approved" ? "New confirmed booking" : "Booking rejected";
    const intro = newStatus === "approved" ? "A booking was confirmed:" : "A booking was rejected:";
    messages.push({
      to: studioRecipient,
      subject: `${heading} — ${svcLabel} — ${booking.date} at ${booking.time}`,
      html: `<div style="font-family:Arial,sans-serif;color:#5A4636;line-height:1.6;">
  <p>${intro}</p>
  <p><strong>Customer:</strong> ${booking.name}<br><strong>Service:</strong> ${svcLabel}<br><strong>Date:</strong> ${booking.date}<br><strong>Time:</strong> ${booking.time}</p>
</div>`,
    });
  }
  return json(await sendAll(messages as Msg[]));
}
