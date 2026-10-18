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
  var VERSION_DONNEES = 5;

  /* cle : identifiant ; parts : quarts de chaque part (1 = 25 %), chacune dans un groupe différent */
  var FORMULES = [
    { cle: 'G100', parts: [4], libelle: 'Part entière — 100 % dans 1 groupe' },
    { cle: 'S75', parts: [3], libelle: '75 % dans 1 groupe' },
    { cle: 'S50', parts: [2], libelle: '50 % dans 1 groupe' },
    { cle: 'S25', parts: [1], libelle: '25 % dans 1 groupe' },
    { cle: 'D50', parts: [2, 2], libelle: '2 parts — 50 % dans 2 groupes' },
    { cle: 'Q25', parts: [1, 1, 1, 1], libelle: '4 parts — 25 % dans 4 groupes' },
    { cle: 'M75_25', parts: [3, 1], libelle: '2 parts — 75 % + 25 % dans 2 groupes' },
    { cle: 'M50_25_25', parts: [2, 1, 1], libelle: '3 parts — 50 % + 25 % + 25 % dans 3 groupes' }
  ];
  FORMULES.forEach(function (f) {
    f.groupes = f.parts.length;
    f.total = f.parts.reduce(function (a, b) { return a + b; }, 0);
    f.quarts = f.parts[0];
  });
  function formule(cle) {
    if (typeof cle === 'number') {                // compatibilité : 4 → G100, 2 → D50, 1 → Q25
      cle = { 4: 'G100', 2: 'D50', 1: 'Q25', 3: 'S75' }[cle];
    }
    return FORMULES.find(function (f) { return f.cle === cle; }) || null;
  }

  /* Grille des tarifs : mise mensuelle d'une part entière (le lot vaut 10 fois la mise) */
  var TARIFS_DEFAUT = [100000, 200000, 300000, 400000, 500000, 600000, 700000, 800000, 900000,
                       1000000, 2000000, 3000000, 4000000, 5000000];
  var MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

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
      parametres: { mise_reference: 100000, nom_tontine: 'Ma Tontine', tarifs: TARIFS_DEFAUT.slice() },
      seq: { membres: 0, groupes: 0, parts: 0, versements: 0, permutations: 0, remises: 0, observations: 0 },
      membres: [], groupes: [], parts: [], versements: [], permutations: [], remises: [], observations: []
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
    if (!Array.isArray(d.parametres.tarifs) || !d.parametres.tarifs.length) d.parametres.tarifs = TARIFS_DEFAUT.slice();
    if (!Array.isArray(d.parametres.responsables)) d.parametres.responsables = [];
    d.versements.forEach(function (v) {
      if (v.mode === undefined) v.mode = v.statut === 'PAYE' ? 'ESPECES' : null;
      if (v.reference === undefined) v.reference = null;
      if (!Array.isArray(v.rappels)) v.rappels = [];
    });
    if (!Array.isArray(d.observations)) d.observations = [];
    if (typeof d.seq.observations !== 'number') d.seq.observations = d.observations.reduce(function (m, o) { return Math.max(m, o.id); }, 0);
    d.membres.forEach(function (m) { if (m.confiance === undefined) m.confiance = null; });
    d.groupes.forEach(function (g) { if (!g.clotures || typeof g.clotures !== 'object') g.clotures = {}; });
    if (d.parametres.jour_limite === undefined) d.parametres.jour_limite = null;
    if (d.parametres.prochain_groupe === undefined) d.parametres.prochain_groupe = null;
    d.groupes.forEach(function (g) {
      if (g.nom === undefined) g.nom = '';
      if (g.mois_debut === undefined) g.mois_debut = g.date_debut ? String(g.date_debut).slice(0, 7) : null;
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
  Tontine.prototype.tarifs = function () {
    var t = this.d.parametres.tarifs.slice();
    this.d.groupes.forEach(function (g) { if (t.indexOf(g.mise_reference) < 0) t.push(g.mise_reference); });
    return t.sort(function (a, b) { return a - b; });
  };
  /** liste : « 100000, 200000 » ou tableau de nombres ; chaque tarif doit être divisible par 4 */
  Tontine.prototype.setTarifs = function (liste) {
    var t = (Array.isArray(liste) ? liste : String(liste || '').split(/[;,\n]+/))
      .map(function (x) { return parseInt(String(x).replace(/[\s.]/g, ''), 10); })
      .filter(function (x) { return x > 0; });
    if (!t.length) throw new TontineError('Indiquez au moins un tarif.');
    var mauvais = t.filter(function (x) { return x % 4 !== 0; });
    if (mauvais.length) throw new TontineError('Tarif non divisible par 4 (parts à 25 %) : ' + mauvais.join(', '));
    this.d.parametres.tarifs = t.filter(function (x, i) { return t.indexOf(x) === i; }).sort(function (a, b) { return a - b; });
    this._commit();
    return this.d.parametres.tarifs;
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
        var actives = parts.filter(function (p) { return self.groupe(p.groupe_id).statut !== 'CLOTURE'; });
        return Object.assign({}, m, {
          nb_parts: actives.length, nb_parts_total: parts.length,
          engagement: actives.reduce(function (s, p) { return s + p.quarts; }, 0) * 25,
          statut: actives.length ? 'ACTIF' : (parts.length ? 'ANCIEN' : 'SANS_GROUPE'),
          retards: self.d.versements.filter(function (v) {
            if (v.statut !== 'IMPAYE') return false;
            var p = self.d.parts.find(function (x) { return x.id === v.part_id; });
            return p.membre_id === m.id && v.echeance < self.groupe(p.groupe_id).tour_courant;
          }).length
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

  /** Code du prochain groupe : compteur réglable dans Paramètres (ex. 109 → G109, G110…) */
  Tontine.prototype._nouveauCode = function () {
    var codes = this.d.groupes.map(function (g) { return g.code; });
    var n = this.d.parametres.prochain_groupe || this.d.groupes.length + 1, code;
    do { code = 'G' + String(n).padStart(3, '0'); n++; } while (codes.indexOf(code) >= 0);
    if (this.d.parametres.prochain_groupe) this.d.parametres.prochain_groupe = n;
    return code;
  };

  Tontine.prototype.prochainNumero = function () {
    var codes = this.d.groupes.map(function (g) { return g.code; });
    var n = this.d.parametres.prochain_groupe || this.d.groupes.length + 1;
    while (codes.indexOf('G' + String(n).padStart(3, '0')) >= 0) n++;
    return n;
  };

  Tontine.prototype.setProchainNumero = function (n) {
    n = parseInt(n, 10);
    if (!(n >= 1)) throw new TontineError('Le numéro du prochain groupe doit être un nombre positif.');
    this.d.parametres.prochain_groupe = n;
    this._commit();
  };

  /** Responsables affichés sur les affiches et les fiches : une ligne « Nom ; téléphone » par personne */
  Tontine.prototype.setResponsables = function (texte) {
    this.d.parametres.responsables = String(texte || '').split(/\n+/).map(function (l) {
      var p = l.split(/[;:]|\s{2,}|\t/);
      return { nom: (p[0] || '').trim(), tel: (p.slice(1).join(' ') || '').trim() };
    }).filter(function (r) { return r.nom; });
    this._commit();
  };

  Tontine.prototype._insererGroupe = function (mise) {
    var g = { id: this._id('groupes'), code: this._nouveauCode(), nom: '', mise_reference: mise, tour_courant: 1,
              statut: 'OUVERT', date_creation: aujourdhui(), date_debut: null, mois_debut: null };
    this.d.groupes.push(g);
    return g.id;
  };

  Tontine.prototype.creerGroupe = function (mise) {
    mise = mise ? verifierMise(mise) : this.mise();
    var id = this._insererGroupe(mise);
    this._commit();
    return id;
  };

  /** Nom affiché (ex. « Tontine Millions 10 mois ») et premier mois (AAAA-MM) du groupe */
  Tontine.prototype.modifierGroupe = function (gid, info) {
    var g = this.groupe(gid);
    if (!g) throw new TontineError('Groupe introuvable.');
    g.nom = String(info.nom || '').trim();
    if (info.code !== undefined) {
      var code = String(info.code || '').trim().toUpperCase();
      if (!code) throw new TontineError('Le numéro du groupe ne peut pas être vide.');
      if (/^\d+$/.test(code)) code = 'G' + code.padStart(3, '0');
      if (this.d.groupes.some(function (x) { return x.id !== gid && x.code === code; })) throw new TontineError('Le numéro ' + code + ' est déjà pris.');
      g.code = code;
    }
    var m = String(info.mois_debut || '').slice(0, 7);
    if (m && !/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw new TontineError('Premier mois invalide.');
    g.mois_debut = m || null;
    this._commit();
  };

  /** « Octobre 2026 » pour le tour n d'un groupe (si son premier mois est connu) */
  Tontine.prototype.moisDuTour = function (g, tour) {
    if (!g.mois_debut) return '';
    var a = parseInt(g.mois_debut.slice(0, 4), 10), m = parseInt(g.mois_debut.slice(5, 7), 10) - 1 + (tour - 1);
    return MOIS[m % 12] + ' ' + (a + Math.floor(m / 12));
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
        .map(function (p) { var m = self.membre(p.membre_id); return { part_id: p.id, membre_id: m.id, nom: m.nom + ' ' + m.prenom, prenom_nom: (m.prenom + ' ' + m.nom).toUpperCase(), telephone: m.telephone, quarts: p.quarts }; })
        .sort(function (a, b) { return a.nom.localeCompare(b.nom, 'fr'); });
      var q = tit.reduce(function (s, t) { return s + t.quarts; }, 0);
      lignes.push({ position: pos, titulaires: tit, quarts: q,
                    lot: g.mise_reference * NB_POSITIONS * q / QUARTS_CASE, etat: this.etatPosition(g, pos, q),
                    mois: this.moisDuTour(g, pos) });
    }
    return lignes;
  };

  /** Première case que la part complète exactement, sinon la première avec assez de place */
  function meilleurePlace(occ, ordre, quarts, dejaPris, interdits) {
    for (var e = 0; e < 2; e++) {
      var exact = e === 0;
      for (var i = 0; i < ordre.length; i++) {
        var gid = ordre[i];
        if (dejaPris.indexOf(gid) >= 0) continue;
        for (var pos = 1; pos <= NB_POSITIONS; pos++) {
          if (interdits && interdits[gid + ':' + pos]) continue;
          var libre = QUARTS_CASE - occ[gid][pos];
          if (exact ? libre === quarts : libre >= quarts) return [gid, pos];
        }
      }
    }
    return null;
  }

  function verifierMise(m) {
    m = parseInt(String(m).replace(/[\s.]/g, ''), 10);
    if (!(m > 0) || m % 4 !== 0) throw new TontineError('Le tarif doit être un montant positif divisible par 4.');
    return m;
  }

  /** MODULE A — attribution automatique.
   *  cleFormule : G100, S75, S50, S25 (un seul groupe) ou D50, Q25 (plusieurs groupes) ; mise : tarif du groupe.
   *  Formules sur plusieurs groupes : des groupes différents où le membre n'est pas encore.
   *  Formules sur un groupe : le membre peut déjà y être, mais jamais deux fois sur le même tour. */
  Tontine.prototype.attribuer = function (membreId, cleFormule, mise) {
    var self = this, f = formule(cleFormule);
    if (!f) throw new TontineError('Formule inconnue.');
    if (!this.membre(membreId)) throw new TontineError('Membre introuvable.');
    var nb = f.groupes, aPlacer = f.parts.slice().sort(function (a, b) { return b - a; });   // la plus grosse part d'abord
    mise = mise ? verifierMise(mise) : this.mise();
    var siennes = this.d.parts.filter(function (p) { return p.membre_id === membreId; });
    var exclus = nb > 1 ? siennes.map(function (p) { return p.groupe_id; }) : [];
    var interdits = {};
    siennes.forEach(function (p) { interdits[p.groupe_id + ':' + p.position] = true; });
    var ordre = this.d.groupes
      .filter(function (g) { return g.statut === 'OUVERT' && g.mise_reference === mise && exclus.indexOf(g.id) < 0; })
      .sort(function (a, b) { return a.id - b.id; })
      .map(function (g) { return g.id; });
    var occ = {};
    ordre.forEach(function (gid) { occ[gid] = self.occupation(gid); });

    var choix = [];                                  // [groupe, tour, quarts]
    aPlacer.forEach(function (q) {
      var place = meilleurePlace(occ, ordre, q, choix.map(function (c) { return c[0]; }), interdits);
      if (place) {
        occ[place[0]][place[1]] += q;
        choix.push([place[0], place[1], q]);
      } else {
        choix.push([null, 1, q]);                    // pas de place : nouveau groupe
      }
    });
    choix.forEach(function (c) { if (c[0] === null) c[0] = self._insererGroupe(mise); });

    choix.forEach(function (c) {
      self.d.parts.push({ id: self._id('parts'), membre_id: membreId, groupe_id: c[0], position: c[1],
                          quarts: c[2], date_attribution: aujourdhui() });
    });
    this._commit();
    return choix.map(function (c) { return { code: self.groupe(c[0]).code, position: c[1], quarts: c[2], mise: mise }; });
  };

  /** Retire une part d'un groupe non démarré (partId) */
  Tontine.prototype.retirerPart = function (partId) {
    var p = this.d.parts.find(function (x) { return x.id === partId; });
    if (!p) throw new TontineError('Part introuvable.');
    if (this.groupe(p.groupe_id).statut !== 'OUVERT') throw new TontineError("On ne peut retirer une part que d'un groupe non démarré.");
    this.d.parts = this.d.parts.filter(function (x) { return x.id !== partId; });
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
  Tontine.prototype.debutTirage = function (gid) {
    var g = this.groupe(gid);
    return g.statut === 'EN_COURS' ? g.tour_courant + 1 : 1;
  };

  /** forces : { tour actuel de la case : tour imposé } — ces cases sont placées d'office, les autres sont tirées au sort */
  Tontine.prototype.tirageAuSort = function (gid, alea, forces) {
    var g = this.groupe(gid);
    if (!g) throw new TontineError('Groupe introuvable.');
    if (g.statut === 'CLOTURE') throw new TontineError('Ce groupe est clôturé.');
    var debut = this.debutTirage(gid);
    var positions = [];
    for (var p = debut; p <= NB_POSITIONS; p++) positions.push(p);
    if (positions.length < 2) throw new TontineError('Il ne reste pas assez de tours à tirer au sort.');
    forces = forces || {};
    var cible = {}, prises = {};
    Object.keys(forces).forEach(function (k) {
      var de = parseInt(k, 10), vers = parseInt(forces[k], 10);
      if (!vers) return;
      if (positions.indexOf(de) < 0 || positions.indexOf(vers) < 0) {
        throw new TontineError('Place imposée impossible : seuls les tours ' + debut + ' à 10 peuvent être tirés.');
      }
      if (prises[vers]) throw new TontineError('Deux cases ne peuvent pas être imposées au même tour (' + vers + ').');
      prises[vers] = true;
      cible[de] = vers;
    });
    var sources = positions.filter(function (x) { return cible[x] === undefined; });
    var libres = melanger(positions.filter(function (x) { return !prises[x]; }), alea || aleaSur);
    sources.forEach(function (x, i) { cible[x] = libres[i]; });
    var desc = [];
    positions.forEach(function (pos) {
      if (pos !== cible[pos] || forces[pos]) desc.push(pos + '→' + cible[pos] + (forces[pos] ? ' (imposé)' : ''));
    });
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
    if (this.d.parts.some(function (x) { return x.groupe_id === g.id && x.position === p.position && x.membre_id === nouveau.id; })) {
      throw new TontineError(nouveau.nom + ' ' + nouveau.prenom + ' a déjà une part au tour ' + p.position + ' du groupe ' + g.code + '.');
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
             montant: v.montant, statut: v.statut, date_paiement: v.date_paiement,
             mode: v.mode || null, mode_libelle: v.mode ? MODES[v.mode] : '', reference: v.reference || '', _g: g };
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

  /** Versements impayés des échéances déjà clôturées (gid facultatif) */
  Tontine.prototype.retards = function (gid) {
    var self = this;
    return this.d.versements.map(function (v) { return self._detailVersement(v); })
      .filter(function (x) { return (!gid || x.groupe_id === gid) && x.statut === 'IMPAYE' && x.echeance < x._g.tour_courant; })
      .map(function (x) { x.mois = self.moisDuTour(x._g, x.echeance); delete x._g; return x; })
      .sort(trierDetails);
  };

  /** Marque des cotisations payées ou impayées.
   *  info (facultatif, pour PAYE) : { mode, reference, date } — mode Espèces par défaut. */
  Tontine.prototype.marquer = function (ids, statut, info) {
    if (['PAYE', 'IMPAYE'].indexOf(statut) < 0) throw new TontineError('Statut invalide.');
    info = info || {};
    var mode = MODES[info.mode] ? info.mode : null;
    var reference = String(info.reference || '').trim() || null;
    var date = String(info.date || '').slice(0, 10);
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new TontineError('Date de paiement invalide.');
    this.d.versements.forEach(function (v) {
      if (ids.indexOf(v.id) < 0) return;
      if (statut === 'PAYE') {
        if (v.statut !== 'PAYE' || date) v.date_paiement = date || v.date_paiement || aujourdhui();
        if (mode || v.statut !== 'PAYE') v.mode = mode || v.mode || 'ESPECES';
        if (info.reference !== undefined || v.statut !== 'PAYE') v.reference = reference;
      } else {
        v.date_paiement = null; v.mode = null; v.reference = null;
      }
      v.statut = statut;
    });
    this._commit();
  };

  /** Une référence déjà utilisée pour une autre cotisation ou une remise (contrôle des doublons) */
  Tontine.prototype.referenceUtilisee = function (reference, versementExclu) {
    var ref = String(reference || '').trim().toUpperCase();
    if (!ref) return null;
    var self = this, exclus = [].concat(versementExclu || []);
    var v = this.d.versements.find(function (x) { return exclus.indexOf(x.id) < 0 && x.reference && x.reference.toUpperCase() === ref; });
    if (v) { var d = this._detailVersement(v); return d.membre + ' — groupe ' + d.groupe + ', échéance ' + d.echeance; }
    var r = this.d.remises.find(function (x) { return x.reference && x.reference.toUpperCase() === ref; });
    if (r) {
      var p = this.d.parts.find(function (x) { return x.id === r.part_id; }), m = self.membre(p.membre_id);
      return 'remise du lot à ' + m.nom + ' ' + m.prenom;
    }
    return null;
  };

  Tontine.prototype.versement = function (id) {
    var v = this.d.versements.find(function (x) { return x.id === id; });
    if (!v) return null;
    var d = this._detailVersement(v), g = d._g;
    delete d._g;
    d.mode = v.mode || null; d.reference = v.reference || null;
    d.mois = this.moisDuTour(g, v.echeance);
    d.nom_groupe = g.nom;
    var p = this.d.parts.find(function (x) { return x.id === v.part_id; });
    d.membre_id = p.membre_id;
    return d;
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
    g.clotures = g.clotures || {};
    g.clotures[g.tour_courant] = aujourdhui();
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

  /* ---------- statut, confiance, observations ---------- */
  var STATUTS_MEMBRE = { ACTIF: 'Actif', ANCIEN: 'Inactif (ancien membre)', SANS_GROUPE: 'Sans groupe' };
  var CONFIANCE = { BON: 'Bon payeur', MOYEN: 'Moyen', MAUVAIS: 'Mauvais payeur', SURVEILLER: 'À surveiller' };
  var CATEGORIES_OBS = { ASSIDUITE: 'Assiduité', CONFIANCE: 'Confiance', COMPORTEMENT: 'Comportement', PAIEMENT: 'Paiement', AUTRE: 'Autre' };
  var APPRECIATIONS = { BON: 'Bon', NEUTRE: 'Neutre', MAUVAIS: 'Mauvais' };

  Tontine.prototype.setConfiance = function (membreId, niveau) {
    var m = this.membre(membreId);
    if (!m) throw new TontineError('Membre introuvable.');
    m.confiance = CONFIANCE[niveau] ? niveau : null;
    this._commit();
  };

  Tontine.prototype.ajouterObservation = function (membreId, info) {
    if (!this.membre(membreId)) throw new TontineError('Membre introuvable.');
    var texte = String(info.texte || '').trim();
    if (!texte) throw new TontineError('Écrivez l\'observation.');
    var date = String(info.date || '').slice(0, 10) || aujourdhui();
    this.d.observations.push({ id: this._id('observations'), membre_id: membreId, date: date,
      categorie: CATEGORIES_OBS[info.categorie] ? info.categorie : 'AUTRE',
      appreciation: APPRECIATIONS[info.appreciation] ? info.appreciation : 'NEUTRE', texte: texte });
    this._commit();
  };

  Tontine.prototype.supprimerObservation = function (id) {
    this.d.observations = this.d.observations.filter(function (o) { return o.id !== id; });
    this._commit();
  };

  Tontine.prototype.observations = function (membreId) {
    return this.d.observations.filter(function (o) { return o.membre_id === membreId; })
      .sort(function (a, b) { return b.date.localeCompare(a.date) || b.id - a.id; });
  };

  /* ---------- échéances : date limite et ponctualité ---------- */
  Tontine.prototype.setJourLimite = function (jour) {
    jour = parseInt(jour, 10);
    this.d.parametres.jour_limite = jour >= 1 && jour <= 31 ? jour : null;
    this._commit();
  };

  /** Date limite de paiement d'une échéance : jour fixe du mois (si réglé et si le mois du tour est connu), sinon date de clôture */
  Tontine.prototype.dateLimite = function (g, ech) {
    var j = this.d.parametres.jour_limite;
    if (j && g.mois_debut) {
      var a = parseInt(g.mois_debut.slice(0, 4), 10), m0 = parseInt(g.mois_debut.slice(5, 7), 10) - 1 + (ech - 1);
      var an = a + Math.floor(m0 / 12), mo = m0 % 12, fin = new Date(an, mo + 1, 0).getDate();
      return an + '-' + String(mo + 1).padStart(2, '0') + '-' + String(Math.min(j, fin)).padStart(2, '0');
    }
    return (g.clotures && g.clotures[ech]) || null;
  };

  function joursEntre(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }

  /** { code, texte, jours } : A_TEMPS, RETARD (payé en retard), EN_RETARD (impayé, échéance dépassée), A_PAYER */
  Tontine.prototype.ponctualite = function (v) {
    var p = this.d.parts.find(function (x) { return x.id === v.part_id; }), g = this.groupe(p.groupe_id);
    var lim = this.dateLimite(g, v.echeance);
    if (v.statut === 'PAYE') {
      if (!lim || !v.date_paiement) return { code: 'A_TEMPS', texte: 'Payé', jours: 0 };
      var j = joursEntre(lim, v.date_paiement);
      return j <= 0 ? { code: 'A_TEMPS', texte: j < 0 ? 'Payé en avance' : 'Payé à temps', jours: j }
                    : { code: 'RETARD', texte: 'Payé avec ' + j + ' j de retard', jours: j };
    }
    var depasse = v.echeance < g.tour_courant || (lim && lim < aujourdhui());
    if (!depasse) return { code: 'A_PAYER', texte: 'À payer' + (lim ? ' avant le ' + lim.split('-').reverse().join('/') : ''), jours: 0 };
    var jr = lim ? Math.max(0, joursEntre(lim, aujourdhui())) : 0;
    return { code: 'EN_RETARD', texte: 'En retard' + (jr ? ' depuis ' + jr + ' j' : ''), jours: jr };
  };

  /** Enregistre un rappel envoyé pour une cotisation ; renvoie son numéro (1er, 2e…) */
  Tontine.prototype.ajouterRappel = function (versementId, canal) {
    var v = this.d.versements.find(function (x) { return x.id === versementId; });
    if (!v) throw new TontineError('Cotisation introuvable.');
    v.rappels = v.rappels || [];
    v.rappels.push({ date: aujourdhui(), niveau: v.rappels.length + 1, canal: canal || 'WhatsApp' });
    this._commit();
    return v.rappels.length;
  };

  /** Dossier complet : fiche, participations (en cours et passées), paiements détaillés, observations */
  Tontine.prototype.dossierMembre = function (membreId) {
    var self = this, m = this.membre(membreId);
    if (!m) throw new TontineError('Membre introuvable.');
    var suivi = this.suiviMembre(membreId);
    var paiements = this.d.versements.filter(function (v) {
      var p = self.d.parts.find(function (x) { return x.id === v.part_id; });
      return p.membre_id === membreId;
    }).map(function (v) {
      var d = self.versement(v.id);
      d.ponctualite = self.ponctualite(v);
      d.rappels = (v.rappels || []).slice();
      d.date_limite = self.dateLimite(self.groupe(d.groupe_id), v.echeance);
      return d;
    }).sort(function (a, b) { return a.groupe_id - b.groupe_id || a.echeance - b.echeance; });
    var compte = function (code) { return paiements.filter(function (x) { return x.ponctualite.code === code; }).length; };
    var payes = compte('A_TEMPS') + compte('RETARD');
    var statut = suivi.parts.some(function (x) { return x.statut !== 'CLOTURE'; }) ? 'ACTIF' : (suivi.parts.length ? 'ANCIEN' : 'SANS_GROUPE');
    return {
      membre: m, statut: statut, statut_libelle: STATUTS_MEMBRE[statut], suivi: suivi, paiements: paiements,
      observations: this.observations(membreId),
      ponctualite: { a_temps: compte('A_TEMPS'), en_retard_payes: compte('RETARD'), impayes: compte('EN_RETARD'), a_payer: compte('A_PAYER'),
                     taux_a_temps: payes ? Math.round(100 * compte('A_TEMPS') / payes) : null,
                     rappels: paiements.reduce(function (s, x) { return s + x.rappels.length; }, 0) }
    };
  };

  /* ---------- suivi individuel d'un membre ---------- */
  Tontine.prototype.suiviMembre = function (membreId) {
    var self = this, m = this.membre(membreId);
    if (!m) throw new TontineError('Membre introuvable.');
    var lignes = this.d.parts.filter(function (p) { return p.membre_id === membreId; }).map(function (p) {
      var g = self.groupe(p.groupe_id);
      var vers = self.d.versements.filter(function (v) { return v.part_id === p.id; });
      var paye = vers.filter(function (v) { return v.statut === 'PAYE'; }).reduce(function (s, v) { return s + v.montant; }, 0);
      var du = vers.filter(function (v) { return v.echeance < g.tour_courant || v.statut === 'PAYE'; }).reduce(function (s, v) { return s + v.montant; }, 0);
      var retard = vers.filter(function (v) { return v.statut === 'IMPAYE' && v.echeance < g.tour_courant; });
      var rem = self._remise(p.id, p.position);
      var cot = g.mise_reference * p.quarts / QUARTS_CASE;
      return {
        part_id: p.id, groupe_id: g.id, code: g.code, nom_groupe: g.nom, statut: g.statut, tour: p.position,
        mois: self.moisDuTour(g, p.position), pct: p.quarts * 25, tarif: g.mise_reference, cotisation: cot,
        engagement_total: cot * NB_POSITIONS, verse: paye, du_a_ce_jour: du,
        retards: retard.length, montant_retards: retard.reduce(function (s, v) { return s + v.montant; }, 0),
        mois_payes: vers.filter(function (v) { return v.statut === 'PAYE'; }).length, mois_ouverts: vers.length,
        lot: cot * NB_POSITIONS,
        etat_lot: rem ? 'Reçu le ' + String(rem.date_remise).split('-').reverse().join('/') : (g.statut !== 'OUVERT' && p.position < g.tour_courant ? 'À remettre'
                 : g.statut === 'EN_COURS' && p.position === g.tour_courant ? 'Ce mois-ci' : 'En attente'),
        lot_recu: rem ? rem.montant : 0
      };
    }).sort(function (a, b) { return a.groupe_id - b.groupe_id || a.tour - b.tour; });
    var somme = function (k) { return lignes.reduce(function (s, l) { return s + l[k]; }, 0); };
    var du = somme('du_a_ce_jour'), verse = somme('verse');
    return {
      membre: m, parts: lignes,
      total: {
        nb_parts: lignes.length, groupes: lignes.map(function (l) { return l.groupe_id; }).filter(function (x, i, t) { return t.indexOf(x) === i; }).length,
        engagement_pct: somme('pct'), cotisation_mensuelle: somme('cotisation'), engagement_total: somme('engagement_total'),
        verse: verse, du_a_ce_jour: du, retards: somme('retards'), montant_retards: somme('montant_retards'),
        taux: du ? Math.round(100 * verse / du) : null, lots_prevus: somme('lot'), lots_recus: somme('lot_recu')
      }
    };
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

  /** 250000 → « deux cent cinquante mille » (montants des fiches de remise) */
  function nombreEnLettres(n) {
    n = Math.floor(Math.abs(n));
    if (n === 0) return 'zéro';
    var u = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize',
             'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
    var d = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
    function moinsDeCent(x, final) {
      if (x < 20) return u[x];
      var dz = Math.floor(x / 10), un = x % 10;
      if (dz === 7 || dz === 9) return d[dz] + (dz === 7 && un === 1 ? ' et ' : '-') + u[10 + un];
      if (un === 0) return d[dz] + (dz === 8 && final ? 's' : '');
      return d[dz] + (un === 1 && dz < 8 ? ' et un' : '-' + u[un]);
    }
    function moinsDeMille(x, final) {
      var c = Math.floor(x / 100), r = x % 100, t = '';
      if (c) t = (c > 1 ? u[c] + ' ' : '') + 'cent' + (c > 1 && r === 0 && final ? 's' : '');
      if (r) t += (t ? ' ' : '') + moinsDeCent(r, final);
      return t;
    }
    var parts = [], milliards = Math.floor(n / 1e9), millions = Math.floor(n / 1e6) % 1000, milliers = Math.floor(n / 1000) % 1000, reste = n % 1000;
    if (milliards) parts.push(moinsDeMille(milliards, true) + ' milliard' + (milliards > 1 ? 's' : ''));
    if (millions) parts.push(moinsDeMille(millions, true) + ' million' + (millions > 1 ? 's' : ''));
    if (milliers) parts.push(milliers === 1 ? 'mille' : moinsDeMille(milliers, false) + ' mille');
    if (reste) parts.push(moinsDeMille(reste, true));
    return parts.join(' ');
  }

  var api = {
    Tontine: Tontine, TontineError: TontineError, etatVide: etatVide,
    FORMULES: FORMULES, formule: formule, TARIFS_DEFAUT: TARIFS_DEFAUT, MOIS: MOIS,
    RAPPORTS: RAPPORTS, MODES: MODES, STATUTS_MEMBRE: STATUTS_MEMBRE, CONFIANCE: CONFIANCE,
    CATEGORIES_OBS: CATEGORIES_OBS, APPRECIATIONS: APPRECIATIONS, melanger: melanger, nombreEnLettres: nombreEnLettres, NB_POSITIONS: NB_POSITIONS, QUARTS_CASE: QUARTS_CASE
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.TontineCore = api;
})(this);
