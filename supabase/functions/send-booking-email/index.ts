const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const STUDIO_EMAIL = Deno.env.get("STUDIO_EMAIL") ?? "onboarding@resend.dev";

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
  <p>If anything changes, just reply to let us know. See you soon! 💕</p>
  <p>— Studio Melisa</p>${cancelSection}
</div>`;
  } else if (newStatus === "cancelled") {
    // Notification to the studio that a customer cancelled their appointment.
    to = STUDIO_EMAIL;
    subject = "A booking has been cancelled — Studio Melisa";
    html = `<div style="font-family:Arial,sans-serif;color:#5A4636;line-height:1.6;">
  <p>A booking has been cancelled:</p>
  <p><strong>${booking.name}</strong>, ${svcLabel}, ${booking.date} at ${booking.time}.</p>
  <p>The slot is now free again.</p>
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

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: "Studio Melisa <bookings@studiomelisa.com>", to, subject, html }),
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    status: res.ok ? 200 : 400,
  });
});
