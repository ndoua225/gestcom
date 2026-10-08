/* Composants UI réutilisables : modales, formulaires, tableaux, graphiques. */
(function () {
  var UI = {};
  UI.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  UI.num = function (n) { return new Intl.NumberFormat("fr-FR").format(Math.round(n || 0)); };
  UI.cur = function () {
    var c = Auth.company(); return (c && c.settings && c.settings.currency) || "FCFA";
  };
  UI.money = function (n) { return UI.num(n) + "\u00a0" + UI.cur(); };
  UI.date = function (i) { return i ? new Date(i).toLocaleDateString("fr-FR") : "—"; };
  UI.dateTime = function (i) {
    return i ? new Date(i).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";
  };
  UI.badge = function (text, cls) { return '<span class="badge-s ' + cls + '">' + text + "</span>"; };

  UI.toast = function (msg, type) {
    var c = document.getElementById("toasts");
    if (!c) {
      c = document.createElement("div"); c.id = "toasts"; c.setAttribute("aria-live", "polite");
      document.body.appendChild(c);
    }
    var t = document.createElement("div");
    t.className = "toast " + (type || "success"); t.textContent = msg; c.appendChild(t);
    setTimeout(function () { t.remove(); }, 3800);
  };

  UI.modal = function (o) {
    var ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = '<div class="modal' + (o.wide ? " wide" : "") + '" role="dialog" aria-modal="true" aria-label="' +
      UI.esc(o.title) + '"><div class="modal-head"><h3>' + UI.esc(o.title) +
      '</h3><button class="icon-btn no-print" data-close aria-label="Fermer">✕</button></div><div class="modal-body">' +
      o.html + "</div></div>";
    document.body.appendChild(ov);
    function onKey(e) { if (e.key === "Escape") close(); }
    function close(silent) {
      ov.remove(); document.removeEventListener("keydown", onKey);
      if (!silent && o.onClose) o.onClose();
    }
    ov.addEventListener("click", function (e) {
      if (e.target === ov || e.target.closest("[data-close]")) close();
    });
    document.addEventListener("keydown", onKey);
    var first = ov.querySelector("input,select,textarea,button.btn");
    if (first) first.focus();
    return { el: ov, close: close };
  };

  UI.confirm = function (msg, label) {
    return new Promise(function (res) {
      var m = UI.modal({ title: "Confirmation", onClose: function () { res(false); },
        html: "<p>" + UI.esc(msg) + '</p><div class="modal-actions"><button class="btn ghost" data-close>Annuler</button>' +
          '<button class="btn sm danger" data-ok>' + UI.esc(label || "Confirmer") + "</button></div>" });
      m.el.querySelector("[data-ok]").onclick = function () { res(true); m.close(true); };
    });
  };

  UI.field = function (f, v) {
    var id = "f_" + f.name, val = v == null ? "" : v, req = f.required ? " required" : "", input;
    var label = '<label for="' + id + '">' + UI.esc(f.label) + (f.required ? " *" : "") + "</label>";
    if (f.type === "select") {
      input = '<select id="' + id + '" name="' + f.name + '"' + req + ">" +
        (f.placeholder !== undefined ? '<option value="">' + UI.esc(f.placeholder) + "</option>" : "") +
        f.options.map(function (o) {
          return '<option value="' + UI.esc(o.v) + '"' + (String(o.v) === String(val) ? " selected" : "") + ">" + UI.esc(o.l) + "</option>";
        }).join("") + "</select>";
    } else if (f.type === "textarea") {
      input = '<textarea id="' + id + '" name="' + f.name + '" rows="3">' + UI.esc(val) + "</textarea>";
    } else if (f.type === "file") {
      input = '<input id="' + id + '" name="' + f.name + '" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml">';
    } else {
      input = '<input id="' + id + '" name="' + f.name + '" type="' + (f.type || "text") + '" value="' + UI.esc(val) + '"' + req +
        (f.min != null ? ' min="' + f.min + '"' : "") + (f.step ? ' step="' + f.step + '"' : "") +
        (f.placeholder ? ' placeholder="' + UI.esc(f.placeholder) + '"' : "") +
        (f.autocomplete ? ' autocomplete="' + f.autocomplete + '"' : ' autocomplete="off"') + ">";
    }
    return '<div class="field' + (f.full ? " full" : "") + '">' + label + input +
      (f.hint ? '<small class="hint">' + UI.esc(f.hint) + "</small>" : "") + "</div>";
  };

  UI.readImage = function (file) {
    return new Promise(function (res) {
      if (file.size > 300 * 1024) return res(false);
      var r = new FileReader(); r.onload = function () { res(r.result); }; r.readAsDataURL(file);
    });
  };

  /* o: {title, fields, values, submitLabel, wide, onSubmit(values) -> string d'erreur | undefined} */
  UI.formModal = function (o) {
    var vals = o.values || {};
    var html = '<form novalidate><div class="grid2">' +
      o.fields.map(function (f) { return UI.field(f, vals[f.name]); }).join("") +
      '</div><div class="alert error" role="alert" hidden></div><div class="modal-actions">' +
      '<button type="button" class="btn ghost" data-close>Annuler</button>' +
      '<button class="btn sm" type="submit">' + UI.esc(o.submitLabel || "Enregistrer") + "</button></div></form>";
    var m = UI.modal({ title: o.title, html: html, wide: o.wide });
    var form = m.el.querySelector("form"), box = m.el.querySelector(".alert");
    function fail(msg) { box.textContent = msg; box.hidden = false; }
    form.addEventListener("submit", async function (e) {
      e.preventDefault(); box.hidden = true;
      var out = {};
      for (var i = 0; i < o.fields.length; i++) {
        var f = o.fields[i], el = form.elements[f.name], v;
        if (f.type === "file") {
          var file = el.files[0];
          if (file) { v = await UI.readImage(file); if (v === false) return fail("Image trop lourde (300 Ko maximum)."); }
          else v = vals[f.name] || null;
        } else if (f.type === "number") v = el.value === "" ? null : Number(el.value);
        else v = f.type === "password" ? el.value : el.value.trim();
        if (f.required && (v === "" || v == null)) return fail("Le champ « " + f.label + " » est obligatoire.");
        if (f.type === "email" && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return fail("Email invalide.");
        if (f.type === "number" && v != null && f.min != null && v < f.min) return fail("« " + f.label + " » doit être ≥ " + f.min + ".");
        out[f.name] = v;
      }
      var btn = form.querySelector("button[type=submit]"); btn.disabled = true;
      var r = await o.onSubmit(out);
      if (typeof r === "string") { fail(r); btn.disabled = false; return; }
      m.close(true);
    });
    return m;
  };

  /* Tableau responsive (devient cartes sur mobile). */
  UI.table = function (cols, rows, empty) {
    if (!rows.length) return '<div class="empty">' + empty + "</div>";
    return '<div class="table-wrap"><table class="tbl"><thead><tr>' +
      cols.map(function (c) { return "<th>" + c.label + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) {
        return "<tr>" + cols.map(function (c) {
          return '<td data-label="' + UI.esc(c.label) + '">' + c.render(r) + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>";
  };
  UI.pager = function (total, page, per) {
    var pages = Math.ceil(total / per); if (pages <= 1) return "";
    var h = '<nav class="pager" aria-label="Pagination">';
    for (var i = 1; i <= pages; i++)
      h += '<button class="pg' + (i === page ? " on" : "") + '" data-page="' + i + '"' + (i === page ? ' aria-current="page"' : "") + ">" + i + "</button>";
    return h + "<span>" + total + " résultat(s)</span></nav>";
  };

  UI.kpi = function (icon, color, label, value, sub) {
    return '<div class="kpi"><i style="background:' + color + '1f;color:' + color + '">' + icon + "</i><div><small>" +
      UI.esc(label) + "</small><b>" + value + "</b>" + (sub ? "<em>" + sub + "</em>" : "") + "</div></div>";
  };
  UI.card = function (title, body, extra) {
    return '<section class="panel-c' + (extra ? " " + extra : "") + '"><h3>' + title + "</h3>" + body + "</section>";
  };

  /* ---- Graphiques SVG ---- */
  UI.lineChart = function (pts, label) {
    var W = 600, H = 220, p = 34, n = pts.length;
    var max = Math.max.apply(null, pts.map(function (x) { return x.value; }).concat([1]));
    var step = n > 1 ? (W - 2 * p) / (n - 1) : 0;
    var xy = pts.map(function (x, i) { return [p + i * step, H - p - (x.value / max) * (H - 2 * p)]; });
    var line = xy.map(function (a, i) { return (i ? "L" : "M") + a[0].toFixed(1) + " " + a[1].toFixed(1); }).join(" ");
    var area = line + " L" + xy[n - 1][0].toFixed(1) + " " + (H - p) + " L" + xy[0][0].toFixed(1) + " " + (H - p) + " Z";
    var grid = "";
    for (var g = 0; g <= 4; g++) {
      var y = p + g * (H - 2 * p) / 4;
      grid += '<line x1="' + p + '" x2="' + (W - p) + '" y1="' + y + '" y2="' + y + '" stroke="#e3e9f6"/>' +
        '<text x="' + (p - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="#5b6785">' +
        UI.num(max * (1 - g / 4)) + "</text>";
    }
    var labels = pts.map(function (x, i) {
      return '<text x="' + xy[i][0] + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="#5b6785">' + UI.esc(x.label) + "</text>";
    }).join("");
    var dots = xy.map(function (a) { return '<circle cx="' + a[0] + '" cy="' + a[1] + '" r="4" fill="#1566f0"/>'; }).join("");
    return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + UI.esc(label || "Graphique") + '">' +
      grid + '<path d="' + area + '" fill="#1566f01a"/><path d="' + line + '" fill="none" stroke="#1566f0" stroke-width="2.5"/>' + dots + labels + "</svg>";
  };
  var PALETTE = ["#1566f0", "#16a34a", "#f59e0b", "#7c3aed", "#e11d48", "#0891b2", "#64748b"];
  UI.palette = PALETTE;
  UI.donut = function (parts, centerText) {
    var total = parts.reduce(function (a, x) { return a + x.value; }, 0);
    if (!total) return '<div class="empty small">Pas encore de données.</div>';
    var off = 25, segs = "", legend = "";
    parts.forEach(function (x, i) {
      var pct = x.value / total * 100, c = PALETTE[i % PALETTE.length];
      segs += '<circle r="15.9155" cx="21" cy="21" fill="none" stroke="' + c + '" stroke-width="6" stroke-dasharray="' +
        pct.toFixed(2) + " " + (100 - pct).toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '"/>';
      off -= pct;
      legend += '<li><span style="background:' + c + '"></span>' + UI.esc(x.label) + "<b>" + Math.round(pct) + " %</b></li>";
    });
    return '<div class="donut"><svg viewBox="0 0 42 42" role="img" aria-label="Répartition">' + segs +
      '<text x="21" y="22.5" text-anchor="middle" font-size="4.2" font-weight="700" fill="#0f1b3d">' + UI.esc(centerText || "") +
      '</text></svg><ul>' + legend + "</ul></div>";
  };
  UI.hbars = function (items, fmt) {
    if (!items.length) return '<div class="empty small">Pas encore de données.</div>';
    var max = Math.max.apply(null, items.map(function (x) { return x.value; }).concat([1]));
    return '<ul class="hbars">' + items.map(function (x, i) {
      return "<li><span>" + UI.esc(x.label) + "</span><div><i style=\"width:" + (x.value / max * 100).toFixed(1) +
        "%;background:" + PALETTE[i % PALETTE.length] + '"></i></div><b>' + (fmt ? fmt(x.value) : UI.num(x.value)) + "</b></li>";
    }).join("") + "</ul>";
  };
  UI.progress = function (pct, color) {
    var p = Math.min(100, Math.max(0, pct));
    return '<div class="progress" role="progressbar" aria-valuenow="' + Math.round(pct) + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' +
      p + "%;background:" + (color || "#7c3aed") + '"></i></div>';
  };

  window.UI = UI;
})();
