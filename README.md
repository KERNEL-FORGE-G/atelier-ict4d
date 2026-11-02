# Site d’inscription — Ateliers ICT4D

Site statique en français pour les préinscriptions des étudiants L1–L3 de la filière ICT4D à l’Université de Yaoundé I. Les dates, horaires et lieux restent annoncés comme « à venir » plutôt que d’être inventés.

## Fonctionnement

- `index.html` présente l’accueil et les ateliers; `inscription/index.html` contient la fiche unique pour choisir un ou plusieurs ateliers.
- `netlify/functions/register.mjs` valide les champs et transmet toute la fiche à Supabase via une RPC sécurisée. Les horaires compatibles sont contrôlés côté serveur; un honeypot et une limite de requêtes réduisent le spam.
- `admin/index.html` et `admin/admin.js` constituent l’interface d’administration. Les organisateurs peuvent saisir les dates, heures locales de Yaoundé et salles lorsqu’elles sont confirmées.
- `netlify/functions/admin.mjs` sert d’intermédiaire, garde la session dans un cookie `HttpOnly; Secure; SameSite=Strict` et n’expose jamais le jeton de session au JavaScript.
- La migration `supabase/migrations/20261102231000_single_registration_multi_workshop.sql` ajoute les liens d’ateliers par fiche, les champs de planning et les RPC versionnées sans supprimer les inscriptions existantes.
- Le dossier `public/` est la copie effectivement publiée par Netlify; garder les fichiers sources et leurs copies publiques synchronisés.

## Variables Netlify

Configurer `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY` dans le contexte `all`, scope `functions`. La clé publishable est publique et n’est pas une clé de service. Ne jamais ajouter de clé `service_role` à ce site.

## Déploiement

Le projet est prêt pour un déploiement Netlify depuis la racine de ce dossier; aucun framework ni étape de compilation n’est nécessaire. Le dossier `netlify/functions` doit rester hors du contenu statique publié.
