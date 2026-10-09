# GestCom — Gestion Commerciale

Prototype web responsive de gestion commerciale multi-rôles, basé sur le PRD du projet.

## Démarrage

Ouvrez `index.html` dans un navigateur moderne. Au premier lancement, GestCom demande de créer l’entreprise et son compte administrateur. Le tableau de bord s’ouvre ensuite après connexion.

## Parcours inclus

- Tableaux de bord adaptés aux rôles administrateur, manager et vendeur.
- Gestion du catalogue, catégories, clients, fournisseurs, utilisateurs et magasins.
- Invitations avec activation du compte et choix du mot de passe par la personne invitée.
- Caisse : recherche catalogue, panier, choix du client et du moyen de paiement, encaissement, décrément du stock et facture imprimable.
- Suivi des alertes et mouvements de stock, objectifs, rapports, export CSV, recherche et profil.
- Récupération du mot de passe avec lien de réinitialisation.

## Synchronisation Supabase

Le projet utilise Supabase Auth et la table privée `gestcom_workspace` pour synchroniser la sauvegarde GestCom entre appareils. La configuration publique du projet est dans `js/supabase-config.js` ; seules l’URL et la clé publishable y figurent. Ne jamais y placer une clé `sb_secret_` ou `service_role`.

Pour initialiser la base, exécutez une seule fois `supabase/schema.sql` dans **Supabase → SQL Editor**. Dans **Authentication → URL Configuration**, ajoutez `https://ndoua225.github.io/gestcom/**` à la liste des URL de redirection autorisées. Ouvrez ensuite GestCom sur l’appareil où le compte admin existe déjà et connectez-vous avec son adresse email et son mot de passe. Cette première connexion crée le compte Auth Supabase et transfère la sauvegarde locale. Si la confirmation email est activée dans Supabase, confirmez l’email puis reconnectez-vous sur cet appareil pour terminer le transfert. Sur un autre appareil, connectez-vous avec la même adresse email et le même mot de passe ; le compte ne repassera pas par l’enregistrement admin.

Les tables appliquent une politique RLS : chaque compte Supabase ne peut lire ou modifier que sa propre sauvegarde. La sauvegarde est transmise après les modifications et n’inclut ni le jeton de session ni le mot de passe en clair. Cette première intégration synchronise le compte administrateur et sa sauvegarde. Les comptes d’équipe, invitations et la récupération de mot de passe restent à migrer ; les rôles et permissions GestCom sont encore contrôlés par le prototype front-end. Une application multi-utilisateurs de production doit déplacer ces contrôles côté serveur.
