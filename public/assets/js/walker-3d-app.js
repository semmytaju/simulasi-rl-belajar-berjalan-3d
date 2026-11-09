/**
 * ============================================================================
 * FRONTEND APPLICATION: walker-3d-app.js (ES6+)
 * Simulasi Reinforcement Learning: Orang Baru Belajar Berjalan (Bipedal Walker)
 * ----------------------------------------------------------------------------
 * Mengintegrasikan:
 * - Three.js High-Detail 3D Articulated Humanoid & 20m Olympic Training Track
 * - Web Worker (TensorFlow.js Neural Network & Physics Engine)
 * - Chart.js Live Learning Curve (Jarak Tempuh & Total Reward)
 * - Sinkronisasi Real-Time dengan PHP 8+ & MySQL (db_balance_ai)
 * ============================================================================
 */

class BipedalWalkerLabApp {
    constructor(bootData) {
        this.appPath = bootData.appPath || '';
        this.csrfToken = bootData.csrfToken || '';
        this.activeSession = bootData.activeSession || { id: 1, best_distance_m: 0 };
        this.presets = bootData.presets || [];
        this.episodes = bootData.episodes || [];
        this.savedModels = bootData.savedModels || [];

        this.worker = null;
        this.isTraining = false;
        this.cameraMode = 'follow'; // 'follow' | 'side' | 'front' | 'overview'
        this.orbitYawOffset = 0.0;
        this.orbitPitchOffset = 0.0;
        this.panOffsetX = 0.0;
        this.panOffsetY = 0.0;
        this.zoomPercent = 100;     // 25% (Wide Out) s/d 300% (Close-Up)
        this.cameraZoom = 1.0;      // Faktor jarak kamera (100 / zoomPercent)

        // State interpolasi untuk animasi 60 FPS di Three.js
        this.currentPose = {
            x: 0, y: 0.95, vx: 0,
            torsoAngle: 0, torsoAngleDeg: 0, torsoVel: 0,
            hipL: 0.18, hipR: -0.18,
            kneeL: 0.14, kneeR: 0.14,
            armL: -0.18, armR: 0.18,
            footContactL: true, footContactR: true,
            fallen: false, reachedFinish: false, pushLabel: ''
        };
        this.targetPose = { ...this.currentPose };
        this.prevFootContactL = true;
        this.prevFootContactR = true;
        this.footstepRipples = [];
        this.clockTime = 0;

        this.bestDistanceRecord = parseFloat(this.activeSession.best_distance_m || 0);
        this.learningChart = null;

        this.ensureThreeAndInit();
        this.initLearningChart();
        this.initWebWorker();
        this.bindUIEvents();
        this.renderEpisodesTable();
        this.renderModelsList();
        this.updateSessionSummaryCards();
    }

    /**
     * Pastikan pustaka Three.js termuat sempurna sebelum membangun 3D Scene
     */
    ensureThreeAndInit() {
        if (typeof THREE !== 'undefined' && THREE.WebGLRenderer) {
            this.initThreeScene();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/three@0.150.1/build/three.min.js';
        script.onload = () => this.initThreeScene();
        document.head.appendChild(script);
    }

    /**
     * 1. INISIALISASI SCENE 3D THREE.JS (LINTASAN ATLETIK 20M & MANUSIA 3D DETAIL)
     */
    initThreeScene() {
        this.container = document.getElementById('threeCanvasContainer');
        if (!this.container || typeof THREE === 'undefined') return;

        const width = this.container.clientWidth || 820;
        const height = this.container.clientHeight || 410;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b1325);
        this.scene.fog = new THREE.FogExp2(0x0b1325, 0.018);

        this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 140);
        this.camera.position.set(0.4, 1.85, 4.1);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.container.innerHTML = '';
        this.container.appendChild(this.renderer.domElement);

        // Pencahayaan 3-Titik (Studio Biomechanics Lighting)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
        this.scene.add(ambientLight);

        const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x1e293b, 0.75);
        hemiLight.position.set(0, 18, 0);
        this.scene.add(hemiLight);

        this.dirLight = new THREE.DirectionalLight(0xfffbeb, 1.35);
        this.dirLight.position.set(5, 11, 7);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 1024;
        this.dirLight.shadow.mapSize.height = 1024;
        this.dirLight.shadow.camera.near = 0.5;
        this.dirLight.shadow.camera.far = 35;
        this.dirLight.shadow.camera.left = -8;
        this.dirLight.shadow.camera.right = 8;
        this.dirLight.shadow.camera.top = 8;
        this.dirLight.shadow.camera.bottom = -4;
        this.scene.add(this.dirLight);

        const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.55);
        rimLight.position.set(-4, 6, -6);
        this.scene.add(rimLight);

        // Bangun Lintasan Latihan 20 Meter, Manusia 3D Detail, dan Bendera Rekor
        this.buildTrainingTrack();
        this.buildHumanoidCharacter();
        this.buildBestRecordFlag();

        // Interaksi Mouse Drag (Orbit 360° & Pan), Scroll Wheel (Zoom), dan Touch Pinch-to-Zoom
        let isDragging = false;
        let isPanning = false;
        let prevX = 0, prevY = 0;
        let prevPinchDist = null;
        const domElem = this.renderer.domElement;

        domElem.addEventListener('contextmenu', (e) => e.preventDefault());
        domElem.addEventListener('mousedown', (e) => {
            isDragging = true;
            isPanning = (e.button === 2 || e.shiftKey);
            prevX = e.clientX;
            prevY = e.clientY;
        });
        window.addEventListener('mouseup', () => {
            isDragging = false;
            isPanning = false;
        });
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - prevX;
            const dy = e.clientY - prevY;
            prevX = e.clientX;
            prevY = e.clientY;
            if (isPanning) {
                this.panOffsetX = Math.max(-8.0, Math.min(18.0, this.panOffsetX - dx * 0.012));
                this.panOffsetY = Math.max(-0.8, Math.min(2.5, this.panOffsetY + dy * 0.010));
            } else {
                this.orbitYawOffset = Math.max(-3.14, Math.min(3.14, this.orbitYawOffset - dx * 0.007));
                this.orbitPitchOffset = Math.max(-0.35, Math.min(1.15, this.orbitPitchOffset + dy * 0.006));
            }
        });

        // Mouse Scroll Wheel Zoom (Scroll Atas = Zoom In / Perbesar, Scroll Bawah = Zoom Out / Perkecil)
        domElem.addEventListener('wheel', (e) => {
            e.preventDefault();
            const step = e.deltaY < 0 ? 12 : -12;
            this.setZoomPercent(this.zoomPercent + step);
        }, { passive: false });

        // Touch Pinch-to-Zoom (2 Jari di Layar Sentuh / Trackpad)
        domElem.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                prevPinchDist = Math.hypot(dx, dy);
            } else if (e.touches.length === 1) {
                isDragging = true;
                prevX = e.touches[0].clientX;
                prevY = e.touches[0].clientY;
            }
        }, { passive: true });

        domElem.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && prevPinchDist !== null) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.hypot(dx, dy);
                const delta = (dist - prevPinchDist) * 0.45;
                prevPinchDist = dist;
                this.setZoomPercent(this.zoomPercent + delta);
            } else if (e.touches.length === 1 && isDragging) {
                const dx = e.touches[0].clientX - prevX;
                const dy = e.touches[0].clientY - prevY;
                prevX = e.touches[0].clientX;
                prevY = e.touches[0].clientY;
                this.orbitYawOffset = Math.max(-3.14, Math.min(3.14, this.orbitYawOffset - dx * 0.007));
                this.orbitPitchOffset = Math.max(-0.35, Math.min(1.15, this.orbitPitchOffset + dy * 0.006));
            }
        }, { passive: true });

        domElem.addEventListener('touchend', () => {
            prevPinchDist = null;
            isDragging = false;
        });

        window.addEventListener('resize', () => this.onWindowResize());

        // Mulai Render Loop 60 FPS
        this.animateThree();
    }

    /**
     * Bangun Lintasan Atletik 0m s/d 20m dengan Detail Stadion & Gerbang Finish
     */
    buildTrainingTrack() {
        const trackGroup = new THREE.Group();

        // Lantai Dasar Arena + Grid
        const floorGeo = new THREE.PlaneGeometry(70, 30);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x090f1d, roughness: 0.92 });
        const floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.set(10, -0.03, 0);
        floorMesh.receiveShadow = true;
        trackGroup.add(floorMesh);

        const gridHelper = new THREE.GridHelper(60, 60, 0x1e293b, 0x131c31);
        gridHelper.position.set(10, -0.025, 0);
        trackGroup.add(gridHelper);

        // Permukaan Lintasan Lari (Lebar 2.4m, Panjang dari -2m s/d 23m)
        for (let m = -2; m < 23; m++) {
            const isEven = (m % 2 === 0);
            const segGeo = new THREE.BoxGeometry(1.0, 0.04, 2.4);
            const segMat = new THREE.MeshStandardMaterial({
                color: isEven ? 0x1e293b : 0x283548,
                roughness: 0.7
            });
            const seg = new THREE.Mesh(segGeo, segMat);
            seg.position.set(m + 0.5, -0.02, 0);
            seg.receiveShadow = true;
            trackGroup.add(seg);

            // Garis tengah putus-putus panduan keseimbangan
            const centerDash = new THREE.Mesh(
                new THREE.BoxGeometry(0.45, 0.043, 0.05),
                new THREE.MeshBasicMaterial({ color: 0x334155 })
            );
            centerDash.position.set(m + 0.5, -0.018, 0);
            trackGroup.add(centerDash);

            // Garis putih penanda setiap 1 meter & papan jarak setiap 2 meter
            if (m >= 0 && m <= 20) {
                const isMajor = (m % 2 === 0);
                const lineGeo = new THREE.BoxGeometry(isMajor ? 0.06 : 0.03, 0.046, isMajor ? 2.42 : 0.6);
                const lineMat = new THREE.MeshBasicMaterial({
                    color: m === 0 ? 0x38bdf8 : (m === 20 ? 0x22c55e : (isMajor ? 0x94a3b8 : 0x475569))
                });
                const line = new THREE.Mesh(lineGeo, lineMat);
                line.position.set(m, -0.016, 0);
                trackGroup.add(line);

                if (isMajor) {
                    const markerSprite = this.createTextSprite(
                        m === 0 ? 'START 0m' : (m === 20 ? 'FINISH 20m' : `${m}m`),
                        m === 20 ? '#22c55e' : (m === 0 ? '#38bdf8' : '#e2e8f0')
                    );
                    markerSprite.position.set(m, 0.38, -1.32);
                    trackGroup.add(markerSprite);
                }
            }
        }

        // Rel LED Pembatas Lintasan (Kiri & Kanan)
        const railGeo = new THREE.BoxGeometry(25, 0.08, 0.10);
        const railMat = new THREE.MeshStandardMaterial({
            color: 0x0284c7,
            emissive: 0x0ea5e9,
            emissiveIntensity: 0.35,
            roughness: 0.3
        });
        const railBack = new THREE.Mesh(railGeo, railMat);
        railBack.position.set(10.5, 0.02, -1.22);
        const railFront = new THREE.Mesh(railGeo, railMat);
        railFront.position.set(10.5, 0.02, 1.22);
        trackGroup.add(railBack, railFront);

        // Pilar Dekorasi Laboratorium di Latar Belakang Setiap 4 Meter
        const bgPillarGeo = new THREE.BoxGeometry(0.18, 2.8, 0.18);
        const bgPillarMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
        for (let x = 0; x <= 20; x += 4) {
            const p = new THREE.Mesh(bgPillarGeo, bgPillarMat);
            p.position.set(x, 1.4, -2.5);
            trackGroup.add(p);
        }

        // Gerbang Finish Megah di 20.0 Meter
        const pillarGeo = new THREE.CylinderGeometry(0.09, 0.09, 2.6, 16);
        const pillarMat = new THREE.MeshStandardMaterial({
            color: 0x10b981,
            emissive: 0x059669,
            emissiveIntensity: 0.4
        });
        const pLeft = new THREE.Mesh(pillarGeo, pillarMat);
        pLeft.position.set(20, 1.3, -1.18);
        const pRight = new THREE.Mesh(pillarGeo, pillarMat);
        pRight.position.set(20, 1.3, 1.18);

        const bannerGeo = new THREE.BoxGeometry(0.18, 0.36, 2.55);
        const bannerMat = new THREE.MeshStandardMaterial({
            color: 0x059669,
            emissive: 0x10b981,
            emissiveIntensity: 0.5
        });
        const banner = new THREE.Mesh(bannerGeo, bannerMat);
        banner.position.set(20, 2.55, 0);
        trackGroup.add(pLeft, pRight, banner);

        this.scene.add(trackGroup);
    }

    /**
     * Buat Sprite Teks 3D (Kompatibel Penuh Semua Browser)
     */
    createTextSprite(text, colorHex = '#ffffff') {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.fillRect(6, 6, 244, 52);
        ctx.strokeStyle = colorHex;
        ctx.lineWidth = 3;
        ctx.strokeRect(6, 6, 244, 52);

        ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = colorHex;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 33);

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(1.15, 0.30, 1);
        return sprite;
    }

    /**
     * Bangun Bendera Penanda Rekor Jarak Terjauh di Lintasan 3D
     */
    buildBestRecordFlag() {
        this.recordFlagGroup = new THREE.Group();
        const poleGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.5, 12);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.4, roughness: 0.3 });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 0.75;

        const flagGeo = new THREE.BoxGeometry(0.48, 0.26, 0.03);
        const flagMat = new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            emissive: 0xd97706,
            emissiveIntensity: 0.45
        });
        const flag = new THREE.Mesh(flagGeo, flagMat);
        flag.position.set(0.24, 1.32, 0);

        const flagLabel = this.createTextSprite('REKOR TERJAUH', '#facc15');
        flagLabel.position.set(0.22, 1.65, 0);
        flagLabel.scale.set(0.95, 0.24, 1);

        this.recordFlagGroup.add(pole, flag, flagLabel);
        this.recordFlagGroup.position.set(Math.max(0.5, this.bestDistanceRecord), 0, -1.02);
        this.scene.add(this.recordFlagGroup);
    }

    /**
     * ========================================================================
     * BANGUN KARAKTER MANUSIA 3D BERARTIKULASI PENUH & ANATOMIS:
     * - Kepala (Wajah, Rambut/Helm Sport, Telinga, Mata/Visor Cyber, Leher)
     * - Torso Atletis (Dada, Bahu Deltoid, Perut/Pinggang, Spine Back, AI Core)
     * - Lengan Kiri & Kanan (Bahu -> Lengan Atas -> Sendi Siku -> Lengan Bawah -> Tangan)
     * - Kaki Kiri (Cyan) & Kaki Kanan (Emerald) (Pinggul -> Paha -> Lutut -> Betis -> Pergelangan -> Sepatu Lari Bersensor)
     * - Proyeksi Laser Center-of-Mass (CoM) di Lantai & Halo Keseimbangan
     * ========================================================================
     */
    buildHumanoidCharacter() {
        this.humanoidRoot = new THREE.Group();
        this.humanoidRoot.position.set(0, 0.95, 0);

        // Palet Material Anatomi Manusia & Pakaian Sport
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xf6b992, roughness: 0.42, metalness: 0.05 });
        const hairMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55 });
        const jerseyMainMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.38, metalness: 0.1 });
        const jerseyAccentMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.25 });
        const shortsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.48 });

        // Warna Pembeda Kaki Kiri (Cyan) & Kaki Kanan (Emerald) agar mudah diamati mahasiswa
        const leftLegTrimMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x0284c7, emissiveIntensity: 0.25 });
        const rightLegTrimMat = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.25 });
        const jointBallMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.5, roughness: 0.25 });

        this.chestCoreMat = new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            emissive: 0x0ea5e9,
            emissiveIntensity: 0.85
        });

        // Material Sensor Telapak Sepatu (Menyala Hijau Terang Saat Menapak Tanah)
        this.footMatLeft = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x16a34a, emissiveIntensity: 0.65 });
        this.footMatRight = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x16a34a, emissiveIntensity: 0.65 });

        // --------------------------------------------------------------------
        // 1. GRUP PINGGUL & BADAN ATAS (Berotasi sesuai sudut torsoAngle)
        // --------------------------------------------------------------------
        this.upperBodyGroup = new THREE.Group();
        this.humanoidRoot.add(this.upperBodyGroup);

        // Pinggul / Celana Pendek Sport (Pelvis)
        const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.15, 0.34), shortsMat);
        pelvisMesh.castShadow = true;
        this.upperBodyGroup.add(pelvisMesh);

        // Sabuk Pinggang Sensor (Waist Belt)
        const beltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.35), jerseyAccentMat);
        beltMesh.position.set(0, 0.08, 0);
        this.upperBodyGroup.add(beltMesh);

        // Perut / Abdomen (Meruncing dari dada ke pinggang)
        const abdomenMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.125, 0.20, 16), jerseyMainMat);
        abdomenMesh.scale.set(0.82, 1.0, 1.15);
        abdomenMesh.position.set(0, 0.19, 0);
        abdomenMesh.castShadow = true;
        this.upperBodyGroup.add(abdomenMesh);

        // Dada Atletis (Upper Chest / Ribcage)
        const chestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.38), jerseyMainMat);
        chestMesh.position.set(0, 0.40, 0);
        chestMesh.castShadow = true;
        this.upperBodyGroup.add(chestMesh);

        // Strip Garis Sport di Samping Baju & Inti AI Bercahaya di Dada
        const sideStripeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.39), jerseyAccentMat);
        sideStripeL.position.set(0, 0.40, 0);
        this.upperBodyGroup.add(sideStripeL);

        const coreRing = new THREE.Mesh(new THREE.SphereGeometry(0.068, 16, 16), this.chestCoreMat);
        coreRing.position.set(0.11, 0.41, 0);
        this.upperBodyGroup.add(coreRing);

        // Modul Sensor Biomekanik di Punggung (Spine Pack)
        const backPack = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.22, 0.20),
            new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 })
        );
        backPack.position.set(-0.15, 0.40, 0);
        this.upperBodyGroup.add(backPack);

        // --------------------------------------------------------------------
        // 2. LEHER & KEPALA MANUSIA 3D (Wajah, Rambut, Telinga, Visor Mata)
        // --------------------------------------------------------------------
        const collarMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.10, 0.05, 16), jerseyAccentMat);
        collarMesh.position.set(0, 0.55, 0);
        this.upperBodyGroup.add(collarMesh);

        const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.068, 0.10, 16), skinMat);
        neckMesh.position.set(0, 0.60, 0);
        this.upperBodyGroup.add(neckMesh);

        this.headGroup = new THREE.Group();
        this.headGroup.position.set(0, 0.75, 0);

        // Bentuk Kepala & Rahang Manusia
        const craniumMesh = new THREE.Mesh(new THREE.SphereGeometry(0.145, 24, 24), skinMat);
        craniumMesh.scale.set(1.04, 1.12, 0.96);
        craniumMesh.castShadow = true;
        this.headGroup.add(craniumMesh);

        // Hidung Menghadap Arah Jalan (+X)
        const noseMesh = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 8), skinMat);
        noseMesh.rotation.z = -Math.PI / 2;
        noseMesh.position.set(0.155, -0.01, 0);
        this.headGroup.add(noseMesh);

        // Telinga Kiri & Kanan
        const earGeo = new THREE.SphereGeometry(0.032, 10, 10);
        const earL = new THREE.Mesh(earGeo, skinMat);
        earL.position.set(0, 0, -0.14);
        const earR = new THREE.Mesh(earGeo, skinMat);
        earR.position.set(0, 0, 0.14);
        this.headGroup.add(earL, earR);

        // Rambut / Gaya Sporty di Atas & Belakang Kepala
        const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.152, 20, 20), hairMat);
        hairCap.scale.set(1.05, 0.85, 0.98);
        hairCap.position.set(-0.015, 0.05, 0);
        this.headGroup.add(hairCap);

        // Headband / Visor Mata Pintar Menghadap Depan (+X)
        const visorMat = new THREE.MeshStandardMaterial({
            color: 0x0ea5e9,
            emissive: 0x38bdf8,
            emissiveIntensity: 0.75,
            roughness: 0.15
        });
        const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.052, 0.23), visorMat);
        visorMesh.position.set(0.115, 0.025, 0);
        this.headGroup.add(visorMesh);

        this.upperBodyGroup.add(this.headGroup);

        // --------------------------------------------------------------------
        // 3. HALO CINCIN INDIKATOR KESEIMBANGAN DI ATAS KEPALA
        // --------------------------------------------------------------------
        const haloGeo = new THREE.TorusGeometry(0.18, 0.018, 12, 32);
        this.balanceIndicatorMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        this.balanceHalo = new THREE.Mesh(haloGeo, this.balanceIndicatorMat);
        this.balanceHalo.rotation.x = Math.PI / 2;
        this.balanceHalo.position.set(0, 1.00, 0);
        this.upperBodyGroup.add(this.balanceHalo);

        // --------------------------------------------------------------------
        // 4. LENGAN KIRI & KANAN DENGAN SENDI SIKU (ELBOW PIVOT)
        // --------------------------------------------------------------------
        const leftArm = this.createDetailedArm(jerseyMainMat, skinMat, leftLegTrimMat);
        this.leftArmGroup = leftArm.shoulderGroup;
        this.leftElbowGroup = leftArm.elbowGroup;
        this.leftArmGroup.position.set(0, 0.50, -0.23);
        this.upperBodyGroup.add(this.leftArmGroup);

        const rightArm = this.createDetailedArm(jerseyMainMat, skinMat, rightLegTrimMat);
        this.rightArmGroup = rightArm.shoulderGroup;
        this.rightElbowGroup = rightArm.elbowGroup;
        this.rightArmGroup.position.set(0, 0.50, 0.23);
        this.upperBodyGroup.add(this.rightArmGroup);

        // --------------------------------------------------------------------
        // 5. KAKI KIRI (CYAN) & KAKI KANAN (EMERALD) BERARTIKULASI PENUH
        // --------------------------------------------------------------------
        const leftLeg = this.createDetailedLeg(shortsMat, skinMat, leftLegTrimMat, jointBallMat, this.footMatLeft);
        this.leftHipGroup = leftLeg.hipGroup;
        this.leftKneeGroup = leftLeg.kneeGroup;
        this.leftAnkleGroup = leftLeg.ankleGroup;
        this.leftHipGroup.position.set(0, -0.04, -0.115);
        this.humanoidRoot.add(this.leftHipGroup);

        const rightLeg = this.createDetailedLeg(shortsMat, skinMat, rightLegTrimMat, jointBallMat, this.footMatRight);
        this.rightHipGroup = rightLeg.hipGroup;
        this.rightKneeGroup = rightLeg.kneeGroup;
        this.rightAnkleGroup = rightLeg.ankleGroup;
        this.rightHipGroup.position.set(0, -0.04, 0.115);
        this.humanoidRoot.add(this.rightHipGroup);

        // --------------------------------------------------------------------
        // 6. LINGKARAN PROYEKSI CENTER-OF-MASS (CoM) DI LANTAI
        // --------------------------------------------------------------------
        const shadowRingGeo = new THREE.RingGeometry(0.18, 0.26, 32);
        this.comRingMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.65
        });
        this.comFloorRing = new THREE.Mesh(shadowRingGeo, this.comRingMat);
        this.comFloorRing.rotation.x = -Math.PI / 2;
        this.comFloorRing.position.set(0, 0.005, 0);
        this.scene.add(this.comFloorRing);

        this.scene.add(this.humanoidRoot);
    }

    /**
     * Buat Lengan Berartikulasi Lengkap (Bahu Deltoid -> Lengan Atas -> Siku -> Lengan Bawah -> Tangan)
     */
    createDetailedArm(jerseyMat, skinMat, trimMat) {
        const shoulderGroup = new THREE.Group();

        // Bahu Deltoid
        const deltoid = new THREE.Mesh(new THREE.SphereGeometry(0.068, 14, 14), jerseyMat);
        deltoid.castShadow = true;
        shoulderGroup.add(deltoid);

        // Lengan Baju & Lengan Atas (Upper Arm)
        const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.050, 0.12, 14), jerseyMat);
        sleeve.position.set(0, -0.06, 0);
        shoulderGroup.add(sleeve);

        const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.040, 0.22, 14), skinMat);
        upperArm.position.set(0, -0.14, 0);
        upperArm.castShadow = true;
        shoulderGroup.add(upperArm);

        // Sendi Siku (Elbow Group)
        const elbowGroup = new THREE.Group();
        elbowGroup.position.set(0, -0.25, 0);
        shoulderGroup.add(elbowGroup);

        const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 12), skinMat);
        elbowGroup.add(elbowJoint);

        // Lengan Bawah (Forearm)
        const foreArm = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.033, 0.23, 14), skinMat);
        foreArm.position.set(0, -0.115, 0);
        foreArm.castShadow = true;
        elbowGroup.add(foreArm);

        // Wristband Sport & Kepalan Tangan
        const wristBand = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.04, 12), trimMat);
        wristBand.position.set(0, -0.21, 0);
        elbowGroup.add(wristBand);

        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 12), skinMat);
        hand.scale.set(1.1, 1.2, 0.85);
        hand.position.set(0, -0.25, 0);
        elbowGroup.add(hand);

        // Tekukan alami siku ke depan (+X)
        elbowGroup.rotation.z = 0.42;

        return { shoulderGroup, elbowGroup };
    }

    /**
     * Buat Kaki Berartikulasi Lengkap (Pinggul -> Paha -> Lutut -> Betis -> Engkel -> Sepatu Lari Bersensor)
     */
    createDetailedLeg(shortsMat, skinMat, trimMat, jointMat, sensorSoleMat) {
        const hipGroup = new THREE.Group();

        // Sendi Pinggul
        const hipJoint = new THREE.Mesh(new THREE.SphereGeometry(0.068, 14, 14), jointMat);
        hipGroup.add(hipJoint);

        // Paha Atas (Celana Sport + Otot Quadriceps, panjang 0.44m)
        const thighShorts = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.072, 0.22, 16), shortsMat);
        thighShorts.position.set(0, -0.11, 0);
        thighShorts.castShadow = true;
        hipGroup.add(thighShorts);

        const thighTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.072, 0.035, 16), trimMat);
        thighTrim.position.set(0, -0.21, 0);
        hipGroup.add(thighTrim);

        const lowerThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.056, 0.24, 16), skinMat);
        lowerThigh.position.set(0, -0.32, 0);
        lowerThigh.castShadow = true;
        hipGroup.add(lowerThigh);

        // Grup Sendi Lutut (Knee Pivot pada y = -0.44m)
        const kneeGroup = new THREE.Group();
        kneeGroup.position.set(0, -0.44, 0);
        hipGroup.add(kneeGroup);

        // Tempurung Lutut & Pelindung Lutut (Knee Pad)
        const kneeSphere = new THREE.Mesh(new THREE.SphereGeometry(0.058, 14, 14), jointMat);
        kneeGroup.add(kneeSphere);

        const kneePad = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.09), trimMat);
        kneePad.position.set(0.045, 0, 0);
        kneeGroup.add(kneePad);

        // Betis (Calf / Shin - panjang 0.42m)
        const upperCalf = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.046, 0.24, 16), skinMat);
        upperCalf.position.set(0, -0.12, 0);
        upperCalf.castShadow = true;
        kneeGroup.add(upperCalf);

        // Kaos Kaki Atletik (Athletic Sock)
        const sockMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.042, 0.20, 16), trimMat);
        sockMesh.position.set(0, -0.32, 0);
        sockMesh.castShadow = true;
        kneeGroup.add(sockMesh);

        // Grup Pergelangan Kaki & Sepatu Lari (Ankle + Sneaker pada y = -0.42m)
        const ankleGroup = new THREE.Group();
        ankleGroup.position.set(0, -0.42, 0);
        kneeGroup.add(ankleGroup);

        const ankleJoint = new THREE.Mesh(new THREE.SphereGeometry(0.044, 12, 12), jointMat);
        ankleGroup.add(ankleJoint);

        // Badan Sepatu Sneaker
        const shoeUpperMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 });
        const shoeUpper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.065, 0.115), shoeUpperMat);
        shoeUpper.position.set(0.05, -0.02, 0);
        shoeUpper.castShadow = true;
        ankleGroup.add(shoeUpper);

        // Ujung Depan Sepatu (Toe Cap)
        const toeCap = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.06, 14), trimMat);
        toeCap.rotation.x = Math.PI / 2;
        toeCap.position.set(0.15, -0.022, 0);
        ankleGroup.add(toeCap);

        // Sol Sensor Kontak Tanah (Menyala Hijau Saat Menapak!)
        const sensorSole = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.028, 0.125), sensorSoleMat);
        sensorSole.position.set(0.055, -0.058, 0);
        ankleGroup.add(sensorSole);

        return { hipGroup, kneeGroup, ankleGroup };
    }

    /**
     * Efek Cincin Riak Pijakan Kaki di Lintasan 3D Saat Kaki Menapak
     */
    spawnFootstepRipple(xPos, zOffset, colorHex) {
        if (!this.scene) return;
        const geo = new THREE.RingGeometry(0.05, 0.11, 24);
        const mat = new THREE.MeshBasicMaterial({
            color: colorHex,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(xPos, 0.01, zOffset);
        this.scene.add(mesh);
        this.footstepRipples.push({ mesh, scale: 1.0, opacity: 0.85 });
    }

    /**
     * Loop Render Animasi 3D Three.js (60 FPS Halus)
     */
    animateThree() {
        requestAnimationFrame(() => this.animateThree());
        if (!this.renderer || !this.scene || !this.camera) return;

        this.clockTime += 0.05;

        // Interpolasi halus antara frame Web Worker dan 60 FPS Three.js
        const lerp = 0.30;
        this.currentPose.x += (this.targetPose.x - this.currentPose.x) * lerp;
        this.currentPose.y += (this.targetPose.y - this.currentPose.y) * lerp;
        this.currentPose.torsoAngle += (this.targetPose.torsoAngle - this.currentPose.torsoAngle) * lerp;
        this.currentPose.hipL += (this.targetPose.hipL - this.currentPose.hipL) * lerp;
        this.currentPose.hipR += (this.targetPose.hipR - this.currentPose.hipR) * lerp;
        this.currentPose.kneeL += (this.targetPose.kneeL - this.currentPose.kneeL) * lerp;
        this.currentPose.kneeR += (this.targetPose.kneeR - this.currentPose.kneeR) * lerp;
        this.currentPose.armL += (this.targetPose.armL - this.currentPose.armL) * lerp;
        this.currentPose.armR += (this.targetPose.armR - this.currentPose.armR) * lerp;

        if (this.humanoidRoot) {
            this.humanoidRoot.position.set(this.currentPose.x, this.currentPose.y, 0);

            // Rotasi tubuh di bidang sagital (sumbu Z negatif = condong ke depan +X)
            this.upperBodyGroup.rotation.z = -this.currentPose.torsoAngle;

            // Kepala sedikit mengimbangi agar pandangan tetap fokus ke garis finish
            if (this.headGroup) {
                this.headGroup.rotation.z = this.currentPose.torsoAngle * 0.35;
            }

            // Artikulasi Paha, Lutut, dan Engkel Kaki Kiri & Kanan
            this.leftHipGroup.rotation.z = this.currentPose.hipL;
            this.rightHipGroup.rotation.z = this.currentPose.hipR;
            this.leftKneeGroup.rotation.z = -this.currentPose.kneeL;
            this.rightKneeGroup.rotation.z = -this.currentPose.kneeR;

            if (this.leftAnkleGroup && this.rightAnkleGroup) {
                // Pergelangan kaki menyesuaikan agar telapak sepatu rata dengan tanah
                this.leftAnkleGroup.rotation.z = -(this.currentPose.hipL - this.currentPose.kneeL) * 0.65;
                this.rightAnkleGroup.rotation.z = -(this.currentPose.hipR - this.currentPose.kneeR) * 0.65;
            }

            // Artikulasi Bahu & Siku Lengan Penyeimbang
            this.leftArmGroup.rotation.z = this.currentPose.armL;
            this.rightArmGroup.rotation.z = this.currentPose.armR;
            if (this.leftElbowGroup && this.rightElbowGroup) {
                this.leftElbowGroup.rotation.z = Math.max(0.20, 0.48 + this.currentPose.armL * 0.55);
                this.rightElbowGroup.rotation.z = Math.max(0.20, 0.48 + this.currentPose.armR * 0.55);
            }

            // Update Proyeksi Lingkaran Center-of-Mass di Lantai
            if (this.comFloorRing) {
                this.comFloorRing.position.x = this.currentPose.x + Math.sin(this.currentPose.torsoAngle) * 0.35;
            }

            // Deteksi pijakan baru untuk memunculkan efek riak langkah di lintasan
            if (this.targetPose.footContactL && !this.prevFootContactL && !this.targetPose.fallen) {
                this.spawnFootstepRipple(this.currentPose.x + Math.sin(this.currentPose.hipL) * 0.35, -0.12, 0x38bdf8);
            }
            if (this.targetPose.footContactR && !this.prevFootContactR && !this.targetPose.fallen) {
                this.spawnFootstepRipple(this.currentPose.x + Math.sin(this.currentPose.hipR) * 0.35, 0.12, 0x10b981);
            }
            this.prevFootContactL = this.targetPose.footContactL;
            this.prevFootContactR = this.targetPose.footContactR;

            // Update Warna Sensor Sol Sepatu (Hijau Menyala saat Menapak, Abu-abu saat Mengayun)
            if (this.footMatLeft && this.footMatRight) {
                this.footMatLeft.color.setHex(this.targetPose.footContactL ? 0x22c55e : 0x475569);
                this.footMatLeft.emissive.setHex(this.targetPose.footContactL ? 0x16a34a : 0x1e293b);
                this.footMatRight.color.setHex(this.targetPose.footContactR ? 0x22c55e : 0x475569);
                this.footMatRight.emissive.setHex(this.targetPose.footContactR ? 0x16a34a : 0x1e293b);
            }

            // Update Warna Indikator Keseimbangan Dada & Halo Kepala
            const absTilt = Math.abs(this.currentPose.torsoAngle);
            let statusHex = 0x38bdf8;
            let emissiveHex = 0x0ea5e9;
            if (this.targetPose.fallen) {
                statusHex = 0xef4444;
                emissiveHex = 0xdc2626;
            } else if (this.targetPose.reachedFinish) {
                statusHex = 0x22c55e;
                emissiveHex = 0x16a34a;
            } else if (absTilt > 0.28) {
                statusHex = 0xf59e0b;
                emissiveHex = 0xd97706;
            }
            this.chestCoreMat.color.setHex(statusHex);
            this.chestCoreMat.emissive.setHex(emissiveHex);
            this.balanceIndicatorMat.color.setHex(statusHex);
            if (this.comRingMat) this.comRingMat.color.setHex(statusHex);
        }

        // Update animasi riak langkah kaki di lantai
        for (let i = this.footstepRipples.length - 1; i >= 0; i--) {
            const rp = this.footstepRipples[i];
            rp.scale += 0.08;
            rp.opacity -= 0.035;
            rp.mesh.scale.set(rp.scale, rp.scale, 1);
            rp.mesh.material.opacity = Math.max(0, rp.opacity);
            if (rp.opacity <= 0) {
                this.scene.remove(rp.mesh);
                rp.mesh.geometry.dispose();
                rp.mesh.material.dispose();
                this.footstepRipples.splice(i, 1);
            }
        }

        // Update Posisi Kamera & Zoom mengikuti karakter manusia 3D
        const targetZoomFactor = 100.0 / Math.max(25, Math.min(300, this.zoomPercent));
        this.cameraZoom += (targetZoomFactor - this.cameraZoom) * 0.20;

        let lookAtX = this.currentPose.x + 0.45 + this.panOffsetX;
        let lookAtY = 0.88 + this.panOffsetY;
        let camX, camY, camZ;

        if (this.cameraMode === 'side') {
            // Tampilan Samping 2D Sagittal (Bisa di-zoom dekat ke sendi lutut/paha atau jauh)
            const radius = 3.85 * this.cameraZoom;
            camX = lookAtX + Math.sin(this.orbitYawOffset) * radius;
            camY = Math.max(0.25, lookAtY + 0.32 * this.cameraZoom + this.orbitPitchOffset * 1.6);
            camZ = Math.cos(this.orbitYawOffset) * radius;
        } else if (this.cameraMode === 'front') {
            const radius = 3.45 * this.cameraZoom;
            camX = lookAtX + Math.cos(this.orbitYawOffset) * radius;
            camY = Math.max(0.25, lookAtY + 0.65 * this.cameraZoom + this.orbitPitchOffset * 1.6);
            camZ = Math.sin(this.orbitYawOffset + 0.55) * radius;
        } else if (this.cameraMode === 'overview') {
            // Tampilan Seluruh Lintasan 0m s/d 20m
            lookAtX = 10.0 + this.panOffsetX;
            lookAtY = 0.8 + this.panOffsetY;
            const radius = 14.5 * this.cameraZoom;
            camX = lookAtX + Math.sin(this.orbitYawOffset) * radius;
            camY = Math.max(1.0, 5.2 * this.cameraZoom + this.orbitPitchOffset * 4.0);
            camZ = Math.cos(this.orbitYawOffset) * radius;
        } else {
            // Mode 3D Follow Standar (Orbit 360° & Zoom Bebas)
            const radius = 4.05 * this.cameraZoom;
            const yaw = this.orbitYawOffset - 0.42;
            camX = lookAtX + Math.sin(yaw) * radius;
            camY = Math.max(0.22, lookAtY + (0.72 + this.orbitPitchOffset * 1.8) * this.cameraZoom);
            camZ = Math.cos(yaw) * radius;
        }

        this.camera.position.x += (camX - this.camera.position.x) * 0.18;
        this.camera.position.y += (camY - this.camera.position.y) * 0.18;
        this.camera.position.z += (camZ - this.camera.position.z) * 0.18;
        this.camera.lookAt(lookAtX, lookAtY, 0);

        if (this.dirLight) {
            this.dirLight.position.x = this.currentPose.x + 4;
        }

        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Atur Level Zoom Lingkungan 3D (35% Wide Out s/d 250% Close-Up Detail)
     */
    setZoomPercent(newPercent) {
        const clamped = Math.round(Math.max(35, Math.min(250, newPercent)));
        this.zoomPercent = clamped;
        const slider = document.getElementById('sliderZoom3D');
        if (slider) slider.value = clamped;
        this.setText('zoomPercentLabel', `${clamped}%`);
    }

    resetCameraAndZoom() {
        this.orbitYawOffset = 0.0;
        this.orbitPitchOffset = 0.0;
        this.panOffsetX = 0.0;
        this.panOffsetY = 0.0;
        this.setZoomPercent(100);
    }

    /**
     * Toggle Mode Fullscreen pada Panel Simulasi 3D (#simulationMainPanel)
     */
    async toggleFullscreenPanel() {
        const panel = document.getElementById('simulationMainPanel');
        if (!panel) return;

        const isNativeFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        const isCssFs = panel.classList.contains('sim-panel-fullscreen');

        if (isNativeFs || isCssFs) {
            panel.classList.remove('sim-panel-fullscreen');
            if (isNativeFs) {
                try {
                    if (document.exitFullscreen) {
                        await document.exitFullscreen();
                    } else if (document.webkitExitFullscreen) {
                        await document.webkitExitFullscreen();
                    }
                } catch (e) {}
            }
            this.syncFullscreenUI(false);
        } else {
            panel.classList.add('sim-panel-fullscreen');
            try {
                if (panel.requestFullscreen) {
                    await panel.requestFullscreen();
                } else if (panel.webkitRequestFullscreen) {
                    await panel.webkitRequestFullscreen();
                }
            } catch (e) {
                // Tetap berjalan menggunakan class CSS .sim-panel-fullscreen jika browser memblokir native API
            }
            this.syncFullscreenUI(true);
        }

        setTimeout(() => this.onWindowResize(), 50);
        setTimeout(() => this.onWindowResize(), 200);
    }

    syncFullscreenUI(isActive) {
        const btn = document.getElementById('btnToggleFullscreen');
        const icon = document.getElementById('iconFullscreen');
        const label = document.getElementById('labelFullscreen');
        if (btn) {
            btn.className = isActive
                ? 'btn btn-sm btn-warning text-dark fw-bold py-0 px-2 ms-1'
                : 'btn btn-sm btn-info text-dark fw-bold py-0 px-2 ms-1';
        }
        if (icon) {
            icon.className = isActive ? 'bi bi-fullscreen-exit me-1' : 'bi bi-arrows-fullscreen me-1';
        }
        if (label) {
            label.textContent = isActive ? '' : '';
        }
    }

    onWindowResize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const w = this.container.clientWidth || 820;
        const h = this.container.clientHeight || 410;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    /**
     * 2. INISIALISASI GRAFIK KURVA BELAJAR (CHART.JS)
     */
    initLearningChart() {
        const ctx = document.getElementById('learningCurveChart');
        if (!ctx || typeof Chart === 'undefined') return;

        const labels = this.episodes.map(e => `Ep ${e.episode_number}`);
        const distData = this.episodes.map(e => parseFloat(e.distance_m));
        const rewData = this.episodes.map(e => parseFloat(e.total_reward));

        this.learningChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'bar',
                        label: 'Jarak Tempuh (Meter)',
                        data: distData,
                        backgroundColor: 'rgba(56, 189, 248, 0.55)',
                        borderColor: '#38bdf8',
                        borderWidth: 1,
                        borderRadius: 4,
                        yAxisID: 'yDist'
                    },
                    {
                        type: 'line',
                        label: 'Total Reward Episode',
                        data: rewData,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        borderWidth: 2.5,
                        pointRadius: 3,
                        tension: 0.3,
                        yAxisID: 'yRew'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        labels: { color: '#cbd5e1', font: { size: 11 } }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
                        grid: { color: 'rgba(148, 163, 184, 0.08)' }
                    },
                    yDist: {
                        type: 'linear',
                        position: 'left',
                        min: 0,
                        max: 22,
                        title: { display: true, text: 'Jarak (m) [Finish = 20m]', color: '#38bdf8' },
                        ticks: { color: '#38bdf8' },
                        grid: { color: 'rgba(148, 163, 184, 0.1)' }
                    },
                    yRew: {
                        type: 'linear',
                        position: 'right',
                        title: { display: true, text: 'Total Reward', color: '#10b981' },
                        ticks: { color: '#10b981' },
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    }

    /**
     * 3. INISIALISASI WEB WORKER (TENSORFLOW.JS + PHYSICS ENGINE)
     */
    initWebWorker() {
        const workerUrl = `${this.appPath}/public/assets/js/rl-walker-worker.js?v=${Date.now()}`;
        const tfUrl = `${this.appPath}/public/assets/vendor/tfjs/tf.min.js`;

        this.worker = new Worker(workerUrl);
        this.worker.onmessage = (e) => this.handleWorkerMessage(e.data);

        const nextEpisodeNum = (this.episodes.length > 0)
            ? (Math.max(...this.episodes.map(ep => parseInt(ep.episode_number, 10))) + 1)
            : 1;

        this.worker.postMessage({
            cmd: 'INIT',
            tfScriptUrl: tfUrl,
            startEpisode: nextEpisodeNum,
            config: this.readCurrentConfigFromUI()
        });
    }

    /**
     * Tangani Pesan Real-Time dari Web Worker
     */
    handleWorkerMessage(data) {
        if (!data || !data.type) return;

        switch (data.type) {
            case 'WORKER_READY': {
                const badge = document.getElementById('workerStatusBadge');
                if (badge) {
                    badge.className = 'badge bg-success-subtle text-success border border-success-subtle';
                    badge.innerHTML = `<i class="bi bi-cpu-fill me-1"></i>TF.js Worker Aktif (${data.tfBackend.toUpperCase()})`;
                }
                break;
            }

            case 'STATE_UPDATE': {
                this.targetPose = { ...data.walker };
                this.updateLiveTelemetryUI(data.walker, data.rl);
                break;
            }

            case 'EPISODE_COMPLETE': {
                const ep = data.episodeSummary;
                this.onEpisodeFinished(ep);
                break;
            }

            case 'BRAIN_RESET_DONE': {
                this.showToast('Otak AI Direset', data.message, 'info');
                break;
            }

            case 'MODEL_LOADED': {
                this.showToast(
                    'Model AI Dimuat',
                    `Berhasil memuat "${data.model_name}" ke jaringan saraf TensorFlow.js (Epsilon: ${Number(data.epsilon).toFixed(2)}).`,
                    'success'
                );
                break;
            }

            case 'MODEL_EXPORTED': {
                this.persistExportedModelToMySQL(data);
                break;
            }

            case 'WORKER_ERROR': {
                this.showToast('Peringatan Worker', data.message, 'danger');
                break;
            }
        }
    }

    /**
     * 4. UPDATE TELEMETRI LIVE (8 SENSOR STATE, 7 AKSI Q-VALUE, & REWARD BREAKDOWN)
     */
    updateLiveTelemetryUI(w, rl) {
        this.setText('hudEpisode', rl.episode);
        this.setText('hudDistance', `${w.x.toFixed(2)} m`);
        this.setText('hudSpeed', `${w.vx.toFixed(2)} m/s`);
        this.setText('hudTorsoAngle', `${w.torsoAngleDeg > 0 ? '+' : ''}${w.torsoAngleDeg.toFixed(1)}°`);
        this.setText('hudEpsilon', `${(rl.epsilon * 100).toFixed(0)}%`);
        this.setText('hudLoss', rl.loss.toFixed(4));
        this.setText('hudStageBadge', rl.stageLabel);

        const progressPct = Math.min(100, Math.max(0, (w.x / 20.0) * 100));
        const trackBar = document.getElementById('hudTrackProgress');
        if (trackBar) {
            trackBar.style.width = `${progressPct.toFixed(1)}%`;
        }

        const pushBadge = document.getElementById('hudPushStatus');
        if (pushBadge) {
            if (w.pushLabel) {
                pushBadge.textContent = w.pushLabel;
                pushBadge.classList.remove('d-none');
            } else {
                pushBadge.classList.add('d-none');
            }
        }

        // Update 8 Sensor State Tubuh
        const s = rl.stateVector || [0, 0, 0, 0, 0, 0, 0, 0];
        for (let i = 0; i < 8; i++) {
            const val = s[i] || 0;
            const bar = document.getElementById(`stateBar_${i}`);
            const valEl = document.getElementById(`stateVal_${i}`);
            if (bar) {
                const pct = Math.min(100, Math.max(5, ((val + 1) / 2) * 100));
                bar.style.width = `${pct.toFixed(0)}%`;
            }
            if (valEl) {
                valEl.textContent = val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
            }
        }

        // Indikator Kontak Telapak Kaki Kiri & Kanan
        const footLBadge = document.getElementById('footSensorLeft');
        const footRBadge = document.getElementById('footSensorRight');
        if (footLBadge) {
            footLBadge.className = w.footContactL
                ? 'badge bg-success-subtle text-success border border-success-subtle'
                : 'badge bg-secondary-subtle text-secondary';
            footLBadge.textContent = w.footContactL ? 'Kaki Kiri: Menapak' : 'Kaki Kiri: Mengayun';
        }
        if (footRBadge) {
            footRBadge.className = w.footContactR
                ? 'badge bg-success-subtle text-success border border-success-subtle'
                : 'badge bg-secondary-subtle text-secondary';
            footRBadge.textContent = w.footContactR ? 'Kaki Kanan: Menapak' : 'Kaki Kanan: Mengayun';
        }

        // Update 7 Q-Values & Highlight Aksi yang Dipilih Jaringan Saraf
        this.setText('activeActionName', rl.actionLabel);
        const qVals = rl.qValues || [0, 0, 0, 0, 0, 0, 0];
        const minQ = Math.min(...qVals, -2);
        const maxQ = Math.max(...qVals, 2);
        const spanQ = Math.max(0.5, maxQ - minQ);

        for (let a = 0; a < 7; a++) {
            const q = qVals[a] || 0;
            const pct = Math.min(100, Math.max(6, ((q - minQ) / spanQ) * 100));
            const row = document.getElementById(`actionRow_${a}`);
            const bar = document.getElementById(`actionBar_${a}`);
            const txt = document.getElementById(`actionQ_${a}`);

            if (row) {
                row.className = (a === rl.action)
                    ? 'p-1 rounded bg-info bg-opacity-10 border border-info border-opacity-50 mb-1'
                    : 'p-1 rounded mb-1';
            }
            if (bar) {
                bar.style.width = `${pct.toFixed(0)}%`;
                bar.className = (a === rl.action) ? 'progress-bar bg-info' : 'progress-bar bg-secondary';
            }
            if (txt) {
                txt.textContent = q.toFixed(2);
            }
        }

        // Update Komponen Reward Real-Time
        const rb = rl.rewardBreakdown || { forward: 0, upright: 0, gait: 0, torque: 0, terminal: 0 };
        this.setText('rewForward', (rb.forward >= 0 ? '+' : '') + rb.forward.toFixed(2));
        this.setText('rewUpright', (rb.upright >= 0 ? '+' : '') + rb.upright.toFixed(2));
        this.setText('rewGait', (rb.gait >= 0 ? '+' : '') + rb.gait.toFixed(2));
        this.setText('rewTorque', rb.torque.toFixed(2));
        this.setText('rewTotalEpisode', rl.totalReward.toFixed(2));
    }

    /**
     * 5. SAAT EPISODE SELESAI -> UPDATE GRAFIK & SIMPAN OTOMATIS KE MYSQL (db_balance_ai)
     */
    async onEpisodeFinished(ep) {
        if (ep.distance_m > this.bestDistanceRecord) {
            this.bestDistanceRecord = ep.distance_m;
            if (this.recordFlagGroup) {
                this.recordFlagGroup.position.x = Math.max(0.5, this.bestDistanceRecord);
            }
        }

        this.episodes.push(ep);
        if (this.learningChart) {
            this.learningChart.data.labels.push(`Ep ${ep.episode_number}`);
            this.learningChart.data.datasets[0].data.push(ep.distance_m);
            this.learningChart.data.datasets[1].data.push(ep.total_reward);
            this.learningChart.update('none');
        }

        this.renderEpisodesTable();
        this.updateSessionSummaryCards();

        try {
            const response = await fetch(`${this.appPath}/landing/api/record_episode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: this.activeSession.id || 1,
                    ...ep
                })
            });
            const res = await response.json();
            if (res && res.success && res.session) {
                this.activeSession = res.session;
                this.updateSessionSummaryCards();
            }
        } catch (err) {
            console.warn('Gagal menyimpan log episode ke MySQL:', err);
        }
    }

    /**
     * 6. BACA KONFIGURASI SLIDER PARAMETER DARI UI
     */
    readCurrentConfigFromUI() {
        return {
            algorithm: this.getVal('selectAlgorithm', 'DQN'),
            learningRate: parseFloat(this.getVal('sliderLR', 0.002)),
            gamma: parseFloat(this.getVal('sliderGamma', 0.98)),
            epsilonDecay: parseFloat(this.getVal('sliderEpsDecay', 0.90)),
            rewardForwardWeight: parseFloat(this.getVal('sliderRewForward', 4.5)),
            rewardUprightWeight: parseFloat(this.getVal('sliderRewUpright', 2.5)),
            rewardGaitWeight: parseFloat(this.getVal('sliderRewGait', 2.0)),
            penaltyFall: parseFloat(this.getVal('sliderPenFall', -45.0)),
            groundFriction: parseFloat(this.getVal('sliderFriction', 0.85)),
            gravity: parseFloat(this.getVal('sliderGravity', 9.81))
        };
    }

    /**
     * 7. BINDING SELURUH TOMBOL KONTROL & SLIDER INTERAKTIF MAHASISWA
     */
    bindUIEvents() {
        const btnStartPause = document.getElementById('btnStartPause');
        if (btnStartPause) {
            btnStartPause.addEventListener('click', () => {
                this.isTraining = !this.isTraining;
                if (this.isTraining) {
                    this.worker.postMessage({ cmd: 'START' });
                    btnStartPause.className = 'btn btn-warning fw-semibold px-3';
                    btnStartPause.innerHTML = '<i class="bi bi-pause-fill me-1"></i>Jeda Latihan';
                } else {
                    this.worker.postMessage({ cmd: 'PAUSE' });
                    btnStartPause.className = 'btn btn-emerald fw-semibold px-3';
                    btnStartPause.innerHTML = '<i class="bi bi-play-fill me-1"></i>Mulai Latih AI';
                }
            });
        }

        const btnStepOnce = document.getElementById('btnStepOnce');
        if (btnStepOnce) {
            btnStepOnce.addEventListener('click', () => {
                this.isTraining = false;
                if (btnStartPause) {
                    btnStartPause.className = 'btn btn-emerald fw-semibold px-3';
                    btnStartPause.innerHTML = '<i class="bi bi-play-fill me-1"></i>Mulai Latih AI';
                }
                this.worker.postMessage({ cmd: 'STEP_ONCE' });
            });
        }

        const btnResetEpisode = document.getElementById('btnResetEpisode');
        if (btnResetEpisode) {
            btnResetEpisode.addEventListener('click', () => {
                this.worker.postMessage({ cmd: 'RESET_EPISODE' });
            });
        }

        const btnResetBrain = document.getElementById('btnResetBrain');
        if (btnResetBrain) {
            btnResetBrain.addEventListener('click', async () => {
                this.isTraining = false;
                if (btnStartPause) {
                    btnStartPause.className = 'btn btn-emerald fw-semibold px-3';
                    btnStartPause.innerHTML = '<i class="bi bi-play-fill me-1"></i>Mulai Latih AI';
                }
                this.worker.postMessage({ cmd: 'RESET_BRAIN' });

                try {
                    await fetch(`${this.appPath}/landing/api/clear_episodes`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ session_id: this.activeSession.id || 1 })
                    });
                    this.episodes = [];
                    this.bestDistanceRecord = 0;
                    if (this.recordFlagGroup) this.recordFlagGroup.position.x = 0.5;
                    if (this.learningChart) {
                        this.learningChart.data.labels = [];
                        this.learningChart.data.datasets[0].data = [];
                        this.learningChart.data.datasets[1].data = [];
                        this.learningChart.update();
                    }
                    this.renderEpisodesTable();
                    this.updateSessionSummaryCards();
                } catch (e) {}
            });
        }

        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const spd = parseInt(btn.getAttribute('data-speed'), 10) || 1;
                this.worker.postMessage({ cmd: 'SET_SPEED', speed: spd });
            });
        });

        document.querySelectorAll('.cam-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.cameraMode = btn.getAttribute('data-cam') || 'follow';
                this.orbitYawOffset = 0;
                this.orbitPitchOffset = 0;
                this.panOffsetX = 0;
                this.panOffsetY = 0;
            });
        });

        // Kontrol Zoom Lingkungan 3D (Tombol +, -, Slider, & Reset)
        const btnZoomIn = document.getElementById('btnZoomIn');
        if (btnZoomIn) {
            btnZoomIn.addEventListener('click', () => {
                this.setZoomPercent(this.zoomPercent + 20);
            });
        }
        const btnZoomOut = document.getElementById('btnZoomOut');
        if (btnZoomOut) {
            btnZoomOut.addEventListener('click', () => {
                this.setZoomPercent(this.zoomPercent - 20);
            });
        }
        const sliderZoom3D = document.getElementById('sliderZoom3D');
        if (sliderZoom3D) {
            sliderZoom3D.addEventListener('input', () => {
                this.setZoomPercent(parseFloat(sliderZoom3D.value) || 100);
            });
        }
        const btnZoomReset = document.getElementById('btnZoomReset');
        if (btnZoomReset) {
            btnZoomReset.addEventListener('click', () => {
                this.resetCameraAndZoom();
            });
        }
        const btnToggleFullscreen = document.getElementById('btnToggleFullscreen');
        if (btnToggleFullscreen) {
            btnToggleFullscreen.addEventListener('click', () => {
                this.toggleFullscreenPanel();
            });
        }

        const onFullscreenChange = () => {
            const panel = document.getElementById('simulationMainPanel');
            const isNativeFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
            if (!isNativeFs && panel && panel.classList.contains('sim-panel-fullscreen')) {
                panel.classList.remove('sim-panel-fullscreen');
                this.syncFullscreenUI(false);
            } else if (isNativeFs) {
                this.syncFullscreenUI(true);
            }
            setTimeout(() => this.onWindowResize(), 60);
        };
        document.addEventListener('fullscreenchange', onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', onFullscreenChange);
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const panel = document.getElementById('simulationMainPanel');
                if (panel && panel.classList.contains('sim-panel-fullscreen')) {
                    panel.classList.remove('sim-panel-fullscreen');
                    this.syncFullscreenUI(false);
                    setTimeout(() => this.onWindowResize(), 60);
                }
            }
        });

        const btnPushForward = document.getElementById('btnPushForward');
        if (btnPushForward) {
            btnPushForward.addEventListener('click', () => {
                this.worker.postMessage({ cmd: 'APPLY_PUSH', force: 7.5 });
            });
        }
        const btnPushBackward = document.getElementById('btnPushBackward');
        if (btnPushBackward) {
            btnPushBackward.addEventListener('click', () => {
                this.worker.postMessage({ cmd: 'APPLY_PUSH', force: -7.5 });
            });
        }

        document.querySelectorAll('.quick-skill-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const code = btn.getAttribute('data-model-code');
                const found = this.savedModels.find(m => m.model_code === code);
                if (found) {
                    this.loadSavedModelIntoWorker(found);
                } else {
                    const fallbackMode = code === 'MODEL_LVL0_RANDOM' ? 'untrained'
                        : (code === 'MODEL_LVL1_TODDLER' ? 'intermediate' : 'master');
                    this.worker.postMessage({
                        cmd: 'LOAD_MODEL',
                        model_name: btn.textContent.trim(),
                        trained_episodes: fallbackMode === 'master' ? 25 : (fallbackMode === 'intermediate' ? 10 : 0),
                        weights_json: JSON.stringify({ preset_mode: fallbackMode })
                    });
                }
            });
        });

        const selectPreset = document.getElementById('selectRewardPreset');
        if (selectPreset) {
            selectPreset.addEventListener('change', () => {
                const code = selectPreset.value;
                const preset = this.presets.find(p => p.preset_code === code);
                if (preset) {
                    this.applyPresetToSliders(preset);
                }
            });
        }

        const sliderIds = [
            ['sliderLR', 'valLR', ''],
            ['sliderGamma', 'valGamma', ''],
            ['sliderEpsDecay', 'valEpsDecay', ''],
            ['sliderRewForward', 'valRewForward', ''],
            ['sliderRewUpright', 'valRewUpright', ''],
            ['sliderRewGait', 'valRewGait', ''],
            ['sliderPenFall', 'valPenFall', ''],
            ['sliderFriction', 'valFriction', ''],
            ['sliderGravity', 'valGravity', ' m/s²']
        ];

        sliderIds.forEach(([sId, vId, suffix]) => {
            const el = document.getElementById(sId);
            if (el) {
                el.addEventListener('input', () => {
                    this.setText(vId, el.value + suffix);
                    this.worker.postMessage({
                        cmd: 'UPDATE_CONFIG',
                        config: this.readCurrentConfigFromUI()
                    });
                });
            }
        });

        const selectAlgo = document.getElementById('selectAlgorithm');
        if (selectAlgo) {
            selectAlgo.addEventListener('change', () => {
                this.worker.postMessage({
                    cmd: 'UPDATE_CONFIG',
                    config: this.readCurrentConfigFromUI()
                });
            });
        }

        const btnSavePresetDb = document.getElementById('btnSavePresetDb');
        if (btnSavePresetDb) {
            btnSavePresetDb.addEventListener('click', async () => {
                const cfg = this.readCurrentConfigFromUI();
                const presetCode = this.getVal('selectRewardPreset', 'standar_seimbang');
                try {
                    const resp = await fetch(`${this.appPath}/landing/api/update_preset`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            preset_code: presetCode,
                            learning_rate: cfg.learningRate,
                            gamma: cfg.gamma,
                            reward_forward_weight: cfg.rewardForwardWeight,
                            reward_upright_weight: cfg.rewardUprightWeight,
                            reward_gait_weight: cfg.rewardGaitWeight,
                            penalty_fall: cfg.penaltyFall,
                            ground_friction: cfg.groundFriction,
                            gravity: cfg.gravity
                        })
                    });
                    const res = await resp.json();
                    if (res.success) {
                        this.presets = res.presets || this.presets;
                        this.showToast('Tersimpan di MySQL', `Konfigurasi reward "${presetCode}" berhasil diperbarui di database db_balance_ai.`, 'success');
                    }
                } catch (e) {
                    this.showToast('Gagal Menyimpan', 'Tidak dapat menghubungi server database.', 'danger');
                }
            });
        }

        const btnSaveModelDb = document.getElementById('btnSaveModelDb');
        if (btnSaveModelDb) {
            btnSaveModelDb.addEventListener('click', () => {
                this.worker.postMessage({ cmd: 'EXPORT_MODEL' });
            });
        }
    }

    applyPresetToSliders(p) {
        const setSlider = (id, labelId, val, suffix = '') => {
            const el = document.getElementById(id);
            if (el) el.value = val;
            this.setText(labelId, val + suffix);
        };

        const algoEl = document.getElementById('selectAlgorithm');
        if (algoEl && p.algorithm) algoEl.value = p.algorithm;

        setSlider('sliderLR', 'valLR', p.learning_rate);
        setSlider('sliderGamma', 'valGamma', p.gamma);
        setSlider('sliderEpsDecay', 'valEpsDecay', p.epsilon_decay);
        setSlider('sliderRewForward', 'valRewForward', p.reward_forward_weight);
        setSlider('sliderRewUpright', 'valRewUpright', p.reward_upright_weight);
        setSlider('sliderRewGait', 'valRewGait', p.reward_gait_weight);
        setSlider('sliderPenFall', 'valPenFall', p.penalty_fall);
        setSlider('sliderFriction', 'valFriction', p.ground_friction);
        setSlider('sliderGravity', 'valGravity', p.gravity, ' m/s²');

        const descEl = document.getElementById('presetDescriptionText');
        if (descEl) descEl.textContent = p.description || '';

        this.worker.postMessage({
            cmd: 'UPDATE_CONFIG',
            config: this.readCurrentConfigFromUI()
        });
        this.showToast('Preset Diterapkan', `Mengaktifkan "${p.preset_name}"`, 'info');
    }

    async persistExportedModelToMySQL(exportData) {
        const nameInput = document.getElementById('inputModelName');
        const notesInput = document.getElementById('inputModelNotes');
        const modelName = (nameInput && nameInput.value.trim())
            ? nameInput.value.trim()
            : `Model Mahasiswa (Episode ${exportData.episode})`;
        const notes = (notesInput && notesInput.value.trim())
            ? notesInput.value.trim()
            : 'Bobot jaringan saraf TensorFlow.js disimpan dari simulasi Web Worker.';

        const bestRew = this.episodes.length > 0
            ? Math.max(...this.episodes.map(e => parseFloat(e.total_reward || 0)))
            : 0;

        try {
            const resp = await fetch(`${this.appPath}/landing/api/save_model`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model_name: modelName,
                    algorithm: this.getVal('selectAlgorithm', 'DQN'),
                    trained_episodes: exportData.episode,
                    best_distance_m: this.bestDistanceRecord,
                    best_reward: bestRew,
                    architecture_json: exportData.architecture_json,
                    weights_json: exportData.weights_json,
                    notes: notes
                })
            });
            const res = await resp.json();
            if (res.success) {
                this.savedModels = res.models || this.savedModels;
                this.renderModelsList();
                if (nameInput) nameInput.value = '';
                this.showToast('Model Tersimpan di MySQL', `Otak AI "${modelName}" berhasil disimpan ke tabel saved_models (db_balance_ai).`, 'success');
            }
        } catch (err) {
            this.showToast('Gagal Menyimpan Model', err.message, 'danger');
        }
    }

    loadSavedModelIntoWorker(modelRow) {
        if (!modelRow) return;
        this.worker.postMessage({
            cmd: 'LOAD_MODEL',
            model_name: modelRow.model_name,
            trained_episodes: parseInt(modelRow.trained_episodes, 10) || 1,
            weights_json: modelRow.weights_json
        });
    }

    renderEpisodesTable() {
        const tbody = document.getElementById('episodeLogsTableBody');
        if (!tbody) return;

        if (!this.episodes || this.episodes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-secondary py-3">Belum ada episode tercatat. Klik <strong>Mulai Latih AI</strong> untuk memulai!</td></tr>`;
            return;
        }

        const recent = [...this.episodes].reverse().slice(0, 35);
        tbody.innerHTML = recent.map(ep => {
            const isFinish = parseInt(ep.reached_finish, 10) === 1;
            const badgeClass = isFinish
                ? 'badge bg-success-subtle text-success border border-success-subtle'
                : 'badge bg-danger-subtle text-danger border border-danger-subtle';
            const dist = parseFloat(ep.distance_m).toFixed(2);
            const rew = parseFloat(ep.total_reward).toFixed(1);
            const eps = (parseFloat(ep.epsilon) * 100).toFixed(0);
            return `
                <tr>
                    <td class="fw-bold text-info">#${ep.episode_number}</td>
                    <td><span class="fw-semibold text-white">${dist} m</span></td>
                    <td class="${parseFloat(ep.total_reward) >= 0 ? 'text-emerald' : 'text-danger'} fw-semibold">${rew}</td>
                    <td>${ep.steps_count}</td>
                    <td>${eps}%</td>
                    <td><span class="${badgeClass}">${this.escapeHtml(ep.termination_reason)}</span></td>
                    <td class="small text-secondary">${this.escapeHtml(ep.stage_label || '')}</td>
                </tr>
            `;
        }).join('');
    }

    renderModelsList() {
        const container = document.getElementById('savedModelsListContainer');
        if (!container) return;

        if (!this.savedModels || this.savedModels.length === 0) {
            container.innerHTML = `<div class="text-secondary small text-center py-3">Belum ada model tersimpan.</div>`;
            return;
        }

        container.innerHTML = this.savedModels.map(m => {
            const isBuiltin = parseInt(m.is_builtin, 10) === 1;
            return `
                <div class="p-2 rounded border border-secondary border-opacity-25 bg-dark bg-opacity-50 mb-2 d-flex align-items-center justify-content-between gap-2">
                    <div class="overflow-hidden">
                        <div class="fw-semibold text-white small text-truncate">${this.escapeHtml(m.model_name)}</div>
                        <div class="text-secondary" style="font-size: 0.73rem;">
                            <span class="badge bg-info-subtle text-info me-1">${this.escapeHtml(m.algorithm)}</span>
                            Ep: <strong>${m.trained_episodes}</strong> | Rekor: <strong>${parseFloat(m.best_distance_m).toFixed(2)}m</strong>
                        </div>
                        <div class="text-secondary text-truncate" style="font-size: 0.71rem;">${this.escapeHtml(m.notes || '')}</div>
                    </div>
                    <div class="d-flex gap-1 flex-shrink-0">
                        <button type="button" class="btn btn-sm btn-outline-info py-1 px-2 btn-load-model" data-id="${m.id}" title="Muat Otak AI Ini">
                            <i class="bi bi-upload me-1"></i>Muat
                        </button>
                        ${!isBuiltin ? `
                        <button type="button" class="btn btn-sm btn-outline-danger py-1 px-2 btn-del-model" data-id="${m.id}" title="Hapus Model">
                            <i class="bi bi-trash"></i>
                        </button>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.btn-load-model').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-id'), 10);
                const found = this.savedModels.find(x => parseInt(x.id, 10) === id);
                if (found) this.loadSavedModelIntoWorker(found);
            });
        });

        container.querySelectorAll('.btn-del-model').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = parseInt(btn.getAttribute('data-id'), 10);
                try {
                    const resp = await fetch(`${this.appPath}/landing/api/delete_model`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ model_id: id })
                    });
                    const res = await resp.json();
                    if (res.success) {
                        this.savedModels = res.models || [];
                        this.renderModelsList();
                    }
                } catch (e) {}
            });
        });
    }

    updateSessionSummaryCards() {
        const totalEp = this.episodes.length;
        const bestDist = totalEp > 0
            ? Math.max(...this.episodes.map(e => parseFloat(e.distance_m || 0)))
            : 0;
        const finishCount = this.episodes.filter(e => parseInt(e.reached_finish, 10) === 1).length;
        const avgDist = totalEp > 0
            ? (this.episodes.reduce((s, e) => s + parseFloat(e.distance_m || 0), 0) / totalEp)
            : 0;

        this.setText('kpiTotalEpisodes', totalEp);
        this.setText('kpiBestDistance', `${bestDist.toFixed(2)} m`);
        this.setText('kpiAvgDistance', `${avgDist.toFixed(2)} m`);
        this.setText('kpiFinishCount', `${finishCount}x Finish`);
    }

    setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    getVal(id, fallback) {
        const el = document.getElementById(id);
        return el ? el.value : fallback;
    }

    escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    showToast(title, message, type = 'info') {
        const box = document.getElementById('liveNotificationBanner');
        if (!box) return;
        const colorMap = {
            success: 'border-success text-success bg-success',
            danger: 'border-danger text-danger bg-danger',
            info: 'border-info text-info bg-info'
        };
        const cls = colorMap[type] || colorMap.info;
        box.className = `alert bg-opacity-10 border ${cls} py-2 px-3 mb-2 d-flex align-items-center justify-content-between small`;
        box.innerHTML = `<div><strong class="me-2">${this.escapeHtml(title)}:</strong><span class="text-light">${this.escapeHtml(message)}</span></div>`;
        box.classList.remove('d-none');
    }
}

window.addEventListener('DOMContentLoaded', () => {
    if (window.BALANCE_AI_BOOT_DATA) {
        window.walkerLabApp = new BipedalWalkerLabApp(window.BALANCE_AI_BOOT_DATA);
    }
});
