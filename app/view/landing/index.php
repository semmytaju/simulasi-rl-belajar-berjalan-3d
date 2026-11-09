<?php
$diag = $data['db_diagnostics'] ?? [];
$presets = $data['presets'] ?? [];
$activeSession = $data['active_session'] ?? [];
$episodes = $data['episodes'] ?? [];
$savedModels = $data['saved_models'] ?? [];
$defaultPreset = $presets[0] ?? [
    'preset_code' => 'standar_seimbang',
    'preset_name' => 'Eksperimen 1: Kurikulum Seimbang',
    'description' => 'Menyeimbangkan hadiah kecepatan maju, postur badan tegak, dan koordinasi ayunan kaki kiri-kanan.',
    'algorithm' => 'DQN',
    'learning_rate' => 0.002,
    'gamma' => 0.98,
    'epsilon_decay' => 0.91,
    'reward_forward_weight' => 4.5,
    'reward_upright_weight' => 2.5,
    'reward_gait_weight' => 2.0,
    'penalty_fall' => -45.0,
    'ground_friction' => 0.85,
    'gravity' => 9.81
];
?>
<!DOCTYPE html>
<html lang="id" data-bs-theme="dark">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($data['title']); ?></title>
    <link rel="stylesheet" href="<?php echo APP_PATH; ?>/public/assets/vendor/bootstrap/css/bootstrap.min.css">
    <link rel="stylesheet" href="<?php echo APP_PATH; ?>/public/assets/vendor/bootstrap-icons/bootstrap-icons.min.css">
    <style>
        :root {
            --bg-main: #090d16;
            --bg-panel: #111827;
            --bg-card: #1e293b;
            --border-soft: rgba(148, 163, 184, 0.16);
            --accent-cyan: #38bdf8;
            --accent-emerald: #10b981;
        }
        body {
            background-color: var(--bg-main);
            color: #e2e8f0;
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            overflow-x: hidden;
        }
        .navbar-lab {
            background: rgba(15, 23, 42, 0.92);
            backdrop-filter: blur(10px);
            border-bottom: 1px solid var(--border-soft);
        }
        .panel-card {
            background: var(--bg-panel);
            border: 1px solid var(--border-soft);
            border-radius: 12px;
        }
        .sub-card {
            background: rgba(30, 41, 59, 0.65);
            border: 1px solid var(--border-soft);
            border-radius: 10px;
        }
        #threeCanvasContainer {
            width: 100%;
            height: 410px;
            background: radial-gradient(circle at center, #1e293b 0%, #090d16 100%);
            border-radius: 10px;
            overflow: hidden;
            position: relative;
            cursor: grab;
        }
        #threeCanvasContainer:active {
            cursor: grabbing;
        }
        #simulationMainPanel.sim-panel-fullscreen,
        #simulationMainPanel:fullscreen,
        #simulationMainPanel:-webkit-full-screen {
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            max-width: 100vw !important;
            z-index: 9999 !important;
            margin: 0 !important;
            border-radius: 0 !important;
            background: #090d16 !important;
            display: flex !important;
            flex-direction: column !important;
            padding: 12px !important;
        }
        #simulationMainPanel.sim-panel-fullscreen #viewportWrapper,
        #simulationMainPanel:fullscreen #viewportWrapper,
        #simulationMainPanel:-webkit-full-screen #viewportWrapper {
            flex: 1 1 auto !important;
            display: flex !important;
            flex-direction: column !important;
            min-height: 0 !important;
        }
        #simulationMainPanel.sim-panel-fullscreen #threeCanvasContainer,
        #simulationMainPanel:fullscreen #threeCanvasContainer,
        #simulationMainPanel:-webkit-full-screen #threeCanvasContainer {
            flex: 1 1 auto !important;
            height: 100% !important;
            min-height: 320px !important;
        }
        .hud-overlay-top {
            position: absolute;
            top: 10px;
            left: 10px;
            right: 10px;
            z-index: 10;
            pointer-events: none;
        }
        .hud-overlay-bottom {
            position: absolute;
            bottom: 10px;
            left: 10px;
            right: 10px;
            z-index: 10;
            pointer-events: none;
        }
        .hud-interactive {
            pointer-events: auto;
        }
        .hud-pill {
            background: rgba(15, 23, 42, 0.82);
            border: 1px solid rgba(56, 189, 248, 0.3);
            backdrop-filter: blur(6px);
            border-radius: 8px;
            padding: 4px 10px;
            font-size: 0.78rem;
        }
        .btn-emerald {
            background-color: #10b981;
            border-color: #059669;
            color: #052e16;
        }
        .btn-emerald:hover {
            background-color: #34d399;
            color: #022c22;
        }
        .text-emerald {
            color: #34d399 !important;
        }
        .sensor-bar-bg {
            height: 6px;
            background: rgba(148, 163, 184, 0.15);
            border-radius: 4px;
            overflow: hidden;
        }
        .formula-box {
            background: rgba(15, 23, 42, 0.9);
            border-left: 3px solid var(--accent-cyan);
            font-family: "JetBrains Mono", Consolas, monospace;
            font-size: 0.78rem;
        }
        .nav-tabs-lab .nav-link {
            color: #94a3b8;
            border: none;
            border-bottom: 2px solid transparent;
            padding: 0.55rem 0.75rem;
            font-size: 0.82rem;
            font-weight: 600;
        }
        .nav-tabs-lab .nav-link.active {
            color: #38bdf8;
            background: transparent;
            border-bottom-color: #38bdf8;
        }
        .table-episodes th, .table-episodes td {
            font-size: 0.77rem;
            vertical-align: middle;
            padding: 0.4rem 0.5rem;
        }
    </style>
</head>
<body>

<header class="navbar navbar-expand-lg navbar-lab py-2 sticky-top">
    <div class="container-fluid px-3">
        <div class="d-flex align-items-center gap-2">
            <div class="bg-info bg-opacity-10 border border-info border-opacity-25 rounded-3 p-2 d-flex align-items-center justify-content-center">
                <i class="bi bi-person-walking fs-4 text-info"></i>
            </div>
            <div>
                <div class="fw-bold text-white d-flex align-items-center gap-2" style="font-size: 1rem;">
                    <span>Simulasi RL Manusia Baru Belajar Berjalan</span>
                    
                </div>
                <div class="text-secondary" style="font-size: 0.73rem;">
                    Media Pembelajaran: Three.js 3D &bull; TensorFlow.js &bull; Web Workers &bull; PHP 8+ &bull; MySQL
                </div>
            </div>
        </div>

        <div class="d-flex flex-wrap align-items-center gap-2 mt-2 mt-lg-0">
            <span id="workerStatusBadge" class="badge bg-warning-subtle text-warning border border-warning-subtle">
                <i class="bi bi-hourglass-split me-1"></i>Memuat TF.js Worker...
            </span>

            <?php if (!empty($diag['is_connected'])): ?>
                <span class="badge bg-success-subtle text-success border border-success-subtle">
                    <i class="bi bi-database-check me-1"></i>MySQL: <?php echo htmlspecialchars($diag['database']); ?> (Online)
                </span>
            <?php else: ?>
                <form action="<?php echo APP_PATH; ?>/setup/init/" method="POST" class="d-inline">
                    <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($data['csrf_token']); ?>">
                    <button type="submit" class="btn btn-danger btn-sm py-0 px-2" style="font-size: 0.75rem;">
                        <i class="bi bi-magic me-1"></i>Inisialisasi Database db_balance_ai
                    </button>
                </form>
            <?php endif; ?>
        </div>
    </div>
</header>

<main class="container-fluid px-3 py-3">

    <div id="liveNotificationBanner" class="d-none"></div>

    <div class="row g-2 mb-3">
        <div class="col-6 col-md-3">
            <div class="panel-card p-2 px-3 d-flex align-items-center justify-content-between">
                <div>
                    <div class="text-secondary small" style="font-size: 0.72rem;">TOTAL EPISODE DILATIH</div>
                    <div id="kpiTotalEpisodes" class="fs-5 fw-bold text-white"><?php echo count($episodes); ?></div>
                </div>
                <i class="bi bi-arrow-repeat fs-3 text-info opacity-75"></i>
            </div>
        </div>
        <div class="col-6 col-md-3">
            <div class="panel-card p-2 px-3 d-flex align-items-center justify-content-between">
                <div>
                    <div class="text-secondary small" style="font-size: 0.72rem;">REKOR JARAK TERJAUH (TARGET 20M)</div>
                    <div id="kpiBestDistance" class="fs-5 fw-bold text-emerald"><?php echo number_format((float)($activeSession['best_distance_m'] ?? 0), 2); ?> m</div>
                </div>
                <i class="bi bi-flag-fill fs-3 text-emerald opacity-75"></i>
            </div>
        </div>
        <div class="col-6 col-md-3">
            <div class="panel-card p-2 px-3 d-flex align-items-center justify-content-between">
                <div>
                    <div class="text-secondary small" style="font-size: 0.72rem;">RATA-RATA JARAK BERJALAN</div>
                    <div id="kpiAvgDistance" class="fs-5 fw-bold text-warning"><?php echo number_format((float)($activeSession['avg_distance_m'] ?? 0), 2); ?> m</div>
                </div>
                <i class="bi bi-speedometer2 fs-3 text-warning opacity-75"></i>
            </div>
        </div>
        <div class="col-6 col-md-3">
            <div class="panel-card p-2 px-3 d-flex align-items-center justify-content-between">
                <div>
                    <div class="text-secondary small" style="font-size: 0.72rem;">BERHASIL MENCAPAI FINISH (20M)</div>
                    <div id="kpiFinishCount" class="fs-5 fw-bold text-info"><?php echo (int)($activeSession['success_walk_count'] ?? 0); ?>x Finish</div>
                </div>
                <i class="bi bi-trophy-fill fs-3 text-info opacity-75"></i>
            </div>
        </div>
    </div>

    <div class="row g-3">
        <div class="col-12 col-xl-7">

            <div id="simulationMainPanel" class="panel-card p-2 mb-3">
                <div id="viewportWrapper" class="position-relative">
                    <div class="hud-overlay-top d-flex flex-wrap justify-content-between align-items-start gap-2">
                        <div class="d-flex flex-wrap gap-1">
                            <div class="hud-pill">
                                <span class="text-secondary">Episode:</span>
                                <strong id="hudEpisode" class="text-info ms-1">1</strong>
                            </div>
                            <div class="hud-pill">
                                <span class="text-secondary">Jarak:</span>
                                <strong id="hudDistance" class="text-emerald ms-1">0.00 m</strong>
                            </div>
                            <div class="hud-pill">
                                <span class="text-secondary">Kecepatan:</span>
                                <strong id="hudSpeed" class="text-white ms-1">0.00 m/s</strong>
                            </div>
                            <div class="hud-pill">
                                <span class="text-secondary">Kemiringan Badan:</span>
                                <strong id="hudTorsoAngle" class="text-warning ms-1">0.0°</strong>
                            </div>
                            <div class="hud-pill">
                                <span class="text-secondary">Eksplorasi (&epsilon;):</span>
                                <strong id="hudEpsilon" class="text-info ms-1">100%</strong>
                            </div>
                            <div class="hud-pill">
                                <span class="text-secondary">Loss TF.js:</span>
                                <strong id="hudLoss" class="text-light ms-1">0.0000</strong>
                            </div>
                        </div>

                        <div class="d-flex flex-wrap align-items-center gap-1 hud-interactive">
                            <span id="hudStageBadge" class="badge bg-info text-dark fw-bold px-2 py-1">
                                Tahap 1: Eksplorasi Awal
                            </span>
                            <div class="btn-group btn-group-sm">
                                <button type="button" class="btn btn-dark border-secondary cam-btn active" data-cam="follow" title="Kamera Mengikuti 3D">3D Follow</button>
                                <button type="button" class="btn btn-dark border-secondary cam-btn" data-cam="side" title="Tampilan Samping 2D Sagittal">Samping 2D</button>
                                <button type="button" class="btn btn-dark border-secondary cam-btn" data-cam="front" title="Kamera Depan">Depan</button>
                                <button type="button" class="btn btn-dark border-secondary cam-btn" data-cam="overview" title="Lihat Seluruh Lintasan 20m">Lintasan 20m</button>
                            </div>
                            <div class="hud-pill d-flex align-items-center gap-1 py-1 px-2">
                                <button type="button" id="btnZoomIn" class="btn btn-sm btn-outline-info py-0 px-1" title="Zoom In (Perbesar Karakter 3D)">
                                    <i class="bi bi-zoom-in"></i>
                                </button>
                                <input type="range" id="sliderZoom3D" class="form-range" min="35" max="250" step="5" value="100" style="width: 72px; height: 14px;" title="Geser untuk Zoom In / Zoom Out Lingkungan 3D">
                                <button type="button" id="btnZoomOut" class="btn btn-sm btn-outline-info py-0 px-1" title="Zoom Out (Perkecil / Lihat Arena Luas)">
                                    <i class="bi bi-zoom-out"></i>
                                </button>
                                <span id="zoomPercentLabel" class="text-info fw-bold font-monospace ms-1" style="font-size: 0.72rem; min-width: 36px;">100%</span>
                                <button type="button" id="btnZoomReset" class="btn btn-sm btn-outline-secondary py-0 px-1" title="Reset Zoom & Sudut Kamera (100%)">
                                    <i class="bi bi-arrow-counterclockwise"></i>
                                </button>
                                <button type="button" id="btnToggleFullscreen" class="btn btn-sm btn-info text-dark fw-bold py-0 px-2 ms-1" title="Tampilkan Panel Simulasi Ini dalam Layar Penuh (Fullscreen)">
                                    <i id="iconFullscreen" class="bi bi-arrows-fullscreen me-1"></i><span id="labelFullscreen"></span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div id="threeCanvasContainer"></div>

                    <div class="hud-overlay-bottom d-flex flex-wrap justify-content-between align-items-end gap-2">
                        <div class="hud-pill flex-grow-1" style="max-width: 360px;">
                            <div class="d-flex justify-content-between small mb-1" style="font-size: 0.7rem;">
                                <span>START (0m)</span>
                                <span id="hudPushStatus" class="badge bg-warning text-dark d-none">💨 Didorong!</span>
                                <span class="text-emerald fw-bold">GARIS FINISH (20m)</span>
                            </div>
                            <div class="progress" style="height: 7px; background: rgba(255,255,255,0.1);">
                                <div id="hudTrackProgress" class="progress-bar bg-info" style="width: 0%;"></div>
                            </div>
                        </div>

                        <div class="d-flex gap-1 hud-interactive">
                            <button type="button" id="btnPushBackward" class="btn btn-sm btn-outline-warning bg-dark bg-opacity-75" title="Uji dorong tubuh ke belakang">
                                <i class="bi bi-wind me-1"></i>Dorong ke Belakang
                            </button>
                            <button type="button" id="btnPushForward" class="btn btn-sm btn-outline-warning bg-dark bg-opacity-75" title="Uji dorong tubuh ke depan">
                                <i class="bi bi-wind me-1"></i>Dorong ke Depan
                            </button>
                        </div>
                    </div>
                </div>

                <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2 pt-2 border-top border-secondary border-opacity-25 px-1">
                    <div class="d-flex flex-wrap align-items-center gap-1">
                        <button type="button" id="btnStartPause" class="btn btn-emerald fw-semibold px-3">
                            <i class="bi bi-play-fill me-1"></i>Mulai Latih AI
                        </button>
                        <button type="button" id="btnStepOnce" class="btn btn-outline-info btn-sm" title="Jalankan 1 langkah fisika & amati perubahan sensor">
                            <i class="bi bi-skip-end-fill me-1"></i>1 Langkah
                        </button>
                        <button type="button" id="btnResetEpisode" class="btn btn-outline-light btn-sm" title="Kembalikan orang ke garis 0m tanpa menghapus ingatan otak">
                            <i class="bi bi-arrow-counterclockwise me-1"></i>Ulang Posisi
                        </button>
                        <button type="button" id="btnResetBrain" class="btn btn-outline-danger btn-sm" title="Hapus seluruh memori & mulai belajar dari bayi lagi (Episode 1)">
                            <i class="bi bi-trash3 me-1"></i>Reset Otak dari Nol
                        </button>
                    </div>

                    <div class="d-flex align-items-center gap-1">
                        <span class="text-secondary small me-1" style="font-size: 0.75rem;">Kecepatan:</span>
                        <div class="btn-group btn-group-sm">
                            <button type="button" class="btn btn-outline-secondary speed-btn active" data-speed="1">1x</button>
                            <button type="button" class="btn btn-outline-secondary speed-btn" data-speed="2">2x</button>
                            <button type="button" class="btn btn-outline-secondary speed-btn" data-speed="5">5x</button>
                            <button type="button" class="btn btn-outline-secondary speed-btn" data-speed="10">10x</button>
                            <button type="button" class="btn btn-outline-info speed-btn" data-speed="25" title="Pelatihan Cepat di Web Worker">25x Turbo</button>
                        </div>
                    </div>
                </div>

                <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2 pt-2 border-top border-secondary border-opacity-25 px-1">
                    <span class="text-secondary small" style="font-size: 0.75rem;">
                        <i class="bi bi-lightning-charge-fill text-warning me-1"></i><strong>Demo Instan Tahap Belajar:</strong>
                    </span>
                    <div class="d-flex flex-wrap gap-1">
                        <button type="button" class="btn btn-sm btn-outline-secondary quick-skill-btn" data-model-code="MODEL_LVL0_RANDOM">
                            👶 Level 0: Baru Lahir (Sering Jatuh)
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-info quick-skill-btn" data-model-code="MODEL_LVL1_TODDLER">
                            🧒 Level 1: Mulai Melangkah (Ep 10)
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-success quick-skill-btn" data-model-code="MODEL_LVL2_MASTER">
                            🏃 Level 2: Mahir Berjalan Stabil (20m)
                        </button>
                    </div>
                </div>
            </div>

            <div class="row g-2 mb-3">
                <div class="col-12 col-md-6">
                    <div class="panel-card p-3 h-100">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="fw-bold text-info mb-0" style="font-size: 0.86rem;">
                                <i class="bi bi-broadcast-pin me-1"></i>1. STATE (<var>s<sub>t</sub></var>) — 8 Sensor Tubuh
                            </h6>
                            <div class="d-flex gap-1">
                                <span id="footSensorLeft" class="badge bg-success-subtle text-success" style="font-size: 0.65rem;">Kaki Kiri: Menapak</span>
                                <span id="footSensorRight" class="badge bg-success-subtle text-success" style="font-size: 0.65rem;">Kaki Kanan: Menapak</span>
                            </div>
                        </div>
                        <p class="text-secondary mb-2" style="font-size: 0.73rem;">
                            Kondisi fisik tubuh manusia yang dibaca oleh jaringan saraf setiap 0.025 detik:
                        </p>

                        <?php
                        $sensorLabels = [
                            ['Kemiringan Badan (&theta;<sub>torso</sub>)', 'bg-warning'],
                            ['Kecepatan Miring (&omega;<sub>torso</sub>)', 'bg-warning'],
                            ['Kecepatan Maju (v<sub>x</sub>)', 'bg-emerald'],
                            ['Ketinggian Pinggul (y<sub>hip</sub>)', 'bg-info'],
                            ['Selisih Ayunan Paha Kiri-Kanan', 'bg-primary'],
                            ['Selisih Tekukan Lutut Kiri-Kanan', 'bg-primary'],
                            ['Ritme Langkah sin(&phi;)', 'bg-info'],
                            ['Ritme Langkah cos(&phi;)', 'bg-info']
                        ];
                        foreach ($sensorLabels as $idx => [$label, $barColor]):
                        ?>
                        <div class="mb-1">
                            <div class="d-flex justify-content-between" style="font-size: 0.72rem;">
                                <span class="text-light"><?php echo $label; ?></span>
                                <code id="stateVal_<?php echo $idx; ?>" class="text-info">+0.00</code>
                            </div>
                            <div class="sensor-bar-bg">
                                <div id="stateBar_<?php echo $idx; ?>" class="<?php echo $barColor; ?> h-100" style="width: 50%; transition: width 0.08s;"></div>
                            </div>
                        </div>
                        <?php endforeach; ?>
                    </div>
                </div>

                <div class="col-12 col-md-6">
                    <div class="panel-card p-3 h-100">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <h6 class="fw-bold text-emerald mb-0" style="font-size: 0.86rem;">
                                <i class="bi bi-diagram-3-fill me-1"></i>2. OTAK TF.js &amp; AKSI (<var>a<sub>t</sub></var>)
                            </h6>
                            <span class="badge bg-info-subtle text-info" style="font-size: 0.68rem;">Dense [8 &rarr; 64 &rarr; 64 &rarr; 7]</span>
                        </div>
                        <div class="small text-secondary mb-2" style="font-size: 0.73rem;">
                            Aksi Aktif: <strong id="activeActionName" class="text-white">Langkah Ritmis Seimbang</strong>
                        </div>

                        <?php
                        $actionsList = [
                            '0. Ayun Kaki Kiri Maju',
                            '1. Ayun Kaki Kanan Maju',
                            '2. Tegakkan Badan (Rem Depan)',
                            '3. Tegakkan Badan (Tahan Belakang)',
                            '4. Langkah Ritmis Seimbang',
                            '5. Tekuk Lutut Peredam',
                            '6. Dorong Langkah Cepat (Sprint)'
                        ];
                        foreach ($actionsList as $aIdx => $aName):
                        ?>
                        <div id="actionRow_<?php echo $aIdx; ?>" class="p-1 rounded mb-1">
                            <div class="d-flex justify-content-between" style="font-size: 0.71rem;">
                                <span><?php echo $aName; ?></span>
                                <span class="font-monospace text-info">Q = <strong id="actionQ_<?php echo $aIdx; ?>">0.00</strong></span>
                            </div>
                            <div class="progress" style="height: 5px; background: rgba(255,255,255,0.08);">
                                <div id="actionBar_<?php echo $aIdx; ?>" class="progress-bar bg-secondary" style="width: 50%;"></div>
                            </div>
                        </div>
                        <?php endforeach; ?>
                    </div>
                </div>
            </div>

            <div class="panel-card p-3">
                <div class="row g-2 align-items-center mb-2">
                    <div class="col-12 col-md-7">
                        <h6 class="fw-bold text-warning mb-0" style="font-size: 0.86rem;">
                            <i class="bi bi-graph-up-arrow me-1"></i>3. REWARD (<var>r<sub>t</sub></var>) &amp; KURVA BELAJAR PER EPISODE
                        </h6>
                        <div class="text-secondary" style="font-size: 0.72rem;">
                            Grafik perkembangan jarak berjalan (meter) dan akumulasi hadiah setiap episode:
                        </div>
                    </div>
                    <div class="col-12 col-md-5 text-md-end">
                        <span class="badge bg-dark border border-secondary text-light px-2 py-1" style="font-size: 0.74rem;">
                            Total Reward Episode Ini: <strong id="rewTotalEpisode" class="text-emerald ms-1">0.00</strong>
                        </span>
                    </div>
                </div>

                <div class="formula-box p-2 rounded mb-2 d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <div>
                        <span class="text-secondary">r<sub>t</sub> = </span>
                        <span class="text-emerald" title="Hadiah Kecepatan Maju">Maju(<strong id="rewForward">+0.00</strong>)</span> +
                        <span class="text-info" title="Hadiah Postur Badan Tegak">Tegak(<strong id="rewUpright">+0.00</strong>)</span> +
                        <span class="text-primary" title="Hadiah Koordinasi Langkah Kaki">Langkah(<strong id="rewGait">+0.00</strong>)</span>
                        <span class="text-danger" title="Penalti Torsi Energi Otot">Energi(<strong id="rewTorque">-0.00</strong>)</span>
                    </div>
                    <span class="badge bg-secondary-subtle text-secondary">Target Finish = +80.0 | Jatuh = Penalti</span>
                </div>

                <div style="height: 215px;">
                    <canvas id="learningCurveChart"></canvas>
                </div>
            </div>

        </div>

        <div class="col-12 col-xl-5">
            <div class="panel-card p-3 h-100 d-flex flex-column">

                <ul class="nav nav-tabs nav-tabs-lab border-bottom border-secondary border-opacity-25 mb-3" role="tablist">
                    <li class="nav-item" role="presentation">
                        <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#tabParams" type="button" role="tab">
                            <i class="bi bi-sliders me-1"></i>1. Parameter RL
                        </button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#tabModels" type="button" role="tab">
                            <i class="bi bi-cpu me-1"></i>2. Otak AI (DB)
                        </button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#tabLogs" type="button" role="tab">
                            <i class="bi bi-table me-1"></i>3. Log Episode
                        </button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#tabTheory" type="button" role="tab">
                            <i class="bi bi-mortarboard-fill me-1"></i>4. Konsep RL
                        </button>
                    </li>
                </ul>

                <div class="tab-content flex-grow-1">

                    <div class="tab-pane fade show active" id="tabParams" role="tabpanel">
                        <div class="sub-card p-2 px-3 mb-3">
                            <label class="form-label small fw-bold text-info mb-1">
                                <i class="bi bi-journal-code me-1"></i>Pilih Skenario Praktikum (Tabel <code>reward_presets</code>):
                            </label>
                            <select id="selectRewardPreset" class="form-select form-select-sm bg-dark text-white border-secondary mb-1">
                                <?php foreach ($presets as $p): ?>
                                    <option value="<?php echo htmlspecialchars($p['preset_code']); ?>">
                                        <?php echo htmlspecialchars($p['preset_name']); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                            <div id="presetDescriptionText" class="text-secondary" style="font-size: 0.73rem;">
                                <?php echo htmlspecialchars($defaultPreset['description']); ?>
                            </div>
                        </div>

                        <div class="mb-2">
                            <label class="form-label small fw-semibold mb-1" style="font-size: 0.76rem;">Algoritma Reinforcement Learning:</label>
                            <select id="selectAlgorithm" class="form-select form-select-sm bg-dark text-white border-secondary">
                                <option value="DQN" selected>DQN (Deep Q-Network + Experience Replay) — Mudah Dipahami</option>
                                <option value="PPO">PPO / Stochastic Policy Gradient — Gerakan Halus</option>
                                <option value="CURRICULUM_RL">Curriculum Guided RL — Konvergensi Cepat untuk Demo Kelas</option>
                            </select>
                        </div>

                        <div class="sub-card p-2 px-3 mb-2">
                            <div class="fw-bold text-light small mb-2" style="font-size: 0.78rem;">
                                <i class="bi bi-gear-wide-connected text-info me-1"></i>Hyperparameter Neural Network (TensorFlow.js)
                            </div>

                            <div class="mb-2">
                                <div class="d-flex justify-content-between small" style="font-size: 0.73rem;">
                                    <span>Learning Rate (&alpha;) — Kecepatan Update Bobot</span>
                                    <strong id="valLR" class="text-info"><?php echo $defaultPreset['learning_rate']; ?></strong>
                                </div>
                                <input type="range" id="sliderLR" class="form-range" min="0.0005" max="0.01" step="0.0005" value="<?php echo $defaultPreset['learning_rate']; ?>">
                            </div>

                            <div class="mb-2">
                                <div class="d-flex justify-content-between small" style="font-size: 0.73rem;">
                                    <span>Discount Factor (&gamma;) — Kepedulian Masa Depan</span>
                                    <strong id="valGamma" class="text-info"><?php echo $defaultPreset['gamma']; ?></strong>
                                </div>
                                <input type="range" id="sliderGamma" class="form-range" min="0.80" max="0.99" step="0.01" value="<?php echo $defaultPreset['gamma']; ?>">
                            </div>

                            <div>
                                <div class="d-flex justify-content-between small" style="font-size: 0.73rem;">
                                    <span>Epsilon Decay — Laju Berkurangnya Gerakan Acak</span>
                                    <strong id="valEpsDecay" class="text-info"><?php echo $defaultPreset['epsilon_decay']; ?></strong>
                                </div>
                                <input type="range" id="sliderEpsDecay" class="form-range" min="0.82" max="0.98" step="0.01" value="<?php echo $defaultPreset['epsilon_decay']; ?>">
                            </div>
                        </div>

                        <div class="sub-card p-2 px-3 mb-2">
                            <div class="fw-bold text-light small mb-2" style="font-size: 0.78rem;">
                                <i class="bi bi-award text-warning me-1"></i>Desain Hadiah &amp; Hukuman (Reward Shaping)
                            </div>

                            <div class="mb-2">
                                <div class="d-flex justify-content-between small" style="font-size: 0.73rem;">
                                    <span>Bobot Hadiah Maju (+Kecepatan ke Depan)</span>
                                    <strong id="valRewForward" class="text-emerald"><?php echo $defaultPreset['reward_forward_weight']; ?></strong>
                                </div>
                                <input type="range" id="sliderRewForward" class="form-range" min="0.5" max="10.0" step="0.5" value="<?php echo $defaultPreset['reward_forward_weight']; ?>">
                            </div>

                            <div class="mb-2">
                                <div class="d-flex justify-content-between small" style="font-size: 0.73rem;">
                                    <span>Bobot Keseimbangan Badan Tegak (+Postur Lurus)</span>
                                    <strong id="valRewUpright" class="text-emerald"><?php echo $defaultPreset['reward_upright_weight']; ?></strong>
                                </div>
                                <input type="range" id="sliderRewUpright" class="form-range" min="0.5" max="8.0" step="0.5" value="<?php echo $defaultPreset['reward_upright_weight']; ?>">
                            </div>

                            <div class="mb-2">
                                <div class="d-flex justify-content-between small" style="font-size: 0.73rem;">
                                    <span>Bobot Koordinasi Langkah Kaki Kiri-Kanan</span>
                                    <strong id="valRewGait" class="text-emerald"><?php echo $defaultPreset['reward_gait_weight']; ?></strong>
                                </div>
                                <input type="range" id="sliderRewGait" class="form-range" min="0.0" max="6.0" step="0.5" value="<?php echo $defaultPreset['reward_gait_weight']; ?>">
                            </div>

                            <div>
                                <div class="d-flex justify-content-between small" style="font-size: 0.73rem;">
                                    <span>Hukuman / Penalti Saat Terjatuh</span>
                                    <strong id="valPenFall" class="text-danger"><?php echo $defaultPreset['penalty_fall']; ?></strong>
                                </div>
                                <input type="range" id="sliderPenFall" class="form-range" min="-100" max="-10" step="5" value="<?php echo $defaultPreset['penalty_fall']; ?>">
                            </div>
                        </div>

                        <div class="sub-card p-2 px-3 mb-3">
                            <div class="fw-bold text-light small mb-2" style="font-size: 0.78rem;">
                                <i class="bi bi-globe2 text-info me-1"></i>Lingkungan Fisika Lintasan
                            </div>
                            <div class="row g-2">
                                <div class="col-6">
                                    <div class="d-flex justify-content-between small" style="font-size: 0.72rem;">
                                        <span>Gesekan Lantai</span>
                                        <strong id="valFriction" class="text-warning"><?php echo $defaultPreset['ground_friction']; ?></strong>
                                    </div>
                                    <input type="range" id="sliderFriction" class="form-range" min="0.30" max="1.00" step="0.05" value="<?php echo $defaultPreset['ground_friction']; ?>">
                                </div>
                                <div class="col-6">
                                    <div class="d-flex justify-content-between small" style="font-size: 0.72rem;">
                                        <span>Gravitasi</span>
                                        <strong id="valGravity" class="text-warning"><?php echo $defaultPreset['gravity']; ?> m/s²</strong>
                                    </div>
                                    <input type="range" id="sliderGravity" class="form-range" min="3.70" max="15.0" step="0.1" value="<?php echo $defaultPreset['gravity']; ?>">
                                </div>
                            </div>
                        </div>

                        <button type="button" id="btnSavePresetDb" class="btn btn-outline-info btn-sm w-100 fw-semibold">
                            <i class="bi bi-floppy-fill me-1"></i>Simpan Parameter Ini ke MySQL (<code>db_balance_ai.reward_presets</code>)
                        </button>
                    </div>

                    <div class="tab-pane fade" id="tabModels" role="tabpanel">
                        <div class="sub-card p-3 mb-3">
                            <h6 class="fw-bold text-info mb-1" style="font-size: 0.84rem;">
                                <i class="bi bi-cloud-arrow-up-fill me-1"></i>Simpan Otak AI (Bobot TensorFlow.js) ke Database
                            </h6>
                            <p class="text-secondary mb-2" style="font-size: 0.73rem;">
                                Mengekspor tensor bobot jaringan saraf dari Web Worker ke dalam tabel MySQL <code>saved_models</code>.
                            </p>
                            <div class="mb-2">
                                <input type="text" id="inputModelName" class="form-control form-control-sm bg-dark text-white border-secondary" placeholder="Nama Model (misal: Model Budi Sudah Bisa Jalan)">
                            </div>
                            <div class="mb-2">
                                <input type="text" id="inputModelNotes" class="form-control form-control-sm bg-dark text-white border-secondary" placeholder="Catatan eksperimen mahasiswa (opsional)">
                            </div>
                            <button type="button" id="btnSaveModelDb" class="btn btn-emerald btn-sm w-100 fw-semibold">
                                <i class="bi bi-database-fill-add me-1"></i>Simpan Bobot Neural Network ke MySQL
                            </button>
                        </div>

                        <h6 class="fw-bold text-light mb-2" style="font-size: 0.82rem;">
                            <i class="bi bi-collection-fill text-info me-1"></i>Daftar Otak AI di Database (<code>db_balance_ai.saved_models</code>)
                        </h6>
                        <div id="savedModelsListContainer" style="max-height: 360px; overflow-y: auto;"></div>
                    </div>

                    <div class="tab-pane fade" id="tabLogs" role="tabpanel">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <div>
                                <h6 class="fw-bold text-info mb-0" style="font-size: 0.84rem;">
                                    <i class="bi bi-journal-text me-1"></i>Log Episode Real-Time (<code>db_balance_ai.episode_logs</code>)
                                </h6>
                                <div class="text-secondary" style="font-size: 0.72rem;">
                                    Setiap kali manusia 3D terjatuh atau mencapai finish, hasil otomatis tersimpan di MySQL.
                                </div>
                            </div>
                        </div>

                        <div class="table-responsive" style="max-height: 460px; overflow-y: auto;">
                            <table class="table table-dark table-hover table-bordered border-secondary border-opacity-25 table-episodes mb-0">
                                <thead class="table-active sticky-top">
                                    <tr>
                                        <th>Ep</th>
                                        <th>Jarak</th>
                                        <th>Reward</th>
                                        <th>Step</th>
                                        <th>&epsilon;</th>
                                        <th>Status Akhir</th>
                                        <th>Tahap</th>
                                    </tr>
                                </thead>
                                <tbody id="episodeLogsTableBody"></tbody>
                            </table>
                        </div>
                    </div>

                    <div class="tab-pane fade" id="tabTheory" role="tabpanel">
                        <div style="max-height: 500px; overflow-y: auto; padding-right: 4px;">
                            <div class="sub-card p-3 mb-2">
                                <h6 class="fw-bold text-info mb-1" style="font-size: 0.85rem;">
                                    1. Bagaimana Manusia 3D Ini Belajar Berjalan?
                                </h6>
                                <p class="text-light small mb-2" style="font-size: 0.76rem; line-height: 1.5;">
                                    Dalam <strong>Reinforcement Learning (RL)</strong>, kita tidak memprogram aturan berjalan secara manual (seperti <code>if miring then langkah kanan</code>). Sebaliknya, manusia 3D (<strong>Agent</strong>) awalnya memiliki otak jaringan saraf kosong dan hanya mencoba gerakan otot secara acak (<strong>Exploration</strong>).
                                </p>
                                <ul class="small text-secondary mb-0 ps-3" style="font-size: 0.75rem;">
                                    <li><strong>Episode 1–5 (Bayi Baru Berdiri):</strong> Nilai eksplorasi (&epsilon; &approx; 100%) masih tinggi. Agen mencoba aksi acak sehingga langsung jatuh tersungkur di jarak 0.5m – 2m.</li>
                                    <li><strong>Episode 6–14 (Belajar Keseimbangan):</strong> Jaringan saraf mulai memahami bahwa ketika badan condong ke depan (&theta;<sub>torso</sub> &gt; 0), memilih aksi <em>Tegakkan Badan</em> menghasilkan hadiah positif dan mencegah penalti jatuh (-45).</li>
                                    <li><strong>Episode 15+ (Berjalan Stabil):</strong> Agen mengoordinasikan ayunan paha kiri dan kanan secara bergantian hingga mencapai <strong>Garis Finish 20 Meter</strong>!</li>
                                </ul>
                            </div>

                            <div class="sub-card p-3 mb-2">
                                <h6 class="fw-bold text-emerald mb-1" style="font-size: 0.85rem;">
                                    2. Persamaan Matematika Inti (Bellman Equation - DQN)
                                </h6>
                                <p class="text-secondary small mb-1" style="font-size: 0.75rem;">
                                    Jaringan saraf <strong>TensorFlow.js</strong> memprediksi nilai kualitas aksi <var>Q(s, a)</var> menggunakan pembaruan Bellman di dalam <strong>Web Worker</strong>:
                                </p>
                                <div class="formula-box p-2 rounded text-info mb-2">
                                    Q<sub>target</sub>(s, a) = r + &gamma; &middot; max<sub>a'</sub> Q(s', a')
                                </div>
                                <div class="small text-secondary" style="font-size: 0.74rem;">
                                    &bull; <strong>s (State):</strong> 8 sensor tubuh (sudut badan, kecepatan sudut, kecepatan maju, tinggi pinggul, sudut paha &amp; lutut, fase langkah).<br>
                                    &bull; <strong>a (Action):</strong> 1 dari 7 perintah gerakan sendi otot.<br>
                                    &bull; <strong>r (Reward):</strong> Hadiah maju + hadiah badan tegak + ritme langkah &minus; penalti jatuh.<br>
                                    &bull; <strong>&gamma; (Gamma):</strong> Faktor diskon masa depan (0.98).
                                </div>
                            </div>

                            <div class="sub-card p-3">
                                <h6 class="fw-bold text-warning mb-1" style="font-size: 0.85rem;">
                                    3. Arsitektur Teknologi Tanpa Python / Tanpa Node.js
                                </h6>
                                <div class="small text-secondary" style="font-size: 0.74rem; line-height: 1.55;">
                                    1. <strong>Three.js (WebGL 3D):</strong> Merender anatomi tubuh manusia (kepala, torso, lengan, paha, lutut, betis, dan sensor telapak kaki) pada 60 FPS.<br>
                                    2. <strong>Web Workers (Multi-threading JS ES6+):</strong> Menjalankan perhitungan fisika dan pelatihan jaringan saraf di thread terpisah agar halaman web tidak macet/freeze.<br>
                                    3. <strong>TensorFlow.js:</strong> Melatih model Deep Neural Network <code>[8 &rarr; 64 &rarr; 64 &rarr; 7]</code> langsung di browser mahasiswa.<br>
                                    4. <strong>PHP 8+ &amp; MySQL (<code>db_balance_ai</code>):</strong> Menyimpan riwayat episode (<code>episode_logs</code>), sesi eksperimen (<code>training_sessions</code>), preset praktikum (<code>reward_presets</code>), dan bobot model AI (<code>saved_models</code>).
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    </div>
</main>

<script>
window.BALANCE_AI_BOOT_DATA = <?php echo json_encode([
    'appPath' => APP_PATH,
    'csrfToken' => $data['csrf_token'] ?? '',
    'activeSession' => $activeSession,
    'presets' => $presets,
    'episodes' => $episodes,
    'savedModels' => $savedModels
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?>;
</script>
<script src="<?php echo APP_PATH; ?>/public/assets/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
<script src="<?php echo APP_PATH; ?>/public/assets/vendor/three/three.min.js?v=<?php echo time(); ?>"></script>
<script>
if (typeof THREE === 'undefined') {
    document.write('<script src="https://cdn.jsdelivr.net/npm/three@0.150.1/build/three.min.js"><\/script>');
}
</script>
<script src="<?php echo APP_PATH; ?>/public/assets/vendor/chartjs/chart.umd.min.js?v=<?php echo time(); ?>"></script>
<script src="<?php echo APP_PATH; ?>/public/assets/js/walker-3d-app.js?v=<?php echo time(); ?>"></script>
</body>
</html>
