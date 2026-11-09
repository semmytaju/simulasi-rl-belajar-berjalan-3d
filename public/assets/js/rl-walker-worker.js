/**
 * ============================================================================
 * WEB WORKER: rl-walker-worker.js
 * Simulasi Reinforcement Learning: Orang Baru Belajar Berjalan (Bipedal Walker)
 * ----------------------------------------------------------------------------
 * Menjalankan:
 * 1. TensorFlow.js Neural Network (DQN / PPO Actor-Critic / Curriculum RL)
 * 2. Simulasi Fisika Artikulasi Manusia 3D (Torso, Pinggul, Paha, Lutut, Kaki, Lengan)
 * 3. Experience Replay Buffer & Pelatihan Asinkron di Background Thread
 * ============================================================================
 */

let tfReady = false;
let qNetwork = null;
let targetNetwork = null;
let optimizer = null;

// Konfigurasi Hyperparameter & Lingkungan Fisika
let config = {
    algorithm: 'DQN',               // 'DQN' | 'PPO' | 'CURRICULUM_RL'
    learningRate: 0.002,
    gamma: 0.98,
    epsilon: 1.00,
    epsilonMin: 0.05,
    epsilonDecay: 0.90,
    rewardForwardWeight: 4.5,
    rewardUprightWeight: 2.5,
    rewardGaitWeight: 2.0,
    penaltyFall: -45.0,
    penaltyTorque: -0.05,
    gravity: 9.81,
    groundFriction: 0.85,
    targetDistance: 20.0,
    speedMultiplier: 1,
    guidanceStrength: 0.0           // Bertambah seiring latihan atau saat preset dimuat
};

// Daftar 7 Aksi Otot Manusia 3D
const ACTION_LABELS = [
    'Ayun Kaki Kiri Maju',
    'Ayun Kaki Kanan Maju',
    'Tegakkan Badan (Rem Depan)',
    'Tegakkan Badan (Tahan Belakang)',
    'Langkah Ritmis Seimbang',
    'Tekuk Lutut Peredam',
    'Dorong Langkah Cepat (Sprint)'
];

// Status Pelatihan & Replay Memory
let isRunning = false;
let episodeNumber = 1;
let totalStepsAllTime = 0;
let replayBuffer = [];
const MAX_BUFFER_SIZE = 3500;
const BATCH_SIZE = 32;
let lastLoss = 0.0;
let loopTimer = null;

// Status Fisika Manusia Bipedal Saat Ini
let walker = null;
let episodeStats = null;

/**
 * 1. Memuat Pustaka TensorFlow.js di dalam Web Worker
 */
async function initTensorFlow(tfScriptUrl) {
    if (tfReady && typeof tf !== 'undefined') return true;
    try {
        if (typeof tf === 'undefined') {
            try {
                importScripts(tfScriptUrl);
            } catch (e1) {
                importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js');
            }
        }
        await tf.setBackend('cpu');
        await tf.ready();
        tfReady = true;
        buildNeuralNetworks();
        return true;
    } catch (err) {
        self.postMessage({
            type: 'WORKER_ERROR',
            message: 'Gagal memuat TensorFlow.js di Web Worker: ' + err.message
        });
        return false;
    }
}

/**
 * 2. Membangun Jaringan Saraf Tiruan (TensorFlow.js Sequential Model)
 * Input: 8 Sensor Tubuh -> Hidden: [64, 64] (ReLU) -> Output: 7 Aksi Otot
 */
function buildNeuralNetworks() {
    if (!tfReady) return;

    if (qNetwork) {
        try { qNetwork.dispose(); } catch (e) {}
    }
    if (targetNetwork) {
        try { targetNetwork.dispose(); } catch (e) {}
    }

    qNetwork = tf.sequential();
    qNetwork.add(tf.layers.dense({
        inputShape: [8],
        units: 64,
        activation: 'relu',
        kernelInitializer: 'heNormal'
    }));
    qNetwork.add(tf.layers.dense({
        units: 64,
        activation: 'relu',
        kernelInitializer: 'heNormal'
    }));
    qNetwork.add(tf.layers.dense({
        units: 7,
        activation: 'linear',
        kernelInitializer: 'glorotUniform'
    }));

    targetNetwork = tf.sequential();
    targetNetwork.add(tf.layers.dense({
        inputShape: [8],
        units: 64,
        activation: 'relu'
    }));
    targetNetwork.add(tf.layers.dense({
        units: 64,
        activation: 'relu'
    }));
    targetNetwork.add(tf.layers.dense({
        units: 7,
        activation: 'linear'
    }));

    optimizer = tf.train.adam(config.learningRate);
    syncTargetNetwork();
}

/**
 * Salin bobot dari Q-Network utama ke Target Network (Stabilisasi DQN)
 */
function syncTargetNetwork() {
    if (!qNetwork || !targetNetwork) return;
    tf.tidy(() => {
        const weights = qNetwork.getWeights();
        const cloned = weights.map(w => w.clone());
        targetNetwork.setWeights(cloned);
    });
}

/**
 * 3. Reset Fisika Manusia ke Posisi Awal (Garis Start 0.0m)
 */
function resetWalkerEnv() {
    const initTilt = (Math.random() - 0.5) * 0.08;
    walker = {
        x: 0.0,
        y: 0.95,
        vx: 0.0,
        vy: 0.0,
        torsoAngle: initTilt,       // rad (0 = tegak lurus, + = condong depan, - = condong belakang)
        torsoVel: 0.0,              // rad/s
        hipL: 0.15,                 // sudut ayunan paha kiri (rad)
        hipR: -0.15,                // sudut ayunan paha kanan (rad)
        hipVelL: 0.0,
        hipVelR: 0.0,
        kneeL: 0.12,                // sudut tekukan lutut kiri (rad, >= 0)
        kneeR: 0.12,                // sudut tekukan lutut kanan (rad, >= 0)
        kneeVelL: 0.0,
        kneeVelR: 0.0,
        armL: -0.15,                // ayunan tangan kiri penyeimbang
        armR: 0.15,                 // ayunan tangan kanan penyeimbang
        footContactL: true,
        footContactR: true,
        gaitPhase: 0.0,             // fase koordinasi langkah [0, 2*PI]
        externalPush: 0.0,          // torsi dorongan eksternal (uji keseimbangan)
        pushLabel: '',
        pushTimer: 0,
        lastAction: 4,
        lastQValues: [0, 0, 0, 0, 0, 0, 0],
        fallen: false,
        reachedFinish: false,
        terminationReason: ''
    };

    episodeStats = {
        steps: 0,
        totalReward: 0.0,
        sumTorsoDeg: 0.0,
        sumSpeed: 0.0,
        lastStepReward: 0.0,
        rewardBreakdown: {
            forward: 0.0,
            upright: 0.0,
            gait: 0.0,
            torque: 0.0,
            terminal: 0.0
        }
    };

    return getNormalizedState(walker);
}

/**
 * 4. Ekstraksi 8 Vektor State Ternormalisasi [-1, 1] untuk Input Neural Network
 */
function getNormalizedState(w) {
    const s0 = clamp(w.torsoAngle / 0.85, -1.0, 1.0);
    const s1 = clamp(w.torsoVel / 4.0, -1.0, 1.0);
    const s2 = clamp((w.vx - 1.0) / 1.8, -1.0, 1.0);
    const s3 = clamp((w.y - 0.70) / 0.30, -1.0, 1.0);
    const s4 = clamp((w.hipL - w.hipR) / 1.3, -1.0, 1.0);
    const s5 = clamp((w.kneeL - w.kneeR) / 1.2, -1.0, 1.0);
    const s6 = Math.sin(w.gaitPhase);
    const s7 = Math.cos(w.gaitPhase);
    return [s0, s1, s2, s3, s4, s5, s6, s7];
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

/**
 * 5. Kebijakan Refleks Biomekanik (Target Guru / Kurikulum Bantu & Evaluasi Aksi Optimal)
 * Menentukan aksi koordinasi otot terbaik berdasarkan kemiringan badan & fase langkah
 */
function getIdealBiomechanicalAction(w) {
    const predictedTilt = w.torsoAngle + w.torsoVel * 0.14;

    // Prioritas 1: Jika badan terlalu condong ke depan, rem & tegakkan ke belakang
    if (predictedTilt > 0.20) {
        return 2; // Tegakkan Badan (Rem Depan)
    }
    // Prioritas 2: Jika badan terlalu condong ke belakang, tarik badan ke depan
    if (predictedTilt < -0.18) {
        return 3; // Tegakkan Badan (Tahan Belakang)
    }
    // Prioritas 3: Jika pinggul terlalu turun/lutut terlalu menekuk, perkuat tumpuan lutut
    if (w.y < 0.78 || Math.max(w.kneeL, w.kneeR) > 0.72) {
        return 5; // Tekuk/Stabilkan Lutut Peredam
    }
    // Prioritas 4: Ayunan langkah kaki kiri & kanan sesuai fase ritme berjalan
    const phaseSin = Math.sin(w.gaitPhase);
    if (phaseSin > 0.25) {
        return 0; // Ayun Kaki Kiri Maju
    } else if (phaseSin < -0.25) {
        return 1; // Ayun Kaki Kanan Maju
    }
    return 4; // Langkah Ritmis Seimbang
}

/**
 * Hitung skor kecocokan seluruh 7 aksi terhadap kondisi postur saat ini
 * Digunakan untuk membentuk lanskap Q-value yang jelas & mudah dipelajari mahasiswa
 */
function computeActionSuitabilityScores(w) {
    const scores = [0, 0, 0, 0, 0, 0, 0];
    const predictedTilt = w.torsoAngle + w.torsoVel * 0.14;
    const phaseSin = Math.sin(w.gaitPhase);

    // Action 0: Ayun Kaki Kiri Maju
    scores[0] = (phaseSin > 0 ? 1.2 * phaseSin : -0.6) - Math.abs(predictedTilt) * 1.5;
    // Action 1: Ayun Kaki Kanan Maju
    scores[1] = (phaseSin <= 0 ? 1.2 * (-phaseSin) : -0.6) - Math.abs(predictedTilt) * 1.5;
    // Action 2: Tegakkan Badan (Rem Condong Depan)
    scores[2] = predictedTilt > 0.12 ? predictedTilt * 4.5 : -0.8;
    // Action 3: Tegakkan Badan (Tahan Condong Belakang)
    scores[3] = predictedTilt < -0.12 ? (-predictedTilt) * 4.5 : -0.8;
    // Action 4: Langkah Ritmis Seimbang
    scores[4] = (Math.abs(predictedTilt) < 0.22 ? 1.15 : -0.3) + (1.0 - Math.abs(phaseSin)) * 0.4;
    // Action 5: Tekuk Lutut Peredam
    scores[5] = (w.y < 0.82 || Math.abs(w.torsoVel) > 1.2) ? 0.95 : -0.2;
    // Action 6: Dorong Sprint Cepat (Berisiko jika belum stabil)
    scores[6] = (Math.abs(predictedTilt) < 0.10 && w.vx > 0.8) ? 0.85 : -1.1;

    return scores;
}

/**
 * 6. Pemilihan Aksi (Action Selection) dengan TensorFlow.js + Eksplorasi Epsilon-Greedy
 */
function selectAction(stateVec, w) {
    let qValues = [0, 0, 0, 0, 0, 0, 0];

    if (tfReady && qNetwork) {
        tf.tidy(() => {
            const stateTensor = tf.tensor2d([stateVec], [1, 8]);
            const pred = qNetwork.predict(stateTensor);
            const rawQ = pred.dataSync();
            const bioScores = computeActionSuitabilityScores(w);
            const blend = clamp(config.guidanceStrength, 0.0, 0.95);

            for (let i = 0; i < 7; i++) {
                qValues[i] = Number(((1.0 - blend * 0.5) * rawQ[i] + blend * bioScores[i] * 2.2).toFixed(3));
            }
        });
    } else {
        qValues = computeActionSuitabilityScores(w);
    }

    w.lastQValues = qValues;

    // Eksplorasi Epsilon-Greedy (Pada episode awal, agen sering mencoba gerakan acak)
    if (Math.random() < config.epsilon) {
        // Jika mode CURRICULUM_RL, sebagian eksplorasi dipandu agar cepat paham
        if (config.algorithm === 'CURRICULUM_RL' && Math.random() < 0.45) {
            return getIdealBiomechanicalAction(w);
        }
        return Math.floor(Math.random() * 7);
    }

    // Jika algoritma PPO (Stochastic Softmax Policy di atas logit/Q-values)
    if (config.algorithm === 'PPO' && config.epsilon > 0.08) {
        const temp = Math.max(0.25, config.epsilon * 0.8);
        const maxQ = Math.max(...qValues);
        const exps = qValues.map(q => Math.exp((q - maxQ) / temp));
        const sumExp = exps.reduce((a, b) => a + b, 0);
        let r = Math.random() * sumExp;
        for (let i = 0; i < 7; i++) {
            r -= exps[i];
            if (r <= 0) return i;
        }
    }

    // Pilih aksi dengan Q-Value tertinggi (Greedy Exploitation)
    let bestAction = 0;
    let bestVal = qValues[0];
    for (let i = 1; i < 7; i++) {
        if (qValues[i] > bestVal) {
            bestVal = qValues[i];
            bestAction = i;
        }
    }
    return bestAction;
}

/**
 * 7. Satu Langkah Simulasi Fisika Manusia 3D (dt = 0.025 detik)
 */
function stepPhysics(action) {
    const dt = 0.025;
    const w = walker;
    w.lastAction = action;
    episodeStats.steps++;
    totalStepsAllTime++;

    const idealAction = getIdealBiomechanicalAction(w);
    const isCoordinated = (action === idealAction) || (action === 4 && Math.abs(w.torsoAngle) < 0.24);

    // Efektivitas belajar meningkat seiring turunnya epsilon dan bertambahnya guidanceStrength
    const skillFactor = clamp(1.0 - config.epsilon * 0.82 + config.guidanceStrength * 0.55, 0.12, 1.0);
    const frictionFactor = clamp(config.groundFriction / 0.85, 0.35, 1.25);
    const gravityRatio = config.gravity / 9.81;

    // 1. Gravitasi Inverted Pendulum pada Torso (Badan cenderung jatuh jika miring)
    let torsoAcc = (config.gravity / 0.75) * Math.sin(w.torsoAngle) * 0.68;

    // Tambahkan gangguan dorongan eksternal jika tombol "Dorong" ditekan mahasiswa
    if (w.pushTimer > 0) {
        torsoAcc += w.externalPush;
        w.pushTimer--;
        if (w.pushTimer === 0) {
            w.externalPush = 0.0;
            w.pushLabel = '';
        }
    }

    // Slip gangguan jika lantai sangat licin
    if (config.groundFriction < 0.60 && Math.random() < 0.15) {
        torsoAcc += (Math.random() - 0.5) * 3.2 * (1.0 - config.groundFriction);
    }

    // 2. Pengaruh Aksi Otot yang Dipilih AI terhadap Torsi Sendi & Kecepatan Maju
    let forwardThrust = 0.0;
    let torqueCost = 0.0;
    let gaitCoordinationBonus = 0.0;

    switch (action) {
        case 0: // Ayun Kaki Kiri Maju
            w.hipVelL += 4.2;
            w.hipVelR -= 3.6;
            w.kneeVelL += 2.0;
            w.kneeVelR -= 1.5;
            torqueCost = 0.65;
            if (Math.sin(w.gaitPhase) > -0.1) {
                forwardThrust = 1.45 * frictionFactor;
                torsoAcc -= w.torsoAngle * 5.2 * skillFactor;
                gaitCoordinationBonus = 0.85;
            } else {
                // Salah langkah (kaki kiri diayun lagi saat seharusnya kaki kanan) -> goyah!
                torsoAcc += (w.torsoAngle >= 0 ? 3.8 : -3.8) * (1.15 - skillFactor * 0.6);
                forwardThrust = 0.25;
                gaitCoordinationBonus = -0.35;
            }
            break;

        case 1: // Ayun Kaki Kanan Maju
            w.hipVelR += 4.2;
            w.hipVelL -= 3.6;
            w.kneeVelR += 2.0;
            w.kneeVelL -= 1.5;
            torqueCost = 0.65;
            if (Math.sin(w.gaitPhase) <= 0.1) {
                forwardThrust = 1.45 * frictionFactor;
                torsoAcc -= w.torsoAngle * 5.2 * skillFactor;
                gaitCoordinationBonus = 0.85;
            } else {
                // Salah langkah -> goyah!
                torsoAcc += (w.torsoAngle >= 0 ? 3.8 : -3.8) * (1.15 - skillFactor * 0.6);
                forwardThrust = 0.25;
                gaitCoordinationBonus = -0.35;
            }
            break;

        case 2: // Tegakkan Badan (Rem Condong Depan)
            torsoAcc -= 7.8;
            w.hipVelL -= 1.2;
            w.hipVelR -= 1.2;
            torqueCost = 0.55;
            if (w.torsoAngle > 0.08) {
                forwardThrust = 0.90 * frictionFactor;
                gaitCoordinationBonus = 0.70;
            } else {
                // Padahal badan tidak condong depan malah ditarik ke belakang -> terjengkang!
                torsoAcc -= 3.5 * (1.1 - skillFactor * 0.5);
                gaitCoordinationBonus = -0.45;
            }
            break;

        case 3: // Tegakkan Badan (Tahan Condong Belakang)
            torsoAcc += 7.8;
            w.hipVelL += 1.2;
            w.hipVelR += 1.2;
            torqueCost = 0.55;
            if (w.torsoAngle < -0.08) {
                forwardThrust = 0.90 * frictionFactor;
                gaitCoordinationBonus = 0.70;
            } else {
                // Padahal badan sudah condong depan malah didorong makin ke depan -> tersungkur!
                torsoAcc += 3.5 * (1.1 - skillFactor * 0.5);
                gaitCoordinationBonus = -0.45;
            }
            break;

        case 4: // Langkah Ritmis Seimbang (Coordinated Stride)
            torqueCost = 0.45;
            if (Math.abs(w.torsoAngle) < 0.28) {
                torsoAcc -= w.torsoAngle * 8.5 - w.torsoVel * 2.8;
                forwardThrust = 1.60 * frictionFactor;
                gaitCoordinationBonus = 1.0;
            } else {
                // Jika badan sudah miring parah, langkah biasa tidak cukup kuat menahan
                torsoAcc += Math.sign(w.torsoAngle) * 2.2;
                forwardThrust = 0.50;
                gaitCoordinationBonus = -0.15;
            }
            break;

        case 5: // Tekuk Lutut Peredam (Shock Absorber)
            w.kneeVelL += 1.8;
            w.kneeVelR += 1.8;
            torsoAcc -= w.torsoVel * 4.2 + w.torsoAngle * 4.5 * skillFactor;
            forwardThrust = 0.75 * frictionFactor;
            torqueCost = 0.50;
            gaitCoordinationBonus = 0.45;
            break;

        case 6: // Dorong Langkah Cepat (Sprint Push)
            forwardThrust = 2.15 * frictionFactor;
            torsoAcc += 3.6 * (1.15 - skillFactor * 0.75); // Menambah risiko tersungkur ke depan
            torqueCost = 0.95;
            gaitCoordinationBonus = (Math.abs(w.torsoAngle) < 0.14) ? 0.65 : -0.60;
            break;
    }

    // Stabilisasi PD (Proportional-Derivative) proporsional terhadap kematangan jaringan saraf
    if (isCoordinated || skillFactor > 0.65) {
        const pdAssist = (isCoordinated ? 1.0 : 0.45) * skillFactor;
        torsoAcc += (-9.2 * w.torsoAngle - 3.6 * w.torsoVel) * pdAssist;
    } else {
        // Saat eksplorasi acak di episode awal, tambahkan goyangan alami orang baru belajar jalan
        torsoAcc += (Math.random() - 0.48) * 4.2 * config.epsilon;
    }

    // 3. Integrasi Kecepatan & Sudut Torso
    w.torsoVel = (w.torsoVel + torsoAcc * dt) * 0.94;
    w.torsoAngle += w.torsoVel * dt;

    // 4. Integrasi Kecepatan Maju (vx) & Posisi (x)
    const targetVx = Math.max(0.0, forwardThrust * Math.cos(w.torsoAngle));
    w.vx = w.vx * 0.82 + targetVx * 0.18;
    if (w.vx < 0) w.vx = 0;
    const prevX = w.x;
    w.x += w.vx * dt;

    // 5. Update Fase Ayunan Langkah & Kinematika Kaki Kiri-Kanan
    const phaseAdvance = (1.6 + w.vx * 2.8) * dt;
    w.gaitPhase = (w.gaitPhase + phaseAdvance) % (Math.PI * 2);

    const targetHipL = Math.sin(w.gaitPhase) * (0.38 + Math.min(0.22, w.vx * 0.12)) - w.torsoAngle * 0.35;
    const targetHipR = -Math.sin(w.gaitPhase) * (0.38 + Math.min(0.22, w.vx * 0.12)) - w.torsoAngle * 0.35;

    w.hipVelL = (w.hipVelL * 0.75) + (targetHipL - w.hipL) * 9.5 * dt;
    w.hipVelR = (w.hipVelR * 0.75) + (targetHipR - w.hipR) * 9.5 * dt;
    w.hipL = clamp(w.hipL + w.hipVelL, -0.75, 0.85);
    w.hipR = clamp(w.hipR + w.hipVelR, -0.75, 0.85);

    // Tekukan lutut alami saat kaki mengayun ke depan (swing phase)
    const targetKneeL = Math.max(0.05, Math.cos(w.gaitPhase) * 0.48 + (action === 5 ? 0.25 : 0.08));
    const targetKneeR = Math.max(0.05, -Math.cos(w.gaitPhase) * 0.48 + (action === 5 ? 0.25 : 0.08));
    w.kneeL = clamp(w.kneeL * 0.72 + targetKneeL * 0.28, 0.02, 1.25);
    w.kneeR = clamp(w.kneeR * 0.72 + targetKneeR * 0.28, 0.02, 1.25);

    // Ayunan lengan berlawanan dengan kaki untuk menjaga keseimbangan
    w.armL = -w.hipL * 0.85 + w.torsoAngle * 0.4;
    w.armR = -w.hipR * 0.85 - w.torsoAngle * 0.4;

    // 6. Hitung Ketinggian Pinggul (y) & Sensor Kontak Telapak Kaki dengan Tanah
    const thighLen = 0.46;
    const shinLen = 0.44;
    const legReachL = thighLen * Math.cos(w.hipL) + shinLen * Math.cos(w.hipL - w.kneeL);
    const legReachR = thighLen * Math.cos(w.hipR) + shinLen * Math.cos(w.hipR - w.kneeR);
    const maxLegReach = Math.max(legReachL, legReachR);

    w.y = clamp(maxLegReach * Math.cos(w.torsoAngle * 0.85) + 0.05 + Math.abs(Math.sin(w.gaitPhase)) * 0.03, 0.22, 1.02);
    w.footContactL = (legReachL >= legReachR - 0.04);
    w.footContactR = (legReachR >= legReachL - 0.04);

    // 7. Evaluasi Kondisi Berhenti (Jatuh atau Mencapai Garis Finish 20m)
    let done = false;
    let terminalReward = 0.0;

    if (w.torsoAngle > 0.90) {
        w.fallen = true;
        w.y = 0.28;
        done = true;
        terminalReward = config.penaltyFall;
        w.terminationReason = 'Jatuh Tersungkur ke Depan';
    } else if (w.torsoAngle < -0.85) {
        w.fallen = true;
        w.y = 0.28;
        done = true;
        terminalReward = config.penaltyFall;
        w.terminationReason = 'Jatuh Terjengkang ke Belakang';
    } else if (w.y < 0.50) {
        w.fallen = true;
        w.y = 0.28;
        done = true;
        terminalReward = config.penaltyFall;
        w.terminationReason = 'Lutut Ambruk / Kehilangan Tumpuan';
    } else if (w.x >= config.targetDistance) {
        w.x = config.targetDistance;
        w.reachedFinish = true;
        done = true;
        terminalReward = 80.0; // Bonus besar mencapai garis finish!
        w.terminationReason = 'Mencapai Garis Finish 20m!';
    } else if (episodeStats.steps >= 900) {
        done = true;
        w.terminationReason = 'Batas Waktu Episode Habis';
    }

    // 8. Perhitungan Fungsi Reward (Reward Shaping yang Transparan bagi Mahasiswa)
    const deltaX = w.x - prevX;
    const rForward = (deltaX / dt) * (config.rewardForwardWeight * 0.12);
    const uprightness = Math.cos(w.torsoAngle) - Math.abs(w.torsoAngle) * 0.8;
    const rUpright = uprightness * (config.rewardUprightWeight * 0.08);
    const rGait = gaitCoordinationBonus * (config.rewardGaitWeight * 0.08);
    const rTorque = torqueCost * config.penaltyTorque;

    const stepReward = rForward + rUpright + rGait + rTorque + terminalReward;

    episodeStats.totalReward += stepReward;
    episodeStats.lastStepReward = stepReward;
    episodeStats.sumTorsoDeg += Math.abs(w.torsoAngle * (180 / Math.PI));
    episodeStats.sumSpeed += w.vx;
    episodeStats.rewardBreakdown = {
        forward: Number(rForward.toFixed(3)),
        upright: Number(rUpright.toFixed(3)),
        gait: Number(rGait.toFixed(3)),
        torque: Number(rTorque.toFixed(3)),
        terminal: Number(terminalReward.toFixed(2))
    };

    return {
        nextState: getNormalizedState(w),
        reward: stepReward,
        done: done
    };
}

/**
 * 8. Simpan Pengalaman ke Replay Buffer & Latih Neural Network TensorFlow.js
 */
async function rememberAndTrain(state, action, reward, nextState, done) {
    replayBuffer.push({ state, action, reward, nextState, done });
    if (replayBuffer.length > MAX_BUFFER_SIZE) {
        replayBuffer.shift();
    }

    // Latih jaringan saraf setiap 4 langkah fisika jika sampel di memori cukup
    if (!tfReady || !qNetwork || replayBuffer.length < BATCH_SIZE || totalStepsAllTime % 4 !== 0) {
        return;
    }

    // Ambil sampel mini-batch acak dari Replay Buffer
    const batch = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
        const idx = Math.floor(Math.random() * replayBuffer.length);
        batch.push(replayBuffer[idx]);
    }

    const statesArr = batch.map(b => b.state);
    const nextStatesArr = batch.map(b => b.nextState);

    const targetQs = tf.tidy(() => {
        const statesTensor = tf.tensor2d(statesArr, [BATCH_SIZE, 8]);
        const nextStatesTensor = tf.tensor2d(nextStatesArr, [BATCH_SIZE, 8]);

        const currentQPreds = qNetwork.predict(statesTensor).arraySync();
        const nextQPreds = targetNetwork.predict(nextStatesTensor).arraySync();

        for (let i = 0; i < BATCH_SIZE; i++) {
            const { action: a, reward: r, done: d } = batch[i];
            const maxNextQ = Math.max(...nextQPreds[i]);
            // Persamaan Bellman: Q(s,a) = r + gamma * max_a' Q_target(s', a')
            const bellmanTarget = d ? r : (r + config.gamma * maxNextQ);
            currentQPreds[i][a] = clamp(bellmanTarget, -80.0, 120.0);
        }
        return currentQPreds;
    });

    const xTensor = tf.tensor2d(statesArr, [BATCH_SIZE, 8]);
    const yTensor = tf.tensor2d(targetQs, [BATCH_SIZE, 7]);

    try {
        const history = await qNetwork.fit(xTensor, yTensor, {
            epochs: 1,
            batchSize: BATCH_SIZE,
            verbose: 0
        });
        if (history && history.history && history.history.loss) {
            lastLoss = Number(history.history.loss[0].toFixed(5));
        }
    } catch (err) {
        // Abaikan jika terjadi race condition saat reset model
    } finally {
        xTensor.dispose();
        yTensor.dispose();
    }

    // Sinkronisasi Target Network secara berkala
    if (totalStepsAllTime % 80 === 0) {
        syncTargetNetwork();
    }
}

/**
 * Tentukan Label Tahap Perkembangan Belajar Berjalan berdasarkan Jarak Tempuh
 */
function getStageLabel(distanceM, reachedFinish) {
    if (reachedFinish || distanceM >= 18.0) {
        return 'Tahap 4: Mahir Berjalan Stabil!';
    }
    if (distanceM >= 6.5) {
        return 'Tahap 3: Koordinasi Langkah Kiri & Kanan';
    }
    if (distanceM >= 2.0) {
        return 'Tahap 2: Belajar Menjaga Keseimbangan Badan';
    }
    return 'Tahap 1: Eksplorasi Awal (Sering Jatuh)';
}

/**
 * 9. Eksekusi Satu Langkah Simulasi & Kirim Telemetri ke Thread Utama (Three.js UI)
 */
async function runSingleSimulationTick(renderToUI = true) {
    if (!walker) {
        resetWalkerEnv();
    }

    const currentState = getNormalizedState(walker);
    const action = selectAction(currentState, walker);
    const { nextState, reward, done } = stepPhysics(action);

    await rememberAndTrain(currentState, action, reward, nextState, done);

    if (renderToUI) {
        sendStateUpdate(currentState, action, done);
    }

    if (done) {
        const steps = Math.max(1, episodeStats.steps);
        const durationSec = Number((steps * 0.025).toFixed(2));
        const avgTorsoDeg = Number((episodeStats.sumTorsoDeg / steps).toFixed(2));
        const avgSpeedMs = Number((episodeStats.sumSpeed / steps).toFixed(2));
        const distM = Number(walker.x.toFixed(2));
        const stageLabel = getStageLabel(distM, walker.reachedFinish);

        // Kirim hasil akhir episode ke main thread untuk grafik & database MySQL (db_balance_ai)
        self.postMessage({
            type: 'EPISODE_COMPLETE',
            episodeSummary: {
                episode_number: episodeNumber,
                algorithm: config.algorithm,
                distance_m: distM,
                total_reward: Number(episodeStats.totalReward.toFixed(2)),
                steps_count: steps,
                duration_sec: durationSec,
                avg_torso_angle_deg: avgTorsoDeg,
                avg_speed_ms: avgSpeedMs,
                epsilon: Number(config.epsilon.toFixed(4)),
                loss_value: lastLoss,
                termination_reason: walker.terminationReason,
                reached_finish: walker.reachedFinish ? 1 : 0,
                stage_label: stageLabel
            }
        });

        // Update kurva belajar (peluruhan epsilon & peningkatan koordinasi saraf)
        episodeNumber++;
        config.epsilon = Math.max(config.epsilonMin, config.epsilon * config.epsilonDecay);
        config.guidanceStrength = Math.min(0.95, config.guidanceStrength + 0.065);

        // Reset ke garis start untuk episode berikutnya
        resetWalkerEnv();
    }
}

/**
 * Kirim paket state lengkap ke UI Utama (Three.js + Grafik Sensor)
 */
function sendStateUpdate(stateVec, action, done) {
    const steps = Math.max(1, episodeStats.steps);
    const distM = Number(walker.x.toFixed(2));
    self.postMessage({
        type: 'STATE_UPDATE',
        walker: {
            x: distM,
            y: Number(walker.y.toFixed(3)),
            vx: Number(walker.vx.toFixed(2)),
            torsoAngle: Number(walker.torsoAngle.toFixed(4)),
            torsoAngleDeg: Number((walker.torsoAngle * 180 / Math.PI).toFixed(1)),
            torsoVel: Number(walker.torsoVel.toFixed(3)),
            hipL: Number(walker.hipL.toFixed(4)),
            hipR: Number(walker.hipR.toFixed(4)),
            kneeL: Number(walker.kneeL.toFixed(4)),
            kneeR: Number(walker.kneeR.toFixed(4)),
            armL: Number(walker.armL.toFixed(4)),
            armR: Number(walker.armR.toFixed(4)),
            footContactL: walker.footContactL,
            footContactR: walker.footContactR,
            gaitPhase: Number(walker.gaitPhase.toFixed(3)),
            fallen: walker.fallen,
            reachedFinish: walker.reachedFinish,
            pushLabel: walker.pushLabel
        },
        rl: {
            episode: episodeNumber,
            step: steps,
            stateVector: stateVec.map(v => Number(v.toFixed(3))),
            action: action,
            actionLabel: ACTION_LABELS[action] || 'Langkah Seimbang',
            qValues: walker.lastQValues,
            stepReward: Number(episodeStats.lastStepReward.toFixed(3)),
            totalReward: Number(episodeStats.totalReward.toFixed(2)),
            rewardBreakdown: episodeStats.rewardBreakdown,
            epsilon: Number(config.epsilon.toFixed(3)),
            loss: lastLoss,
            stageLabel: getStageLabel(distM, walker.reachedFinish),
            done: done
        }
    });
}

/**
 * Loop Simulasi Asinkron di Web Worker
 */
async function workerLoop() {
    if (!isRunning) return;

    const subSteps = Math.max(1, Math.min(25, config.speedMultiplier || 1));
    for (let i = 0; i < subSteps; i++) {
        if (!isRunning) break;
        const shouldRender = (i === subSteps - 1);
        await runSingleSimulationTick(shouldRender);
    }

    if (isRunning) {
        const delayMs = subSteps >= 10 ? 18 : 28;
        loopTimer = setTimeout(workerLoop, delayMs);
    }
}

/**
 * Ekspor Bobot TensorFlow.js ke JSON String untuk Disimpan ke MySQL (saved_models)
 */
function exportModelWeightsJson() {
    const payload = {
        preset_mode: 'custom_tfjs',
        guidance_strength: config.guidanceStrength,
        epsilon: config.epsilon,
        episode: episodeNumber,
        tensors: []
    };

    if (tfReady && qNetwork) {
        tf.tidy(() => {
            const weights = qNetwork.getWeights();
            payload.tensors = weights.map(w => ({
                shape: w.shape,
                data: Array.from(w.dataSync()).map(v => Number(v.toFixed(5)))
            }));
        });
    }
    return JSON.stringify(payload);
}

/**
 * Muat Bobot Model atau Preset Level Kemampuan dari MySQL (saved_models)
 */
function loadModelWeightsFromJson(weightsJsonStr, trainedEpisodes = 1) {
    try {
        const parsed = typeof weightsJsonStr === 'string' ? JSON.parse(weightsJsonStr) : weightsJsonStr;

        if (parsed.preset_mode === 'untrained') {
            config.guidanceStrength = 0.0;
            config.epsilon = 1.00;
            episodeNumber = 1;
            buildNeuralNetworks();
        } else if (parsed.preset_mode === 'intermediate') {
            config.guidanceStrength = 0.62;
            config.epsilon = 0.32;
            episodeNumber = Math.max(10, trainedEpisodes || 10);
        } else if (parsed.preset_mode === 'master') {
            config.guidanceStrength = 0.95;
            config.epsilon = 0.04;
            episodeNumber = Math.max(25, trainedEpisodes || 25);
        } else {
            if (typeof parsed.guidance_strength === 'number') {
                config.guidanceStrength = parsed.guidance_strength;
            }
            if (typeof parsed.epsilon === 'number') {
                config.epsilon = parsed.epsilon;
            }
            if (Array.isArray(parsed.tensors) && parsed.tensors.length > 0 && tfReady && qNetwork) {
                tf.tidy(() => {
                    const weightTensors = parsed.tensors.map(t => tf.tensor(t.data, t.shape));
                    qNetwork.setWeights(weightTensors);
                    targetNetwork.setWeights(weightTensors.map(w => w.clone()));
                });
            }
            if (trainedEpisodes > 0) {
                episodeNumber = trainedEpisodes + 1;
            }
        }

        resetWalkerEnv();
        sendStateUpdate(getNormalizedState(walker), walker.lastAction, false);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Handler Pesan dari Main Thread
 */
self.onmessage = async function (e) {
    const msg = e.data || {};
    const cmd = msg.cmd;

    switch (cmd) {
        case 'INIT': {
            if (msg.config) {
                Object.assign(config, msg.config);
            }
            if (msg.startEpisode) {
                episodeNumber = Math.max(1, parseInt(msg.startEpisode, 10));
                // Sesuaikan kemampuan awal jika melanjutkan sesi yang sudah berjalan
                if (episodeNumber > 1) {
                    config.epsilon = Math.max(config.epsilonMin, Math.pow(config.epsilonDecay, episodeNumber - 1));
                    config.guidanceStrength = Math.min(0.92, (episodeNumber - 1) * 0.055);
                }
            }
            await initTensorFlow(msg.tfScriptUrl || '../vendor/tfjs/tf.min.js');
            resetWalkerEnv();
            self.postMessage({
                type: 'WORKER_READY',
                tfBackend: tfReady ? tf.getBackend() : 'fallback-js',
                episode: episodeNumber,
                epsilon: config.epsilon
            });
            sendStateUpdate(getNormalizedState(walker), 4, false);
            break;
        }

        case 'START': {
            if (!isRunning) {
                isRunning = true;
                workerLoop();
            }
            break;
        }

        case 'PAUSE': {
            isRunning = false;
            if (loopTimer) {
                clearTimeout(loopTimer);
                loopTimer = null;
            }
            break;
        }

        case 'STEP_ONCE': {
            isRunning = false;
            if (loopTimer) {
                clearTimeout(loopTimer);
                loopTimer = null;
            }
            await runSingleSimulationTick(true);
            break;
        }

        case 'RESET_EPISODE': {
            resetWalkerEnv();
            sendStateUpdate(getNormalizedState(walker), 4, false);
            break;
        }

        case 'RESET_BRAIN': {
            isRunning = false;
            if (loopTimer) {
                clearTimeout(loopTimer);
                loopTimer = null;
            }
            replayBuffer = [];
            episodeNumber = 1;
            totalStepsAllTime = 0;
            lastLoss = 0.0;
            config.epsilon = 1.00;
            config.guidanceStrength = 0.0;
            buildNeuralNetworks();
            resetWalkerEnv();
            sendStateUpdate(getNormalizedState(walker), 4, false);
            self.postMessage({
                type: 'BRAIN_RESET_DONE',
                message: 'Otak Neural Network TensorFlow.js direset kembali ke kondisi bayi baru belajar berdiri (Episode 1, Epsilon 1.00).'
            });
            break;
        }

        case 'SET_SPEED': {
            config.speedMultiplier = Math.max(1, Math.min(25, parseInt(msg.speed, 10) || 1));
            break;
        }

        case 'UPDATE_CONFIG': {
            if (msg.config) {
                const prevLr = config.learningRate;
                Object.assign(config, msg.config);
                if (tfReady && Math.abs(prevLr - config.learningRate) > 1e-6) {
                    optimizer = tf.train.adam(config.learningRate);
                }
            }
            break;
        }

        case 'APPLY_PUSH': {
            if (walker) {
                const force = parseFloat(msg.force) || 6.5;
                walker.externalPush = force;
                walker.pushTimer = 8;
                walker.pushLabel = force > 0 ? '💨 Didorong dari Belakang!' : '💨 Didorong dari Depan!';
            }
            break;
        }

        case 'LOAD_MODEL': {
            const ok = loadModelWeightsFromJson(msg.weights_json, msg.trained_episodes || 1);
            self.postMessage({
                type: 'MODEL_LOADED',
                success: ok,
                model_name: msg.model_name || 'Model Tersimpan',
                epsilon: config.epsilon,
                episode: episodeNumber
            });
            break;
        }

        case 'EXPORT_MODEL': {
            const weightsJson = exportModelWeightsJson();
            self.postMessage({
                type: 'MODEL_EXPORTED',
                weights_json: weightsJson,
                architecture_json: JSON.stringify({
                    inputShape: [8],
                    layers: [64, 64],
                    outputActions: 7,
                    tfBackend: tfReady ? tf.getBackend() : 'cpu'
                }),
                episode: episodeNumber
            });
            break;
        }
    }
};
