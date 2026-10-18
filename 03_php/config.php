<?php
/* =====================================================================
 *  GESTIONNAIRE DE TONTINES — config.php
 *  Connexion à la base (SQLite par défaut, MySQL/MariaDB en option)
 * ===================================================================== */

// ---------- À ADAPTER ----------------------------------------------
// 'sqlite' : aucun réglage, la base est créée toute seule (recommandé)
// 'mysql'  : importer d'abord sql/schema_mysql.sql dans phpMyAdmin
const DB_DRIVER = 'sqlite';

const SQLITE_FILE = __DIR__ . '/data/tontine.sqlite';

const MYSQL_HOST = '127.0.0.1';
const MYSQL_PORT = 3306;
const MYSQL_DB   = 'tontine';
const MYSQL_USER = 'root';
const MYSQL_PASS = '';          // XAMPP/WAMP : vide ; MAMP : 'root'

// Mot de passe administrateur (laisser vide pour désactiver la connexion)
const ADMIN_PASSWORD = '';

const APP_NAME = 'Gestionnaire de Tontines';
// -------------------------------------------------------------------

date_default_timezone_set('Africa/Dakar');
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    try {
        if (DB_DRIVER === 'mysql') {
            $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', MYSQL_HOST, MYSQL_PORT, MYSQL_DB);
            $pdo = new PDO($dsn, MYSQL_USER, MYSQL_PASS, $options);
        } else {
            if (!is_dir(dirname(SQLITE_FILE))) {
                mkdir(dirname(SQLITE_FILE), 0775, true);
            }
            $nouvelle = !file_exists(SQLITE_FILE);
            $pdo = new PDO('sqlite:' . SQLITE_FILE, null, null, $options);
            $pdo->exec('PRAGMA foreign_keys = ON');
            if ($nouvelle) {
                $pdo->exec(file_get_contents(__DIR__ . '/sql/schema_sqlite.sql'));
            }
        }
        if (function_exists('migrer_schema')) {
            migrer_schema($pdo);
        }
    } catch (PDOException $e) {
        http_response_code(500);
        exit('<h3>Connexion à la base impossible</h3><p>' . htmlspecialchars($e->getMessage()) .
             '</p><p>Vérifiez les réglages dans <code>config.php</code>' .
             (DB_DRIVER === 'sqlite' ? ' et que l\'extension <b>pdo_sqlite</b> est activée dans php.ini.' : '.') . '</p>');
    }
    return $pdo;
}
