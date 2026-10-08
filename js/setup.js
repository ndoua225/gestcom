Auth.enforceSetupState("setup");

(function () {
  var form = document.getElementById("setup-form");
  var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  function setErr(name, msg) {
    var field = document.getElementById(name).closest(".field");
    var old = field.querySelector(".err");
    if (old) old.remove();
    field.classList.toggle("has-error", !!msg);
    if (msg) {
      var d = document.createElement("div");
      d.className = "err"; d.setAttribute("role", "alert"); d.textContent = msg;
      field.appendChild(d);
    }
  }
  function readFile(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(file);
    });
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var v = {};
    ["company_name", "address", "company_phone", "company_email", "website", "nom", "prenom",
     "email", "telephone", "username", "password", "confirm"].forEach(function (k) {
      v[k] = form.elements[k].value.trim();
    });
    v.password = form.elements.password.value; v.confirm = form.elements.confirm.value;
    var err = {};
    ["company_name", "nom", "prenom", "email", "username", "password", "confirm"].forEach(function (k) {
      if (!v[k]) err[k] = "Ce champ est obligatoire.";
    });
    if (v.email && !EMAIL.test(v.email)) err.email = "Email invalide.";
    if (v.company_email && !EMAIL.test(v.company_email)) err.company_email = "Email invalide.";
    if (v.username && !/^[A-Za-z0-9_.-]{3,30}$/.test(v.username))
      err.username = "3 à 30 caractères (lettres, chiffres, . _ -).";
    if (v.password && (v.password.length < 8 || !/[A-Za-z]/.test(v.password) || !/\d/.test(v.password)))
      err.password = "8 caractères minimum, avec lettres et chiffres.";
    if (v.password !== v.confirm) err.confirm = "Les mots de passe ne correspondent pas.";
    var file = form.elements.logo.files[0];
    if (file && (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type) || file.size > 500 * 1024))
      err.logo = "Image png, jpg, svg ou webp de 500 Ko maximum.";

    ["company_name", "company_email", "nom", "prenom", "email", "username", "password", "confirm", "logo"]
      .forEach(function (k) { setErr(k, err[k]); });
    if (Object.keys(err).length) {
      var first = form.querySelector(".has-error input"); if (first) first.focus();
      return;
    }

    var btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      var logo = file ? await readFile(file) : null;
      await Auth.createAdmin({
        nom: v.nom, prenom: v.prenom, email: v.email, telephone: v.telephone,
        username: v.username, password: v.password,
        company: { name: v.company_name, logo: logo, address: v.address, phone: v.company_phone,
                   email: v.company_email, website: v.website,
                   settings: { currency: "FCFA", taxRate: 0, language: "fr" } }
      });
      sessionStorage.setItem("gestcom_flash", "Compte administrateur créé avec succès. Connectez-vous.");
      location.replace("login.html");
    } catch (ex) {
      btn.disabled = false;
      setErr("username", ex.message);
    }
  });
})();
