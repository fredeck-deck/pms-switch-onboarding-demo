// Hands the onboarding demo a fresh 30-minute Deck session token (tk_) on every page load.
// The org secret key stays in Secret Manager (env DECK_SK); only the demo site's origin may call this.
const http = require("http");
const ALLOWED = (process.env.ALLOWED_ORIGINS || "https://fredeck-deck.github.io").split(",");

http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  const ok = ALLOWED.includes(origin);
  if (ok) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
  if (req.method === "OPTIONS") { res.writeHead(ok ? 204 : 403); return res.end(); }
  if (req.method !== "GET" || req.url.split("?")[0] !== "/token") { res.writeHead(404); return res.end(); }
  if (!ok) { res.writeHead(403); return res.end(); }
  try {
    const r = await fetch("https://api.deck.co/v2/token", { method: "POST", headers: { Authorization: "Bearer " + process.env.DECK_SK } });
    const j = await r.json();
    if (!r.ok || !j.token) throw new Error("mint failed: HTTP " + r.status);
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ token: j.token, expires_at: j.expires_at }));
  } catch (e) {
    console.error(e.message);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "could not start a Deck session" }));
  }
}).listen(process.env.PORT || 8080);
