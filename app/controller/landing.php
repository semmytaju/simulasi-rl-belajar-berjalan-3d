<?php
/**
 * Controller Utama (Single Page Web Application) - BalanceAI Lab
 * Menangani tampilan 1-Page Web Simulasi Reinforcement Learning Orang Belajar Berjalan
 * serta endpoint API JSON terintegrasi untuk penyimpanan ke MySQL (db_balance_ai).
 */

class landing extends Controller {

    public function index() {
        // Jika request memiliki parameter ?api=... arahkan langsung ke handler API JSON
        if (isset($_GET['api']) || isset($_POST['api_action'])) {
            $this->api($_GET['api'] ?? ($_POST['api_action'] ?? ''));
            return;
        }

        $this->start_default_session_app();
        $walkerModel = $this->logic('Walker_model');

        $dbDiagnostics = $walkerModel->getDiagnostics();
        $presets = $walkerModel->getPresets();
        $activeSession = $walkerModel->getActiveSession();
        $sessionId = (int)($activeSession['id'] ?? 1);
        $episodes = $walkerModel->getSessionEpisodes($sessionId, 200);
        $savedModels = $walkerModel->getSavedModels();
        $allSessions = $walkerModel->getAllSessions(15);

        $data = [
            'title' => APP_NAME,
            'app_name' => APP_NAME,
            'app_desc' => APP_DESC,
            'app_version' => APP_VERSION,
            'db_diagnostics' => $dbDiagnostics,
            'presets' => $presets,
            'active_session' => $activeSession,
            'sessions' => $allSessions,
            'episodes' => $episodes,
            'saved_models' => $savedModels,
            'csrf_token' => $this->get_csrf_token()
        ];

        $this->display('landing/index', $data);
    }

    /**
     * Endpoint API JSON Satu Pintu untuk Komunikasi AJAX Frontend <-> MySQL (db_balance_ai)
     */
    public function api($actionParam = '') {
        $this->start_default_session_app();
        $walkerModel = $this->logic('Walker_model');

        // Baca input dari POST form-data atau JSON body
        $rawInput = file_get_contents('php://input');
        $jsonBody = [];
        if (!empty($rawInput)) {
            $decoded = json_decode($rawInput, true);
            if (is_array($decoded)) {
                $jsonBody = $decoded;
            }
        }
        $payload = array_merge($_GET, $_POST, $jsonBody);
        $action = strtolower(trim((string)($actionParam ?: ($payload['api_action'] ?? ($payload['action'] ?? 'status')))));

        try {
            switch ($action) {
                case 'status':
                case 'init_data':
                    $activeSession = $walkerModel->getActiveSession();
                    $sessionId = (int)($payload['session_id'] ?? ($activeSession['id'] ?? 1));
                    $this->json_response([
                        'success' => true,
                        'diagnostics' => $walkerModel->getDiagnostics(),
                        'presets' => $walkerModel->getPresets(),
                        'active_session' => $activeSession,
                        'sessions' => $walkerModel->getAllSessions(15),
                        'episodes' => $walkerModel->getSessionEpisodes($sessionId, 200),
                        'saved_models' => $walkerModel->getSavedModels()
                    ]);
                    break;

                case 'record_episode':
                    $res = $walkerModel->recordEpisode($payload);
                    $sessionId = (int)($payload['session_id'] ?? ($res['session']['id'] ?? 1));
                    $res['episodes'] = $walkerModel->getSessionEpisodes($sessionId, 200);
                    $this->json_response($res);
                    break;

                case 'new_session':
                    $newSess = $walkerModel->createNewSession($payload);
                    $this->json_response([
                        'success' => (bool)$newSess,
                        'active_session' => $newSess,
                        'sessions' => $walkerModel->getAllSessions(15),
                        'episodes' => []
                    ]);
                    break;

                case 'switch_session':
                    $sessionId = (int)($payload['session_id'] ?? 1);
                    $sessions = $walkerModel->getAllSessions(30);
                    $selected = null;
                    foreach ($sessions as $s) {
                        if ((int)$s['id'] === $sessionId) {
                            $selected = $s;
                            break;
                        }
                    }
                    if (!$selected) {
                        $selected = $walkerModel->getActiveSession();
                        $sessionId = (int)($selected['id'] ?? 1);
                    }
                    $this->json_response([
                        'success' => true,
                        'active_session' => $selected,
                        'episodes' => $walkerModel->getSessionEpisodes($sessionId, 200)
                    ]);
                    break;

                case 'clear_episodes':
                    $sessionId = (int)($payload['session_id'] ?? 1);
                    $walkerModel->clearSessionEpisodes($sessionId);
                    $this->json_response([
                        'success' => true,
                        'message' => 'Riwayat episode pada sesi ini berhasil direset.',
                        'active_session' => $walkerModel->getActiveSession(),
                        'episodes' => []
                    ]);
                    break;

                case 'save_model':
                    $res = $walkerModel->saveModel($payload);
                    $this->json_response($res);
                    break;

                case 'load_model':
                    $identifier = (string)($payload['model_id'] ?? ($payload['model_code'] ?? '1'));
                    $model = $walkerModel->getModelByIdOrCode($identifier);
                    if ($model) {
                        $this->json_response(['success' => true, 'model' => $model]);
                    } else {
                        $this->json_response(['success' => false, 'message' => 'Model tidak ditemukan di database.'], 404);
                    }
                    break;

                case 'delete_model':
                    $id = (int)($payload['model_id'] ?? 0);
                    $res = $walkerModel->deleteModel($id);
                    $this->json_response($res);
                    break;

                case 'update_preset':
                    $res = $walkerModel->updatePreset($payload);
                    $this->json_response($res);
                    break;

                default:
                    $this->json_response([
                        'success' => false,
                        'message' => 'Aksi API tidak dikenali: ' . htmlspecialchars($action)
                    ], 400);
            }
        } catch (Throwable $e) {
            $this->json_response([
                'success' => false,
                'message' => 'Kesalahan server: ' . $e->getMessage()
            ], 500);
        }
    }
}
