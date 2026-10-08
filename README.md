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

## Données et limites

Cette version est un prototype front-end : les données sont conservées dans le stockage local du navigateur. Elles ne sont pas synchronisées entre appareils ou comptes navigateur. Les invitations et liens de réinitialisation sont générés à l’écran pour être partagés manuellement ; aucun email n’est envoyé. Les rôles et permissions sont appliqués dans l’interface, sans serveur d’API.

Pour un déploiement de production, il faudra connecter une API et une base de données, déplacer l’authentification et les contrôles d’accès côté serveur, puis intégrer l’envoi de courriels et les paiements externes.
