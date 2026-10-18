-- =====================================================================
--  MIGRATION v1 -> v2 (bases déjà créées avant l'ajout CNI / remises)
--  Python et PHP l'appliquent automatiquement au démarrage.
--  À la main : exécuter la partie correspondant à votre base.
-- =====================================================================

-- ---------- SQLite ----------
ALTER TABLE membres ADD COLUMN telephone2 TEXT;
ALTER TABLE membres ADD COLUMN cni TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_membres_cni ON membres (cni);
CREATE TABLE IF NOT EXISTS remises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    part_id INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
    echeance INTEGER NOT NULL CHECK (echeance BETWEEN 1 AND 10),
    montant INTEGER NOT NULL,
    mode TEXT NOT NULL DEFAULT 'ESPECES',
    reference TEXT, date_remise TEXT NOT NULL, observation TEXT,
    UNIQUE (part_id, echeance));

-- ---------- MySQL / MariaDB ----------
-- ALTER TABLE membres ADD COLUMN telephone2 VARCHAR(30) NULL, ADD COLUMN cni VARCHAR(30) NULL UNIQUE;
-- puis le CREATE TABLE remises de schema_mysql.sql
