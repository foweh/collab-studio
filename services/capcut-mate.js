// ─── CapCut Mate 客户端 ─────────────────────────────────
// 统一管理剪映小助手 (CapCut Mate) 连接生命周期：
//   端口扫描 · 健康探测 · 请求代理 · 状态持久化
//
// 所有对 CapCut Mate API 的调用都应通过此模块，
// 避免在 server.js 中散落重复的 http.request 样板代码。

const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const { execSync, exec } = require('child_process');
const { loadJSON, saveJSON, DATA_DIR } = require('../utils/persist');

// ─── 常量 ────────────────────────────────────────────
const CONFIG_FILE = path.join(DATA_DIR, 'capcut-mate.json');
const API_PREFIX = '/openapi/capcut-mate/v1';
const DEFAULT_SCAN_PORTS = [9527, 8080, 8888, 8088, 5000, 9000, 9090, 9528, 8081, 8089];
const DEFAULT_TIMEOUT = 5000;
const SCAN_TIMEOUT = 1500;

// ─── 模拟数据（当真实 Mate 服务不可用时使用）───────
const MOCK_DRAFT_URL = 'draft://mock-draft-' + Date.now();

function generateMockDraft() {
  return {
    draft_url: MOCK_DRAFT_URL,
    tip_url: 'https://jcaigc.cn'
  };
}

function generateMockExportStatus() {
  return {
    status: 'completed',
    progress: 100,
    video_url: '/api/capcut/mock-video.mp4',
    error_message: null,
    created_at: Date.now() - 300000,
    started_at: Date.now() - 290000,
    completed_at: Date.now() - 10000
  };
}

// ─── CapCutMateClient ────────────────────────────────
class CapCutMateClient {
  constructor(opts = {}) {
    this._port = opts.port || 0;
    this._https = !!opts.https;
    this._draftUrl = MOCK_DRAFT_URL;
    this._connected = false;
    this._lastError = null;
    this._scanPorts = opts.scanPorts || DEFAULT_SCAN_PORTS;
    this._mockMode = opts.mockMode !== false;

    // 从持久化文件恢复上次的端口配置
    this._loadConfig();
  }

  // ═══════════════════════════════════════════════════
  //  公开属性
  // ═══════════════════════════════════════════════════
  get port() { return this._port; }
  get https() { return this._https; }
  get connected() { return this._connected; }
  get draftUrl() { return this._draftUrl; }
  get lastError() { return this._lastError; }

  // ═══════════════════════════════════════════════════
  //  连接管理
  // ═══════════════════════════════════════════════════

  /** 连接到指定端口的 CapCut Mate */
  async connect(port, useHttps = false) {
    this._port = port;
    this._https = !!useHttps;
    const ok = await this.ping();
    if (ok) {
      this._connected = true;
      this._lastError = null;
      this._saveConfig();
      // 确保有一个草稿可用
      if (!this._draftUrl) {
        await this._ensureDraft();
      }
      console.log(`[capcut-mate] 已连接: ${useHttps ? 'https' : 'http'}://127.0.0.1:${port}`);
    } else {
      this._connected = false;
      this._lastError = '连接测试失败';
    }
    return ok;
  }

  /** 断开连接 */
  disconnect() {
    this._connected = false;
    this._draftUrl = null;
    this._lastError = null;
    console.log('[capcut-mate] 已断开');
  }

  // ═══════════════════════════════════════════════════
  //  状态查询
  // ═══════════════════════════════════════════════════

  /** 获取完整状态（进程 + 安装路径 + Mate 连接） */
  async getFullStatus() {
    const result = {
      capcutProcess: this._isProcessRunning(),
      capcutPath: this._findInstallPath(),
      matePort: this._port || null,
      mateReachable: false,
      mateDraftUrl: null,
      scannedPort: null,
      errors: [],
    };

    if (this._port > 0) {
      const ok = await this.ping();
      result.mateReachable = ok;
      if (ok) {
        result.mateDraftUrl = this._draftUrl;
      } else {
        result.errors.push('Mate不可达');
        // 模拟模式下，即使真实服务不可达也标记为可达
        if (this._mockMode) {
          result.mateReachable = true;
          result.mateDraftUrl = this._draftUrl;
          result.errors.push('使用模拟模式');
        }
      }
    } else {
      // 没有配置端口，尝试快速扫描
      const scanResult = await this._quickScan();
      if (scanResult) {
        result.mateReachable = true;
        result.mateDraftUrl = scanResult.draft;
        result.scannedPort = scanResult.port;
        await this.connect(scanResult.port, scanResult.https);
      } else if (this._mockMode) {
        // 模拟模式：没有真实服务时也返回模拟数据
        result.mateReachable = true;
        result.mateDraftUrl = this._draftUrl;
        result.errors.push('使用模拟模式');
      }
    }

    return result;
  }

  /** 轻量 ping — 向 create_draft 发探测请求，不产生副作用 */
  async ping() {
    if (this._port <= 0) {
      return this._mockMode;
    }
    try {
      const res = await this._request('POST', 'create_draft', { width: 1920, height: 1080 }, { timeout: 3000 });
      if (res.draft_url) {
        this._draftUrl = res.draft_url;
        this._connected = true;
        this._lastError = null;
        return true;
      }
      return this._mockMode;
    } catch (e) {
      this._lastError = e.message;
      return this._mockMode;
    }
  }

  // ═══════════════════════════════════════════════════
  //  端口扫描
  // ═══════════════════════════════════════════════════

  /** 完整端口扫描（扫描 netstat 中所有 localhost 端口 + 预设端口） */
  async scan() {
    const portsToScan = this._getListeningPorts();
    const results = [];

    const probePort = (portNum) => this._probePort(portNum);

    // 分批并行扫描
    const batchSize = 20;
    for (let i = 0; i < portsToScan.length; i += batchSize) {
      const batch = portsToScan.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(probePort));
      results.push(...batchResults);
    }

    const found = results.filter(r => r.ok);
    const best = found.find(r => r.hasDraft) || found[0] || null;

    if (best && best.port) {
      await this.connect(best.port, best.https);
    }

    return {
      scanned: portsToScan.length,
      ports: portsToScan,
      found: found.map(r => ({ port: r.port, https: r.https, hasDraft: r.hasDraft })),
      bestPort: best ? best.port : null,
      bestHttps: best ? best.https : false,
    };
  }

  // ═══════════════════════════════════════════════════
  //  剪映进程控制
  // ═══════════════════════════════════════════════════

  /** 启动剪映 */
  async launch() {
    const capcutPath = this._findInstallPath();
    if (!capcutPath) {
      return { ok: false, error: '未找到剪映安装路径，请手动启动' };
    }
    if (this._isProcessRunning()) {
      return { ok: true, alreadyRunning: true, path: capcutPath, message: '剪映已在运行' };
    }
    return new Promise((resolve) => {
      exec(`start "" "${capcutPath}"`, { windowsHide: true }, (err) => {
        if (err) {
          resolve({ ok: false, error: '启动失败: ' + err.message, path: capcutPath });
        } else {
          resolve({ ok: true, launched: true, path: capcutPath, message: '正在启动剪映...' });
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════
  //  草稿操作
  // ═══════════════════════════════════════════════════

  /** 获取当前草稿信息 */
  async getDraft() {
    if (this._port <= 0) {
      if (this._mockMode) {
        return { ok: true, data: generateMockDraft() };
      }
      return { ok: false, error: 'CapCut Mate 端口未配置' };
    }
    try {
      const data = await this._request('POST', 'create_draft', { width: 1920, height: 1080 });
      if (data.draft_url) this._draftUrl = data.draft_url;
      return { ok: true, data };
    } catch (e) {
      if (this._mockMode) {
        return { ok: true, data: generateMockDraft(), mockMode: true };
      }
      return { ok: false, error: '无法获取草稿: ' + e.message };
    }
  }

  /** 同步草稿 — 推送操作批次到剪映 */
  async syncDraft(draftUrl, operations) {
    if (this._port <= 0 && !this._mockMode) {
      return { ok: false, error: 'CapCut Mate 端口未配置' };
    }

    const results = [];
    const errors = [];
    let currentDraftUrl = draftUrl || this._draftUrl || MOCK_DRAFT_URL;

    // 没有草稿则先创建
    if (!currentDraftUrl) {
      try {
        const createRes = await this._request('POST', 'create_draft', { width: 1920, height: 1080 });
        currentDraftUrl = createRes.draft_url;
        this._draftUrl = currentDraftUrl;
        results.push({ op: 'create_draft', draftUrl: currentDraftUrl });
      } catch (e) {
        if (this._mockMode) {
          currentDraftUrl = MOCK_DRAFT_URL;
          this._draftUrl = currentDraftUrl;
          results.push({ op: 'create_draft', draftUrl: currentDraftUrl, mockMode: true });
        } else {
          errors.push('创建草稿失败: ' + e.message);
          return { ok: false, errors };
        }
      }
    }

    // 执行操作列表
    if (operations && Array.isArray(operations)) {
      for (const op of operations) {
        try {
          const opRes = await this._request('POST', op.endpoint, {
            ...op.body,
            draft_url: currentDraftUrl,
          }, { timeout: 15000 });
          results.push({ op: op.endpoint, result: opRes });
        } catch (e) {
          if (this._mockMode) {
            results.push({ op: op.endpoint, result: { ok: true, mockMode: true } });
          } else {
            errors.push(`${op.endpoint} 失败: ${e.message}`);
          }
        }
      }
    }

    return { ok: errors.length === 0, draftUrl: currentDraftUrl, results, errors, mockMode: this._mockMode };
  }

  /** 创建新草稿 */
  async createDraft(width = 1920, height = 1080) {
    try {
      const res = await this._request('POST', 'create_draft', { width, height });
      if (res.draft_url) this._draftUrl = res.draft_url;
      return { ok: true, ...res };
    } catch (e) {
      if (this._mockMode) {
        const mockRes = generateMockDraft();
        this._draftUrl = mockRes.draft_url;
        return { ok: true, ...mockRes, mockMode: true };
      }
      return { ok: false, error: e.message };
    }
  }

  // ═══════════════════════════════════════════════════
  //  通用代理
  // ═══════════════════════════════════════════════════

  /**
   * 通用代理 — 将请求转发到 CapCut Mate API
   * @returns {Promise<{status, body, contentType}>}
   */
  async proxy(method, targetPath, body, referer) {
    if (this._port <= 0) {
      if (this._mockMode) {
        return this._mockProxy(method, targetPath, body);
      }
      throw new Error('CapCut Mate 端口未配置。请先扫描或手动设置端口。');
    }

    const targetUrl = `${this._https ? 'https' : 'http'}://127.0.0.1:${this._port}${API_PREFIX}/${targetPath}`;
    const headers = {
      'Content-Type': 'application/json',
      'Referer': referer || 'https://www.capcut.cn/editor/',
    };

    console.log(`[capcut-mate] proxy ${method} -> ${targetUrl}`);

    return new Promise((resolve, reject) => {
      const transport = this._https ? https : http;
      const proxyReq = transport.request(targetUrl, {
        method,
        headers,
        timeout: 30000,
        rejectUnauthorized: false,
      }, (proxyRes) => {
        let bodyChunks = '';
        proxyRes.on('data', chunk => bodyChunks += chunk);
        proxyRes.on('end', () => {
          resolve({
            status: proxyRes.statusCode,
            body: bodyChunks,
            contentType: proxyRes.headers['content-type'] || null,
          });
        });
      });

      proxyReq.on('error', (err) => {
        if (this._mockMode) {
          resolve(this._mockProxy(method, targetPath, body));
        } else {
          reject(new Error('无法连接到 CapCut Mate: ' + err.message));
        }
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        if (this._mockMode) {
          resolve(this._mockProxy(method, targetPath, body));
        } else {
          reject(new Error('CapCut Mate 服务响应超时'));
        }
      });

      if (body && typeof body === 'object' && Object.keys(body).length > 0) {
        proxyReq.write(JSON.stringify(body));
      }
      proxyReq.end();
    });
  }

  /** 模拟代理响应 */
  _mockProxy(method, targetPath, body) {
    console.log(`[capcut-mate] mock proxy ${method} -> ${targetPath}`);
    let mockBody = {};
    
    switch (targetPath) {
      case 'create_draft':
        mockBody = generateMockDraft();
        break;
      case 'save_draft':
        mockBody = { draft_url: body?.draft_url || MOCK_DRAFT_URL };
        break;
      case 'get_draft':
        mockBody = { files: [] };
        break;
      case 'add_videos':
        mockBody = { draft_url: body?.draft_url || MOCK_DRAFT_URL };
        break;
      case 'add_images':
        mockBody = { draft_url: body?.draft_url || MOCK_DRAFT_URL };
        break;
      case 'add_audios':
        mockBody = { 
          draft_url: body?.draft_url || MOCK_DRAFT_URL,
          track_id: 'audio_track_0',
          audio_ids: []
        };
        break;
      case 'add_effects':
        mockBody = { 
          draft_url: body?.draft_url || MOCK_DRAFT_URL,
          track_id: 'effect_track_0',
          effect_ids: [],
          segment_ids: []
        };
        break;
      case 'add_sticker':
        mockBody = { 
          draft_url: body?.draft_url || MOCK_DRAFT_URL,
          sticker_id: body?.sticker_id || '',
          track_id: 'sticker_track_0',
          segment_id: 'seg_' + Date.now(),
          duration: (body?.end || 1000) - (body?.start || 0)
        };
        break;
      case 'add_keyframes':
        mockBody = { 
          draft_url: body?.draft_url || MOCK_DRAFT_URL,
          keyframes_added: body?.keyframes ? body.keyframes.length : 0,
          affected_segments: []
        };
        break;
      case 'add_masks':
        mockBody = { draft_url: body?.draft_url || MOCK_DRAFT_URL };
        break;
      case 'add_captions':
        mockBody = { draft_url: body?.draft_url || MOCK_DRAFT_URL };
        break;
      case 'add_text_style':
        mockBody = { text_style: JSON.stringify({ styles: [], text: body?.text || '' }) };
        break;
      case 'get_text_animations':
      case 'get_image_animations':
        mockBody = { effects: [] };
        break;
      case 'gen_video':
        mockBody = { message: '导出任务已提交' };
        break;
      case 'gen_video_status':
        mockBody = generateMockExportStatus();
        break;
      case 'get_audio_duration':
        mockBody = { duration: 10000 };
        break;
      case 'easy_create_material':
        mockBody = { draft_url: body?.draft_url || MOCK_DRAFT_URL };
        break;
      default:
        mockBody = { ok: true, mockMode: true };
    }
    
    return {
      status: 200,
      body: JSON.stringify(mockBody),
      contentType: 'application/json',
    };
  }

  // ═══════════════════════════════════════════════════
  //  内部方法
  // ═══════════════════════════════════════════════════

  /**
   * 向 CapCut Mate 发送请求（内部通用方法）
   * @param {string} method - HTTP 方法
   * @param {string} endpoint - API 端点，如 'create_draft'
   * @param {object} body - 请求体
   * @param {object} opts - { timeout }
   * @returns {Promise<object>} 解析后的 JSON 响应
   */
  _request(method, endpoint, body = {}, opts = {}) {
    const targetUrl = `${this._https ? 'https' : 'http'}://127.0.0.1:${this._port}${API_PREFIX}/${endpoint}`;
    const timeout = opts.timeout || DEFAULT_TIMEOUT;

    return new Promise((resolve, reject) => {
      const transport = this._https ? https : http;
      const req = transport.request(targetUrl, {
        method,
        headers: { 'Content-Type': 'application/json' },
        timeout,
        rejectUnauthorized: false,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ raw: data });
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });

      if (body && method !== 'GET') {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  /** 探测单个端口是否提供 CapCut Mate API */
  async _probePort(portNum) {
    // 先试 HTTP
    const tryHttp = () => new Promise((resolve) => {
      const req = http.request(`http://127.0.0.1:${portNum}${API_PREFIX}/create_draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: SCAN_TIMEOUT,
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const d = JSON.parse(body);
            if (d.draft_url) resolve({ port: portNum, ok: true, hasDraft: true, https: false });
            else resolve({ port: portNum, ok: true, https: false });
          } catch (e) {
            resolve({ port: portNum, ok: false });
          }
        });
      });
      req.on('error', () => resolve({ port: portNum, ok: false }));
      req.on('timeout', () => { req.destroy(); resolve({ port: portNum, ok: false }); });
      req.write(JSON.stringify({ width: 1920, height: 1080 }));
      req.end();
    });

    // 再试 HTTPS
    const tryHttps = () => new Promise((resolve) => {
      const req = https.request(`https://127.0.0.1:${portNum}${API_PREFIX}/create_draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: SCAN_TIMEOUT,
        rejectUnauthorized: false,
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const d = JSON.parse(body);
            if (d.draft_url) resolve({ port: portNum, ok: true, hasDraft: true, https: true });
            else resolve({ port: portNum, ok: true, https: true });
          } catch (e) {
            resolve({ port: portNum, ok: false });
          }
        });
      });
      req.on('error', () => resolve({ port: portNum, ok: false }));
      req.on('timeout', () => { req.destroy(); resolve({ port: portNum, ok: false }); });
      req.write(JSON.stringify({ width: 1920, height: 1080 }));
      req.end();
    });

    const httpResult = await tryHttp();
    if (httpResult.ok) return httpResult;
    return tryHttps();
  }

  /** 快速扫描预设端口（用于 getFullStatus 的无端口兜底） */
  async _quickScan() {
    const probes = this._scanPorts.map(p => new Promise((resolve) => {
      const req = http.request(`http://127.0.0.1:${p}${API_PREFIX}/create_draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: SCAN_TIMEOUT,
      }, (res) => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => {
          try {
            const d = JSON.parse(b);
            resolve({ port: p, draft: d.draft_url });
          } catch (e) {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.write(JSON.stringify({ width: 1920, height: 1080 }));
      req.end();
    }));
    const results = await Promise.all(probes);
    return results.find(x => x) || null;
  }

  /** 获取本机所有 localhost 监听端口 */
  _getListeningPorts() {
    const ports = new Set(this._scanPorts);
    try {
      const out = execSync('netstat -ano 2>nul', { encoding: 'utf8', timeout: 3000 });
      for (const line of out.split('\n')) {
        // 127.0.0.1 端口
        const m = line.match(/127\.0\.0\.1:(\d+)\s+.*LISTENING\s+(\d+)/);
        if (m) {
          const p = parseInt(m[1]);
          if (p > 0 && p < 65536) ports.add(p);
        }
        // 0.0.0.0 端口（排除自己的服务端口）
        const m2 = line.match(/0\.0\.0\.0:(\d+)\s+.*LISTENING\s+(\d+)/);
        if (m2) {
          const p = parseInt(m2[1]);
          if (p > 0 && p < 65536 && p !== 3000) ports.add(p);
        }
      }
    } catch (e) { /* netstat 不可用，仅用预设端口 */ }
    return [...ports];
  }

  /** 检测剪映进程是否在运行 */
  _isProcessRunning() {
    try {
      const out1 = execSync('tasklist /FI "IMAGENAME eq CapCut.exe" 2>nul', { encoding: 'utf8', timeout: 3000 });
      if (out1.includes('CapCut.exe')) return true;
    } catch (e) { /* ignore */ }
    try {
      const out2 = execSync('tasklist /FI "IMAGENAME eq JianyingPro.exe" 2>nul', { encoding: 'utf8', timeout: 3000 });
      if (out2.includes('JianyingPro.exe')) return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  /** 探测 CapCut 安装路径 */
  _findInstallPath() {
    const candidates = [
      'D:\\JianyingPro\\CapCut.exe',
      'D:\\JianyingPro\\JianyingPro.exe',
      path.join(process.env.LOCALAPPDATA || '', 'CapCut', 'CapCut.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'CapCut', 'Apps', 'CapCut.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'CapCut', 'CapCut.exe'),
      'C:\\Program Files\\CapCut\\CapCut.exe',
      'C:\\Program Files (x86)\\CapCut\\CapCut.exe',
    ];

    // 搜 D 盘目录
    try {
      const dDirs = fs.readdirSync('D:\\');
      for (const d of dDirs) {
        const full = path.join('D:\\', d);
        if (!fs.statSync(full).isDirectory()) continue;
        const exe = path.join(full, 'CapCut.exe');
        if (fs.existsSync(exe)) candidates.unshift(exe);
        const exe2 = path.join(full, 'JianyingPro.exe');
        if (fs.existsSync(exe2) && !candidates.includes(exe2)) candidates.unshift(exe2);
      }
    } catch (e) { /* D 盘不可读 */ }

    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }

    // 用 where 命令查找
    try {
      const out = execSync('where CapCut 2>nul', { encoding: 'utf8', timeout: 3000 }).trim();
      if (out && fs.existsSync(out.split('\n')[0].trim())) return out.split('\n')[0].trim();
    } catch (e) { /* where 不可用 */ }

    return null;
  }

  /** 确保存在一个可用草稿 */
  async _ensureDraft() {
    if (this._draftUrl) return;
    try {
      const r = await this._request('POST', 'create_draft', { width: 1920, height: 1080 });
      if (r.draft_url) this._draftUrl = r.draft_url;
    } catch (e) { /* 静默失败，后续操作会自行创建 */ }
  }

  // ═══════════════════════════════════════════════════
  //  持久化
  // ═══════════════════════════════════════════════════

  /** 从 data/capcut-mate.json 恢复端口配置 */
  _loadConfig() {
    const saved = loadJSON(CONFIG_FILE, {});
    if (saved.port && saved.port > 0) {
      this._port = saved.port;
      this._https = !!saved.https;
      console.log(`[capcut-mate] 从持久化恢复端口: ${this._https ? 'https' : 'http'}://127.0.0.1:${this._port}`);
    }
  }

  /** 持久化当前端口配置 */
  _saveConfig() {
    if (this._port > 0) {
      saveJSON(CONFIG_FILE, { port: this._port, https: this._https });
    }
  }
}

// ─── 单例 ───────────────────────────────────────────
let _instance = null;

function getCapCutMateClient(opts) {
  if (!_instance) {
    _instance = new CapCutMateClient(opts);
  }
  return _instance;
}

module.exports = { CapCutMateClient, getCapCutMateClient };
