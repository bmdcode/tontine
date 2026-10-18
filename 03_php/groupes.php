<?php
/* =====================================================================
 *  groupes.php — Tableaux de 10, démarrage et permutation des tours (Module B)
 * ===================================================================== */
require_once __DIR__ . '/fonctions.php';
exiger_connexion();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $gid = (int)($_POST['groupe_id'] ?? 0);
    try {
        switch ($_POST['action'] ?? '') {
            case 'creer':
                $gid = creer_groupe();
                flash('success', 'Groupe ' . groupe($gid)['code'] . ' créé.');
                break;
            case 'demarrer':
                demarrer_groupe($gid);
                flash('success', 'Groupe démarré : l\'échéance 1 est ouverte dans « Paiements ».');
                break;
            case 'permuter':
                $d = permuter($gid, [$_POST['a'] ?? '', $_POST['b'] ?? '', $_POST['c'] ?? '']);
                flash('success', "Permutation effectuée : $d");
                break;
            case 'tirage':
                flash('success', tirage_au_sort($gid));
                break;
            case 'remplacer':
                transferer_part((int)$_POST['part_id'], (int)$_POST['membre_id']);
                flash('success', 'Titulaire remplacé.');
                break;
            case 'retirer':
                retirer_part($gid, (int)$_POST['membre_id']);
                flash('success', 'Part retirée du groupe.');
                break;
        }
    } catch (TontineException $ex) {
        flash('danger', $ex->getMessage());
    }
    redirect('groupes.php' . ($gid ? '?groupe=' . $gid : ''));
}

$groupes = liste_groupes();
$gid = (int)($_GET['groupe'] ?? ($groupes[0]['id'] ?? 0));
$g = $gid ? groupe($gid) : null;
$badges = ['OUVERT' => 'secondary', 'EN_COURS' => 'success', 'CLOTURE' => 'dark'];
$libelles = ['OUVERT' => 'Ouvert', 'EN_COURS' => 'En cours', 'CLOTURE' => 'Clôturé'];

$titre = 'Groupes de dix';
require __DIR__ . '/header.php';
?>
<div class="row g-4">
    <div class="col-lg-3">
        <div class="list-group shadow-sm mb-3">
            <?php foreach ($groupes as $x): $pct = (int)$x['quarts_pris'] * 25 / 10; ?>
                <a href="?groupe=<?= (int)$x['id'] ?>" class="list-group-item list-group-item-action <?= (int)$x['id'] === $gid ? 'active' : '' ?>">
                    <div class="d-flex justify-content-between">
                        <strong><?= e($x['code']) ?></strong>
                        <span class="badge bg-<?= $badges[$x['statut']] ?>"><?= $libelles[$x['statut']] ?></span>
                    </div>
                    <small><?= $x['statut'] === 'OUVERT' ? "Rempli à $pct %" : ($x['statut'] === 'EN_COURS' ? 'Échéance ' . (int)$x['tour_courant'] . '/10' : 'Terminé') ?></small>
                </a>
            <?php endforeach; if (!$groupes): ?>
                <div class="list-group-item text-muted">Aucun groupe. Ils sont créés automatiquement lors de l'attribution des parts.</div>
            <?php endif; ?>
        </div>
        <form method="post"><input type="hidden" name="action" value="creer">
            <button class="btn btn-outline-success w-100">+ Nouveau groupe vide</button></form>
    </div>

    <div class="col-lg-9">
    <?php if ($g): $tableau = tableau_groupe($gid); ?>
        <div class="card shadow-sm mb-4">
            <div class="card-header bg-white d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div><span class="h5 mb-0"><?= e($g['code']) ?></span>
                    <span class="badge bg-<?= $badges[$g['statut']] ?> ms-2"><?= $libelles[$g['statut']] ?></span>
                    <span class="text-muted small ms-2">Mise <?= fcfa($g['mise_reference']) ?> · Lot d'une case <?= fcfa($g['mise_reference'] * 10) ?></span></div>
                <div class="d-flex gap-2">
                <?php if ($g['statut'] === 'OUVERT' || ($g['statut'] === 'EN_COURS' && (int)$g['tour_courant'] <= NB_POSITIONS - 2)): ?>
                    <form method="post" data-confirm="<?= $g['statut'] === 'OUVERT'
                        ? 'Tirer au sort l\'ordre des 10 tours ? Les co-titulaires d\'une case restent ensemble.'
                        : 'Tirer au sort les tours ' . ((int)$g['tour_courant'] + 1) . ' à 10 ? Les tours levés et le tour en cours ne bougent pas.' ?>">
                        <input type="hidden" name="action" value="tirage"><input type="hidden" name="groupe_id" value="<?= $gid ?>">
                        <button class="btn btn-outline-success btn-sm">🎲 Tirage au sort</button></form>
                <?php endif; ?>
                <?php if ($g['statut'] === 'OUVERT'): ?>
                    <form method="post" data-confirm="Démarrer ce groupe ? Plus aucune part ne pourra y être ajoutée.">
                        <input type="hidden" name="action" value="demarrer"><input type="hidden" name="groupe_id" value="<?= $gid ?>">
                        <button class="btn btn-success btn-sm">Démarrer le groupe</button></form>
                <?php elseif ($g['statut'] === 'EN_COURS'): ?>
                    <a class="btn btn-success btn-sm" href="paiements.php?groupe=<?= $gid ?>">Encaisser l'échéance <?= (int)$g['tour_courant'] ?></a>
                <?php endif; ?>
                </div>
            </div>
            <div class="table-responsive">
                <table class="table table-sm mb-0">
                    <thead class="table-light"><tr><th class="text-center" style="width:60px">Tour</th><th>Titulaire(s)</th>
                        <th class="text-center">Rempli</th><th class="text-end">Lot</th><th>État</th></tr></thead>
                    <tbody>
                    <?php foreach ($tableau as $pos => $l):
                        $cls = ['Reçu' => 'text-muted', 'Bénéficiaire du mois' => 'table-warning', 'À compléter' => 'table-danger'][$l['etat']] ?? ''; ?>
                        <tr class="<?= $cls ?>">
                            <td class="text-center fw-bold"><?= $pos ?></td>
                            <td>
                                <?php foreach ($l['titulaires'] as $t): ?>
                                    <span class="d-inline-flex align-items-center me-2">
                                        <?= e($t['nom'] . ' ' . $t['prenom']) ?>&nbsp;<span class="badge text-bg-light border"><?= $t['quarts'] * 25 ?> %</span>
                                        <?php if ($g['statut'] === 'OUVERT'): ?>
                                            <form method="post" class="d-inline ms-1" data-confirm="Retirer cette part du groupe ?">
                                                <input type="hidden" name="action" value="retirer"><input type="hidden" name="groupe_id" value="<?= $gid ?>">
                                                <input type="hidden" name="membre_id" value="<?= (int)$t['membre_id'] ?>">
                                                <button class="btn btn-link btn-sm p-0 text-danger text-decoration-none" title="Retirer">×</button></form>
                                        <?php endif; ?>
                                    </span>
                                <?php endforeach; if (!$l['titulaires']): ?><span class="case-libre">— libre —</span><?php endif; ?>
                            </td>
                            <td class="text-center"><?= $l['quarts'] * 25 ?> %</td>
                            <td class="text-end"><?= fcfa($l['lot']) ?></td>
                            <td><?= e($l['etat']) ?></td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>

        <?php if ($g['statut'] !== 'CLOTURE'): $min = $g['statut'] === 'EN_COURS' ? (int)$g['tour_courant'] : 1; ?>
        <div class="row g-4">
            <div class="col-md-7">
                <div class="card shadow-sm">
                    <div class="card-header bg-white fw-semibold">Permutation des tours</div>
                    <form method="post" class="card-body" data-confirm="Les membres concernés ont-ils donné leur accord ?">
                        <input type="hidden" name="action" value="permuter"><input type="hidden" name="groupe_id" value="<?= $gid ?>">
                        <div class="row g-2">
                            <?php foreach (['a' => 'Tour A', 'b' => 'Tour B', 'c' => 'Tour C (facultatif)'] as $k => $lib): ?>
                                <div class="col-4"><label class="form-label small mb-1"><?= $lib ?></label>
                                    <select name="<?= $k ?>" class="form-select" <?= $k !== 'c' ? 'required' : '' ?>>
                                        <option value="">—</option>
                                        <?php for ($p = $min; $p <= NB_POSITIONS; $p++): ?><option value="<?= $p ?>"><?= $p ?></option><?php endfor; ?>
                                    </select></div>
                            <?php endforeach; ?>
                        </div>
                        <div class="form-text mb-2">2 tours : A ↔ B. 3 tours : rotation A → B → C → A. Les tours déjà levés ne sont pas proposés.</div>
                        <button class="btn btn-success">Permuter</button>
                    </form>
                </div>
            </div>
            <div class="col-md-5">
                <div class="card shadow-sm h-100">
                    <div class="card-header bg-white fw-semibold">Historique (permutations, tirages, remplacements)</div>
                    <ul class="list-group list-group-flush small">
                        <?php foreach (historique_permutations($gid) as $h): ?>
                            <li class="list-group-item"><span class="text-muted"><?= e($h['date_operation']) ?></span> · <?= e($h['description']) ?></li>
                        <?php endforeach; ?>
                    </ul>
                </div>
            </div>
        </div>
        <?php
            $dans = [];
            foreach ($tableau as $l) foreach ($l['titulaires'] as $t) $dans[] = (int)$t['membre_id'];
            $parts_g = q('SELECT p.id, p.position, p.quarts, m.nom, m.prenom FROM parts p JOIN membres m ON m.id = p.membre_id
                          WHERE p.groupe_id = ? ORDER BY p.position, m.nom', [$gid]);
        ?>
        <?php if ($parts_g): ?>
        <div class="card shadow-sm mt-4">
            <div class="card-header bg-white fw-semibold">Remplacer un titulaire</div>
            <form method="post" class="card-body row g-2 align-items-end" data-confirm="Céder cette part au nouveau titulaire ?">
                <input type="hidden" name="action" value="remplacer"><input type="hidden" name="groupe_id" value="<?= $gid ?>">
                <div class="col-md-5"><label class="form-label small mb-1">Part à céder</label>
                    <select name="part_id" class="form-select"><?php foreach ($parts_g as $pp): ?>
                        <option value="<?= (int)$pp['id'] ?>">Tour <?= (int)$pp['position'] ?> — <?= e($pp['nom'] . ' ' . $pp['prenom']) ?> (<?= $pp['quarts'] * 25 ?> %)</option>
                    <?php endforeach; ?></select></div>
                <div class="col-md-5"><label class="form-label small mb-1">Nouveau titulaire (déjà inscrit)</label>
                    <select name="membre_id" class="form-select" required><option value="">— choisir —</option>
                        <?php foreach (liste_membres() as $mm): if (in_array((int)$mm['id'], $dans, true)) continue; ?>
                            <option value="<?= (int)$mm['id'] ?>"><?= e($mm['nom'] . ' ' . $mm['prenom'] . ' · ' . $mm['telephone']) ?></option>
                        <?php endforeach; ?></select></div>
                <div class="col-md-2"><button class="btn btn-success w-100">Remplacer</button></div>
                <div class="col-12 form-text">En cas de départ ou de cession : le nouveau titulaire reprend la part, son tour et les cotisations.</div>
            </form>
        </div>
        <?php endif; ?>
        <?php endif; ?>
    <?php endif; ?>
    </div>
</div>
<?php require __DIR__ . '/footer.php'; ?>
