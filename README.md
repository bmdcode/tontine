# Gestionnaire de Tontines — 4 versions, 1 schéma

Outil de gestion comptable réservé à l'administrateur d'une tontine : inscription des membres, groupes de 10, parts à 100 / 50 / 25 %, versements, retards, permutation des tours et listes de contrôle.

**▶ Version en ligne : `https://<votre-compte>.github.io/<nom-du-depot>/`** (voir § 5 pour l'activer)

```
tontine/
├── 00_schema/           Schéma universel (SQLite + MySQL) et requêtes clés
├── 01_excel_vba/        Module VBA à importer dans Excel (.xlsm)
├── 02_python/           Application de bureau Tkinter + SQLite (1 fichier)
├── 03_php/              Application web locale (XAMPP / WAMP / MAMP)
└── docs/                Application HTML / JavaScript (GitHub Pages, hors ligne)
```

---

## 1. Schéma de base de données universel

| Table | Rôle | Colonnes principales |
|---|---|---|
| `parametres` | Réglages | `cle`, `valeur` (ex. `mise_reference` = 100000) |
| `membres` | Module A | `id`, `nom`, `prenom`, `telephone` (unique), `telephone2` (facultatif), `cni` (facultatif, unique), `date_inscription` |
| `groupes` | Module B | `id`, `code` (G001…), `mise_reference`, `tour_courant` (1 à 10, 11 = fini), `statut` (OUVERT / EN_COURS / CLOTURE), `date_debut` |
| `parts` | Lien membre ↔ groupe ↔ tour | `id`, `membre_id`, `groupe_id`, `position` (1 à 10), `quarts` (1, 2 ou 4) |
| `versements` | Module C | `id`, `part_id`, `echeance` (1 à 10), `montant`, `statut` (PAYE / IMPAYE), `date_paiement` |
| `remises` | Remise du lot | `id`, `part_id`, `echeance`, `montant`, `mode` (Espèces, Wave, Orange Money, Free Money, Virement, Chèque, Autre), `reference`, `date_remise`, `observation` |
| `permutations` | Traçabilité | `id`, `groupe_id`, `description` (permutation, tirage au sort, remplacement), `date_operation` |

Relations : `membres 1—n parts n—1 groupes`, `parts 1—n versements`, `parts 1—n remises`, `groupes 1—n permutations`.

### Règles clés (identiques dans les 3 versions)

- **Une case (tour) vaut 4 quarts.** Elle peut être tenue par 1 membre à 100 %, 2 à 50 %, 4 à 25 % ou un mélange (2 + 1 + 1). Les fractions sont stockées en entiers pour éviter les arrondis.
- **Formules** : Global = 4 quarts dans 1 groupe · 2 parts = 2 quarts dans 2 groupes différents · 4 parts = 1 quart dans 4 groupes différents.
- **Attribution automatique** : on cherche d'abord une case que la part complète exactement, sinon la première case ayant assez de place, sinon un nouveau groupe est créé.
- **Démarrage** : un groupe ne démarre que si ses 10 cases sont pleines à 100 %. Ensuite on ne peut plus y ajouter de part.
- **Montants** : cotisation d'une part = mise × quarts ÷ 4 ; lot d'une part = mise × 10 × quarts ÷ 4. La mise doit être divisible par 4.
- **États calculés** (jamais stockés) : *Reçu* si position < tour courant · *Bénéficiaire du mois* si position = tour courant · *En attente* sinon · *Retard* = versement impayé d'une échéance déjà clôturée · *Restant* = attendu − encaissé de l'échéance en cours.
- **Clôture d'échéance** : passe au tour suivant et crée les lignes de versement du nouveau mois. Les impayés non réglés deviennent des retards (on peut toujours les régler ensuite).
- **Permutation** : 2 tours (A ↔ B) ou 3 tours (A → B → C → A), interdite sur un tour déjà levé ou dont le lot est remis, enregistrée dans l'historique.
- **Tirage au sort** : mélange aléatoire de l'ordre de passage. Groupe ouvert : les 10 tours ; groupe en cours : uniquement les tours après le tour courant. Les co-titulaires d'une même case restent ensemble. Le résultat est enregistré dans l'historique.
- **Modification d'une fiche** : nom, prénom, téléphones et CNI se corrigent à tout moment ; un numéro de téléphone ou de CNI ne peut appartenir qu'à un seul membre.
- **Remplacement d'un titulaire** : en cas de départ ou de cession, la part (son tour et ses cotisations à venir) passe à un autre membre inscrit ; tracé dans l'historique.
- **Remise du lot** : pour chaque bénéficiaire du tour, on enregistre le mode de paiement, la référence (n° de transaction Wave / Orange Money, n° de chèque…), la date et une observation. La référence est obligatoire sauf en espèces. Deux listes : *Lots à remettre* et *Lots remis*.

Fichiers : `schema_universel.sql` (SQLite, avec 2 vues), `schema_mysql.sql`, `requetes_cles.sql` (impayés, retards, reçus, non reçus, restant, permutation, lots à remettre, lots remis), `migration_v2.sql`.

**Mise à niveau** : les versions Python, PHP et HTML mettent à jour automatiquement une base ou une sauvegarde existante (ajout du 2e téléphone, de la CNI et des remises). Pour Excel, réimportez `modTontine.bas` puis relancez **InstallerClasseur** : vos données sont conservées.

---

## 2. Version Excel VBA

1. Ouvrez un classeur vide et enregistrez-le en **Classeur Excel prenant en charge les macros (.xlsm)**.
2. `Alt + F11` → *Fichier > Importer un fichier…* → `modTontine.bas`.
3. `Alt + F8` → **InstallerClasseur** → *Exécuter*. Les feuilles, listes déroulantes et boutons sont créés.
4. (Facultatif) collez `Feuille_Suivi_Paiements.txt` dans le module de la feuille *Suivi_Paiements* pour dater automatiquement les paiements.

| Feuille | Usage |
|---|---|
| Membres | Zone de saisie (K2:K7 : nom, prénom, 2 téléphones, CNI, formule) + boutons **Inscrire + attribuer** (Macro 1), **Attribuer au membre sélectionné**, **Modifier le membre sélectionné** / **Enregistrer les modifications** |
| Gestion_Groupes | Choix du groupe en C1, tableau des 10 tours, **Démarrer**, **Permuter les tours sélectionnés** (Macro 2 : sélectionnez 2 ou 3 lignes avec Ctrl + clic), **Tirage au sort des tours**, **Remplacer un titulaire** |
| Remises | Une ligne par bénéficiaire quand son tour s'ouvre : remplissez Mode, Référence et Date (en jaune tant que le lot n'est pas remis) |
| Suivi_Paiements | Liste PAYE / IMPAYE par part et par échéance, boutons de marquage, filtres automatiques, **Clôturer l'échéance** |
| Rapport_Impayes | **Macro 3** : restant par groupe, impayés du mois, retards |
| Listes_Controle | Payés, Reçus, Non reçus, Lots à remettre, Lots remis |
| Groupes, Parts, Permutations, Parametres | Données (ne pas modifier à la main sauf la mise en Parametres!B2) |

---

## 3. Version Python (Tkinter + SQLite)

```
python tontine_app.py
```

Python 3.8 ou plus, aucune installation supplémentaire (sous Linux : `sudo apt install python3-tk`). La base `tontine.db` est créée à côté du script ; pour sauvegarder, copiez ce fichier.

Onglets : **Membres** (inscription, modification de la fiche, attribution) · **Groupes de dix** (tableau, démarrage, tirage au sort, permutation, remplacement d'un titulaire, historique) · **Paiements** (marquer Payé / Impayé, remise du lot avec référence, clôture) · **Rapports & listes** (8 listes, export CSV pour Excel) · **Paramètres** (mise).

---

## 4. Version web locale (PHP)

1. Copiez le dossier `03_php` dans `htdocs` (XAMPP / MAMP) ou `www` (WAMP), renommé par exemple `tontine`.
2. Ouvrez `http://localhost/tontine/`.

Par défaut la base est **SQLite** : rien à configurer, le fichier `data/tontine.sqlite` est créé au premier lancement (extension `pdo_sqlite`, active par défaut dans XAMPP). Pour **MySQL** : importez `sql/schema_mysql.sql` dans phpMyAdmin puis mettez `DB_DRIVER = 'mysql'` dans `config.php`.

Pour protéger l'accès, renseignez `ADMIN_PASSWORD` dans `config.php`.

| Fichier | Rôle |
|---|---|
| `config.php` | Connexion PDO (SQLite ou MySQL), mot de passe |
| `fonctions.php` | Toute la logique métier (identique à Python et VBA) |
| `index.php` | Tableau de bord, caisse du mois, filtres Payés / Impayés / Retards / Reçus / Non reçus / Restant, export CSV, impression |
| `membres.php` | Inscription, modification des fiches et attribution des parts |
| `groupes.php` | Tableaux de 10, démarrage, tirage au sort, permutation, remplacement d'un titulaire, historique |
| `paiements.php` | Cases à cocher Payé / Impayé, remise du lot (mode, référence, date), clôture d'échéance |
| `header.php`, `footer.php`, `login.php` | Mise en page Bootstrap 5 (CDN) et connexion |

Requiert PHP 7.4 ou plus.

---

## 5. Version HTML (GitHub Pages) — application installable

> **v3 (version HTML)** : tarifs libres (100 000 F à 5 000 000 F ou tout autre montant divisible par 4, lot = 10 × le tarif), parts de 25, 50 ou 75 % dans un seul groupe, retards réglables après la clôture d'un mois, tirage au sort avec places imposées, nom et mois de chaque tour (impression du tableau), installation sur téléphone et fonctionnement sans internet. 
>
> **v4 (version HTML)** : formules « 75 % + 25 % » (2 groupes) et « 50 % + 25 % + 25 % » (3 groupes) ; suivi individuel de chaque membre (parts, taux de participation, versé / dû, retards, lots) avec relevé imprimable ; numérotation des groupes réglable (ex. à partir de G109) et numéro modifiable ; affiches PNG pour statut WhatsApp, publication Facebook ou format carré (tableau d'un groupe ou grille des tarifs, avec les responsables) à télécharger ou partager ; fiche de remise du lot à signer, en deux exemplaires, avec le montant en lettres.
>
> Les versions Python, PHP et Excel n'ont pas encore les ajouts v3 et v4.

Le dossier `docs/` contient une application complète en HTML + JavaScript, sans serveur ni dépendance externe : `index.html`, `css/style.css`, `js/core.js` (logique métier, identique aux autres versions) et `js/app.js` (interface).

- **Installer sur le téléphone** : ouvrez le lien en ligne, puis *Paramètres > Installer l'application* (Android : menu ⋮ → « Installer l'application » ; iPhone : Partager → « Sur l'écran d'accueil »). L'application a alors son icône et marche hors connexion.
- **Utilisation locale** : double-cliquez sur `docs/index.html` (l'installation n'est possible que depuis le site en ligne).
- **En ligne** : sur GitHub, *Settings > Pages > Build and deployment*, source **Deploy from a branch**, branche `main`, dossier **/docs**, puis *Save*. Le lien apparaît après une minute.

Les données sont enregistrées **dans le navigateur de l'appareil utilisé** (localStorage), jamais sur GitHub. Chaque téléphone ou ordinateur a donc ses propres données :

- exportez une sauvegarde `.json` après chaque séance (*Paramètres > Exporter*) ;
- pour changer d'appareil, importez cette sauvegarde sur le nouvel appareil ;
- évitez la navigation privée, qui efface tout à la fermeture.

Le bouton *Charger des données d'exemple* permet de faire une démonstration sans saisir de vrais membres.

Les numéros de CNI et de téléphone sont des données personnelles : ils restent dans le navigateur et ne doivent jamais être déposés sur GitHub. Ne publiez que le code, jamais un fichier de sauvegarde `.json`.
