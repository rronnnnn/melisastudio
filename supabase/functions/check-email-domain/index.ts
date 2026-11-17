// Booking wizard → "does this email domain accept mail?" (MX lookup).
// Called by the browser right before create_booking (bookings themselves are
// saved by the create_booking SQL RPC, which can't resolve DNS).
// Public, no secrets: deploy with --no-verify-jwt.
// Answers { ok: false } only when DNS says the domain has no MX records;
// timeouts and other lookup failures answer { ok: true } so a DNS hiccup
// never blocks a real booking.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function hasMx(domain: string): Promise<boolean> {
  try {
    const records = await Deno.resolveDns(domain, "MX");
    // A "null MX" (RFC 7505: exchange ".") means the domain takes no mail.
    return records.some((r) => r.exchange.replace(/\.$/, "") !== "");
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false; // NXDOMAIN / no MX records
    console.error("MX lookup failed for", domain, e);
    return true; // fail open
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let email = "";
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
  } catch {
    return json({ error: "invalid body" }, 400);
  }
  const at = email.lastIndexOf("@");
  let domain = at > 0 ? email.slice(at + 1) : "";
  try { domain = new URL(`http://${domain}`).hostname; } catch { /* checked below */ } // ë.com → xn--
  if (!/^[a-z0-9.-]+\.[a-z0-9-]{2,}$/.test(domain) || domain.length > 253) {
    return json({ ok: false, reason: "invalid" });
  }
  const ok = await hasMx(domain);
  return json(ok ? { ok: true } : { ok: false, reason: "no_mx" });
});
