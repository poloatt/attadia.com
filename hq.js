(function () {
  const local = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);

  const LINKS = {
    foco: local ? "http://localhost:5173" : "https://foco.attadia.com",
    caja: local ? "http://localhost:5174" : "https://atta.attadia.com",
    pulso: local ? "http://localhost:5175" : "https://pulso.attadia.com",
    boeda: "https://boeda.attadia.com/",
    atta: local ? "http://localhost:3000/atta" : "https://attadia.com/atta",
  };

  const app = document.getElementById("app");
  let accountMenuAbort = null;

  function tile(href, icon, name) {
    return (
      '<a class="tile" href="' + href + '">' +
      '<img src="' + icon + '" alt="">' +
      "<span>" + name + "</span>" +
      "</a>"
    );
  }

  function api(path, options) {
    return fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      credentials: "same-origin",
    });
  }

  function renderLogin(error) {
    app.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "login-wrap";
    wrap.innerHTML =
      '<div class="panel">' +
      '<div class="login-brand"><img src="/logos/atta/atta-logo.svg" alt=""><span>Attadía</span></div>' +
      '<p class="err" id="err"></p>' +
      '<a class="btn btn-google" href="/api/google">Continuar con Google</a>' +
      '<p class="or">o email y contraseña</p>' +
      '<form autocomplete="on">' +
      '<label for="email">Email</label>' +
      '<input id="email" name="email" type="email" autocomplete="username">' +
      '<label for="password">Contraseña</label>' +
      '<input id="password" name="password" type="password" autocomplete="current-password">' +
      '<button class="btn btn-secondary" type="submit">Entrar</button>' +
      "</form></div>";
    app.appendChild(wrap);
    if (error) document.getElementById("err").textContent = error;

    wrap.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = wrap.querySelector('button[type="submit"]');
      btn.disabled = true;
      document.getElementById("err").textContent = "";
      try {
        const email = wrap.querySelector("#email").value.trim();
        const password = wrap.querySelector("#password").value;
        if (!email || !password) throw new Error("Completá email y contraseña, o usá Google");
        const res = await api("/api/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "No se pudo entrar");
        renderHq(data.user || {});
      } catch (err) {
        document.getElementById("err").textContent = err.message || "No se pudo entrar";
        btn.disabled = false;
      }
    });
  }

  function initials(user) {
    const name = String(user.nombre || "").trim();
    if (name) {
      const parts = name.split(/\s+/).filter(Boolean);
      const letters = (parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
      return letters.toUpperCase() || "?";
    }
    const email = String(user.email || "").trim();
    return (email[0] || "?").toUpperCase();
  }

  function bindAccountMenu(root, user) {
    const account = root.querySelector("#account");
    const trigger = root.querySelector("#account-btn");
    const menu = root.querySelector("#account-menu");
    const out = root.querySelector("#out");
    if (!account || !trigger || !menu || !out) return;

    const name = String(user.nombre || "").trim();
    const email = String(user.email || "").trim();
    const display = name || email.split("@")[0] || "Cuenta";

    root.querySelector("#avatar").textContent = initials(user);
    root.querySelector("#who").textContent = display;
    const emailEl = root.querySelector("#who-email");
    if (name && email) {
      emailEl.textContent = email;
      emailEl.hidden = false;
    } else {
      emailEl.hidden = true;
    }
    const menuName = root.querySelector("#menu-name");
    const menuEmail = root.querySelector("#menu-email");
    const menuRole = root.querySelector("#menu-role");
    menuName.textContent = display;
    menuEmail.textContent = email;
    menuEmail.hidden = !email;
    if (user.owner) {
      menuRole.hidden = false;
    } else {
      menuRole.remove();
    }

    function setOpen(open) {
      account.classList.toggle("open", open);
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
      menu.hidden = !open;
    }

    if (accountMenuAbort) accountMenuAbort.abort();
    accountMenuAbort = new AbortController();
    const { signal } = accountMenuAbort;

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(menu.hidden);
    }, { signal });

    document.addEventListener("click", (e) => {
      if (!account.contains(e.target)) setOpen(false);
    }, { signal });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    }, { signal });

    out.addEventListener("click", async () => {
      out.disabled = true;
      out.textContent = "Saliendo…";
      try {
        await api("/api/logout", { method: "POST" });
      } finally {
        if (accountMenuAbort) accountMenuAbort.abort();
        renderLogin();
      }
    }, { signal });
  }

  function renderHq(user) {
    app.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "wrap";
    wrap.innerHTML =
      '<header class="top">' +
      '<div class="brand"><img src="/logos/atta/atta-logo.svg" alt=""><h1>Attadía</h1></div>' +
      '<div class="account" id="account">' +
      '<button class="account-trigger" type="button" id="account-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="account-menu">' +
      '<span class="account-avatar" id="avatar" aria-hidden="true"></span>' +
      '<span class="account-meta">' +
      '<span class="account-name" id="who"></span>' +
      '<span class="account-email" id="who-email"></span>' +
      "</span>" +
      '<span class="account-caret" aria-hidden="true"></span>' +
      "</button>" +
      '<div class="account-menu" id="account-menu" role="menu" hidden>' +
      '<div class="account-menu-head">' +
      '<p class="account-menu-name" id="menu-name"></p>' +
      '<p class="account-menu-email" id="menu-email"></p>' +
      '<p class="account-menu-role" id="menu-role" hidden>Owner</p>' +
      "</div>" +
      '<button class="account-menu-item" type="button" role="menuitem" id="out">Salir</button>' +
      "</div></div>" +
      "</header>" +
      '<div class="grid">' +
      '<section class="branch"><h2>Real Estate</h2><div class="tiles">' +
      tile(LINKS.boeda, "/logos/boeda/boeda-icon.svg", "Boeda") +
      "</div></section>" +
      '<section class="branch"><h2>Technologies</h2><div class="tiles">' +
      tile(LINKS.foco, "/logos/foco/foco-icon.svg", "Foco") +
      tile(LINKS.caja, "/logos/caja/caja-icon.svg", "Caja") +
      tile(LINKS.pulso, "/logos/pulso/pulso-icon.svg", "Pulso") +
      "</div></section>" +
      '<section class="branch"><h2>Practice</h2><div class="tiles">' +
      tile(LINKS.atta, "/logos/atta/atta-icon.svg", "ATTA") +
      "</div></section>" +
      "</div>" +
      '<section id="access" class="access" hidden>' +
      '<button class="access-toggle" type="button" id="access-toggle" aria-expanded="false" aria-controls="access-panel">' +
      '<span class="access-toggle-main">' +
      '<span class="access-title">Acceso intranet</span>' +
      '<span class="access-summary" id="access-summary">Cargando…</span>' +
      "</span>" +
      '<span class="access-caret" aria-hidden="true"></span>' +
      "</button>" +
      '<div class="access-panel" id="access-panel" hidden>' +
      '<p class="note">Solo el owner puede dar o quitar entrada. Quien no esté en esta lista no entra, aunque tenga usuario en las apps.</p>' +
      '<ul id="admins"></ul>' +
      '<form id="add-admin">' +
      '<input type="email" name="email" placeholder="email@dominio.com" required>' +
      '<button class="btn" type="submit">Dar acceso</button>' +
      "</form>" +
      "</div></section>";

    bindAccountMenu(wrap, user);
    app.appendChild(wrap);

    if (user.owner) {
      const access = wrap.querySelector("#access");
      const toggle = wrap.querySelector("#access-toggle");
      const panel = wrap.querySelector("#access-panel");
      access.hidden = false;

      toggle.addEventListener("click", () => {
        const open = panel.hidden;
        panel.hidden = !open;
        access.classList.toggle("open", open);
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });

      loadAdmins();
      wrap.querySelector("#add-admin").addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = e.target.email.value.trim();
        const res = await api("/api/admins", { method: "POST", body: JSON.stringify({ email }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(data.error || "No se pudo agregar");
          return;
        }
        e.target.reset();
        paintAdmins(data.emails, data.owner);
      });
    }
  }

  async function loadAdmins() {
    const res = await api("/api/admins", { method: "GET" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) paintAdmins(data.emails || [], data.owner);
  }

  function paintAdmins(emails, owner) {
    const summary = document.getElementById("access-summary");
    if (summary) {
      const n = emails.length;
      summary.textContent = n === 1 ? "1 persona con acceso" : n + " personas con acceso";
    }

    const list = document.getElementById("admins");
    if (!list) return;
    list.innerHTML = "";
    emails.forEach((email) => {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = email === owner ? email + " (owner)" : email;
      li.appendChild(label);
      if (email !== owner) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-ghost";
        btn.textContent = "Quitar";
        btn.addEventListener("click", async () => {
          const res = await api("/api/admins?email=" + encodeURIComponent(email), { method: "DELETE" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            alert(data.error || "No se pudo quitar");
            return;
          }
          paintAdmins(data.emails, data.owner);
        });
        li.appendChild(btn);
      }
      list.appendChild(li);
    });
  }

  async function boot() {
    const params = new URLSearchParams(location.search);
    const err = params.get("error");
    if (err && (location.pathname === "/" || location.pathname === "/index.html")) {
      history.replaceState({}, "", "/");
    }
    const loginError =
      err === "denied"
        ? "Esa cuenta no tiene acceso a la intranet"
        : err === "google"
          ? "No se pudo entrar con Google"
          : "";
    try {
      const res = await api("/api/me", { method: "GET" });
      const data = await res.json().catch(() => ({}));
      if (data.authenticated && data.user) {
        renderHq(data.user);
        return;
      }
    } catch (_) {
      /* login */
    }
    renderLogin(loginError);
  }

  boot();
})();
