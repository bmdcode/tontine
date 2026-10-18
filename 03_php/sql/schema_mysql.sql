-- =====================================================================
--  GESTIONNAIRE DE TONTINES — VARIANTE MySQL / MariaDB (XAMPP, WAMP, MAMP)
--  Mêmes tables et colonnes que schema_universel.sql
--  Import : phpMyAdmin > Importer > ce fichier
-- =====================================================================

CREATE DATABASE IF NOT EXISTS tontine CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE tontine;

CREATE TABLE IF NOT EXISTS parametres (
    cle     VARCHAR(50) PRIMARY KEY,
    valeur  VARCHAR(255) NOT NULL
) ENGINE=InnoDB;
INSERT IGNORE INTO parametres (cle, valeur) VALUES ('mise_reference', '100000'), ('nom_tontine', 'Ma Tontine');

CREATE TABLE IF NOT EXISTS membres (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    nom               VARCHAR(80)  NOT NULL,
    prenom            VARCHAR(80)  NOT NULL,
    telephone         VARCHAR(30)  NOT NULL UNIQUE,
    telephone2        VARCHAR(30)  NULL,
    cni               VARCHAR(30)  NULL UNIQUE,
    date_inscription  DATE NOT NULL DEFAULT (CURRENT_DATE)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS groupes (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(10) NOT NULL UNIQUE,
    mise_reference  INT NOT NULL,
    tour_courant    TINYINT NOT NULL DEFAULT 1,
    statut          ENUM('OUVERT','EN_COURS','CLOTURE') NOT NULL DEFAULT 'OUVERT',
    date_creation   DATE NOT NULL DEFAULT (CURRENT_DATE),
    date_debut      DATE NULL,
    CHECK (tour_courant BETWEEN 1 AND 11),
    CHECK (mise_reference > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS parts (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    membre_id         INT NOT NULL,
    groupe_id         INT NOT NULL,
    position          TINYINT NOT NULL,
    quarts            TINYINT NOT NULL,
    date_attribution  DATE NOT NULL DEFAULT (CURRENT_DATE),
    UNIQUE KEY uq_groupe_membre (groupe_id, membre_id),
    KEY idx_parts_groupe_pos (groupe_id, position),
    CONSTRAINT fk_parts_membre FOREIGN KEY (membre_id) REFERENCES membres(id) ON DELETE RESTRICT,
    CONSTRAINT fk_parts_groupe FOREIGN KEY (groupe_id) REFERENCES groupes(id) ON DELETE CASCADE,
    CHECK (position BETWEEN 1 AND 10),
    CHECK (quarts IN (1, 2, 4))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS versements (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    part_id        INT NOT NULL,
    echeance       TINYINT NOT NULL,
    montant        INT NOT NULL,
    statut         ENUM('PAYE','IMPAYE') NOT NULL DEFAULT 'IMPAYE',
    date_paiement  DATE NULL,
    UNIQUE KEY uq_part_echeance (part_id, echeance),
    KEY idx_versements_ech (echeance, statut),
    CONSTRAINT fk_versements_part FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE,
    CHECK (echeance BETWEEN 1 AND 10)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS remises (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    part_id      INT NOT NULL,
    echeance     TINYINT NOT NULL,
    montant      INT NOT NULL,
    mode         ENUM('ESPECES','WAVE','ORANGE_MONEY','FREE_MONEY','VIREMENT','CHEQUE','AUTRE') NOT NULL DEFAULT 'ESPECES',
    reference    VARCHAR(100) NULL,
    date_remise  DATE NOT NULL,
    observation  VARCHAR(255) NULL,
    UNIQUE KEY uq_remise (part_id, echeance),
    CONSTRAINT fk_remises_part FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS permutations (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    groupe_id       INT NOT NULL,
    description     VARCHAR(255) NOT NULL,
    date_operation  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_perm_groupe FOREIGN KEY (groupe_id) REFERENCES groupes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Note : si votre MariaDB refuse « DEFAULT (CURRENT_DATE) » (versions < 10.2),
-- remplacez ces lignes par « DATE NOT NULL » : le code PHP renseigne toujours la date.
