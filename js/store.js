/* Magasin de données local (localStorage) pour GestCom. */
(function () {
  var KEY = "gestcom_data";
  function blank() {
    return { stores: [], categories: [], products: [], customers: [], suppliers: [], sales: [],
             movements: [], goals: [], notifications: [], tokens: [], counters: { sale: 0 } };
  }
  var d = blank();
  try {
    var s = JSON.parse(localStorage.getItem(KEY));
    if (s) Object.keys(s).forEach(function (k) { d[k] = s[k]; });
  } catch (e) { /* données corrompues : on repart de zéro */ }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(d));
    if (window.Cloud) Cloud.scheduleSync();
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  window.DB = {
    uid: uid, save: save,
    export: function () { return JSON.parse(JSON.stringify(d)); },
    reload: function () {
      d = blank();
      try { var s = JSON.parse(localStorage.getItem(KEY)); if (s) Object.keys(s).forEach(function (k) { d[k] = s[k]; }); }
      catch (_) { /* données distantes illisibles : conserver un magasin vide */ }
    },
    all: function (n) { return d[n]; },
    find: function (n, id) { return d[n].find(function (x) { return x.id === id; }); },
    add: function (n, o) {
      o.id = o.id || uid(); o.createdAt = o.createdAt || new Date().toISOString();
      d[n].push(o); save(); return o;
    },
    update: function (n, id, p) {
      var o = DB.find(n, id); if (o) { Object.assign(o, p); save(); } return o;
    },
    remove: function (n, id) { d[n] = d[n].filter(function (x) { return x.id !== id; }); save(); },
    clearAll: function () { d = blank(); save(); },
    nextSaleNumber: function () {
      d.counters.sale++; save();
      return "V" + new Date().getFullYear() + "-" + String(d.counters.sale).padStart(5, "0");
    },
    /* opt: { roles:[], magasinId, userId } */
    notify: function (type, message, opt) {
      opt = opt || {};
      DB.add("notifications", { type: type, message: message, roles: opt.roles || null,
        magasinId: opt.magasinId || null, userId: opt.userId || null, readBy: [] });
      d.notifications = d.notifications.slice(-200); save();
    },
    notificationsFor: function (user) {
      return d.notifications.filter(function (n) {
        if (n.userId) return n.userId === user.id;
        if (n.roles && n.roles.indexOf(user.role) < 0) return false;
        return user.role === "admin" || !n.magasinId || n.magasinId === user.magasinId;
      }).sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
    },
    newToken: function () {
      var a = crypto.getRandomValues(new Uint8Array(16));
      return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    }
  };
})();
