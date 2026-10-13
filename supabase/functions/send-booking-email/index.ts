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
  hi: string; service: string; dateL: string; timeL: string; bye: string; byeWarm: string;
  approved: { subject: string; intro: string; statusL: string; status: string; deposit: string; outro: string;
    cancelTitle: string; cancelBody: string; cancelBtn: string; cancelNote: string };
  rejected: { subject: string; body: (c: Ctx) => string; outro: string };
  admin_cancelled: { subject: string; body: (c: Ctx) => string; outro: string };
  pending_confirmation: { subject: string; headline: string; banner: string; detailsTitle: string;
    statusL: string; status: string; outro: string; sign: string };
};

const COPY: Record<Lang, Copy> = {
  en: {
    hi: "Hi", service: "Service", dateL: "Date", timeL: "Time", bye: "— Studio Melisa", byeWarm: "With warm wishes,<br>— Studio Melisa",
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
      subject: "Your booking has been cancelled — Studio Melisa",
      body: (c) => `Your booking for <strong>${c.svc}</strong> on <strong>${c.date}</strong> at <strong>${c.time}</strong> is cancelled because of personal reasons. We're sorry for any inconvenience.`,
      outro: `Please check for different booking times at <a href="https://studiomelisa.com" style="color:#9A7A60;">studiomelisa.com</a> — we'd love to still see you. 🌸`,
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
    hi: "Përshëndetje", service: "Shërbimi", dateL: "Data", timeL: "Ora", bye: "— Studio Melisa", byeWarm: "Me urimet më të mira,<br>— Studio Melisa",
    approved: {
      subject: "Rezervimi juaj është aprovuar! 🌸",
      intro: "Lajme të mira rezervimi juaj në <strong>Studio Melisa</strong> është Aprovuar! 🌸",
      statusL: "Statusi", status: "Aprovuar",
      deposit: "⚠️ Për të konfirmuar rezervimin tuaj, kapari duhet të paguhet në ambientet e Studio Melisa të paktën 3 ditë para terminit. Nëse kapari nuk paguhet brenda këtij afati, rezervimi do të anulohet dhe termini do të lirohet për klientë të tjerë.",
      outro: "Nëse diçka ndryshon, na përgjigjuni thjesht këtij emaili. Shihemi së shpejti! 💕",
      cancelTitle: "Duhet ta anuloni? Nuk ka problem.",
      cancelBody: "Nëse planet tuaja ndryshojnë, mund ta anuloni terminin duke klikuar lidhjen më poshtë. Ju lutemi anuloni të paktën 24 orë përpara.",
      cancelBtn: "Anuloni terminin tim →",
      cancelNote: "Shënim: kjo lidhje është vetëm për anulim. Nëse dëshironi ta zhvendosni terminin, ju lutemi na kontaktoni drejtpërdrejt.",
    },
    rejected: {
      subject: "Termini juaj është refuzuar!",
      body: (c) => `Për kërkesën tuaj për rezervim në Studio Melisa fatkeqësisht, termini që zgjodhët (${c.date} në ${c.time}) nuk është i disponueshëm.`,
      outro: "Ju lutemi zgjidhni një termin tjetër, ju mirëpresim! 🌸",
    },
    admin_cancelled: {
      subject: "Rezervimi juaj është anuluar — Studio Melisa",
      body: (c) => `Rezervimi juaj për <strong>${c.svc}</strong> më <strong>${c.date}</strong> në orën <strong>${c.time}</strong> është anuluar për arsye personale. Na vjen keq për shqetësimin.`,
      outro: `Ju lutemi shikoni kohë të tjera rezervimi në <a href="https://studiomelisa.com" style="color:#9A7A60;">studiomelisa.com</a> — do të na pëlqente t'ju shihnim prapë. 🌸`,
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
    hi: "Здраво", service: "Услуга", dateL: "Датум", timeL: "Време", bye: "— Studio Melisa", byeWarm: "Со најдобри желби,<br>— Studio Melisa",
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
      subject: "Вашата резервација е откажана — Studio Melisa",
      body: (c) => `Вашата резервација за <strong>${c.svc}</strong> на <strong>${c.date}</strong> во <strong>${c.time}</strong> е откажана поради лични причини. Ни е жал за непријатноста.`,
      outro: `Ве молиме проверете други термини на <a href="https://studiomelisa.com" style="color:#9A7A60;">studiomelisa.com</a> — би сакале сепак да ве видиме. 🌸`,
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

  // "Freed" (studio frees the slot) reads the same as a refusal to the customer.
  const K = L[kind === "admin_cancelled" ? "admin_cancelled" : "rejected"];
  return {
    subject: K.subject,
    html: wrap(`${hi}
  <p>${K.body(c)}</p>
  <p>${K.outro}</p>
  <p>${kind === "admin_cancelled" ? L.byeWarm : L.bye}</p>`),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  const { booking, newStatus, services, cancelToken } = await req.json();
  const svcLabel = services[booking.service]?.title || booking.service;

  // Prefer the explicit cancelToken; fall back to the value on the booking row.
  const token = cancelToken || booking.cancel_token || "";

  // Studio-side notifications for pedicure bookings go to the pedicure worker's
  // inbox; everything else goes to the main studio email as before.
  const studioRecipient =
    booking.service === "pedicure" && PEDICURE_EMAIL ? PEDICURE_EMAIL : STUDIO_EMAIL;

  let subject, html, to;
  if (newStatus === "cancelled" || newStatus === "request") {
    // Studio-side notifications stay in English.
    if (newStatus === "cancelled") {
      // Notification to the studio that a customer cancelled their appointment.
      to = studioRecipient;
      subject = "A booking has been cancelled — Studio Melisa";
      html = `<div style="font-family:Arial,sans-serif;color:#5A4636;line-height:1.6;">
  <p>A booking has been cancelled:</p>
  <p><strong>${booking.name}</strong>, ${svcLabel}, ${booking.date} at ${booking.time}.</p>
  <p>The slot is now free again.</p>
</div>`;
    } else {
      // New booking request notification to the studio (pedicure worker for
      // pedicure bookings, otherwise the main studio inbox).
      to = studioRecipient;
      subject = `New Booking Request — ${svcLabel} — ${booking.date} at ${booking.time}`;
      html = `<div style="font-family:Arial,sans-serif;color:#5A4636;line-height:1.6;">
  <p>A new booking request has come in:</p>
  <p><strong>Customer:</strong> ${booking.name}<br><strong>Phone:</strong> ${booking.phone}<br><strong>Email:</strong> ${booking.email}<br><strong>Service:</strong> ${svcLabel}<br><strong>Date:</strong> ${booking.date}<br><strong>Time:</strong> ${booking.time}${booking.options ? `<br><strong>Options:</strong> ${booking.options}` : ""}</p>
  <p>Please review and approve or reject it in the admin panel.</p>
</div>`;
    }
  } else {
    // Customer-facing email, in the language the customer booked in
    // (bookings.lang; older rows without it fall back to English).
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

  // Primary message (customer-facing for approve/reject, studio for cancel).
  const messages = [{ to, subject, html }];

  // On approval/rejection, also notify the studio side (pedicure worker for
  // pedicure bookings, otherwise the main studio inbox).
  if (newStatus === "approved" || newStatus === "rejected") {
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

  const sendEmail = (msg) =>
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: "Studio Melisa <bookings@studiomelisa.com>", ...msg }),
    });

  // Send all emails in parallel so the studio copy adds no latency.
  const responses = await Promise.all(messages.map(sendEmail));

  // Base the HTTP response on the primary (customer) email.
  const primary = responses[0];
  const data = await primary.json();
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    status: primary.ok ? 200 : 400,
  });
});
