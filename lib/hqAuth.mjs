import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const adminsPath = join(root, "data", "admins.json");

export function loadDotenv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    const techEnv = join(root, "..", "technologies", "apps", "backend", ".env");
    if (existsSync(techEnv)) {
      for (const raw of readFileSync(techEnv, "utf8").split(/\r?\n/)) {
        const line = raw.trim();
        if (!line.startsWith("GOOGLE_CLIENT_")) continue;
        const i = line.indexOf("=");
        if (i < 1) continue;
        const key = line.slice(0, i).trim();
        const val = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

export function ownerEmail() {
  return (process.env.HQ_OWNER_EMAIL || "polo@attadia.com").trim().toLowerCase();
}

export function techApiUrl() {
  return (process.env.TECH_API_URL || "http://localhost:5000").replace(/\/$/, "");
}

function secret() {
  return process.env.HQ_SESSION_SECRET || "dev-only-change-me";
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function readAdmins() {
  mkdirSync(dirname(adminsPath), { recursive: true });
  if (!existsSync(adminsPath)) {
    const seed = { emails: [ownerEmail()] };
    writeFileSync(adminsPath, JSON.stringify(seed, null, 2));
    return seed.emails.map(normalizeEmail);
  }
  const data = JSON.parse(readFileSync(adminsPath, "utf8"));
  const emails = [...new Set([ownerEmail(), ...(data.emails || []).map(normalizeEmail)])];
  return emails.filter(Boolean);
}

function writeAdmins(emails) {
  const next = [...new Set([ownerEmail(), ...emails.map(normalizeEmail)])].filter(Boolean);
  mkdirSync(dirname(adminsPath), { recursive: true });
  writeFileSync(adminsPath, JSON.stringify({ emails: next }, null, 2));
  return next;
}

export function isAllowed(email) {
  return readAdmins().includes(normalizeEmail(email));
}

export function isOwner(email) {
  return normalizeEmail(email) === ownerEmail();
}

export function addAdmin(actorEmail, email) {
  if (!isOwner(actorEmail)) {
    const err = new Error("Solo el owner puede administrar accesos");
    err.status = 403;
    throw err;
  }
  return writeAdmins([...readAdmins(), email]);
}

export function removeAdmin(actorEmail, email) {
  if (!isOwner(actorEmail)) {
    const err = new Error("Solo el owner puede administrar accesos");
    err.status = 403;
    throw err;
  }
  const target = normalizeEmail(email);
  if (target === ownerEmail()) {
    const err = new Error("No se puede quitar al owner");
    err.status = 400;
    throw err;
  }
  return writeAdmins(readAdmins().filter((e) => e !== target));
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

export function signSession(user) {
  const payload = b64url(
    JSON.stringify({
      email: normalizeEmail(user.email),
      nombre: user.nombre || "",
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    }),
  );
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readSession(cookieHeader) {
  const match = String(cookieHeader || "").match(/(?:^|;\s*)hq=([^;]+)/);
  if (!match) return null;
  const [payload, sig] = match[1].split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (!data.exp || data.exp < Date.now()) return null;
  if (!isAllowed(data.email)) return null;
  return { email: data.email, nombre: data.nombre || "", owner: isOwner(data.email) };
}

export function sessionCookie(value, maxAgeSeconds) {
  const parts = [
    `hq=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export async function loginAgainstTech(email, password) {
  const res = await fetch(`${techApiUrl()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    const err = new Error(data.error || "Credenciales inválidas");
    err.status = 401;
    throw err;
  }
  return data.user || { email };
}

function googleClient() {
  return {
    id: process.env.GOOGLE_CLIENT_ID || "",
    secret: process.env.GOOGLE_CLIENT_SECRET || "",
  };
}

function publicOrigin(req) {
  if (process.env.HQ_PUBLIC_URL) return process.env.HQ_PUBLIC_URL.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:4170";
  const proto = req.headers["x-forwarded-proto"] || (String(host).includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function googleRedirectUri(req) {
  return `${publicOrigin(req)}/api/google/callback`;
}

function oauthCookie(value, maxAgeSeconds) {
  const parts = [
    `hq_oauth=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

function readOauthState(cookieHeader) {
  const match = String(cookieHeader || "").match(/(?:^|;\s*)hq_oauth=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function sendRedirect(res, location, extraHeaders = {}) {
  res.writeHead(302, {
    Location: location,
    "Cache-Control": "private, no-store",
    ...extraHeaders,
  });
  res.end();
}

export function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store",
    ...extraHeaders,
  });
  res.end(payload);
}

async function googleUserFromCode(req, code) {
  const { id, secret } = googleClient();
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: googleRedirectUri(req),
      grant_type: "authorization_code",
    }),
  });
  const tokens = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokens.access_token) {
    const err = new Error(tokens.error_description || "Google no devolvió un token");
    err.status = 401;
    throw err;
  }
  const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const info = await infoRes.json().catch(() => ({}));
  if (!info.email) {
    const err = new Error("Google no envió el email");
    err.status = 401;
    throw err;
  }
  return { email: info.email, nombre: info.name || info.given_name || "" };
}

export async function handleHqApi(req, res) {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  const method = req.method || "GET";

  const readBody = () =>
    new Promise((resolve, reject) => {
      let raw = "";
      req.on("data", (c) => {
        raw += c;
        if (raw.length > 1e6) req.destroy();
      });
      req.on("end", () => {
        if (!raw) return resolve({});
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(e);
        }
      });
      req.on("error", reject);
    });

  try {
    if (path === "/api/google" && method === "GET") {
      const { id } = googleClient();
      if (!id) {
        sendJson(res, 500, { error: "Falta GOOGLE_CLIENT_ID en attadia.com/.env" });
        return true;
      }
      const state = randomBytes(16).toString("hex");
      const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      auth.searchParams.set("client_id", id);
      auth.searchParams.set("redirect_uri", googleRedirectUri(req));
      auth.searchParams.set("response_type", "code");
      auth.searchParams.set("scope", "openid email profile");
      auth.searchParams.set("state", state);
      auth.searchParams.set("prompt", "select_account");
      sendRedirect(res, auth.toString(), { "Set-Cookie": oauthCookie(state, 600) });
      return true;
    }

    if (path === "/api/google/callback" && method === "GET") {
      const errCode = url.searchParams.get("error");
      if (errCode) {
        sendRedirect(res, "/?error=google");
        return true;
      }
      const state = url.searchParams.get("state") || "";
      const expected = readOauthState(req.headers.cookie);
      if (!state || !expected || state !== expected) {
        sendRedirect(res, "/?error=google");
        return true;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        sendRedirect(res, "/?error=google");
        return true;
      }
      const user = await googleUserFromCode(req, code);
      if (!isAllowed(user.email)) {
        sendRedirect(res, "/?error=denied", { "Set-Cookie": oauthCookie("", 0) });
        return true;
      }
      sendRedirect(res, "/", {
        "Set-Cookie": [
          sessionCookie(signSession(user), 7 * 24 * 60 * 60),
          oauthCookie("", 0),
        ],
      });
      return true;
    }

    if (path === "/api/login" && method === "POST") {
      const body = await readBody();
      const user = await loginAgainstTech(body.email, body.password);
      if (!isAllowed(user.email)) {
        sendJson(res, 403, { error: "Sin acceso a la intranet" });
        return true;
      }
      sendJson(
        res,
        200,
        { user: { email: normalizeEmail(user.email), nombre: user.nombre || "", owner: isOwner(user.email) } },
        { "Set-Cookie": sessionCookie(signSession(user), 7 * 24 * 60 * 60) },
      );
      return true;
    }

    if (path === "/api/logout" && method === "POST") {
      sendJson(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
      return true;
    }

    const session = readSession(req.headers.cookie);
    if (path === "/api/me" && method === "GET") {
      if (!session) {
        sendJson(res, 401, { authenticated: false });
        return true;
      }
      sendJson(res, 200, { authenticated: true, user: session });
      return true;
    }

    if (path === "/api/admins" && method === "GET") {
      if (!session) {
        sendJson(res, 401, { error: "No autenticado" });
        return true;
      }
      sendJson(res, 200, { emails: readAdmins(), owner: ownerEmail() });
      return true;
    }

    if (path === "/api/admins" && method === "POST") {
      if (!session) {
        sendJson(res, 401, { error: "No autenticado" });
        return true;
      }
      const body = await readBody();
      const emails = addAdmin(session.email, body.email);
      sendJson(res, 200, { emails, owner: ownerEmail() });
      return true;
    }

    if (path === "/api/admins" && method === "DELETE") {
      if (!session) {
        sendJson(res, 401, { error: "No autenticado" });
        return true;
      }
      const email = url.searchParams.get("email");
      const emails = removeAdmin(session.email, email);
      sendJson(res, 200, { emails, owner: ownerEmail() });
      return true;
    }
  } catch (err) {
    if (path.startsWith("/api/google")) {
      sendRedirect(res, "/?error=google");
      return true;
    }
    sendJson(res, err.status || 500, { error: err.message || "Error" });
    return true;
  }

  return false;
}
