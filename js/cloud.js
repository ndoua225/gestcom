/* Synchronisation GestCom avec Supabase Auth + une sauvegarde privée par compte. */
(function () {
  var cfg = window.GESTCOM_SUPABASE_CONFIG || {};
  var enabled = !!(cfg.url && cfg.publishableKey);
  var TOKEN_KEY = "gestcom_supabase_session";
  var TABLE = "gestcom_workspace";
  var timer = null, syncInProgress = Promise.resolve();

  function token() {
    try { var s = JSON.parse(localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || "null"); return s && s.access_token ? s : null; }
    catch (_) { return null; }
  }
  function saveToken(s, remember) {
    var value = JSON.stringify(s);
    if (remember === undefined) remember = !sessionStorage.getItem(TOKEN_KEY);
    if (remember) { sessionStorage.removeItem(TOKEN_KEY); localStorage.setItem(TOKEN_KEY, value); }
    else { localStorage.removeItem(TOKEN_KEY); sessionStorage.setItem(TOKEN_KEY, value); }
  }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); }
  function errorMessage(body, fallback) {
    return body && (body.msg || body.message || body.error_description || body.error) || fallback;
  }
  async function request(path, options, authToken) {
    options = options || {};
    var headers = Object.assign({ apikey: cfg.publishableKey, "Content-Type": "application/json" }, options.headers || {});
    if (authToken) headers.Authorization = "Bearer " + authToken;
    var res = await fetch(cfg.url.replace(/\/$/, "") + path, Object.assign({}, options, { headers: headers }));
    var body = null;
    try { body = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error(errorMessage(body, "Erreur Supabase (" + res.status + ")."));
    return body;
  }
  function localSnapshot() {
    return { company: localStorage.getItem("gestcom_company"), users: localStorage.getItem("gestcom_users"),
      data: window.DB && DB.export ? DB.export() : JSON.parse(localStorage.getItem("gestcom_data") || "null"),
      audit: localStorage.getItem("gestcom_audit") };
  }
  function applySnapshot(payload) {
    if (!payload) return;
    if (payload.company) localStorage.setItem("gestcom_company", typeof payload.company === "string" ? payload.company : JSON.stringify(payload.company));
    if (payload.users) localStorage.setItem("gestcom_users", typeof payload.users === "string" ? payload.users : JSON.stringify(payload.users));
    if (payload.data) localStorage.setItem("gestcom_data", JSON.stringify(payload.data));
    if (payload.audit) localStorage.setItem("gestcom_audit", typeof payload.audit === "string" ? payload.audit : JSON.stringify(payload.audit));
    if (window.DB && DB.reload) DB.reload();
  }
  async function currentUser() {
    var s = token();
    if (!s) return null;
    if (s.expires_at && s.expires_at * 1000 < Date.now() + 30000) {
      var previousUser = s.user;
      var refreshed = await request("/auth/v1/token?grant_type=refresh_token", {
        method: "POST", body: JSON.stringify({ refresh_token: s.refresh_token })
      });
      if (!refreshed.user) refreshed.user = previousUser;
      saveToken(refreshed); s = refreshed;
    }
    return s.user || null;
  }
  async function getWorkspace(userId) {
    var s = token();
    var rows = await request("/rest/v1/" + TABLE + "?select=owner_id,payload&owner_id=eq." + encodeURIComponent(userId) + "&limit=1", {}, s && s.access_token);
    return rows && rows[0] ? rows[0].payload : null;
  }
  async function saveWorkspace(userId, payload) {
    var s = token();
    await request("/rest/v1/" + TABLE, {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ owner_id: userId, payload: payload, updated_at: new Date().toISOString() })
    }, s && s.access_token);
  }

  window.Cloud = {
    enabled: function () { return enabled; },
    signIn: async function (email, password, remember) {
      var s = await request("/auth/v1/token?grant_type=password", {
        method: "POST", body: JSON.stringify({ email: email, password: password })
      });
      if (!s.expires_at && s.expires_in) s.expires_at = Math.floor(Date.now() / 1000) + s.expires_in;
      saveToken(s, remember); return s.user;
    },
    signUp: async function (email, password, metadata, remember) {
      var redirectTo = location.origin + location.pathname;
      var s = await request("/auth/v1/signup?redirect_to=" + encodeURIComponent(redirectTo), {
        method: "POST", body: JSON.stringify({ email: email, password: password, data: metadata || {} })
      });
      if (s && s.access_token) {
        if (!s.expires_at && s.expires_in) s.expires_at = Math.floor(Date.now() / 1000) + s.expires_in;
        saveToken(s, remember);
      }
      return s;
    },
    updatePassword: async function (password) {
      var s = token();
      if (!s) throw new Error("Reconnectez-vous pour modifier le mot de passe.");
      await request("/auth/v1/user", { method: "PUT", body: JSON.stringify({ password: password }) }, s.access_token);
    },
    user: currentUser,
    load: getWorkspace,
    apply: applySnapshot,
    save: saveWorkspace,
    syncNow: async function () {
      if (!enabled) return;
      var user = await currentUser();
      if (!user) return;
      var payload = localSnapshot();
      syncInProgress = syncInProgress.catch(function () {}).then(function () { return saveWorkspace(user.id, payload); });
      return syncInProgress;
    },
    scheduleSync: function () {
      if (!enabled || !token()) return;
      clearTimeout(timer); timer = setTimeout(function () {
        window.Cloud.syncNow().catch(function (err) { console.warn("Synchronisation GestCom indisponible:", err.message); });
      }, 700);
    },
    signOut: async function () {
      var s = token();
      clearToken();
      if (s && s.access_token) {
        try { await request("/auth/v1/logout", { method: "POST" }, s.access_token); } catch (_) {}
      }
    }
  };
})();
