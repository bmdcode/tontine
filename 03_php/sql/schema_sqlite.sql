-- =====================================================================
--  GESTIONNAIRE DE TONTINES — SCHÉMA DE BASE DE DONNÉES UNIVERSEL
--  Dialecte : SQLite 3 (utilisé tel quel par Python et par PHP/SQLite)
--  Variante MySQL/MariaDB : voir schema_mysql.sql (mêmes tables, mêmes noms)
--  Excel/VBA : chaque table = une feuille, chaque colonne = une colonne
-- =====================================================================
--
--  PRINCIPE CLÉ : la « position » (tour) est une case de 1 à 10 dans un
--  groupe. Une case vaut 4 QUARTS. Elle peut être tenue par :
--     • 1 membre à 100 %  (4 quarts)
--     • 2 membres à 50 %  (2 + 2 quarts)
--     • 4 membres à 25 %  (1+1+1+1 quarts), ou toute combinaison = 4
--  Les fractions sont stockées en ENTIERS (quarts) pour éviter toute
--  erreur d'arrondi, dans les trois versions.
--
--  Formules d'attribution (Module A) :
--     Global  : quarts = 4 dans 1 groupe
--     2 parts : quarts = 2 dans 2 groupes différents
--     4 parts : quarts = 1 dans 4 groupes différents
--
--  Montants (en FCFA, entiers) :
--     cotisation d'une part par échéance = mise_reference × quarts / 4
--     lot reçu par une part à son tour    = mise_reference × 10 × quarts / 4
--
--  États calculés (jamais stockés, donc toujours justes) :
--     Reçu       : position <  tour_courant du groupe
--     Non reçu   : position >= tour_courant (= tour_courant → bénéficiaire du mois)
--     Retard     : versement IMPAYE d'une échéance <  tour_courant
--     Restant    : attendu − encaissé pour l'échéance = tour_courant
--     Lot remis  : une ligne existe dans « remises » (mode + référence)
--
--  Tirage au sort : les positions (cases entières, co-titulaires compris)
--  sont mélangées au hasard ; groupe ouvert = 10 tours, groupe en cours
--  = seulement les tours après le tour courant. Tracé dans permutations.
-- =====================================================================

PRAGMA foreign_keys = ON;

-- Paramètres généraux (mise de référence, nom de la tontine…)
CREATE TABLE IF NOT EXISTS parametres (
    cle     TEXT PRIMARY KEY,
    valeur  TEXT NOT NULL
);
INSERT OR IGNORE INTO parametres (cle, valeur) VALUES ('mise_reference', '100000');
INSERT OR IGNORE INTO parametres (cle, valeur) VALUES ('nom_tontine', 'Ma Tontine');

-- Module A : membres inscrits
CREATE TABLE IF NOT EXISTS membres (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    nom               TEXT NOT NULL,
    prenom            TEXT NOT NULL,
    telephone         TEXT NOT NULL UNIQUE,
    telephone2        TEXT,                                 -- facultatif
    cni               TEXT UNIQUE,                          -- n° CNI, facultatif (NULL si absent)
    date_inscription  TEXT NOT NULL DEFAULT (date('now'))
);

-- Module B : groupes de dix
CREATE TABLE IF NOT EXISTS groupes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT NOT NULL UNIQUE,                       -- G001, G002…
    mise_reference  INTEGER NOT NULL CHECK (mise_reference > 0),
    tour_courant    INTEGER NOT NULL DEFAULT 1
                    CHECK (tour_courant BETWEEN 1 AND 11),      -- 11 = terminé
    statut          TEXT NOT NULL DEFAULT 'OUVERT'
                    CHECK (statut IN ('OUVERT','EN_COURS','CLOTURE')),
    date_creation   TEXT NOT NULL DEFAULT (date('now')),
    date_debut      TEXT
);

-- Module A+B : parts (lien membre ↔ groupe ↔ position)
CREATE TABLE IF NOT EXISTS parts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    membre_id   INTEGER NOT NULL REFERENCES membres(id) ON DELETE RESTRICT,
    groupe_id   INTEGER NOT NULL REFERENCES groupes(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL CHECK (position BETWEEN 1 AND 10),
    quarts      INTEGER NOT NULL CHECK (quarts IN (1, 2, 4)),
    date_attribution TEXT NOT NULL DEFAULT (date('now')),
    UNIQUE (groupe_id, membre_id)        -- un membre : une seule part par groupe
);
CREATE INDEX IF NOT EXISTS idx_parts_groupe_pos ON parts (groupe_id, position);
-- Règle applicative (vérifiée par le code) : SUM(quarts) par (groupe, position) <= 4

-- Module C : versements (une ligne par part et par échéance)
CREATE TABLE IF NOT EXISTS versements (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    part_id        INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
    echeance       INTEGER NOT NULL CHECK (echeance BETWEEN 1 AND 10),
    montant        INTEGER NOT NULL,
    statut         TEXT NOT NULL DEFAULT 'IMPAYE' CHECK (statut IN ('PAYE','IMPAYE')),
    date_paiement  TEXT,
    UNIQUE (part_id, echeance)
);
CREATE INDEX IF NOT EXISTS idx_versements_ech ON versements (echeance, statut);

-- Remise du lot aux bénéficiaires (une ligne par part bénéficiaire et par échéance)
CREATE TABLE IF NOT EXISTS remises (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    part_id      INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
    echeance     INTEGER NOT NULL CHECK (echeance BETWEEN 1 AND 10),
    montant      INTEGER NOT NULL,
    mode         TEXT NOT NULL DEFAULT 'ESPECES'
                 CHECK (mode IN ('ESPECES','WAVE','ORANGE_MONEY','FREE_MONEY','VIREMENT','CHEQUE','AUTRE')),
    reference    TEXT,                                      -- n° de transaction, de chèque, de reçu…
    date_remise  TEXT NOT NULL,
    observation  TEXT,
    UNIQUE (part_id, echeance)
);

-- Traçabilité des permutations et des tirages au sort
CREATE TABLE IF NOT EXISTS permutations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    groupe_id       INTEGER NOT NULL REFERENCES groupes(id) ON DELETE CASCADE,
    description     TEXT NOT NULL,                 -- ex. « 3→7, 7→3 » ou « Tirage au sort : … »
    date_operation  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
--  VUES (facultatives, mais pratiques pour les rapports)
-- ---------------------------------------------------------------------
CREATE VIEW IF NOT EXISTS v_parts AS
SELECT p.id            AS part_id,
       g.id            AS groupe_id,
       g.code          AS groupe,
       g.statut,
       g.tour_courant,
       p.position,
       m.id            AS membre_id,
       m.nom || ' ' || m.prenom AS membre,
       m.telephone,
       p.quarts,
       p.quarts * 25   AS pourcentage,
       g.mise_reference * p.quarts / 4       AS cotisation,
       g.mise_reference * 10 * p.quarts / 4  AS lot,
       CASE WHEN g.statut <> 'OUVERT' AND p.position <  g.tour_courant THEN 'RECU'
            WHEN g.statut =  'EN_COURS' AND p.position = g.tour_courant THEN 'BENEFICIAIRE'
            ELSE 'EN_ATTENTE' END AS etat_reception
FROM parts p
JOIN groupes g ON g.id = p.groupe_id
JOIN membres m ON m.id = p.membre_id;

CREATE VIEW IF NOT EXISTS v_situation_echeance AS
SELECT g.id AS groupe_id, g.code AS groupe, g.tour_courant AS echeance,
       COALESCE(SUM(v.montant), 0) AS attendu,
       COALESCE(SUM(CASE WHEN v.statut = 'PAYE' THEN v.montant END), 0) AS encaisse,
       COALESCE(SUM(CASE WHEN v.statut = 'IMPAYE' THEN v.montant END), 0) AS restant,
       SUM(CASE WHEN v.statut = 'IMPAYE' THEN 1 ELSE 0 END) AS nb_impayes
FROM groupes g
LEFT JOIN parts p      ON p.groupe_id = g.id
LEFT JOIN versements v ON v.part_id = p.id AND v.echeance = g.tour_courant
WHERE g.statut = 'EN_COURS'
GROUP BY g.id, g.code, g.tour_courant;
