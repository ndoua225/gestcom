/* Coque de l'application : navigation, routeur, permissions, recherche, notifications, animations. */
(function () {
  var role = document.body.dataset.role, session = Auth.guard(role);
  if (!session) return;
  var E = UI.esc;
  var GC = window.GC = { modules: {}, role: role, params: new URLSearchParams() };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Données de contexte ---------- */
  GC.user = function () { return Auth.currentUser(); };
  GC.company = function () { return Auth.company() || { name: "GestCom", settings: {} }; };
  GC.settings = function () {
    return Object.assign({ currency: "FCFA", taxRate: 0,
      paymentMethods: ["Espèces", "Carte bancaire", "Mobile Money", "Virement"] }, GC.company().settings || {});
  };

  /* RBAC : r=lire c=créer u=modifier d=supprimer w=écrire x=annuler/rembourser */
  var PERMS = {
    admin:   { products: "rcud", categories: "rcud", stock: "rw", customers: "rcud", suppliers: "rcud", users: "rcud", stores: "rcud", goals: "rcud", settings: "rw", sales: "rcx" },
    manager: { products: "rcu",  categories: "r",    stock: "rw", customers: "rcud", suppliers: "rcu",  users: "r",    stores: "r",    goals: "rcud", settings: "r",  sales: "rcx" },
    vendeur: { products: "r",    categories: "r",    stock: "r",  customers: "rcu",  suppliers: "",     users: "",     stores: "",     goals: "r",    settings: "r",  sales: "rc" }
  };
  GC.PERMS = PERMS;
  GC.DISCOUNT_MAX = { admin: 100, manager: 30, vendeur: 10 };
  GC.can = function (res, l) { return (PERMS[role][res] || "").indexOf(l) >= 0; };

  GC.scope = function (arr, key) {
    if (role === "admin") return arr;
    var u = GC.user(); key = key || "magasinId";
    return arr.filter(function (x) { return x[key] === u.magasinId; });
  };
  GC.storeName = function (id) { var s = DB.find("stores", id); return s ? s.nom : "—"; };
  GC.userName = function (id) {
    var u = Auth.users().find(function (x) { return x.id === id; }); return u ? u.prenom + " " + u.nom : "—";
  };
  GC.salesScoped = function () {
    var all = DB.all("sales"), u = GC.user();
    if (role === "admin") return all;
    if (role === "manager") return all.filter(function (s) { return s.magasinId === u.magasinId; });
    return all.filter(function (s) { return s.vendeurId === u.id; });
  };
  GC.paid = function (a) { return a.filter(function (s) { return s.status === "Payée"; }); };
  GC.sum = function (a, f) { return a.reduce(function (t, x) { return t + f(x); }, 0); };
  GC.day = function (iso) { return new Date(iso).toLocaleDateString("sv-SE"); };
  GC.level = function (p) { return p.stock <= 0 ? "rupture" : p.stock <= (p.seuil || 0) ? "faible" : "dispo"; };
  GC.levelBadge = function (p) {
    var l = GC.level(p);
    return l === "rupture" ? UI.badge("🔴 Rupture", "red") : l === "faible" ? UI.badge("🟠 Stock faible (" + p.stock + ")", "orange") : UI.badge("🟢 " + p.stock + " en stock", "green");
  };
  GC.act = function (act, id, label, cls) {
    return '<button class="btn xs ' + (cls || "ghost") + '" data-act="' + act + '" data-id="' + E(id) + '">' + label + "</button>";
  };
  GC.head = function (title, sub, actions) {
    return '<div class="page-head"><div><h1>' + E(title) + "</h1>" + (sub ? "<p>" + E(sub) + "</p>" : "") +
      '</div><div class="head-actions">' + (actions || "") + "</div></div>";
  };
  GC.countUp = function (n, fmt) {
    var txt = fmt === "money" ? UI.money(n) : fmt === "pct" ? Math.round(n) + " %" : UI.num(n);
    return '<span class="count" data-to="' + n + '" data-fmt="' + (fmt || "num") + '">' + txt + "</span>";
  };

  GC.moveStock = function (p, delta, type, motif) {
    var before = p.stock, after = Math.max(0, before + delta), u = GC.user();
    DB.update("products", p.id, { stock: after });
    DB.add("movements", { productId: p.id, productName: p.nom, magasinId: p.magasinId, type: type,
      qty: after - before, before: before, after: after, motif: motif || "", userId: u.id,
      userName: u.prenom + " " + u.nom, date: new Date().toISOString() });
    if (after === 0 && before > 0) DB.notify("rupture", "Rupture de stock : " + p.nom, { roles: ["admin", "manager"], magasinId: p.magasinId });
    else if (after <= (p.seuil || 0) && before > (p.seuil || 0))
      DB.notify("stock", "Stock faible : " + p.nom + " (" + after + " restant)", { roles: ["admin", "manager"], magasinId: p.magasinId });
  };

  GC.goalProgress = function (g) {
    var sales = GC.paid(DB.all("sales")).filter(function (s) {
      return GC.day(s.date).slice(0, 7) === g.periode &&
        (g.portee === "individuel" ? s.vendeurId === g.userId : s.magasinId === g.magasinId);
    });
    var real = 0;
    if (g.indicateur === "ca") real = GC.sum(sales, function (s) { return s.total; });
    else if (g.indicateur === "ventes") real = sales.length;
    else if (g.indicateur === "produits") real = GC.sum(sales, function (s) { return GC.sum(s.items, function (i) { return i.qty; }); });
    else real = DB.all("customers").filter(function (c) {
      return GC.day(c.createdAt).slice(0, 7) === g.periode && (g.portee === "individuel" ? c.createdBy === g.userId : c.magasinId === g.magasinId);
    }).length;
    return { real: real, pct: g.cible ? real / g.cible * 100 : 0 };
  };
  GC.INDICATEURS = { ca: "Chiffre d'affaires", ventes: "Nombre de ventes", clients: "Nouveaux clients", produits: "Produits vendus" };
  GC.fmtGoal = function (g, v) { return g.indicateur === "ca" ? UI.money(v) : UI.num(v); };

  /* ---------- Vue liste générique (filtres + pagination) ---------- */
  GC.listView = function (el, o) {
    var page = 1;
    el.innerHTML = GC.head(o.title, o.sub, o.actions) + (o.top || "") +
      '<div class="filters">' + (o.filters || "") + '</div><div class="list-body"></div>';
    var body = el.querySelector(".list-body");
    function vals() { var v = {}; el.querySelectorAll(".filters [name]").forEach(function (i) { v[i.name] = i.value; }); return v; }
    function draw() {
      var rows = o.rows(vals()), per = o.per || 10, pages = Math.max(1, Math.ceil(rows.length / per));
      if (page > pages) page = pages;
      body.innerHTML = (o.summary ? o.summary(rows) : "") +
        UI.table(o.cols, rows.slice((page - 1) * per, page * per), o.empty) + UI.pager(rows.length, page, per);
      GC.animate(body);
    }
    el.addEventListener("input", function (e) { if (e.target.closest(".filters")) { page = 1; draw(); } });
    el.addEventListener("click", function (e) {
      var p = e.target.closest("[data-page]");
      if (p) { page = +p.dataset.page; draw(); return; }
      var a = e.target.closest("[data-act]");
      if (a) o.onAction(a.dataset.act, a.dataset.id, draw);
    });
    draw();
    return { redraw: draw };
  };

  /* ---------- Animations ---------- */
  GC.animate = function (root) {
    root.querySelectorAll(".kpi,.panel-c,.pcard,.goal").forEach(function (n, i) { n.style.setProperty("--i", i); });
    root.querySelectorAll(".count:not([data-done])").forEach(function (el) {
      el.dataset.done = 1;
      if (reduce) return;
      var to = +el.dataset.to, fmt = el.dataset.fmt, t0 = performance.now(), dur = 1000;
      function fmtv(v) { return fmt === "money" ? UI.money(v) : fmt === "pct" ? Math.round(v) + " %" : UI.num(v); }
      function f(t) {
        var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = fmtv(to * e); if (k < 1) requestAnimationFrame(f);
      }
      requestAnimationFrame(f);
    });
    /* barres de progression : remplissage animé */
    root.querySelectorAll(".progress i:not([data-w])").forEach(function (b) {
      var w = b.style.width; b.dataset.w = w; b.style.width = "0";
      requestAnimationFrame(function () { requestAnimationFrame(function () { b.style.width = w; }); });
    });
    root.querySelectorAll(".hbars i:not([data-w])").forEach(function (b) {
      var w = b.style.width; b.dataset.w = w; b.style.width = "0";
      requestAnimationFrame(function () { requestAnimationFrame(function () { b.style.width = w; }); });
    });
  };

  /* ---------- Navigation ---------- */
  var NAV = {
    admin: [["dashboard", "Tableau de bord", "🏠"], ["ventes", "Ventes", "🧾"], ["pos", "Point de vente", "🛒"], ["produits", "Produits", "📦"],
      ["categories", "Catégories", "🏷️"], ["stock", "Stock", "📊"], ["clients", "Clients", "👥"], ["fournisseurs", "Fournisseurs", "🚚"],
      ["magasins", "Magasins", "🏬"], ["utilisateurs", "Utilisateurs", "👤"], ["roles", "Rôles & permissions", "🔐"], ["objectifs", "Objectifs", "🎯"],
      ["rapports", "Rapports", "📈"], ["parametres", "Paramètres", "⚙️"], ["aide", "Aide & Support", "❓"]],
    manager: [["dashboard", "Tableau de bord", "🏠"], ["ventes", "Ventes", "🧾"], ["pos", "Point de vente", "🛒"], ["produits", "Produits", "📦"],
      ["stock", "Stock", "📊"], ["clients", "Clients", "👥"], ["fournisseurs", "Fournisseurs", "🚚"], ["vendeurs", "Vendeurs", "🧑‍💼"],
      ["rapports", "Rapports", "📈"], ["objectifs", "Objectifs", "🎯"], ["parametres", "Paramètres", "⚙️"], ["aide", "Aide & Support", "❓"]],
    vendeur: [["dashboard", "Accueil", "🏠"], ["pos", "Point de vente", "🛒"], ["mes-ventes", "Mes ventes", "🧾"], ["produits", "Produits", "📦"],
      ["clients", "Clients", "👥"], ["stock", "Stock", "📊"], ["historique", "Historique", "🕘"], ["rapports", "Rapports", "📈"],
      ["profil", "Mon profil", "🙍"], ["parametres", "Paramètres", "⚙️"], ["aide", "Aide & Support", "❓"]]
  };
  var allowed = NAV[role].map(function (n) { return n[0]; }).concat(["profil"]);

  function initials(u) { return ((u.prenom || "?")[0] + (u.nom || "")[0]).toUpperCase(); }
  GC.avatar = function (u) {
    return '<span class="avatar">' + (u.photo ? '<img src="' + u.photo + '" alt="">' : E(initials(u))) + "</span>";
  };
  var LOGO = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 7H6"/></svg>';

  function buildShell() {
    var c = GC.company(), u = GC.user();
    document.getElementById("app").innerHTML =
      '<div class="app"><aside class="sidebar" id="sidebar" aria-label="Navigation principale">' +
      '<div class="side-brand"><div class="logo-mark">' + (c.logo ? '<img src="' + c.logo + '" alt="Logo">' : LOGO) + '</div><div><b>GestCom</b><small>' + E(c.name) + "</small></div></div>" +
      '<nav id="nav">' + NAV[role].map(function (n, i) {
        return '<a class="nav-link" href="#/' + n[0] + '" data-r="' + n[0] + '" style="--i:' + i + '"><span class="ni">' + n[2] + "</span>" + E(n[1]) + "</a>";
      }).join("") + '</nav><button class="nav-link out" id="logout" type="button"><span class="ni">🚪</span>Déconnexion</button></aside>' +
      '<div class="scrim" id="scrim"></div><div class="content"><header class="appbar">' +
      '<button class="icon-btn burger" id="burger" aria-label="Ouvrir le menu">☰</button>' +
      '<div class="search"><input id="gsearch" type="search" placeholder="Rechercher produit, client, vente, référence…" autocomplete="off" aria-label="Recherche globale"><div id="sresults" class="dropdown" hidden></div></div>' +
      '<div class="menu-wrap"><button id="bell" class="icon-btn" aria-label="Notifications">🔔<span id="bellcount" class="bell-count" hidden></span></button><div id="notifs" class="dropdown right" hidden></div></div>' +
      '<a href="#/profil" class="usermini">' + GC.avatar(u) + '<span class="who"><b>' + E(u.prenom + " " + u.nom) + "</b><small>" + E(Auth.ROLES[role]) +
      (u.magasinId ? " · " + E(GC.storeName(u.magasinId)) : "") + "</small></span></a></header>" +
      '<main id="view" tabindex="-1"></main></div></div>';

    document.getElementById("logout").onclick = function () { Auth.logout(); location.replace("login.html"); };
    var sb = document.getElementById("sidebar"), scrim = document.getElementById("scrim");
    function toggle(open) { sb.classList.toggle("open", open); scrim.classList.toggle("on", open); }
    document.getElementById("burger").onclick = function () { toggle(!sb.classList.contains("open")); };
    scrim.onclick = function () { toggle(false); };
    GC.closeMenu = function () { toggle(false); };

    /* Recherche globale */
    var gs = document.getElementById("gsearch"), sr = document.getElementById("sresults");
    gs.addEventListener("input", function () {
      var q = gs.value.trim().toLowerCase();
      if (q.length < 2) { sr.hidden = true; return; }
      function has(a) { return a.join(" ").toLowerCase().indexOf(q) >= 0; }
      var groups = [], enc = encodeURIComponent(gs.value.trim());
      var pr = GC.scope(DB.all("products")).filter(function (p) { return has([p.nom, p.reference, p.codeBarres || ""]); }).slice(0, 4);
      if (pr.length) groups.push(["Produits", pr.map(function (p) { return ['#/produits?q=' + enc, p.nom + " · " + p.reference]; })]);
      var cl = DB.all("customers").filter(function (c) { return has([c.nom, c.prenom || "", c.telephone || "", c.email || ""]); }).slice(0, 4);
      if (cl.length) groups.push(["Clients", cl.map(function (c) { return ['#/clients?q=' + enc, c.nom + " " + (c.prenom || "")]; })]);
      var sl = GC.salesScoped().filter(function (s) { return has([s.numero, s.customerName || ""]); }).slice(0, 4);
      if (sl.length) groups.push(["Ventes", sl.map(function (s) { return ['#/' + (role === "vendeur" ? "mes-ventes" : "ventes") + '?q=' + enc, s.numero + " · " + UI.money(s.total)]; })]);
      if (role !== "vendeur") {
        var us = Auth.users().filter(function (x) { return (role === "admin" || (x.role === "vendeur" && x.magasinId === GC.user().magasinId)) && has([x.nom, x.prenom, x.email]); }).slice(0, 4);
        if (us.length) groups.push([role === "admin" ? "Utilisateurs" : "Vendeurs", us.map(function (x) { return ['#/' + (role === "admin" ? "utilisateurs" : "vendeurs") + '?q=' + enc, x.prenom + " " + x.nom]; })]);
      }
      sr.innerHTML = groups.length ? groups.map(function (g) {
        return '<div class="sg"><h4>' + g[0] + "</h4>" + g[1].map(function (l) { return '<a href="' + l[0] + '">' + E(l[1]) + "</a>"; }).join("") + "</div>";
      }).join("") : '<div class="empty small">Aucun résultat.</div>';
      sr.hidden = false;
    });
    sr.addEventListener("click", function () { sr.hidden = true; gs.value = ""; });

    /* Notifications */
    var nf = document.getElementById("notifs"), bc = document.getElementById("bellcount");
    function renderNotifs() {
      var u2 = GC.user(), list = DB.notificationsFor(u2), unread = list.filter(function (n) { return n.readBy.indexOf(u2.id) < 0; }).length;
      bc.textContent = unread; bc.hidden = !unread;
      var icon = { stock: "🟠", rupture: "🔴", vente: "💰", invitation: "✉️", objectif: "🎯", remboursement: "↩️", compte: "🔒" };
      nf.innerHTML = '<div class="dd-head"><b>Notifications</b>' + (unread ? '<button class="link-btn" id="readall">Tout marquer comme lu</button>' : "") + "</div>" +
        (list.length ? list.slice(0, 12).map(function (n) {
          return '<div class="notif' + (n.readBy.indexOf(u2.id) < 0 ? " unread" : "") + '" data-id="' + n.id + '"><span>' + (icon[n.type] || "🔔") + "</span><div>" +
            E(n.message) + "<small>" + UI.dateTime(n.createdAt) + "</small></div></div>";
        }).join("") : '<div class="empty small">Aucune notification.</div>');
    }
    GC.refreshNotifs = renderNotifs;
    document.getElementById("bell").onclick = function (e) { e.stopPropagation(); renderNotifs(); nf.hidden = !nf.hidden; };
    nf.addEventListener("click", function (e) {
      e.stopPropagation();
      var u2 = GC.user();
      if (e.target.id === "readall") DB.notificationsFor(u2).forEach(function (n) { if (n.readBy.indexOf(u2.id) < 0) n.readBy.push(u2.id); });
      var n = e.target.closest(".notif");
      if (n) { var o = DB.find("notifications", n.dataset.id); if (o && o.readBy.indexOf(u2.id) < 0) o.readBy.push(u2.id); }
      DB.save(); renderNotifs();
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".menu-wrap")) nf.hidden = true;
      if (!e.target.closest(".search")) sr.hidden = true;
    });
    renderNotifs();
  }

  /* ---------- Routeur ---------- */
  function route() {
    var parts = location.hash.replace(/^#\/?/, "").split("?"), name = parts[0] || "dashboard";
    GC.params = new URLSearchParams(parts[1] || "");
    if (!GC.modules[name]) { location.hash = "#/dashboard"; return; }
    var view = document.getElementById("view");
    view.innerHTML = "";
    var el = document.createElement("div"); el.className = "view-in"; view.appendChild(el);
    if (allowed.indexOf(name) < 0) {
      el.innerHTML = '<div class="empty"><h2>Accès non autorisé</h2><p>Vous n\'avez pas le droit d\'accéder à cette page.</p><a class="btn sm" href="#/dashboard">Retour au tableau de bord</a></div>';
    } else {
      try { GC.modules[name](el, name); }
      catch (e) { console.error(e); el.innerHTML = '<div class="empty">Une erreur est survenue. Veuillez réessayer.</div>'; }
      GC.animate(el);
    }
    document.querySelectorAll("#nav .nav-link").forEach(function (a) { a.classList.toggle("active", a.dataset.r === name); });
    window.scrollTo(0, 0); GC.closeMenu();
    if (GC.refreshNotifs) GC.refreshNotifs();
    document.title = "GestCom — " + (NAV[role].filter(function (n) { return n[0] === name; })[0] || ["", "Profil"])[1];
  }

  window.addEventListener("load", function () {
    buildShell();
    window.addEventListener("hashchange", route);
    route();
  });
})();
