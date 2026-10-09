Auth.enforceSetupState("login");
(function () {
  var s = Auth.session();
  if (s && !Auth.cloudEnabled()) { location.replace(Auth.homeFor(s.role)); return; }

  var flash = sessionStorage.getItem("gestcom_flash");
  if (flash) {
    var f = document.getElementById("flash");
    f.textContent = flash; f.hidden = false;
    sessionStorage.removeItem("gestcom_flash");
  }
  var form = document.getElementById("login-form");
  var errBox = document.getElementById("error");
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    errBox.hidden = true;
    var btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      var u = await Auth.login(form.elements.username.value, form.elements.password.value,
                               form.elements.role.value, form.elements.remember.checked);
      location.replace(Auth.homeFor(u.role));
    } catch (ex) {
      errBox.textContent = ex.message; errBox.hidden = false; btn.disabled = false;
    }
  });
})();
