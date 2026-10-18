<?php
/* =====================================================================
 *  membres.php — Inscription et attribution des parts (Module A)
 * ===================================================================== */
require_once __DIR__ . '/fonctions.php';
exiger_connexion();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    $retour = 'membres.php';
    try {
        if ($action === 'inscrire') {
            $id = ajouter_membre($_POST['nom'] ?? '', $_POST['prenom'] ?? '', $_POST['telephone'] ?? '',
                                 $_POST['telephone2'] ?? '', $_POST['cni'] ?? '');
            $quarts = (int)($_POST['quarts'] ?? 0);
            if ($quarts) {
                $places = attribuer($id, $quarts);
                flash('success', "Membre inscrit et parts attribuées :\n" . implode("\n", array_map(
                    fn($p) => "• Groupe {$p[0]}, tour {$p[1]} (" . ($quarts * 25) . ' %)', $places)));
            } else {
                flash('success', 'Membre inscrit. Attribuez-lui maintenant une formule de parts.');
            }
            $retour = 'membres.php?voir=' . $id;
        } elseif ($action === 'modifier') {
            $id = (int)$_POST['membre_id'];
            modifier_membre($id, $_POST['nom'] ?? '', $_POST['prenom'] ?? '', $_POST['telephone'] ?? '',
                            $_POST['telephone2'] ?? '', $_POST['cni'] ?? '');
            flash('success', 'Fiche mise à jour.');
            $retour = 'membres.php?voir=' . $id;
        } elseif ($action === 'attribuer') {
            $id = (int)$_POST['membre_id'];
            $quarts = (int)$_POST['quarts'];
            $places = attribuer($id, $quarts);
            flash('success', "Parts attribuées :\n" . implode("\n", array_map(
                fn($p) => "• Groupe {$p[0]}, tour {$p[1]} (" . ($quarts * 25) . ' %)', $places)));
            $retour = 'membres.php?voir=' . $id;
        } elseif ($action === 'supprimer') {
            supprimer_membre((int)$_POST['membre_id']);
            flash('success', 'Membre supprimé.');
        }
    } catch (TontineException $ex) {
        flash('danger', $ex->getMessage());
        if ($action === 'modifier') $retour = 'membres.php?modifier=' . (int)$_POST['membre_id'];
    }
    redirect($retour);
}

$recherche = trim($_GET['q'] ?? '');
$membres = liste_membres($recherche);
$voir = (int)($_GET['voir'] ?? 0);
$membre_vu = $voir ? membre($voir) : null;
$edition = (int)($_GET['modifier'] ?? 0);
$membre_edite = $edition ? membre($edition) : null;
$champ = function (string $nom, string $lib, $val = '', bool $requis = false, string $extra = '') {
    return '<div class="mb-2"><label class="form-label small mb-1">' . e($lib) . '</label><input name="' . $nom . '" class="form-control" value="'
        . e($val) . '"' . ($requis ? ' required' : '') . ' ' . $extra . '></div>';
};

$titre = 'Membres';
require __DIR__ . '/header.php';
?>
<div class="row g-4">
    <div class="col-lg-4">
        <?php if ($membre_edite): ?>
        <div class="card shadow-sm mb-4 border-success">
            <div class="card-header bg-white fw-semibold">Modifier la fiche n° <?= (int)$membre_edite['id'] ?></div>
            <form method="post" class="card-body">
                <input type="hidden" name="action" value="modifier">
                <input type="hidden" name="membre_id" value="<?= (int)$membre_edite['id'] ?>">
                <?= $champ('nom', 'Nom', $membre_edite['nom'], true) ?>
                <?= $champ('prenom', 'Prénom', $membre_edite['prenom'], true) ?>
                <?= $champ('telephone', 'Téléphone', $membre_edite['telephone'], true, 'inputmode="tel"') ?>
                <?= $champ('telephone2', '2e téléphone (facultatif)', $membre_edite['telephone2'] ?? '', false, 'inputmode="tel"') ?>
                <?= $champ('cni', 'N° CNI (facultatif)', $membre_edite['cni'] ?? '') ?>
                <div class="d-flex gap-2 mt-3"><button class="btn btn-success flex-fill">Enregistrer les modifications</button>
                    <a class="btn btn-outline-secondary" href="membres.php?voir=<?= (int)$membre_edite['id'] ?>">Annuler</a></div>
            </form>
        </div>
        <?php endif; ?>
        <div class="card shadow-sm mb-4">
            <div class="card-header bg-white fw-semibold">Inscrire un membre</div>
            <form method="post" class="card-body">
                <input type="hidden" name="action" value="inscrire">
                <?= $champ('nom', 'Nom', '', true, $membre_edite ? '' : 'autofocus') ?>
                <?= $champ('prenom', 'Prénom', '', true) ?>
                <?= $champ('telephone', 'Téléphone', '', true, 'inputmode="tel" placeholder="77 000 00 00"') ?>
                <?= $champ('telephone2', '2e téléphone (facultatif)', '', false, 'inputmode="tel"') ?>
                <?= $champ('cni', 'N° CNI (facultatif)') ?>
                <div class="mb-3"><label class="form-label small mb-1">Formule de parts (facultatif)</label>
                    <select name="quarts" class="form-select">
                        <option value="0">— attribuer plus tard —</option>
                        <?php foreach (FORMULES as $q => $lib): ?><option value="<?= $q ?>"><?= e($lib) ?></option><?php endforeach; ?>
                    </select>
                    <div class="form-text">Mise de référence : <?= fcfa(get_mise()) ?> par échéance pour une part entière.</div>
                </div>
                <button class="btn btn-success w-100">Enregistrer</button>
            </form>
        </div>

        <?php if ($membre_vu): $parts = parts_du_membre($voir); ?>
        <div class="card shadow-sm border-success">
            <div class="card-header bg-white d-flex justify-content-between align-items-center">
                <span class="fw-semibold"><?= e($membre_vu['nom'] . ' ' . $membre_vu['prenom']) ?></span>
                <a class="btn btn-sm btn-outline-success" href="membres.php?modifier=<?= $voir ?>">Modifier</a></div>
            <div class="card-body py-2 small text-muted border-bottom">Tél. <?= e($membre_vu['telephone']) ?>
                <?= $membre_vu['telephone2'] ? ' · ' . e($membre_vu['telephone2']) : '' ?>
                · <?= $membre_vu['cni'] ? 'CNI ' . e($membre_vu['cni']) : 'CNI non renseignée' ?></div>
            <ul class="list-group list-group-flush">
                <?php foreach ($parts as $p):
                    $etat = etat_position($p, (int)$p['position'], QUARTS_CASE);
                    if ($p['statut'] === 'OUVERT') $etat = 'Groupe non démarré'; ?>
                    <li class="list-group-item d-flex justify-content-between">
                        <span><a href="groupes.php?groupe=<?= (int)$p['groupe_id'] ?>"><?= e($p['code']) ?></a> · tour <?= (int)$p['position'] ?> · <?= $p['quarts'] * 25 ?> %</span>
                        <span class="small text-muted"><?= e($etat) ?></span></li>
                <?php endforeach; if (!$parts): ?>
                    <li class="list-group-item text-muted">Aucune part pour le moment.</li>
                <?php endif; ?>
            </ul>
            <form method="post" class="card-body border-top">
                <input type="hidden" name="action" value="attribuer">
                <input type="hidden" name="membre_id" value="<?= $voir ?>">
                <label class="form-label small mb-1">Ajouter une souscription</label>
                <div class="input-group">
                    <select name="quarts" class="form-select">
                        <?php foreach (FORMULES as $q => $lib): ?><option value="<?= $q ?>"><?= e($lib) ?></option><?php endforeach; ?>
                    </select>
                    <button class="btn btn-success">Attribuer</button>
                </div>
            </form>
        </div>
        <?php endif; ?>
    </div>

    <div class="col-lg-8">
        <div class="card shadow-sm">
            <div class="card-header bg-white">
                <form class="d-flex gap-2" method="get">
                    <input name="q" value="<?= e($recherche) ?>" class="form-control" placeholder="Rechercher : nom, téléphone ou n° CNI">
                    <button class="btn btn-outline-secondary">Rechercher</button>
                </form>
            </div>
            <div class="table-responsive">
                <table class="table table-sm table-hover mb-0">
                    <thead class="table-light"><tr><th>#</th><th>Nom et prénom</th><th>Téléphone</th><th>Inscrit le</th>
                        <th class="text-center">Parts</th><th class="text-center">Engagement</th><th></th></tr></thead>
                    <tbody>
                    <?php foreach ($membres as $m): ?>
                        <tr class="<?= $voir === (int)$m['id'] ? 'table-success' : '' ?>">
                            <td><?= (int)$m['id'] ?></td>
                            <td><a href="?voir=<?= (int)$m['id'] ?>&q=<?= urlencode($recherche) ?>"><?= e($m['nom'] . ' ' . $m['prenom']) ?></a>
                                <?= $m['cni'] ? '<div class="small text-muted">CNI ' . e($m['cni']) . '</div>' : '' ?></td>
                            <td><?= e($m['telephone']) ?><?= $m['telephone2'] ? '<div class="small text-muted">' . e($m['telephone2']) . '</div>' : '' ?></td>
                            <td><?= e($m['date_inscription']) ?></td>
                            <td class="text-center"><?= (int)$m['nb_parts'] ?></td>
                            <td class="text-center"><?= (int)$m['engagement'] ?> %</td>
                            <td class="text-end">
                                <?php if (!(int)$m['nb_parts']): ?>
                                <form method="post" class="d-inline" data-confirm="Supprimer définitivement ce membre ?">
                                    <input type="hidden" name="action" value="supprimer">
                                    <input type="hidden" name="membre_id" value="<?= (int)$m['id'] ?>">
                                    <button class="btn btn-sm btn-outline-danger">Supprimer</button>
                                </form>
                                <?php endif; ?>
                            </td>
                        </tr>
                    <?php endforeach; if (!$membres): ?>
                        <tr><td colspan="7" class="text-center text-muted py-3">Aucun membre.</td></tr>
                    <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>
<?php require __DIR__ . '/footer.php'; ?>
