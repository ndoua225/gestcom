/* GestCom - authentification 100% front-end (stockage localStorage). */
(function () {
  var K = { company: "gestcom_company", users: "gestcom_users", session: "gestcom_session",
            attempts: "gestcom_attempts", audit: "gestcom_audit" };
  var MAX_ATTEMPTS = 5, LOCK_MS = 5 * 60 * 1000, SESSION_MS = 2 * 60 * 60 * 1000;
  var ROLES = { admin: "Administrateur", manager: "Manager", vendeur: "Vendeur" };
  var enc = new TextEncoder();

  function read(store, key, def) {
    try { var v = store.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function write(store, key, val) { store.setItem(key, JSON.stringify(val)); }

  function b64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
  function unb64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }

  async function hash(password, saltB64) {
    var salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
    var key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    var bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: salt, iterations: 150000, hash: "SHA-256" }, key, 256);
    return { salt: b64(salt), hash: b64(bits) };
  }

  function audit(action, userId) {
    var log = read(localStorage, K.audit, []);
    log.push({ action: action, userId: userId || null, at: new Date().toISOString() });
    write(localStorage, K.audit, log.slice(-500));
    if (window.Cloud) Cloud.scheduleSync();
  }

  var Auth = {
    ROLES: ROLES, MAX_ATTEMPTS: MAX_ATTEMPTS, hash: hash, audit: audit,
    users: function () { return read(localStorage, K.users, []); },
    saveUsers: function (u) { write(localStorage, K.users, u); if (window.Cloud) Cloud.scheduleSync(); },
    auditLog: function () { return read(localStorage, K.audit, []); },
    currentUser: function () {
      var s = Auth.session();
      return s ? (Auth.users().find(function (u) { return u.id === s.userId; }) || null) : null;
    },
    adminExists: function () {
      if (window.Cloud && Cloud.enabled()) return true;
      return read(localStorage, K.users, []).some(function (u) { return u.role === "admin"; });
    },
    cloudEnabled: function () { return !!(window.Cloud && Cloud.enabled()); },
    syncCloud: function () { return window.Cloud ? Cloud.syncNow() : Promise.resolve(); },
    updateCloudPassword: function (password) {
      return window.Cloud && Cloud.enabled() ? Cloud.updatePassword(password) : Promise.resolve();
    },
    company: function () { return read(localStorage, K.company, null); },
    homeFor: function (role) { return role + "-dashboard.html"; },

    /* Premier lancement : sans admin, tout mène à setup.html ; avec admin, setup.html est fermé. */
    enforceSetupState: function (page) {
      var exists = Auth.adminExists();
      if (page === "setup" && exists) location.replace("login.html");
      if (page !== "setup" && !exists) location.replace("setup.html");
    },

    createAdmin: async function (data) {
      if (Auth.adminExists()) throw new Error("Un administrateur existe déjà.");
      var users = read(localStorage, K.users, []);
      if (users.some(function (u) { return u.email === data.email.toLowerCase() || u.username === data.username.toLowerCase(); }))
        throw new Error("Cet email ou nom d'utilisateur est déjà utilisé.");
      var h = await hash(data.password);
      var user = { id: Date.now(), nom: data.nom, prenom: data.prenom, email: data.email.toLowerCase(),
        telephone: data.telephone, username: data.username.toLowerCase(), salt: h.salt, hash: h.hash,
        role: "admin", statut: "actif", createdAt: new Date().toISOString() };
      write(localStorage, K.company, data.company);
      users.push(user);
      write(localStorage, K.users, users);
      audit("admin_created", user.id);
    },

    inviteUser: function (data) {
      var users = Auth.users();
      var email = data.email.toLowerCase();
      if (users.some(function (u) { return u.email === email; })) throw new Error("Un compte utilise déjà cet email.");
      var token = DB.newToken();
      var user = { id: DB.uid(), nom: data.nom, prenom: data.prenom, email: email,
        telephone: data.telephone || "", username: email, role: data.role, statut: "invité",
        magasinId: data.magasinId || "", createdAt: new Date().toISOString(), inviteToken: token };
      users.push(user); Auth.saveUsers(users);
      DB.add("tokens", { token: token, userId: user.id, kind: "invitation", createdAt: new Date().toISOString() });
      audit("user_invited", user.id);
      return user;
    },

    acceptInvitation: async function (token, password) {
      var link = DB.all("tokens").find(function (x) { return x.token === token && x.kind === "invitation"; });
      var users = Auth.users(), user = link && users.find(function (x) { return x.id === link.userId; });
      if (!user || user.statut !== "invité") throw new Error("Cette invitation est invalide ou a déjà été utilisée.");
      var h = await hash(password);
      user.salt = h.salt; user.hash = h.hash; user.statut = "actif"; user.inviteToken = null;
      Auth.saveUsers(users); DB.remove("tokens", link.id); audit("invitation_accepted", user.id);
      return user;
    },

    issuePasswordReset: function (email) {
      var user = Auth.users().find(function (x) { return x.email === email.trim().toLowerCase() && x.statut === "actif"; });
      if (!user) return null;
      DB.all("tokens").filter(function (x) { return x.userId === user.id && x.kind === "reset"; }).forEach(function (x) { DB.remove("tokens", x.id); });
      var token = DB.newToken();
      DB.add("tokens", { token: token, userId: user.id, kind: "reset", createdAt: new Date().toISOString() });
      audit("password_reset_requested", user.id);
      return token;
    },

    resetPassword: async function (token, password) {
      var link = DB.all("tokens").find(function (x) { return x.token === token && x.kind === "reset"; });
      if (!link || Date.now() - new Date(link.createdAt).getTime() > 30 * 60 * 1000) throw new Error("Ce lien est invalide ou a expiré.");
      var users = Auth.users(), user = users.find(function (x) { return x.id === link.userId; });
      if (!user) throw new Error("Ce compte est introuvable.");
      var h = await hash(password); user.salt = h.salt; user.hash = h.hash;
      Auth.saveUsers(users); DB.remove("tokens", link.id); audit("password_reset_completed", user.id);
    },

    login: async function (identifier, password, role, remember) {
      identifier = identifier.trim().toLowerCase();
      if (window.Cloud && Cloud.enabled()) {
        var localUser = Auth.users().find(function (u) { return u.username === identifier || u.email === identifier; });
        var email = identifier.indexOf("@") >= 0 ? identifier : (localUser && localUser.email);
        if (!email) throw new Error("Sur un nouvel appareil, connectez-vous avec l’adresse email du compte.");
        var remoteUser = null;
        try {
          remoteUser = await Cloud.signIn(email, password, remember);
        } catch (signInError) {
          if (!localUser || !localUser.hash) throw new Error("Identifiants, mot de passe ou rôle incorrect.");
          var localHash = await hash(password, localUser.salt);
          if (localHash.hash !== localUser.hash) throw new Error("Identifiants, mot de passe ou rôle incorrect.");
          try {
            var registered = await Cloud.signUp(email, password, {
              username: localUser.username, nom: localUser.nom, prenom: localUser.prenom
            }, remember);
            if (!registered || !registered.access_token) {
              throw new Error("Un email de confirmation Supabase a été envoyé. Confirmez-le, puis reconnectez-vous sur cet appareil pour synchroniser GestCom.");
            }
            remoteUser = registered.user;
          } catch (signUpError) {
            if (signUpError.message.indexOf("email de confirmation") >= 0) throw signUpError;
            throw new Error("Connexion Supabase impossible. Vérifiez l’email et le mot de passe ou confirmez l’adresse email du compte.");
          }
        }
        if (!remoteUser) remoteUser = await Cloud.user();
        if (!remoteUser) throw new Error("La session Supabase n’a pas pu être ouverte.");
        var payload = await Cloud.load(remoteUser.id);
        if (payload) Cloud.apply(payload);
        else if (localUser) await Cloud.syncNow();
        else throw new Error("Aucune sauvegarde GestCom n’est associée à ce compte. Ouvrez d’abord GestCom sur le téléphone où le compte a été créé et connectez-vous une fois avec votre email.");

        var user = Auth.users().find(function (u) { return u.email === email; });
        if (!user || user.role !== role) throw new Error("Identifiants, mot de passe ou rôle incorrect.");
        if (user.statut !== "actif") throw new Error("Ce compte n'est pas actif. Contactez l'administrateur.");
        var cloudSession = { userId: user.id, role: user.role, name: user.prenom + " " + user.nom,
          expires: Date.now() + SESSION_MS };
        sessionStorage.removeItem(K.session); localStorage.removeItem(K.session);
        write(remember ? localStorage : sessionStorage, K.session, cloudSession);
        audit("login", user.id);
        Cloud.scheduleSync();
        return cloudSession;
      }
      var attempts = read(localStorage, K.attempts, {});
      var a = attempts[identifier];
      if (a && a.n >= MAX_ATTEMPTS && Date.now() - a.t < LOCK_MS)
        throw new Error("Trop de tentatives. Réessayez dans quelques minutes.");
      var user = read(localStorage, K.users, []).find(function (u) {
        return u.username === identifier || u.email === identifier;
      });
      var ok = false;
      if (user && user.hash && user.role === role) ok = (await hash(password, user.salt)).hash === user.hash;
      if (!ok) {
        var n = (a && Date.now() - a.t < LOCK_MS) ? a.n + 1 : 1;
        attempts[identifier] = { n: n, t: Date.now() };
        write(localStorage, K.attempts, attempts);
        throw new Error("Identifiants, mot de passe ou rôle incorrect.");
      }
      if (user.statut !== "actif") throw new Error("Ce compte n'est pas actif. Contactez l'administrateur.");
      delete attempts[identifier];
      write(localStorage, K.attempts, attempts);
      var s = { userId: user.id, role: user.role, name: user.prenom + " " + user.nom,
                expires: Date.now() + SESSION_MS };
      sessionStorage.removeItem(K.session); localStorage.removeItem(K.session);
      write(remember ? localStorage : sessionStorage, K.session, s);
      audit("login", user.id);
      return s;
    },

    session: function () {
      var s = read(sessionStorage, K.session, null) || read(localStorage, K.session, null);
      if (s && s.expires < Date.now()) { Auth.logout(true); return null; }
      return s;
    },

    logout: function (silent) {
      var s = read(sessionStorage, K.session, null) || read(localStorage, K.session, null);
      if (s && !silent) audit("logout", s.userId);
      sessionStorage.removeItem(K.session); localStorage.removeItem(K.session);
      if (window.Cloud && Cloud.enabled()) Cloud.signOut();
    },

    /* Protège une page par rôle (contrôle d'accès côté client). */
    guard: function (role) {
      Auth.enforceSetupState("guard");
      var s = Auth.session();
      if (!s) { location.replace("login.html"); return null; }
      var cu = Auth.currentUser();
      if (!cu || cu.statut !== "actif") { Auth.logout(true); location.replace("login.html"); return null; }
      if (s.role !== role || cu.role !== role) { location.replace("acces-refuse.html"); return null; }
      return s;
    }
  };
  window.Auth = Auth;

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-toggle]");
    if (!btn) return;
    var input = document.getElementById(btn.dataset.toggle);
    var show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-label", show ? "Masquer le mot de passe" : "Afficher le mot de passe");
  });
})();
