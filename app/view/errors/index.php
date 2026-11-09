<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?php echo htmlspecialchars($data['title'] ?? ('Status ' . ($data['code'] ?? '404') . ' - ' . APP_NAME)); ?></title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
  <style>
    body {
      background-color: #f8fafc;
      color: #334155;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Plus Jakarta Sans', sans-serif;
    }
    .code-font {
      font-family: 'JetBrains Mono', monospace;
    }
    .error-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 24px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
      padding: 40px 32px;
    }
  </style>
</head>
<body class="py-5">

<div class="container text-center">
  <div class="row justify-content-center">
    <div class="col-md-8 col-lg-6 col-xl-5">

      <div class="mb-4">
        <a href="<?php echo APP_PATH; ?>/" class="d-inline-flex align-items-center gap-2 text-decoration-none">
          <div class="d-flex align-items-center justify-content-center bg-primary rounded-3 text-white shadow-sm" style="width: 44px; height: 44px;">
            <i class="bi bi-code-slash fs-4"></i>
          </div>
          <div class="text-start">
            <div class="fw-bold lh-1 text-dark" style="font-size: 1.15rem;"><?php echo htmlspecialchars(APP_NAME); ?></div>
            <div class="small text-secondary" style="font-size: 0.72rem;">Starter Kit Mahasiswa</div>
          </div>
        </a>
      </div>

      <?php
      $code = (int)($data['code'] ?? 404);
      $icon = 'bi-exclamation-circle';
      $colorClass = 'text-primary';
      $bgClass = 'bg-primary-subtle';

      if ($code === 400) {
        $icon = 'bi-shield-x';
        $colorClass = 'text-danger';
        $bgClass = 'bg-danger-subtle';
      } elseif ($code === 401 || $code === 403) {
        $icon = 'bi-lock';
        $colorClass = 'text-warning';
        $bgClass = 'bg-warning-subtle';
      } elseif ($code === 404) {
        $icon = 'bi-compass';
        $colorClass = 'text-primary';
        $bgClass = 'bg-primary-subtle';
      } elseif ($code >= 500) {
        $icon = 'bi-gear-wide-connected';
        $colorClass = 'text-danger';
        $bgClass = 'bg-danger-subtle';
      }
      ?>

      <div class="error-card">
        <div class="d-inline-flex align-items-center justify-content-center rounded-circle p-3 mb-3 <?php echo $bgClass; ?> <?php echo $colorClass; ?>" style="width: 72px; height: 72px;">
          <i class="bi <?php echo $icon; ?> fs-1"></i>
        </div>

        <div class="display-5 fw-bold text-dark code-font mb-2"><?php echo $code; ?></div>
        <h5 class="fw-bold mb-2 text-dark"><?php echo htmlspecialchars($data['status_title'] ?? "Kesalahan $code"); ?></h5>
        <p class="text-secondary small mb-4">
          <?php echo htmlspecialchars($data['message'] ?? 'Permintaan Anda tidak dapat diselesaikan oleh sistem.'); ?>
        </p>

        <?php if (!empty($data['reference_id'])): ?>
          <div class="p-2 bg-light rounded-3 mb-4 code-font small text-muted border">
            Kode Referensi: <strong><?php echo htmlspecialchars($data['reference_id']); ?></strong>
          </div>
        <?php endif; ?>

        <div class="d-flex flex-wrap justify-content-center gap-2">
          <a href="<?php echo APP_PATH; ?>/" class="btn btn-primary px-4 fw-semibold shadow-sm">
            <i class="bi bi-house me-1"></i> Ke Halaman Utama
          </a>
          <a href="javascript:history.back()" class="btn btn-outline-secondary px-4">
            <i class="bi bi-arrow-left me-1"></i> Kembali
          </a>
        </div>
      </div>

      <div class="mt-4 small text-muted">
        &copy; <?php echo date('Y'); ?> <?php echo htmlspecialchars(APP_NAME); ?> &bull; Sistem MVC PHP
      </div>

    </div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
