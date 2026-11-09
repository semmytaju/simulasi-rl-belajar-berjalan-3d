-- =====================================================================
-- DATABASE: db_balance_ai
-- SIMULASI REINFORCEMENT LEARNING: ORANG BARU BELAJAR BERJALAN (BIPEDAL WALKER)
-- Stack: PHP 8+, MySQL, HTML5, CSS3, JS ES6+, Three.js, TensorFlow.js, Web Workers
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `db_balance_ai` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `db_balance_ai`;

-- ---------------------------------------------------------------------
-- 1. Tabel: reward_presets (Preset Kurikulum & Bobot Reward Praktikum Mahasiswa)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reward_presets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `preset_code` VARCHAR(50) NOT NULL UNIQUE,
  `preset_name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `algorithm` ENUM('DQN', 'PPO', 'CURRICULUM_RL') NOT NULL DEFAULT 'DQN',
  `learning_rate` DOUBLE NOT NULL DEFAULT 0.002,
  `gamma` DOUBLE NOT NULL DEFAULT 0.98,
  `epsilon_start` DOUBLE NOT NULL DEFAULT 1.00,
  `epsilon_min` DOUBLE NOT NULL DEFAULT 0.05,
  `epsilon_decay` DOUBLE NOT NULL DEFAULT 0.92,
  `reward_forward_weight` DOUBLE NOT NULL DEFAULT 4.5,
  `reward_upright_weight` DOUBLE NOT NULL DEFAULT 2.5,
  `reward_gait_weight` DOUBLE NOT NULL DEFAULT 2.0,
  `penalty_fall` DOUBLE NOT NULL DEFAULT -45.0,
  `penalty_torque` DOUBLE NOT NULL DEFAULT -0.05,
  `gravity` DOUBLE NOT NULL DEFAULT 9.81,
  `ground_friction` DOUBLE NOT NULL DEFAULT 0.85,
  `target_distance_m` DOUBLE NOT NULL DEFAULT 20.0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. Tabel: training_sessions (Sesi Eksperimen Pelatihan RL Mahasiswa)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `training_sessions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `session_code` VARCHAR(50) NOT NULL UNIQUE,
  `student_name` VARCHAR(100) NOT NULL DEFAULT 'Mahasiswa Praktikum AI',
  `session_title` VARCHAR(150) NOT NULL,
  `algorithm` VARCHAR(30) NOT NULL DEFAULT 'DQN',
  `preset_code` VARCHAR(50) NOT NULL DEFAULT 'standar_seimbang',
  `learning_rate` DOUBLE NOT NULL DEFAULT 0.002,
  `gamma` DOUBLE NOT NULL DEFAULT 0.98,
  `total_episodes` INT NOT NULL DEFAULT 0,
  `best_distance_m` DOUBLE NOT NULL DEFAULT 0.0,
  `best_reward` DOUBLE NOT NULL DEFAULT 0.0,
  `avg_distance_m` DOUBLE NOT NULL DEFAULT 0.0,
  `avg_reward` DOUBLE NOT NULL DEFAULT 0.0,
  `success_walk_count` INT NOT NULL DEFAULT 0,
  `fall_count` INT NOT NULL DEFAULT 0,
  `status` ENUM('active', 'completed', 'reset') NOT NULL DEFAULT 'active',
  `config_json` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3. Tabel: episode_logs (Log Detail Setiap Episode Belajar Berjalan)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `episode_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `session_id` INT NOT NULL DEFAULT 1,
  `episode_number` INT NOT NULL,
  `algorithm` VARCHAR(30) NOT NULL DEFAULT 'DQN',
  `distance_m` DOUBLE NOT NULL DEFAULT 0.0,
  `total_reward` DOUBLE NOT NULL DEFAULT 0.0,
  `steps_count` INT NOT NULL DEFAULT 0,
  `duration_sec` DOUBLE NOT NULL DEFAULT 0.0,
  `avg_torso_angle_deg` DOUBLE NOT NULL DEFAULT 0.0,
  `avg_speed_ms` DOUBLE NOT NULL DEFAULT 0.0,
  `epsilon` DOUBLE NOT NULL DEFAULT 0.0,
  `loss_value` DOUBLE NOT NULL DEFAULT 0.0,
  `termination_reason` VARCHAR(80) NOT NULL DEFAULT 'Jatuh ke Depan',
  `reached_finish` TINYINT(1) NOT NULL DEFAULT 0,
  `stage_label` VARCHAR(80) NOT NULL DEFAULT 'Tahap 1: Belajar Berdiri',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_session_ep` (`session_id`, `episode_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4. Tabel: saved_models (Penyimpanan Otak Neural Network TensorFlow.js)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `saved_models` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `model_code` VARCHAR(60) NOT NULL UNIQUE,
  `model_name` VARCHAR(120) NOT NULL,
  `algorithm` VARCHAR(30) NOT NULL DEFAULT 'DQN',
  `skill_level` VARCHAR(60) NOT NULL DEFAULT 'Menengah (Mulai Melangkah)',
  `trained_episodes` INT NOT NULL DEFAULT 1,
  `best_distance_m` DOUBLE NOT NULL DEFAULT 0.0,
  `best_reward` DOUBLE NOT NULL DEFAULT 0.0,
  `architecture_json` TEXT NOT NULL,
  `weights_json` LONGTEXT NOT NULL,
  `notes` TEXT NULL,
  `is_builtin` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. Tabel Pendukung Keamanan: security_incidents
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `security_incidents` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `incident_type` VARCHAR(100) NOT NULL,
  `source_ip` VARCHAR(45) NOT NULL,
  `request_uri` VARCHAR(255) NULL,
  `payload_snippet` TEXT NULL,
  `action_taken` VARCHAR(50) DEFAULT 'Blocked',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- SEED DATA AWAL UNTUK EDUKASI MAHASISWA
-- =====================================================================

INSERT INTO `reward_presets` (
  `id`, `preset_code`, `preset_name`, `description`, `algorithm`,
  `learning_rate`, `gamma`, `epsilon_start`, `epsilon_min`, `epsilon_decay`,
  `reward_forward_weight`, `reward_upright_weight`, `reward_gait_weight`,
  `penalty_fall`, `penalty_torque`, `gravity`, `ground_friction`, `target_distance_m`
) VALUES
(1, 'standar_seimbang', 'Eksperimen 1: Kurikulum Seimbang (Rekomendasi Mahasiswa)',
 'Menyeimbangkan hadiah kecepatan maju (+4.5), postur badan tegak (+2.5), dan koordinasi ayunan kaki kiri-kanan (+2.0). Cocok untuk mempelajari cara AI menemukan keseimbangan berjalan dari nol.',
 'DQN', 0.002, 0.98, 1.00, 0.05, 0.91, 4.5, 2.5, 2.0, -45.0, -0.05, 9.81, 0.85, 20.0),
(2, 'fokus_lari_cepat', 'Eksperimen 2: Fokus Kecepatan Maju (Agresif / Sprint)',
 'Memberikan bobot hadiah maju sangat besar (+7.5) tetapi bobot keseimbangan tegak kecil (+1.0). AI akan cenderung condong ke depan untuk berlari cepat namun lebih sering tersungkur di episode awal.',
 'DQN', 0.003, 0.97, 1.00, 0.05, 0.92, 7.5, 1.0, 1.5, -35.0, -0.02, 9.81, 0.85, 20.0),
(3, 'fokus_postur_tegak', 'Eksperimen 3: Fokus Postur Tegak & Hemat Energi (PPO)',
 'Menggunakan pendekatan Policy Gradient (PPO) dengan prioritas tinggi pada postur tubuh tegak (+4.5) dan penalti penggunaan otot agar langkah terlihat santai dan natural.',
 'PPO', 0.0015, 0.99, 0.85, 0.05, 0.90, 3.8, 4.5, 2.5, -60.0, -0.12, 9.81, 0.88, 20.0),
(4, 'lantai_es_licin', 'Eksperimen 4: Tantangan Lantai Licin (Gesekan Rendah)',
 'Simulasi berjalan di atas lantai licin (koefisien gesek 0.45). Mahasiswa dapat mengamati bagaimana AI memperpendek langkah kaki agar tidak terpeleset.',
 'CURRICULUM_RL', 0.002, 0.98, 0.90, 0.05, 0.89, 4.0, 3.5, 2.8, -50.0, -0.06, 9.81, 0.45, 20.0)
ON DUPLICATE KEY UPDATE
  `preset_name` = VALUES(`preset_name`),
  `description` = VALUES(`description`),
  `reward_forward_weight` = VALUES(`reward_forward_weight`),
  `reward_upright_weight` = VALUES(`reward_upright_weight`),
  `reward_gait_weight` = VALUES(`reward_gait_weight`),
  `penalty_fall` = VALUES(`penalty_fall`),
  `ground_friction` = VALUES(`ground_friction`);

INSERT INTO `training_sessions` (
  `id`, `session_code`, `student_name`, `session_title`, `algorithm`, `preset_code`,
  `learning_rate`, `gamma`, `total_episodes`, `best_distance_m`, `best_reward`,
  `avg_distance_m`, `avg_reward`, `success_walk_count`, `fall_count`, `status`, `config_json`
) VALUES
(1, 'SES-WALKER-DEMO-01', 'Mahasiswa Praktikum AI', 'Sesi 1: Pembelajaran Bipedal Walker dari Nol hingga 20m',
 'DQN', 'standar_seimbang', 0.002, 0.98, 20, 20.00, 342.80, 9.54, 118.45, 4, 16, 'active',
 '{"state_dim":8,"action_dim":7,"hidden_layers":[64,64],"target_distance_m":20.0}')
ON DUPLICATE KEY UPDATE
  `session_title` = VALUES(`session_title`);

INSERT INTO `episode_logs` (
  `id`, `session_id`, `episode_number`, `algorithm`, `distance_m`, `total_reward`,
  `steps_count`, `duration_sec`, `avg_torso_angle_deg`, `avg_speed_ms`, `epsilon`,
  `loss_value`, `termination_reason`, `reached_finish`, `stage_label`
) VALUES
(1, 1, 1, 'DQN', 0.72, -38.40, 28, 0.56, 26.4, 0.45, 1.00, 1.842, 'Jatuh Tersungkur ke Depan', 0, 'Tahap 1: Eksplorasi Acak (Sering Jatuh)'),
(2, 1, 2, 'DQN', 0.58, -41.10, 24, 0.48, -29.1, 0.38, 0.91, 1.620, 'Jatuh Terjengkang ke Belakang', 0, 'Tahap 1: Eksplorasi Acak (Sering Jatuh)'),
(3, 1, 3, 'DQN', 1.15, -26.80, 44, 0.88, 22.8, 0.62, 0.83, 1.410, 'Jatuh Tersungkur ke Depan', 0, 'Tahap 1: Eksplorasi Acak (Sering Jatuh)'),
(4, 1, 4, 'DQN', 1.64, -15.20, 58, 1.16, 19.5, 0.71, 0.75, 1.185, 'Lutut Tekuk Berlebih (Ambruk)', 0, 'Tahap 1: Eksplorasi Acak (Sering Jatuh)'),
(5, 1, 5, 'DQN', 2.35, 4.60, 76, 1.52, 16.2, 0.82, 0.68, 0.964, 'Jatuh Tersungkur ke Depan', 0, 'Tahap 2: Belajar Menjaga Keseimbangan Badan'),
(6, 1, 6, 'DQN', 3.10, 21.40, 96, 1.92, 14.8, 0.89, 0.62, 0.842, 'Jatuh Terjengkang ke Belakang', 0, 'Tahap 2: Belajar Menjaga Keseimbangan Badan'),
(7, 1, 7, 'DQN', 4.25, 48.90, 128, 2.56, 13.1, 0.95, 0.57, 0.715, 'Jatuh Tersungkur ke Depan', 0, 'Tahap 2: Belajar Menjaga Keseimbangan Badan'),
(8, 1, 8, 'DQN', 5.40, 72.30, 156, 3.12, 11.9, 1.02, 0.52, 0.618, 'Hilang Keseimbangan Saat Melangkah', 0, 'Tahap 2: Belajar Menjaga Keseimbangan Badan'),
(9, 1, 9, 'DQN', 6.85, 98.10, 194, 3.88, 10.4, 1.08, 0.47, 0.524, 'Jatuh Tersungkur ke Depan', 0, 'Tahap 3: Koordinasi Langkah Kaki Kiri & Kanan'),
(10, 1, 10, 'DQN', 8.12, 124.50, 225, 4.50, 9.6, 1.14, 0.43, 0.449, 'Hilang Keseimbangan Saat Melangkah', 0, 'Tahap 3: Koordinasi Langkah Kaki Kiri & Kanan'),
(11, 1, 11, 'DQN', 9.75, 152.80, 264, 5.28, 8.8, 1.18, 0.39, 0.382, 'Jatuh Tersungkur ke Depan', 0, 'Tahap 3: Koordinasi Langkah Kaki Kiri & Kanan'),
(12, 1, 12, 'DQN', 11.40, 178.20, 302, 6.04, 8.1, 1.22, 0.35, 0.328, 'Hilang Keseimbangan Saat Melangkah', 0, 'Tahap 3: Koordinasi Langkah Kaki Kiri & Kanan'),
(13, 1, 13, 'DQN', 13.60, 214.60, 350, 7.00, 7.4, 1.26, 0.32, 0.275, 'Jatuh Tersungkur ke Depan', 0, 'Tahap 3: Koordinasi Langkah Kaki Kiri & Kanan'),
(14, 1, 14, 'DQN', 15.20, 238.90, 386, 7.72, 6.8, 1.29, 0.29, 0.241, 'Hilang Keseimbangan Saat Melangkah', 0, 'Tahap 3: Koordinasi Langkah Kaki Kiri & Kanan'),
(15, 1, 15, 'DQN', 17.85, 274.10, 442, 8.84, 6.2, 1.33, 0.27, 0.210, 'Jatuh Mendekati Garis Finish', 0, 'Tahap 3: Koordinasi Langkah Kaki Kiri & Kanan'),
(16, 1, 16, 'DQN', 20.00, 318.40, 485, 9.70, 5.4, 1.38, 0.24, 0.184, 'Mencapai Garis Finish 20m!', 1, 'Tahap 4: Mahir Berjalan Stabil!'),
(17, 1, 17, 'DQN', 18.90, 289.50, 462, 9.24, 5.8, 1.36, 0.22, 0.165, 'Tergelincir di Meter ke-19', 0, 'Tahap 4: Mahir Berjalan Stabil!'),
(18, 1, 18, 'DQN', 20.00, 329.70, 472, 9.44, 4.9, 1.41, 0.20, 0.148, 'Mencapai Garis Finish 20m!', 1, 'Tahap 4: Mahir Berjalan Stabil!'),
(19, 1, 19, 'DQN', 20.00, 336.20, 464, 9.28, 4.5, 1.44, 0.18, 0.132, 'Mencapai Garis Finish 20m!', 1, 'Tahap 4: Mahir Berjalan Stabil!'),
(20, 1, 20, 'DQN', 20.00, 342.80, 456, 9.12, 4.1, 1.46, 0.16, 0.119, 'Mencapai Garis Finish 20m!', 1, 'Tahap 4: Mahir Berjalan Stabil!')
ON DUPLICATE KEY UPDATE
  `distance_m` = VALUES(`distance_m`),
  `total_reward` = VALUES(`total_reward`);

INSERT INTO `saved_models` (
  `id`, `model_code`, `model_name`, `algorithm`, `skill_level`,
  `trained_episodes`, `best_distance_m`, `best_reward`, `architecture_json`, `weights_json`, `notes`, `is_builtin`
) VALUES
(1, 'MODEL_LVL0_RANDOM', '👶 Level 0: Otak Baru Lahir (Belum Dilatih / Acak)', 'DQN', 'Pemula (Baru Berdiri)',
 0, 0.85, -39.50, '{"inputShape":[8],"layers":[64,64],"outputActions":7}',
 '{"preset_mode":"untrained","guidance_strength":0.0,"epsilon":1.0}',
 'Jaringan saraf dengan bobot acak murni. Digunakan mahasiswa untuk mengamati perilaku eksplorasi awal di mana manusia 3D langsung jatuh.', 1),
(2, 'MODEL_LVL1_TODDLER', '🧒 Level 1: Tahap Belajar Melangkah (Episode 10)', 'DQN', 'Menengah (Mulai Melangkah)',
 10, 8.12, 124.50, '{"inputShape":[8],"layers":[64,64],"outputActions":7}',
 '{"preset_mode":"intermediate","guidance_strength":0.62,"epsilon":0.35}',
 'Model hasil pelatihan 10 episode. Sudah mengenal cara menegakkan punggung saat condong, mampu berjalan 5-12 meter namun masih bisa goyah.', 1),
(3, 'MODEL_LVL2_MASTER', '🏃 Level 2: Model Mahir Berjalan Stabil (Episode 25+)', 'DQN', 'Mahir (Berjalan Stabil)',
 25, 20.00, 348.50, '{"inputShape":[8],"layers":[64,64],"outputActions":7}',
 '{"preset_mode":"master","guidance_strength":0.95,"epsilon":0.05}',
 'Model yang sudah konvergen. Mampu menjaga keseimbangan tubuh secara aktif, melangkah ritmis hingga garis finish 20 meter, dan tahan terhadap dorongan gangguan.', 1)
ON DUPLICATE KEY UPDATE
  `model_name` = VALUES(`model_name`),
  `notes` = VALUES(`notes`);
