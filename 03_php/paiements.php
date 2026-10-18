<?php
/* =====================================================================
 *  paiements.php — Enregistrement Payé / Impayé et clôture d'échéance (Module C)
 * ===================================================================== */
require_once __DIR__ . '/fonctions.php';
exiger_connexion();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $gid = (int)($_POST['groupe_id'] ?? 0);
    $ech = (int)($_POST['echeance'] ?? 0);
    try {
        $action = $_POST['action'] ?? '';
        if ($action === 'PAYE' || $action === 'IMPAYE') {
            $ids = array_map('intval', $_POST['ids'] ?? []);
            if (!$ids) throw new TontineException('Cochez au moins une ligne.');
            marquer($ids, $action);
            flash('success', count($ids) . ' ligne(s) marquée(s) « ' . ($action === 'PAYE' ? 'Payé' : 'Impayé') . ' ».');
        } elseif ($action === 'remise') {
            enregistrer_remise((int)$_POST['part_id'], $ech, $_POST['mode'] ?? '', $_POST['reference'] ?? '',
                               $_POST['date'] ?? '', $_POST['observation'] ?? '');
            flash('success', 'Remise du lot enregistrée.');
        } elseif ($action === 'annuler_remise') {
            annuler_remise((int)$_POST['remise_id']);
            flash('success', 'Remise annulée.');
        } elseif ($action === 'cloturer') {
            $suivant = cloturer_echeance($gid);
            flash('success', $suivant > NB_POSITIONS ? 'Groupe terminé : les 10 tours sont levés.' : "Échéance $suivant ouverte.");
            $ech = 0;
        }
    } catch (TontineException $ex) {
        flash('danger', $ex->getMessage());
    }
    redirect("paiements.php?groupe=$gid" . ($ech ? "&echeance=$ech" : ''));
}

$en_cours = liste_groupes('EN_COURS');
$gid = (int)($_GET['groupe'] ?? ($en_cours[0]['id'] ?? 0));
$g = $gid ? groupe($gid) : null;
if ($g && $g['statut'] !== 'EN_COURS') $g = null;

$titre = 'Paiements';
require __DIR__ . '/header.php';

if (!$g): ?>
    <div class="alert alert-info">Aucun groupe en cours. Remplissez un groupe à 100 % puis démarrez-le depuis
        <a href="groupes.php">Groupes de dix</a>.</div>
<?php require __DIR__ . '/footer.php'; exit; endif;

$tour = (int)$g['tour_courant'];
$ech = min(max((int)($_GET['echeance'] ?? $tour), 1), $tour);
$lignes = versements_echeance($gid, $ech);
$attendu = array_sum(array_column($lignes, 'montant'));
$encaisse = array_sum(array_map(fn($l) => $l['statut'] === 'PAYE' ? (int)$l['montant'] : 0, $lignes));
$beneficiaires = array_filter(tableau_groupe($gid)[$tour]['titulaires']);
$remises = beneficiaires($gid, $ech);
$non_remis = count(array_filter(beneficiaires($gid, $tour), fn($b) => !$b['remise_id']));
$corriger = (int)($_GET['corriger'] ?? 0);
?>
<form class="row g-2 align-items-end mb-3" method="get">
    <div class="col-auto"><label class="form-label small mb-1">Groupe en cours</label>
        <select name="groupe" class="form-select" onchange="this.form.submit()">
            <?php foreach ($en_cours as $x): ?><option value="<?= (int)$x['id'] ?>" <?= (int)$x['id'] === $gid ? 'selected' : '' ?>><?= e($x['code']) ?></option><?php endforeach; ?>
        </select></div>
    <div class="col-auto"><label class="form-label small mb-1">Échéance</label>
        <select name="echeance" class="form-select" onchange="this.form.submit()">
            <?php for ($i = 1; $i <= $tour; $i++): ?><option value="<?= $i ?>" <?= $i === $ech ? 'selected' : '' ?>><?= $i ?><?= $i === $tour ? ' (en cours)' : '' ?></option><?php endfor; ?>
        </select></div>
</form>

<div class="row g-3 mb-3">
    <div class="col-md-3"><div class="card carte-chiffre shadow-sm"><div class="card-body"><div class="text-muted small">Attendu</div><div class="valeur"><?= fcfa($attendu) ?></div></div></div></div>
    <div class="col-md-3"><div class="card carte-chiffre shadow-sm"><div class="card-body"><div class="text-muted small">Encaissé</div><div class="valeur text-success"><?= fcfa($encaisse) ?></div></div></div></div>
    <div class="col-md-3"><div class="card carte-chiffre shadow-sm"><div class="card-body"><div class="text-muted small">Restant</div><div class="valeur <?= $attendu - $encaisse ? 'text-danger' : 'text-success' ?>"><?= fcfa($attendu - $encaisse) ?></div></div></div></div>
    <div class="col-md-3"><div class="card shadow-sm h-100"><div class="card-body small"><div class="text-muted">Bénéficiaire(s) du tour <?= $tour ?></div>
        <?php foreach ($beneficiaires as $b): ?><div><?= e($b['nom'] . ' ' . $b['prenom']) ?> — <?= fcfa($g['mise_reference'] * 10 * $b['quarts'] / 4) ?></div><?php endforeach; ?>
    </div></div></div>
</div>

<form method="post" class="card shadow-sm mb-3">
    <input type="hidden" name="groupe_id" value="<?= $gid ?>"><input type="hidden" name="echeance" value="<?= $ech ?>">
    <div class="table-responsive">
        <table class="table table-sm table-hover mb-0">
            <thead class="table-light"><tr><th style="width:36px"><input type="checkbox" class="form-check-input" data-tout="ids[]"></th>
                <th class="text-center">Tour</th><th>Membre</th><th>Téléphone</th><th class="text-center">Part</th>
                <th class="text-end">Montant</th><th class="text-center">Statut</th><th>Payé le</th></tr></thead>
            <tbody>
            <?php foreach ($lignes as $l): $paye = $l['statut'] === 'PAYE'; ?>
                <tr class="<?= $paye ? 'table-success' : 'table-danger' ?>">
                    <td><input type="checkbox" class="form-check-input" name="ids[]" value="<?= (int)$l['id'] ?>"></td>
                    <td class="text-center"><?= (int)$l['position'] ?></td>
                    <td><?= e($l['nom'] . ' ' . $l['prenom']) ?></td>
                    <td><?= e($l['telephone']) ?></td>
                    <td class="text-center"><?= $l['quarts'] * 25 ?> %</td>
                    <td class="text-end"><?= fcfa($l['montant']) ?></td>
                    <td class="text-center"><?= $paye ? '✔ Payé' : '✘ Impayé' ?></td>
                    <td><?= e($l['date_paiement'] ?? '') ?></td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <div class="card-footer bg-white d-flex flex-wrap gap-2">
        <button name="action" value="PAYE" class="btn btn-success">✔ Marquer comme Payé</button>
        <button name="action" value="IMPAYE" class="btn btn-outline-danger">✘ Marquer comme Impayé</button>
        <span class="small text-muted align-self-center">Cochez les lignes concernées (la case d'en-tête coche tout).</span>
    </div>
</form>

<div class="card shadow-sm mb-3">
    <div class="card-header bg-white d-flex justify-content-between flex-wrap gap-2">
        <span class="fw-semibold">Remise du lot — tour <?= $ech ?></span>
        <span class="small text-muted">Mode et référence du paiement remis à chaque bénéficiaire</span></div>
    <?php foreach ($remises as $b): $r = $b['remise_id'] && $corriger !== (int)$b['remise_id']; ?>
        <div class="card-body border-bottom">
            <div class="d-flex justify-content-between flex-wrap gap-2 mb-2">
                <div><strong><?= e($b['nom'] . ' ' . $b['prenom']) ?></strong> · <?= $b['quarts'] * 25 ?> % · <strong><?= fcfa($b['lot']) ?></strong>
                    <div class="small text-muted">Tél. <?= e($b['telephone']) ?><?= $b['telephone2'] ? ' · ' . e($b['telephone2']) : '' ?>
                        <?= $b['cni'] ? ' · CNI ' . e($b['cni']) : '' ?></div></div>
                <?php if ($b['remise_id']): ?><span class="badge text-bg-success align-self-start">✔ Lot remis le <?= e($b['date_remise']) ?></span>
                <?php else: ?><span class="badge text-bg-warning align-self-start">À remettre</span><?php endif; ?>
            </div>
            <?php if ($r): ?>
                <div><?= e(MODES[$b['mode']] ?? $b['mode']) ?><?= $b['reference'] ? ' · Réf. <strong>' . e($b['reference']) . '</strong>' : '' ?>
                    <?= $b['observation'] ? ' · ' . e($b['observation']) : '' ?></div>
                <div class="mt-2 d-flex gap-2 no-print">
                    <a class="btn btn-sm btn-outline-secondary" href="?groupe=<?= $gid ?>&echeance=<?= $ech ?>&corriger=<?= (int)$b['remise_id'] ?>">Corriger</a>
                    <form method="post" data-confirm="Annuler cette remise ? Le lot repassera « à remettre ».">
                        <input type="hidden" name="action" value="annuler_remise"><input type="hidden" name="remise_id" value="<?= (int)$b['remise_id'] ?>">
                        <input type="hidden" name="groupe_id" value="<?= $gid ?>"><input type="hidden" name="echeance" value="<?= $ech ?>">
                        <button class="btn btn-sm btn-outline-danger">Annuler la remise</button></form>
                </div>
            <?php else: ?>
                <form method="post" class="row g-2 align-items-end no-print">
                    <input type="hidden" name="action" value="remise"><input type="hidden" name="part_id" value="<?= (int)$b['part_id'] ?>">
                    <input type="hidden" name="groupe_id" value="<?= $gid ?>"><input type="hidden" name="echeance" value="<?= $ech ?>">
                    <div class="col-md-2"><label class="form-label small mb-1">Mode</label>
                        <select name="mode" class="form-select"><?php foreach (MODES as $k => $lib): ?>
                            <option value="<?= $k ?>" <?= ($b['mode'] ?: 'WAVE') === $k ? 'selected' : '' ?>><?= e($lib) ?></option><?php endforeach; ?></select></div>
                    <div class="col-md-3"><label class="form-label small mb-1">Référence (n° transaction, chèque…)</label>
                        <input name="reference" class="form-control" value="<?= e($b['reference'] ?? '') ?>"></div>
                    <div class="col-md-2"><label class="form-label small mb-1">Date</label>
                        <input type="date" name="date" class="form-control" value="<?= e($b['date_remise'] ?: today()) ?>"></div>
                    <div class="col-md-3"><label class="form-label small mb-1">Observation</label>
                        <input name="observation" class="form-control" value="<?= e($b['observation'] ?? '') ?>" placeholder="facultatif"></div>
                    <div class="col-md-2"><button class="btn btn-success w-100"><?= $b['remise_id'] ? 'Enregistrer' : 'Valider la remise' ?></button></div>
                </form>
            <?php endif; ?>
        </div>
    <?php endforeach; ?>
</div>

<?php if ($ech === $tour): ?>
<form method="post" class="text-end"
      data-confirm="<?= ($non_remis ? 'Attention : ' . $non_remis . ' lot(s) du tour ' . $tour . ' ne sont pas encore marqués comme remis. ' : '') . ($attendu - $encaisse ? 'Il reste ' . fcfa($attendu - $encaisse) . ' à recouvrer. Clôturer quand même ? Les impayés passeront en RETARDS.' : 'Échéance entièrement payée. Clôturer et passer au tour suivant ?') ?>">
    <input type="hidden" name="action" value="cloturer"><input type="hidden" name="groupe_id" value="<?= $gid ?>">
    <button class="btn btn-dark">Clôturer l'échéance <?= $tour ?> et passer au tour suivant</button>
</form>
<?php endif; ?>
<?php require __DIR__ . '/footer.php'; ?>
