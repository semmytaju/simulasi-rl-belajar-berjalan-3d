<?php

class Controller {

	public function __construct(){
		$this->send_security_headers();
		$this->sanitize_global_inputs();
		$this->check_security_payloads();
	}

	// Defense-in-depth HTTP security headers
	public function send_security_headers(){
		if (!headers_sent()) {
			@header_remove('X-Powered-By');
			header('X-Frame-Options: SAMEORIGIN');
			header('X-Content-Type-Options: nosniff');
			header('Referrer-Policy: strict-origin-when-cross-origin');
			header('Permissions-Policy: geolocation=(self), camera=(self), microphone=()');
			header('X-XSS-Protection: 1; mode=block');
			header('X-Permitted-Cross-Domain-Policies: none');
			header('Cross-Origin-Opener-Policy: same-origin-allow-popups');
			if ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['SERVER_PORT'] ?? 80) == 443) {
				header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
			}
		}
	}

	// Proactive SQLi, RCE/PHP2Shell, Path Traversal, and XSS inspection on request parameters
	public function check_security_payloads(){
		$paramsToCheck = array_merge($_GET, $_POST, $_COOKIE);
		if (!empty($_SERVER['QUERY_STRING'])) {
			$paramsToCheck['__raw_query__'] = $_SERVER['QUERY_STRING'];
		}

		if (Security::detect_sqli($paramsToCheck)) {
			Security::log_incident('SQLi_Pattern', json_encode($paramsToCheck), 'Blocked');
			$this->abort(400, 'Permintaan Anda diblokir oleh sistem keamanan karena terdeteksi anomali query.');
		}
		if (Security::detect_rce_payload($paramsToCheck)) {
			Security::log_incident('RCE_PHP2Shell_Vector', json_encode($paramsToCheck), 'Blocked');
			$this->abort(400, 'Permintaan Anda diblokir karena terdeteksi payload eksekusi kode berbahaya.');
		}
		if (Security::detect_path_traversal($paramsToCheck)) {
			Security::log_incident('Path_Traversal_Vector', json_encode($paramsToCheck), 'Blocked');
			$this->abort(400, 'Permintaan Anda diblokir karena terdeteksi traversal direktori tidak aman.');
		}
		if (Security::detect_xss($paramsToCheck)) {
			Security::log_incident('XSS_Vector', json_encode($paramsToCheck), 'Blocked');
			$this->abort(400, 'Permintaan Anda diblokir karena terdeteksi script injection yang tidak aman.');
		}
	}

	// Abort request with an appropriate HTTP error code and academic error page
	public function abort($code = 404, $message = ''){
		http_response_code($code);
		$statusTexts = [
			400 => 'Permintaan Tidak Valid (Bad Request)',
			401 => 'Autentikasi Diperlukan (Unauthorized)',
			403 => 'Akses Ditolak (Forbidden)',
			404 => 'Halaman Tidak Ditemukan (Not Found)',
			405 => 'Metode HTTP Tidak Diizinkan (Method Not Allowed)',
			500 => 'Kesalahan Server Internal (Internal Server Error)',
			503 => 'Layanan Sedang Pemeliharaan (Service Unavailable)'
		];
		$defaultDescriptions = [
			400 => 'Permintaan yang dikirimkan ke server tidak valid atau terdeteksi anomali keamanan oleh WAF.',
			401 => 'Sesi Anda telah berakhir atau Anda belum memiliki hak akses untuk membuka modul terproteksi ini.',
			403 => 'Sistem menolak akses ke halaman ini karena pembatasan hak akses peran atau token keamanan tidak cocok.',
			404 => 'Halaman, berkas, atau tautan yang Anda tuju tidak ditemukan pada aplikasi ini.',
			405 => 'Metode transmisi protokol HTTP yang digunakan tidak diizinkan untuk memproses permintaan pada rute ini.',
			500 => 'Terjadi kendala pemrosesan pada internal server.',
			503 => 'Layanan aplikasi sedang dalam proses peningkatan sistem berkala.'
		];
		$statusTitle = $statusTexts[$code] ?? "Status $code";
		$finalMessage = !empty($message) ? $message : ($defaultDescriptions[$code] ?? 'Terjadi kesalahan dalam memproses permintaan Anda.');
		$appName = defined('APP_NAME') ? APP_NAME : 'Proyek Akhir';
		$data = [
			'title' => "$code - $statusTitle - $appName",
			'code' => (int)$code,
			'status_title' => $statusTitle,
			'message' => $finalMessage,
			'uri' => $_SERVER['REQUEST_URI'] ?? '',
			'client_ip' => class_exists('Security') ? Security::get_client_ip() : ($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1'),
			'timestamp' => date('d M Y H:i:s'),
			'reference_id' => 'ERR-' . strtoupper(substr(md5(($code) . ($_SERVER['REQUEST_URI'] ?? '') . time()), 0, 8)),
			'no_sidebar' => true
		];
		$this->display('errors/index', $data);
		exit();
	}

	// Display view with data
	public function display($view, $data = []){
		$this->send_security_headers();
		
		// Auto CSRF token in view data
		if (!isset($data['csrf_token'])) {
			$data['csrf_token'] = $this->get_csrf_token();
		}

		// Auto-populate active academic semester details dynamically for all views
		$semInfo = self::get_active_academic_semester();
		if (!isset($data['active_semester_label'])) {
			$data['active_semester_label'] = $semInfo['semester_label'];
		}
		if (!isset($data['active_semester'])) {
			$data['active_semester'] = $semInfo['semester_label'];
		}
		if (!isset($data['active_academic_year'])) {
			$data['active_academic_year'] = $semInfo['academic_year'];
		}
		if (!isset($data['active_semester_id'])) {
			$data['active_semester_id'] = $semInfo['semester_id'];
		}
		if (!isset($data['active_semester_type'])) {
			$data['active_semester_type'] = $semInfo['term_type'];
		}
		if (!isset($data['active_semester_info'])) {
			$data['active_semester_info'] = $semInfo;
		}
		if (!isset($data['semester'])) {
			$data['semester'] = $semInfo['semester_label'];
		}

		$primaryPath = dirname(__DIR__) . '/view/' . $view . '.php';
		if (file_exists($primaryPath)) {
			require $primaryPath;
		} elseif (file_exists('../app/view/' . $view . '.php')) {
			require '../app/view/' . $view . '.php';
		} elseif (file_exists('app/view/' . $view . '.php')) {
			require 'app/view/' . $view . '.php';
		} else {
			echo "View $view not found.";
		}
	}

	// Load model
	public function logic($model){
		$primaryPath = dirname(__DIR__) . '/model/' . $model . '.php';
		if (file_exists($primaryPath)) {
			require_once $primaryPath;
		} elseif (file_exists('../app/model/' . $model . '.php')) {
			require_once '../app/model/' . $model . '.php';
		} elseif (file_exists('app/model/' . $model . '.php')) {
			require_once 'app/model/' . $model . '.php';
		}
		
		if (class_exists($model)) {
			return new $model;
		}
		return null;
	}

	// Dynamic Academic Semester Resolver (Shared across all user roles)
	private static $cachedAcademicSemester = null;

	/**
	 * Get the currently active academic semester details dynamically from the database.
	 * Evaluates tbl_classes for active classes and parses term type & academic year.
	 */
	public static function get_active_academic_semester($forceRefresh = false){
		if (self::$cachedAcademicSemester !== null && !$forceRefresh) {
			return self::$cachedAcademicSemester;
		}

		$semesterId = '';
		try {
			$db = new Database();
			if ($db->isConnected() && $db->hasTable('pengaturan')) {
				$db->query("SELECT setting_value FROM pengaturan WHERE setting_key = 'tahun_akademik' LIMIT 1");
				$row = $db->single();
				if ($row && !empty($row['setting_value'])) {
					$semesterId = trim($row['setting_value']);
				}
			}
		} catch (Throwable $e) {
			// Silently fallback if db error
		}

		self::$cachedAcademicSemester = self::parse_semester_id($semesterId);
		return self::$cachedAcademicSemester;
	}

	public static function parse_semester_id($semesterId = ''){
		$semesterId = trim((string)$semesterId);
		$termNum = 1;
		$y1 = '';
		$y2 = '';

		if (!empty($semesterId)) {
			$parts = explode('_', $semesterId);
			if (count($parts) >= 3) {
				$y1 = $parts[0];
				$y2 = $parts[1];
				$termNum = (int)$parts[2];
			} elseif (count($parts) == 2 && is_numeric($parts[0])) {
				$y1 = $parts[0];
				$y2 = (int)$parts[0] + 1;
				$termNum = (int)$parts[1];
			}
		}

		// Calendar fallback if no valid year parsed
		if (empty($y1) || empty($y2)) {
			$currYear = (int)date('Y');
			$currMonth = (int)date('n');
			if ($currMonth >= 7) {
				$y1 = (string)$currYear;
				$y2 = (string)($currYear + 1);
				$termNum = 1;
			} elseif ($currMonth <= 1) {
				$y1 = (string)($currYear - 1);
				$y2 = (string)$currYear;
				$termNum = 1;
			} else {
				$y1 = (string)($currYear - 1);
				$y2 = (string)$currYear;
				$termNum = 2;
			}
			$semesterId = "{$y1}_{$y2}_{$termNum}";
		}

		$academicYear = "$y1/$y2";
		if ($termNum === 1) {
			$termNameId = 'Semester Ganjil';
			$termNameEn = 'Odd Semester';
			$termShort = 'Ganjil';
		} elseif ($termNum === 2) {
			$termNameId = 'Semester Genap';
			$termNameEn = 'Even Semester';
			$termShort = 'Genap';
		} elseif ($termNum === 3) {
			$termNameId = 'Semester Padat';
			$termNameEn = 'Short Semester';
			$termShort = 'Padat';
		} else {
			$termNameId = "Semester $termNum";
			$termNameEn = "Semester $termNum";
			$termShort = "Sem $termNum";
		}

		return [
			'semester_id'          => $semesterId,
			'semester_label'       => "$termNameId $academicYear",
			'semester_label_en'    => "$termNameEn $academicYear",
			'semester_short'       => "$termShort $academicYear",
			'academic_year'        => $academicYear,
			'term_name'            => $termNameId,
			'term_name_en'         => $termNameEn,
			'term_type'            => $termShort,
			'term_number'          => $termNum,
			'year_start'           => $y1,
			'year_end'             => $y2
		];
	}

	// Session management with 15-min idle timeout, secure cookies, and auto-revocation
	public function start_default_session_app(){
		$this->send_security_headers();
		if (session_status() === PHP_SESSION_NONE) {
			$is_https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['SERVER_PORT'] ?? 80) == 443;
			@session_set_cookie_params([
				'lifetime' => 0,
				'path'     => '/',
				'domain'   => '',
				'secure'   => $is_https,
				'httponly' => true,
				'samesite' => 'Lax'
			]);

			$sess_name = session_name();
			if (!empty($_COOKIE[$sess_name])) {
				$candidate_id = $_COOKIE[$sess_name];
				if (!preg_match('/^[a-zA-Z0-9,-]{16,128}$/', $candidate_id)) {
					unset($_COOKIE[$sess_name]);
					session_id(bin2hex(random_bytes(16)));
				}
			}

			@session_start();
		}

		// Idle session timeout: 15 menit (900 detik)
		$idle_timeout = 900;
		if (isset($_SESSION['LAST_ACTIVITY'])) {
			if ((time() - $_SESSION['LAST_ACTIVITY']) > $idle_timeout) {
				if (!empty($_SESSION['user-email']) || !empty($_SESSION['user-name'])) {
					$identifier = $_SESSION['user-email'] ?? ($_SESSION['nim_number'] ?? 'User');
					$this->log_user_login(null, $identifier, 'Timeout', 'Sesi berakhir otomatis (Idle 15 menit)');
					$this->destroy_user_session_db(session_id());
				}
				$this->destroy_session_cleanly();
				header('Location: ' . APP_PATH . '/login/?timeout=1');
				exit();
			}
		}

		$_SESSION['LAST_ACTIVITY'] = time();

		// Live validation: Check user session tracking in user_sessions table
		if (!empty($_SESSION['user-email']) || !empty($_SESSION['user-name']) || !empty($_SESSION['user-role'])) {
			try {
				$db = new Database();
				$conn = $db->getConnection();
				if ($conn) {
					$currentSessId = session_id();
					$escapedSessId = $conn->real_escape_string($currentSessId);
					$resSess = $conn->query("SELECT is_revoked, last_activity FROM user_sessions WHERE session_id = '$escapedSessId' LIMIT 1");

					if ($resSess && $resSess->num_rows > 0) {
						$sessData = $resSess->fetch_assoc();
						// Check if session was forcibly revoked by Administrator
						if ((int)$sessData['is_revoked'] === 1) {
							$this->destroy_user_session_db($currentSessId);
							$this->destroy_session_cleanly();
							header('Location: ' . APP_PATH . '/login/?revoked=1');
							exit();
						}

						// Check if session has expired past 15 minutes in db
						if ((time() - (int)$sessData['last_activity']) > $idle_timeout) {
							$this->destroy_user_session_db($currentSessId);
							$this->destroy_session_cleanly();
							header('Location: ' . APP_PATH . '/login/?timeout=1');
							exit();
						}

						// Session is valid: update last_activity
						$nowTs = time();
						$conn->query("UPDATE user_sessions SET last_activity = $nowTs WHERE session_id = '$escapedSessId'");
					} else {
						// Register session if not yet tracked
						$userId = $_SESSION['user-nip'] ?? ($_SESSION['nim_number'] ?? null);
						$ident = $_SESSION['user-email'] ?? ($_SESSION['nim_number'] ?? 'User');
						$name = $_SESSION['user-name'] ?? 'User';
						$role = $_SESSION['user-role'] ?? 'Guest';
						$this->track_user_session($userId, $ident, $name, $role);
					}

					// Periodic garbage cleanup for expired sessions (1 in 50 requests)
					if (random_int(1, 50) === 1) {
						$twoDaysAgo = time() - (2 * 86400);
						$conn->query("DELETE FROM user_sessions WHERE last_activity < $twoDaysAgo OR (is_revoked = 1 AND last_activity < " . (time() - 3600) . ")");
					}
				}
			} catch (Throwable $e) {}
		}

		// Generate CSRF token per session
		if (empty($_SESSION['csrf_token'])) {
			$_SESSION['csrf_token'] = bin2hex(random_bytes(32));
		}
	}

	// Clean session destroy
	public function destroy_session_cleanly(){
		if (session_status() === PHP_SESSION_ACTIVE) {
			$_SESSION = [];
			if (ini_get("session.use_cookies")) {
				$params = session_get_cookie_params();
				setcookie(session_name(), '', time() - 42000,
					$params["path"], $params["domain"],
					$params["secure"], $params["httponly"]
				);
			}
			@session_destroy();
		}
	}

	// Detect device type from User Agent
	public function detect_device_type($userAgent = null){
		$ua = $userAgent ?? ($_SERVER['HTTP_USER_AGENT'] ?? '');
		if (preg_match('/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i', $ua)) {
			return 'Tablet';
		}
		if (preg_match('/(iphone|ipod|blackberry|android|mobile|bb\d+|meego|opera m(ob|in)i)/i', $ua)) {
			return 'Mobile';
		}
		return 'Desktop';
	}

	// Track active user session into database (flexible arguments)
	public function track_user_session($arg1, $arg2, $arg3 = null, $arg4 = null){
		try {
			$db = new Database();
			$conn = $db->getConnection();
			if (!$conn) return false;

			if ($arg4 === null) {
				// Called as: track_user_session($identifier, $role, $fullName)
				$userId = $_SESSION['user-nip'] ?? ($_SESSION['nim_number'] ?? null);
				$identifier = $arg1;
				$role = $arg2;
				$fullName = $arg3 ?? ($identifier ?? 'User');
			} else {
				// Called as: track_user_session($userId, $identifier, $fullName, $role)
				$userId = $arg1;
				$identifier = $arg2;
				$fullName = $arg3;
				$role = $arg4;
			}

			$sessId = session_id();
			if (empty($sessId)) {
				if (session_status() === PHP_SESSION_NONE) {
					@session_start();
				}
				$sessId = session_id();
			}
			if (empty($sessId)) return false;

			$ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
			$ua = substr($_SERVER['HTTP_USER_AGENT'] ?? 'Unknown', 0, 255);
			$device = $this->detect_device_type($ua);
			$nowTs = time();

			$stmt = $conn->prepare("INSERT INTO user_sessions 
				(session_id, user_id, identifier, full_name, role, ip_address, user_agent, device_type, last_activity, is_revoked) 
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
				ON DUPLICATE KEY UPDATE 
				user_id = VALUES(user_id), identifier = VALUES(identifier), full_name = VALUES(full_name),
				role = VALUES(role), ip_address = VALUES(ip_address), user_agent = VALUES(user_agent),
				device_type = VALUES(device_type), last_activity = VALUES(last_activity), is_revoked = 0");
			if ($stmt) {
				$stmt->bind_param("ssssssssi", $sessId, $userId, $identifier, $fullName, $role, $ip, $ua, $device, $nowTs);
				return $stmt->execute();
			}
		} catch (Throwable $e) {}
		return false;
	}

	// Delete user session from database
	public function destroy_user_session_db($sessionId = null){
		try {
			if ($sessionId === null) {
				$sessionId = session_id();
			}
			if (empty($sessionId)) return false;

			$db = new Database();
			$conn = $db->getConnection();
			if (!$conn) return false;

			$stmt = $conn->prepare("DELETE FROM user_sessions WHERE session_id = ?");
			if ($stmt) {
				$stmt->bind_param("s", $sessionId);
				return $stmt->execute();
			}
		} catch (Throwable $e) {}
		return false;
	}

	// Revoke specific session by Administrator (supports session_id string or integer id)
	public function revoke_user_session_db($sessionIdOrId, $adminName = null){
		try {
			$db = new Database();
			$conn = $db->getConnection();
			if (!$conn) return false;

			$revokedBy = $adminName ?: ($_SESSION['user-name'] ?? 'Admin');
			if (is_numeric($sessionIdOrId)) {
				$stmt = $conn->prepare("UPDATE user_sessions SET is_revoked = 1, revoked_by = ? WHERE id = ?");
				if ($stmt) {
					$stmt->bind_param("si", $revokedBy, $sessionIdOrId);
					return $stmt->execute();
				}
			} else {
				$stmt = $conn->prepare("UPDATE user_sessions SET is_revoked = 1, revoked_by = ? WHERE session_id = ?");
				if ($stmt) {
					$stmt->bind_param("ss", $revokedBy, $sessionIdOrId);
					return $stmt->execute();
				}
			}
		} catch (Throwable $e) {}
		return false;
	}

	// Revoke all sessions (except current Admin session)
	public function revoke_all_user_sessions_db($currentAdminSessionId = null, $adminName = null){
		try {
			$db = new Database();
			$conn = $db->getConnection();
			if (!$conn) return false;

			$revokedBy = $adminName ?: ($_SESSION['user-name'] ?? 'Admin');
			if ($currentAdminSessionId) {
				$stmt = $conn->prepare("UPDATE user_sessions SET is_revoked = 1, revoked_by = ? WHERE session_id != ? AND is_revoked = 0");
				if ($stmt) {
					$stmt->bind_param("ss", $revokedBy, $currentAdminSessionId);
					return $stmt->execute();
				}
			} else {
				$stmt = $conn->prepare("UPDATE user_sessions SET is_revoked = 1, revoked_by = ? WHERE is_revoked = 0");
				if ($stmt) {
					$stmt->bind_param("s", $revokedBy);
					return $stmt->execute();
				}
			}
		} catch (Throwable $e) {}
		return false;
	}

	// Fetch active sessions list
	public function get_active_sessions_list(){
		try {
			$db = new Database();
			$conn = $db->getConnection();
			if (!$conn) return [];

			$idleTimeout = 900; // 15 menit
			$cutoff = time() - $idleTimeout;

			$query = "SELECT id, session_id, user_id, identifier, full_name, role, ip_address, user_agent, device_type, last_activity, is_revoked, revoked_by, created_at, updated_at 
			          FROM user_sessions 
			          WHERE is_revoked = 0 AND last_activity >= $cutoff 
			          ORDER BY last_activity DESC";
			$res = $conn->query($query);
			$sessions = [];
			if ($res) {
				while ($row = $res->fetch_assoc()) {
					$row['idle_seconds'] = time() - (int)$row['last_activity'];
					$row['idle_formatted'] = gmdate("i:s", max(0, $idleTimeout - $row['idle_seconds']));
					$sessions[] = $row;
				}
			}
			return $sessions;
		} catch (Throwable $e) {
			return [];
		}
	}

	// CSRF methods
	public function generate_csrf_token(){
		if (session_status() === PHP_SESSION_NONE) {
			$this->start_default_session_app();
		}
		if (empty($_SESSION['csrf_token'])) {
			$_SESSION['csrf_token'] = bin2hex(random_bytes(32));
		}
		return $_SESSION['csrf_token'];
	}

	public function get_csrf_token(){
		return $_SESSION['csrf_token'] ?? $this->generate_csrf_token();
	}

	public function verify_csrf_token($token = null){
		if (session_status() === PHP_SESSION_NONE) {
			$this->start_default_session_app();
		}
		$token = $token ?? ($_POST['csrf_token'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
		if (empty($token) || empty($_SESSION['csrf_token'])) {
			Security::log_incident('CSRF_TOKEN_MISSING', 'Token CSRF tidak ditemukan dalam payload POST', 'Blocked');
			return false;
		}
		$isValid = hash_equals($_SESSION['csrf_token'], $token);
		if (!$isValid) {
			Security::log_incident('CSRF_TOKEN_FORGERY', 'Token CSRF tidak cocok dengan sesi aktif', 'Blocked');
		}
		return $isValid;
	}

	// Global input sanitization
	public function sanitize_global_inputs(){
		$_GET = $this->clean_input_array($_GET);
		$_POST = $this->clean_input_array($_POST);
		$_COOKIE = $this->clean_input_array($_COOKIE);
		$_REQUEST = $this->clean_input_array($_REQUEST);
	}

	private function clean_input_array($data){
		if (is_array($data)) {
			$cleaned = [];
			foreach ($data as $k => $v) {
				$cleanK = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', (string)$k);
				$cleanK = trim($cleanK);
				$cleaned[$cleanK] = $this->clean_input_array($v);
			}
			return $cleaned;
		}
		if (is_string($data)) {
			// Strip null-byte poisoning and dangerous control chars
			$data = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $data);
			// Normalize UTF-8 byte sequences
			if (function_exists('mb_convert_encoding')) {
				$data = mb_convert_encoding($data, 'UTF-8', 'UTF-8');
			}
			return trim($data);
		}
		return $data;
	}

	// Audit Logging (supports 2, 3, or 4 arguments safely)
	public function audit_log($action, $arg2 = '', $arg3 = null, $arg4 = null){
		try {
			$db = new Database();
			$conn = $db->getConnection();
			if (!$conn) return;

			if ($arg4 !== null) {
				// Called as: audit_log($action, $targetTable, $recordId, $description)
				$targetTable = $arg2;
				$recordId = $arg3;
				$description = $arg4;
			} elseif ($arg3 !== null) {
				// Called as: audit_log($action, $description, $targetTable)
				$description = $arg2;
				$targetTable = $arg3;
				$recordId = null;
			} else {
				// Called as: audit_log($action, $description)
				$description = $arg2;
				$targetTable = 'system';
				$recordId = null;
			}

			$act = $conn->real_escape_string((string)$action);
			$tbl = $conn->real_escape_string((string)$targetTable);
			$recId = $recordId !== null ? "'" . $conn->real_escape_string((string)$recordId) . "'" : "NULL";
			$desc = $conn->real_escape_string((string)$description);
			$uId = isset($_SESSION['user-nip']) ? "'" . $conn->real_escape_string($_SESSION['user-nip']) . "'" : (isset($_SESSION['nim_number']) ? "'" . $conn->real_escape_string($_SESSION['nim_number']) . "'" : "NULL");
			$uName = isset($_SESSION['user-name']) ? "'" . $conn->real_escape_string($_SESSION['user-name']) . "'" : "NULL";
			$role = isset($_SESSION['user-role']) ? "'" . $conn->real_escape_string($_SESSION['user-role']) . "'" : "NULL";
			$ip = $conn->real_escape_string($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');

			$conn->query("INSERT INTO audit_logs (action, target_table, record_id, description, user_id, user_name, role, ip_address, created_at) 
			              VALUES ('$act', '$tbl', $recId, '$desc', $uId, $uName, $role, '$ip', NOW())");
		} catch (Throwable $e) {}
	}

	// User Login Logging (supports flexible argument signatures)
	public function log_user_login($arg1 = null, $arg2 = null, $arg3 = 'SUCCESS', $arg4 = null){
		try {
			$db = new Database();
			$conn = $db->getConnection();
			if (!$conn) return;

			if ($arg4 !== null) {
				// Called as: ($userId, $identifier, $status, $failureReason)
				$userId = $arg1;
				$identifier = $arg2;
				$status = $arg3;
				$failureReason = $arg4;
			} else {
				// Called as: ($identifier, $role, $status)
				$userId = $_SESSION['user-nip'] ?? ($_SESSION['nim_number'] ?? null);
				$identifier = $arg1;
				$status = $arg3 ?: 'SUCCESS';
				$failureReason = is_string($arg2) && !in_array(strtolower($arg2), ['admin','dosen','student','business office','staff','orangtua']) ? $arg2 : null;
			}

			$uId = $userId !== null ? "'" . $conn->real_escape_string((string)$userId) . "'" : "NULL";
			$ident = $conn->real_escape_string((string)($identifier ?? 'Guest'));
			$role = isset($_SESSION['user-role']) ? "'" . $conn->real_escape_string($_SESSION['user-role']) . "'" : "NULL";
			$ip = $conn->real_escape_string($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
			$ua = $conn->real_escape_string(substr($_SERVER['HTTP_USER_AGENT'] ?? 'Unknown', 0, 255));
			$stat = $conn->real_escape_string((string)$status);
			$reason = $failureReason !== null ? "'" . $conn->real_escape_string((string)$failureReason) . "'" : "NULL";

			$conn->query("INSERT INTO login_logs (user_id, identifier_input, role, ip_address, user_agent, status, failure_reason, created_at) 
			              VALUES ($uId, '$ident', $role, '$ip', '$ua', '$stat', $reason, NOW())");
		} catch (Throwable $e) {}
	}

	// Input sanitization
	public function sanitize($input){
		if (is_array($input)) {
			return array_map([$this, 'sanitize'], $input);
		}
		return htmlspecialchars(trim((string)$input), ENT_QUOTES, 'UTF-8');
	}

	// JSON response helper
	public function json_response($data, $status = 200){
		$this->send_security_headers();
		http_response_code($status);
		header('Content-Type: application/json; charset=utf-8');
		echo json_encode($data);
		exit();
	}

	// Enforce user authentication and RBAC roles
	public function require_authentication($allowedRoles = []){
		$this->start_default_session_app();
		if (!isset($_SESSION['user-name']) || empty($_SESSION['user-role'])) {
			header('Location: ' . APP_PATH . '/login/?auth=1');
			exit();
		}

		if (!empty($allowedRoles)) {
			$userRole = strtolower($_SESSION['user-role']);
			$allowed = array_map('strtolower', (array)$allowedRoles);
			if (!in_array($userRole, $allowed)) {
				Security::log_incident('UNAUTHORIZED_ROLE_ACCESS', "Role '$userRole' mencoba akses resource yang membutuhkan: " . implode(', ', $allowed), 'Blocked 403');
				$this->abort(403, 'Akses ditolak. Peran pengguna (' . htmlspecialchars($_SESSION['user-role'], ENT_QUOTES, 'UTF-8') . ') tidak memiliki izin untuk modul ini.');
			}
		}
	}

	// Validate request data against validation rules
	public function validate_input($data, $rules){
		$errors = [];
		$sanitized = [];

		foreach ($rules as $field => $ruleStr) {
			$val = $data[$field] ?? null;
			$ruleList = explode('|', $ruleStr);

			foreach ($ruleList as $rule) {
				$param = null;
				if (strpos($rule, ':') !== false) {
					list($rule, $param) = explode(':', $rule, 2);
				}

				if ($rule === 'required') {
					if ($val === null || $val === '') {
						$errors[$field][] = "Field '$field' wajib diisi.";
						break;
					}
				}

				if ($val !== null && $val !== '') {
					if ($rule === 'email') {
						if (!filter_var($val, FILTER_VALIDATE_EMAIL)) {
							$errors[$field][] = "Field '$field' harus berupa format email yang valid.";
						}
					} elseif ($rule === 'student_email' || $rule === 'campus_email') {
						if (!filter_var($val, FILTER_VALIDATE_EMAIL)) {
							$errors[$field][] = "Field '$field' harus berupa format email yang valid.";
						}
					} elseif ($rule === 'school_email' || $rule === 'unklab_email') {
						if (!filter_var($val, FILTER_VALIDATE_EMAIL)) {
							$errors[$field][] = "Field '$field' harus berupa email resmi institusi yang valid.";
						}
					} elseif ($rule === 'numeric') {
						if (!is_numeric($val)) {
							$errors[$field][] = "Field '$field' harus bernilai angka.";
						}
					} elseif ($rule === 'min' && $param !== null) {
						if (is_string($val) && strlen($val) < (int)$param) {
							$errors[$field][] = "Field '$field' minimal $param karakter.";
						}
					} elseif ($rule === 'max' && $param !== null) {
						if (is_string($val) && strlen($val) > (int)$param) {
							$errors[$field][] = "Field '$field' maksimal $param karakter.";
						}
					} elseif ($rule === 'in' && $param !== null) {
						$allowedVals = explode(',', strtolower($param));
						if (!in_array(strtolower((string)$val), $allowedVals)) {
							$errors[$field][] = "Nilai untuk '$field' tidak diizinkan.";
						}
					}
				}
			}

			if (is_string($val)) {
				$sanitized[$field] = $this->sanitize($val);
			} else {
				$sanitized[$field] = $val;
			}
		}

		return [
			'valid' => empty($errors),
			'errors' => $errors,
			'data' => $sanitized
		];
	}

	// Safe parameter extractors
	public function safe_get($key, $default = null, $type = 'string'){
		$val = $_GET[$key] ?? $default;
		return $this->cast_and_sanitize_param($val, $type);
	}

	public function safe_post($key, $default = null, $type = 'string'){
		$val = $_POST[$key] ?? $default;
		return $this->cast_and_sanitize_param($val, $type);
	}

	public function safe_request($key, $default = null, $type = 'string'){
		$val = $_POST[$key] ?? ($_GET[$key] ?? $default);
		return $this->cast_and_sanitize_param($val, $type);
	}

	private function cast_and_sanitize_param($val, $type){
		if ($val === null) return null;
		switch ($type) {
			case 'int':
			case 'integer':
				return is_numeric($val) ? (int)$val : 0;
			case 'float':
				return is_numeric($val) ? (float)$val : 0.0;
			case 'bool':
			case 'boolean':
				return filter_var($val, FILTER_VALIDATE_BOOLEAN);
			case 'email':
				$cleaned = filter_var(trim((string)$val), FILTER_SANITIZE_EMAIL);
				return filter_var($cleaned, FILTER_VALIDATE_EMAIL) ? strtolower($cleaned) : '';
			case 'alphanumeric':
				return preg_replace('/[^a-zA-Z0-9_\-]/', '', (string)$val);
			case 'string':
			default:
				return $this->sanitize($val);
		}
	}
}