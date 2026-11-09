<?php
/**
 * Controller Setup & Inisialisasi Database - BalanceAI (db_balance_ai)
 */

class setup extends Controller {

    public function index() {
        header('Location: ' . APP_PATH . '/');
        exit();
    }

    public function init() {
        $this->start_default_session_app();
        $isAjax = (!empty($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest') 
                  || (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false);

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            if ($isAjax) {
                header('Content-Type: application/json');
                echo json_encode(['success' => false, 'message' => 'Metode HTTP tidak diizinkan. Gunakan POST.']);
                exit();
            }
            header('Location: ' . APP_PATH . '/');
            exit();
        }

        $sqlPath = BASEPATH . '/database/db_balance_ai.sql';

        if (!file_exists($sqlPath)) {
            $msg = 'File skema database/db_balance_ai.sql tidak ditemukan.';
            if ($isAjax) {
                header('Content-Type: application/json');
                echo json_encode(['success' => false, 'message' => $msg]);
                exit();
            }
            $_SESSION['flash_message'] = ['type' => 'danger', 'title' => 'Gagal', 'text' => $msg];
            header('Location: ' . APP_PATH . '/');
            exit();
        }

        $db = new Database();
        $result = $db->importSqlFile($sqlPath);

        if ($result['success']) {
            $msg = 'Inisialisasi database db_balance_ai berhasil diselesaikan!';
            if ($isAjax) {
                header('Content-Type: application/json');
                echo json_encode(['success' => true, 'message' => $msg]);
                exit();
            }
            $_SESSION['flash_message'] = [
                'type' => 'success',
                'title' => 'Inisialisasi Berhasil',
                'text' => $msg
            ];
        } else {
            $msg = 'Inisialisasi database gagal: ' . ($result['message'] ?? 'Kesalahan koneksi');
            if ($isAjax) {
                header('Content-Type: application/json');
                echo json_encode(['success' => false, 'message' => $msg]);
                exit();
            }
            $_SESSION['flash_message'] = [
                'type' => 'danger',
                'title' => 'Inisialisasi Gagal',
                'text' => $msg
            ];
        }

        header('Location: ' . APP_PATH . '/');
        exit();
    }
}
