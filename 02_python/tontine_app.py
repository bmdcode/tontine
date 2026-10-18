#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=====================================================================
 GESTIONNAIRE DE TONTINES — Application de bureau (Tkinter + SQLite)
 Fichier unique, aucune dépendance externe (Python 3.8 ou plus).
 Lancement :  python tontine_app.py
 La base « tontine.db » est créée automatiquement à côté du script.
=====================================================================
 Organisation du code :
   1. Constantes et schéma SQL (identique au schéma universel)
   2. Classe Database  -> toute la logique métier (modules A, B, C)
   3. Classe App       -> interface graphique à onglets
=====================================================================
"""
import csv
import datetime
import os
import random
import sqlite3
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

# ---------------------------------------------------------------------
# 1. CONSTANTES ET SCHÉMA
# ---------------------------------------------------------------------
DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tontine.db")
NB_POSITIONS = 10          # strictement 10 tours par groupe
QUARTS_CASE = 4            # une case pleine = 4 quarts = 100 %

MODES = {                  # code -> libellé (remise du lot)
    "ESPECES": "Espèces", "WAVE": "Wave", "ORANGE_MONEY": "Orange Money", "FREE_MONEY": "Free Money",
    "VIREMENT": "Virement bancaire", "CHEQUE": "Chèque", "AUTRE": "Autre",
}

FORMULES = {               # libellé -> quarts par part
    "Global — 1 part à 100 %": 4,
    "2 parts — 2 groupes à 50 %": 2,
    "4 parts — 4 groupes à 25 %": 1,
}

SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS parametres (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL);
INSERT OR IGNORE INTO parametres VALUES ('mise_reference', '100000');
INSERT OR IGNORE INTO parametres VALUES ('nom_tontine', 'Ma Tontine');
CREATE TABLE IF NOT EXISTS membres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL, prenom TEXT NOT NULL, telephone TEXT NOT NULL UNIQUE,
    date_inscription TEXT NOT NULL DEFAULT (date('now')));
CREATE TABLE IF NOT EXISTS groupes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    mise_reference INTEGER NOT NULL CHECK (mise_reference > 0),
    tour_courant INTEGER NOT NULL DEFAULT 1 CHECK (tour_courant BETWEEN 1 AND 11),
    statut TEXT NOT NULL DEFAULT 'OUVERT' CHECK (statut IN ('OUVERT','EN_COURS','CLOTURE')),
    date_creation TEXT NOT NULL DEFAULT (date('now')),
    date_debut TEXT);
CREATE TABLE IF NOT EXISTS parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    membre_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE RESTRICT,
    groupe_id INTEGER NOT NULL REFERENCES groupes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 10),
    quarts INTEGER NOT NULL CHECK (quarts IN (1, 2, 4)),
    date_attribution TEXT NOT NULL DEFAULT (date('now')),
    UNIQUE (groupe_id, membre_id));
CREATE INDEX IF NOT EXISTS idx_parts_groupe_pos ON parts (groupe_id, position);
CREATE TABLE IF NOT EXISTS versements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    part_id INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
    echeance INTEGER NOT NULL CHECK (echeance BETWEEN 1 AND 10),
    montant INTEGER NOT NULL,
    statut TEXT NOT NULL DEFAULT 'IMPAYE' CHECK (statut IN ('PAYE','IMPAYE')),
    date_paiement TEXT,
    UNIQUE (part_id, echeance));
CREATE INDEX IF NOT EXISTS idx_versements_ech ON versements (echeance, statut);
CREATE TABLE IF NOT EXISTS remises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    part_id INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
    echeance INTEGER NOT NULL CHECK (echeance BETWEEN 1 AND 10),
    montant INTEGER NOT NULL,
    mode TEXT NOT NULL DEFAULT 'ESPECES',
    reference TEXT, date_remise TEXT NOT NULL, observation TEXT,
    UNIQUE (part_id, echeance));
CREATE TABLE IF NOT EXISTS permutations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    groupe_id INTEGER NOT NULL REFERENCES groupes(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    date_operation TEXT NOT NULL DEFAULT (datetime('now')));
"""


def fcfa(montant):
    """100000 -> '100 000 F'"""
    return f"{int(montant or 0):,}".replace(",", " ") + " F"


def aujourdhui():
    return datetime.date.today().isoformat()


class TontineError(Exception):
    """Erreur métier affichée telle quelle à l'utilisateur."""


# ---------------------------------------------------------------------
# 2. LOGIQUE MÉTIER
# ---------------------------------------------------------------------
class Database:
    def __init__(self, chemin=DB_FILE):
        self.cx = sqlite3.connect(chemin)
        self.cx.row_factory = sqlite3.Row
        self.cx.executescript(SCHEMA)
        self.cx.execute("PRAGMA foreign_keys = ON")
        self._migrer()
        self.cx.commit()

    def _migrer(self):
        """v1 -> v2 : 2e téléphone et n° CNI (les bases existantes sont mises à niveau)."""
        colonnes = {r["name"] for r in self.q("PRAGMA table_info(membres)")}
        if "telephone2" not in colonnes:
            self.cx.execute("ALTER TABLE membres ADD COLUMN telephone2 TEXT")
        if "cni" not in colonnes:
            self.cx.execute("ALTER TABLE membres ADD COLUMN cni TEXT")
        self.cx.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_membres_cni ON membres (cni)")

    # --- utilitaires -------------------------------------------------
    def q(self, sql, params=()):
        return self.cx.execute(sql, params).fetchall()

    def q1(self, sql, params=()):
        return self.cx.execute(sql, params).fetchone()

    # --- paramètres --------------------------------------------------
    def get_param(self, cle, defaut=""):
        r = self.q1("SELECT valeur FROM parametres WHERE cle = ?", (cle,))
        return r["valeur"] if r else defaut

    def get_mise(self):
        return int(self.get_param("mise_reference", "100000"))

    def set_mise(self, valeur):
        try:
            v = int(str(valeur).replace(" ", ""))
        except ValueError:
            raise TontineError("La mise doit être un nombre entier.")
        if v <= 0 or v % 4:
            raise TontineError("La mise doit être positive et divisible par 4 (pour les parts à 25 %).")
        with self.cx:
            self.cx.execute("INSERT OR REPLACE INTO parametres VALUES ('mise_reference', ?)", (str(v),))
        return v

    # --- MODULE A : membres -----------------------------------------
    def _fiche(self, nom, prenom, telephone, telephone2="", cni="", id_exclu=0):
        """Contrôle et met en forme une fiche membre."""
        def tel(t):
            return "".join(c for c in str(t or "") if c not in " .-")
        nom, prenom = str(nom).strip().upper(), str(prenom).strip().title()
        telephone, telephone2 = tel(telephone), tel(telephone2) or None
        cni = str(cni or "").replace(" ", "").upper() or None
        if not (nom and prenom and telephone):
            raise TontineError("Nom, prénom et téléphone sont obligatoires.")
        if telephone2 == telephone:
            telephone2 = None
        d = self.q1("SELECT nom, prenom FROM membres WHERE id <> ? AND (telephone = ? OR telephone2 = ?)",
                    (id_exclu, telephone, telephone))
        if d:
            raise TontineError(f"Le numéro {telephone} est déjà utilisé par {d['nom']} {d['prenom']}.")
        if cni:
            d = self.q1("SELECT nom, prenom FROM membres WHERE id <> ? AND cni = ?", (id_exclu, cni))
            if d:
                raise TontineError(f"Le n° CNI {cni} est déjà enregistré pour {d['nom']} {d['prenom']}.")
        return nom, prenom, telephone, telephone2, cni

    def ajouter_membre(self, nom, prenom, telephone, telephone2="", cni=""):
        f = self._fiche(nom, prenom, telephone, telephone2, cni)
        with self.cx:
            cur = self.cx.execute(
                "INSERT INTO membres (nom, prenom, telephone, telephone2, cni, date_inscription) VALUES (?,?,?,?,?,?)",
                (*f, aujourdhui()))
        return cur.lastrowid

    def modifier_membre(self, membre_id, nom, prenom, telephone, telephone2="", cni=""):
        """Corrige la fiche d'un membre (erreur de saisie, changement de numéro…)."""
        f = self._fiche(nom, prenom, telephone, telephone2, cni, id_exclu=membre_id)
        with self.cx:
            self.cx.execute("UPDATE membres SET nom = ?, prenom = ?, telephone = ?, telephone2 = ?, cni = ? "
                            "WHERE id = ?", (*f, membre_id))

    def membre(self, membre_id):
        return self.q1("SELECT * FROM membres WHERE id = ?", (membre_id,))

    def supprimer_membre(self, membre_id):
        if self.q1("SELECT 1 FROM parts WHERE membre_id = ?", (membre_id,)):
            raise TontineError("Ce membre possède des parts : impossible de le supprimer.")
        with self.cx:
            self.cx.execute("DELETE FROM membres WHERE id = ?", (membre_id,))

    def membres(self, recherche=""):
        motif = f"%{recherche.strip()}%"
        return self.q("""
            SELECT m.id, m.nom, m.prenom, m.telephone, m.telephone2, m.cni, m.date_inscription,
                   COUNT(p.id) AS nb_parts, COALESCE(SUM(p.quarts), 0) * 25 AS engagement
            FROM membres m LEFT JOIN parts p ON p.membre_id = m.id
            WHERE m.nom LIKE ? OR m.prenom LIKE ? OR m.telephone LIKE ?
               OR COALESCE(m.telephone2, '') LIKE ? OR COALESCE(m.cni, '') LIKE ?
            GROUP BY m.id ORDER BY m.nom, m.prenom""", (motif, motif, motif.replace(" ", ""),
                                                       motif.replace(" ", ""), motif.replace(" ", "").upper()))

    def parts_du_membre(self, membre_id):
        return self.q("""
            SELECT g.code, p.position, p.quarts * 25 AS pct, g.statut, g.tour_courant
            FROM parts p JOIN groupes g ON g.id = p.groupe_id
            WHERE p.membre_id = ? ORDER BY g.id""", (membre_id,))

    # --- MODULE B : groupes ------------------------------------------
    def _nouveau_code(self):
        n = self.q1("SELECT COUNT(*) FROM groupes")[0] + 1
        while self.q1("SELECT 1 FROM groupes WHERE code = ?", (f"G{n:03d}",)):
            n += 1
        return f"G{n:03d}"

    def _inserer_groupe(self, mise):
        """Insertion sans commit (utilisée dans une transaction)."""
        cur = self.cx.execute(
            "INSERT INTO groupes (code, mise_reference, date_creation) VALUES (?,?,?)",
            (self._nouveau_code(), mise, aujourdhui()))
        return cur.lastrowid

    def creer_groupe(self):
        with self.cx:
            return self._inserer_groupe(self.get_mise())

    def groupes(self, statut=None):
        sql = """SELECT g.*, COALESCE(SUM(p.quarts), 0) AS quarts_pris
                 FROM groupes g LEFT JOIN parts p ON p.groupe_id = g.id"""
        params = ()
        if statut:
            sql += " WHERE g.statut = ?"
            params = (statut,)
        return self.q(sql + " GROUP BY g.id ORDER BY g.id", params)

    def groupe(self, groupe_id):
        return self.q1("SELECT * FROM groupes WHERE id = ?", (groupe_id,))

    def occupation(self, groupe_id):
        """{position: quarts déjà pris} pour les 10 cases."""
        occ = {pos: 0 for pos in range(1, NB_POSITIONS + 1)}
        for r in self.q("SELECT position, SUM(quarts) s FROM parts WHERE groupe_id = ? GROUP BY position",
                        (groupe_id,)):
            occ[r["position"]] = r["s"]
        return occ

    def tableau_groupe(self, groupe_id):
        """Les 10 lignes du tableau d'un groupe, avec titulaires et état."""
        g = self.groupe(groupe_id)
        lignes = []
        for pos in range(1, NB_POSITIONS + 1):
            titulaires = self.q("""
                SELECT m.nom || ' ' || m.prenom AS nom, p.quarts
                FROM parts p JOIN membres m ON m.id = p.membre_id
                WHERE p.groupe_id = ? AND p.position = ? ORDER BY m.nom""", (groupe_id, pos))
            quarts = sum(t["quarts"] for t in titulaires)
            if g["statut"] == "OUVERT":
                etat = "Complet" if quarts == QUARTS_CASE else "À compléter"
            elif pos < g["tour_courant"]:
                etat = "Reçu"
            elif pos == g["tour_courant"]:
                etat = "Bénéficiaire du mois"
            else:
                etat = "En attente"
            noms = " + ".join(f"{t['nom']} ({t['quarts'] * 25} %)" for t in titulaires) or "— libre —"
            lignes.append((pos, noms, f"{quarts * 25} %", fcfa(g["mise_reference"] * 10 * quarts // 4), etat))
        return lignes

    @staticmethod
    def _meilleure_place(occ, quarts, deja_pris):
        """Cherche (groupe, position) : d'abord une case que la part complète
        exactement, sinon la première case avec assez de place."""
        for exact in (True, False):
            for gid in sorted(occ):
                if gid in deja_pris:
                    continue
                for pos in range(1, NB_POSITIONS + 1):
                    libre = QUARTS_CASE - occ[gid][pos]
                    if (libre == quarts) if exact else (libre >= quarts):
                        return gid, pos
        return None

    def attribuer(self, membre_id, quarts):
        """MODULE A — attribution automatique selon la formule.
        quarts = 4 -> 1 groupe ; 2 -> 2 groupes ; 1 -> 4 groupes différents."""
        if quarts not in (1, 2, 4):
            raise TontineError("Formule inconnue.")
        if not self.q1("SELECT 1 FROM membres WHERE id = ?", (membre_id,)):
            raise TontineError("Membre introuvable.")
        nb_groupes = QUARTS_CASE // quarts
        mise = self.get_mise()
        exclus = {r[0] for r in self.q("SELECT groupe_id FROM parts WHERE membre_id = ?", (membre_id,))}
        candidats = [g["id"] for g in self.q(
            "SELECT id FROM groupes WHERE statut = 'OUVERT' AND mise_reference = ? ORDER BY id", (mise,))
            if g["id"] not in exclus]
        occ = {gid: self.occupation(gid) for gid in candidats}

        choix = []
        for _ in range(nb_groupes):
            place = self._meilleure_place(occ, quarts, {c[0] for c in choix})
            if place is None:
                break
            choix.append(place)
            occ[place[0]][place[1]] += quarts

        with self.cx:   # transaction : tout ou rien
            while len(choix) < nb_groupes:
                choix.append((self._inserer_groupe(mise), 1))
            for gid, pos in choix:
                self.cx.execute(
                    "INSERT INTO parts (membre_id, groupe_id, position, quarts, date_attribution) "
                    "VALUES (?,?,?,?,?)", (membre_id, gid, pos, quarts, aujourdhui()))
        codes = {r["id"]: r["code"] for r in self.q("SELECT id, code FROM groupes")}
        return [(codes[gid], pos) for gid, pos in choix]

    def retirer_part(self, groupe_id, membre_id):
        g = self.groupe(groupe_id)
        if g["statut"] != "OUVERT":
            raise TontineError("On ne peut retirer une part que d'un groupe non démarré.")
        with self.cx:
            self.cx.execute("DELETE FROM parts WHERE groupe_id = ? AND membre_id = ?", (groupe_id, membre_id))

    def demarrer_groupe(self, groupe_id):
        g = self.groupe(groupe_id)
        if g["statut"] != "OUVERT":
            raise TontineError("Ce groupe est déjà démarré.")
        incompletes = [str(p) for p, q in self.occupation(groupe_id).items() if q != QUARTS_CASE]
        if incompletes:
            raise TontineError("Positions incomplètes : " + ", ".join(incompletes) +
                               ".\nLes 10 cases doivent être remplies à 100 % avant de démarrer.")
        with self.cx:
            self.cx.execute("UPDATE groupes SET statut = 'EN_COURS', tour_courant = 1, date_debut = ? "
                            "WHERE id = ?", (aujourdhui(), groupe_id))
            self._generer_echeance(groupe_id, 1)

    def _generer_echeance(self, groupe_id, echeance):
        self.cx.execute("""
            INSERT OR IGNORE INTO versements (part_id, echeance, montant, statut)
            SELECT p.id, ?, g.mise_reference * p.quarts / 4, 'IMPAYE'
            FROM parts p JOIN groupes g ON g.id = p.groupe_id
            WHERE p.groupe_id = ?""", (echeance, groupe_id))

    def permuter(self, groupe_id, positions):
        """MODULE B — permute 2 tours (a<->b) ou fait tourner 3 tours (a->b->c->a)."""
        positions = [int(p) for p in positions]
        if len(positions) not in (2, 3) or len(set(positions)) != len(positions):
            raise TontineError("Choisissez 2 ou 3 positions différentes.")
        g = self.groupe(groupe_id)
        if g["statut"] == "CLOTURE":
            raise TontineError("Ce groupe est clôturé.")
        if g["statut"] == "EN_COURS":
            passes = [p for p in positions if p < g["tour_courant"]]
            if passes:
                raise TontineError(f"Tour(s) {', '.join(map(str, passes))} déjà levé(s) : permutation impossible.")
        marques_r = ",".join("?" * len(positions))
        remis = [r[0] for r in self.q(f"""SELECT DISTINCT p.position FROM parts p
                                         JOIN remises r ON r.part_id = p.id AND r.echeance = p.position
                                         WHERE p.groupe_id = ? AND p.position IN ({marques_r})""",
                                      (groupe_id, *positions))]
        if remis:
            raise TontineError(f"Le lot du tour {', '.join(map(str, remis))} est déjà remis : permutation impossible.")
        cible = {positions[i]: positions[(i + 1) % len(positions)] for i in range(len(positions))}
        case_sql = " ".join(f"WHEN {a} THEN {b}" for a, b in cible.items())
        marques = ",".join("?" * len(positions))
        description = ", ".join(f"{a}→{b}" for a, b in cible.items())
        with self.cx:
            self.cx.execute(f"UPDATE parts SET position = CASE position {case_sql} END "
                            f"WHERE groupe_id = ? AND position IN ({marques})", (groupe_id, *positions))
            self.cx.execute("INSERT INTO permutations (groupe_id, description, date_operation) VALUES (?,?,?)",
                            (groupe_id, description, datetime.datetime.now().isoformat(" ", "seconds")))
        return description

    def tirage_au_sort(self, groupe_id, rng=None):
        """Tirage au sort de l'ordre de passage. Groupe ouvert : 10 tours ;
        groupe en cours : seulement les tours après le tour courant.
        Les co-titulaires d'une même case restent ensemble."""
        g = self.groupe(groupe_id)
        if g["statut"] == "CLOTURE":
            raise TontineError("Ce groupe est clôturé.")
        debut = g["tour_courant"] + 1 if g["statut"] == "EN_COURS" else 1
        positions = list(range(debut, NB_POSITIONS + 1))
        if len(positions) < 2:
            raise TontineError("Il ne reste pas assez de tours à tirer au sort.")
        tirees = positions[:]
        (rng or random.SystemRandom()).shuffle(tirees)
        cible = dict(zip(positions, tirees))
        case_sql = " ".join(f"WHEN {a} THEN {b}" for a, b in cible.items())
        desc = ", ".join(f"{a}→{b}" for a, b in cible.items() if a != b) or "ordre inchangé"
        description = f"Tirage au sort (tours {debut} à 10) : {desc}"
        with self.cx:
            self.cx.execute(f"UPDATE parts SET position = CASE position {case_sql} ELSE position END "
                            f"WHERE groupe_id = ? AND position >= ?", (groupe_id, debut))
            self.cx.execute("INSERT INTO permutations (groupe_id, description, date_operation) VALUES (?,?,?)",
                            (groupe_id, description, datetime.datetime.now().isoformat(" ", "seconds")))
        return description

    def parts_du_groupe(self, groupe_id):
        return self.q("""SELECT p.id, p.membre_id, p.position, p.quarts, m.nom || ' ' || m.prenom AS nom
                         FROM parts p JOIN membres m ON m.id = p.membre_id
                         WHERE p.groupe_id = ? ORDER BY p.position, m.nom""", (groupe_id,))

    def transferer_part(self, part_id, nouveau_membre_id):
        """Remplace le titulaire d'une part (départ d'un membre, cession…)."""
        p = self.q1("SELECT * FROM parts WHERE id = ?", (part_id,))
        if not p:
            raise TontineError("Part introuvable.")
        g, ancien, nouveau = self.groupe(p["groupe_id"]), self.membre(p["membre_id"]), self.membre(nouveau_membre_id)
        if not nouveau:
            raise TontineError("Choisissez le nouveau titulaire.")
        if g["statut"] == "CLOTURE":
            raise TontineError("Ce groupe est clôturé.")
        if nouveau["id"] == ancien["id"]:
            raise TontineError("Le nouveau titulaire est le même que l'ancien.")
        if self.q1("SELECT 1 FROM parts WHERE groupe_id = ? AND membre_id = ?", (g["id"], nouveau["id"])):
            raise TontineError(f"{nouveau['nom']} {nouveau['prenom']} a déjà une part dans le groupe {g['code']}.")
        with self.cx:
            self.cx.execute("UPDATE parts SET membre_id = ? WHERE id = ?", (nouveau["id"], part_id))
            self.cx.execute("INSERT INTO permutations (groupe_id, description, date_operation) VALUES (?,?,?)",
                            (g["id"], f"Tour {p['position']} : {ancien['nom']} {ancien['prenom']} remplacé(e) par "
                                      f"{nouveau['nom']} {nouveau['prenom']}",
                             datetime.datetime.now().isoformat(" ", "seconds")))

    def historique_permutations(self, groupe_id):
        return self.q("SELECT date_operation, description FROM permutations WHERE groupe_id = ? "
                      "ORDER BY id DESC", (groupe_id,))

    # --- MODULE C : versements et rapports ---------------------------
    def versements_echeance(self, groupe_id, echeance):
        return self.q("""
            SELECT v.id, p.position, m.nom || ' ' || m.prenom AS membre, m.telephone,
                   p.quarts * 25 AS pct, v.montant, v.statut, v.date_paiement
            FROM versements v JOIN parts p ON p.id = v.part_id JOIN membres m ON m.id = p.membre_id
            WHERE p.groupe_id = ? AND v.echeance = ? ORDER BY p.position, m.nom""", (groupe_id, echeance))

    def marquer(self, versement_ids, statut):
        if statut not in ("PAYE", "IMPAYE"):
            raise TontineError("Statut invalide.")
        date = aujourdhui() if statut == "PAYE" else None
        with self.cx:
            self.cx.executemany("UPDATE versements SET statut = ?, date_paiement = ? WHERE id = ?",
                                [(statut, date, vid) for vid in versement_ids])

    def situation(self, groupe_id):
        """(échéance, attendu, encaissé, restant) pour l'échéance en cours."""
        g = self.groupe(groupe_id)
        r = self.q1("""
            SELECT COALESCE(SUM(v.montant), 0) AS attendu,
                   COALESCE(SUM(CASE WHEN v.statut = 'PAYE' THEN v.montant END), 0) AS encaisse
            FROM versements v JOIN parts p ON p.id = v.part_id
            WHERE p.groupe_id = ? AND v.echeance = ?""", (groupe_id, g["tour_courant"]))
        return g["tour_courant"], r["attendu"], r["encaisse"], r["attendu"] - r["encaisse"]

    def cloturer_echeance(self, groupe_id):
        """Passe au tour suivant. Les impayés restants deviennent des retards."""
        g = self.groupe(groupe_id)
        if g["statut"] != "EN_COURS":
            raise TontineError("Seul un groupe en cours peut avancer d'échéance.")
        suivant = g["tour_courant"] + 1
        with self.cx:
            if suivant > NB_POSITIONS:
                self.cx.execute("UPDATE groupes SET tour_courant = 11, statut = 'CLOTURE' WHERE id = ?",
                                (groupe_id,))
            else:
                self.cx.execute("UPDATE groupes SET tour_courant = ? WHERE id = ?", (suivant, groupe_id))
                self._generer_echeance(groupe_id, suivant)
        return suivant

    # --- remise du lot aux bénéficiaires ------------------------------
    def beneficiaires(self, groupe_id, echeance):
        return self.q("""
            SELECT p.id AS part_id, m.nom || ' ' || m.prenom AS membre, m.telephone, m.telephone2, m.cni,
                   p.quarts * 25 AS pct, g.mise_reference * 10 * p.quarts / 4 AS lot,
                   r.id AS remise_id, r.mode, r.reference, r.date_remise, r.observation
            FROM parts p JOIN groupes g ON g.id = p.groupe_id JOIN membres m ON m.id = p.membre_id
            LEFT JOIN remises r ON r.part_id = p.id AND r.echeance = ?
            WHERE p.groupe_id = ? AND p.position = ? ORDER BY m.nom""", (echeance, groupe_id, echeance))

    def enregistrer_remise(self, part_id, echeance, mode, reference="", date="", observation=""):
        """Enregistre (ou corrige) la remise d'un lot : mode, référence, date."""
        p = self.q1("SELECT p.*, g.statut, g.tour_courant, g.mise_reference FROM parts p "
                    "JOIN groupes g ON g.id = p.groupe_id WHERE p.id = ?", (part_id,))
        if not p:
            raise TontineError("Part introuvable.")
        if p["position"] != echeance:
            raise TontineError(f"Ce membre n'est pas bénéficiaire de l'échéance {echeance}.")
        if p["statut"] == "OUVERT" or echeance > p["tour_courant"]:
            raise TontineError("Ce tour n'est pas encore ouvert.")
        mode = mode if mode in MODES else "ESPECES"
        reference = (reference or "").strip() or None
        if mode != "ESPECES" and not reference:
            raise TontineError("Indiquez la référence du paiement (n° de transaction, de chèque…).")
        date = (date or "").strip()[:10] or aujourdhui()
        try:
            datetime.date.fromisoformat(date)
        except ValueError:
            raise TontineError("Date invalide : utilisez le format AAAA-MM-JJ.")
        montant = p["mise_reference"] * NB_POSITIONS * p["quarts"] // QUARTS_CASE
        with self.cx:
            self.cx.execute("""INSERT INTO remises (part_id, echeance, montant, mode, reference, date_remise, observation)
                               VALUES (?,?,?,?,?,?,?)
                               ON CONFLICT (part_id, echeance) DO UPDATE SET montant = excluded.montant,
                               mode = excluded.mode, reference = excluded.reference,
                               date_remise = excluded.date_remise, observation = excluded.observation""",
                            (part_id, echeance, montant, mode, reference, date, (observation or "").strip() or None))

    def annuler_remise(self, remise_id):
        with self.cx:
            self.cx.execute("DELETE FROM remises WHERE id = ?", (remise_id,))

    RAPPORTS = {
        "Payés (échéance en cours)": "PAYES",
        "Impayés (échéance en cours)": "IMPAYES",
        "Retards (échéances passées)": "RETARDS",
        "Reçus (ont levé la tontine)": "RECUS",
        "Non reçus (attendent leur tour)": "NON_RECUS",
        "Restant à recouvrer (par groupe)": "RESTANT",
        "Lots à remettre aux bénéficiaires": "A_REMETTRE",
        "Lots remis (références de paiement)": "REMISES",
    }

    def rapport(self, type_rapport, groupe_id=None):
        """Renvoie (colonnes, lignes, total) pour l'onglet Rapports."""
        filtre, params = ("AND g.id = ?", (groupe_id,)) if groupe_id else ("", ())
        base_v = """FROM versements v JOIN parts p ON p.id = v.part_id
                    JOIN groupes g ON g.id = p.groupe_id JOIN membres m ON m.id = p.membre_id"""
        if type_rapport in ("PAYES", "IMPAYES"):
            statut = "PAYE" if type_rapport == "PAYES" else "IMPAYE"
            cols = ("Groupe", "Échéance", "Pos.", "Membre", "Téléphone", "Part", "Montant")
            rows = self.q(f"""SELECT g.code, v.echeance, p.position, m.nom || ' ' || m.prenom,
                                     m.telephone, (p.quarts * 25) || ' %', v.montant {base_v}
                              WHERE g.statut = 'EN_COURS' AND v.echeance = g.tour_courant
                                AND v.statut = ? {filtre}
                              ORDER BY g.code, p.position, m.nom""", (statut, *params))
            idx_total = 6
        elif type_rapport == "RETARDS":
            cols = ("Groupe", "Échéance", "Pos.", "Membre", "Téléphone", "Part", "Montant dû")
            rows = self.q(f"""SELECT g.code, v.echeance, p.position, m.nom || ' ' || m.prenom,
                                     m.telephone, (p.quarts * 25) || ' %', v.montant {base_v}
                              WHERE v.statut = 'IMPAYE' AND v.echeance < g.tour_courant {filtre}
                              ORDER BY g.code, v.echeance, m.nom""", params)
            idx_total = 6
        elif type_rapport in ("RECUS", "NON_RECUS"):
            if type_rapport == "RECUS":
                cond = "g.statut <> 'OUVERT' AND p.position < g.tour_courant"
            else:
                cond = "(g.statut = 'OUVERT' OR p.position >= g.tour_courant)"
            cols = ("Groupe", "Pos.", "Membre", "Téléphone", "Part", "État", "Lot", "Remise du lot")
            rows = self.q(f"""SELECT g.code, p.position, m.nom || ' ' || m.prenom, m.telephone,
                                     (p.quarts * 25) || ' %',
                                     CASE WHEN g.statut <> 'OUVERT' AND p.position < g.tour_courant THEN 'Reçu'
                                          WHEN g.statut = 'EN_COURS' AND p.position = g.tour_courant
                                               THEN 'Bénéficiaire du mois'
                                          ELSE 'En attente' END,
                                     g.mise_reference * 10 * p.quarts / 4,
                                     CASE WHEN r.id IS NOT NULL THEN r.mode || COALESCE(' n° ' || r.reference, '')
                                                                     || ' · ' || r.date_remise
                                          WHEN g.statut <> 'OUVERT' AND p.position < g.tour_courant THEN 'À remettre'
                                          ELSE '' END
                              FROM parts p JOIN groupes g ON g.id = p.groupe_id
                              JOIN membres m ON m.id = p.membre_id
                              LEFT JOIN remises r ON r.part_id = p.id AND r.echeance = p.position
                              WHERE {cond} {filtre}
                              ORDER BY g.code, p.position, m.nom""", params)
            idx_total = 6
        elif type_rapport in ("A_REMETTRE", "REMISES"):
            remis = type_rapport == "REMISES"
            cols = ("Groupe", "Tour", "Bénéficiaire", "Téléphone", "N° CNI", "Mode", "Référence", "Date", "Montant")
            rows = self.q(f"""SELECT g.code, p.position, m.nom || ' ' || m.prenom, m.telephone, COALESCE(m.cni, ''),
                                     COALESCE(r.mode, ''), COALESCE(r.reference, ''), COALESCE(r.date_remise, ''),
                                     COALESCE(r.montant, g.mise_reference * 10 * p.quarts / 4)
                              FROM parts p JOIN groupes g ON g.id = p.groupe_id JOIN membres m ON m.id = p.membre_id
                              LEFT JOIN remises r ON r.part_id = p.id AND r.echeance = p.position
                              WHERE g.statut <> 'OUVERT' AND p.position <= g.tour_courant
                                AND r.id IS {'NOT' if remis else ''} NULL {filtre}
                              ORDER BY g.code, p.position, m.nom""", params)
            rows = [tuple(MODES.get(v, v) if i == 5 else v for i, v in enumerate(r)) for r in rows]
            idx_total = 8
        elif type_rapport == "RESTANT":
            cols = ("Groupe", "Échéance", "Attendu", "Encaissé", "Restant", "Nb impayés")
            rows = self.q(f"""SELECT g.code, g.tour_courant, SUM(v.montant),
                                     SUM(CASE WHEN v.statut = 'PAYE' THEN v.montant ELSE 0 END),
                                     SUM(CASE WHEN v.statut = 'IMPAYE' THEN v.montant ELSE 0 END),
                                     SUM(CASE WHEN v.statut = 'IMPAYE' THEN 1 ELSE 0 END)
                              FROM groupes g JOIN parts p ON p.groupe_id = g.id
                              JOIN versements v ON v.part_id = p.id AND v.echeance = g.tour_courant
                              WHERE g.statut = 'EN_COURS' {filtre}
                              GROUP BY g.id ORDER BY g.code""", params)
            idx_total = 4
        else:
            raise TontineError("Rapport inconnu.")
        rows = [tuple(MODES.get(str(v).split(" ")[0], "") + str(v)[len(str(v).split(" ")[0]):]
                      if c == "Remise du lot" and v and str(v).split(" ")[0] in MODES else v
                      for c, v in zip(cols, r)) for r in rows]
        total = sum(r[idx_total] or 0 for r in rows)
        return cols, rows, total, idx_total


# ---------------------------------------------------------------------
# 3. INTERFACE GRAPHIQUE
# ---------------------------------------------------------------------
class App(tk.Tk):
    def __init__(self, db):
        super().__init__()
        self.db = db
        self.title(f"Gestionnaire de Tontines — {db.get_param('nom_tontine', 'Ma Tontine')}")
        self.geometry("1100x680")
        self.minsize(900, 560)
        self._styles()

        self.nb = ttk.Notebook(self)
        self.nb.pack(fill="both", expand=True, padx=8, pady=8)
        self.onglet_membres()
        self.onglet_groupes()
        self.onglet_paiements()
        self.onglet_rapports()
        self.onglet_parametres()

        self.barre = ttk.Label(self, anchor="w", style="Barre.TLabel")
        self.barre.pack(fill="x", side="bottom")
        self.nb.bind("<<NotebookTabChanged>>", lambda e: self.rafraichir())
        self.rafraichir()

    # --- outils d'interface ------------------------------------------
    def _styles(self):
        s = ttk.Style(self)
        if "clam" in s.theme_names():
            s.theme_use("clam")
        s.configure("Treeview", rowheight=24)
        s.configure("Treeview.Heading", font=("Segoe UI", 9, "bold"))
        s.configure("Titre.TLabel", font=("Segoe UI", 11, "bold"))
        s.configure("Chiffre.TLabel", font=("Segoe UI", 11, "bold"), foreground="#1d5f3a")
        s.configure("Barre.TLabel", padding=(8, 3), background="#e8e8e8")
        s.configure("Accent.TButton", font=("Segoe UI", 9, "bold"))

    def statut(self, texte):
        self.barre.config(text=texte)

    def erreur(self, exc):
        messagebox.showerror("Opération impossible", str(exc), parent=self)

    @staticmethod
    def arbre(parent, colonnes, largeurs, hauteur=14):
        cadre = ttk.Frame(parent)
        tv = ttk.Treeview(cadre, columns=colonnes, show="headings", height=hauteur)
        for c, w in zip(colonnes, largeurs):
            tv.heading(c, text=c)
            tv.column(c, width=w, anchor="w" if w > 90 else "center")
        sb = ttk.Scrollbar(cadre, orient="vertical", command=tv.yview)
        tv.configure(yscrollcommand=sb.set)
        tv.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")
        tv.tag_configure("paye", background="#e3f4e8")
        tv.tag_configure("impaye", background="#fde8e6")
        tv.tag_configure("recu", foreground="#777777")
        tv.tag_configure("courant", background="#fff4cc")
        return cadre, tv

    @staticmethod
    def vider(tv):
        tv.delete(*tv.get_children())

    def choix_groupes(self, statut=None, avec_tous=False):
        libelles = {"OUVERT": "ouvert", "EN_COURS": "en cours", "CLOTURE": "clôturé"}
        valeurs = ["Tous les groupes"] if avec_tous else []
        self._groupes_map = getattr(self, "_groupes_map", {})
        for g in self.db.groupes(statut):
            lib = f"{g['code']} — {libelles[g['statut']]} ({g['quarts_pris'] * 25 // 10} % rempli)" \
                if g["statut"] == "OUVERT" else f"{g['code']} — {libelles[g['statut']]}"
            self._groupes_map[lib] = g["id"]
            valeurs.append(lib)
        return valeurs

    def id_groupe(self, combo):
        return self._groupes_map.get(combo.get())

    # --- ONGLET 1 : MEMBRES ------------------------------------------
    def onglet_membres(self):
        f = ttk.Frame(self.nb, padding=10)
        self.nb.add(f, text="  Membres  ")

        gauche = ttk.Frame(f)
        gauche.pack(side="left", fill="y", padx=(0, 10))
        form = ttk.LabelFrame(gauche, text="Inscription", padding=10)
        form.pack(fill="x")
        self.form_membre = form
        self.e_nom, self.e_prenom, self.e_tel, self.e_tel2, self.e_cni = (ttk.Entry(form, width=28) for _ in range(5))
        for i, (lib, e) in enumerate((("Nom", self.e_nom), ("Prénom", self.e_prenom), ("Téléphone", self.e_tel),
                                      ("2e téléphone", self.e_tel2), ("N° CNI", self.e_cni))):
            ttk.Label(form, text=lib).grid(row=i, column=0, sticky="w", pady=3)
            e.grid(row=i, column=1, pady=3)
        ttk.Label(form, text="2e téléphone et CNI sont facultatifs.", foreground="#555").grid(
            row=5, column=0, columnspan=2, sticky="w")
        self.edition_id = None
        self.b_enregistrer = ttk.Button(form, text="Enregistrer le membre", style="Accent.TButton",
                                        command=self.action_inscrire)
        self.b_enregistrer.grid(row=6, column=0, columnspan=2, sticky="ew", pady=(8, 0))
        self.b_annuler_edition = ttk.Button(form, text="Annuler la modification", command=self.fin_edition)

        attr = ttk.LabelFrame(gauche, text="Attribution des parts", padding=10)
        attr.pack(fill="x", pady=10)
        ttk.Label(attr, text="1. Sélectionnez un membre dans la liste\n2. Choisissez la formule",
                  justify="left").pack(anchor="w")
        self.cb_formule = ttk.Combobox(attr, values=list(FORMULES), state="readonly", width=30)
        self.cb_formule.current(0)
        self.cb_formule.pack(fill="x", pady=6)
        self.l_mise_attr = ttk.Label(attr, foreground="#555")
        self.l_mise_attr.pack(anchor="w")
        ttk.Button(attr, text="Attribuer automatiquement", style="Accent.TButton",
                   command=self.action_attribuer).pack(fill="x", pady=(6, 0))

        detail = ttk.LabelFrame(gauche, text="Parts du membre sélectionné", padding=6)
        detail.pack(fill="both", expand=True)
        cadre, self.tv_parts_membre = self.arbre(detail, ("Groupe", "Pos.", "Part", "État"), (60, 40, 50, 110), 6)
        cadre.pack(fill="both", expand=True)

        droite = ttk.Frame(f)
        droite.pack(side="left", fill="both", expand=True)
        barre = ttk.Frame(droite)
        barre.pack(fill="x", pady=(0, 6))
        ttk.Label(barre, text="Rechercher :").pack(side="left")
        self.e_recherche = ttk.Entry(barre, width=30)
        self.e_recherche.pack(side="left", padx=6)
        self.e_recherche.bind("<KeyRelease>", lambda e: self.charger_membres())
        ttk.Button(barre, text="Supprimer le membre", command=self.action_supprimer_membre).pack(side="right")
        ttk.Button(barre, text="Modifier la fiche", command=self.debut_edition).pack(side="right", padx=6)
        cadre, self.tv_membres = self.arbre(
            droite, ("ID", "Nom", "Prénom", "Téléphone", "2e tél.", "N° CNI", "Inscrit le", "Parts", "Engag."),
            (40, 120, 120, 95, 95, 115, 85, 45, 55), 20)
        cadre.pack(fill="both", expand=True)
        self.tv_membres.bind("<<TreeviewSelect>>", lambda e: self.charger_parts_membre())

    def charger_membres(self):
        self.vider(self.tv_membres)
        for m in self.db.membres(self.e_recherche.get()):
            self.tv_membres.insert("", "end", iid=str(m["id"]), values=(
                m["id"], m["nom"], m["prenom"], m["telephone"], m["telephone2"] or "", m["cni"] or "",
                m["date_inscription"], m["nb_parts"], f"{m['engagement']} %"))
        self.l_mise_attr.config(text=f"Mise de référence : {fcfa(self.db.get_mise())}")

    def membre_selectionne(self):
        sel = self.tv_membres.selection()
        return int(sel[0]) if sel else None

    def charger_parts_membre(self):
        self.vider(self.tv_parts_membre)
        mid = self.membre_selectionne()
        if not mid:
            return
        for p in self.db.parts_du_membre(mid):
            if p["statut"] == "OUVERT":
                etat = "Groupe non démarré"
            elif p["position"] < p["tour_courant"]:
                etat = "Reçu"
            elif p["position"] == p["tour_courant"]:
                etat = "Bénéficiaire du mois"
            else:
                etat = "En attente"
            self.tv_parts_membre.insert("", "end", values=(p["code"], p["position"], f"{p['pct']} %", etat))

    def champs_membre(self):
        return (self.e_nom.get(), self.e_prenom.get(), self.e_tel.get(), self.e_tel2.get(), self.e_cni.get())

    def vider_form_membre(self):
        for e in (self.e_nom, self.e_prenom, self.e_tel, self.e_tel2, self.e_cni):
            e.delete(0, "end")

    def debut_edition(self):
        mid = self.membre_selectionne()
        if not mid:
            return self.erreur("Sélectionnez d'abord le membre à modifier.")
        m = self.db.membre(mid)
        self.vider_form_membre()
        for e, v in zip((self.e_nom, self.e_prenom, self.e_tel, self.e_tel2, self.e_cni),
                        (m["nom"], m["prenom"], m["telephone"], m["telephone2"], m["cni"])):
            e.insert(0, v or "")
        self.edition_id = mid
        self.form_membre.config(text=f"Modification de la fiche n° {mid}")
        self.b_enregistrer.config(text="Enregistrer les modifications")
        self.b_annuler_edition.grid(row=7, column=0, columnspan=2, sticky="ew", pady=(4, 0))
        self.e_nom.focus_set()

    def fin_edition(self):
        self.edition_id = None
        self.vider_form_membre()
        self.form_membre.config(text="Inscription")
        self.b_enregistrer.config(text="Enregistrer le membre")
        self.b_annuler_edition.grid_remove()

    def action_inscrire(self):
        if self.edition_id:
            try:
                self.db.modifier_membre(self.edition_id, *self.champs_membre())
            except TontineError as exc:
                return self.erreur(exc)
            mid = self.edition_id
            self.fin_edition()
            self.rafraichir()
            self.tv_membres.selection_set(str(mid))
            self.statut("Fiche mise à jour.")
            return
        try:
            mid = self.db.ajouter_membre(*self.champs_membre())
        except TontineError as exc:
            return self.erreur(exc)
        self.vider_form_membre()
        self.charger_membres()
        self.tv_membres.selection_set(str(mid))
        self.tv_membres.see(str(mid))
        self.statut(f"Membre n° {mid} inscrit. Choisissez maintenant sa formule de parts.")
        self.e_nom.focus_set()

    def action_attribuer(self):
        mid = self.membre_selectionne()
        if not mid:
            return self.erreur("Sélectionnez d'abord un membre dans la liste.")
        quarts = FORMULES[self.cb_formule.get()]
        try:
            places = self.db.attribuer(mid, quarts)
        except (TontineError, sqlite3.IntegrityError) as exc:
            return self.erreur(exc)
        detail = "\n".join(f"  • Groupe {code}, position {pos} ({quarts * 25} %)" for code, pos in places)
        messagebox.showinfo("Attribution réussie", f"Parts attribuées :\n{detail}", parent=self)
        self.charger_membres()
        self.tv_membres.selection_set(str(mid))
        self.charger_parts_membre()

    def action_supprimer_membre(self):
        mid = self.membre_selectionne()
        if not mid:
            return
        if not messagebox.askyesno("Confirmer", "Supprimer définitivement ce membre ?", parent=self):
            return
        try:
            self.db.supprimer_membre(mid)
        except TontineError as exc:
            return self.erreur(exc)
        self.charger_membres()
        self.vider(self.tv_parts_membre)

    # --- ONGLET 2 : GROUPES DE DIX ------------------------------------
    def onglet_groupes(self):
        f = ttk.Frame(self.nb, padding=10)
        self.nb.add(f, text="  Groupes de dix  ")

        haut = ttk.Frame(f)
        haut.pack(fill="x")
        ttk.Label(haut, text="Groupe :", style="Titre.TLabel").pack(side="left")
        self.cb_groupe = ttk.Combobox(haut, state="readonly", width=34)
        self.cb_groupe.pack(side="left", padx=6)
        self.cb_groupe.bind("<<ComboboxSelected>>", lambda e: self.charger_tableau())
        ttk.Button(haut, text="Nouveau groupe vide", command=self.action_nouveau_groupe).pack(side="left", padx=4)
        ttk.Button(haut, text="Démarrer le groupe", style="Accent.TButton",
                   command=self.action_demarrer).pack(side="left", padx=4)
        ttk.Button(haut, text="Retirer une part…", command=self.action_retirer_part).pack(side="left", padx=4)
        ttk.Button(haut, text="🎲 Tirage au sort", command=self.action_tirage).pack(side="left", padx=4)
        ttk.Button(haut, text="Remplacer un titulaire…", command=self.action_remplacer).pack(side="left", padx=4)
        self.l_info_groupe = ttk.Label(f, foreground="#555")
        self.l_info_groupe.pack(anchor="w", pady=(6, 0))

        cadre, self.tv_tableau = self.arbre(
            f, ("Tour", "Titulaire(s)", "Rempli", "Lot", "État"), (50, 520, 70, 110, 150), 10)
        cadre.pack(fill="both", expand=True, pady=8)

        bas = ttk.Frame(f)
        bas.pack(fill="x")
        perm = ttk.LabelFrame(bas, text="Permutation des tours (après accord des membres)", padding=8)
        perm.pack(side="left", fill="x", expand=True)
        positions = [str(i) for i in range(1, NB_POSITIONS + 1)]
        self.cb_perm = []
        for i, lib in enumerate(("Tour A", "Tour B", "Tour C (facultatif)")):
            ttk.Label(perm, text=lib).grid(row=0, column=i * 2, padx=(8 if i else 0, 2))
            cb = ttk.Combobox(perm, values=(["—"] if i == 2 else []) + positions, state="readonly", width=5)
            cb.grid(row=0, column=i * 2 + 1)
            self.cb_perm.append(cb)
        self.cb_perm[2].current(0)
        ttk.Button(perm, text="Permuter", style="Accent.TButton",
                   command=self.action_permuter).grid(row=0, column=6, padx=10)
        ttk.Label(perm, text="2 tours : A ↔ B.   3 tours : A → B → C → A (rotation).",
                  foreground="#555").grid(row=1, column=0, columnspan=7, sticky="w", pady=(6, 0))

        hist = ttk.LabelFrame(bas, text="Historique (permutations, tirages, remplacements)", padding=6)
        hist.pack(side="left", fill="both", padx=(10, 0))
        self.lb_hist = tk.Listbox(hist, height=4, width=60)
        self.lb_hist.pack(fill="both")

    def charger_groupes_combo(self):
        valeurs = self.choix_groupes()
        actuel = self.cb_groupe.get()
        self.cb_groupe["values"] = valeurs
        # garder la sélection si le groupe existe toujours (libellé pouvant changer)
        code = actuel.split(" ")[0] if actuel else ""
        trouve = next((v for v in valeurs if v.startswith(code + " ")), None) if code else None
        if trouve:
            self.cb_groupe.set(trouve)
        elif valeurs:
            self.cb_groupe.current(0)
        else:
            self.cb_groupe.set("")

    def charger_tableau(self):
        self.vider(self.tv_tableau)
        self.lb_hist.delete(0, "end")
        gid = self.id_groupe(self.cb_groupe)
        if not gid:
            self.l_info_groupe.config(text="Aucun groupe. Attribuez des parts depuis l'onglet Membres.")
            return
        g = self.db.groupe(gid)
        for ligne in self.db.tableau_groupe(gid):
            tag = {"Reçu": "recu", "Bénéficiaire du mois": "courant", "À compléter": "impaye"}.get(ligne[4], "")
            self.tv_tableau.insert("", "end", values=ligne, tags=(tag,))
        info = f"Mise : {fcfa(g['mise_reference'])}  ·  Lot d'une case : {fcfa(g['mise_reference'] * 10)}"
        if g["statut"] == "EN_COURS":
            info += f"  ·  Échéance en cours : {g['tour_courant']}/10"
        self.l_info_groupe.config(text=info)
        for h in self.db.historique_permutations(gid):
            self.lb_hist.insert("end", f"{h['date_operation']}  :  {h['description']}")

    def action_nouveau_groupe(self):
        gid = self.db.creer_groupe()
        self.charger_groupes_combo()
        code = self.db.groupe(gid)["code"]
        self.cb_groupe.set(next(v for v in self.cb_groupe["values"] if v.startswith(code)))
        self.charger_tableau()

    def action_demarrer(self):
        gid = self.id_groupe(self.cb_groupe)
        if not gid:
            return
        if not messagebox.askyesno("Démarrer", "Démarrer ce groupe ? Plus aucune part ne pourra y être ajoutée.\n"
                                               "L'échéance 1 sera ouverte.", parent=self):
            return
        try:
            self.db.demarrer_groupe(gid)
        except TontineError as exc:
            return self.erreur(exc)
        self.rafraichir()
        self.statut("Groupe démarré : l'échéance 1 est ouverte dans l'onglet Paiements.")

    def action_retirer_part(self):
        gid = self.id_groupe(self.cb_groupe)
        if not gid:
            return
        if self.db.groupe(gid)["statut"] != "OUVERT":
            return self.erreur("On ne peut retirer une part que d'un groupe non démarré.")
        parts = self.db.q("""SELECT m.id, m.nom || ' ' || m.prenom AS nom, p.position, p.quarts
                             FROM parts p JOIN membres m ON m.id = p.membre_id
                             WHERE p.groupe_id = ? ORDER BY p.position""", (gid,))
        if not parts:
            return
        fen = tk.Toplevel(self)
        fen.title("Retirer une part")
        fen.transient(self)
        lb = tk.Listbox(fen, width=50, height=min(12, len(parts)))
        for p in parts:
            lb.insert("end", f"Tour {p['position']} — {p['nom']} ({p['quarts'] * 25} %)")
        lb.pack(padx=10, pady=10)

        def valider():
            if not lb.curselection():
                return
            p = parts[lb.curselection()[0]]
            self.db.retirer_part(gid, p["id"])
            fen.destroy()
            self.rafraichir()
        ttk.Button(fen, text="Retirer la part sélectionnée", command=valider).pack(pady=(0, 10))

    def action_tirage(self):
        gid = self.id_groupe(self.cb_groupe)
        if not gid:
            return
        g = self.db.groupe(gid)
        if g["statut"] == "OUVERT":
            msg = f"Tirer au sort l'ordre des 10 tours du groupe {g['code']} ?\nLes co-titulaires d'une case restent ensemble."
        else:
            msg = (f"Tirer au sort les tours {g['tour_courant'] + 1} à 10 du groupe {g['code']} ?\n"
                   "Les tours déjà levés et le tour en cours ne bougent pas.")
        if not messagebox.askyesno("Tirage au sort", msg, parent=self):
            return
        try:
            description = self.db.tirage_au_sort(gid)
        except TontineError as exc:
            return self.erreur(exc)
        self.charger_tableau()
        messagebox.showinfo("Résultat du tirage", description, parent=self)

    def action_remplacer(self):
        gid = self.id_groupe(self.cb_groupe)
        if not gid:
            return
        parts = self.db.parts_du_groupe(gid)
        if not parts:
            return self.erreur("Ce groupe n'a aucune part.")
        dans = {p["membre_id"] for p in parts}
        candidats = [m for m in self.db.membres() if m["id"] not in dans]
        if not candidats:
            return self.erreur("Inscrivez d'abord le nouveau titulaire dans l'onglet Membres.")
        fen = tk.Toplevel(self)
        fen.title("Remplacer un titulaire")
        fen.transient(self)
        fen.grab_set()
        ttk.Label(fen, text="Part à céder :").grid(row=0, column=0, sticky="w", padx=10, pady=(10, 2))
        cb_part = ttk.Combobox(fen, state="readonly", width=50,
                               values=[f"Tour {p['position']} — {p['nom']} ({p['quarts'] * 25} %)" for p in parts])
        cb_part.grid(row=1, column=0, padx=10)
        cb_part.current(0)
        ttk.Label(fen, text="Nouveau titulaire :").grid(row=2, column=0, sticky="w", padx=10, pady=(10, 2))
        cb_m = ttk.Combobox(fen, state="readonly", width=50,
                            values=[f"{m['nom']} {m['prenom']} · {m['telephone']}" for m in candidats])
        cb_m.grid(row=3, column=0, padx=10)

        def valider():
            if cb_m.current() < 0:
                return self.erreur("Choisissez le nouveau titulaire.")
            try:
                self.db.transferer_part(parts[cb_part.current()]["id"], candidats[cb_m.current()]["id"])
            except TontineError as exc:
                return self.erreur(exc)
            fen.destroy()
            self.rafraichir()
            self.statut("Titulaire remplacé.")
        ttk.Button(fen, text="Remplacer", style="Accent.TButton", command=valider).grid(row=4, column=0, pady=10)

    def action_permuter(self):
        gid = self.id_groupe(self.cb_groupe)
        if not gid:
            return
        positions = [cb.get() for cb in self.cb_perm if cb.get() and cb.get() != "—"]
        try:
            if len(positions) < 2:
                raise TontineError("Choisissez au moins le Tour A et le Tour B.")
            if not messagebox.askyesno("Confirmer", "Les membres concernés ont-ils donné leur accord ?",
                                       parent=self):
                return
            description = self.db.permuter(gid, positions)
        except TontineError as exc:
            return self.erreur(exc)
        self.charger_tableau()
        self.statut(f"Permutation effectuée : {description}")

    # --- ONGLET 3 : PAIEMENTS -----------------------------------------
    def onglet_paiements(self):
        f = ttk.Frame(self.nb, padding=10)
        self.nb.add(f, text="  Paiements  ")

        haut = ttk.Frame(f)
        haut.pack(fill="x")
        ttk.Label(haut, text="Groupe en cours :", style="Titre.TLabel").pack(side="left")
        self.cb_groupe_pay = ttk.Combobox(haut, state="readonly", width=24)
        self.cb_groupe_pay.pack(side="left", padx=6)
        self.cb_groupe_pay.bind("<<ComboboxSelected>>", lambda e: self.charger_paiements())
        ttk.Label(haut, text="Échéance :").pack(side="left", padx=(12, 2))
        self.cb_echeance = ttk.Combobox(haut, state="readonly", width=5)
        self.cb_echeance.pack(side="left")
        self.cb_echeance.bind("<<ComboboxSelected>>", lambda e: self.charger_paiements(garder_echeance=True))

        chiffres = ttk.Frame(f)
        chiffres.pack(fill="x", pady=8)
        self.l_attendu, self.l_encaisse, self.l_restant = (ttk.Label(chiffres, style="Chiffre.TLabel")
                                                           for _ in range(3))
        for lbl in (self.l_attendu, self.l_encaisse, self.l_restant):
            lbl.pack(side="left", padx=(0, 30))

        cadre, self.tv_pay = self.arbre(
            f, ("Pos.", "Membre", "Téléphone", "Part", "Montant", "Statut", "Payé le"),
            (45, 250, 120, 60, 100, 80, 100), 9)
        cadre.pack(fill="both", expand=True)
        self.tv_pay.configure(selectmode="extended")
        self.tv_pay.bind("<Double-1>", lambda e: self.action_basculer())

        bas = ttk.Frame(f)
        bas.pack(fill="x", pady=(8, 0))
        ttk.Button(bas, text="✔ Marquer comme Payé", style="Accent.TButton",
                   command=lambda: self.action_marquer("PAYE")).pack(side="left")
        ttk.Button(bas, text="✘ Marquer comme Impayé",
                   command=lambda: self.action_marquer("IMPAYE")).pack(side="left", padx=6)
        ttk.Label(bas, text="(sélection multiple avec Ctrl/Maj ; double-clic = basculer)",
                  foreground="#555").pack(side="left", padx=6)
        ttk.Button(bas, text="Clôturer l'échéance ➜ tour suivant",
                   command=self.action_cloturer).pack(side="right")

        rem = ttk.LabelFrame(f, text="Remise du lot aux bénéficiaires du tour", padding=6)
        rem.pack(fill="x", pady=(8, 0))
        cadre, self.tv_rem = self.arbre(rem, ("Bénéficiaire", "Téléphones", "N° CNI", "Lot", "Mode", "Référence", "Date"),
                                        (190, 170, 120, 100, 110, 150, 90), 3)
        cadre.pack(fill="x")
        b2 = ttk.Frame(rem)
        b2.pack(fill="x", pady=(6, 0))
        ttk.Button(b2, text="Enregistrer / corriger la remise…", style="Accent.TButton",
                   command=self.action_remise).pack(side="left")
        ttk.Button(b2, text="Annuler la remise", command=self.action_annuler_remise).pack(side="left", padx=6)

    def charger_paiements(self, garder_echeance=False):
        self.vider(self.tv_pay)
        gid = self.id_groupe(self.cb_groupe_pay)
        if not gid:
            for lbl in (self.l_attendu, self.l_encaisse, self.l_restant):
                lbl.config(text="")
            self.l_attendu.config(text="Aucun groupe en cours. Démarrez un groupe complet.")
            return
        g = self.db.groupe(gid)
        echeances = [str(i) for i in range(1, g["tour_courant"] + 1)]
        self.cb_echeance["values"] = echeances
        if not garder_echeance or self.cb_echeance.get() not in echeances:
            self.cb_echeance.set(str(g["tour_courant"]))
        ech = int(self.cb_echeance.get())
        attendu = encaisse = 0
        for v in self.db.versements_echeance(gid, ech):
            attendu += v["montant"]
            encaisse += v["montant"] if v["statut"] == "PAYE" else 0
            self.tv_pay.insert("", "end", iid=str(v["id"]), tags=("paye" if v["statut"] == "PAYE" else "impaye",),
                               values=(v["position"], v["membre"], v["telephone"], f"{v['pct']} %",
                                       fcfa(v["montant"]), "Payé" if v["statut"] == "PAYE" else "Impayé",
                                       v["date_paiement"] or ""))
        self.vider(self.tv_rem)
        self._benef = {}
        for b in self.db.beneficiaires(gid, ech):
            self._benef[str(b["part_id"])] = b
            tels = b["telephone"] + (f" / {b['telephone2']}" if b["telephone2"] else "")
            self.tv_rem.insert("", "end", iid=str(b["part_id"]), tags=("paye" if b["remise_id"] else "courant",),
                               values=(b["membre"], tels, b["cni"] or "", fcfa(b["lot"]),
                                       MODES.get(b["mode"], "À remettre") if b["remise_id"] else "À remettre",
                                       b["reference"] or "", b["date_remise"] or ""))
        suffixe = " (en cours)" if ech == g["tour_courant"] else " (échéance passée)"
        self.l_attendu.config(text=f"Échéance {ech}{suffixe} — Attendu : {fcfa(attendu)}")
        self.l_encaisse.config(text=f"Encaissé : {fcfa(encaisse)}")
        self.l_restant.config(text=f"Restant : {fcfa(attendu - encaisse)}",
                              foreground="#b3261e" if attendu - encaisse else "#1d5f3a")

    def action_marquer(self, statut):
        ids = [int(i) for i in self.tv_pay.selection()]
        if not ids:
            return self.erreur("Sélectionnez une ou plusieurs lignes.")
        self.db.marquer(ids, statut)
        self.charger_paiements(garder_echeance=True)
        for i in ids:
            if self.tv_pay.exists(str(i)):
                self.tv_pay.selection_add(str(i))

    def action_basculer(self):
        sel = self.tv_pay.selection()
        if not sel:
            return
        statut_actuel = self.tv_pay.item(sel[0], "values")[5]
        self.action_marquer("IMPAYE" if statut_actuel == "Payé" else "PAYE")

    def action_remise(self):
        sel = self.tv_rem.selection() or self.tv_rem.get_children()[:1]
        if not sel:
            return
        b = self._benef[sel[0]]
        ech = int(self.cb_echeance.get())
        fen = tk.Toplevel(self)
        fen.title("Remise du lot")
        fen.transient(self)
        fen.grab_set()
        ttk.Label(fen, text=f"{b['membre']} — lot de {fcfa(b['lot'])}", style="Titre.TLabel").grid(
            row=0, column=0, columnspan=2, padx=10, pady=(10, 6), sticky="w")
        codes = list(MODES)
        cb_mode = ttk.Combobox(fen, state="readonly", values=[MODES[c] for c in codes], width=30)
        cb_mode.current(codes.index(b["mode"]) if b["mode"] in codes else codes.index("WAVE"))
        e_ref, e_date, e_obs = ttk.Entry(fen, width=32), ttk.Entry(fen, width=32), ttk.Entry(fen, width=32)
        e_ref.insert(0, b["reference"] or "")
        e_date.insert(0, b["date_remise"] or aujourdhui())
        e_obs.insert(0, b["observation"] or "")
        for i, (lib, w) in enumerate((("Mode", cb_mode), ("Référence", e_ref), ("Date (AAAA-MM-JJ)", e_date),
                                      ("Observation", e_obs)), start=1):
            ttk.Label(fen, text=lib).grid(row=i, column=0, sticky="w", padx=10, pady=3)
            w.grid(row=i, column=1, padx=10, pady=3)

        def valider():
            try:
                self.db.enregistrer_remise(b["part_id"], ech, codes[cb_mode.current()], e_ref.get(),
                                           e_date.get(), e_obs.get())
            except TontineError as exc:
                return self.erreur(exc)
            fen.destroy()
            self.charger_paiements(garder_echeance=True)
            self.statut("Remise du lot enregistrée.")
        ttk.Button(fen, text="Valider la remise", style="Accent.TButton", command=valider).grid(
            row=5, column=0, columnspan=2, pady=10)

    def action_annuler_remise(self):
        sel = self.tv_rem.selection()
        if not sel or not self._benef[sel[0]]["remise_id"]:
            return self.erreur("Sélectionnez un lot déjà remis.")
        if messagebox.askyesno("Annuler", "Annuler cette remise ? Le lot repassera « à remettre ».", parent=self):
            self.db.annuler_remise(self._benef[sel[0]]["remise_id"])
            self.charger_paiements(garder_echeance=True)

    def action_cloturer(self):
        gid = self.id_groupe(self.cb_groupe_pay)
        if not gid:
            return
        ech, attendu, encaisse, restant = self.db.situation(gid)
        non_remis = sum(1 for b in self.db.beneficiaires(gid, ech) if not b["remise_id"])
        if non_remis and not messagebox.askyesno(
                "Lot non remis", f"{non_remis} lot(s) du tour {ech} ne sont pas encore marqués comme remis.\n"
                                 "Continuer la clôture ?", parent=self):
            return
        if restant:
            msg = (f"Il reste {fcfa(restant)} à recouvrer sur l'échéance {ech}.\n"
                   "Clôturer quand même ? Les impayés passeront en RETARDS.")
        else:
            msg = f"Échéance {ech} entièrement payée. Clôturer et remettre le lot au bénéficiaire ?"
        if not messagebox.askyesno("Clôturer l'échéance", msg, parent=self):
            return
        try:
            suivant = self.db.cloturer_echeance(gid)
        except TontineError as exc:
            return self.erreur(exc)
        self.rafraichir()
        self.statut("Groupe terminé : les 10 tours sont levés." if suivant > NB_POSITIONS
                    else f"Échéance {suivant} ouverte.")

    # --- ONGLET 4 : RAPPORTS ------------------------------------------
    def onglet_rapports(self):
        f = ttk.Frame(self.nb, padding=10)
        self.nb.add(f, text="  Rapports & listes  ")
        haut = ttk.Frame(f)
        haut.pack(fill="x")
        ttk.Label(haut, text="Liste :", style="Titre.TLabel").pack(side="left")
        self.cb_rapport = ttk.Combobox(haut, values=list(Database.RAPPORTS), state="readonly", width=34)
        self.cb_rapport.current(1)
        self.cb_rapport.pack(side="left", padx=6)
        ttk.Label(haut, text="Groupe :").pack(side="left", padx=(10, 2))
        self.cb_groupe_rap = ttk.Combobox(haut, state="readonly", width=26)
        self.cb_groupe_rap.pack(side="left")
        for cb in (self.cb_rapport, self.cb_groupe_rap):
            cb.bind("<<ComboboxSelected>>", lambda e: self.charger_rapport())
        ttk.Button(haut, text="Exporter en CSV", command=self.action_export).pack(side="right")

        self.cadre_rapport = ttk.Frame(f)
        self.cadre_rapport.pack(fill="both", expand=True, pady=8)
        self.l_total = ttk.Label(f, style="Chiffre.TLabel")
        self.l_total.pack(anchor="e")
        self.tv_rap = None
        self._dernier_rapport = None

    def charger_rapport(self):
        type_r = Database.RAPPORTS[self.cb_rapport.get()]
        gid = self.id_groupe(self.cb_groupe_rap)
        cols, rows, total, idx = self.db.rapport(type_r, gid)
        if self.tv_rap is not None:
            self.tv_rap.master.destroy()
        largeurs = [190 if c in ("Membre", "Bénéficiaire", "Remise du lot") else 110 if c in ("Téléphone", "État", "Référence", "N° CNI")
                    else 80 for c in cols]
        cadre, self.tv_rap = self.arbre(self.cadre_rapport, cols, largeurs, 18)
        cadre.pack(fill="both", expand=True)
        montants = {i for i, c in enumerate(cols) if c in ("Montant", "Montant dû", "Lot", "Attendu",
                                                           "Encaissé", "Restant")}
        for r in rows:
            self.tv_rap.insert("", "end", values=[fcfa(v) if i in montants else v for i, v in enumerate(r)])
        self.l_total.config(text=f"{len(rows)} ligne(s)  ·  Total {cols[idx].lower()} : {fcfa(total)}")
        self._dernier_rapport = (cols, rows)

    def action_export(self):
        if not self._dernier_rapport:
            return
        chemin = filedialog.asksaveasfilename(defaultextension=".csv", filetypes=[("CSV", "*.csv")],
                                              initialfile=f"rapport_{aujourdhui()}.csv", parent=self)
        if not chemin:
            return
        cols, rows = self._dernier_rapport
        with open(chemin, "w", newline="", encoding="utf-8-sig") as fh:
            w = csv.writer(fh, delimiter=";")   # « ; » : s'ouvre directement dans Excel en français
            w.writerow(cols)
            w.writerows(rows)
        self.statut(f"Rapport exporté : {chemin}")

    # --- ONGLET 5 : PARAMÈTRES -----------------------------------------
    def onglet_parametres(self):
        f = ttk.Frame(self.nb, padding=20)
        self.nb.add(f, text="  Paramètres  ")
        ttk.Label(f, text="Mise de référence d'une part entière (FCFA)", style="Titre.TLabel").grid(
            row=0, column=0, sticky="w")
        self.e_mise = ttk.Entry(f, width=16)
        self.e_mise.grid(row=1, column=0, sticky="w", pady=6)
        ttk.Button(f, text="Enregistrer", command=self.action_mise).grid(row=1, column=1, padx=8)
        ttk.Label(f, justify="left", foreground="#555", text=(
            "La mise s'applique aux NOUVEAUX groupes. Un groupe garde la mise de sa création.\n"
            "Elle doit être divisible par 4 pour que les parts à 25 % tombent juste.\n\n"
            f"Base de données : {DB_FILE}\n"
            "Sauvegarde : copiez simplement ce fichier sur une clé USB.")).grid(
            row=2, column=0, columnspan=2, sticky="w", pady=10)

    def action_mise(self):
        try:
            v = self.db.set_mise(self.e_mise.get())
        except TontineError as exc:
            return self.erreur(exc)
        self.statut(f"Mise de référence : {fcfa(v)}")

    # --- rafraîchissement global ---------------------------------------
    def rafraichir(self):
        self.charger_membres()
        self.charger_groupes_combo()
        self.charger_tableau()
        pay = self.choix_groupes("EN_COURS")
        actuel = self.cb_groupe_pay.get()
        self.cb_groupe_pay["values"] = pay
        self.cb_groupe_pay.set(actuel if actuel in pay else (pay[0] if pay else ""))
        self.charger_paiements(garder_echeance=True)
        rap = self.choix_groupes(avec_tous=True)
        actuel = self.cb_groupe_rap.get()
        self.cb_groupe_rap["values"] = rap
        self.cb_groupe_rap.set(actuel if actuel in rap else rap[0])
        self.charger_rapport()
        self.e_mise.delete(0, "end")
        self.e_mise.insert(0, str(self.db.get_mise()))
        nb_m = len(self.db.membres())
        nb_g = len(self.db.groupes())
        self.statut(f"{nb_m} membre(s) · {nb_g} groupe(s) · Mise : {fcfa(self.db.get_mise())}")


if __name__ == "__main__":
    App(Database()).mainloop()
