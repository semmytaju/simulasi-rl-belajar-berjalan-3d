<?php
/**
 * Konfigurasi Utama Aplikasi - BalanceAI Lab
 * Simulasi Reinforcement Learning: Orang Baru Belajar Berjalan (Bipedal Walker)
 * Stack: PHP 8+, MySQL (db_balance_ai), HTML5, CSS3, JS ES6+, Three.js, TensorFlow.js, Web Workers
 */

// 1. Deteksi Base URL / APP_PATH secara otomatis
if (!defined('APP_PATH')) {
    if (php_sapi_name() === 'cli' || empty($_SERVER['HTTP_HOST'])) {
        $folderName = basename(dirname(__DIR__, 2));
        define("APP_PATH", "http://localhost/" . $folderName);
    } else {
        $is_https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);
        $protocol = $is_https ? 'https://' : 'http://';
        $host = $_SERVER['HTTP_HOST'];
        $scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
        $cleanDir = preg_replace('#/public$#', '', $scriptDir);
        define("APP_PATH", $protocol . $host . $cleanDir);
    }
}

// 2. Direktori Root Proyek (Filesystem Path)
if (!defined('BASEPATH')) {
    define('BASEPATH', dirname(__DIR__, 2));
}

// 3. Konfigurasi Database MySQL (Database Baru: db_balance_ai)
define("HOST_DB", "localhost");
define("NAME_DB", "db_balance_ai"); // Database khusus simulasi RL Orang Belajar Berjalan
define("USER_DB", "root");
define("PASS_DB", "");              // Otomatis fallback ke "", "12345", dan "root" di Database.php

// 4. Informasi Proyek / Metadata Edukasi Mahasiswa
define("APP_NAME", "BalanceAI — Simulasi RL Orang Belajar Berjalan");
define("APP_SHORT_NAME", "BalanceAI");
define("APP_DESC", "Media Pembelajaran Interaktif Reinforcement Learning (Three.js + TensorFlow.js + Web Workers + PHP 8 & MySQL)");
define("APP_VERSION", "2.0.0");
define("APP_AUTHOR", "Laboratorium Kecerdasan Buatan & Robotika");

// 5. Kunci Enkripsi & Keamanan Aplikasi
define('APP_ENC_KEY', hash('sha256', 'BALANCE_AI_RL_WALKER_SECRET_KEY_2026', true));
define('APP_BIDX_KEY', hash('sha256', 'BALANCE_AI_RL_WALKER_BLIND_INDEX_2026', true));
