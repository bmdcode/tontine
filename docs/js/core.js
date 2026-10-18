/* =====================================================================
 *  GESTIONNAIRE DE TONTINES — core.js
 *  Logique métier (identique aux versions VBA, Python et PHP).
 *  Les données suivent le schéma universel : parametres, membres,
 *  groupes, parts, versements, permutations — stockées en JSON dans
 *  le navigateur (localStorage).
 * ===================================================================== */
(function (global) {
  'use strict';

  var NB_POSITIONS = 10;   // strictement 10 tours par groupe
  var QUARTS_CASE = 4;     // une case pleine = 4 quarts = 100 %
  var VERSION_DONNEES = 2;

  var FORMULES = [
    { quarts: 4, libelle: 'Global — 1 part à 100 % (1 groupe)' },
    { quarts: 2, libelle: '2 parts — 50 % dans 2 groupes' },
    { quarts: 1, libelle: '4 parts — 25 % dans 4 groupes' }
  ];

  var MODES = {
    ESPECES: 'Espèces', WAVE: 'Wave', ORANGE_MONEY: 'Orange Money', FREE_MONEY: 'Free Money',
    VIREMENT: 'Virement bancaire', CHEQUE: 'Chèque', AUTRE: 'Autre'
  };

  var RAPPORTS = {
    IMPAYES: 'Impayés (échéance en cours)',
    PAYES: 'Payés (échéance en cours)',
    RETARDS: 'Retards (échéances passées)',
    NON_RECUS: 'Non reçus (attendent leur tour)',
    RECUS: 'Reçus (ont levé la tontine)',
    RESTANT: 'Restant à recouvrer (par groupe)',
    A_REMETTRE: 'Lots à remettre aux bénéficiaires',
    REMISES: 'Lots remis (références de paiement)'
  };

  function TontineError(message) {
    this.name = 'TontineError';
    this.message = message;
  }
  TontineError.prototype = Object.create(Error.prototype);

  function aujourdhui() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var jj = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + jj;
  }
  function maintenant() {
    var d = new Date();
    return aujourdhui() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function etatVide() {
    return {
      version: VERSION_DONNEES,
      parametres: { mise_reference: 100000, nom_tontine: 'Ma Tontine' },
      seq: { membres: 0, groupes: 0, parts: 0, versements: 0, permutations: 0, remises: 0 },
      membres: [], groupes: [], parts: [], versements: [], permutations: [], remises: []
    };
  }

  /** Met à niveau une sauvegarde d'une version précédente (v1 → v2) */
  function migrer(d) {
    if (!Array.isArray(d.remises)) d.remises = [];
    if (typeof d.seq.remises !== 'number') d.seq.remises = d.remises.reduce(function (m, r) { return Math.max(m, r.id); }, 0);
    d.membres.forEach(function (m) {
      if (m.telephone2 === undefined) m.telephone2 = null;
      if (m.cni === undefined) m.cni = null;
    });
    d.version = VERSION_DONNEES;
    return d;
  }

  function nettoyerTel(t) { return String(t || '').replace(/[\s.\-]/g, ''); }
  function nettoyerCni(c) { return String(c || '').replace(/\s/g, '').toUpperCase(); }

  /** Mélange de Fisher-Yates ; alea() renvoie un nombre dans [0, 1[ */
  function melanger(liste, alea) {
    var t = liste.slice();
    for (var i = t.length - 1; i > 0; i--) {
      var j = Math.floor(alea() * (i + 1));
      var x = t[i]; t[i] = t[j]; t[j] = x;
    }
    return t;
  }
  function aleaSur() {
    var c = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : null;
    if (!c) return Math.random();
    var a = new Uint32Array(1);
    c.getRandomValues(a);
    return a[0] / 4294967296;
  }

  /* ------------------------------------------------------------------ */
  function Tontine(etat, sauvegarder) {
    this.d = migrer(etat || etatVide());
    this.sauvegarder = sauvegarder || function () {};
  }

  Tontine.prototype._id = function (table) { this.d.seq[table] += 1; return this.d.seq[table]; };
  Tontine.prototype._commit = function () { this.sauvegarder(this.d); };

  /* ---------- paramètres ---------- */
  Tontine.prototype.mise = function () { return this.d.parametres.mise_reference; };
  Tontine.prototype.setMise = function (v) {
    v = parseInt(String(v).replace(/\s/g, ''), 10);
    if (!(v > 0) || v % 4 !== 0) throw new TontineError('La mise doit être positive et divisible par 4 (pour les parts à 25 %).');
    this.d.parametres.mise_reference = v;
    this._commit();
    return v;
  };
  Tontine.prototype.setNom = function (nom) {
    this.d.parametres.nom_tontine = String(nom || '').trim() || 'Ma Tontine';
    this._commit();
  };

  /* ---------- MODULE A : membres ---------- */
  Tontine.prototype.membre = function (id) { return this.d.membres.find(function (m) { return m.id === id; }) || null; };

  /** Contrôle et met en forme une fiche membre. info = {nom, prenom, telephone, telephone2, cni} */
  Tontine.prototype._ficheMembre = function (info, idExclu) {
    var f = {
      nom: String(info.nom || '').trim().toUpperCase(),
      prenom: String(info.prenom || '').trim().toLowerCase().replace(/(^|[\s-])\S/g, function (c) { return c.toUpperCase(); }),
      telephone: nettoyerTel(info.telephone),
      telephone2: nettoyerTel(info.telephone2) || null,
      cni: nettoyerCni(info.cni) || null
    };
    if (!f.nom || !f.prenom || !f.telephone) throw new TontineError('Nom, prénom et téléphone sont obligatoires.');
    if (f.telephone2 && f.telephone2 === f.telephone) f.telephone2 = null;
    var autres = this.d.membres.filter(function (m) { return m.id !== idExclu; });
    var doublonTel = autres.find(function (m) { return m.telephone === f.telephone || m.telephone2 === f.telephone; });
    if (doublonTel) throw new TontineError('Le numéro ' + f.telephone + ' est déjà utilisé par ' + doublonTel.nom + ' ' + doublonTel.prenom + '.');
    if (f.cni) {
      var doublonCni = autres.find(function (m) { return m.cni === f.cni; });
      if (doublonCni) throw new TontineError('Le n° CNI ' + f.cni + ' est déjà enregistré pour ' + doublonCni.nom + ' ' + doublonCni.prenom + '.');
    }
    return f;
  };

  /** ajouterMembre({nom, prenom, telephone, telephone2, cni}) ou ajouterMembre(nom, prenom, telephone) */
  Tontine.prototype.ajouterMembre = function (info, prenom, telephone) {
    if (typeof info !== 'object' || info === null) info = { nom: info, prenom: prenom, telephone: telephone };
    var f = this._ficheMembre(info, null);
    var m = Object.assign({ id: this._id('membres') }, f, { date_inscription: aujourdhui() });
    this.d.membres.push(m);
    this._commit();
    return m.id;
  };

  /** Corrige la fiche d'un membre (erreur de saisie, changement de numéro…) */
  Tontine.prototype.modifierMembre = function (id, info) {
    var m = this.membre(id);
    if (!m) throw new TontineError('Membre introuvable.');
    Object.assign(m, this._ficheMembre(info, id));
    this._commit();
  };

  Tontine.prototype.supprimerMembre = function (id) {
    if (this.d.parts.some(function (p) { return p.membre_id === id; })) {
      throw new TontineError('Ce membre possède des parts : impossible de le supprimer.');
    }
    this.d.membres = this.d.membres.filter(function (m) { return m.id !== id; });
    this._commit();
  };

  Tontine.prototype.listeMembres = function (recherche) {
    var self = this, q = String(recherche || '').trim().toLowerCase();
    return this.d.membres
      .filter(function (m) {
        return !q || [m.nom, m.prenom, m.telephone, m.telephone2, m.cni].join(' ').toLowerCase().indexOf(q.replace(/\s/g, '')) >= 0 ||
               (m.nom + ' ' + m.prenom).toLowerCase().indexOf(q) >= 0;
      })
      .map(function (m) {
        var parts = self.d.parts.filter(function (p) { return p.membre_id === m.id; });
        return Object.assign({}, m, {
          nb_parts: parts.length,
          engagement: parts.reduce(function (s, p) { return s + p.quarts; }, 0) * 25
        });
      })
      .sort(function (a, b) { return (a.nom + a.prenom).localeCompare(b.nom + b.prenom, 'fr'); });
  };

  Tontine.prototype.partsDuMembre = function (id) {
    var self = this;
    return this.d.parts.filter(function (p) { return p.membre_id === id; }).map(function (p) {
      var g = self.groupe(p.groupe_id);
      return { groupe_id: g.id, code: g.code, position: p.position, quarts: p.quarts,
               etat: g.statut === 'OUVERT' ? 'Groupe non démarré' : self.etatPosition(g, p.position, QUARTS_CASE) };
    }).sort(function (a, b) { return a.groupe_id - b.groupe_id; });
  };

  /* ---------- MODULE B : groupes ---------- */
  Tontine.prototype.groupe = function (id) { return this.d.groupes.find(function (g) { return g.id === id; }) || null; };

  Tontine.prototype._nouveauCode = function () {
    var n = this.d.groupes.length + 1, codes = this.d.groupes.map(function (g) { return g.code; });
    var code;
    do { code = 'G' + String(n).padStart(3, '0'); n++; } while (codes.indexOf(code) >= 0);
    return code;
  };

  Tontine.prototype._insererGroupe = function (mise) {
    var g = { id: this._id('groupes'), code: this._nouveauCode(), mise_reference: mise, tour_courant: 1,
              statut: 'OUVERT', date_creation: aujourdhui(), date_debut: null };
    this.d.groupes.push(g);
    return g.id;
  };

  Tontine.prototype.creerGroupe = function () {
    var id = this._insererGroupe(this.mise());
    this._commit();
    return id;
  };

  Tontine.prototype.supprimerGroupeVide = function (gid) {
    var g = this.groupe(gid);
    if (!g || g.statut !== 'OUVERT' || this.d.parts.some(function (p) { return p.groupe_id === gid; })) {
      throw new TontineError('Seul un groupe ouvert et vide peut être supprimé.');
    }
    this.d.groupes = this.d.groupes.filter(function (x) { return x.id !== gid; });
    this._commit();
  };

  Tontine.prototype.listeGroupes = function (statut) {
    var self = this;
    return this.d.groupes
      .filter(function (g) { return !statut || g.statut === statut; })
      .map(function (g) {
        var q = self.d.parts.filter(function (p) { return p.groupe_id === g.id; })
          .reduce(function (s, p) { return s + p.quarts; }, 0);
        return Object.assign({}, g, { quarts_pris: q, remplissage: q * 25 / NB_POSITIONS });
      })
      .sort(function (a, b) { return a.id - b.id; });
  };

  /** {1: quarts pris, …, 10: quarts pris} */
  Tontine.prototype.occupation = function (gid) {
    var occ = {};
    for (var p = 1; p <= NB_POSITIONS; p++) occ[p] = 0;
    this.d.parts.forEach(function (x) { if (x.groupe_id === gid) occ[x.position] += x.quarts; });
    return occ;
  };

  Tontine.prototype.etatPosition = function (g, pos, quarts) {
    if (g.statut === 'OUVERT') return quarts === QUARTS_CASE ? 'Complet' : 'À compléter';
    if (pos < g.tour_courant) return 'Reçu';
    if (pos === g.tour_courant) return 'Bénéficiaire du mois';
    return 'En attente';
  };

  /** Les 10 lignes du tableau d'un groupe */
  Tontine.prototype.tableauGroupe = function (gid) {
    var self = this, g = this.groupe(gid), lignes = [];
    for (var pos = 1; pos <= NB_POSITIONS; pos++) {
      var tit = this.d.parts.filter(function (p) { return p.groupe_id === gid && p.position === pos; })
        .map(function (p) { var m = self.membre(p.membre_id); return { membre_id: m.id, nom: m.nom + ' ' + m.prenom, telephone: m.telephone, quarts: p.quarts }; })
        .sort(function (a, b) { return a.nom.localeCompare(b.nom, 'fr'); });
      var q = tit.reduce(function (s, t) { return s + t.quarts; }, 0);
      lignes.push({ position: pos, titulaires: tit, quarts: q,
                    lot: g.mise_reference * NB_POSITIONS * q / QUARTS_CASE, etat: this.etatPosition(g, pos, q) });
    }
    return lignes;
  };

  /** Première case que la part complète exactement, sinon la première avec assez de place */
  function meilleurePlace(occ, ordre, quarts, dejaPris) {
    for (var e = 0; e < 2; e++) {
      var exact = e === 0;
      for (var i = 0; i < ordre.length; i++) {
        var gid = ordre[i];
        if (dejaPris.indexOf(gid) >= 0) continue;
        for (var pos = 1; pos <= NB_POSITIONS; pos++) {
          var libre = QUARTS_CASE - occ[gid][pos];
          if (exact ? libre === quarts : libre >= quarts) return [gid, pos];
        }
      }
    }
    return null;
  }

  /** MODULE A — attribution automatique : 4 quarts → 1 groupe, 2 → 2 groupes, 1 → 4 groupes */
  Tontine.prototype.attribuer = function (membreId, quarts) {
    var self = this;
    if ([1, 2, 4].indexOf(quarts) < 0) throw new TontineError('Formule inconnue.');
    if (!this.membre(membreId)) throw new TontineError('Membre introuvable.');
    var nb = QUARTS_CASE / quarts, mise = this.mise();
    var exclus = this.d.parts.filter(function (p) { return p.membre_id === membreId; }).map(function (p) { return p.groupe_id; });
    var ordre = this.d.groupes
      .filter(function (g) { return g.statut === 'OUVERT' && g.mise_reference === mise && exclus.indexOf(g.id) < 0; })
      .sort(function (a, b) { return a.id - b.id; })
      .map(function (g) { return g.id; });
    var occ = {};
    ordre.forEach(function (gid) { occ[gid] = self.occupation(gid); });

    var choix = [];
    for (var k = 0; k < nb; k++) {
      var place = meilleurePlace(occ, ordre, quarts, choix.map(function (c) { return c[0]; }));
      if (!place) break;
      choix.push(place);
      occ[place[0]][place[1]] += quarts;
    }
    while (choix.length < nb) choix.push([this._insererGroupe(mise), 1]);

    choix.forEach(function (c) {
      self.d.parts.push({ id: self._id('parts'), membre_id: membreId, groupe_id: c[0], position: c[1],
                          quarts: quarts, date_attribution: aujourdhui() });
    });
    this._commit();
    return choix.map(function (c) { return { code: self.groupe(c[0]).code, position: c[1] }; });
  };

  Tontine.prototype.retirerPart = function (gid, membreId) {
    if (this.groupe(gid).statut !== 'OUVERT') throw new TontineError("On ne peut retirer une part que d'un groupe non démarré.");
    this.d.parts = this.d.parts.filter(function (p) { return !(p.groupe_id === gid && p.membre_id === membreId); });
    this._commit();
  };

  Tontine.prototype._genererEcheance = function (gid, ech) {
    var self = this, g = this.groupe(gid);
    this.d.parts.filter(function (p) { return p.groupe_id === gid; }).forEach(function (p) {
      var existe = self.d.versements.some(function (v) { return v.part_id === p.id && v.echeance === ech; });
      if (!existe) {
        self.d.versements.push({ id: self._id('versements'), part_id: p.id, echeance: ech,
                                 montant: g.mise_reference * p.quarts / QUARTS_CASE, statut: 'IMPAYE', date_paiement: null });
      }
    });
  };

  Tontine.prototype.demarrerGroupe = function (gid) {
    var g = this.groupe(gid);
    if (g.statut !== 'OUVERT') throw new TontineError('Ce groupe est déjà démarré.');
    var occ = this.occupation(gid), manque = [];
    for (var p = 1; p <= NB_POSITIONS; p++) if (occ[p] !== QUARTS_CASE) manque.push(p);
    if (manque.length) {
      throw new TontineError('Positions incomplètes : ' + manque.join(', ') +
        '. Les 10 cases doivent être remplies à 100 % avant de démarrer.');
    }
    g.statut = 'EN_COURS';
    g.tour_courant = 1;
    g.date_debut = aujourdhui();
    this._genererEcheance(gid, 1);
    this._commit();
  };

  /** MODULE B — 2 positions : A ↔ B ; 3 positions : A → B → C → A */
  Tontine.prototype.permuter = function (gid, positions) {
    positions = positions.filter(function (p) { return p !== '' && p !== null && p !== undefined; })
                         .map(function (p) { return parseInt(p, 10); });
    var uniques = positions.filter(function (p, i) { return positions.indexOf(p) === i; });
    if ([2, 3].indexOf(positions.length) < 0 || uniques.length !== positions.length) {
      throw new TontineError('Choisissez 2 ou 3 positions différentes.');
    }
    if (positions.some(function (p) { return !(p >= 1 && p <= NB_POSITIONS); })) throw new TontineError('Position invalide.');
    var g = this.groupe(gid);
    if (g.statut === 'CLOTURE') throw new TontineError('Ce groupe est clôturé.');
    if (g.statut === 'EN_COURS') {
      var passes = positions.filter(function (p) { return p < g.tour_courant; });
      if (passes.length) throw new TontineError('Tour(s) ' + passes.join(', ') + ' déjà levé(s) : permutation impossible.');
    }
    var self = this;
    var dejaRemis = positions.filter(function (pos) {
      return self.d.parts.some(function (p) { return p.groupe_id === gid && p.position === pos && self._remise(p.id, pos); });
    });
    if (dejaRemis.length) throw new TontineError('Le lot du tour ' + dejaRemis.join(', ') + ' est déjà remis : permutation impossible.');
    var n = positions.length, cible = {}, desc = [];
    for (var i = 0; i < n; i++) {
      cible[positions[i]] = positions[(i + 1) % n];
      desc.push(positions[i] + '→' + positions[(i + 1) % n]);
    }
    this.d.parts.forEach(function (p) {
      if (p.groupe_id === gid && cible[p.position] !== undefined) p.position = cible[p.position];
    });
    var description = desc.join(', ');
    this.d.permutations.push({ id: this._id('permutations'), groupe_id: gid, description: description, date_operation: maintenant() });
    this._commit();
    return description;
  };

  /** Tirage au sort de l'ordre de passage.
   *  Groupe ouvert : les 10 tours. Groupe en cours : seulement les tours après le tour courant.
   *  Les co-titulaires d'une même case restent ensemble. */
  Tontine.prototype.tirageAuSort = function (gid, alea) {
    var g = this.groupe(gid);
    if (!g) throw new TontineError('Groupe introuvable.');
    if (g.statut === 'CLOTURE') throw new TontineError('Ce groupe est clôturé.');
    var debut = g.statut === 'EN_COURS' ? g.tour_courant + 1 : 1;
    var positions = [];
    for (var p = debut; p <= NB_POSITIONS; p++) positions.push(p);
    if (positions.length < 2) throw new TontineError('Il ne reste pas assez de tours à tirer au sort.');
    var tirees = melanger(positions, alea || aleaSur);
    var cible = {}, desc = [];
    positions.forEach(function (pos, i) { cible[pos] = tirees[i]; if (pos !== tirees[i]) desc.push(pos + '→' + tirees[i]); });
    this.d.parts.forEach(function (x) {
      if (x.groupe_id === gid && cible[x.position] !== undefined) x.position = cible[x.position];
    });
    var description = 'Tirage au sort (tours ' + debut + ' à 10) : ' + (desc.join(', ') || 'ordre inchangé');
    this.d.permutations.push({ id: this._id('permutations'), groupe_id: gid, description: description, date_operation: maintenant() });
    this._commit();
    return description;
  };

  /** Remplace le titulaire d'une part (départ d'un membre, cession…) */
  Tontine.prototype.transfererPart = function (partId, nouveauMembreId) {
    var p = this.d.parts.find(function (x) { return x.id === partId; });
    if (!p) throw new TontineError('Part introuvable.');
    var g = this.groupe(p.groupe_id), nouveau = this.membre(nouveauMembreId), ancien = this.membre(p.membre_id);
    if (!nouveau) throw new TontineError('Choisissez le nouveau titulaire.');
    if (g.statut === 'CLOTURE') throw new TontineError('Ce groupe est clôturé.');
    if (nouveau.id === ancien.id) throw new TontineError('Le nouveau titulaire est le même que l\'ancien.');
    if (this.d.parts.some(function (x) { return x.groupe_id === g.id && x.membre_id === nouveau.id; })) {
      throw new TontineError(nouveau.nom + ' ' + nouveau.prenom + ' a déjà une part dans le groupe ' + g.code + '.');
    }
    p.membre_id = nouveau.id;
    this.d.permutations.push({ id: this._id('permutations'), groupe_id: g.id, date_operation: maintenant(),
      description: 'Tour ' + p.position + ' : ' + ancien.nom + ' ' + ancien.prenom + ' remplacé(e) par ' + nouveau.nom + ' ' + nouveau.prenom });
    this._commit();
  };

  Tontine.prototype.historiquePermutations = function (gid) {
    return this.d.permutations.filter(function (h) { return h.groupe_id === gid; }).slice().reverse();
  };

  /* ---------- MODULE C : versements et listes ---------- */
  Tontine.prototype._detailVersement = function (v) {
    var p = this.d.parts.find(function (x) { return x.id === v.part_id; });
    var g = this.groupe(p.groupe_id), m = this.membre(p.membre_id);
    return { id: v.id, groupe_id: g.id, groupe: g.code, echeance: v.echeance, position: p.position,
             membre: m.nom + ' ' + m.prenom, telephone: m.telephone, pct: p.quarts * 25,
             montant: v.montant, statut: v.statut, date_paiement: v.date_paiement, _g: g };
  };

  function trierDetails(a, b) {
    return a.groupe.localeCompare(b.groupe) || a.echeance - b.echeance || a.position - b.position ||
           a.membre.localeCompare(b.membre, 'fr');
  }

  Tontine.prototype.versementsEcheance = function (gid, ech) {
    var self = this;
    return this.d.versements.map(function (v) { return self._detailVersement(v); })
      .filter(function (x) { return x.groupe_id === gid && x.echeance === ech; })
      .sort(trierDetails);
  };

  Tontine.prototype.marquer = function (ids, statut) {
    if (['PAYE', 'IMPAYE'].indexOf(statut) < 0) throw new TontineError('Statut invalide.');
    var date = statut === 'PAYE' ? aujourdhui() : null;
    this.d.versements.forEach(function (v) {
      if (ids.indexOf(v.id) >= 0) { v.statut = statut; v.date_paiement = date; }
    });
    this._commit();
  };

  Tontine.prototype.situation = function (gid) {
    var g = this.groupe(gid), lignes = this.versementsEcheance(gid, g.tour_courant);
    var attendu = lignes.reduce(function (s, l) { return s + l.montant; }, 0);
    var encaisse = lignes.reduce(function (s, l) { return s + (l.statut === 'PAYE' ? l.montant : 0); }, 0);
    return { echeance: g.tour_courant, attendu: attendu, encaisse: encaisse, restant: attendu - encaisse,
             nb_impayes: lignes.filter(function (l) { return l.statut === 'IMPAYE'; }).length };
  };

  Tontine.prototype.cloturerEcheance = function (gid) {
    var g = this.groupe(gid);
    if (g.statut !== 'EN_COURS') throw new TontineError("Seul un groupe en cours peut avancer d'échéance.");
    var suivant = g.tour_courant + 1;
    if (suivant > NB_POSITIONS) {
      g.tour_courant = 11;
      g.statut = 'CLOTURE';
    } else {
      g.tour_courant = suivant;
      this._genererEcheance(gid, suivant);
    }
    this._commit();
    return suivant;
  };

  /* ---------- remise du lot aux bénéficiaires ---------- */
  Tontine.prototype._remise = function (partId, ech) {
    return this.d.remises.find(function (r) { return r.part_id === partId && r.echeance === ech; }) || null;
  };

  /** Bénéficiaires d'une échéance (parts à la position = échéance) avec leur remise éventuelle */
  Tontine.prototype.beneficiaires = function (gid, ech) {
    var self = this, g = this.groupe(gid);
    return this.d.parts.filter(function (p) { return p.groupe_id === gid && p.position === ech; }).map(function (p) {
      var m = self.membre(p.membre_id);
      return { part_id: p.id, membre: m.nom + ' ' + m.prenom, telephone: m.telephone, telephone2: m.telephone2, cni: m.cni,
               pct: p.quarts * 25, lot: g.mise_reference * NB_POSITIONS * p.quarts / QUARTS_CASE, remise: self._remise(p.id, ech) };
    }).sort(function (a, b) { return a.membre.localeCompare(b.membre, 'fr'); });
  };

  /** Enregistre (ou corrige) la remise d'un lot : mode, référence, date, observation */
  Tontine.prototype.enregistrerRemise = function (partId, ech, info) {
    var p = this.d.parts.find(function (x) { return x.id === partId; });
    if (!p) throw new TontineError('Part introuvable.');
    var g = this.groupe(p.groupe_id);
    if (p.position !== ech) throw new TontineError('Ce membre n\'est pas bénéficiaire de l\'échéance ' + ech + '.');
    if (g.statut === 'OUVERT' || ech > g.tour_courant) throw new TontineError('Ce tour n\'est pas encore ouvert.');
    var mode = MODES[info.mode] ? info.mode : 'ESPECES';
    var reference = String(info.reference || '').trim();
    if (mode !== 'ESPECES' && !reference) throw new TontineError('Indiquez la référence du paiement (n° de transaction, de chèque…).');
    var date = String(info.date || '').slice(0, 10) || aujourdhui();
    var r = this._remise(partId, ech);
    var champs = { mode: mode, reference: reference || null, date_remise: date, observation: String(info.observation || '').trim() || null,
                   montant: g.mise_reference * NB_POSITIONS * p.quarts / QUARTS_CASE };
    if (r) Object.assign(r, champs);
    else this.d.remises.push(Object.assign({ id: this._id('remises'), part_id: partId, echeance: ech }, champs));
    this._commit();
  };

  Tontine.prototype.annulerRemise = function (remiseId) {
    this.d.remises = this.d.remises.filter(function (r) { return r.id !== remiseId; });
    this._commit();
  };

  /** Renvoie { lignes: [...], total, colonneTotal } */
  Tontine.prototype.rapport = function (type, gid) {
    var self = this, lignes, col;
    var filtreG = function (g) { return !gid || g.id === gid; };
    var details = function () { return self.d.versements.map(function (v) { return self._detailVersement(v); }); };

    if (type === 'PAYES' || type === 'IMPAYES') {
      var st = type === 'PAYES' ? 'PAYE' : 'IMPAYE';
      lignes = details().filter(function (x) {
        return filtreG(x._g) && x._g.statut === 'EN_COURS' && x.echeance === x._g.tour_courant && x.statut === st;
      }).sort(trierDetails);
      col = 'montant';
    } else if (type === 'RETARDS') {
      lignes = details().filter(function (x) {
        return filtreG(x._g) && x.statut === 'IMPAYE' && x.echeance < x._g.tour_courant;
      }).sort(trierDetails);
      col = 'montant';
    } else if (type === 'RECUS' || type === 'NON_RECUS') {
      lignes = this.d.parts.map(function (p) {
        var g = self.groupe(p.groupe_id), m = self.membre(p.membre_id);
        var recu = g.statut !== 'OUVERT' && p.position < g.tour_courant;
        var rem = self._remise(p.id, p.position);
        return { groupe_id: g.id, groupe: g.code, echeance: 0, position: p.position, membre: m.nom + ' ' + m.prenom,
                 telephone: m.telephone, pct: p.quarts * 25, recu: recu, _g: g,
                 etat: recu ? 'Reçu' : (g.statut === 'EN_COURS' && p.position === g.tour_courant ? 'Bénéficiaire du mois' : 'En attente'),
                 lot: g.mise_reference * NB_POSITIONS * p.quarts / QUARTS_CASE,
                 remise: rem ? MODES[rem.mode] + (rem.reference ? ' n° ' + rem.reference : '') + ' · ' + rem.date_remise : (recu ? 'À remettre' : '') };
      }).filter(function (x) { return filtreG(x._g) && (type === 'RECUS' ? x.recu : !x.recu); }).sort(trierDetails);
      col = 'lot';
    } else if (type === 'A_REMETTRE' || type === 'REMISES') {
      lignes = [];
      this.d.parts.forEach(function (p) {
        var g = self.groupe(p.groupe_id);
        if (!filtreG(g) || g.statut === 'OUVERT' || p.position > g.tour_courant) return;
        var rem = self._remise(p.id, p.position);
        if ((type === 'REMISES') !== !!rem) return;
        var m = self.membre(p.membre_id);
        lignes.push({ groupe_id: g.id, groupe: g.code, echeance: p.position, position: p.position,
                      membre: m.nom + ' ' + m.prenom, telephone: m.telephone, cni: m.cni || '', pct: p.quarts * 25,
                      lot: rem ? rem.montant : g.mise_reference * NB_POSITIONS * p.quarts / QUARTS_CASE,
                      mode: rem ? MODES[rem.mode] : '', reference: rem ? (rem.reference || '') : '',
                      date_remise: rem ? rem.date_remise : '', observation: rem ? (rem.observation || '') : '' });
      });
      lignes.sort(trierDetails);
      col = 'lot';
    } else if (type === 'RESTANT') {
      lignes = this.listeGroupes('EN_COURS').filter(filtreG).map(function (g) {
        return Object.assign({ groupe_id: g.id, groupe: g.code }, self.situation(g.id));
      });
      col = 'restant';
    } else {
      throw new TontineError('Rapport inconnu.');
    }
    lignes.forEach(function (l) { delete l._g; delete l.recu; });
    return { lignes: lignes, total: lignes.reduce(function (s, l) { return s + (l[col] || 0); }, 0), colonneTotal: col };
  };

  /* ---------- import / export ---------- */
  Tontine.prototype.exporter = function () { return JSON.stringify(this.d, null, 2); };

  Tontine.valider = function (obj) {
    var tables = ['membres', 'groupes', 'parts', 'versements', 'permutations'];  // « remises » : ajoutée si absente (v1)
    if (!obj || typeof obj !== 'object' || !obj.parametres || !obj.seq) throw new TontineError("Ce fichier n'est pas une sauvegarde de tontine.");
    tables.forEach(function (t) { if (!Array.isArray(obj[t])) throw new TontineError('Sauvegarde incomplète : table « ' + t + ' » absente.'); });
    return migrer(obj);
  };

  var api = {
    Tontine: Tontine, TontineError: TontineError, etatVide: etatVide,
    FORMULES: FORMULES, RAPPORTS: RAPPORTS, MODES: MODES, melanger: melanger, NB_POSITIONS: NB_POSITIONS, QUARTS_CASE: QUARTS_CASE
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.TontineCore = api;
})(this);
