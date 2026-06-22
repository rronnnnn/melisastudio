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

  const { booking, newStatus, services } = await req.json();
  const svcLabel = services[booking.service]?.title || booking.service;

  let subject, html;
  if (newStatus === "approved") {
    subject = "Your booking is confirmed ✓ — Studio Melisa";
    html = `<div style="font-family:Arial,sans-serif;color:#5A4636;line-height:1.6;">
  <p>Hi ${booking.name},</p>
  <p>Wonderful news — your booking at <strong>Studio Melisa</strong> is confirmed! 🌸 We can't wait to see you.</p>
  <p><strong>Service:</strong> ${svcLabel}<br><strong>Date:</strong> ${booking.date}<br><strong>Time:</strong> ${booking.time}</p>
  <p>If anything changes, just reply to let us know. See you soon! 💕</p>
  <p>— Studio Melisa</p>
</div>`;
  } else {
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
    body: JSON.stringify({ from: STUDIO_EMAIL, to: booking.email, subject, html }),
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
