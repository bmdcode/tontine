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
  var D = window.TontineDocs;
  var ui = { afType: 'groupe', afGroupe: null, afFormat: 'statut', afTheme: 'corail', afTitre: '', membreVu: null, editionMembre: false, editionRemise: null, tirage: false, recherche: '', groupeId: null, payGroupe: null, payEch: null, rapType: 'IMPAYES', rapGroupe: null };

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

    h += carteRetards(null, 12);
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
    var h = '<select name="' + nom + '" data-apercu>' + (avecVide ? '<option value="">— attribuer plus tard —</option>' : '');
    C.FORMULES.forEach(function (f) { h += '<option value="' + f.cle + '">' + e(f.libelle) + '</option>'; });
    return h + '</select>';
  }

  function selectTarif(nom, choisi) {
    var h = '<select name="' + nom + '" data-apercu>';
    T.tarifs().forEach(function (t) {
      h += '<option value="' + t + '"' + (t === (choisi || T.mise()) ? ' selected' : '') + '>' + fcfa(t) + ' / mois → lot ' + fcfa(t * 10) + '</option>';
    });
    return h + '<option value="autre">Autre montant…</option></select>' +
      '<input name="' + nom + '_autre" type="number" min="4" step="4" placeholder="Montant d\'une part entière (F)" style="display:none;margin-top:6px">';
  }

  /** Bloc « Formule + Tarif + aperçu du montant » d'un formulaire d'attribution */
  function champsAttribution(avecVide) {
    return '<div class="champ"><label>Formule de parts</label>' + selectFormule('formule', avecVide) + '</div>' +
      '<div class="champ"><label>Tarif du groupe (part entière)</label>' + selectTarif('tarif') + '</div>' +
      '<p class="aide apercu" style="margin-top:-4px"></p>';
  }

  function tarifDuFormulaire(f) {
    var t = f.elements.tarif ? f.elements.tarif.value : '';
    return t === 'autre' ? Number(f.elements.tarif_autre.value) : Number(t);
  }

  /** Met à jour l'aperçu « cotisation / lot » et le champ « autre montant » */
  function majApercu(f) {
    var sel = f.elements.formule, tarif = f.elements.tarif, zone = $('.apercu', f);
    if (!tarif || !zone) return;
    f.elements.tarif_autre.style.display = tarif.value === 'autre' ? '' : 'none';
    var fo = C.formule(sel.value), mise = tarifDuFormulaire(f);
    if (!fo || !mise) { zone.textContent = ''; return; }
    var detail = fo.parts.map(function (q) { return q * 25 + ' % = ' + fcfa(mise * q / 4); });
    var cot = mise * fo.total / 4;
    zone.textContent = 'Cotisation : ' + fcfa(cot) + ' par mois' + (fo.groupes > 1 ? ' (' + detail.join(' + ') + ', dans ' + fo.groupes + ' groupes différents)' : '') +
      ' · lots à recevoir : ' + fcfa(cot * 10) + ' au total.';
  }

  function vueMembres() {
    var h = '<h2>Membres</h2><div class="grille-2"><div>';
    h += '<form class="carte" data-form="inscrire"><div class="carte-tete"><h3>Inscrire un membre</h3></div><div class="carte-corps">' +
         '<div class="champ"><label for="f-nom">Nom</label><input id="f-nom" name="nom" required autocomplete="off"></div>' +
         '<div class="champ"><label for="f-prenom">Prénom</label><input id="f-prenom" name="prenom" required autocomplete="off"></div>' +
         champsContact({}) +
         champsAttribution(true) +
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
        var gp = T.groupe(p.groupe_id);
        h += '<li><span><a href="#groupes" data-action="voir-groupe" data-id="' + p.groupe_id + '">' + e(p.code) + '</a> · tour ' +
             p.position + ' · ' + p.quarts * 25 + ' % de ' + fcfa(gp.mise_reference) + '</span><span class="aide">' + e(p.etat) + '</span></li>';
      });
      if (!parts.length) h += '<li class="aide">Aucune part pour le moment.</li>';
      var sv = T.suiviMembre(m.id).total;
      h += '</ul><div class="suivi">' +
           '<div><span>Parts</span><strong>' + sv.nb_parts + '</strong><small>' + sv.groupes + ' groupe(s)</small></div>' +
           '<div><span>Participation</span><strong>' + sv.engagement_pct + ' %</strong><small>' + fcfa(sv.cotisation_mensuelle) + ' / mois</small></div>' +
           '<div><span>Versé</span><strong>' + fcfa(sv.verse) + '</strong><small>' + (sv.taux === null ? 'aucune échéance' : sv.taux + ' % du dû') + '</small></div>' +
           '<div><span>Retards</span><strong' + (sv.montant_retards ? ' style="color:var(--rouge)"' : '') + '>' + fcfa(sv.montant_retards) + '</strong><small>' + sv.retards + ' échéance(s)</small></div>' +
           '<div><span>Lots reçus</span><strong>' + fcfa(sv.lots_recus) + '</strong><small>sur ' + fcfa(sv.lots_prevus) + '</small></div></div>' +
           '<button class="btn petit" data-action="releve" data-id="' + m.id + '">🖨 Relevé individuel</button></div>' +
           '<form class="carte-corps" data-form="attribuer" style="border-top:1px solid var(--bord)">' +
           '<h3 style="margin-bottom:10px">Nouvelle souscription</h3>' + champsAttribution(false) +
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

  function messagePlaces(places) {
    return 'Parts attribuées :\n' + places.map(function (p) {
      return '• Groupe ' + p.code + ', tour ' + p.position + ' (' + p.quarts * 25 + ' % de ' + fcfa(p.mise) + ')';
    }).join('\n');
  }

  /* =================================================================
   *  VUE 3 : GROUPES DE DIX (Module B)
   * ================================================================= */
  function vueGroupes() {
    var groupes = T.listeGroupes();
    if (!T.groupe(ui.groupeId)) ui.groupeId = groupes.length ? groupes[0].id : null;
    var h = '<h2 class="no-print">Groupes de dix</h2><div class="puces no-print">';
    groupes.forEach(function (g) {
      h += '<button class="puce' + (g.id === ui.groupeId ? ' actif' : '') + '" data-action="voir-groupe" data-id="' + g.id + '"><strong>' + e(g.code) +
           ' ' + badge(g.statut) + '</strong><small>' + fcfa(g.mise_reference) + ' · ' +
           (g.statut === 'OUVERT' ? 'rempli à ' + Math.round(g.remplissage) + ' %' : g.statut === 'EN_COURS' ? 'échéance ' + g.tour_courant + '/10' : 'terminé') + '</small></button>';
    });
    h += '</div><form class="ligne-champs no-print" data-form="nouveau-groupe" style="max-width:520px;margin:-4px 0 16px">' +
         '<div><label>Nouveau groupe vide au tarif de</label>' + selectTarif('tarif') + '</div>' +
         '<div class="fixe"><button class="btn">+ Créer</button></div></form>';
    if (!ui.groupeId) return h + '<div class="alerte">Aucun groupe. Ils sont créés automatiquement lors de l\'attribution des parts aux membres.</div>';

    var g = T.groupe(ui.groupeId), lignes = T.tableauGroupe(g.id);
    var tirable = g.statut === 'OUVERT' || (g.statut === 'EN_COURS' && g.tour_courant <= C.NB_POSITIONS - 2);
    h += '<div class="carte"><div class="carte-tete"><div><h3 style="display:inline">' + e(g.nom || ('Groupe ' + g.code)) + '</h3> ' + badge(g.statut) +
         '<div class="aide">' + e(g.code) + ' · part entière ' + fcfa(g.mise_reference) + ' par mois · lot d\'une case ' + fcfa(g.mise_reference * 10) + '</div></div><div class="no-print" style="display:flex;gap:6px;flex-wrap:wrap">';
    if (tirable) h += '<button class="btn" data-action="tirage" data-id="' + g.id + '">🎲 Tirage au sort</button>';
    if (g.statut === 'OUVERT') {
      h += '<button class="btn plein" data-action="demarrer" data-id="' + g.id + '">Démarrer le groupe</button>';
      if (!lignes.some(function (l) { return l.quarts; })) h += '<button class="btn danger" data-action="supprimer-groupe" data-id="' + g.id + '">Supprimer</button>';
    } else if (g.statut === 'EN_COURS') {
      h += '<button class="btn plein" data-action="aller-paiements" data-id="' + g.id + '">Encaisser l\'échéance ' + g.tour_courant + '</button>';
    }
    h += '<button class="btn" data-action="affiche-groupe" data-id="' + g.id + '">🖼 Affiche</button>' +
         '<button class="btn" data-action="imprimer">Imprimer</button></div></div>';

    if (ui.tirage === g.id && tirable) h += panneauTirage(g, lignes);

    h += '<div class="tableau-wrap"><table><thead><tr><th class="c" style="width:60px">Tour</th><th>Titulaire(s)</th>' +
         (g.mois_debut ? '<th>Mois</th>' : '') + '<th class="c mm">Rempli</th><th class="d">Lot</th><th class="mm">État</th></tr></thead><tbody>';
    lignes.forEach(function (l) {
      var cls = { 'Reçu': 'recu', 'Bénéficiaire du mois': 'courant', 'À compléter': 'a-completer' }[l.etat] || '';
      var tit = l.titulaires.map(function (t) {
        return '<span class="titulaire">' + e(t.nom) + ' <span class="pct">' + t.quarts * 25 + ' %</span>' +
               (g.statut === 'OUVERT' ? '<button class="lien-x no-print" title="Retirer cette part" data-action="retirer-part" data-id="' + t.part_id + '">×</button>' : '') + '</span>';
      }).join('') || '<span class="libre">— libre —</span>';
      h += '<tr class="' + cls + '"><td class="c"><strong>' + String(l.position).padStart(2, '0') + '</strong></td><td>' + tit + '</td>' +
           (g.mois_debut ? '<td style="white-space:nowrap">' + e(l.mois) + '</td>' : '') +
           '<td class="c mm">' + l.quarts * 25 + ' %</td><td class="d">' + fcfa(l.lot) + '</td><td class="mm">' + e(l.etat) + '</td></tr>';
    });
    h += '</tbody></table></div>' +
         '<form class="carte-pied no-print" data-form="infos-groupe"><div style="flex:0 1 110px"><label>Numéro</label>' +
         '<input name="code" value="' + e(g.code) + '" required></div><div style="flex:2 1 220px"><label>Nom affiché du groupe</label>' +
         '<input name="nom" value="' + e(g.nom) + '" placeholder="ex. Tontine Millions 10 mois (109)"></div>' +
         '<div style="flex:1 1 150px"><label>Mois du tour 1</label><input type="month" name="mois_debut" value="' + e(g.mois_debut || '') + '"></div>' +
         '<div class="fixe" style="align-self:flex-end"><button class="btn">Enregistrer</button></div></form></div>';

    if (g.statut !== 'CLOTURE') {
      var min = g.statut === 'EN_COURS' ? g.tour_courant : 1, opts = '<option value="">—</option>';
      for (var p = min; p <= C.NB_POSITIONS; p++) opts += '<option value="' + p + '">' + p + '</option>';
      h += '<div class="grille-2 egal no-print"><form class="carte" data-form="permuter"><div class="carte-tete"><h3>Permutation des tours</h3></div><div class="carte-corps">' +
           '<div class="ligne-champs"><div><label>Tour A</label><select name="a" required>' + opts + '</select></div>' +
           '<div><label>Tour B</label><select name="b" required>' + opts + '</select></div>' +
           '<div><label>Tour C (facultatif)</label><select name="c">' + opts + '</select></div></div>' +
           '<p class="aide">2 tours : A ↔ B. 3 tours : rotation A → B → C → A. Les tours déjà levés ne sont pas proposés.</p>' +
           '<button class="btn plein">Permuter</button></div></form>';
      var hist = T.historiquePermutations(g.id);
      h += '<div class="carte"><div class="carte-tete"><h3>Historique</h3></div><div class="carte-corps"><ul class="liste">' +
           (hist.slice(0, 15).map(function (x) { return '<li><span>' + e(x.description) + '</span><span class="aide">' + e(dateFr(x.date_operation) + x.date_operation.slice(10)) + '</span></li>'; }).join('') ||
            '<li class="aide">Aucune opération.</li>') + '</ul></div></div></div>';

      var optsParts = '';
      lignes.forEach(function (l) {
        l.titulaires.forEach(function (t) {
          optsParts += '<option value="' + t.part_id + '">Tour ' + l.position + ' — ' + e(t.nom) + ' (' + t.quarts * 25 + ' %)</option>';
        });
      });
      var optsMembres = '<option value="">— choisir —</option>';
      T.listeMembres().forEach(function (m) { optsMembres += '<option value="' + m.id + '">' + e(m.nom + ' ' + m.prenom + ' · ' + m.telephone) + '</option>'; });
      if (optsParts) {
        h += '<form class="carte no-print" data-form="remplacer"><div class="carte-tete"><h3>Remplacer un titulaire</h3></div><div class="carte-corps">' +
             '<div class="ligne-champs"><div style="flex:1 1 240px"><label>Part à céder</label><select name="part" required>' + optsParts + '</select></div>' +
             '<div style="flex:1 1 240px"><label>Nouveau titulaire (déjà inscrit)</label><select name="membre" required>' + optsMembres + '</select></div>' +
             '<div class="fixe"><button class="btn plein">Remplacer</button></div></div>' +
             '<p class="aide">En cas de départ ou de cession : le nouveau titulaire reprend la part, son tour et les cotisations. Inscrivez-le d\'abord dans Membres.</p></div></form>';
      }
    }
    return h;
  }

  /** Panneau du tirage au sort : chaque case peut être laissée au hasard ou imposée à un tour précis */
  function panneauTirage(g, lignes) {
    var debut = T.debutTirage(g.id), opts = function (pos) {
      var o = '<option value="">🎲 Au hasard</option>';
      for (var t = debut; t <= C.NB_POSITIONS; t++) {
        o += '<option value="' + t + '">Tour ' + t + (g.mois_debut ? ' — ' + T.moisDuTour(g, t) : '') + (t === pos ? ' (sa place actuelle)' : '') + '</option>';
      }
      return o;
    };
    var h = '<form class="carte-corps no-print" data-form="tirage" style="background:var(--vert-clair);border-bottom:1px solid var(--bord)">' +
      '<h3 style="margin-bottom:6px">Tirage au sort ' + (debut > 1 ? 'des tours ' + debut + ' à 10' : 'des 10 tours') + '</h3>' +
      '<p class="aide" style="margin-top:0">Laissez « Au hasard » ou imposez un tour (organisateur, besoin urgent, accord des membres…). ' +
      'Les co-titulaires d\'une même case restent ensemble.</p><div class="tableau-wrap"><table><tbody>';
    lignes.forEach(function (l) {
      if (l.position < debut) return;
      h += '<tr><td class="c" style="width:50px"><strong>' + l.position + '</strong></td><td>' +
           (l.titulaires.map(function (t) { return e(t.nom) + ' (' + t.quarts * 25 + ' %)'; }).join(' + ') || '<span class="libre">— libre —</span>') +
           '</td><td style="width:230px"><select name="force_' + l.position + '">' + opts(l.position) + '</select></td></tr>';
    });
    return h + '</tbody></table></div><div style="display:flex;gap:8px;margin-top:10px"><button class="btn plein">🎲 Lancer le tirage</button>' +
      '<button type="button" class="btn" data-action="fermer-tirage">Annuler</button></div></form>';
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
    for (var i = 1; i <= tour; i++) {
      var nbI = T.versementsEcheance(g.id, i).filter(function (x) { return x.statut === 'IMPAYE'; }).length;
      optsEch += '<option value="' + i + '"' + (i === ech ? ' selected' : '') + '>' + i + (g.mois_debut ? ' — ' + T.moisDuTour(g, i) : '') +
                 (i === tour ? ' (en cours)' : nbI ? ' (' + nbI + ' en retard)' : ' ✔') + '</option>';
    }
    h += '<div class="ligne-champs no-print" style="max-width:560px;margin-bottom:16px"><div><label>Groupe en cours</label><select id="pay-groupe">' +
         optionsGroupes(enCours, g.id) + '</select></div><div class="fixe" style="width:240px"><label>Échéance</label><select id="pay-ech">' + optsEch + '</select></div></div>';

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
    if (ech !== tour) h = h.replace('<div class="chiffres">', '<div class="alerte attention">Échéance ' + ech + ' déjà clôturée : les paiements que vous cochez ici règlent des retards.</div><div class="chiffres">');
    h += carteRetards(g.id);
    h += carteRemises(g, ech);
    if (ech === tour) {
      h += '<div class="no-print" style="text-align:right"><button class="btn sombre" data-action="cloturer" data-id="' + g.id + '">Clôturer l\'échéance ' + tour + ' et passer au tour suivant</button></div>';
    }
    return h;
  }

  /** Retards (échéances clôturées non payées) avec un bouton « Régler » par ligne */
  function carteRetards(gid, limite) {
    var liste = T.retards(gid);
    if (!liste.length) return gid ? '' : '';
    var total = liste.reduce(function (s, l) { return s + l.montant; }, 0);
    var h = '<div class="carte" style="border-color:#f0c8c3"><div class="carte-tete"><h3>⚠ Retards à régler' + (gid ? '' : ' — tous les groupes') + '</h3>' +
            '<span class="aide"><strong style="color:var(--rouge)">' + liste.length + ' cotisation(s) · ' + fcfa(total) + '</strong></span></div>' +
            '<div class="tableau-wrap"><table><thead><tr>' + (gid ? '' : '<th>Groupe</th>') + '<th class="c">Échéance</th><th>Membre</th><th class="mm">Téléphone</th>' +
            '<th class="d">Montant</th><th class="c no-print"></th></tr></thead><tbody>';
    liste.slice(0, limite || liste.length).forEach(function (l) {
      h += '<tr class="impaye">' + (gid ? '' : '<td>' + e(l.groupe) + '</td>') + '<td class="c">' + l.echeance + (l.mois ? '<br><span class="aide">' + e(l.mois) + '</span>' : '') +
           '</td><td>' + e(l.membre) + '</td><td class="mm">' + lienTel(l.telephone) + '</td><td class="d">' + fcfa(l.montant) + '</td>' +
           '<td class="c no-print"><button class="btn petit plein" data-action="regler" data-id="' + l.id + '">Régler</button></td></tr>';
    });
    if (limite && liste.length > limite) h += '<tr><td colspan="6" class="vide">… et ' + (liste.length - limite) + ' autre(s) : voir Paiements.</td></tr>';
    return h + '</tbody></table></div></div>';
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
      h += '<div class="no-print" style="margin:-2px 0 8px"><button class="btn petit" data-action="fiche-remise" data-part="' + b.part_id + '" data-ech="' + ech +
           '">🖨 Fiche à signer' + (r && r.mode !== 'ESPECES' ? '' : ' (espèces)') + '</button></div>';
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
    return '<h2>Paramètres</h2><div class="grille-2 egal">' +
      '<form class="carte" data-form="parametres"><div class="carte-tete"><h3>Réglages</h3></div><div class="carte-corps">' +
      '<div class="champ"><label>Nom de la tontine</label><input name="nom" value="' + e(T.d.parametres.nom_tontine) + '"></div>' +
      '<div class="champ"><label>Tarifs proposés (part entière, en F, séparés par des virgules)</label>' +
      '<textarea name="tarifs" rows="3" style="width:100%;font:inherit;border:1px solid #c9d1cc;border-radius:8px;padding:9px 10px">' + e(T.d.parametres.tarifs.join(', ')) + '</textarea>' +
      '<div class="aide">Le lot vaut 10 fois le tarif. Un membre peut prendre 25, 50, 75 ou 100 % d\'une part. Chaque groupe garde son tarif.</div></div>' +
      '<div class="champ"><label>Tarif proposé par défaut</label><input name="mise" type="number" min="4" step="4" value="' + T.mise() + '"></div>' +
      '<div class="champ"><label>Numéro du prochain groupe créé</label><input name="prochain" type="number" min="1" value="' + T.prochainNumero() + '">' +
      '<div class="aide">Ex. 109 : le prochain groupe sera G109, puis G110… Le numéro d\'un groupe se corrige aussi dans sa fiche.</div></div>' +
      '<div class="champ"><label>Responsables (une ligne par personne : Nom ; téléphone)</label>' +
      '<textarea name="responsables" rows="4" placeholder="ABDOU BADIANE ; 77 763 91 63" style="width:100%;font:inherit;border:1px solid #c9d1cc;border-radius:8px;padding:9px 10px">' +
      e((T.d.parametres.responsables || []).map(function (r) { return r.nom + ' ; ' + r.tel; }).join('\n')) + '</textarea>' +
      '<div class="aide">Affichés au bas des affiches et sur les fiches de remise.</div></div>' +
      '<button class="btn plein">Enregistrer</button></div></form>' +
      '<div class="carte"><div class="carte-tete"><h3>Sauvegarde des données</h3></div><div class="carte-corps">' +
      '<p class="aide" style="margin-top:0">Les données restent dans ce navigateur, sur cet appareil. Exportez une sauvegarde après chaque séance et gardez-la sur une clé USB ou par e-mail.</p>' +
      '<p>' + (der ? 'Dernière sauvegarde : ' + new Date(Number(der)).toLocaleString('fr-FR') : 'Aucune sauvegarde exportée.') + '</p>' +
      '<div class="ligne-champs"><button class="btn plein fixe" data-action="exporter">Exporter (.json)</button>' +
      '<label class="btn fixe" style="margin:0;color:var(--vert)">Importer une sauvegarde<input type="file" id="import" accept=".json,application/json" hidden></label></div>' +
      '</div><div class="carte-pied"><button class="btn" data-action="exemple">Charger des données d\'exemple</button>' +
      '<button class="btn danger" data-action="effacer">Tout effacer</button></div></div></div>' + carteInstallation();
  }

  /* ---------- application installable (PWA) ---------- */
  var invitationInstall = null;
  function estInstallee() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function estIos() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

  function carteInstallation() {
    var h = '<div class="carte"><div class="carte-tete"><h3>Application sur téléphone et ordinateur</h3>' +
            (estInstallee() ? '<span class="badge EN_COURS">✔ Installée</span>' : '') + '</div><div class="carte-corps">';
    if (estInstallee()) {
      h += '<p style="margin-top:0">L\'application est installée : elle s\'ouvre depuis son icône, en plein écran, et fonctionne sans internet.</p>';
    } else if (invitationInstall) {
      h += '<p style="margin-top:0">Installez l\'application : elle aura son icône sur l\'écran d\'accueil, s\'ouvrira en plein écran et fonctionnera sans internet.</p>' +
           '<button class="btn plein" data-action="installer">⬇ Installer l\'application</button>';
    } else if (estIos()) {
      h += '<p style="margin-top:0">Sur iPhone ou iPad, ouvrez cette page avec <strong>Safari</strong>, puis :</p><ol class="etapes">' +
           '<li>touchez le bouton <strong>Partager</strong> (carré avec une flèche vers le haut) ;</li>' +
           '<li>choisissez <strong>« Sur l\'écran d\'accueil »</strong> ;</li><li>touchez <strong>Ajouter</strong>.</li></ol>';
    } else {
      h += '<p style="margin-top:0">Pour installer l\'application :</p><ol class="etapes">' +
           '<li><strong>Android (Chrome)</strong> : menu <strong>⋮</strong> puis <strong>« Installer l\'application »</strong> ou « Ajouter à l\'écran d\'accueil » ;</li>' +
           '<li><strong>Ordinateur (Chrome ou Edge)</strong> : icône d\'installation à droite de la barre d\'adresse, ou menu puis « Installer Tontine ».</li></ol>' +
           '<p class="aide">L\'installation n\'est proposée que sur le site en ligne (https), pas en ouvrant le fichier depuis le disque.</p>';
    }
    h += '<p class="aide">Les données restent sur cet appareil, comme dans le navigateur. Exportez une sauvegarde avant de changer de téléphone.</p>';
    return h + '</div></div>';
  }

  function majBoutonInstall() {
    var b = $('#btn-installer');
    if (b) b.hidden = !invitationInstall || estInstallee();
  }

  window.addEventListener('beforeinstallprompt', function (ev) {
    ev.preventDefault();
    invitationInstall = ev;
    majBoutonInstall();
    if (vueCourante() === 'parametres') rendre();
  });
  window.addEventListener('appinstalled', function () {
    invitationInstall = null;
    majBoutonInstall();
    toast('Application installée : retrouvez l\'icône « Tontine » sur votre écran d\'accueil.', 'succes');
    if (vueCourante() === 'parametres') rendre();
  });

  function installer() {
    if (!invitationInstall) { aller('parametres'); return; }
    invitationInstall.prompt();
    invitationInstall.userChoice.then(function () { invitationInstall = null; majBoutonInstall(); rendre(); });
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var nouveau = reg.installing;
          if (!nouveau) return;
          nouveau.addEventListener('statechange', function () {
            if (nouveau.state === 'installed' && navigator.serviceWorker.controller) {
              toast('Nouvelle version disponible : elle sera active à la prochaine ouverture.', 'succes');
              nouveau.postMessage('activer');
            }
          });
        });
      }).catch(function (err) { console.warn('Service worker non enregistré :', err); });
    });
  }
  // Demande au navigateur de ne jamais effacer les données de l'appli pour libérer de la place
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then(function (ok) { if (!ok) navigator.storage.persist(); }).catch(function () {});
  }

  function donneesExemple() {
    var t = new C.Tontine(C.etatVide(), function () {});
    var noms = [['DIOP', 'Awa'], ['FALL', 'Moussa'], ['NDIAYE', 'Fatou'], ['SECK', 'Ibrahima'], ['SARR', 'Mariama'], ['GUEYE', 'Cheikh'],
                ['BA', 'Aminata'], ['SY', 'Ousmane'], ['KANE', 'Khady'], ['MBAYE', 'Modou'], ['DIENG', 'Astou'], ['FAYE', 'Pape'],
                ['NIANG', 'Rokhaya'], ['THIAM', 'Abdou'], ['CISSE', 'Ndeye'], ['SOW', 'Mamadou']];
    var formules = ['G100', 'G100', 'G100', 'G100', 'G100', 'G100', 'G100', 'S50', 'S50', 'S25', 'S25', 'S50', 'S50', 'S25', 'S25', 'G100'];
    noms.forEach(function (n, i) {
      var id = t.ajouterMembre({ nom: n[0], prenom: n[1], telephone: '77 1' + String(i).padStart(2, '0') + ' 00 ' + String(10 + i),
                                 telephone2: i % 3 === 0 ? '78 2' + String(i).padStart(2, '0') + ' 11 22' : '',
                                 cni: i % 2 === 0 ? '1 751 1990 ' + String(10000 + i * 37) : '' });
      t.attribuer(id, formules[i]);
    });
    t.modifierGroupe(1, { nom: 'Tontine Millions 10 mois (exemple)', mois_debut: aujourdhuiIso().slice(0, 7) });
    t.attribuer(t.ajouterMembre({ nom: 'GROS', prenom: 'Cotisant', telephone: '76 300 00 00' }), 'G100', 1000000);
    t.tirageAuSort(1, null, { 1: 1 });
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
  /* =================================================================
   *  VUE 7 : AFFICHES (statuts WhatsApp, publications)
   * ================================================================= */
  function vueAffiches() {
    var groupes = T.listeGroupes();
    if (!T.groupe(ui.afGroupe)) ui.afGroupe = groupes.length ? groupes[0].id : null;
    var opt = function (val, lib, cur) { return '<option value="' + val + '"' + (val === cur ? ' selected' : '') + '>' + lib + '</option>'; };
    var h = '<h2>Affiches</h2><div class="grille-2"><form class="carte" data-form="affiche"><div class="carte-tete"><h3>Réglages</h3></div><div class="carte-corps">' +
      '<div class="champ"><label>Affiche</label><select name="type" data-af>' + opt('groupe', 'Tableau d\'un groupe (tours et mois)', ui.afType) +
      opt('tarifs', 'Grille des tarifs (cotisation → lot)', ui.afType) + '</select></div>' +
      (ui.afType === 'groupe' ? '<div class="champ"><label>Groupe</label><select name="groupe" data-af>' + optionsGroupes(groupes, ui.afGroupe) + '</select></div>' : '') +
      '<div class="champ"><label>Format</label><select name="format" data-af>' + opt('statut', 'Statut WhatsApp / story (1080 × 1920)', ui.afFormat) +
      opt('publication', 'Publication Facebook (1080 × 1350)', ui.afFormat) + opt('carre', 'Carré (1080 × 1080)', ui.afFormat) + '</select></div>' +
      '<div class="champ"><label>Couleurs</label><select name="theme" data-af>' + opt('corail', 'Corail', ui.afTheme) + opt('vert', 'Vert', ui.afTheme) + opt('bleu', 'Bleu', ui.afTheme) + '</select></div>' +
      '<div class="champ"><label>Titre (facultatif)</label><input name="titre" data-af value="' + e(ui.afTitre) + '" placeholder="' +
      e(ui.afType === 'groupe' && ui.afGroupe ? (T.groupe(ui.afGroupe).nom || 'nom du groupe') : T.d.parametres.nom_tontine) + '"></div>' +
      ((T.d.parametres.responsables || []).length ? '' : '<p class="aide">Astuce : ajoutez les responsables et leurs numéros dans <a href="#parametres">Paramètres</a> pour qu\'ils apparaissent en bas de l\'affiche.</p>') +
      '<div class="ligne-champs"><button type="button" class="btn plein fixe" data-action="affiche-telecharger">⬇ Télécharger l\'image</button>' +
      '<button type="button" class="btn fixe" data-action="affiche-partager">📤 Partager</button></div></div></form>' +
      '<div class="carte"><div class="carte-corps apercu-affiche" id="apercu-affiche">' +
      (ui.afType === 'groupe' && !ui.afGroupe ? '<p class="vide">Aucun groupe pour le moment.</p>' : '') + '</div></div></div>';
    return h;
  }

  function canvasAffiche() {
    var o = { format: ui.afFormat, theme: ui.afTheme, titre: ui.afTitre };
    if (ui.afType === 'tarifs') return D.afficheTarifs(T, o);
    return ui.afGroupe ? D.afficheGroupe(T, ui.afGroupe, o) : null;
  }

  function majAffiche() {
    var zone = $('#apercu-affiche');
    if (!zone) return;
    var cv = canvasAffiche();
    if (!cv) return;
    cv.className = 'canvas-affiche';
    zone.innerHTML = '';
    zone.appendChild(cv);
  }

  function nomAffiche() {
    return 'affiche_' + (ui.afType === 'tarifs' ? 'tarifs' : T.groupe(ui.afGroupe).code) + '_' + ui.afFormat + '.png';
  }

  function telechargerAffiche() {
    var cv = canvasAffiche();
    if (!cv) return;
    cv.toBlob(function (b) {
      var url = URL.createObjectURL(b), a = document.createElement('a');
      a.href = url; a.download = nomAffiche();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      toast('Image téléchargée : ' + nomAffiche(), 'succes');
    }, 'image/png');
  }

  function partagerAffiche() {
    var cv = canvasAffiche();
    if (!cv) return;
    cv.toBlob(function (b) {
      var fichier = new File([b], nomAffiche(), { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
        navigator.share({ files: [fichier], title: T.d.parametres.nom_tontine }).catch(function () {});
      } else {
        toast('Partage direct impossible sur cet appareil : l\'image est téléchargée, publiez-la depuis votre galerie.', 'erreur');
        telechargerAffiche();
      }
    }, 'image/png');
  }

  /** Imprime un document (fiche, relevé) seul, sans le reste de la page */
  function imprimerDocument(html) {
    var z = $('#impression');
    z.innerHTML = html;
    document.body.classList.add('mode-document');
    var fin = function () { document.body.classList.remove('mode-document'); z.innerHTML = ''; window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin);
    setTimeout(function () { window.print(); }, 50);
  }

  var VUES = { tableau: vueTableau, membres: vueMembres, groupes: vueGroupes, paiements: vuePaiements, rapports: vueRapports, affiches: vueAffiches, parametres: vueParametres };

  function vueCourante() { var v = location.hash.slice(1); return VUES[v] ? v : 'tableau'; }

  function rendre() {
    var v = vueCourante();
    $('#vue').innerHTML = VUES[v]();
    $$('form').forEach(function (f) { if (f.elements.formule && f.elements.tarif) majApercu(f); });
    if (v === 'affiches') majAffiche();
    $$('#nav a').forEach(function (a) { a.classList.toggle('actif', a.getAttribute('href') === '#' + v); });
    $('#nom-tontine').textContent = T.d.parametres.nom_tontine;
    $('#info-mise').textContent = 'Tarif par défaut : ' + fcfa(T.mise());
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
      case 'tirage': ui.tirage = id; rendre(); break;
      case 'fermer-tirage': ui.tirage = false; rendre(); break;
      case 'releve': imprimerDocument(D.releveMembre(T, id)); break;
      case 'fiche-remise': imprimerDocument(D.ficheRemise(T, Number(el.dataset.part), Number(el.dataset.ech))); break;
      case 'affiche-groupe': ui.afType = 'groupe'; ui.afGroupe = id; ui.afTitre = ''; aller('affiches'); break;
      case 'affiche-telecharger': telechargerAffiche(); break;
      case 'affiche-partager': partagerAffiche(); break;
      case 'regler':
        agir(function () { T.marquer([id], 'PAYE'); }, 'Retard réglé.'); break;
      case 'editer-remise': ui.editionRemise = id; rendre(); break;
      case 'annuler-edition-remise': ui.editionRemise = null; rendre(); break;
      case 'annuler-remise':
        if (confirm('Annuler cette remise ? Le lot repassera « à remettre ».')) agir(function () { T.annulerRemise(id); }, 'Remise annulée.');
        break;
      case 'voir-groupe':
        ev.preventDefault(); ui.groupeId = id; aller('groupes'); break;

      case 'supprimer-groupe':
        if (confirm('Supprimer ce groupe vide ?')) agir(function () { T.supprimerGroupeVide(id); ui.groupeId = null; }, 'Groupe supprimé.');
        break;
      case 'demarrer':
        if (confirm('Démarrer ce groupe ? Plus aucune part ne pourra y être ajoutée. L\'échéance 1 sera ouverte.')) {
          agir(function () { T.demarrerGroupe(id); }, 'Groupe démarré : l\'échéance 1 est ouverte dans Paiements.');
        }
        break;
      case 'retirer-part':
        if (confirm('Retirer cette part du groupe ?')) agir(function () { T.retirerPart(id); }, 'Part retirée.');
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
      case 'installer': installer(); break;
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
    } else if (type === 'nouveau-groupe') {
      agir(function () { ui.groupeId = T.creerGroupe(tarifDuFormulaire(f)); }, 'Groupe créé.');
    } else if (type === 'infos-groupe') {
      agir(function () { T.modifierGroupe(ui.groupeId, { code: v('code'), nom: v('nom'), mois_debut: v('mois_debut') }); }, 'Groupe mis à jour.');
    } else if (type === 'tirage') {
      var forces = {};
      $$('select[name^="force_"]', f).forEach(function (s) { if (s.value) forces[s.name.slice(6)] = s.value; });
      var nbF = Object.keys(forces).length;
      if (confirm('Lancer le tirage au sort' + (nbF ? ' avec ' + nbF + ' place(s) imposée(s)' : '') + ' ?')) {
        agir(function () { var d = T.tirageAuSort(ui.groupeId, null, forces); ui.tirage = false; return d; }, function (d) { return d; });
      }
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
      if (v('formule') && !tarifDuFormulaire(f)) { toast('Indiquez le tarif.', 'erreur'); return; }
      agir(function () {
        var id = T.ajouterMembre(fiche());
        ui.membreVu = id;
        return v('formule') ? messagePlaces(T.attribuer(id, v('formule'), tarifDuFormulaire(f))) : 'Membre inscrit. Attribuez-lui une formule.';
      }, function (msg) { return msg; });
      var champ = $('#f-nom'); if (champ && !$('.toast.erreur')) champ.focus();
    } else if (type === 'attribuer') {
      if (!tarifDuFormulaire(f)) { toast('Indiquez le tarif.', 'erreur'); return; }
      agir(function () { return messagePlaces(T.attribuer(ui.membreVu, v('formule'), tarifDuFormulaire(f))); }, function (msg) { return msg; });
    } else if (type === 'permuter') {
      if (confirm('Les membres concernés ont-ils donné leur accord ?')) {
        agir(function () { return T.permuter(ui.groupeId, [v('a'), v('b'), v('c')]); }, function (d) { return 'Permutation effectuée : ' + d; });
      }
    } else if (type === 'parametres') {
      agir(function () {
        T.setNom(v('nom')); T.setTarifs(v('tarifs')); T.setMise(v('mise'));
        T.setResponsables(v('responsables'));
        if (Number(v('prochain')) !== T.prochainNumero()) T.setProchainNumero(v('prochain'));
      }, 'Paramètres enregistrés.');
    }
  });

  document.addEventListener('input', function (ev) {
    if (ev.target.name === 'tarif_autre') majApercu(ev.target.form);
    if (ev.target.name === 'titre' && ev.target.hasAttribute('data-af')) { lireAffiche(ev.target.form); majAffiche(); }
    if (ev.target.id === 'recherche') {
      ui.recherche = ev.target.value;
      $('#corps-membres').innerHTML = lignesMembres();
    }
  });

  function lireAffiche(f) {
    ui.afType = f.elements.type.value;
    if (f.elements.groupe) ui.afGroupe = Number(f.elements.groupe.value);
    ui.afFormat = f.elements.format.value;
    ui.afTheme = f.elements.theme.value;
    ui.afTitre = f.elements.titre.value;
  }

  document.addEventListener('change', function (ev) {
    if (ev.target.hasAttribute && ev.target.hasAttribute('data-af')) {
      var avant = ui.afType;
      lireAffiche(ev.target.form);
      if (avant !== ui.afType) rendre(); else majAffiche();
      return;
    }
    if (ev.target.hasAttribute && ev.target.hasAttribute('data-apercu')) majApercu(ev.target.form);
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

  var bInst = $('#btn-installer');
  if (bInst) bInst.addEventListener('click', installer);
  rendre();
  majBoutonInstall();
})();
