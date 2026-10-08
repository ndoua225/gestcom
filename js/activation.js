(function(){
  var token=new URLSearchParams(location.search).get("token"),form=document.getElementById("activation-form"),box=document.getElementById("message");
  var invite=token&&DB.all("tokens").find(function(x){return x.token===token&&x.kind==="invitation";});
  if(!invite){box.textContent="Ce lien d’activation est invalide ou a déjà été utilisé.";box.hidden=false;form.hidden=true;return;}
  form.addEventListener("submit",async function(e){e.preventDefault();box.hidden=true;var p=form.elements.password.value,c=form.elements.confirm.value;
    if(p.length<8||!/[A-Za-z]/.test(p)||!/[0-9]/.test(p)){box.textContent="Utilisez au moins 8 caractères avec des lettres et des chiffres.";box.hidden=false;return;}
    if(p!==c){box.textContent="Les mots de passe ne correspondent pas.";box.hidden=false;return;}
    var btn=form.querySelector("button[type=submit]");btn.disabled=true;
    try{var user=await Auth.acceptInvitation(token,p);sessionStorage.setItem("gestcom_flash","Compte activé. Vous pouvez vous connecter.");location.replace("login.html");}
    catch(err){box.textContent=err.message;box.hidden=false;btn.disabled=false;}
  });
})();
