const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const STUDIO_EMAIL = Deno.env.get("STUDIO_EMAIL") ?? "onboarding@resend.dev";
const PEDICURE_EMAIL = Deno.env.get("PEDICURE_EMAIL") ?? "";

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
  if (newStatus === "approved") {
    to = booking.email;
    subject = "Your booking is confirmed ✓ — Studio Melisa";

    // Cancellation section — only included when we actually have a token.
    const cancelUrl = `https://studiomelisa.com/?cancel=${token}`;
    const cancelSection = token
      ? `
  <div style="margin-top:28px;padding:20px 22px;border-radius:14px;background:#F6EEE6;border:1px solid #EADBCE;">
    <p style="margin:0 0 8px;font-weight:600;color:#5A4636;">Need to cancel? No problem.</p>
    <p style="margin:0 0 16px;color:#7A5C45;">If your plans change, you can cancel your appointment by clicking the link below. Please cancel at least 24 hours in advance.</p>
    <p style="margin:0 0 16px;">
      <a href="${cancelUrl}" style="display:inline-block;padding:12px 22px;border-radius:12px;background:#9A7A60;color:#ffffff;text-decoration:none;font-weight:600;">Cancel my appointment →</a>
    </p>
    <p style="margin:0;font-size:12px;color:#9A7A60;">Note: this link is for cancellations only. If you'd like to reschedule, please contact us directly.</p>
  </div>`
      : "";

    html = `<div style="font-family:Arial,sans-serif;color:#5A4636;line-height:1.6;">
  <p>Hi ${booking.name},</p>
  <p>Wonderful news — your booking at <strong>Studio Melisa</strong> is confirmed! 🌸 We can't wait to see you.</p>
  <p><strong>Service:</strong> ${svcLabel}<br><strong>Date:</strong> ${booking.date}<br><strong>Time:</strong> ${booking.time}</p>
  <p style="margin:16px 0;padding:14px 16px;border-radius:10px;background:#FBF3EC;border:1px solid #EADBCE;color:#7A5C45;">⚠️ To confirm your booking, the deposit must be paid at Studio Melisa premises at least 3 days before your appointment. If the deposit is not paid within this period, the booking will be cancelled and the appointment slot will be released for other clients.</p>
  <p>If anything changes, just reply to let us know. See you soon! 💕</p>
  <p>— Studio Melisa</p>${cancelSection}
</div>`;
  } else if (newStatus === "cancelled") {
    // Notification to the studio that a customer cancelled their appointment.
    to = studioRecipient;
    subject = "A booking has been cancelled — Studio Melisa";
    html = `<div style="font-family:Arial,sans-serif;color:#5A4636;line-height:1.6;">
  <p>A booking has been cancelled:</p>
  <p><strong>${booking.name}</strong>, ${svcLabel}, ${booking.date} at ${booking.time}.</p>
  <p>The slot is now free again.</p>
</div>`;
  } else if (newStatus === "request") {
    // New booking request notification to the studio (pedicure worker for
    // pedicure bookings, otherwise the main studio inbox).
    to = studioRecipient;
    subject = `New Booking Request — ${svcLabel} — ${booking.date} at ${booking.time}`;
    html = `<div style="font-family:Arial,sans-serif;color:#5A4636;line-height:1.6;">
  <p>A new booking request has come in:</p>
  <p><strong>Customer:</strong> ${booking.name}<br><strong>Phone:</strong> ${booking.phone}<br><strong>Email:</strong> ${booking.email}<br><strong>Service:</strong> ${svcLabel}<br><strong>Date:</strong> ${booking.date}<br><strong>Time:</strong> ${booking.time}${booking.options ? `<br><strong>Options:</strong> ${booking.options}` : ""}</p>
  <p>Please review and approve or reject it in the admin panel.</p>
</div>`;
  } else if (newStatus === "freed") {
    // Customer notification when the studio frees a previously held/booked slot.
    to = booking.email;
    subject = "Your appointment has been cancelled — Studio Melisa";
    html = `<div style="font-family:Arial,sans-serif;color:#5A4636;line-height:1.6;">
  <p>Hi ${booking.name},</p>
  <p>We're sorry to inform you that your appointment for <strong>${svcLabel}</strong> on <strong>${booking.date}</strong> at <strong>${booking.time}</strong> has been cancelled because the deposit was not paid in time.</p>
  <p>We know this is disappointing, and we sincerely apologize for the inconvenience. We'd love to have you back — please feel free to rebook a time that works for you at <a href="https://studiomelisa.com" style="color:#9A7A60;">studiomelisa.com</a>.</p>
  <p>With warm wishes,<br>— Studio Melisa</p>
</div>`;
  } else if (newStatus === "pending_confirmation") {
    // Customer notification sent immediately after a booking request is submitted.
    to = booking.email;
    subject = "We received your booking request — Studio Melisa";
    html = `<div style="font-family:Arial,sans-serif;color:#5A4636;line-height:1.6;">
  <p>Hi ${booking.name},</p>
  <p>Thank you for your booking request at <strong>Studio Melisa</strong>! We've received your request for <strong>${svcLabel}</strong> on <strong>${booking.date}</strong> at <strong>${booking.time}</strong>.</p>
  <p>Please hold tight — we'll send you an approval or rejection email shortly. 🌸</p>
  <p>With warm wishes,<br>— Studio Melisa</p>
</div>`;
  } else {
    to = booking.email;
    subject = "About your booking — Studio Melisa";
    html = `<div style="font-family:Arial,sans-serif;color:#5A4636;line-height:1.6;">
  <p>Hi ${booking.name},</p>
  <p>Thank you for your booking request at <strong>Studio Melisa</strong>. Unfortunately, the slot you chose (${booking.date} at ${booking.time}) isn't available.</p>
  <p>We'd love to still see you — please pick another time and we'll be happy to welcome you. 🌸</p>
  <p>With warm wishes,<br>— Studio Melisa</p>
</div>`;
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
