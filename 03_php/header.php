<?php
/* En-tête commun : Bootstrap 5 par CDN, menu, messages flash. Définir $titre avant l'inclusion. */
require_once __DIR__ . '/fonctions.php';
exiger_connexion();
$page = basename($_SERVER['SCRIPT_NAME']);
$menu = [
    'index.php'     => 'Tableau de bord',
    'membres.php'   => 'Membres',
    'groupes.php'   => 'Groupes de dix',
    'paiements.php' => 'Paiements',
];
?><!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= e(($titre ?? '') . ' · ' . APP_NAME) ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background: #f4f6f5; }
        .navbar-brand { font-weight: 700; letter-spacing: .3px; }
        .carte-chiffre .valeur { font-size: 1.45rem; font-weight: 700; }
        .table td, .table th { vertical-align: middle; }
        .case-libre { color: #adb5bd; font-style: italic; }
        @media print { .no-print { display: none !important; } body { background: #fff; } }
    </style>
</head>
<body>
<nav class="navbar navbar-expand-md navbar-dark bg-success mb-4 no-print">
    <div class="container">
        <a class="navbar-brand" href="index.php"><?= e(APP_NAME) ?></a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav">
            <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="nav">
            <ul class="navbar-nav me-auto">
                <?php foreach ($menu as $url => $lib): ?>
                    <li class="nav-item"><a class="nav-link <?= $page === $url ? 'active fw-semibold' : '' ?>" href="<?= $url ?>"><?= e($lib) ?></a></li>
                <?php endforeach; ?>
            </ul>
            <span class="navbar-text small">Mise : <?= fcfa(get_mise()) ?></span>
            <?php if (ADMIN_PASSWORD !== ''): ?>
                <a class="btn btn-sm btn-outline-light ms-3" href="login.php?sortir=1">Déconnexion</a>
            <?php endif; ?>
        </div>
    </div>
</nav>
<main class="container pb-5">
<?php foreach ($_SESSION['flash'] ?? [] as [$type, $msg]): ?>
    <div class="alert alert-<?= e($type) ?> alert-dismissible fade show"><?= nl2br(e($msg)) ?>
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>
<?php endforeach; unset($_SESSION['flash']); ?>
