import { api, setSession, clearSession, getToken } from "./api.js";
const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authSubmit = document.querySelector("#auth-submit");
const listEl = document.querySelector("#list");
const form = document.querySelector("#bracket-form");
const formError = document.querySelector("#form-error");
let mode = "login";
const showError = (el, message) => { el.hidden = !message; el.textContent = message || ""; };

function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
}
async function refresh() {
  const data = await api("/api/brackets");
  listEl.innerHTML = "";
  data.brackets.forEach((b) => {
    const box = document.createElement("div");
    box.className = "bracket";
    const title = document.createElement("strong");
    title.textContent = b.name;
    box.append(title);
    b.rounds.forEach((round, ri) => {
      const rEl = document.createElement("div");
      rEl.className = "round";
      rEl.textContent = `Ronda ${ri + 1}`;
      round.forEach((m, mi) => {
        const mEl = document.createElement("div");
        mEl.className = "match";
        const a = document.createElement("button");
        a.className = m.winner === m.a ? "primary" : "ghost";
        a.textContent = m.a || "-";
        a.addEventListener("click", async () => { if (!m.a) return; await api(`/api/brackets/${b.id}/win`, { method: "POST", body: JSON.stringify({ round: ri, match: mi, side: "a" }) }); await refresh(); });
        const bBtn = document.createElement("button");
        bBtn.className = m.winner === m.b ? "primary" : "ghost";
        bBtn.textContent = m.b || "-";
        bBtn.addEventListener("click", async () => { if (!m.b) return; await api(`/api/brackets/${b.id}/win`, { method: "POST", body: JSON.stringify({ round: ri, match: mi, side: "b" }) }); await refresh(); });
        mEl.append(a, bBtn);
        rEl.append(mEl);
      });
      box.append(rEl);
    });
    const del = document.createElement("button");
    del.className = "ghost";
    del.textContent = "Borrar";
    del.addEventListener("click", async () => { await api(`/api/brackets/${b.id}`, { method: "DELETE" }); await refresh(); });
    box.append(del);
    listEl.append(box);
  });
}
async function boot() {
  if (!getToken()) return;
  try {
    const { user } = await api("/api/auth/me");
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.querySelector("#user-name").textContent = user.username;
    await refresh();
  } catch { clearSession(); }
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(authError, "");
  const fd = new FormData(authForm);
  try {
    const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }) });
    setSession(data.token);
    authForm.reset();
    await boot();
  } catch (err) { showError(authError, err.message); }
});
document.querySelector("#logout").addEventListener("click", () => { clearSession(); appView.classList.add("hidden"); authView.classList.remove("hidden"); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(formError, "");
  try {
    const teams = document.querySelector("#teams").value.split(",").map((t) => t.trim()).filter(Boolean);
    await api("/api/brackets", { method: "POST", body: JSON.stringify({ name: document.querySelector("#name").value.trim(), teams }) });
    form.reset();
    await refresh();
  } catch (err) { showError(formError, err.message); }
});
boot();
