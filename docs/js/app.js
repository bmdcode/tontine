/* =====================================================================
 *  GESTIONNAIRE DE TONTINES — app.js (interface)
 *  Une seule page, 6 vues : tableau, membres, groupes, paiements,
 *  rapports, parametres. Navigation par #ancre.
 * ===================================================================== */
(function () {
  'use strict';

  var C = window.TontineCore;
  var CLE = 'tontine.donnees.v1';
  var CLE_SAUVEGARDE = 'tontine.derniere_sauvegarde';

  /* ---------- stockage ---------- */
  var stockageOk = true;
  function charger() {
    try {
      var brut = localStorage.getItem(CLE);
      return brut ? C.Tontine.valider(JSON.parse(brut)) : null;
    } catch (e) {
      stockageOk = false;
      return null;
    }
  }
  function enregistrer(d) {
    try { localStorage.setItem(CLE, JSON.stringify(d)); }
    catch (e) { stockageOk = false; toast("Impossible d'enregistrer dans ce navigateur. Exportez vos données !", 'erreur'); }
  }
  var T = new C.Tontine(charger(), enregistrer);

  /* ---------- état de l'interface ---------- */
  var ui = { membreVu: null, editionMembre: false, editionRemise: null, recherche: '', groupeId: null, payGroupe: null, payEch: null, rapType: 'IMPAYES', rapGroupe: null };

  /* ---------- outils ---------- */
  function e(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fcfa(m) { return Math.round(m || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F'; }
  function dateFr(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; }
  function $(sel, racine) { return (racine || document).querySelector(sel); }
  function $$(sel, racine) { return Array.prototype.slice.call((racine || document).querySelectorAll(sel)); }

  function toast(msg, type) {
    var t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    var zone = $('#toasts');
    while (zone.children.length >= 3) zone.firstChild.remove();
    zone.appendChild(t);
    setTimeout(function () { t.remove(); }, type === 'erreur' ? 6000 : 3500);
  }

  /** Exécute une action métier : affiche l'erreur éventuelle, puis redessine */
  function agir(fn, succes) {
    try {
      var r = fn();
      if (succes) toast(typeof succes === 'function' ? succes(r) : succes, 'succes');
      rendre();
      return r;
    } catch (err) {
      if (err instanceof C.TontineError) toast(err.message, 'erreur');
      else { console.error(err); toast('Erreur inattendue : ' + err.message, 'erreur'); }
    }
  }

  var LIB_STATUT = { OUVERT: 'Ouvert', EN_COURS: 'En cours', CLOTURE: 'Clôturé' };
  function badge(statut) { return '<span class="badge ' + statut + '">' + LIB_STATUT[statut] + '</span>'; }

  function optionsGroupes(liste, choisi, avecTous) {
    var h = avecTous ? '<option value="">Tous les groupes</option>' : '';
    liste.forEach(function (g) {
      h += '<option value="' + g.id + '"' + (g.id === choisi ? ' selected' : '') + '>' + e(g.code) +
           (g.statut === 'EN_COURS' ? ' — échéance ' + g.tour_courant + '/10' : g.statut === 'OUVERT' ? ' — rempli à ' + g.remplissage + ' %' : ' — clôturé') +
           '</option>';
    });
    return h;
  }

  /* =================================================================
   *  VUE 1 : TABLEAU DE BORD
   * ================================================================= */
  function vueTableau() {
    var groupes = T.listeGroupes();
    var n = { OUVERT: 0, EN_COURS: 0, CLOTURE: 0 };
    groupes.forEach(function (g) { n[g.statut]++; });
    var restant = T.rapport('RESTANT'), retards = T.rapport('RETARDS'), impayes = T.rapport('IMPAYES');

    var h = '<h2>Tableau de bord</h2>';
    if (!T.d.membres.length) {
      h += '<div class="alerte">Bienvenue ! Commencez par <a href="#membres">inscrire les membres</a> et leur attribuer une formule. ' +
           'Les groupes de dix se créent automatiquement. Pour découvrir l\'outil, vous pouvez aussi charger des ' +
           '<a href="#parametres">données d\'exemple</a>.</div>';
    }
    h += rappelSauvegarde();
    h += '<div class="chiffres">' +
      chiffre('Membres inscrits', T.d.membres.length) +
      chiffre('Groupes ouverts · en cours · clôturés', n.OUVERT + ' · ' + n.EN_COURS + ' · ' + n.CLOTURE) +
      chiffre('Restant à recouvrer ce mois', fcfa(restant.total), restant.total ? 'ko' : 'ok') +
      chiffre('Retards cumulés', fcfa(retards.total), retards.total ? 'ko' : 'ok') +
      '</div>';

    h += '<div class="carte"><div class="carte-tete"><h3>Caisse du mois — groupes en cours</h3></div><div class="tableau-wrap"><table>' +
         '<thead><tr><th>Groupe</th><th class="c">Échéance</th><th class="d">Attendu</th><th class="d">Encaissé</th><th class="d">Restant</th><th>Progression</th><th></th></tr></thead><tbody>';
    restant.lignes.forEach(function (s) {
      var pct = s.attendu ? Math.round(100 * s.encaisse / s.attendu) : 0;
      h += '<tr><td><strong>' + e(s.groupe) + '</strong></td><td class="c">' + s.echeance + '/10</td>' +
           '<td class="d">' + fcfa(s.attendu) + '</td><td class="d">' + fcfa(s.encaisse) + '</td>' +
           '<td class="d"' + (s.restant ? ' style="color:var(--rouge);font-weight:600"' : '') + '>' + fcfa(s.restant) + '</td>' +
           '<td><div class="barre"><span style="width:' + pct + '%"></span></div></td>' +
           '<td class="d"><button class="btn petit" data-action="aller-paiements" data-id="' + s.groupe_id + '">Encaisser</button></td></tr>';
    });
    if (!restant.lignes.length) h += '<tr><td colspan="7" class="vide">Aucun groupe en cours. Remplissez un groupe à 100 % puis démarrez-le.</td></tr>';
    h += '</tbody></table></div></div>';

    h += '<div class="carte"><div class="carte-tete"><h3>Impayés de l\'échéance en cours</h3>' +
         '<a class="btn petit" href="#rapports">Toutes les listes</a></div><div class="tableau-wrap"><table>' +
         '<thead><tr><th>Groupe</th><th class="c">Tour</th><th>Membre</th><th>Téléphone</th><th class="c">Part</th><th class="d">Montant</th></tr></thead><tbody>';
    impayes.lignes.slice(0, 12).forEach(function (l) {
      h += '<tr><td>' + e(l.groupe) + '</td><td class="c">' + l.position + '</td><td>' + e(l.membre) + '</td><td>' +
           lienTel(l.telephone) + '</td><td class="c">' + l.pct + ' %</td><td class="d">' + fcfa(l.montant) + '</td></tr>';
    });
    if (!impayes.lignes.length) h += '<tr><td colspan="6" class="vide">Aucun impayé.</td></tr>';
    if (impayes.lignes.length > 12) h += '<tr><td colspan="6" class="vide">… et ' + (impayes.lignes.length - 12) + ' autre(s).</td></tr>';
    h += '</tbody></table></div></div>';
    return h;
  }

  function chiffre(lib, val, cls) {
    return '<div class="chiffre"><div class="lib">' + e(lib) + '</div><div class="val ' + (cls || '') + '">' + e(val) + '</div></div>';
  }
  function lienTel(t) { return '<a href="tel:' + e(t) + '">' + e(t) + '</a>'; }

  function rappelSauvegarde() {
    if (!stockageOk) return '<div class="alerte attention">Ce navigateur bloque l\'enregistrement (navigation privée ?). Vos données seront perdues à la fermeture : exportez-les dans Paramètres.</div>';
    if (!T.d.membres.length) return '';
    var der = localStorage.getItem(CLE_SAUVEGARDE);
    var jours = der ? (Date.now() - Number(der)) / 86400000 : Infinity;
    if (jours < 7) return '';
    return '<div class="alerte attention no-print">' + (der ? 'Dernière sauvegarde il y a ' + Math.floor(jours) + ' jours.' : 'Aucune sauvegarde exportée pour le moment.') +
           ' Les données ne sont que dans ce navigateur : <a href="#parametres">exporter une sauvegarde</a>.</div>';
  }

  /* =================================================================
   *  VUE 2 : MEMBRES (Module A)
   * ================================================================= */
  function selectFormule(nom, avecVide) {
    var h = '<select name="' + nom + '">' + (avecVide ? '<option value="0">— attribuer plus tard —</option>' : '');
    C.FORMULES.forEach(function (f) { h += '<option value="' + f.quarts + '">' + e(f.libelle) + '</option>'; });
    return h + '</select>';
  }

  function vueMembres() {
    var h = '<h2>Membres</h2><div class="grille-2"><div>';
    h += '<form class="carte" data-form="inscrire"><div class="carte-tete"><h3>Inscrire un membre</h3></div><div class="carte-corps">' +
         '<div class="champ"><label for="f-nom">Nom</label><input id="f-nom" name="nom" required autocomplete="off"></div>' +
         '<div class="champ"><label for="f-prenom">Prénom</label><input id="f-prenom" name="prenom" required autocomplete="off"></div>' +
         champsContact({}) +
         '<div class="champ"><label>Formule de parts</label>' + selectFormule('quarts', true) +
         '<div class="aide">Mise de référence : ' + fcfa(T.mise()) + ' par échéance pour une part entière.</div></div>' +
         '<button class="btn plein large">Enregistrer</button></div></form>';

    var m = ui.membreVu ? T.membre(ui.membreVu) : null;
    if (m && ui.editionMembre) {
      h += '<form class="carte" data-form="modifier-membre" style="border-color:var(--vert-moyen)"><div class="carte-tete"><h3>Modifier la fiche n° ' + m.id + '</h3></div><div class="carte-corps">' +
           '<div class="champ"><label>Nom</label><input name="nom" required value="' + e(m.nom) + '"></div>' +
           '<div class="champ"><label>Prénom</label><input name="prenom" required value="' + e(m.prenom) + '"></div>' +
           champsContact(m) +
           '<div class="ligne-champs"><button class="btn plein">Enregistrer les modifications</button><button type="button" class="btn fixe" data-action="annuler-edition">Annuler</button></div>' +
           '</div></form>';
    } else if (m) {
      var parts = T.partsDuMembre(m.id);
      h += '<div class="carte"><div class="carte-tete"><h3>' + e(m.nom + ' ' + m.prenom) + '</h3>' +
           '<button class="btn petit" data-action="editer-membre">Modifier</button></div>' +
           '<div class="carte-corps"><p class="aide" style="margin:0 0 8px">Tél. ' + lienTel(m.telephone) +
           (m.telephone2 ? ' · ' + lienTel(m.telephone2) : '') + (m.cni ? ' · CNI ' + e(m.cni) : ' · CNI non renseignée') + '</p><ul class="liste">';
      parts.forEach(function (p) {
        h += '<li><span><a href="#groupes" data-action="voir-groupe" data-id="' + p.groupe_id + '">' + e(p.code) + '</a> · tour ' +
             p.position + ' · ' + p.quarts * 25 + ' %</span><span class="aide">' + e(p.etat) + '</span></li>';
      });
      if (!parts.length) h += '<li class="aide">Aucune part pour le moment.</li>';
      h += '</ul></div><form class="carte-pied" data-form="attribuer"><div style="flex:1 1 200px">' + selectFormule('quarts') + '</div>' +
           '<button class="btn plein">Attribuer</button></form></div>';
    }
    h += '</div><div class="carte"><div class="carte-tete"><input type="search" id="recherche" placeholder="Rechercher : nom, téléphone ou n° CNI" value="' +
         e(ui.recherche) + '" style="max-width:420px"></div><div class="tableau-wrap"><table>' +
         '<thead><tr><th>#</th><th>Nom et prénom</th><th>Téléphone</th><th>Inscrit le</th><th class="c">Parts</th><th class="c">Engagement</th><th></th></tr></thead>' +
         '<tbody id="corps-membres">' + lignesMembres() + '</tbody></table></div></div></div>';
    return h;
  }

  function champsContact(m) {
    return '<div class="champ"><label>Téléphone</label><input name="telephone" required inputmode="tel" placeholder="77 000 00 00" autocomplete="off" value="' + e(m.telephone || '') + '"></div>' +
      '<div class="champ"><label>2e téléphone (facultatif)</label><input name="telephone2" inputmode="tel" autocomplete="off" value="' + e(m.telephone2 || '') + '"></div>' +
      '<div class="champ"><label>N° CNI (facultatif)</label><input name="cni" autocomplete="off" value="' + e(m.cni || '') + '"></div>';
  }

  function lignesMembres() {
    var liste = T.listeMembres(ui.recherche), h = '';
    liste.forEach(function (m) {
      h += '<tr class="cliquable' + (m.id === ui.membreVu ? ' choisi' : '') + '" data-action="voir-membre" data-id="' + m.id + '">' +
           '<td>' + m.id + '</td><td><strong>' + e(m.nom) + '</strong> ' + e(m.prenom) + (m.cni ? '<br><span class="aide">CNI ' + e(m.cni) + '</span>' : '') + '</td>' +
           '<td>' + e(m.telephone) + (m.telephone2 ? '<br><span class="aide">' + e(m.telephone2) + '</span>' : '') + '</td>' +
           '<td>' + dateFr(m.date_inscription) + '</td><td class="c">' + m.nb_parts + '</td><td class="c">' + m.engagement + ' %</td>' +
           '<td class="d">' + (m.nb_parts ? '' : '<button class="btn petit danger" data-action="supprimer-membre" data-id="' + m.id + '">Supprimer</button>') + '</td></tr>';
    });
    return h || '<tr><td colspan="7" class="vide">Aucun membre.</td></tr>';
  }

  function messagePlaces(places, quarts) {
    return 'Parts attribuées :\n' + places.map(function (p) { return '• Groupe ' + p.code + ', tour ' + p.position + ' (' + quarts * 25 + ' %)'; }).join('\n');
  }

  /* =================================================================
   *  VUE 3 : GROUPES DE DIX (Module B)
   * ================================================================= */
  function vueGroupes() {
    var groupes = T.listeGroupes();
    if (!T.groupe(ui.groupeId)) ui.groupeId = groupes.length ? groupes[0].id : null;
    var h = '<h2>Groupes de dix</h2><div class="puces">';
    groupes.forEach(function (g) {
      h += '<button class="puce' + (g.id === ui.groupeId ? ' actif' : '') + '" data-action="voir-groupe" data-id="' + g.id + '"><strong>' + e(g.code) +
           ' ' + badge(g.statut) + '</strong><small>' +
           (g.statut === 'OUVERT' ? 'Rempli à ' + g.remplissage + ' %' : g.statut === 'EN_COURS' ? 'Échéance ' + g.tour_courant + '/10' : 'Terminé') + '</small></button>';
    });
    h += '<button class="puce" data-action="nouveau-groupe"><strong>+ Nouveau</strong><small>groupe vide</small></button></div>';
    if (!ui.groupeId) return h + '<div class="alerte">Aucun groupe. Ils sont créés automatiquement lors de l\'attribution des parts aux membres.</div>';

    var g = T.groupe(ui.groupeId), lignes = T.tableauGroupe(g.id);
    h += '<div class="carte"><div class="carte-tete"><div><h3 style="display:inline">' + e(g.code) + '</h3> ' + badge(g.statut) +
         ' <span class="aide">Mise ' + fcfa(g.mise_reference) + ' · lot d\'une case ' + fcfa(g.mise_reference * 10) + '</span></div><div>';
    if (g.statut !== 'CLOTURE' && (g.statut === 'OUVERT' || g.tour_courant <= C.NB_POSITIONS - 2)) {
      h += '<button class="btn" data-action="tirage" data-id="' + g.id + '" title="' +
           (g.statut === 'OUVERT' ? 'Tirer au sort l\'ordre des 10 tours' : 'Tirer au sort les tours ' + (g.tour_courant + 1) + ' à 10') + '">🎲 Tirage au sort</button> ';
    }
    if (g.statut === 'OUVERT') {
      h += '<button class="btn plein" data-action="demarrer" data-id="' + g.id + '">Démarrer le groupe</button>';
      if (!lignes.some(function (l) { return l.quarts; })) h += ' <button class="btn danger" data-action="supprimer-groupe" data-id="' + g.id + '">Supprimer</button>';
    } else if (g.statut === 'EN_COURS') {
      h += '<button class="btn plein" data-action="aller-paiements" data-id="' + g.id + '">Encaisser l\'échéance ' + g.tour_courant + '</button>';
    }
    h += '</div></div><div class="tableau-wrap"><table><thead><tr><th class="c" style="width:60px">Tour</th><th>Titulaire(s)</th><th class="c">Rempli</th><th class="d">Lot</th><th>État</th></tr></thead><tbody>';
    lignes.forEach(function (l) {
      var cls = { 'Reçu': 'recu', 'Bénéficiaire du mois': 'courant', 'À compléter': 'a-completer' }[l.etat] || '';
      var tit = l.titulaires.map(function (t) {
        return '<span class="titulaire">' + e(t.nom) + ' <span class="pct">' + t.quarts * 25 + ' %</span>' +
               (g.statut === 'OUVERT' ? '<button class="lien-x" title="Retirer cette part" data-action="retirer-part" data-g="' + g.id + '" data-m="' + t.membre_id + '">×</button>' : '') + '</span>';
      }).join('') || '<span class="libre">— libre —</span>';
      h += '<tr class="' + cls + '"><td class="c"><strong>' + l.position + '</strong></td><td>' + tit + '</td><td class="c">' + l.quarts * 25 +
           ' %</td><td class="d">' + fcfa(l.lot) + '</td><td>' + e(l.etat) + '</td></tr>';
    });
    h += '</tbody></table></div></div>';

    if (g.statut !== 'CLOTURE') {
      var min = g.statut === 'EN_COURS' ? g.tour_courant : 1, opts = '<option value="">—</option>';
      for (var p = min; p <= C.NB_POSITIONS; p++) opts += '<option value="' + p + '">' + p + '</option>';
      h += '<div class="grille-2" style="grid-template-columns:1fr 1fr"><form class="carte" data-form="permuter"><div class="carte-tete"><h3>Permutation des tours</h3></div><div class="carte-corps">' +
           '<div class="ligne-champs"><div><label>Tour A</label><select name="a" required>' + opts + '</select></div>' +
           '<div><label>Tour B</label><select name="b" required>' + opts + '</select></div>' +
           '<div><label>Tour C (facultatif)</label><select name="c">' + opts + '</select></div></div>' +
           '<p class="aide">2 tours : A ↔ B. 3 tours : rotation A → B → C → A. Les tours déjà levés ne sont pas proposés.</p>' +
           '<button class="btn plein">Permuter</button></div></form>';
      var hist = T.historiquePermutations(g.id);
      h += '<div class="carte"><div class="carte-tete"><h3>Historique des permutations</h3></div><div class="carte-corps"><ul class="liste">' +
           (hist.slice(0, 15).map(function (x) { return '<li><span>' + e(x.description) + '</span><span class="aide">' + e(dateFr(x.date_operation) + x.date_operation.slice(10)) + '</span></li>'; }).join('') ||
            '<li class="aide">Aucune opération.</li>') + '</ul></div></div></div>';

      // remplacement d'un titulaire
      var dansGroupe = [], optsParts = '';
      lignes.forEach(function (l) {
        l.titulaires.forEach(function (t) {
          dansGroupe.push(t.membre_id);
          var part = T.d.parts.find(function (x) { return x.groupe_id === g.id && x.membre_id === t.membre_id; });
          optsParts += '<option value="' + part.id + '">Tour ' + l.position + ' — ' + e(t.nom) + ' (' + t.quarts * 25 + ' %)</option>';
        });
      });
      var optsMembres = '<option value="">— choisir —</option>';
      T.listeMembres().forEach(function (m) {
        if (dansGroupe.indexOf(m.id) < 0) optsMembres += '<option value="' + m.id + '">' + e(m.nom + ' ' + m.prenom + ' · ' + m.telephone) + '</option>';
      });
      if (optsParts) {
        h += '<form class="carte" data-form="remplacer"><div class="carte-tete"><h3>Remplacer un titulaire</h3></div><div class="carte-corps">' +
             '<div class="ligne-champs"><div style="flex:1 1 240px"><label>Part à céder</label><select name="part" required>' + optsParts + '</select></div>' +
             '<div style="flex:1 1 240px"><label>Nouveau titulaire (déjà inscrit)</label><select name="membre" required>' + optsMembres + '</select></div>' +
             '<div class="fixe"><button class="btn plein">Remplacer</button></div></div>' +
             '<p class="aide">En cas de départ ou de cession : le nouveau titulaire reprend la part, son tour et les cotisations. Inscrivez-le d\'abord dans Membres.</p></div></form>';
      }
    }
    return h;
  }

  /* =================================================================
   *  VUE 4 : PAIEMENTS (Module C)
   * ================================================================= */
  function vuePaiements() {
    var enCours = T.listeGroupes('EN_COURS');
    var h = '<h2>Paiements</h2>';
    if (!enCours.length) return h + '<div class="alerte">Aucun groupe en cours. Remplissez un groupe à 100 % puis démarrez-le depuis <a href="#groupes">Groupes de dix</a>.</div>';
    if (!enCours.some(function (g) { return g.id === ui.payGroupe; })) { ui.payGroupe = enCours[0].id; ui.payEch = null; }
    var g = T.groupe(ui.payGroupe), tour = g.tour_courant;
    if (!ui.payEch || ui.payEch > tour) ui.payEch = tour;
    var ech = ui.payEch, lignes = T.versementsEcheance(g.id, ech);
    var attendu = 0, encaisse = 0;
    lignes.forEach(function (l) { attendu += l.montant; if (l.statut === 'PAYE') encaisse += l.montant; });

    var optsEch = '';
    for (var i = 1; i <= tour; i++) optsEch += '<option value="' + i + '"' + (i === ech ? ' selected' : '') + '>' + i + (i === tour ? ' (en cours)' : '') + '</option>';
    h += '<div class="ligne-champs no-print" style="max-width:560px;margin-bottom:16px"><div><label>Groupe en cours</label><select id="pay-groupe">' +
         optionsGroupes(enCours, g.id) + '</select></div><div class="fixe" style="width:150px"><label>Échéance</label><select id="pay-ech">' + optsEch + '</select></div></div>';

    var benef = T.tableauGroupe(g.id)[tour - 1].titulaires.map(function (t) {
      return e(t.nom) + ' — ' + fcfa(g.mise_reference * 10 * t.quarts / 4);
    }).join('<br>');
    h += '<div class="chiffres">' + chiffre('Attendu', fcfa(attendu)) + chiffre('Encaissé', fcfa(encaisse), 'ok') +
         chiffre('Restant', fcfa(attendu - encaisse), attendu - encaisse ? 'ko' : 'ok') +
         '<div class="chiffre"><div class="lib">Bénéficiaire(s) du tour ' + tour + '</div><div style="font-weight:600">' + benef + '</div></div></div>';

    h += '<div class="carte"><div class="tableau-wrap"><table><thead><tr><th style="width:36px"><input type="checkbox" id="tout" aria-label="Tout cocher" style="min-height:0;width:auto"></th>' +
         '<th class="c">Tour</th><th>Membre</th><th class="mm">Téléphone</th><th class="c mm">Part</th><th class="d">Montant</th><th class="c">Statut</th><th class="mm">Payé le</th></tr></thead><tbody>';
    lignes.forEach(function (l) {
      var paye = l.statut === 'PAYE';
      h += '<tr class="' + (paye ? 'paye' : 'impaye') + '"><td><input type="checkbox" class="case" value="' + l.id + '" style="min-height:0;width:auto"></td>' +
           '<td class="c">' + l.position + '</td><td>' + e(l.membre) + '</td><td class="mm">' + lienTel(l.telephone) + '</td><td class="c mm">' + l.pct + ' %</td>' +
           '<td class="d">' + fcfa(l.montant) + '</td><td class="c"><button class="btn petit statut-btn' + (paye ? ' plein' : ' danger') + '" data-action="basculer" data-id="' + l.id +
           '" data-statut="' + l.statut + '">' + (paye ? '✔ Payé' : '✘ Impayé') + '</button></td><td class="mm">' + dateFr(l.date_paiement) + '</td></tr>';
    });
    h += '</tbody></table></div><div class="carte-pied no-print">' +
         '<button class="btn plein" data-action="marquer" data-statut="PAYE">✔ Marquer la sélection Payé</button>' +
         '<button class="btn danger" data-action="marquer" data-statut="IMPAYE">✘ Marquer Impayé</button>' +
         '<span class="aide">Touchez le bouton de statut d\'une ligne pour la basculer.</span></div></div>';
    h += carteRemises(g, ech);
    if (ech === tour) {
      h += '<div class="no-print" style="text-align:right"><button class="btn sombre" data-action="cloturer" data-id="' + g.id + '">Clôturer l\'échéance ' + tour + ' et passer au tour suivant</button></div>';
    }
    return h;
  }

  function selectModes(choisi) {
    var h = '<select name="mode">';
    Object.keys(C.MODES).forEach(function (k) { h += '<option value="' + k + '"' + (k === choisi ? ' selected' : '') + '>' + e(C.MODES[k]) + '</option>'; });
    return h + '</select>';
  }

  /** Carte « Remise du lot » : mode, référence et date pour chaque bénéficiaire du tour */
  function carteRemises(g, ech) {
    var benef = T.beneficiaires(g.id, ech);
    var h = '<div class="carte"><div class="carte-tete"><h3>Remise du lot — tour ' + ech + '</h3><span class="aide">Mode et référence du paiement remis à chaque bénéficiaire</span></div>';
    benef.forEach(function (b) {
      var r = b.remise;
      h += '<div class="carte-corps" style="border-top:1px solid var(--bord)">' +
           '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px"><div><strong>' + e(b.membre) + '</strong> · ' + b.pct + ' % · <strong>' + fcfa(b.lot) + '</strong><br>' +
           '<span class="aide">Tél. ' + lienTel(b.telephone) + (b.telephone2 ? ' · ' + lienTel(b.telephone2) : '') + (b.cni ? ' · CNI ' + e(b.cni) : '') + '</span></div>' +
           (r ? '<span class="badge EN_COURS" style="align-self:flex-start">✔ Lot remis le ' + dateFr(r.date_remise) + '</span>'
              : '<span class="badge" style="align-self:flex-start;background:var(--ambre);color:#7a5b00">À remettre</span>') + '</div>';
      if (r && ui.editionRemise !== r.id) {
        h += '<p style="margin:0">' + e(C.MODES[r.mode]) + (r.reference ? ' · Réf. <strong>' + e(r.reference) + '</strong>' : '') + (r.observation ? ' · ' + e(r.observation) : '') + '</p>' +
             '<div class="no-print" style="margin-top:8px;display:flex;gap:8px"><button class="btn petit" data-action="editer-remise" data-id="' + r.id + '">Corriger</button>' +
             '<button class="btn petit danger" data-action="annuler-remise" data-id="' + r.id + '">Annuler la remise</button></div>';
      } else {
        h += '<form class="ligne-champs no-print" data-form="remise" data-part="' + b.part_id + '" data-ech="' + ech + '">' +
             '<div><label>Mode</label>' + selectModes(r ? r.mode : 'WAVE') + '</div>' +
             '<div style="flex:1 1 170px"><label>Référence (n° transaction, chèque…)</label><input name="reference" value="' + e(r ? r.reference || '' : '') + '"></div>' +
             '<div style="flex:0 1 160px"><label>Date</label><input type="date" name="date" value="' + e(r ? r.date_remise : aujourdhuiIso()) + '"></div>' +
             '<div style="flex:1 1 170px"><label>Observation</label><input name="observation" value="' + e(r ? r.observation || '' : '') + '" placeholder="facultatif"></div>' +
             '<div class="fixe"><button class="btn plein">' + (r ? 'Enregistrer' : 'Valider la remise') + '</button>' +
             (r ? ' <button type="button" class="btn" data-action="annuler-edition-remise">Annuler</button>' : '') + '</div></form>';
      }
      h += '</div>';
    });
    if (!benef.length) h += '<div class="carte-corps vide">Aucun bénéficiaire pour ce tour.</div>';
    return h + '</div>';
  }

  function aujourdhuiIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* =================================================================
   *  VUE 5 : LISTES DE CONTRÔLE ET RAPPORTS
   * ================================================================= */
  var COLONNES = {
    detail: [['groupe', 'Groupe'], ['echeance', 'Échéance', 'c'], ['position', 'Tour', 'c'], ['membre', 'Membre'], ['telephone', 'Téléphone'], ['pct', 'Part', 'c', '%'], ['montant', 'Montant', 'd', 'F']],
    reception: [['groupe', 'Groupe'], ['position', 'Tour', 'c'], ['membre', 'Membre'], ['telephone', 'Téléphone'], ['pct', 'Part', 'c', '%'], ['etat', 'État'], ['remise', 'Remise du lot'], ['lot', 'Lot', 'd', 'F']],
    aRemettre: [['groupe', 'Groupe'], ['echeance', 'Tour', 'c'], ['membre', 'Bénéficiaire'], ['telephone', 'Téléphone'], ['cni', 'N° CNI'], ['pct', 'Part', 'c', '%'], ['lot', 'Lot à remettre', 'd', 'F']],
    remises: [['groupe', 'Groupe'], ['echeance', 'Tour', 'c'], ['membre', 'Bénéficiaire'], ['cni', 'N° CNI'], ['mode', 'Mode'], ['reference', 'Référence'], ['date_remise', 'Date'], ['lot', 'Montant', 'd', 'F']],
    restant: [['groupe', 'Groupe'], ['echeance', 'Échéance', 'c'], ['attendu', 'Attendu', 'd', 'F'], ['encaisse', 'Encaissé', 'd', 'F'], ['restant', 'Restant', 'd', 'F'], ['nb_impayes', 'Impayés', 'c']]
  };
  function colonnesDe(type) {
    if (type === 'RESTANT') return COLONNES.restant;
    if (type === 'A_REMETTRE') return COLONNES.aRemettre;
    if (type === 'REMISES') return COLONNES.remises;
    if (type === 'RECUS') return COLONNES.reception;
    if (type === 'NON_RECUS') return COLONNES.reception.filter(function (c) { return c[0] !== 'remise'; });
    return COLONNES.detail;
  }
  function valeurCellule(l, col) {
    var v = l[col[0]];
    if (col[3] === 'F') return fcfa(v);
    if (col[3] === '%') return v + ' %';
    if (col[0] === 'date_remise') return dateFr(v);
    return e(v);
  }

  function vueRapports() {
    var type = ui.rapType, r = T.rapport(type, ui.rapGroupe), cols = colonnesDe(type);
    var opts = '';
    Object.keys(C.RAPPORTS).forEach(function (k) { opts += '<option value="' + k + '"' + (k === type ? ' selected' : '') + '>' + e(C.RAPPORTS[k]) + '</option>'; });
    var h = '<h2>Listes de contrôle</h2>' +
      '<div class="ligne-champs no-print" style="margin-bottom:16px"><div style="flex:2 1 260px"><label>Liste</label><select id="rap-type">' + opts + '</select></div>' +
      '<div><label>Groupe</label><select id="rap-groupe">' + optionsGroupes(T.listeGroupes(), ui.rapGroupe, true) + '</select></div>' +
      '<div class="fixe"><button class="btn" data-action="export-csv">Exporter CSV</button> <button class="btn" data-action="imprimer">Imprimer</button></div></div>' +
      '<p class="imprime-titre"><strong>' + e(T.d.parametres.nom_tontine) + ' — ' + e(C.RAPPORTS[type]) + '</strong> · ' + dateFr(new Date().toISOString()) + '</p>' +
      '<div class="carte"><div class="tableau-wrap"><table><thead><tr>';
    cols.forEach(function (c) { h += '<th class="' + (c[2] || '') + '">' + c[1] + '</th>'; });
    h += '</tr></thead><tbody>';
    r.lignes.forEach(function (l) {
      h += '<tr class="' + (l.etat === 'Bénéficiaire du mois' ? 'courant' : '') + '">';
      cols.forEach(function (c) { h += '<td class="' + (c[2] || '') + '">' + valeurCellule(l, c) + '</td>'; });
      h += '</tr>';
    });
    if (!r.lignes.length) h += '<tr><td colspan="' + cols.length + '" class="vide">Aucune ligne.</td></tr>';
    h += '</tbody><tfoot><tr><td colspan="' + (cols.length - 2) + '">' + r.lignes.length + ' ligne(s)</td><td colspan="2" class="d">Total : ' + fcfa(r.total) + '</td></tr></tfoot></table></div></div>';
    return h;
  }

  function exporterCsv() {
    var r = T.rapport(ui.rapType, ui.rapGroupe), cols = colonnesDe(ui.rapType);
    var lignes = [cols.map(function (c) { return c[1]; })];
    r.lignes.forEach(function (l) { lignes.push(cols.map(function (c) { return l[c[0]]; })); });
    var csv = lignes.map(function (row) {
      return row.map(function (v) { v = String(v === null || v === undefined ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';');
    }).join('\r\n');
    telecharger('﻿' + csv, ui.rapType.toLowerCase() + '_' + new Date().toISOString().slice(0, 10) + '.csv', 'text/csv;charset=utf-8');
  }

  function telecharger(contenu, nom, type) {
    var url = URL.createObjectURL(new Blob([contenu], { type: type }));
    var a = document.createElement('a');
    a.href = url; a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* =================================================================
   *  VUE 6 : PARAMÈTRES ET SAUVEGARDES
   * ================================================================= */
  function vueParametres() {
    var der = localStorage.getItem(CLE_SAUVEGARDE);
    return '<h2>Paramètres</h2><div class="grille-2" style="grid-template-columns:1fr 1fr">' +
      '<form class="carte" data-form="parametres"><div class="carte-tete"><h3>Réglages</h3></div><div class="carte-corps">' +
      '<div class="champ"><label>Nom de la tontine</label><input name="nom" value="' + e(T.d.parametres.nom_tontine) + '"></div>' +
      '<div class="champ"><label>Mise de référence d\'une part entière (FCFA)</label><input name="mise" type="number" min="4" step="4" value="' + T.mise() + '">' +
      '<div class="aide">S\'applique aux nouveaux groupes ; un groupe garde la mise de sa création. Divisible par 4.</div></div>' +
      '<button class="btn plein">Enregistrer</button></div></form>' +
      '<div class="carte"><div class="carte-tete"><h3>Sauvegarde des données</h3></div><div class="carte-corps">' +
      '<p class="aide" style="margin-top:0">Les données restent dans ce navigateur, sur cet appareil. Exportez une sauvegarde après chaque séance et gardez-la sur une clé USB ou par e-mail.</p>' +
      '<p>' + (der ? 'Dernière sauvegarde : ' + new Date(Number(der)).toLocaleString('fr-FR') : 'Aucune sauvegarde exportée.') + '</p>' +
      '<div class="ligne-champs"><button class="btn plein fixe" data-action="exporter">Exporter (.json)</button>' +
      '<label class="btn fixe" style="margin:0;color:var(--vert)">Importer une sauvegarde<input type="file" id="import" accept=".json,application/json" hidden></label></div>' +
      '</div><div class="carte-pied"><button class="btn" data-action="exemple">Charger des données d\'exemple</button>' +
      '<button class="btn danger" data-action="effacer">Tout effacer</button></div></div></div>';
  }

  function donneesExemple() {
    var t = new C.Tontine(C.etatVide(), function () {});
    var noms = [['DIOP', 'Awa'], ['FALL', 'Moussa'], ['NDIAYE', 'Fatou'], ['SECK', 'Ibrahima'], ['SARR', 'Mariama'], ['GUEYE', 'Cheikh'],
                ['BA', 'Aminata'], ['SY', 'Ousmane'], ['KANE', 'Khady'], ['MBAYE', 'Modou'], ['DIENG', 'Astou'], ['FAYE', 'Pape'],
                ['NIANG', 'Rokhaya'], ['THIAM', 'Abdou'], ['CISSE', 'Ndeye'], ['SOW', 'Mamadou']];
    var formules = [4, 4, 4, 4, 4, 4, 4, 4, 2, 2, 1, 1, 1, 1, 2, 4];
    noms.forEach(function (n, i) {
      var id = t.ajouterMembre({ nom: n[0], prenom: n[1], telephone: '77 1' + String(i).padStart(2, '0') + ' 00 ' + String(10 + i),
                                 telephone2: i % 3 === 0 ? '78 2' + String(i).padStart(2, '0') + ' 11 22' : '',
                                 cni: i % 2 === 0 ? '1 751 1990 ' + String(10000 + i * 37) : '' });
      t.attribuer(id, formules[i]);
    });
    t.tirageAuSort(1);
    t.demarrerGroupe(1);
    var lot = function (ech, mode, ref) {
      t.beneficiaires(1, ech).forEach(function (b, k) { t.enregistrerRemise(b.part_id, ech, { mode: mode, reference: ref ? ref + k : '' }); });
    };
    var v = t.versementsEcheance(1, 1);
    t.marquer(v.map(function (x) { return x.id; }), 'PAYE');
    lot(1, 'WAVE', 'WV-2410-58321');
    t.cloturerEcheance(1);
    v = t.versementsEcheance(1, 2);
    t.marquer(v.slice(0, 9).map(function (x) { return x.id; }), 'PAYE');
    lot(2, 'ESPECES', '');
    t.cloturerEcheance(1);
    v = t.versementsEcheance(1, 3);
    t.marquer(v.slice(0, 6).map(function (x) { return x.id; }), 'PAYE');
    t.permuter(1, [5, 8]);
    t.d.parametres.nom_tontine = 'Tontine (exemple)';
    return t.d;
  }

  /* =================================================================
   *  ROUTAGE ET ÉVÉNEMENTS
   * ================================================================= */
  var VUES = { tableau: vueTableau, membres: vueMembres, groupes: vueGroupes, paiements: vuePaiements, rapports: vueRapports, parametres: vueParametres };

  function vueCourante() { var v = location.hash.slice(1); return VUES[v] ? v : 'tableau'; }

  function rendre() {
    var v = vueCourante();
    $('#vue').innerHTML = VUES[v]();
    $$('#nav a').forEach(function (a) { a.classList.toggle('actif', a.getAttribute('href') === '#' + v); });
    $('#nom-tontine').textContent = T.d.parametres.nom_tontine;
    $('#info-mise').textContent = 'Mise de référence : ' + fcfa(T.mise());
    document.title = T.d.parametres.nom_tontine + ' · Gestionnaire de Tontines';
  }

  function aller(vue) {
    if (location.hash === '#' + vue) rendre(); else location.hash = vue;
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', function () { rendre(); window.scrollTo(0, 0); });

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-action]');
    if (!el) return;
    var a = el.dataset.action, id = Number(el.dataset.id);
    switch (a) {
      case 'voir-membre':
        if (ev.target.closest('button')) return;
        ui.membreVu = id; ui.editionMembre = false; rendre(); break;
      case 'supprimer-membre':
        ev.stopPropagation();
        if (confirm('Supprimer définitivement ce membre ?')) agir(function () { T.supprimerMembre(id); if (ui.membreVu === id) ui.membreVu = null; }, 'Membre supprimé.');
        break;
      case 'editer-membre': ui.editionMembre = true; rendre(); break;
      case 'annuler-edition': ui.editionMembre = false; rendre(); break;
      case 'tirage':
        var gt = T.groupe(id);
        var txt = gt.statut === 'OUVERT'
          ? 'Tirer au sort l\'ordre de passage des 10 tours du groupe ' + gt.code + ' ?\nLes co-titulaires d\'une même case restent ensemble.'
          : 'Tirer au sort les tours ' + (gt.tour_courant + 1) + ' à 10 du groupe ' + gt.code + ' ?\nLes tours déjà levés et le tour en cours ne bougent pas.';
        if (confirm(txt)) agir(function () { return T.tirageAuSort(id); }, function (d) { return d; });
        break;
      case 'editer-remise': ui.editionRemise = id; rendre(); break;
      case 'annuler-edition-remise': ui.editionRemise = null; rendre(); break;
      case 'annuler-remise':
        if (confirm('Annuler cette remise ? Le lot repassera « à remettre ».')) agir(function () { T.annulerRemise(id); }, 'Remise annulée.');
        break;
      case 'voir-groupe':
        ev.preventDefault(); ui.groupeId = id; aller('groupes'); break;
      case 'nouveau-groupe':
        agir(function () { ui.groupeId = T.creerGroupe(); }, 'Groupe créé.'); break;
      case 'supprimer-groupe':
        if (confirm('Supprimer ce groupe vide ?')) agir(function () { T.supprimerGroupeVide(id); ui.groupeId = null; }, 'Groupe supprimé.');
        break;
      case 'demarrer':
        if (confirm('Démarrer ce groupe ? Plus aucune part ne pourra y être ajoutée. L\'échéance 1 sera ouverte.')) {
          agir(function () { T.demarrerGroupe(id); }, 'Groupe démarré : l\'échéance 1 est ouverte dans Paiements.');
        }
        break;
      case 'retirer-part':
        if (confirm('Retirer cette part du groupe ?')) agir(function () { T.retirerPart(Number(el.dataset.g), Number(el.dataset.m)); }, 'Part retirée.');
        break;
      case 'aller-paiements':
        ui.payGroupe = id; ui.payEch = null; aller('paiements'); break;
      case 'basculer':
        agir(function () { T.marquer([id], el.dataset.statut === 'PAYE' ? 'IMPAYE' : 'PAYE'); }); break;
      case 'marquer':
        var ids = $$('.case:checked').map(function (c) { return Number(c.value); });
        if (!ids.length) { toast('Cochez au moins une ligne.', 'erreur'); break; }
        agir(function () { T.marquer(ids, el.dataset.statut); }, ids.length + ' ligne(s) marquée(s).');
        break;
      case 'cloturer':
        var s = T.situation(id);
        var nonRemis = T.beneficiaires(id, s.echeance).filter(function (b) { return !b.remise; }).length;
        var msg = (nonRemis ? 'Attention : ' + nonRemis + ' lot(s) du tour ' + s.echeance + ' ne sont pas encore marqués comme remis.\n\n' : '') + (s.restant
          ? 'Il reste ' + fcfa(s.restant) + ' à recouvrer sur l\'échéance ' + s.echeance + '.\nClôturer quand même ? Les impayés passeront en RETARDS.'
          : 'Échéance ' + s.echeance + ' entièrement payée. Clôturer et passer au tour suivant ?');
        if (confirm(msg)) {
          agir(function () { ui.payEch = null; return T.cloturerEcheance(id); },
               function (suiv) { return suiv > C.NB_POSITIONS ? 'Groupe terminé : les 10 tours sont levés.' : 'Échéance ' + suiv + ' ouverte.'; });
        }
        break;
      case 'export-csv': exporterCsv(); break;
      case 'imprimer': window.print(); break;
      case 'exporter':
        telecharger(T.exporter(), 'tontine_sauvegarde_' + new Date().toISOString().slice(0, 10) + '.json', 'application/json');
        try { localStorage.setItem(CLE_SAUVEGARDE, String(Date.now())); } catch (x) { /* ignore */ }
        toast('Sauvegarde exportée.', 'succes'); rendre();
        break;
      case 'exemple':
        if (!T.d.membres.length || confirm('Remplacer toutes les données actuelles par des données d\'exemple ?')) {
          T = new C.Tontine(donneesExemple(), enregistrer); enregistrer(T.d);
          ui = Object.assign(ui, { membreVu: null, groupeId: null, payGroupe: null, payEch: null });
          toast('Données d\'exemple chargées.', 'succes'); aller('tableau');
        }
        break;
      case 'effacer':
        if (confirm('Effacer TOUTES les données de ce navigateur ? Cette action est définitive.') && confirm('Vraiment tout effacer ?')) {
          T = new C.Tontine(C.etatVide(), enregistrer); enregistrer(T.d);
          ui = Object.assign(ui, { membreVu: null, groupeId: null, payGroupe: null, payEch: null });
          toast('Données effacées.', 'succes'); aller('tableau');
        }
        break;
    }
  });

  document.addEventListener('submit', function (ev) {
    var f = ev.target, type = f.dataset.form;
    if (!type) return;
    ev.preventDefault();
    var v = function (n) { return f.elements[n] ? f.elements[n].value : ''; };
    var fiche = function () { return { nom: v('nom'), prenom: v('prenom'), telephone: v('telephone'), telephone2: v('telephone2'), cni: v('cni') }; };
    if (type === 'modifier-membre') {
      agir(function () { T.modifierMembre(ui.membreVu, fiche()); ui.editionMembre = false; }, 'Fiche mise à jour.');
    } else if (type === 'remplacer') {
      var nouveau = T.membre(Number(v('membre')));
      if (nouveau && confirm('Céder cette part à ' + nouveau.nom + ' ' + nouveau.prenom + ' ?')) {
        agir(function () { T.transfererPart(Number(v('part')), nouveau.id); }, 'Titulaire remplacé.');
      }
    } else if (type === 'remise') {
      agir(function () {
        T.enregistrerRemise(Number(f.dataset.part), Number(f.dataset.ech),
          { mode: v('mode'), reference: v('reference'), date: v('date'), observation: v('observation') });
        ui.editionRemise = null;
      }, 'Remise du lot enregistrée.');
    } else if (type === 'inscrire') {
      agir(function () {
        var id = T.ajouterMembre(fiche());
        ui.membreVu = id;
        var q = Number(v('quarts'));
        return q ? messagePlaces(T.attribuer(id, q), q) : 'Membre inscrit. Attribuez-lui une formule.';
      }, function (msg) { return msg; });
      var champ = $('#f-nom'); if (champ && !$('.toast.erreur')) champ.focus();
    } else if (type === 'attribuer') {
      var q = Number(v('quarts'));
      agir(function () { return messagePlaces(T.attribuer(ui.membreVu, q), q); }, function (msg) { return msg; });
    } else if (type === 'permuter') {
      if (confirm('Les membres concernés ont-ils donné leur accord ?')) {
        agir(function () { return T.permuter(ui.groupeId, [v('a'), v('b'), v('c')]); }, function (d) { return 'Permutation effectuée : ' + d; });
      }
    } else if (type === 'parametres') {
      agir(function () { T.setNom(v('nom')); T.setMise(v('mise')); }, 'Paramètres enregistrés.');
    }
  });

  document.addEventListener('input', function (ev) {
    if (ev.target.id === 'recherche') {
      ui.recherche = ev.target.value;
      $('#corps-membres').innerHTML = lignesMembres();
    }
  });

  document.addEventListener('change', function (ev) {
    var id = ev.target.id;
    if (id === 'pay-groupe') { ui.payGroupe = Number(ev.target.value); ui.payEch = null; rendre(); }
    else if (id === 'pay-ech') { ui.payEch = Number(ev.target.value); rendre(); }
    else if (id === 'rap-type') { ui.rapType = ev.target.value; rendre(); }
    else if (id === 'rap-groupe') { ui.rapGroupe = Number(ev.target.value) || null; rendre(); }
    else if (id === 'tout') { $$('.case').forEach(function (c) { c.checked = ev.target.checked; }); }
    else if (id === 'import') {
      var fichier = ev.target.files[0];
      if (!fichier) return;
      var lecteur = new FileReader();
      lecteur.onload = function () {
        try {
          var d = C.Tontine.valider(JSON.parse(lecteur.result));
          if (!confirm('Remplacer les données actuelles par cette sauvegarde (' + d.membres.length + ' membres, ' + d.groupes.length + ' groupes) ?')) return;
          T = new C.Tontine(d, enregistrer); enregistrer(T.d);
          ui = Object.assign(ui, { membreVu: null, groupeId: null, payGroupe: null, payEch: null });
          toast('Sauvegarde importée.', 'succes'); aller('tableau');
        } catch (err) {
          toast(err instanceof C.TontineError ? err.message : 'Fichier illisible : ce n\'est pas une sauvegarde valide.', 'erreur');
        }
      };
      lecteur.readAsText(fichier);
    }
  });

  rendre();
})();
