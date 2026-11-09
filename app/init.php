<?php 
date_default_timezone_set('Asia/Makassar');

@ini_set('ignore_user_abort', '1');
@ini_set('display_errors', '0');
@ini_set('log_errors', '1');
if ((int)ini_get('memory_limit') > 256 || ini_get('memory_limit') === '-1') {
    @ini_set('memory_limit', '256M');
}

require_once('config/config.php');
require_once('core/Security.php');
require_once('core/Database.php');
require_once('core/Controller.php');
require_once('core/App.php');

spl_autoload_register(function($className) {
    $modelPath = __DIR__ . '/model/' . $className . '.php';
    if (file_exists($modelPath)) {
        require_once $modelPath;
    }
});
