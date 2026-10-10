import { URL } from "node:url";
import { brackets, connect, isReady, mapBracket, toId, users } from "./db.js";
import { createApp, readJson, sendEmpty, sendJson, serveStatic } from "./http.js";
import { getUserFromRequest, hashPassword, signToken, verifyPassword } from "./middleware/auth.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
function usernameQuery(username) { return new RegExp("^" + username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"); }
function requireUser(req, res) { const user = getUserFromRequest(req); if (!user) { sendJson(res, 401, { error: "No autenticado" }); return null; } return user; }
function makeRounds(teams) {
  const list = [...teams];
  const rounds = [];
  while (list.length > 1) {
    const matches = [];
    for (let i = 0; i < list.length; i += 2) matches.push({ a: list[i], b: list[i + 1] || "bye", winner: "" });
    rounds.push(matches);
    list.length = Math.ceil(list.length / 2);
    list.fill("");
  }
  return rounds;
}

const server = createApp(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;
  const method = req.method || "GET";
  if (pathname === "/health") return sendJson(res, 200, { ok: true, db: isReady() });
  if (pathname.startsWith("/api/") && !isReady()) return sendJson(res, 503, { error: "Base no lista" });
  if (!pathname.startsWith("/api/")) return serveStatic(req, res);

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!USERNAME_RE.test(username)) return sendJson(res, 400, { error: "Usuario: 3-20 caracteres, letras, numeros y _" });
    if (password.length < 6) return sendJson(res, 400, { error: "La contrasena debe tener al menos 6 caracteres" });
    if (await users().findOne({ username: usernameQuery(username) })) return sendJson(res, 409, { error: "Ese usuario ya existe" });
    const result = await users().insertOne({ username, passwordHash: hashPassword(password), createdAt: new Date() });
    const user = { id: String(result.insertedId), username };
    return sendJson(res, 201, { user, token: signToken(user) });
  }
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const row = await users().findOne({ username: usernameQuery(username) });
    if (!row || !verifyPassword(String(body.password || ""), row.passwordHash)) return sendJson(res, 401, { error: "Usuario o contrasena incorrectos" });
    const user = { id: String(row._id), username: row.username };
    return sendJson(res, 200, { user, token: signToken(user) });
  }
  if (method === "GET" && pathname === "/api/auth/me") {
    const user = requireUser(req, res);
    if (!user) return;
    return sendJson(res, 200, { user });
  }

  const user = requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  if (method === "GET" && pathname === "/api/brackets") {
    const rows = await brackets().find({ userId }).sort({ createdAt: -1 }).limit(20).toArray();
    return sendJson(res, 200, { brackets: rows.map(mapBracket) });
  }
  if (method === "POST" && pathname === "/api/brackets") {
    const body = await readJson(req);
    const name = String(body.name || "").trim();
    const teams = (Array.isArray(body.teams) ? body.teams : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 16);
    if (!name || teams.length < 2) return sendJson(res, 400, { error: "Nombre y al menos 2 equipos" });
    const result = await brackets().insertOne({ userId, name: name.slice(0, 40), teams, rounds: makeRounds(teams), createdAt: new Date() });
    return sendJson(res, 201, { bracket: mapBracket(await brackets().findOne({ _id: result.insertedId })) });
  }
  const win = pathname.match(/^\/api\/brackets\/([a-fA-F0-9]{24})\/win$/);
  if (win && method === "POST") {
    const body = await readJson(req);
    const row = await brackets().findOne({ _id: toId(win[1]), userId });
    if (!row) return sendJson(res, 404, { error: "Bracket no encontrado" });
    const r = Number(body.round || 0);
    const m = Number(body.match || 0);
    const side = body.side === "b" ? "b" : "a";
    if (!row.rounds[r] || !row.rounds[r][m]) return sendJson(res, 400, { error: "Partido invalido" });
    row.rounds[r][m].winner = row.rounds[r][m][side];
    if (row.rounds[r + 1]) {
      const next = Math.floor(m / 2);
      const nextSide = m % 2 === 0 ? "a" : "b";
      row.rounds[r + 1][next][nextSide] = row.rounds[r][m].winner;
    }
    await brackets().updateOne({ _id: row._id }, { $set: { rounds: row.rounds } });
    return sendJson(res, 200, { bracket: mapBracket(await brackets().findOne({ _id: row._id })) });
  }
  const match = pathname.match(/^\/api\/brackets\/([a-fA-F0-9]{24})$/);
  if (match && method === "DELETE") {
    const result = await brackets().deleteOne({ _id: toId(match[1]), userId });
    if (!result.deletedCount) return sendJson(res, 404, { error: "Bracket no encontrado" });
    return sendEmpty(res, 204);
  }
  sendJson(res, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, HOST, () => console.log(`Bracket en http://${HOST}:${PORT}`));
async function bootDb() { for (;;) { try { await connect(); return; } catch (err) { console.error("Mongo no disponible:", err.message); await new Promise((resolve) => setTimeout(resolve, 5000)); } } }
bootDb();
