/* Application GestCom : espace métier commun, adapté au rôle connecté. */
(function () {
  var role = document.body.dataset.role, session = Auth.guard(role);
  if (!session) return;
  var me = Auth.currentUser(), company = Auth.company() || {}, app = document.getElementById("app");
  var current = location.hash.replace(/^#\/?/, "") || "dashboard", cart = [], mobileOpen = false;
  var names = { dashboard:"Tableau de bord", pos:"Point de vente", sales:"Ventes", products:"Produits", stock:"Gestion du stock", customers:"Clients", suppliers:"Fournisseurs", users:role === "manager" ? "Équipe" : "Utilisateurs", stores:"Magasins", categories:"Catégories", goals:"Objectifs", reports:"Rapports", notifications:"Notifications", profile:"Mon profil", settings:"Paramètres" };
  var menus = {
    admin: ["dashboard","sales","pos","products","stock","customers","suppliers","users","stores","categories","goals","reports","notifications","settings","profile"],
    manager: ["dashboard","sales","pos","products","stock","customers","suppliers","users","goals","reports","notifications","profile"],
    vendeur: ["dashboard","pos","sales","products","customers","stock","reports","notifications","profile"]
  };
  var icons = {dashboard:"▦",pos:"▣",sales:"↗",products:"▧",stock:"▤",customers:"♙",suppliers:"⇄",users:"♧",stores:"⌂",categories:"▦",goals:"◎",reports:"▥",notifications:"♢",settings:"⚙",profile:"◉"};
  function isAllowed(view) {
    if (menus[role].indexOf(view) < 0) return false;
    return true;
  }
  function rows(name) { return DB.all(name) || []; }
  function mine(name) {
    var a = rows(name);
    if (role === "admin") return a;
    if (role === "manager") return a.filter(function (x) { return !x.magasinId || x.magasinId === me.magasinId; });
    if (name === "sales") return a.filter(function (x) { return x.vendeurId === me.id; });
    return a.filter(function (x) { return x.vendeurId === me.id || x.magasinId === me.magasinId; });
  }
  function validSales() { return mine("sales").filter(function (s) { return s.statut !== "annulée"; }); }
  function money(n) { return UI.money(n); }
  function fmtRole(r) { return Auth.ROLES[r] || r; }
  function storeName(id) { var s = DB.find("stores", id); return s ? s.name : "—"; }
  function customerName(id) { var c = DB.find("customers", id); return c ? c.prenom + " " + c.nom : "Client comptoir"; }
  function userName(id) { var u = Auth.users().find(function (x) { return x.id === id; }); return u ? u.prenom + " " + u.nom : "—"; }
  function productState(p) { return p.stock <= 0 ? ["Rupture", "red"] : p.stock <= (p.seuil || 0) ? ["Stock faible", "orange"] : ["Disponible", "green"]; }
  function sum(a, key) { return a.reduce(function (n, x) { return n + Number(x[key] || 0); }, 0); }
  function todaySales() { var today = new Date().toDateString(); return validSales().filter(function (s) { return new Date(s.createdAt).toDateString() === today; }); }
  function action(label, view, kind) { return '<button class="btn ' + (kind || "") + '" data-view="' + view + '">' + label + '</button>'; }
  function createAction(label, type) { return '<button class="btn primary" data-action="add-' + type + '">' + label + '</button>'; }
  function pageHeader(title, desc, right) {
    return '<div class="page-head"><div><div class="eyebrow">GESTCOM / ' + UI.esc(title.toUpperCase()) + '</div><h1>' + UI.esc(title) + '</h1><p>' + UI.esc(desc || "") + '</p></div>' + (right || "") + '</div>';
  }
  function emptyAction(text, view) { return '<div class="empty"><span class="empty-icon">◇</span><b>' + UI.esc(text) + '</b><span>Les informations apparaîtront ici au fur et à mesure de votre activité.</span>' + (view ? '<button class="btn sm" data-action="add-' + view + '">Ajouter</button>' : '') + '</div>'; }
  function lineCard(title, body, extra) { return '<section class="content-card ' + (extra || '') + '"><div class="card-title"><h2>' + title + '</h2></div>' + body + '</section>'; }
  function kpi(icon, label, value, detail, color) { return '<article class="stat-card"><span class="stat-icon ' + (color || '') + '">' + icon + '</span><div><span>' + label + '</span><strong>' + value + '</strong><small>' + (detail || "") + '</small></div></article>'; }
  function productFields() {
    var cats = rows("categories").map(function (x) { return {v:x.id,l:x.name}; });
    var stores = role === "manager" ? rows("stores").filter(function(x){return x.id===me.magasinId;}) : rows("stores");
    return [
      {name:"name",label:"Nom du produit",required:true},{name:"sku",label:"Référence",required:true},
      {name:"barcode",label:"Code-barres"},{name:"categoryId",label:"Catégorie",type:"select",placeholder:"Sans catégorie",options:cats},
      {name:"buyPrice",label:"Prix d'achat",type:"number",min:0,step:"1"},{name:"price",label:"Prix de vente",type:"number",required:true,min:0,step:"1"},
      {name:"stock",label:"Stock initial",type:"number",min:0,step:"1"},{name:"seuil",label:"Seuil d'alerte",type:"number",min:0,step:"1"},
      {name:"magasinId",label:"Magasin",type:"select",placeholder:role==="manager"?undefined:"Tous les magasins",options:stores.map(function(x){return {v:x.id,l:x.name};})},
      {name:"description",label:"Description",type:"textarea",full:true}
    ];
  }
  function openForm(type, item) {
    var editing = !!item, fields, title, collection = type;
    if (type === "products") { fields=productFields(); title=editing?"Modifier le produit":"Nouveau produit"; }
    if (type === "customers") { fields=[{name:"prenom",label:"Prénom",required:true},{name:"nom",label:"Nom",required:true},{name:"phone",label:"Téléphone",type:"tel"},{name:"email",label:"Email",type:"email"},{name:"address",label:"Adresse",type:"textarea",full:true}]; title=editing?"Modifier le client":"Nouveau client"; }
    if (type === "suppliers") { fields=[{name:"name",label:"Nom du fournisseur",required:true},{name:"company",label:"Entreprise"},{name:"phone",label:"Téléphone",type:"tel"},{name:"email",label:"Email",type:"email"},{name:"address",label:"Adresse",type:"textarea",full:true}]; title=editing?"Modifier le fournisseur":"Nouveau fournisseur"; }
    if (type === "stores") { fields=[{name:"name",label:"Nom du magasin",required:true},{name:"address",label:"Adresse"},{name:"phone",label:"Téléphone",type:"tel"},{name:"managerId",label:"Manager",type:"select",placeholder:"Non affecté",options:Auth.users().filter(function(u){return u.role==="manager";}).map(function(u){return {v:u.id,l:u.prenom+" "+u.nom};})}]; title=editing?"Modifier le magasin":"Nouveau magasin"; }
    if (type === "categories") { fields=[{name:"name",label:"Nom de la catégorie",required:true},{name:"description",label:"Description",type:"textarea",full:true}]; title=editing?"Modifier la catégorie":"Nouvelle catégorie"; }
    if (type === "goals") { fields=[{name:"label",label:"Libellé",required:true},{name:"target",label:"Objectif (FCFA)",type:"number",min:1,required:true},{name:"userId",label:"Vendeur",type:"select",placeholder:"Objectif équipe",options:Auth.users().filter(function(u){return u.role==="vendeur";}).map(function(u){return {v:u.id,l:u.prenom+" "+u.nom};})},{name:"period",label:"Période",type:"select",options:[{v:"Mois en cours",l:"Mois en cours"},{v:"Semaine en cours",l:"Semaine en cours"}]}]; title=editing?"Modifier l'objectif":"Définir un objectif"; }
    if (type === "users") {
      var stores=role==="manager"?rows("stores").filter(function(x){return x.id===me.magasinId;}):rows("stores");
      fields=[{name:"prenom",label:"Prénom",required:true},{name:"nom",label:"Nom",required:true},{name:"email",label:"Adresse email",type:"email",required:true},{name:"telephone",label:"Téléphone",type:"tel"},{name:"role",label:"Rôle",type:"select",required:true,options:role==="admin"?[{v:"manager",l:"Manager"},{v:"vendeur",l:"Vendeur"}]:[{v:"vendeur",l:"Vendeur"}]},{name:"magasinId",label:"Magasin affecté",type:"select",placeholder:role==="manager"?undefined:"Aucun",options:stores.map(function(x){return {v:x.id,l:x.name};})}]; title="Inviter un membre";
    }
    UI.formModal({title:title,fields:fields,values:item||{},wide:true,submitLabel:editing?"Enregistrer":"Créer",onSubmit:async function(v){
      if(type==="users") {
        try { if(role==="manager")v.magasinId=me.magasinId; var invited=Auth.inviteUser(v); var url=new URL("activation.html?token="+encodeURIComponent(invited.inviteToken),location.href).href;
          setTimeout(function(){showInvite(url,invited);},100); UI.toast("Invitation créée. Partagez le lien avec "+invited.email+"."); render(); return; }
        catch(ex){return ex.message;}
      }
      if(type==="products"&&rows("products").some(function(x){return x.id!==(item&&item.id)&&x.sku&&x.sku.toLowerCase()===String(v.sku||"").toLowerCase();}))return "Cette référence produit est déjà utilisée.";
      if(type==="stores"&&rows("stores").some(function(x){return x.id!==(item&&item.id)&&x.name.toLowerCase()===String(v.name||"").toLowerCase();}))return "Un magasin porte déjà ce nom.";
      if(type==="categories"&&rows("categories").some(function(x){return x.id!==(item&&item.id)&&x.name.toLowerCase()===String(v.name||"").toLowerCase();}))return "Cette catégorie existe déjà.";
      if (editing) { DB.update(collection,item.id,v); Auth.audit("update_"+type,me.id); }
      else { v.magasinId=v.magasinId||me.magasinId||""; if(type==="products")v.status="actif"; var created=DB.add(collection,v);if(type==="products"&&Number(created.stock)>0)DB.add("movements",{productId:created.id,magasinId:created.magasinId,type:"entrée",quantity:Number(created.stock),reason:"Stock initial",userId:me.id});Auth.audit("create_"+type,me.id); }
      UI.toast(editing?"Modifications enregistrées.":"Élément ajouté."); render();
    }});
  }
  function showInvite(url,user) {
    var m=UI.modal({title:"Invitation prête",html:'<p>Partagez ce lien avec <b>'+UI.esc(user.prenom+" "+user.nom)+'</b>. La personne choisira elle-même son mot de passe.</p><label for="invite-url">Lien d’activation</label><input id="invite-url" readonly value="'+UI.esc(url)+'"><div class="modal-actions"><button class="btn ghost" data-close>Fermer</button><button class="btn sm" data-copy>Copier le lien</button></div>'});
    m.el.querySelector("[data-copy]").onclick=function(){var input=m.el.querySelector("#invite-url");input.select();if(navigator.clipboard)navigator.clipboard.writeText(url);else document.execCommand("copy");this.textContent="Copié";};
  }
  function removeItem(type,item) {
    UI.confirm("Supprimer cet élément ? Cette action est définitive.","Supprimer").then(function(ok){if(!ok)return;DB.remove(type,item.id);Auth.audit("delete_"+type,me.id);UI.toast("Élément supprimé.");render();});
  }
  function tableSearchBox(placeholder) { return '<div class="toolbar"><input class="search-input" data-search placeholder="'+UI.esc(placeholder||"Rechercher…")+'" aria-label="Rechercher"><span class="toolbar-spacer"></span></div>'; }
  function simpleTable(cols,arr,empty) { return UI.table(cols,arr,empty); }
  function pageProducts() {
    var list=mine("products").slice().sort(function(a,b){return a.name.localeCompare(b.name);});
    var rowsHtml=list.map(function(p){var state=productState(p);return {p:p,state:state};});
    var content=tableSearchBox("Rechercher par nom, référence ou code-barres");
    var cols=[{label:"Produit",render:function(x){return '<b>'+UI.esc(x.p.name)+'</b><small class="muted block">'+UI.esc(x.p.sku||"Sans référence")+'</small>'; }},{label:"Catégorie",render:function(x){var c=DB.find("categories",x.p.categoryId);return UI.esc(c?c.name:"—");}},{label:"Prix",render:function(x){return money(x.p.price);}},{label:"Stock",render:function(x){return UI.num(x.p.stock||0); }},{label:"État",render:function(x){return UI.badge(x.state[0],x.state[1]);}}];
    if(role!=="vendeur")cols.push({label:"Actions",render:function(x){return '<button class="text-btn" data-edit="products" data-id="'+x.p.id+'">Modifier</button> <button class="text-btn danger-text" data-delete="products" data-id="'+x.p.id+'">Supprimer</button>';}});
    content+=simpleTable(cols,rowsHtml,"Aucun produit pour le moment.");
    return pageHeader("Produits","Votre catalogue produit, vos tarifs et vos références.",role==="vendeur"?"":createAction("＋ Ajouter un produit","products"))+lineCard("Catalogue produit",content);
  }
  function pageCustomers() {
    var list=mine("customers").map(function(c){return c;});
    var html=tableSearchBox("Rechercher un client")+simpleTable([{label:"Client",render:function(c){return '<b>'+UI.esc(c.prenom+" "+c.nom)+'</b>'; }},{label:"Téléphone",render:function(c){return UI.esc(c.phone||"—");}},{label:"Email",render:function(c){return UI.esc(c.email||"—");}},{label:"Achats",render:function(c){var ss=validSales().filter(function(s){return s.clientId===c.id;});return ss.length+" vente(s) · "+money(sum(ss,"total"));}},{label:"Actions",render:function(c){return '<button class="text-btn" data-edit="customers" data-id="'+c.id+'">Modifier</button> <button class="text-btn danger-text" data-delete="customers" data-id="'+c.id+'">Supprimer</button>';}}],list,"Aucun client enregistré.");
    return pageHeader("Clients","Retrouvez les coordonnées et l’historique d’achat de vos clients.",createAction("＋ Nouveau client","customers"))+lineCard("Fichier clients",html);
  }
  function pageSuppliers() {
    var html=tableSearchBox("Rechercher un fournisseur")+simpleTable([{label:"Fournisseur",render:function(x){return '<b>'+UI.esc(x.name)+'</b><small class="muted block">'+UI.esc(x.company||"")+'</small>'; }},{label:"Téléphone",render:function(x){return UI.esc(x.phone||"—");}},{label:"Email",render:function(x){return UI.esc(x.email||"—");}},{label:"Actions",render:function(x){return '<button class="text-btn" data-edit="suppliers" data-id="'+x.id+'">Modifier</button> <button class="text-btn danger-text" data-delete="suppliers" data-id="'+x.id+'">Supprimer</button>';}}],mine("suppliers"),"Aucun fournisseur enregistré.");
    return pageHeader("Fournisseurs","Centralisez les coordonnées de vos partenaires.",createAction("＋ Ajouter un fournisseur","suppliers"))+lineCard("Fournisseurs",html);
  }
  function pageStores() {
    var users=Auth.users(), list=rows("stores");
    var html=simpleTable([{label:"Magasin",render:function(x){return '<b>'+UI.esc(x.name)+'</b><small class="muted block">'+UI.esc(x.address||"")+'</small>'; }},{label:"Manager",render:function(x){return UI.esc(userName(x.managerId));}},{label:"Équipe",render:function(x){return users.filter(function(u){return u.magasinId===x.id;}).length+" membre(s)";}},{label:"Actions",render:function(x){return '<button class="text-btn" data-edit="stores" data-id="'+x.id+'">Modifier</button> <button class="text-btn danger-text" data-delete="stores" data-id="'+x.id+'">Supprimer</button>';}}],list,"Aucun magasin. Créez un premier magasin pour affecter votre équipe.");
    return pageHeader("Magasins","Organisez les ventes et les équipes par point de vente.",createAction("＋ Nouveau magasin","stores"))+lineCard("Vos magasins",html);
  }
  function pageCategories() {
    var html=simpleTable([{label:"Catégorie",render:function(x){return '<b>'+UI.esc(x.name)+'</b>'; }},{label:"Produits",render:function(x){return mine("products").filter(function(p){return p.categoryId===x.id;}).length;}},{label:"Description",render:function(x){return UI.esc(x.description||"—");}},{label:"Actions",render:function(x){return '<button class="text-btn" data-edit="categories" data-id="'+x.id+'">Modifier</button> <button class="text-btn danger-text" data-delete="categories" data-id="'+x.id+'">Supprimer</button>';}}],rows("categories"),"Aucune catégorie enregistrée.");
    return pageHeader("Catégories","Classez les produits pour retrouver rapidement votre catalogue.",createAction("＋ Nouvelle catégorie","categories"))+lineCard("Catégories",html);
  }
  function pageUsers() {
    var users=Auth.users().filter(function(u){return u.role!=="admin" || role==="admin";});
    if(role==="manager") users=users.filter(function(u){return u.magasinId===me.magasinId&&u.role==="vendeur";});
    var html=tableSearchBox("Rechercher par nom ou email")+simpleTable([{label:"Membre",render:function(u){return '<b>'+UI.esc(u.prenom+" "+u.nom)+'</b><small class="muted block">'+UI.esc(u.email)+'</small>'; }},{label:"Rôle",render:function(u){return UI.esc(fmtRole(u.role));}},{label:"Magasin",render:function(u){return UI.esc(storeName(u.magasinId));}},{label:"Statut",render:function(u){return UI.badge(u.statut,u.statut==="actif"?"green":"orange");}},{label:"Actions",render:function(u){if(u.id===me.id)return "—";return '<button class="text-btn" data-edit-user="'+u.id+'">Modifier</button><button class="text-btn" data-toggle-user="'+u.id+'">'+(u.statut==="actif"?"Désactiver":"Activer")+'</button>'+(u.statut==="invité"?'<button class="text-btn" data-resend="'+u.id+'">Copier lien</button>':"");}}],users,"Aucun membre d’équipe.");
    return pageHeader(role==="manager"?"Équipe":"Utilisateurs","Invitez des managers et vendeurs ; chacun définit son propre mot de passe.",createAction("＋ Inviter un membre","users"))+lineCard("Membres de l’entreprise",html);
  }
  function pageStock() {
    var list=mine("products").slice().sort(function(a,b){return (a.stock||0)-(b.stock||0);});
    var stockCols=[{label:"Produit",render:function(p){return '<b>'+UI.esc(p.name)+'</b><small class="muted block">'+UI.esc(p.sku||"")+'</small>'; }},{label:"Magasin",render:function(p){return UI.esc(storeName(p.magasinId));}},{label:"En stock",render:function(p){return '<b>'+UI.num(p.stock||0)+'</b> / seuil '+UI.num(p.seuil||0);}},{label:"État",render:function(p){var s=productState(p);return UI.badge(s[0],s[1]);}}];
    if(role!=="vendeur")stockCols.push({label:"Mouvement",render:function(p){return '<button class="text-btn" data-stock="'+p.id+'">Ajuster</button>';}});
    var html=simpleTable(stockCols,list,"Aucun produit à suivre.");
    var alerts=list.filter(function(p){return p.stock<=p.seuil;}).length;
    return pageHeader("Gestion du stock","Suivez les niveaux et consignez les entrées ou sorties.","")+ (alerts?'<div class="notice warn">⚠ '+alerts+' produit(s) au seuil d’alerte ou en rupture.</div>':'<div class="notice good">✓ Aucun produit sous le seuil d’alerte.</div>')+lineCard("Niveaux de stock",html);
  }
  function pageSales() {
    var sales=validSales().slice().sort(function(a,b){return b.createdAt.localeCompare(a.createdAt);});
    var html=tableSearchBox("Rechercher un numéro, client ou vendeur")+simpleTable([{label:"Vente",render:function(s){return '<b>'+UI.esc(s.number)+'</b><small class="muted block">'+UI.dateTime(s.createdAt)+'</small>'; }},{label:"Client",render:function(s){return UI.esc(customerName(s.clientId));}},{label:"Vendeur",render:function(s){return UI.esc(userName(s.vendeurId));}},{label:"Paiement",render:function(s){return UI.esc(s.payment||"—");}},{label:"Total",render:function(s){return '<b>'+money(s.total)+'</b>'; }},{label:"Statut",render:function(s){return UI.badge(s.statut||"payée","green");}},{label:"Facture",render:function(s){return '<button class="text-btn" data-invoice="'+s.id+'">Imprimer</button>';}}],sales,"Aucune vente enregistrée.");
    return pageHeader("Ventes","Consultez l’historique des encaissements.",role==="vendeur"?action("＋ Nouvelle vente","pos","primary"):"")+lineCard("Historique des ventes",html);
  }
  function pagePos() {
    var products=mine("products").filter(function(p){return Number(p.stock)>0;});
    var customers=mine("customers");
    var cards=products.map(function(p){return '<button class="product-tile" data-add-cart="'+p.id+'"><span class="product-glyph">▧</span><b>'+UI.esc(p.name)+'</b><small>'+UI.esc(p.sku||"")+'</small><small class="sr-only">'+UI.esc(p.barcode||"")+'</small><strong>'+money(p.price)+'</strong><em>'+UI.num(p.stock)+' en stock</em></button>';}).join("");
    var cartHtml=cart.length?cart.map(function(it,i){var p=DB.find("products",it.id);return '<div class="cart-row"><div><b>'+UI.esc(p.name)+'</b><small>'+money(p.price)+' / unité</small></div><div class="qty"><button data-qty="'+i+'" data-delta="-1" aria-label="Diminuer">−</button><b>'+it.qty+'</b><button data-qty="'+i+'" data-delta="1" aria-label="Augmenter">+</button></div><strong>'+money(p.price*it.qty)+'</strong><button class="icon-btn" data-remove-cart="'+i+'" aria-label="Retirer">×</button></div>';}).join(""):'<div class="empty compact">Le panier est vide. Sélectionnez un produit.</div>';
    var total=cart.reduce(function(n,it){var p=DB.find("products",it.id);return n+(p?p.price*it.qty:0);},0);
    var clientOptions=customers.map(function(c){return '<option value="'+c.id+'">'+UI.esc(c.prenom+" "+c.nom)+'</option>';}).join("");
    var payOptions=['Espèces','Carte bancaire','Mobile Money','Virement'].map(function(x){return '<option>'+x+'</option>';}).join("");
    return pageHeader("Point de vente","Ajoutez les articles, associez un client et encaissez.","")+'<div class="pos-layout"><section class="content-card catalog-card"><div class="card-title"><h2>Catalogue</h2><input class="search-input" data-product-search placeholder="Rechercher un produit…" aria-label="Rechercher un produit"></div><div class="product-grid" id="product-grid">'+(cards||'<div class="empty">Aucun produit en stock disponible.</div>')+'</div></section><aside class="content-card cart-card"><div class="card-title"><h2>Panier</h2><span class="count-pill">'+cart.reduce(function(n,x){return n+x.qty;},0)+' article(s)</span></div><div class="cart-lines">'+cartHtml+'</div><div class="cart-settings"><label for="sale-client">Client</label><select id="sale-client"><option value="">Client comptoir</option>'+clientOptions+'</select><label for="sale-payment">Paiement</label><select id="sale-payment">'+payOptions+'</select></div><div class="cart-total"><span>Total à payer</span><strong>'+money(total)+'</strong></div><button class="btn primary checkout" data-checkout '+(!cart.length?'disabled':'')+'>Encaisser la vente</button><button class="btn ghost full" data-clear-cart '+(!cart.length?'disabled':'')+'>Vider le panier</button></aside></div>';
  }
  function doCheckout() {
    if(!cart.length)return;
    var lines=[], total=0;
    for(var i=0;i<cart.length;i++){var p=DB.find("products",cart[i].id);if(!p||Number(p.stock)<cart[i].qty){UI.toast("Stock insuffisant pour "+(p?p.name:"un produit"),"error");return;}lines.push({productId:p.id,name:p.name,sku:p.sku,quantity:cart[i].qty,unitPrice:Number(p.price),total:Number(p.price)*cart[i].qty});total+=Number(p.price)*cart[i].qty;}
    UI.confirm("Encaisser "+money(total)+" ? Le stock sera mis à jour.","Confirmer l’encaissement").then(function(ok){if(!ok)return;
      lines.forEach(function(l){var p=DB.find("products",l.productId),remaining=Number(p.stock)-l.quantity;DB.update("products",p.id,{stock:remaining});DB.add("movements",{productId:p.id,magasinId:p.magasinId||me.magasinId||"",type:"sortie",quantity:l.quantity,reason:"Vente",userId:me.id});if(remaining<=Number(p.seuil||0))DB.notify("stock","Stock faible : "+p.name+" ("+remaining+" restant(s)).",{roles:["admin","manager"],magasinId:p.magasinId||me.magasinId||""});});
      var sale={number:DB.nextSaleNumber(),vendeurId:me.id,magasinId:me.magasinId||"",clientId:document.getElementById("sale-client").value||"",items:lines,subtotal:total,discount:0,tax:0,total:total,payment:document.getElementById("sale-payment").value,statut:"payée"};
      DB.add("sales",sale);Auth.audit("sale_created",me.id);DB.notify("sale","Nouvelle vente "+sale.number,{roles:["admin","manager"],magasinId:sale.magasinId});cart=[];UI.toast("Vente encaissée : "+sale.number);render();
    });
  }
  function pageGoals() {
    var goals=rows("goals").filter(function(g){return role==="admin"||!g.magasinId||g.magasinId===me.magasinId;});
    var html=goals.length?'<div class="goal-grid">'+goals.map(function(g){var done=validSales().filter(function(s){return !g.userId||s.vendeurId===g.userId;}).reduce(function(n,s){return n+s.total;},0),pct=g.target?done/g.target*100:0;return '<article class="goal-card"><div class="goal-top"><b>'+UI.esc(g.label)+'</b>'+UI.badge(g.period||"Mois","violet")+'</div><p>'+UI.esc(g.userId?userName(g.userId):"Objectif d’équipe")+'</p><div class="goal-numbers"><strong>'+money(done)+'</strong><span>sur '+money(g.target)+'</span></div>'+UI.progress(pct,"#7c3aed")+'<div class="goal-bottom"><span>'+Math.round(pct)+' % atteint</span><button class="text-btn" data-edit="goals" data-id="'+g.id+'">Modifier</button></div></article>';}).join("")+'</div>':emptyAction("Aucun objectif défini.");
    return pageHeader("Objectifs","Fixez des cibles et suivez la progression de l’équipe.",createAction("＋ Définir un objectif","goals"))+html;
  }
  function pageReports() {
    var sales=validSales(), byDay=[]; for(var i=6;i>=0;i--){var d=new Date();d.setDate(d.getDate()-i);var label=d.toLocaleDateString("fr-FR",{weekday:"short"});var v=sales.filter(function(s){return new Date(s.createdAt).toDateString()===d.toDateString();}).reduce(function(n,s){return n+s.total;},0);byDay.push({label:label,value:v});}
    var productMap={}; sales.forEach(function(s){(s.items||[]).forEach(function(it){productMap[it.name]=(productMap[it.name]||0)+it.quantity;});});
    var best=Object.keys(productMap).map(function(k){return {label:k,value:productMap[k]};}).sort(function(a,b){return b.value-a.value;}).slice(0,5);
    var avg=sales.length?sum(sales,"total")/sales.length:0;
    var top=UI.hbars(best);
    return pageHeader("Rapports","Un aperçu de votre activité commerciale sur les 7 derniers jours.",'<button class="btn ghost" data-export>⇩ Exporter les ventes</button>')+'<div class="stats-grid">'+kpi("↗","Chiffre d’affaires",money(sum(sales,"total")),sales.length+" ventes","blue")+kpi("▣","Nombre de ventes",UI.num(sales.length),"Ventes enregistrées","green")+kpi("◉","Panier moyen",money(avg),"Par transaction","violet")+kpi("▧","Produits en alerte",UI.num(mine("products").filter(function(p){return p.stock<=p.seuil;}).length),"Stock faible ou rupture","orange")+'</div><div class="split-panels">'+lineCard("Évolution du chiffre d’affaires",UI.lineChart(byDay,"Ventes des 7 derniers jours"))+lineCard("Produits les plus vendus",top)+'</div>';
  }
  function pageNotifications() {
    var ns=DB.notificationsFor(me),html=ns.length?'<div class="notification-list">'+ns.map(function(n){return '<article class="notification-item"><span class="notification-mark '+UI.esc(n.type)+'">◇</span><div><b>'+UI.esc(n.message)+'</b><small>'+UI.dateTime(n.createdAt)+'</small></div></article>';}).join("")+'</div>':emptyAction("Aucune notification pour le moment.");
    return pageHeader("Notifications","Les informations importantes liées à votre activité.","")+lineCard("Centre de notifications",html);
  }
  function pageProfile() {
    var store=storeName(me.magasinId);
    var fields=[{name:"prenom",label:"Prénom",required:true},{name:"nom",label:"Nom",required:true},{name:"email",label:"Email",type:"email",required:true},{name:"telephone",label:"Téléphone",type:"tel"}];
    var html='<div class="profile-card"><div class="avatar">'+UI.esc((me.prenom||"G").slice(0,1)+(me.nom||"").slice(0,1))+'</div><div><h2>'+UI.esc(me.prenom+" "+me.nom)+'</h2><p>'+UI.esc(fmtRole(role))+" · "+UI.esc(store)+'</p><span class="muted">'+UI.esc(me.email)+'</span></div><button class="btn ghost" data-edit-profile>Modifier mon profil</button></div>';
    html+=lineCard("Sécurité du compte",'<p>Votre mot de passe est enregistré sous forme de dérivé cryptographique dans ce prototype local.</p><button class="btn ghost" data-change-password>Changer mon mot de passe</button>');
    return pageHeader("Mon profil","Vos informations personnelles et paramètres de compte.","")+html;
  }
  function pageSettings() {
    var c=Auth.company()||{};var html='<form id="settings-form" class="settings-form"><div class="field"><label for="company-name">Nom de l’entreprise</label><input id="company-name" name="name" required value="'+UI.esc(c.name||"")+'"></div><div class="grid2"><div class="field"><label for="company-phone">Téléphone</label><input id="company-phone" name="phone" value="'+UI.esc(c.phone||"")+'"></div><div class="field"><label for="company-email">Email</label><input id="company-email" name="email" type="email" value="'+UI.esc(c.email||"")+'"></div></div><div class="field"><label for="company-address">Adresse</label><input id="company-address" name="address" value="'+UI.esc(c.address||"")+'"></div><div class="field"><label for="currency">Devise affichée</label><select id="currency" name="currency"><option '+((c.settings&&c.settings.currency)==="FCFA"?"selected":"")+'>FCFA</option><option '+((c.settings&&c.settings.currency)==="EUR"?"selected":"")+'>EUR</option></select></div><button class="btn primary" type="submit">Enregistrer les paramètres</button></form>';
    return pageHeader("Paramètres","Informations de l’entreprise et préférences générales.","")+lineCard("Entreprise",html);
  }
  function pageDashboard() {
    var sales=todaySales(),all=validSales(),products=mine("products"),customers=mine("customers"),rev=sum(sales,"total"),allRev=sum(all,"total"),goals=rows("goals");
    var goal=goals.find(function(g){return !g.userId||g.userId===me.id;}); var progress=goal?Math.round(allRev/goal.target*100):0;
    var heading='<div class="welcome"><div><span class="eyebrow">'+new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})+'</span><h1>Bonjour '+UI.esc(me.prenom)+' 👋</h1><p>'+(role==="admin"?"Voici l’aperçu global de votre entreprise.":role==="manager"?"Voici les indicateurs de votre magasin et de votre équipe.":"Voici votre activité et vos ventes du jour.")+'</p></div>'+(role==="vendeur"?action("＋ Réaliser une vente","pos","primary"):action("Voir les ventes","sales","ghost"))+'</div>';
    var kpis=role==="vendeur"?kpi("▣","Ventes du jour",UI.num(sales.length),"Transactions aujourd’hui","blue")+kpi("↗","Chiffre du jour",money(rev),"Aujourd’hui","green")+kpi("♙","Clients du jour",UI.num(sales.filter(function(s){return !!s.clientId;}).length),"Clients identifiés","violet")+kpi("◎","Objectif",goal?progress+" %":"À définir",goal?money(goal.target)+" visé":"Objectif non défini","orange"):
      kpi("↗","Chiffre d’affaires",money(allRev),"Toutes périodes","blue")+kpi("▣","Ventes",UI.num(all.length),"Transactions validées","green")+kpi("♙","Clients actifs",UI.num(customers.length),"Dans votre périmètre","violet")+kpi("▧","Produits en stock",UI.num(products.length),products.filter(function(p){return p.stock<=p.seuil;}).length+" alerte(s)","orange");
    if(role!=="vendeur") kpis+=kpi("♧",role==="admin"?"Utilisateurs":"Vendeurs actifs",UI.num(Auth.users().filter(function(u){return u.role==="vendeur"&&u.statut==="actif"&& (role==="admin"||u.magasinId===me.magasinId);}).length),"Comptes actifs","rose");
    var byDay=[];for(var i=6;i>=0;i--){var d=new Date();d.setDate(d.getDate()-i);byDay.push({label:d.toLocaleDateString("fr-FR",{weekday:"short"}),value:all.filter(function(s){return new Date(s.createdAt).toDateString()===d.toDateString();}).reduce(function(n,s){return n+s.total;},0)});}
    var recent=all.slice().sort(function(a,b){return b.createdAt.localeCompare(a.createdAt);}).slice(0,5);
    var recentHtml=UI.table([{label:"Vente",render:function(s){return '<b>'+UI.esc(s.number)+'</b>'; }},{label:"Client",render:function(s){return UI.esc(customerName(s.clientId));}},{label:"Montant",render:function(s){return '<b>'+money(s.total)+'</b>'; }},{label:"Date",render:function(s){return UI.dateTime(s.createdAt);}}],recent,"Aucune vente pour le moment.");
    var alerts=products.filter(function(p){return p.stock<=p.seuil;}).slice(0,5);
    var alertHtml=alerts.length?'<div class="alert-list">'+alerts.map(function(p){var s=productState(p);return '<div class="alert-row"><span class="alert-dot '+s[1]+'"></span><div><b>'+UI.esc(p.name)+'</b><small>'+UI.num(p.stock)+' restant(s) · seuil '+UI.num(p.seuil)+'</small></div>'+UI.badge(s[0],s[1])+'</div>';}).join("")+'</div>':'<div class="empty compact">Tout va bien, aucun stock en alerte.</div>';
    var quick=role==="vendeur"?['pos','customers','products']:['products','users','customers','pos'];
    var quickHtml=quick.map(function(v){return '<button data-view="'+v+'"><span>'+icons[v]+'</span><b>'+({pos:"Nouvelle vente",products:"Ajouter un produit",users:"Inviter un membre",customers:"Ajouter un client"}[v])+'</b><small>Accéder au module →</small></button>';}).join("");
    return heading+'<div class="stats-grid">'+kpis+'</div><div class="split-panels">'+lineCard("Activité des 7 derniers jours",UI.lineChart(byDay,"Chiffre d’affaires des 7 derniers jours"))+lineCard("Alertes de stock",alertHtml)+'</div>'+lineCard("Dernières ventes",recentHtml)+lineCard("Actions rapides",'<div class="quick-actions">'+quickHtml+'</div>');
  }
  function viewHtml() {
    if(!isAllowed(current)) current="dashboard";
    if(current==="dashboard")return pageDashboard();
    if(current==="products")return pageProducts(); if(current==="customers")return pageCustomers(); if(current==="suppliers")return pageSuppliers();
    if(current==="stores")return pageStores(); if(current==="categories")return pageCategories(); if(current==="users")return pageUsers();
    if(current==="stock")return pageStock(); if(current==="sales")return pageSales(); if(current==="pos")return pagePos(); if(current==="goals")return pageGoals();
    if(current==="reports")return pageReports(); if(current==="notifications")return pageNotifications(); if(current==="profile")return pageProfile(); if(current==="settings")return pageSettings();
    return pageDashboard();
  }
  function render() {
    if(!isAllowed(current))current="dashboard";
    var store=me.magasinId?storeName(me.magasinId):"Tous les magasins", unread=DB.notificationsFor(me).length;
    var nav=menus[role].map(function(v){return '<button class="nav-item '+(current===v?"active":"")+'" data-view="'+v+'"><span>'+icons[v]+'</span><b>'+UI.esc(names[v])+'</b>'+(v==="notifications"&&unread?'<i>'+unread+'</i>':"")+'</button>';}).join("");
    var logo=company.logo?'<img src="'+company.logo+'" alt="">':'<span class="brand-mark">G</span>';
    app.innerHTML='<div class="app-shell"><aside class="sidebar '+(mobileOpen?"open":"")+'"><a href="#dashboard" class="brand">'+logo+'<span><b>GestCom</b><small>Gestion Commerciale</small></span></a><div class="workspace"><span class="workspace-mark">'+UI.esc((company.name||"G").slice(0,1).toUpperCase())+'</span><span><b>'+UI.esc(company.name||"Mon entreprise")+'</b><small>'+UI.esc(store)+'</small></span><span class="chevron">⌄</span></div><div class="nav-caption">ESPACE DE TRAVAIL</div><nav>'+nav+'</nav><div class="sidebar-bottom"><div class="help-box"><span>✦</span><b>Besoin d’aide ?</b><small>Consultez votre espace et vos données.</small><button data-view="reports">Voir les rapports <span>→</span></button></div><button class="nav-item" data-logout><span>↪</span><b>Déconnexion</b></button></div></aside><div class="main-area"><header class="app-topbar"><button class="menu-toggle" data-menu aria-label="Ouvrir le menu">☰</button><div class="breadcrumb">GestCom <span>/</span> '+UI.esc(names[current]||"Tableau de bord")+'</div><div class="top-actions"><label class="global-search"><span>⌕</span><input id="global-search" placeholder="Rechercher…" aria-label="Recherche globale"><kbd>Ctrl K</kbd></label><div class="global-results" id="global-results" hidden></div><button class="top-icon" data-view="notifications" aria-label="Notifications">♢'+(unread?'<i></i>':"")+'</button><button class="user-chip" data-view="profile"><span class="avatar mini">'+UI.esc((me.prenom||"G").slice(0,1)+(me.nom||"").slice(0,1))+'</span><span><b>'+UI.esc(me.prenom+" "+me.nom)+'</b><small>'+UI.esc(fmtRole(role))+'</small></span><span>⌄</span></button></div></header><main class="workspace-main">'+viewHtml()+'</main><footer class="app-footer"><span>© '+new Date().getFullYear()+' GestCom</span><span>Gestion commerciale · '+UI.esc(fmtRole(role))+'</span></footer></div></div>';
    document.title="GestCom — "+(names[current]||"Tableau de bord");
  }
  function applySearch(input, selector) {
    var q=input.value.toLocaleLowerCase("fr"); document.querySelectorAll(selector).forEach(function(el){el.hidden=q&&!el.textContent.toLocaleLowerCase("fr").includes(q);});
  }
  function globalSearch(query) {
    var box=document.getElementById("global-results");if(!box)return;
    query=query.trim().toLocaleLowerCase("fr");if(query.length<2){box.hidden=true;box.innerHTML="";return;}
    var groups=[];
    function group(label,view,list,matcher,display){var matches=list.filter(matcher).slice(0,4);if(matches.length)groups.push('<div class="global-group"><small>'+label+'</small>'+matches.map(function(x){return '<button data-view="'+view+'"><b>'+UI.esc(display(x))+'</b><span>Ouvrir '+label.toLowerCase()+' →</span></button>';}).join("")+'</div>');}
    group("Produits","products",mine("products"),function(x){return (x.name+" "+x.sku+" "+x.barcode).toLocaleLowerCase("fr").includes(query);},function(x){return x.name+(x.sku?" · "+x.sku:"");});
    group("Clients","customers",mine("customers"),function(x){return (x.prenom+" "+x.nom+" "+x.phone+" "+x.email).toLocaleLowerCase("fr").includes(query);},function(x){return x.prenom+" "+x.nom;});
    group("Ventes","sales",validSales(),function(x){return (x.number+" "+customerName(x.clientId)).toLocaleLowerCase("fr").includes(query);},function(x){return x.number+" · "+money(x.total);});
    if(role!=="vendeur")group("Membres","users",Auth.users().filter(function(x){return role==="admin"||x.magasinId===me.magasinId;}),function(x){return (x.prenom+" "+x.nom+" "+x.email).toLocaleLowerCase("fr").includes(query);},function(x){return x.prenom+" "+x.nom+" · "+fmtRole(x.role);});
    box.innerHTML=groups.length?groups.join(""):'<div class="global-no-results">Aucun résultat pour « '+UI.esc(query)+' »</div>';box.hidden=false;
  }
  function exportSales() {
    var data=validSales().map(function(s){return [s.number,customerName(s.clientId),userName(s.vendeurId),s.payment,s.total,new Date(s.createdAt).toLocaleString("fr-FR")];});
    var csv="Vente;Client;Vendeur;Paiement;Total;Date\n"+data.map(function(r){return r.map(function(x){return '"'+String(x).replace(/"/g,'""')+'"';}).join(";");}).join("\n");
    var a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));a.download="gestcom-ventes.csv";a.click();URL.revokeObjectURL(a.href);
  }
  function printInvoice(sale) {
    var win=window.open("","_blank","width=760,height=800");if(!win){UI.toast("Autorisez la fenêtre d’impression dans votre navigateur.","error");return;}
    var items=(sale.items||[]).map(function(x){return '<tr><td>'+UI.esc(x.name)+'</td><td>'+UI.num(x.quantity)+'</td><td>'+money(x.unitPrice)+'</td><td>'+money(x.total)+'</td></tr>';}).join("");
    win.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Facture '+UI.esc(sale.number)+'</title><style>body{font:14px Arial,sans-serif;color:#18233e;padding:40px;max-width:760px;margin:auto}header{display:flex;justify-content:space-between;border-bottom:2px solid #315de8;padding-bottom:20px}h1{font-size:24px}small{color:#778198}table{border-collapse:collapse;width:100%;margin:28px 0}th,td{text-align:left;padding:12px;border-bottom:1px solid #e6eaf1}th{background:#f5f7fb}.total{text-align:right;font-size:19px;font-weight:bold;padding:15px}footer{margin-top:55px;text-align:center;color:#778198;font-size:12px}</style></head><body><header><div><h1>'+UI.esc(company.name||"GestCom")+'</h1><small>'+UI.esc(company.address||"")+'</small></div><div><h2>Facture</h2><b>'+UI.esc(sale.number)+'</b><br><small>'+UI.dateTime(sale.createdAt)+'</small></div></header><p><b>Client :</b> '+UI.esc(customerName(sale.clientId))+'<br><b>Vendeur :</b> '+UI.esc(userName(sale.vendeurId))+'<br><b>Paiement :</b> '+UI.esc(sale.payment||"—")+'</p><table><thead><tr><th>Article</th><th>Qté</th><th>Prix unitaire</th><th>Total</th></tr></thead><tbody>'+items+'</tbody></table><div class="total">Total : '+money(sale.total)+'</div><footer>Merci pour votre confiance.</footer><script>window.onload=function(){window.print();};<\/script></body></html>');win.document.close();
  }
  app.addEventListener("click",function(e){
    var target=e.target.closest("button");if(!target)return;
    if(target.dataset.view){current=target.dataset.view;location.hash=current;mobileOpen=false;render();return;}
    if(target.hasAttribute("data-menu")){mobileOpen=!mobileOpen;render();return;}
    if(target.hasAttribute("data-logout")){Auth.logout();location.replace("login.html");return;}
    if(target.hasAttribute("data-add-cart")){var id=target.dataset.addCart,p=DB.find("products",id),line=cart.find(function(x){return x.id===id;});if(!p)return;if(line){if(line.qty>=p.stock){UI.toast("Stock disponible insuffisant.","error");return;}line.qty++;}else cart.push({id:id,qty:1});render();return;}
    if(target.hasAttribute("data-qty")){var line=cart[Number(target.dataset.qty)],p=DB.find("products",line.id);line.qty+=Number(target.dataset.delta);if(line.qty<1)cart.splice(Number(target.dataset.qty),1);else if(line.qty>p.stock){line.qty=p.stock;UI.toast("Stock maximum atteint.","error");}render();return;}
    if(target.hasAttribute("data-remove-cart")){cart.splice(Number(target.dataset.removeCart),1);render();return;}
    if(target.hasAttribute("data-clear-cart")){cart=[];render();return;}
    if(target.hasAttribute("data-checkout")){doCheckout();return;}
    if(target.hasAttribute("data-action")){var ty=target.dataset.action.replace("add-","");if((ty==="users"||ty==="products")&&role==="vendeur")return;openForm(ty);return;}
    if(target.hasAttribute("data-edit")){if(target.dataset.edit==="products"&&role==="vendeur")return;openForm(target.dataset.edit,DB.find(target.dataset.edit,target.dataset.id));return;}
    if(target.hasAttribute("data-delete")){var type=target.dataset.delete,item=DB.find(type,target.dataset.id);if(item)removeItem(type,item);return;}
    if(target.hasAttribute("data-edit-user")){var us=Auth.users(),member=us.find(function(x){return String(x.id)===target.dataset.editUser;});if(!member)return;UI.formModal({title:"Modifier le membre",fields:[{name:"prenom",label:"Prénom",required:true},{name:"nom",label:"Nom",required:true},{name:"email",label:"Email",type:"email",required:true},{name:"telephone",label:"Téléphone",type:"tel"}],values:member,onSubmit:function(v){var duplicate=Auth.users().some(function(x){return x.id!==member.id&&x.email===v.email.toLowerCase();});if(duplicate)return "Cette adresse email est déjà utilisée.";Object.assign(member,v,{email:v.email.toLowerCase()});Auth.saveUsers(us);Auth.audit("user_updated",me.id);UI.toast("Informations du membre mises à jour.");render();}});return;}
    if(target.hasAttribute("data-stock")){if(role==="vendeur")return;var product=DB.find("products",target.dataset.stock);UI.formModal({title:"Ajuster le stock · "+product.name,fields:[{name:"kind",label:"Type de mouvement",type:"select",options:[{v:"entrée",l:"Entrée"},{v:"sortie",l:"Sortie"},{v:"ajustement",l:"Définir le stock actuel"}]},{name:"quantity",label:"Quantité",type:"number",min:0,required:true},{name:"reason",label:"Motif",required:true}],onSubmit:function(v){var current=Number(product.stock)||0,next=v.kind==="entrée"?current+v.quantity:v.kind==="sortie"?current-v.quantity:v.quantity;if(next<0)return "La quantité disponible ne permet pas cette sortie.";DB.update("products",product.id,{stock:next});DB.add("movements",{productId:product.id,magasinId:product.magasinId||me.magasinId||"",type:v.kind,quantity:v.quantity,reason:v.reason,userId:me.id});if(next<=Number(product.seuil||0))DB.notify("stock","Stock faible : "+product.name+" ("+next+" restant(s)).",{roles:["admin","manager"],magasinId:product.magasinId||me.magasinId||""});Auth.audit("stock_adjusted",me.id);UI.toast("Stock mis à jour.");render();}});return;}
    if(target.hasAttribute("data-toggle-user")){var users=Auth.users(),u=users.find(function(x){return String(x.id)===target.dataset.toggleUser;});if(u){u.statut=u.statut==="actif"?"inactif":"actif";Auth.saveUsers(users);Auth.audit("user_status_changed",me.id);UI.toast("Statut du compte mis à jour.");render();}return;}
    if(target.hasAttribute("data-resend")){var u=Auth.users().find(function(x){return String(x.id)===target.dataset.resend;});if(u&&u.inviteToken){showInvite(new URL("activation.html?token="+encodeURIComponent(u.inviteToken),location.href).href,u);}return;}
    if(target.hasAttribute("data-export")){exportSales();return;}
    if(target.hasAttribute("data-invoice")){var sale=DB.find("sales",target.dataset.invoice);if(sale)printInvoice(sale);return;}
    if(target.hasAttribute("data-edit-profile")){UI.formModal({title:"Modifier mon profil",fields:[{name:"prenom",label:"Prénom",required:true},{name:"nom",label:"Nom",required:true},{name:"email",label:"Email",type:"email",required:true},{name:"telephone",label:"Téléphone",type:"tel"}],values:me,onSubmit:function(v){var us=Auth.users(),u=us.find(function(x){return x.id===me.id;});Object.assign(u,v);Auth.saveUsers(us);Auth.audit("profile_updated",me.id);me=u;UI.toast("Profil mis à jour.");render();}});return;}
    if(target.hasAttribute("data-change-password")){UI.formModal({title:"Changer mon mot de passe",fields:[{name:"current",label:"Mot de passe actuel",type:"password",required:true},{name:"password",label:"Nouveau mot de passe",type:"password",required:true},{name:"confirm",label:"Confirmer le nouveau mot de passe",type:"password",required:true}],onSubmit:async function(v){var h=await Auth.hash(v.current,me.salt);if(h.hash!==me.hash)return "Le mot de passe actuel est incorrect.";if(v.password.length<8||!/[A-Za-z]/.test(v.password)||!/[0-9]/.test(v.password))return "Utilisez au moins 8 caractères avec des lettres et des chiffres.";if(v.password!==v.confirm)return "Les mots de passe ne correspondent pas.";try{await Auth.updateCloudPassword(v.password);}catch(ex){return ex.message;}var nh=await Auth.hash(v.password),us=Auth.users(),u=us.find(function(x){return x.id===me.id;});u.salt=nh.salt;u.hash=nh.hash;Auth.saveUsers(us);Auth.audit("password_changed",me.id);UI.toast("Mot de passe modifié.");}});return;}
  });
  app.addEventListener("input",function(e){if(e.target.matches("[data-search]"))applySearch(e.target,".tbl tbody tr");if(e.target.matches("[data-product-search]"))applySearch(e.target,".product-tile");if(e.target.id==="global-search")globalSearch(e.target.value);});
  app.addEventListener("submit",function(e){if(e.target.id==="settings-form"){e.preventDefault();var f=e.target,c=Auth.company()||{};c.name=f.elements.name.value.trim();c.phone=f.elements.phone.value.trim();c.email=f.elements.email.value.trim();c.address=f.elements.address.value.trim();c.settings=c.settings||{};c.settings.currency=f.elements.currency.value;localStorage.setItem("gestcom_company",JSON.stringify(c));company=c;Auth.audit("company_settings_updated",me.id);UI.toast("Paramètres enregistrés.");render();}});
  window.addEventListener("hashchange",function(){current=location.hash.replace(/^#\/?/,"")||"dashboard";mobileOpen=false;render();});
  document.addEventListener("keydown",function(e){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();var s=document.getElementById("global-search");if(s)s.focus();}});
  render();
})();
