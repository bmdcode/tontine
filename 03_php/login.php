<?php
require_once __DIR__ . '/fonctions.php';
if (isset($_GET['sortir'])) {
    unset($_SESSION['admin']);
    redirect('login.php');
}
if (ADMIN_PASSWORD === '') redirect('index.php');
$erreur = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (hash_equals(ADMIN_PASSWORD, (string)($_POST['mdp'] ?? ''))) {
        session_regenerate_id(true);
        $_SESSION['admin'] = true;
        redirect('index.php');
    }
    $erreur = 'Mot de passe incorrect.';
}
?><!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connexion · <?= e(APP_NAME) ?></title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"></head>
<body class="bg-light d-flex align-items-center" style="min-height:100vh">
<form method="post" class="card shadow-sm mx-auto p-4" style="max-width:360px;width:100%">
    <h1 class="h5 mb-3"><?= e(APP_NAME) ?></h1>
    <?php if ($erreur): ?><div class="alert alert-danger py-2"><?= e($erreur) ?></div><?php endif; ?>
    <label class="form-label">Mot de passe administrateur</label>
    <input type="password" name="mdp" class="form-control mb-3" autofocus required>
    <button class="btn btn-success w-100">Se connecter</button>
</form>
</body></html>
