/* =====================================================================
 *  GESTIONNAIRE DE TONTINES — copies.js
 *  Copies de sécurité automatiques, conservées dans l'appareil (IndexedDB),
 *  séparément des données de travail : elles permettent de revenir en
 *  arrière après une erreur (mauvaise clôture, import raté, effacement…).
 *  Attention : elles restent sur le même appareil ; seul l'envoi de la
 *  sauvegarde (WhatsApp, e-mail, Drive) protège contre la perte du téléphone.
 * ===================================================================== */
(function (global) {
  'use strict';

  var BASE = 'tontine-copies', MAGASIN = 'copies', GARDER = 20;
  var ouverture = null;

  function ouvrir() {
    if (ouverture) return ouverture;
    ouverture = new Promise(function (ok, ko) {
      if (!global.indexedDB) { ko(new Error('IndexedDB indisponible')); return; }
      var req = indexedDB.open(BASE, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(MAGASIN, { keyPath: 'id', autoIncrement: true }); };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { ko(req.error); };
    });
    return ouverture;
  }

  function transaction(mode, fn) {
    return ouvrir().then(function (db) {
      return new Promise(function (ok, ko) {
        var tx = db.transaction(MAGASIN, mode), st = tx.objectStore(MAGASIN), res;
        res = fn(st);
        tx.oncomplete = function () { ok(res && res.result !== undefined ? res.result : res); };
        tx.onerror = function () { ko(tx.error); };
      });
    });
  }

  /** Enregistre une copie ; ne garde que les GARDER plus récentes */
  function ajouter(json, raison, resume) {
    return transaction('readwrite', function (st) {
      return st.add({ date: new Date().toISOString(), raison: raison, resume: resume || '', taille: json.length, json: json });
    }).then(nettoyer).catch(function (e) { console.warn('Copie impossible :', e); });
  }

  function lister() {
    return transaction('readonly', function (st) { return st.getAll(); }).then(function (liste) {
      return (liste || []).map(function (c) { return { id: c.id, date: c.date, raison: c.raison, resume: c.resume, taille: c.taille }; })
        .sort(function (a, b) { return b.id - a.id; });
    }).catch(function () { return []; });
  }

  function lire(id) {
    return transaction('readonly', function (st) { return st.get(id); }).then(function (c) { return c ? c.json : null; });
  }

  function nettoyer() {
    return lister().then(function (liste) {
      var trop = liste.slice(GARDER);
      if (!trop.length) return;
      return transaction('readwrite', function (st) { trop.forEach(function (c) { st.delete(c.id); }); });
    });
  }

  global.TontineCopies = { ajouter: ajouter, lister: lister, lire: lire, GARDER: GARDER };
})(this);
