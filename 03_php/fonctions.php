<?php
/* =====================================================================
 *  GESTIONNAIRE DE TONTINES — fonctions.php
 *  Logique métier (identique aux versions Python et VBA).
 *  Requêtes écrites pour fonctionner en SQLite ET en MySQL.
 * ===================================================================== */
require_once __DIR__ . '/config.php';

const NB_POSITIONS = 10;   // strictement 10 tours par groupe
const QUARTS_CASE  = 4;    // une case pleine = 4 quarts = 100 %

const MODES = [
    'ESPECES' => 'Espèces', 'WAVE' => 'Wave', 'ORANGE_MONEY' => 'Orange Money', 'FREE_MONEY' => 'Free Money',
    'VIREMENT' => 'Virement bancaire', 'CHEQUE' => 'Chèque', 'AUTRE' => 'Autre',
];

const FORMULES = [
    4 => 'Global — 1 part à 100 % (1 groupe)',
    2 => '2 parts — 50 % dans 2 groupes',
    1 => '4 parts — 25 % dans 4 groupes',
];

class TontineException extends Exception {}

/* ---------- outils ------------------------------------------------- */
function e($v): string { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); }
function fcfa($m): string { return number_format((int)$m, 0, ',', ' ') . ' F'; }
function today(): string { return date('Y-m-d'); }

function q(string $sql, array $p = []): array
{
    $st = db()->prepare($sql);
    $st->execute($p);
    return $st->fetchAll();
}
function q1(string $sql, array $p = []): ?array
{
    $st = db()->prepare($sql);
    $st->execute($p);
    $r = $st->fetch();
    return $r === false ? null : $r;
}
function run(string $sql, array $p = []): int
{
    $st = db()->prepare($sql);
    $st->execute($p);
    return $st->rowCount();
}
function flash(string $type, string $msg): void { $_SESSION['flash'][] = [$type, $msg]; }
function redirect(string $url): void { header('Location: ' . $url); exit; }
function transaction(callable $fn)
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $r = $fn();
        $pdo->commit();
        return $r;
    } catch (Throwable $t) {
        $pdo->rollBack();
        throw $t;
    }
}

/* ---------- paramètres --------------------------------------------- */
function get_param(string $cle, string $defaut = ''): string
{
    $r = q1('SELECT valeur FROM parametres WHERE cle = ?', [$cle]);
    return $r ? $r['valeur'] : $defaut;
}
function get_mise(): int { return (int)get_param('mise_reference', '100000'); }
function set_mise($v): int
{
    $v = (int)str_replace(' ', '', (string)$v);
    if ($v <= 0 || $v % 4 !== 0) {
        throw new TontineException('La mise doit être positive et divisible par 4.');
    }
    if (run('UPDATE parametres SET valeur = ? WHERE cle = ?', [(string)$v, 'mise_reference']) === 0) {
        run('INSERT INTO parametres (cle, valeur) VALUES (?, ?)', ['mise_reference', (string)$v]);
    }
    return $v;
}

/* ---------- MODULE A : membres -------------------------------------- */
/** Contrôle et met en forme une fiche membre : [nom, prenom, tel, tel2|null, cni|null] */
function fiche_membre(string $nom, string $prenom, string $tel, string $tel2 = '', string $cni = '', int $id_exclu = 0): array
{
    $nettoie = fn($t) => str_replace([' ', '.', '-'], '', trim($t));
    $nom = mb_strtoupper(trim($nom));
    $prenom = mb_convert_case(trim($prenom), MB_CASE_TITLE);
    $tel = $nettoie($tel);
    $tel2 = $nettoie($tel2);
    $tel2 = ($tel2 === '' || $tel2 === $tel) ? null : $tel2;
    $cni = mb_strtoupper(str_replace(' ', '', trim($cni)));
    $cni = $cni === '' ? null : $cni;
    if ($nom === '' || $prenom === '' || $tel === '') {
        throw new TontineException('Nom, prénom et téléphone sont obligatoires.');
    }
    $d = q1('SELECT nom, prenom FROM membres WHERE id <> ? AND (telephone = ? OR telephone2 = ?)', [$id_exclu, $tel, $tel]);
    if ($d) throw new TontineException("Le numéro $tel est déjà utilisé par {$d['nom']} {$d['prenom']}.");
    if ($cni !== null) {
        $d = q1('SELECT nom, prenom FROM membres WHERE id <> ? AND cni = ?', [$id_exclu, $cni]);
        if ($d) throw new TontineException("Le n° CNI $cni est déjà enregistré pour {$d['nom']} {$d['prenom']}.");
    }
    return [$nom, $prenom, $tel, $tel2, $cni];
}

function ajouter_membre(string $nom, string $prenom, string $tel, string $tel2 = '', string $cni = ''): int
{
    $f = fiche_membre($nom, $prenom, $tel, $tel2, $cni);
    run('INSERT INTO membres (nom, prenom, telephone, telephone2, cni, date_inscription) VALUES (?,?,?,?,?,?)',
        array_merge($f, [today()]));
    return (int)db()->lastInsertId();
}

/** Corrige la fiche d'un membre (erreur de saisie, changement de numéro…) */
function modifier_membre(int $id, string $nom, string $prenom, string $tel, string $tel2 = '', string $cni = ''): void
{
    $f = fiche_membre($nom, $prenom, $tel, $tel2, $cni, $id);
    run('UPDATE membres SET nom = ?, prenom = ?, telephone = ?, telephone2 = ?, cni = ? WHERE id = ?', array_merge($f, [$id]));
}

function membre(int $id): ?array { return q1('SELECT * FROM membres WHERE id = ?', [$id]); }

function supprimer_membre(int $id): void
{
    if (q1('SELECT 1 FROM parts WHERE membre_id = ?', [$id])) {
        throw new TontineException('Ce membre possède des parts : impossible de le supprimer.');
    }
    run('DELETE FROM membres WHERE id = ?', [$id]);
}

function liste_membres(string $recherche = ''): array
{
    $m = '%' . trim($recherche) . '%';
    $c = '%' . mb_strtoupper(str_replace(' ', '', trim($recherche))) . '%';
    return q("SELECT m.id, m.nom, m.prenom, m.telephone, m.telephone2, m.cni, m.date_inscription,
                     COUNT(p.id) AS nb_parts, COALESCE(SUM(p.quarts), 0) * 25 AS engagement
              FROM membres m LEFT JOIN parts p ON p.membre_id = m.id
              WHERE m.nom LIKE ? OR m.prenom LIKE ? OR m.telephone LIKE ?
                 OR COALESCE(m.telephone2, '') LIKE ? OR COALESCE(m.cni, '') LIKE ?
              GROUP BY m.id, m.nom, m.prenom, m.telephone, m.telephone2, m.cni, m.date_inscription
              ORDER BY m.nom, m.prenom", [$m, $m, $c, $c, $c]);
}

function parts_du_membre(int $id): array
{
    return q('SELECT g.id AS groupe_id, g.code, g.statut, g.tour_courant, p.position, p.quarts
              FROM parts p JOIN groupes g ON g.id = p.groupe_id
              WHERE p.membre_id = ? ORDER BY g.id', [$id]);
}

/* ---------- MODULE B : groupes ---------------------------------------- */
function nouveau_code(): string
{
    $n = (int)q1('SELECT COUNT(*) AS n FROM groupes')['n'] + 1;
    while (q1('SELECT 1 FROM groupes WHERE code = ?', [sprintf('G%03d', $n)])) {
        $n++;
    }
    return sprintf('G%03d', $n);
}

function creer_groupe(?int $mise = null): int
{
    run('INSERT INTO groupes (code, mise_reference, tour_courant, statut, date_creation) VALUES (?,?,1,?,?)',
        [nouveau_code(), $mise ?? get_mise(), 'OUVERT', today()]);
    return (int)db()->lastInsertId();
}

function groupe(int $id): ?array { return q1('SELECT * FROM groupes WHERE id = ?', [$id]); }

function liste_groupes(?string $statut = null): array
{
    $sql = 'SELECT g.id, g.code, g.mise_reference, g.tour_courant, g.statut, g.date_creation, g.date_debut,
                   COALESCE(SUM(p.quarts), 0) AS quarts_pris
            FROM groupes g LEFT JOIN parts p ON p.groupe_id = g.id';
    $par = [];
    if ($statut) {
        $sql .= ' WHERE g.statut = ?';
        $par[] = $statut;
    }
    return q($sql . ' GROUP BY g.id, g.code, g.mise_reference, g.tour_courant, g.statut, g.date_creation, g.date_debut
                      ORDER BY g.id', $par);
}

/** [position => quarts pris] pour les 10 cases */
function occupation(int $gid): array
{
    $occ = array_fill(1, NB_POSITIONS, 0);
    foreach (q('SELECT position, SUM(quarts) AS s FROM parts WHERE groupe_id = ? GROUP BY position', [$gid]) as $r) {
        $occ[(int)$r['position']] = (int)$r['s'];
    }
    return $occ;
}

function etat_position(array $g, int $pos, int $quarts): string
{
    if ($g['statut'] === 'OUVERT') return $quarts === QUARTS_CASE ? 'Complet' : 'À compléter';
    if ($pos < (int)$g['tour_courant']) return 'Reçu';
    if ($pos === (int)$g['tour_courant']) return 'Bénéficiaire du mois';
    return 'En attente';
}

/** Les 10 lignes du tableau d'un groupe */
function tableau_groupe(int $gid): array
{
    $g = groupe($gid);
    $lignes = [];
    for ($pos = 1; $pos <= NB_POSITIONS; $pos++) {
        $lignes[$pos] = ['position' => $pos, 'titulaires' => [], 'quarts' => 0];
    }
    $rows = q('SELECT p.position, p.quarts, m.id AS membre_id, m.nom, m.prenom, m.telephone
               FROM parts p JOIN membres m ON m.id = p.membre_id
               WHERE p.groupe_id = ? ORDER BY p.position, m.nom', [$gid]);
    foreach ($rows as $r) {
        $lignes[(int)$r['position']]['titulaires'][] = $r;
        $lignes[(int)$r['position']]['quarts'] += (int)$r['quarts'];
    }
    foreach ($lignes as $pos => &$l) {
        $l['etat'] = etat_position($g, $pos, $l['quarts']);
        $l['lot'] = intdiv((int)$g['mise_reference'] * 10 * $l['quarts'], 4);
    }
    return $lignes;
}

/** Première case que la part complète exactement, sinon la première avec assez de place */
function meilleure_place(array $occ, int $quarts, array $deja): ?array
{
    foreach ([true, false] as $exact) {
        foreach ($occ as $gid => $cases) {
            if (in_array($gid, $deja, true)) continue;
            foreach ($cases as $pos => $pris) {
                $libre = QUARTS_CASE - $pris;
                if ($exact ? $libre === $quarts : $libre >= $quarts) {
                    return [$gid, $pos];
                }
            }
        }
    }
    return null;
}

/** MODULE A — attribution automatique : 4 quarts→1 groupe, 2→2 groupes, 1→4 groupes */
function attribuer(int $membre_id, int $quarts): array
{
    if (!isset(FORMULES[$quarts])) throw new TontineException('Formule inconnue.');
    if (!q1('SELECT 1 FROM membres WHERE id = ?', [$membre_id])) throw new TontineException('Membre introuvable.');
    $nb = intdiv(QUARTS_CASE, $quarts);
    $mise = get_mise();
    $exclus = array_map('intval', array_column(q('SELECT groupe_id FROM parts WHERE membre_id = ?', [$membre_id]), 'groupe_id'));

    $occ = [];
    foreach (q("SELECT id FROM groupes WHERE statut = 'OUVERT' AND mise_reference = ? ORDER BY id", [$mise]) as $g) {
        if (!in_array((int)$g['id'], $exclus, true)) $occ[(int)$g['id']] = occupation((int)$g['id']);
    }
    $choix = [];
    for ($i = 0; $i < $nb; $i++) {
        $place = meilleure_place($occ, $quarts, array_column($choix, 0));
        if ($place === null) break;
        $choix[] = $place;
        $occ[$place[0]][$place[1]] += $quarts;
    }
    return transaction(function () use ($choix, $nb, $mise, $membre_id, $quarts) {
        while (count($choix) < $nb) {
            $choix[] = [creer_groupe($mise), 1];
        }
        $res = [];
        foreach ($choix as [$gid, $pos]) {
            run('INSERT INTO parts (membre_id, groupe_id, position, quarts, date_attribution) VALUES (?,?,?,?,?)',
                [$membre_id, $gid, $pos, $quarts, today()]);
            $res[] = [groupe($gid)['code'], $pos];
        }
        return $res;
    });
}

function retirer_part(int $gid, int $membre_id): void
{
    if (groupe($gid)['statut'] !== 'OUVERT') {
        throw new TontineException('On ne peut retirer une part que d\'un groupe non démarré.');
    }
    run('DELETE FROM parts WHERE groupe_id = ? AND membre_id = ?', [$gid, $membre_id]);
}

function generer_echeance(int $gid, int $ech): void
{
    // NOT EXISTS : portable SQLite / MySQL (pas de INSERT OR IGNORE)
    run('INSERT INTO versements (part_id, echeance, montant, statut)
         SELECT p.id, ?, g.mise_reference * p.quarts / 4, ?
         FROM parts p JOIN groupes g ON g.id = p.groupe_id
         WHERE p.groupe_id = ?
           AND NOT EXISTS (SELECT 1 FROM versements v WHERE v.part_id = p.id AND v.echeance = ?)',
        [$ech, 'IMPAYE', $gid, $ech]);
}

function demarrer_groupe(int $gid): void
{
    $g = groupe($gid);
    if ($g['statut'] !== 'OUVERT') throw new TontineException('Ce groupe est déjà démarré.');
    $incompletes = array_keys(array_filter(occupation($gid), fn($q) => $q !== QUARTS_CASE));
    if ($incompletes) {
        throw new TontineException('Positions incomplètes : ' . implode(', ', $incompletes) .
            '. Les 10 cases doivent être remplies à 100 % avant de démarrer.');
    }
    transaction(function () use ($gid) {
        run("UPDATE groupes SET statut = 'EN_COURS', tour_courant = 1, date_debut = ? WHERE id = ?", [today(), $gid]);
        generer_echeance($gid, 1);
    });
}

/** MODULE B — 2 positions : A↔B ; 3 positions : A→B→C→A */
function permuter(int $gid, array $positions): string
{
    $positions = array_values(array_map('intval', array_filter($positions, fn($p) => $p !== '' && $p !== null)));
    if (!in_array(count($positions), [2, 3], true) || count(array_unique($positions)) !== count($positions)) {
        throw new TontineException('Choisissez 2 ou 3 positions différentes.');
    }
    foreach ($positions as $p) {
        if ($p < 1 || $p > NB_POSITIONS) throw new TontineException('Position invalide.');
    }
    $g = groupe($gid);
    if ($g['statut'] === 'CLOTURE') throw new TontineException('Ce groupe est clôturé.');
    if ($g['statut'] === 'EN_COURS') {
        $passes = array_filter($positions, fn($p) => $p < (int)$g['tour_courant']);
        if ($passes) throw new TontineException('Tour(s) ' . implode(', ', $passes) . ' déjà levé(s) : permutation impossible.');
    }
    $in0 = implode(',', $positions);
    $remis = q("SELECT DISTINCT p.position FROM parts p JOIN remises r ON r.part_id = p.id AND r.echeance = p.position
                WHERE p.groupe_id = ? AND p.position IN ($in0)", [$gid]);
    if ($remis) {
        throw new TontineException('Le lot du tour ' . implode(', ', array_column($remis, 'position')) . ' est déjà remis : permutation impossible.');
    }
    $n = count($positions);
    $case = '';
    $desc = [];
    for ($i = 0; $i < $n; $i++) {
        $a = $positions[$i];
        $b = $positions[($i + 1) % $n];
        $case .= " WHEN $a THEN $b";          // entiers validés ci-dessus
        $desc[] = "{$a}→{$b}";
    }
    $in = implode(',', $positions);
    $description = implode(', ', $desc);
    transaction(function () use ($gid, $case, $in, $description) {
        run("UPDATE parts SET position = CASE position $case END WHERE groupe_id = ? AND position IN ($in)", [$gid]);
        run('INSERT INTO permutations (groupe_id, description, date_operation) VALUES (?,?,?)',
            [$gid, $description, date('Y-m-d H:i:s')]);
    });
    return $description;
}

/** Tirage au sort de l'ordre de passage (groupe ouvert : 10 tours ; en cours : tours après le tour courant).
 *  Les co-titulaires d'une même case restent ensemble. */
function tirage_au_sort(int $gid): string
{
    $g = groupe($gid);
    if ($g['statut'] === 'CLOTURE') throw new TontineException('Ce groupe est clôturé.');
    $debut = $g['statut'] === 'EN_COURS' ? (int)$g['tour_courant'] + 1 : 1;
    $positions = $debut <= NB_POSITIONS ? range($debut, NB_POSITIONS) : [];
    if (count($positions) < 2) throw new TontineException('Il ne reste pas assez de tours à tirer au sort.');
    $tirees = $positions;
    for ($i = count($tirees) - 1; $i > 0; $i--) {          // Fisher-Yates avec random_int (aléa sûr)
        $j = random_int(0, $i);
        [$tirees[$i], $tirees[$j]] = [$tirees[$j], $tirees[$i]];
    }
    $case = '';
    $desc = [];
    foreach ($positions as $k => $a) {
        $b = $tirees[$k];
        $case .= " WHEN $a THEN $b";
        if ($a !== $b) $desc[] = "{$a}→{$b}";
    }
    $description = "Tirage au sort (tours $debut à 10) : " . ($desc ? implode(', ', $desc) : 'ordre inchangé');
    transaction(function () use ($gid, $case, $debut, $description) {
        run("UPDATE parts SET position = CASE position $case ELSE position END WHERE groupe_id = ? AND position >= ?", [$gid, $debut]);
        run('INSERT INTO permutations (groupe_id, description, date_operation) VALUES (?,?,?)', [$gid, $description, date('Y-m-d H:i:s')]);
    });
    return $description;
}

/** Remplace le titulaire d'une part (départ d'un membre, cession…) */
function transferer_part(int $part_id, int $nouveau_id): void
{
    $p = q1('SELECT * FROM parts WHERE id = ?', [$part_id]);
    if (!$p) throw new TontineException('Part introuvable.');
    $g = groupe((int)$p['groupe_id']);
    $ancien = membre((int)$p['membre_id']);
    $nouveau = membre($nouveau_id);
    if (!$nouveau) throw new TontineException('Choisissez le nouveau titulaire.');
    if ($g['statut'] === 'CLOTURE') throw new TontineException('Ce groupe est clôturé.');
    if ((int)$nouveau['id'] === (int)$ancien['id']) throw new TontineException("Le nouveau titulaire est le même que l'ancien.");
    if (q1('SELECT 1 FROM parts WHERE groupe_id = ? AND membre_id = ?', [$g['id'], $nouveau_id])) {
        throw new TontineException("{$nouveau['nom']} {$nouveau['prenom']} a déjà une part dans le groupe {$g['code']}.");
    }
    transaction(function () use ($p, $g, $ancien, $nouveau, $part_id, $nouveau_id) {
        run('UPDATE parts SET membre_id = ? WHERE id = ?', [$nouveau_id, $part_id]);
        run('INSERT INTO permutations (groupe_id, description, date_operation) VALUES (?,?,?)', [$g['id'],
            "Tour {$p['position']} : {$ancien['nom']} {$ancien['prenom']} remplacé(e) par {$nouveau['nom']} {$nouveau['prenom']}",
            date('Y-m-d H:i:s')]);
    });
}

function historique_permutations(int $gid): array
{
    return q('SELECT date_operation, description FROM permutations WHERE groupe_id = ? ORDER BY id DESC', [$gid]);
}

/* ---------- MODULE C : versements et listes ----------------------------- */
function versements_echeance(int $gid, int $ech): array
{
    return q('SELECT v.id, v.montant, v.statut, v.date_paiement, p.position, p.quarts,
                     m.nom, m.prenom, m.telephone
              FROM versements v JOIN parts p ON p.id = v.part_id JOIN membres m ON m.id = p.membre_id
              WHERE p.groupe_id = ? AND v.echeance = ?
              ORDER BY p.position, m.nom', [$gid, $ech]);
}

function marquer(array $ids, string $statut): void
{
    if (!in_array($statut, ['PAYE', 'IMPAYE'], true)) throw new TontineException('Statut invalide.');
    $date = $statut === 'PAYE' ? today() : null;
    transaction(function () use ($ids, $statut, $date) {
        foreach ($ids as $id) {
            run('UPDATE versements SET statut = ?, date_paiement = ? WHERE id = ?', [$statut, $date, (int)$id]);
        }
    });
}

/** ['echeance','attendu','encaisse','restant'] de l'échéance en cours */
function situation(int $gid): array
{
    $g = groupe($gid);
    $r = q1("SELECT COALESCE(SUM(v.montant), 0) AS attendu,
                    COALESCE(SUM(CASE WHEN v.statut = 'PAYE' THEN v.montant ELSE 0 END), 0) AS encaisse
             FROM versements v JOIN parts p ON p.id = v.part_id
             WHERE p.groupe_id = ? AND v.echeance = ?", [$gid, (int)$g['tour_courant']]);
    return ['echeance' => (int)$g['tour_courant'], 'attendu' => (int)$r['attendu'],
            'encaisse' => (int)$r['encaisse'], 'restant' => (int)$r['attendu'] - (int)$r['encaisse']];
}

function cloturer_echeance(int $gid): int
{
    $g = groupe($gid);
    if ($g['statut'] !== 'EN_COURS') throw new TontineException('Seul un groupe en cours peut avancer d\'échéance.');
    $suivant = (int)$g['tour_courant'] + 1;
    transaction(function () use ($gid, $suivant) {
        if ($suivant > NB_POSITIONS) {
            run("UPDATE groupes SET tour_courant = 11, statut = 'CLOTURE' WHERE id = ?", [$gid]);
        } else {
            run('UPDATE groupes SET tour_courant = ? WHERE id = ?', [$suivant, $gid]);
            generer_echeance($gid, $suivant);
        }
    });
    return $suivant;
}

/* ---------- remise du lot aux bénéficiaires ------------------------------ */
function beneficiaires(int $gid, int $ech): array
{
    return q('SELECT p.id AS part_id, m.nom, m.prenom, m.telephone, m.telephone2, m.cni, p.quarts,
                     g.mise_reference * 10 * p.quarts / 4 AS lot,
                     r.id AS remise_id, r.mode, r.reference, r.date_remise, r.observation
              FROM parts p JOIN groupes g ON g.id = p.groupe_id JOIN membres m ON m.id = p.membre_id
              LEFT JOIN remises r ON r.part_id = p.id AND r.echeance = ?
              WHERE p.groupe_id = ? AND p.position = ? ORDER BY m.nom', [$ech, $gid, $ech]);
}

/** Enregistre (ou corrige) la remise d'un lot : mode, référence, date, observation */
function enregistrer_remise(int $part_id, int $ech, string $mode, string $reference = '', string $date = '', string $observation = ''): void
{
    $p = q1('SELECT p.*, g.statut, g.tour_courant, g.mise_reference FROM parts p JOIN groupes g ON g.id = p.groupe_id WHERE p.id = ?', [$part_id]);
    if (!$p) throw new TontineException('Part introuvable.');
    if ((int)$p['position'] !== $ech) throw new TontineException("Ce membre n'est pas bénéficiaire de l'échéance $ech.");
    if ($p['statut'] === 'OUVERT' || $ech > (int)$p['tour_courant']) throw new TontineException("Ce tour n'est pas encore ouvert.");
    $mode = isset(MODES[$mode]) ? $mode : 'ESPECES';
    $reference = trim($reference);
    if ($mode !== 'ESPECES' && $reference === '') {
        throw new TontineException('Indiquez la référence du paiement (n° de transaction, de chèque…).');
    }
    $date = substr(trim($date), 0, 10) ?: today();
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) throw new TontineException('Date invalide.');
    $montant = intdiv((int)$p['mise_reference'] * NB_POSITIONS * (int)$p['quarts'], QUARTS_CASE);
    $obs = trim($observation) ?: null;
    $ref = $reference ?: null;
    $existe = q1('SELECT id FROM remises WHERE part_id = ? AND echeance = ?', [$part_id, $ech]);
    if ($existe) {
        run('UPDATE remises SET montant = ?, mode = ?, reference = ?, date_remise = ?, observation = ? WHERE id = ?',
            [$montant, $mode, $ref, $date, $obs, $existe['id']]);
    } else {
        run('INSERT INTO remises (part_id, echeance, montant, mode, reference, date_remise, observation) VALUES (?,?,?,?,?,?,?)',
            [$part_id, $ech, $montant, $mode, $ref, $date, $obs]);
    }
}

function annuler_remise(int $id): void { run('DELETE FROM remises WHERE id = ?', [$id]); }

const RAPPORTS = [
    'IMPAYES'   => 'Impayés (échéance en cours)',
    'PAYES'     => 'Payés (échéance en cours)',
    'RETARDS'   => 'Retards (échéances passées)',
    'NON_RECUS' => 'Non reçus (attendent leur tour)',
    'RECUS'     => 'Reçus (ont levé la tontine)',
    'RESTANT'   => 'Restant à recouvrer (par groupe)',
    'A_REMETTRE' => 'Lots à remettre aux bénéficiaires',
    'REMISES'   => 'Lots remis (références de paiement)',
];

/** Renvoie ['colonnes'=>[], 'lignes'=>[], 'total'=>int, 'col_total'=>string] */
function rapport(string $type, ?int $gid = null): array
{
    $filtre = $gid ? ' AND g.id = ?' : '';
    $par = $gid ? [$gid] : [];
    $joint_v = ' FROM versements v JOIN parts p ON p.id = v.part_id
                 JOIN groupes g ON g.id = p.groupe_id JOIN membres m ON m.id = p.membre_id ';
    switch ($type) {
        case 'PAYES':
        case 'IMPAYES':
            $lignes = q("SELECT g.code AS groupe, v.echeance, p.position, m.nom, m.prenom, m.telephone,
                                p.quarts * 25 AS pct, v.montant $joint_v
                         WHERE g.statut = 'EN_COURS' AND v.echeance = g.tour_courant AND v.statut = ? $filtre
                         ORDER BY g.code, p.position, m.nom",
                        array_merge([$type === 'PAYES' ? 'PAYE' : 'IMPAYE'], $par));
            $col = 'montant';
            break;
        case 'RETARDS':
            $lignes = q("SELECT g.code AS groupe, v.echeance, p.position, m.nom, m.prenom, m.telephone,
                                p.quarts * 25 AS pct, v.montant $joint_v
                         WHERE v.statut = 'IMPAYE' AND v.echeance < g.tour_courant $filtre
                         ORDER BY g.code, v.echeance, m.nom", $par);
            $col = 'montant';
            break;
        case 'RECUS':
        case 'NON_RECUS':
            $cond = $type === 'RECUS'
                ? "g.statut <> 'OUVERT' AND p.position < g.tour_courant"
                : "(g.statut = 'OUVERT' OR p.position >= g.tour_courant)";
            $lignes = q("SELECT g.code AS groupe, p.position, m.nom, m.prenom, m.telephone, p.quarts * 25 AS pct,
                                CASE WHEN g.statut <> 'OUVERT' AND p.position < g.tour_courant THEN 'Reçu'
                                     WHEN g.statut = 'EN_COURS' AND p.position = g.tour_courant THEN 'Bénéficiaire du mois'
                                     ELSE 'En attente' END AS etat,
                                g.mise_reference * 10 * p.quarts / 4 AS lot,
                                r.mode, r.reference, r.date_remise
                         FROM parts p JOIN groupes g ON g.id = p.groupe_id JOIN membres m ON m.id = p.membre_id
                         LEFT JOIN remises r ON r.part_id = p.id AND r.echeance = p.position
                         WHERE $cond $filtre
                         ORDER BY g.code, p.position, m.nom", $par);
            $col = 'lot';
            break;
        case 'A_REMETTRE':
        case 'REMISES':
            $null = $type === 'REMISES' ? 'IS NOT NULL' : 'IS NULL';
            $lignes = q("SELECT g.code AS groupe, p.position AS echeance, m.nom, m.prenom, m.telephone, m.cni, p.quarts * 25 AS pct,
                                COALESCE(r.montant, g.mise_reference * 10 * p.quarts / 4) AS lot,
                                r.mode, r.reference, r.date_remise, r.observation
                         FROM parts p JOIN groupes g ON g.id = p.groupe_id JOIN membres m ON m.id = p.membre_id
                         LEFT JOIN remises r ON r.part_id = p.id AND r.echeance = p.position
                         WHERE g.statut <> 'OUVERT' AND p.position <= g.tour_courant AND r.id $null $filtre
                         ORDER BY g.code, p.position, m.nom", $par);
            $col = 'lot';
            break;
        case 'RESTANT':
            $lignes = q("SELECT g.id, g.code AS groupe, g.tour_courant AS echeance,
                                SUM(v.montant) AS attendu,
                                SUM(CASE WHEN v.statut = 'PAYE' THEN v.montant ELSE 0 END) AS encaisse,
                                SUM(CASE WHEN v.statut = 'IMPAYE' THEN v.montant ELSE 0 END) AS restant,
                                SUM(CASE WHEN v.statut = 'IMPAYE' THEN 1 ELSE 0 END) AS nb_impayes
                         FROM groupes g JOIN parts p ON p.groupe_id = g.id
                         JOIN versements v ON v.part_id = p.id AND v.echeance = g.tour_courant
                         WHERE g.statut = 'EN_COURS' $filtre
                         GROUP BY g.id, g.code, g.tour_courant ORDER BY g.code", $par);
            $col = 'restant';
            break;
        default:
            throw new TontineException('Rapport inconnu.');
    }
    $total = array_sum(array_map(fn($l) => (int)$l[$col], $lignes));
    return ['lignes' => $lignes, 'total' => $total, 'col_total' => $col];
}

/* ---------- mise à niveau automatique des bases v1 -------------------- */
function migrer_schema(PDO $pdo): void
{
    if (DB_DRIVER === 'mysql') {
        $cols = $pdo->query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'membres'")
                    ->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('telephone2', $cols, true)) $pdo->exec('ALTER TABLE membres ADD COLUMN telephone2 VARCHAR(30) NULL');
        if (!in_array('cni', $cols, true)) $pdo->exec('ALTER TABLE membres ADD COLUMN cni VARCHAR(30) NULL UNIQUE');
        $pdo->exec("CREATE TABLE IF NOT EXISTS remises (
            id INT AUTO_INCREMENT PRIMARY KEY, part_id INT NOT NULL, echeance TINYINT NOT NULL, montant INT NOT NULL,
            mode VARCHAR(20) NOT NULL DEFAULT 'ESPECES', reference VARCHAR(100) NULL, date_remise DATE NOT NULL,
            observation VARCHAR(255) NULL, UNIQUE KEY uq_remise (part_id, echeance),
            CONSTRAINT fk_remises_part FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE) ENGINE=InnoDB");
    } else {
        $cols = array_column($pdo->query('PRAGMA table_info(membres)')->fetchAll(PDO::FETCH_ASSOC), 'name');
        if (!in_array('telephone2', $cols, true)) $pdo->exec('ALTER TABLE membres ADD COLUMN telephone2 TEXT');
        if (!in_array('cni', $cols, true)) $pdo->exec('ALTER TABLE membres ADD COLUMN cni TEXT');
        $pdo->exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_membres_cni ON membres (cni)');
        $pdo->exec("CREATE TABLE IF NOT EXISTS remises (
            id INTEGER PRIMARY KEY AUTOINCREMENT, part_id INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
            echeance INTEGER NOT NULL, montant INTEGER NOT NULL, mode TEXT NOT NULL DEFAULT 'ESPECES',
            reference TEXT, date_remise TEXT NOT NULL, observation TEXT, UNIQUE (part_id, echeance))");
    }
}

/* ---------- authentification simple (facultative) -------------------- */
function exiger_connexion(): void
{
    if (ADMIN_PASSWORD === '' || !empty($_SESSION['admin'])) return;
    if (basename($_SERVER['SCRIPT_NAME']) !== 'login.php') redirect('login.php');
}
