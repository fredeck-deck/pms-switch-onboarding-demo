// Backs the Hostaway demo pages (onboarding + compliance). Only the demo site's origin may call it.
//   GET  /token        a fresh 30-minute Deck session token (tk_) for the page's own API calls.
//   POST /run          run a compliance task inside an existing session. tk_ tokens cannot reuse a
//                      session (the API answers resource_not_found), so this one call uses the org key.
//                      Body: { task_id, session_id, credential_id, input }. Only the tasks in RUN_TASKS.
//   GET  /file?run=…   the PDF a compliance run stored (tk_ tokens get 403 on storage), as application/pdf.
// The org secret key is env DECK_SK. /file is opened in a new tab, which sends no Origin, so it is the one
// route served without the origin check; it only serves PDFs of the allowlisted tasks' runs.
const http = require("http");
const ALLOWED = (process.env.ALLOWED_ORIGINS || "https://fredeck-deck.github.io").split(",");
const API = "https://api.deck.co/v2";
const RUN_TASKS = (process.env.RUN_TASKS || "task_haibEUCcCqiqw5EQ,task_8WWxaZbFNW5nEnjO").split(",");
const ID = /^[a-z]+_[A-Za-z0-9]{8,40}$/;

const deck = (path, opts = {}) =>
  fetch(API + path, { ...opts, headers: { Authorization: "Bearer " + process.env.DECK_SK, "Content-Type": "application/json" } });

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 20000) reject(new Error("body too large")); });
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch (e) { reject(e); } });
  });
}

async function token(res) {
  const r = await deck("/token", { method: "POST" });
  const j = await r.json();
  if (!r.ok || !j.token) throw new Error("mint failed: HTTP " + r.status);
  send(res, 200, { token: j.token, expires_at: j.expires_at });
}

async function run(req, res) {
  const b = await readJson(req);
  if (!RUN_TASKS.includes(b.task_id) || !ID.test(b.session_id || "") || !ID.test(b.credential_id || ""))
    return send(res, 400, { error: "task_id must be a compliance task; session_id and credential_id are required" });
  const r = await deck(`/tasks/${b.task_id}/run`, { method: "POST",
    body: JSON.stringify({ session_id: b.session_id, credential_id: b.credential_id, input: b.input || {} }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return send(res, r.status, { error: (j.errors && j.errors[0] && j.errors[0].message) || "HTTP " + r.status });
  send(res, 200, { id: j.id, status: j.status, session_id: j.session_id });
}

async function file(req, res) {
  const runId = new URL(req.url, "http://x").searchParams.get("run") || "";
  if (!ID.test(runId)) return send(res, 400, { error: "run is required" });
  const tr = await (await deck("/task-runs/" + runId)).json().catch(() => ({}));
  if (!RUN_TASKS.includes(tr.task_id)) return send(res, 404, { error: "no such compliance run" });
  const list = await (await deck(`/task-runs/${runId}/storage`)).json().catch(() => ({}));
  const item = list.data && list.data[0];
  if (!item || !item.url) return send(res, 404, { error: "the run has no stored file yet" });
  const pdf = await fetch(item.url);
  if (!pdf.ok) return send(res, 502, { error: "could not read the stored file" });
  res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${item.file_name}"`, "Cache-Control": "no-store" });
  res.end(Buffer.from(await pdf.arrayBuffer()));
}

http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  const path = req.url.split("?")[0];
  const ok = ALLOWED.includes(origin);
  if (ok) {
    res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type"); res.setHeader("Access-Control-Allow-Methods", "GET, POST");
  }
  if (req.method === "OPTIONS") { res.writeHead(ok ? 204 : 403); return res.end(); }
  if (!ok && path !== "/file") { res.writeHead(403); return res.end(); }
  try {
    if (req.method === "GET" && path === "/token") return await token(res);
    if (req.method === "POST" && path === "/run") return await run(req, res);
    if (req.method === "GET" && path === "/file") return await file(req, res);
    res.writeHead(404); res.end();
  } catch (e) {
    console.error(e.message);
    send(res, 502, { error: "could not reach Deck" });
  }
}).listen(process.env.PORT || 8080);
