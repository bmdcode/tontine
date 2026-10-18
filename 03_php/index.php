<?php
/* =====================================================================
 *  index.php — Tableau de bord, listes de contrôle et filtres (Module C)
 * ===================================================================== */
require_once __DIR__ . '/fonctions.php';
exiger_connexion();

// Paramètre : mise de référence
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['mise'])) {
    try {
        flash('success', 'Mise de référence : ' . fcfa(set_mise($_POST['mise'])) . ' (appliquée aux nouveaux groupes).');
    } catch (TontineException $ex) {
        flash('danger', $ex->getMessage());
    }
    redirect('index.php');
}

$type = array_key_exists($_GET['liste'] ?? '', RAPPORTS) ? $_GET['liste'] : 'IMPAYES';
$gid = (int)($_GET['groupe'] ?? 0) ?: null;
$rapport = rapport($type, $gid);

// Export CSV (s'ouvre directement dans Excel : séparateur « ; », UTF-8 avec BOM)
if (isset($_GET['csv'])) {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . strtolower($type) . '_' . today() . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    if ($rapport['lignes']) fputcsv($out, array_keys($rapport['lignes'][0]), ';');
    foreach ($rapport['lignes'] as $l) fputcsv($out, $l, ';');
    exit;
}

// Chiffres clés
$nb_membres = (int)q1('SELECT COUNT(*) AS n FROM membres')['n'];
$par_statut = ['OUVERT' => 0, 'EN_COURS' => 0, 'CLOTURE' => 0];
foreach (q('SELECT statut, COUNT(*) AS n FROM groupes GROUP BY statut') as $r) $par_statut[$r['statut']] = (int)$r['n'];
$situations = rapport('RESTANT')['lignes'];
$restant_mois = array_sum(array_column($situations, 'restant'));
$retards = rapport('RETARDS')['total'];
$groupes = liste_groupes();

$titre = 'Tableau de bord';
require __DIR__ . '/header.php';
?>
<div class="row g-3 mb-4">
    <?php foreach ([
        ['Membres inscrits', $nb_membres, 'text-dark'],
        ['Groupes ouverts / en cours / clôturés', "{$par_statut['OUVERT']} / {$par_statut['EN_COURS']} / {$par_statut['CLOTURE']}", 'text-dark'],
        ['Restant à recouvrer ce mois', fcfa($restant_mois), $restant_mois ? 'text-danger' : 'text-success'],
        ['Retards cumulés', fcfa($retards), $retards ? 'text-danger' : 'text-success'],
    ] as [$lib, $val, $cls]): ?>
        <div class="col-6 col-lg-3">
            <div class="card carte-chiffre shadow-sm h-100"><div class="card-body">
                <div class="text-muted small"><?= e($lib) ?></div>
                <div class="valeur <?= $cls ?>"><?= e($val) ?></div>
            </div></div>
        </div>
    <?php endforeach; ?>
</div>

<div class="card shadow-sm mb-4">
    <div class="card-header bg-white fw-semibold">Caisse du mois — groupes en cours</div>
    <div class="table-responsive">
        <table class="table table-sm mb-0">
            <thead class="table-light"><tr><th>Groupe</th><th class="text-center">Échéance</th><th class="text-end">Attendu</th>
                <th class="text-end">Encaissé</th><th class="text-end">Restant</th><th style="width:25%">Progression</th><th></th></tr></thead>
            <tbody>
            <?php foreach ($situations as $s): $pct = $s['attendu'] ? round(100 * $s['encaisse'] / $s['attendu']) : 0; ?>
                <tr>
                    <td class="fw-semibold"><?= e($s['groupe']) ?></td>
                    <td class="text-center"><?= (int)$s['echeance'] ?>/10</td>
                    <td class="text-end"><?= fcfa($s['attendu']) ?></td>
                    <td class="text-end text-success"><?= fcfa($s['encaisse']) ?></td>
                    <td class="text-end <?= $s['restant'] ? 'text-danger fw-semibold' : '' ?>"><?= fcfa($s['restant']) ?></td>
                    <td><div class="progress" style="height:8px"><div class="progress-bar bg-success" style="width:<?= $pct ?>%"></div></div></td>
                    <td class="text-end"><a class="btn btn-sm btn-outline-success" href="paiements.php?groupe=<?= (int)$s['id'] ?>">Encaisser</a></td>
                </tr>
            <?php endforeach; if (!$situations): ?>
                <tr><td colspan="7" class="text-muted text-center py-3">Aucun groupe en cours. Remplissez un groupe à 100 % puis démarrez-le.</td></tr>
            <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<div class="card shadow-sm mb-4">
    <div class="card-header bg-white">
        <form class="row g-2 align-items-end no-print" method="get">
            <div class="col-md-5">
                <label class="form-label small mb-1">Liste de contrôle</label>
                <select name="liste" class="form-select" onchange="this.form.submit()">
                    <?php foreach (RAPPORTS as $k => $lib): ?>
                        <option value="<?= $k ?>" <?= $k === $type ? 'selected' : '' ?>><?= e($lib) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label small mb-1">Groupe</label>
                <select name="groupe" class="form-select" onchange="this.form.submit()">
                    <option value="">Tous les groupes</option>
                    <?php foreach ($groupes as $g): ?>
                        <option value="<?= (int)$g['id'] ?>" <?= $gid === (int)$g['id'] ? 'selected' : '' ?>><?= e($g['code']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="col-md-4 text-md-end">
                <a class="btn btn-outline-secondary" href="?liste=<?= $type ?>&groupe=<?= (int)$gid ?>&csv=1">Exporter CSV</a>
                <button type="button" class="btn btn-outline-secondary" onclick="window.print()">Imprimer</button>
            </div>
        </form>
    </div>
    <div class="table-responsive">
        <table class="table table-sm table-hover mb-0">
            <?php if ($type === 'RESTANT'): ?>
                <thead class="table-light"><tr><th>Groupe</th><th>Échéance</th><th class="text-end">Attendu</th><th class="text-end">Encaissé</th><th class="text-end">Restant</th><th class="text-center">Impayés</th></tr></thead>
                <tbody><?php foreach ($rapport['lignes'] as $l): ?>
                    <tr><td><?= e($l['groupe']) ?></td><td><?= (int)$l['echeance'] ?></td><td class="text-end"><?= fcfa($l['attendu']) ?></td>
                        <td class="text-end"><?= fcfa($l['encaisse']) ?></td><td class="text-end fw-semibold"><?= fcfa($l['restant']) ?></td>
                        <td class="text-center"><?= (int)$l['nb_impayes'] ?></td></tr>
                <?php endforeach; ?></tbody>
            <?php elseif (in_array($type, ['A_REMETTRE', 'REMISES'], true)): ?>
                <thead class="table-light"><tr><th>Groupe</th><th class="text-center">Tour</th><th>Bénéficiaire</th><th>Téléphone</th><th>N° CNI</th>
                    <?php if ($type === 'REMISES'): ?><th>Mode</th><th>Référence</th><th>Date</th><?php endif; ?><th class="text-end">Montant</th></tr></thead>
                <tbody><?php foreach ($rapport['lignes'] as $l): ?>
                    <tr><td><?= e($l['groupe']) ?></td><td class="text-center"><?= (int)$l['echeance'] ?></td>
                        <td><?= e($l['nom'] . ' ' . $l['prenom']) ?></td><td><?= e($l['telephone']) ?></td><td><?= e($l['cni'] ?? '') ?></td>
                        <?php if ($type === 'REMISES'): ?><td><?= e(MODES[$l['mode']] ?? $l['mode']) ?></td><td><?= e($l['reference'] ?? '') ?></td>
                            <td><?= e($l['date_remise']) ?></td><?php endif; ?>
                        <td class="text-end"><?= fcfa($l['lot']) ?></td></tr>
                <?php endforeach; ?></tbody>
            <?php elseif (in_array($type, ['RECUS', 'NON_RECUS'], true)): ?>
                <thead class="table-light"><tr><th>Groupe</th><th class="text-center">Tour</th><th>Membre</th><th>Téléphone</th><th class="text-center">Part</th><th>État</th><?php if ($type === 'RECUS'): ?><th>Remise du lot</th><?php endif; ?><th class="text-end">Lot</th></tr></thead>
                <tbody><?php foreach ($rapport['lignes'] as $l): ?>
                    <tr class="<?= $l['etat'] === 'Bénéficiaire du mois' ? 'table-warning' : '' ?>">
                        <td><?= e($l['groupe']) ?></td><td class="text-center"><?= (int)$l['position'] ?></td>
                        <td><?= e($l['nom'] . ' ' . $l['prenom']) ?></td><td><?= e($l['telephone']) ?></td>
                        <td class="text-center"><?= (int)$l['pct'] ?> %</td><td><?= e($l['etat']) ?></td>
                        <?php if ($type === 'RECUS'): ?><td class="small"><?= $l['mode']
                            ? e((MODES[$l['mode']] ?? $l['mode']) . ($l['reference'] ? ' n° ' . $l['reference'] : '') . ' · ' . $l['date_remise'])
                            : '<span class="text-danger">À remettre</span>' ?></td><?php endif; ?>
                        <td class="text-end"><?= fcfa($l['lot']) ?></td></tr>
                <?php endforeach; ?></tbody>
            <?php else: ?>
                <thead class="table-light"><tr><th>Groupe</th><th class="text-center">Échéance</th><th class="text-center">Tour</th><th>Membre</th><th>Téléphone</th><th class="text-center">Part</th><th class="text-end">Montant</th></tr></thead>
                <tbody><?php foreach ($rapport['lignes'] as $l): ?>
                    <tr><td><?= e($l['groupe']) ?></td><td class="text-center"><?= (int)$l['echeance'] ?></td><td class="text-center"><?= (int)$l['position'] ?></td>
                        <td><?= e($l['nom'] . ' ' . $l['prenom']) ?></td><td><?= e($l['telephone']) ?></td>
                        <td class="text-center"><?= (int)$l['pct'] ?> %</td><td class="text-end"><?= fcfa($l['montant']) ?></td></tr>
                <?php endforeach; ?></tbody>
            <?php endif; ?>
            <tfoot><tr class="table-light fw-semibold"><td colspan="<?= ['RESTANT' => 4, 'REMISES' => 7, 'A_REMETTRE' => 4, 'RECUS' => 6][$type] ?? 5 ?>"><?= count($rapport['lignes']) ?> ligne(s)</td>
                <td colspan="2" class="text-end">Total : <?= fcfa($rapport['total']) ?></td></tr></tfoot>
        </table>
    </div>
</div>

<div class="card shadow-sm no-print" style="max-width:480px">
    <div class="card-body">
        <form method="post" class="row g-2 align-items-end">
            <div class="col-7">
                <label class="form-label small mb-1">Mise de référence (part entière, FCFA)</label>
                <input type="number" name="mise" min="4" step="4" class="form-control" value="<?= get_mise() ?>">
            </div>
            <div class="col-5"><button class="btn btn-outline-success w-100">Enregistrer</button></div>
            <div class="col-12 small text-muted">S'applique aux nouveaux groupes. Divisible par 4 (parts à 25 %).</div>
        </form>
    </div>
</div>
<?php require __DIR__ . '/footer.php'; ?>
