/* =====================================================================
 *  GESTIONNAIRE DE TONTINES — documents.js
 *  Documents à imprimer (fiche de remise à signer, relevé d'un membre)
 *  et affiches PNG pour les statuts / publications (WhatsApp, Facebook…).
 * ===================================================================== */
(function (global) {
  'use strict';

  var C = global.TontineCore;

  function e(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fcfa(m) { return Math.round(m || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F'; }
  function points(m) { return Math.round(m || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'F'; }
  function dateFr(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; }
  function lettres(m) {
    var t = C.nombreEnLettres(m);
    return t.charAt(0).toUpperCase() + t.slice(1) + ' francs CFA';
  }

  /* =================================================================
   *  FICHE DE REMISE DU LOT (à signer) — deux exemplaires par page
   * ================================================================= */
  function ficheRemise(T, partId, ech) {
    var p = T.d.parts.find(function (x) { return x.id === partId; });
    var g = T.groupe(p.groupe_id), m = T.membre(p.membre_id);
    var b = T.beneficiaires(g.id, ech).find(function (x) { return x.part_id === partId; });
    var r = b.remise, nomT = T.d.parametres.nom_tontine;
    var montant = r ? r.montant : b.lot;
    var resp = T.d.parametres.responsables || [];
    var ligne = function (lib, val) { return '<tr><th>' + lib + '</th><td>' + val + '</td></tr>'; };
    var exemplaire = function (titre) {
      return '<section class="doc-fiche">' +
        '<header><div><strong>' + e(nomT) + '</strong><br><span>' + e(g.nom || ('Groupe ' + g.code)) + '</span></div>' +
        '<div class="doc-num">' + e(titre) + '<br>Fiche n° ' + (r ? 'R' + String(r.id).padStart(4, '0') : '________') + '</div></header>' +
        '<h1>FICHE DE REMISE DU LOT</h1>' +
        '<table class="doc-table">' +
        ligne('Groupe', e(g.code) + (g.nom ? ' — ' + e(g.nom) : '')) +
        ligne('Tour', 'N° ' + ech + (g.mois_debut ? ' — ' + e(T.moisDuTour(g, ech)) : '')) +
        ligne('Bénéficiaire', '<strong>' + e(m.prenom + ' ' + m.nom) + '</strong> (part de ' + p.quarts * 25 + ' %)') +
        ligne('Téléphone', e(m.telephone) + (m.telephone2 ? ' / ' + e(m.telephone2) : '')) +
        ligne('N° CNI', m.cni ? e(m.cni) : '<span class="doc-blanc"></span>') +
        ligne('Montant', '<strong class="doc-montant">' + fcfa(montant) + '</strong>') +
        ligne('En lettres', e(lettres(montant))) +
        ligne('Mode de remise', r ? e(C.MODES[r.mode]) + (r.reference ? ' — réf. ' + e(r.reference) : '') : 'Espèces') +
        ligne('Date', r ? dateFr(r.date_remise) : '<span class="doc-blanc"></span>') +
        '</table>' +
        '<p class="doc-texte">Je soussigné(e) <strong>' + e(m.prenom + ' ' + m.nom) + '</strong>' + (m.cni ? ', CNI n° ' + e(m.cni) : '') +
        ', reconnais avoir reçu de la tontine <strong>' + e(nomT) + '</strong> la somme de <strong>' + fcfa(montant) + '</strong> (' + e(lettres(montant)) +
        ') au titre du tour n° ' + ech + ' du groupe ' + e(g.code) + '. Je reste tenu(e) de payer mes cotisations jusqu\'à la fin du cycle.</p>' +
        '<div class="doc-signatures"><div>Le bénéficiaire<br><small>(lu et approuvé)</small></div><div>Le responsable' +
        (resp[0] ? '<br><small>' + e(resp[0].nom) + '</small>' : '') + '</div><div>Le témoin</div></div>' +
        '</section>';
    };
    return '<div class="doc">' + exemplaire('Exemplaire bénéficiaire') + '<div class="doc-coupe">✂</div>' + exemplaire('Exemplaire tontine') + '</div>';
  }

  /* =================================================================
   *  RELEVÉ INDIVIDUEL D'UN MEMBRE
   * ================================================================= */
  function releveMembre(T, membreId) {
    var s = T.suiviMembre(membreId), m = s.membre, t = s.total;
    var h = '<div class="doc"><section class="doc-releve"><header><div><strong>' + e(T.d.parametres.nom_tontine) + '</strong><br><span>Relevé individuel</span></div>' +
      '<div class="doc-num">Édité le ' + dateFr(new Date().toISOString()) + '</div></header>' +
      '<h1>' + e(m.prenom + ' ' + m.nom) + '</h1><p class="doc-sous">Tél. ' + e(m.telephone) + (m.telephone2 ? ' / ' + e(m.telephone2) : '') +
      (m.cni ? ' · CNI ' + e(m.cni) : '') + ' · inscrit le ' + dateFr(m.date_inscription) + '</p>' +
      '<div class="doc-chiffres">' +
      '<div><span>Parts</span><strong>' + t.nb_parts + '</strong><small>dans ' + t.groupes + ' groupe(s)</small></div>' +
      '<div><span>Participation</span><strong>' + t.engagement_pct + ' %</strong><small>' + (t.engagement_pct / 100).toLocaleString('fr-FR') + ' part(s) entière(s)</small></div>' +
      '<div><span>Cotisation mensuelle</span><strong>' + fcfa(t.cotisation_mensuelle) + '</strong></div>' +
      '<div><span>Versé / dû à ce jour</span><strong>' + fcfa(t.verse) + '</strong><small>sur ' + fcfa(t.du_a_ce_jour) + (t.taux !== null ? ' · ' + t.taux + ' %' : '') + '</small></div>' +
      '<div><span>Retards</span><strong>' + fcfa(t.montant_retards) + '</strong><small>' + t.retards + ' échéance(s)</small></div>' +
      '<div><span>Lots</span><strong>' + fcfa(t.lots_recus) + '</strong><small>reçus sur ' + fcfa(t.lots_prevus) + '</small></div></div>' +
      '<table class="doc-table doc-grille"><thead><tr><th>Groupe</th><th>Tour</th><th>Part</th><th>Cotisation</th><th>Mois payés</th><th>Versé</th><th>Retards</th><th>Lot</th><th>État du lot</th></tr></thead><tbody>';
    s.parts.forEach(function (p) {
      h += '<tr><td>' + e(p.code) + (p.nom_groupe ? '<br><small>' + e(p.nom_groupe) + '</small>' : '') + '</td><td>' + p.tour + (p.mois ? '<br><small>' + e(p.mois) + '</small>' : '') +
        '</td><td>' + p.pct + ' %</td><td>' + fcfa(p.cotisation) + '</td><td>' + p.mois_payes + ' / ' + p.mois_ouverts + '</td><td>' + fcfa(p.verse) +
        '</td><td>' + (p.retards ? fcfa(p.montant_retards) : '—') + '</td><td>' + fcfa(p.lot) + '</td><td>' + e(p.etat_lot) + '</td></tr>';
    });
    if (!s.parts.length) h += '<tr><td colspan="9">Aucune part.</td></tr>';
    return h + '</tbody></table></section></div>';
  }

  /* =================================================================
   *  AFFICHES PNG
   * ================================================================= */
  var THEMES = {
    corail: { fond: '#ffffff', titre: '#2d3a6b', entete: '#d9644a', enteteTexte: '#ffffff', ligne1: '#f6d3c9', ligne2: '#fbe8e2', texte: '#3b1f17', bord: '#ffffff', accent: '#d9644a' },
    vert: { fond: '#f4f7f5', titre: '#1d5f3a', entete: '#1d5f3a', enteteTexte: '#ffffff', ligne1: '#dcefe3', ligne2: '#eef7f1', texte: '#16301f', bord: '#ffffff', accent: '#c9971c' },
    bleu: { fond: '#ffffff', titre: '#0b3d6e', entete: '#1565c0', enteteTexte: '#ffffff', ligne1: '#d6e6f8', ligne2: '#ebf3fc', texte: '#0d2440', bord: '#ffffff', accent: '#f2a900' }
  };
  var FORMATS = { statut: [1080, 1920], publication: [1080, 1350], carre: [1080, 1080] };
  var POLICE = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  function police(ctx, taille, gras) { ctx.font = (gras ? 'bold ' : '') + Math.round(taille) + 'px ' + POLICE; }

  /** Réduit la police jusqu'à ce que le texte tienne dans la largeur */
  function ajuster(ctx, texte, largeur, taille, gras, min) {
    police(ctx, taille, gras);
    while (taille > (min || 14) && ctx.measureText(texte).width > largeur) { taille -= 1; police(ctx, taille, gras); }
    return taille;
  }

  /** Coupe un texte en lignes qui tiennent dans la largeur */
  function couper(ctx, texte, largeur) {
    var mots = String(texte).split(' '), lignes = [], cur = '';
    mots.forEach(function (m) {
      var essai = cur ? cur + ' ' + m : m;
      if (ctx.measureText(essai).width > largeur && cur) { lignes.push(cur); cur = m; } else cur = essai;
    });
    if (cur) lignes.push(cur);
    return lignes;
  }

  function rect(ctx, x, y, w, h, coul) { ctx.fillStyle = coul; ctx.fillRect(x, y, w, h); }

  function titreAffiche(ctx, W, y, titre, th, max) {
    ctx.textAlign = 'center';
    ctx.fillStyle = th.titre;
    police(ctx, max, true);
    var lignes = couper(ctx, titre.toUpperCase(), W - 100);
    if (lignes.length > 2) { max = max * 0.8; police(ctx, max, true); lignes = couper(ctx, titre.toUpperCase(), W - 100); }
    lignes.slice(0, 3).forEach(function (l) {
      var t = ajuster(ctx, l, W - 100, max, true, 24);
      ctx.fillText(l, W / 2, y + t);
      y += t * 1.2;
    });
    return y + 10;
  }

  /** Bloc « Responsables » en bas de l'affiche ; renvoie sa hauteur */
  function hauteurResponsables(resp) { return resp.length ? 70 + Math.ceil(resp.length / 2) * 46 : 0; }
  function dessinerResponsables(ctx, W, y, resp, th) {
    if (!resp.length) return;
    rect(ctx, 50, y, W - 100, hauteurResponsables(resp) - 20, th.ligne1);
    ctx.fillStyle = th.titre;
    ctx.textAlign = 'center';
    police(ctx, 30, true);
    ctx.fillText('Responsables', W / 2, y + 42);
    police(ctx, 27, false);
    ctx.fillStyle = th.texte;
    resp.forEach(function (r, i) {
      var col = i % 2, li = Math.floor(i / 2), seul = i === resp.length - 1 && col === 0;
      var x = seul ? W / 2 : (col === 0 ? W * 0.29 : W * 0.71);
      ctx.textAlign = 'center';
      var txt = r.nom.toUpperCase() + (r.tel ? '  ' + r.tel : '');
      ajuster(ctx, txt, W / 2 - 80, 27, false, 16);
      ctx.fillText(txt, x, y + 86 + li * 46);
    });
  }

  /** Affiche du tableau d'un groupe : Numéro · Prénoms & Nom · Mois */
  function afficheGroupe(T, gid, opts) {
    var g = T.groupe(gid), lignes = T.tableauGroupe(gid);
    var th = THEMES[opts.theme] || THEMES.corail, dim = FORMATS[opts.format] || FORMATS.statut;
    var W = dim[0], H = dim[1];
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    rect(ctx, 0, 0, W, H, th.fond);
    rect(ctx, 0, 0, W, 14, th.entete);

    var titre = opts.titre || g.nom || (T.d.parametres.nom_tontine + ' — groupe ' + g.code);
    var y = titreAffiche(ctx, W, 40, titre, th, 62);
    ctx.textAlign = 'center';
    ctx.fillStyle = th.texte;
    police(ctx, 30, false);
    ctx.fillText('Part entière : ' + points(g.mise_reference) + ' / mois  ·  Lot : ' + points(g.mise_reference * 10), W / 2, y + 26);
    y += 56;

    var resp = opts.responsables === false ? [] : (T.d.parametres.responsables || []);
    var bas = H - 40 - hauteurResponsables(resp);
    var avecMois = !!g.mois_debut, X = 50, L = W - 100;
    var cols = avecMois ? [0.17, 0.53, 0.30] : [0.18, 0.82, 0];
    var entH = 64;

    // contenu des lignes
    var contenu = lignes.map(function (l) {
      var noms = l.titulaires.map(function (t) {
        return (l.titulaires.length > 1 ? '- ' : '') + t.prenom_nom + (t.quarts < 4 ? ' (' + t.quarts * 25 + ')' : '');
      });
      if (l.quarts < 4) noms.push(l.quarts ? '- place libre (' + (4 - l.quarts) * 25 + ')' : 'place libre');
      return { pos: l.position, noms: noms, mois: l.mois, etat: l.etat };
    });
    var nbLignes = contenu.reduce(function (s, c) { return s + c.noms.length; }, 0);
    var dispo = bas - y - entH - 10;
    var lh = Math.min(76, dispo / (nbLignes + contenu.length * 0.45));
    var fs = Math.max(16, Math.min(38, lh * 0.58));

    // en-tête du tableau
    rect(ctx, X, y, L, entH, th.entete);
    ctx.fillStyle = th.enteteTexte;
    police(ctx, 32, true);
    ctx.textAlign = 'center';
    var cx = [X + L * cols[0] / 2, X + L * (cols[0] + cols[1] / 2), X + L * (cols[0] + cols[1] + cols[2] / 2)];
    ctx.fillText('Numéro', cx[0], y + 43);
    ctx.fillText('Prénoms & Nom', cx[1], y + 43);
    if (avecMois) ctx.fillText('Mois', cx[2], y + 43);
    y += entH;

    contenu.forEach(function (c, i) {
      var h = c.noms.length * lh + lh * 0.45;
      rect(ctx, X, y, L, h, i % 2 ? th.ligne2 : th.ligne1);
      rect(ctx, X, y + h - 3, L, 3, th.bord);
      rect(ctx, X + L * cols[0] - 2, y, 3, h, th.bord);
      if (avecMois) rect(ctx, X + L * (cols[0] + cols[1]) - 2, y, 3, h, th.bord);
      ctx.fillStyle = th.texte;
      ctx.textAlign = 'center';
      police(ctx, fs * 1.05, true);
      ctx.fillText(String(c.pos).padStart(2, '0'), cx[0], y + h / 2 + fs * 0.36);
      c.noms.forEach(function (n, k) {
        ajuster(ctx, n, L * cols[1] - 24, fs, true, 12);
        ctx.fillText(n, cx[1], y + lh * 0.22 + (k + 0.5) * lh + fs * 0.36);
      });
      if (avecMois) {
        ajuster(ctx, c.mois.toUpperCase(), L * cols[2] - 20, fs * 0.95, true, 12);
        ctx.fillText(c.mois.toUpperCase(), cx[2], y + h / 2 + fs * 0.36);
      }
      y += h;
    });
    dessinerResponsables(ctx, W, bas + 10, resp, th);
    return cv;
  }

  /** Affiche de la grille des tarifs : Cotisation / mois → Lot à recevoir */
  function afficheTarifs(T, opts) {
    var th = THEMES[opts.theme] || THEMES.corail, dim = FORMATS[opts.format] || FORMATS.statut;
    var W = dim[0], H = dim[1];
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    rect(ctx, 0, 0, W, H, th.fond);
    rect(ctx, 0, 0, W, 14, th.entete);
    var y = titreAffiche(ctx, W, 40, opts.titre || T.d.parametres.nom_tontine, th, 76);
    ctx.textAlign = 'center';
    ctx.fillStyle = th.accent;
    police(ctx, 36, true);
    ctx.fillText('10 MOIS · LE LOT VAUT 10 FOIS LA COTISATION', W / 2, y + 30);
    y += 70;

    var t = T.tarifs(), base = t[0];
    var montants = [];
    if (opts.fractions !== false && base) [1, 2, 3].forEach(function (q) { montants.push(base * q / 4); });
    t.forEach(function (x) { if (montants.indexOf(x) < 0) montants.push(x); });
    montants.sort(function (a, b) { return a - b; });

    var resp = opts.responsables === false ? [] : (T.d.parametres.responsables || []);
    var bas = H - 40 - hauteurResponsables(resp);
    var entH = 66, lh = Math.min(70, (bas - y - entH - 20) / montants.length), fs = Math.max(16, Math.min(40, lh * 0.6));
    var X = 120, L = W - 240;
    rect(ctx, X, y, L, entH, th.entete);
    ctx.fillStyle = th.enteteTexte;
    police(ctx, 32, true);
    ctx.fillText('COTISATION / MOIS', X + L * 0.25, y + 44);
    ctx.fillText('LOT À RECEVOIR', X + L * 0.75, y + 44);
    y += entH;
    montants.forEach(function (mt, i) {
      rect(ctx, X, y, L, lh, i % 2 ? th.ligne2 : th.ligne1);
      rect(ctx, X + L / 2 - 1, y, 3, lh, th.bord);
      ctx.fillStyle = th.texte;
      police(ctx, fs, true);
      ctx.fillText(points(mt), X + L * 0.25, y + lh / 2 + fs * 0.36);
      ctx.fillText(points(mt * 10), X + L * 0.75, y + lh / 2 + fs * 0.36);
      y += lh;
    });
    dessinerResponsables(ctx, W, bas + 10, resp, th);
    return cv;
  }

  global.TontineDocs = {
    ficheRemise: ficheRemise, releveMembre: releveMembre,
    afficheGroupe: afficheGroupe, afficheTarifs: afficheTarifs, THEMES: THEMES, FORMATS: FORMATS
  };
})(this);
