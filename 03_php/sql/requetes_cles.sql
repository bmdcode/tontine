-- =====================================================================
--  REQUÊTES CLÉS (valables en SQLite ET en MySQL/MariaDB)
--  Les mêmes requêtes sont utilisées dans Python et dans PHP.
--  :g = id du groupe (laisser la condition de côté pour tous les groupes)
-- =====================================================================

-- 1. IMPAYÉS de l'échéance en cours (par groupe)
SELECT g.code AS groupe, v.echeance, p.position,
       m.nom, m.prenom, m.telephone,
       p.quarts * 25 AS pourcentage, v.montant
FROM versements v
JOIN parts   p ON p.id = v.part_id
JOIN groupes g ON g.id = p.groupe_id
JOIN membres m ON m.id = p.membre_id
WHERE g.statut = 'EN_COURS'
  AND v.echeance = g.tour_courant
  AND v.statut = 'IMPAYE'
ORDER BY g.code, p.position, m.nom;

-- 2. PAYÉS de l'échéance en cours : même requête avec v.statut = 'PAYE'

-- 3. RETARDS (impayés des échéances passées, déjà clôturées)
SELECT g.code AS groupe, v.echeance, m.nom, m.prenom, m.telephone, v.montant
FROM versements v
JOIN parts   p ON p.id = v.part_id
JOIN groupes g ON g.id = p.groupe_id
JOIN membres m ON m.id = p.membre_id
WHERE v.statut = 'IMPAYE'
  AND v.echeance < g.tour_courant
ORDER BY g.code, v.echeance, m.nom;

-- 4. NON REÇUS (membres qui attendent leur tour ; tour_courant = bénéficiaire du mois)
SELECT g.code AS groupe, p.position, m.nom, m.prenom, m.telephone,
       p.quarts * 25 AS pourcentage,
       g.mise_reference * 10 * p.quarts / 4 AS lot_a_recevoir,
       CASE WHEN g.statut = 'EN_COURS' AND p.position = g.tour_courant
            THEN 'Bénéficiaire du mois' ELSE 'En attente' END AS etat
FROM parts p
JOIN groupes g ON g.id = p.groupe_id
JOIN membres m ON m.id = p.membre_id
WHERE g.statut = 'OUVERT' OR p.position >= g.tour_courant
ORDER BY g.code, p.position, m.nom;

-- 5. REÇUS (ont déjà levé la tontine)
SELECT g.code AS groupe, p.position, m.nom, m.prenom, m.telephone,
       g.mise_reference * 10 * p.quarts / 4 AS lot_recu
FROM parts p
JOIN groupes g ON g.id = p.groupe_id
JOIN membres m ON m.id = p.membre_id
WHERE g.statut <> 'OUVERT' AND p.position < g.tour_courant
ORDER BY g.code, p.position, m.nom;

-- 6. RESTANT à recouvrer pour clôturer le lot du mois (par groupe)
SELECT g.code AS groupe, g.tour_courant AS echeance,
       SUM(v.montant) AS attendu,
       SUM(CASE WHEN v.statut = 'PAYE'   THEN v.montant ELSE 0 END) AS encaisse,
       SUM(CASE WHEN v.statut = 'IMPAYE' THEN v.montant ELSE 0 END) AS restant
FROM groupes g
JOIN parts p      ON p.groupe_id = g.id
JOIN versements v ON v.part_id = p.id AND v.echeance = g.tour_courant
WHERE g.statut = 'EN_COURS'
GROUP BY g.id, g.code, g.tour_courant
ORDER BY g.code;

-- 7. Remplissage des 10 cases d'un groupe (quarts libres par position)
SELECT p.position, SUM(p.quarts) AS quarts_pris, 4 - SUM(p.quarts) AS quarts_libres
FROM parts p
WHERE p.groupe_id = :g
GROUP BY p.position
ORDER BY p.position;

-- 8. Permutation de deux tours (ex. 3 ↔ 7) en une seule requête
UPDATE parts
SET position = CASE position WHEN 3 THEN 7 WHEN 7 THEN 3 END
WHERE groupe_id = :g AND position IN (3, 7);

-- 9. Rotation de trois tours (3 → 7 → 5 → 3)
UPDATE parts
SET position = CASE position WHEN 3 THEN 7 WHEN 7 THEN 5 WHEN 5 THEN 3 END
WHERE groupe_id = :g AND position IN (3, 7, 5);

-- 10. LOTS À REMETTRE (bénéficiaires d'un tour déjà ouvert, sans remise enregistrée)
SELECT g.code AS groupe, p.position AS echeance, m.nom, m.prenom, m.telephone, m.cni,
       g.mise_reference * 10 * p.quarts / 4 AS lot
FROM parts p
JOIN groupes g ON g.id = p.groupe_id
JOIN membres m ON m.id = p.membre_id
LEFT JOIN remises r ON r.part_id = p.id AND r.echeance = p.position
WHERE g.statut <> 'OUVERT' AND p.position <= g.tour_courant AND p.position <= 10
  AND r.id IS NULL
ORDER BY g.code, p.position, m.nom;

-- 11. LOTS REMIS avec leurs références de paiement
SELECT g.code AS groupe, r.echeance, m.nom, m.prenom, m.telephone, m.cni,
       r.montant, r.mode, r.reference, r.date_remise, r.observation
FROM remises r
JOIN parts   p ON p.id = r.part_id
JOIN groupes g ON g.id = p.groupe_id
JOIN membres m ON m.id = p.membre_id
ORDER BY r.date_remise DESC, g.code;
