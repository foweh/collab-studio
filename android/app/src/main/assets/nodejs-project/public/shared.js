// ─── 共享前端工具函数 ──────────────────────────────────
(function() {
  if (window.CollabStudioUtils) return;

  // 浏览器指纹
  window.CollabStudioFingerprint = function() {
    let fp = localStorage.getItem('collab-fingerprint');
    if (fp) return fp;
    const c = document.createElement('canvas');
    c.width = 200; c.height = 50;
    const x = c.getContext('2d');
    x.textBaseline = 'top'; x.font = '14px Arial';
    x.fillStyle = '#f60'; x.fillRect(0, 0, 200, 50);
    x.fillStyle = '#fff'; x.fillText('CollabStudio', 10, 15);
    const raw = [
      navigator.userAgent, screen.width + 'x' + screen.height,
      navigator.language, navigator.hardwareConcurrency || '1',
      c.toDataURL().slice(100, 140), new Date().getTimezoneOffset()
    ].join('||');
    let h = 0;
    for (let i = 0; i < raw.length; i++) { h = ((h << 5) - h) + raw.charCodeAt(i); h |= 0; }
    fp = 'fp_' + Math.abs(h).toString(36);
    localStorage.setItem('collab-fingerprint', fp);
    return fp;
  };

  // HTML 转义
  window.escHtml = function(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  };
  // 短别名（向后兼容）
  window.esc = window.escHtml;

  // 短 ID 生成
  window.uid = function() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  };

  window.CollabStudioUtils = true;
})();
