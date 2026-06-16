// ─── 多机协作创作工作室 服务端 ──────────────────────────
const express = require('express');
const http = require('http');
const helmet = require('helmet');
const { Server: SocketIOServer } = require('socket.io');
const { io: SocketIOClient } = require('socket.io-client');
const { v4: uuid } = require('uuid');
const path = require('path');
const os = require('os');
const dgram = require('dgram');
const fs = require('fs');

const { ensureDataDir, loadJSON, saveJSON, DATA_DIR } = require('./utils/persist');
const { checkRateLimit } = require('./utils/ratelimit');
const auth = require('./services/auth');
const projectSvc = require('./services/project');
const logger = require('./services/logger');
const annotationSvc = require('./services/annotation');
const { users } = auth; // 直接引用 users 对象以兼容现有代码

// ─── 文件路径 ────────────────────────────────────────────
ensureDataDir();
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const FENJING_FILE = path.join(DATA_DIR, 'fenjing-state.json');
const PWD_RESETS_FILE = path.join(DATA_DIR, 'password-resets.json');
const MSG_PERM_FILE = path.join(DATA_DIR, 'message-permissions.json');
const ANNOTATIONS_FILE = path.join(DATA_DIR, 'annotations.json');
const LOG_FILE = path.join(DATA_DIR, 'operation-log.json');

// ─── 配置 & CLI ─────────────────────────────────────────
// 读取管理员配置文件
function loadAdminConfig() {
  const adminEnvPath = path.join(__dirname, '.admin.env');
  if (fs.existsSync(adminEnvPath)) {
    try {
      const content = fs.readFileSync(adminEnvPath, 'utf8');
      const config = {};
      content.split('\n').forEach(line => {
        const match = line.match(/^(\w+)=(.+)$/);
        if (match) {
          config[match[1]] = match[2];
        }
      });
      return config;
    } catch(e) {
      console.warn('[config] Failed to load admin config:', e);
    }
  }
  return {};
}

const adminConfig = loadAdminConfig();
const ADMIN_USERNAME = adminConfig.ADMIN_USERNAME || '热合曼';
const ADMIN_PASSWORD = adminConfig.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || null;
let HTTP_PORT = parseInt(process.env.PORT) || 3000;
const UDP_PORT = 41234;
const SCAN_DURATION = 5 * 60 * 1000;

const args = process.argv.slice(2);
let JOIN_TARGET = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port'  && args[i+1]) { HTTP_PORT = parseInt(args[i+1]); i++; }
  if (args[i] === '--join'  && args[i+1]) { JOIN_TARGET = args[i+1]; i++; }
}

const SERVER_ID = uuid().slice(0, 8);
let SERVER_NAME = os.hostname();

const projects = projectSvc.projects; // 引用 projectSvc 的项目数组
// 初始化管理员账户（从配置文件读取）
auth.initAdmin(ADMIN_PASSWORD, ADMIN_USERNAME);
// 操作历史（用于撤回/恢复），每个项目一个数组
const projectOps = new Map(); // projectId → [{ userId, action, before, after, timestamp }]
const projectRedoOps = new Map(); // projectId → [{ userId, action, before, after, timestamp }]

function pushProjectOp(projectId, userId, action, before, after) {
  if (!projectOps.has(projectId)) projectOps.set(projectId, []);
  const ops = projectOps.get(projectId);
  ops.push({ userId, action, before, after, timestamp: Date.now() });
  if (ops.length > 200) ops.splice(0, ops.length - 200);
  // 清空 redo 栈（新操作产生后之前的 redo 失效）
  projectRedoOps.delete(projectId);
}

let passwordResets = loadJSON(PWD_RESETS_FILE, []);
let pwdResetId = passwordResets.length > 0 ? Math.max(...passwordResets.map(r => r.id || 0)) : 0;
function savePasswordResets() { saveJSON(PWD_RESETS_FILE, passwordResets); }

// ─── 消息权限 ──────────────────────────────────────────
let messagePermissions = loadJSON(MSG_PERM_FILE, {});
function saveMsgPermissions() { saveJSON(MSG_PERM_FILE, messagePermissions); }

// ─── 分镜状态 ──────────────────────────────────────────
function loadFenjingState() { return loadJSON(FENJING_FILE, null); }
function saveFenjingState(state) { saveJSON(FENJING_FILE, state); }

// ─── 批注存储 ────────────────────────────────────────────
let annotations = loadJSON(ANNOTATIONS_FILE, []);
function saveAnnotations() { saveJSON(ANNOTATIONS_FILE, annotations); }

// ─── 聊天历史存储（持久化）───────────────────────────────
const CHAT_HISTORY_FILE = path.join(DATA_DIR, 'chat-history.json');
let chatHistory = loadJSON(CHAT_HISTORY_FILE, {}); // { conversationKey: [{ from, text, time }] }
function saveChatHistory() { saveJSON(CHAT_HISTORY_FILE, chatHistory); }
function getChatKey(userA, userB) {
  return [userA, userB].sort().join(':');
}

// ─── 对等节点 ────────────────────────────────────────────
const peers = new Map(); // serverId → { socket, name, ip, port, connected, note }

// ─── 扫描状态 ────────────────────────────────────────────
let scanState = 'idle';
let scanTimer = null;
let scanInterval = null;

function startScan() {
  scanState = 'scanning';
  io.emit('scan-state', { state: scanState });
  scanTimer = setTimeout(() => {
    if (peers.size === 0) {
      scanState = 'nobody';
      io.emit('scan-state', { state: scanState });
      if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
      console.log('[扫描] 5分钟结束，未发现设备');
    }
  }, SCAN_DURATION);
}

function stopScan() {
  if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
  if (scanState === 'scanning') scanState = 'idle';
  io.emit('scan-state', { state: scanState });
}

function foundPeer() {
  if (scanState === 'scanning') {
    scanState = 'found';
    if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
    io.emit('scan-state', { state: scanState });
    console.log('[扫描] 发现设备');
  }
}

// ─── 在线用户追踪 ────────────────────────────────────────
const onlineUsers = new Map(); // socket.id → { name, joinedAt, isAdmin, fingerprint }

function broadcastOnlineUsers() {
  const list = [];
  for (const [sid, u] of onlineUsers) {
    const userObj = users[u.name];
    list.push({ id: sid, name: u.name, joinedAt: u.joinedAt, isAdmin: u.isAdmin || false, role: userObj?.role || (u.isAdmin ? 'editor' : 'commenter'), avatar: userObj?.avatar || '' });
  }
  io.emit('online-users', list);
}

// ─── 操作审计日志 ────────────────────────────────────────
const operationLog = [];
const MAX_LOG = 500;
let logId = 0;

function loadOperationLog() {
  const data = loadJSON(LOG_FILE, []);
  if (Array.isArray(data)) {
    data.forEach(e => { if (e.id > logId) logId = e.id; });
    return data;
  }
  return [];
}

function appendOperationLog(entry) {
  let log = loadJSON(LOG_FILE, []);
  log.push(entry);
  if (log.length > MAX_LOG) log = log.slice(log.length - MAX_LOG);
  saveJSON(LOG_FILE, log);
}

const savedLogs = loadOperationLog();
savedLogs.forEach(e => operationLog.push(e));

function addLog(userId, userName, action, module, target) {
  const entry = {
    id: ++logId,
    userId: userId || 'system',
    userName: userName || '系统',
    action, module: module || '', target: target || '',
    timestamp: Date.now(),
  };
  operationLog.push(entry);
  if (operationLog.length > MAX_LOG) operationLog.splice(0, 100);
  appendOperationLog(entry);
  io.emit('operation-log', entry);
  return entry;
}

function getRecentLogs(count = 50) { return operationLog.slice(-count); }

// ─── 消息去重 ────────────────────────────────────────────
const seenMessages = new Map();
function isDuplicate(msgId) {
  if (!msgId) return false;
  if (seenMessages.has(msgId)) return true;
  seenMessages.set(msgId, Date.now());
  return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of seenMessages) if (now - ts > 30000) seenMessages.delete(id);
}, 60000);

// ─── Express + Socket.IO ─────────────────────────────────
const app = express();
app.use(helmet({
  contentSecurityPolicy: false, // Socket.IO needs inline scripts
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));
app.use(express.json({ limit: '3mb' }));
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: false,
  maxHttpBufferSize: 10 * 1024 * 1024,
});

// 注册日志服务的 IO 引用，使其可以广播日志事件
logger.setIO(io);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ─── 头像上传（必须在静态文件之前） ──────────────────
app.post('/api/upload-avatar', async (req, res) => {
  try {
    const { name, imageData } = req.body;
    if (!name || !validateString(name, 50) || !imageData) return res.json({ error: '缺少参数' });
    if (!users[name]) return res.json({ error: '用户不存在' });
    if (!checkRateLimit(`avatar:${name}`, 5, 86400000)) {
      return res.json({ error: '头像修改过于频繁，每天最多5次' });
    }
    const matches = imageData.match(/^data:image\/(png|jpg|jpeg|gif);base64,(.+)$/);
    if (!matches) return res.json({ error: '不支持的图片格式，仅支持 png/jpg/gif' });
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    if (buffer.length > 2 * 1024 * 1024) return res.json({ error: '图片过大，最大2MB' });
    const safeName = name.replace(/[^a-zA-Z0-9_\u4e00-\u9fff]/g, '_');
    const filename = `avatar_${safeName}_${Date.now()}.${ext}`;
    const filepath = path.join(__dirname, 'public', 'avatars', filename);
    if (!filepath.startsWith(path.join(__dirname, 'public', 'avatars'))) {
      return res.json({ error: '文件名无效' });
    }
    require('fs').writeFileSync(filepath, buffer);
    users[name].avatar = filename;
    auth.saveUsers();
    // 广播头像变更给所有在线客户端
    io.emit('user-avatar-updated', { name, avatar: filename });
    console.log(`[头像] ${name} 上传头像: ${filename}`);
    res.json({ ok: true, url: `/avatars/${filename}` });
  } catch (e) {
    console.error('[头像] 上传失败:', e);
    res.json({ error: '上传失败: ' + e.message });
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/fenjing', express.static(path.join(__dirname, 'public/fenjing')));

// ─── 登录诊断端点 ────────────────────────────────────────
app.get('/api/auth-check', async (req, res) => {
  const { name, pwd } = req.query;
  const result = { ok: false, checks: {} };
  if (!name) return res.json({ ...result, error: '缺少 name 参数' });

  const userName = (name || '').trim();
  const user = users[userName];

  result.checks.userExists = !!user;
  result.checks.isAdmin = user ? user.isAdmin : false;
  result.checks.isBanned = user ? user.isBanned : false;
  result.checks.fingerprint = user ? user.fingerprint : null;
  result.checks.hasHash = user ? !!(user.passwordHash || user.password) : false;
  result.checks.hashField = user ? (user.passwordHash || user.password || '').slice(0, 20) + '...' : null;

  if (user && pwd) {
    try {
      result.checks.passwordMatch = await auth.validatePassword(userName, pwd);
    } catch (e) {
      result.checks.passwordMatch = false;
      result.checks.error = e.message;
    }
  }
  result.ok = !!(user && !user.isBanned && (!pwd || result.checks.passwordMatch));
  res.json(result);
});

// ─── 白板前端（Vue 3 新前端） ────────────────────────────
const STUDIO_VUE_DIST = path.join(__dirname, '..', 'studio-vue', 'dist');
app.use('/studio', express.static(STUDIO_VUE_DIST));
app.get('/studio/*', (req, res) => {
  res.sendFile(path.join(STUDIO_VUE_DIST, 'index.html'));
});

// ─── 分镜工具（fenjing-local） ──────────────────────────
const FENJING_LOCAL_DIST = path.join(__dirname, '..', 'fenjing-local', 'dist');
app.use('/storyboard', express.static(FENJING_LOCAL_DIST));
app.get('/storyboard/*', (req, res) => {
  res.sendFile(path.join(FENJING_LOCAL_DIST, 'index.html'));
});

let broadcastDiscover = () => {};
if (!JOIN_TARGET) {
  const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  udp.on('error', (err) => { console.error('[UDP] 发现服务异常:', err.message); });
  udp.on('message', (msg, rinfo) => {
    try {
      const pkt = JSON.parse(msg.toString());
      if (pkt.type === 'discover') {
        udp.send(JSON.stringify({ type: 'hello', serverId: SERVER_ID, name: SERVER_NAME, port: HTTP_PORT }),
          rinfo.port, rinfo.address);
      } else if (pkt.type === 'hello' && pkt.serverId !== SERVER_ID && !peers.has(pkt.serverId)) {
        console.log(`[发现] ${pkt.name} @ ${rinfo.address}:${pkt.port}`);
        if (SERVER_ID < pkt.serverId)
          connectToPeer(pkt.serverId, pkt.name, rinfo.address, pkt.port);
        else
          console.log('  → 等待对方连接');
      }
    } catch (_) { console.error('[UDP] 发现消息解析异常'); }
  });
  udp.bind(UDP_PORT, () => { udp.setBroadcast(true); console.log('[UDP] 发现服务已启动'); });
  broadcastDiscover = () => {
    udp.send(JSON.stringify({ type: 'discover', serverId: SERVER_ID, name: SERVER_NAME, port: HTTP_PORT }),
      UDP_PORT, '255.255.255.255');
  };
  setInterval(broadcastDiscover, 5000);
  setTimeout(broadcastDiscover, 1000);
} else {
  console.log(`[测试] --join 模式：将自动连接 ${JOIN_TARGET}`);
}

// ─── 5分钟重连守护 ───────────────────────────────────────
const RECONNECT_TIMEOUT = 5 * 60 * 1000;

function handlePeerDisconnect(serverId) {
  const p = peers.get(serverId);
  if (!p) return;
  console.log(`[桥接] ${p.name} 断开，${RECONNECT_TIMEOUT/60000}分钟内重连有效...`);
  p.connected = false;
  p.socket = null;
  broadcastPeers();
  p.reconnectTimer = setTimeout(() => {
    console.log(`[桥接] ${p.name} 重连超时，已移除`);
    peers.delete(serverId);
    broadcastPeers();
  }, RECONNECT_TIMEOUT);
}

// ─── 桥接：处理入站桥接连接 ────────────────────────────
function setupBridge(bridgeSocket, remoteIp, isIncoming) {
  let done = false;
  bridgeSocket.on('handshake', (data) => {
    if (done || data.serverId === SERVER_ID) return;
    done = true;

    if (peers.has(data.serverId)) {
      const ex = peers.get(data.serverId);
      if (ex.connected) { bridgeSocket.disconnect(); return; }
      console.log(`[桥接] ${data.name} 重新连接`);
      clearTimeout(ex.reconnectTimer);
      ex.socket = bridgeSocket; ex.connected = true; ex.name = data.name; ex.reconnectTimer = null;
      broadcastPeers();
      bridgeSocket.emit('handshake-ack', { serverId: SERVER_ID, name: SERVER_NAME, port: HTTP_PORT });
      sendToPeer(data.serverId, { type: 'projects-sync', projects: projects.map(x => ({...x})) });
      bridgeSocket.on('bridge-msg', (msg) => handleBridgeMessage(data.serverId, msg));
      bridgeSocket.on('disconnect', () => handlePeerDisconnect(data.serverId));
      return;
    }

    const p = { socket: bridgeSocket, name: data.name, ip: remoteIp, port: data.port, connected: true, note: '', reconnectTimer: null };
    peers.set(data.serverId, p);
    console.log(`[桥接] ${isIncoming ? '接受' : '连接'} ${data.name}`);
    foundPeer();
    bridgeSocket.emit('handshake-ack', { serverId: SERVER_ID, name: SERVER_NAME, port: HTTP_PORT });
    sendToPeer(data.serverId, { type: 'projects-sync', projects: projects.map(x => ({...x})) });
    broadcastPeers();
    bridgeSocket.on('bridge-msg', (msg) => handleBridgeMessage(data.serverId, msg));
    bridgeSocket.on('disconnect', () => handlePeerDisconnect(data.serverId));
  });
}

// ─── 输入验证工具 ──────────────────────────────────────
const VALID_TYPES = ['script', 'mindmap', 'story', 'storyboard', 'folder', 'project'];
const VALID_VISIBILITY = ['private', 'public-read', 'public-edit'];
const VALID_STATUS = ['open', 'resolved', 'rejected', 'pending'];
const VALID_ITEM_TYPES = ['script', 'mindmap', 'story', 'storyboard', 'custom']; // 允许自定义类型
const MAX_STR_LEN = 5000;
const MAX_NAME_LEN = 50;

function validateString(v, maxLen = MAX_STR_LEN) {
  return typeof v === 'string' && v.length <= maxLen;
}

function validateId(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= 100 && /^[a-zA-Z0-9_-]+$/.test(v);
}

function sanitizeString(v, maxLen = MAX_STR_LEN) {
  if (typeof v !== 'string') return '';
  return v.slice(0, maxLen);
}

function validateEventPayload(eventName, data) {
  // 特殊处理：project-delete 支持字符串ID格式
  if (eventName === 'project-delete' && typeof data === 'string') {
    return { valid: validateId(data) };
  }
  
  if (!data || typeof data !== 'object') return { valid: false, error: '无效的请求数据' };
  
  switch (eventName) {
    case 'join':
      if (!validateString(data.name, MAX_NAME_LEN) || !data.name.trim()) 
        return { valid: false, error: '用户名无效' };
      if (data.token && !validateString(data.token, 100))
        return { valid: false, error: '令牌无效' };
      if (data.password && !validateString(data.password, 100))
        return { valid: false, error: '密码无效' };
      return { valid: true };
    
    case 'project-create':
      if (!validateString(data.name, MAX_NAME_LEN))
        return { valid: false, error: '项目名称无效' };
      if (!VALID_TYPES.includes(data.type))
        return { valid: false, error: '项目类型无效' };
      return { valid: true };
    
    case 'project-update':
      if (!validateId(data.id))
        return { valid: false, error: '项目ID无效' };
      return { valid: true };
    
    case 'project-add-item':
    case 'project-remove-item':
      if (!validateId(data.projectId))
        return { valid: false, error: '项目ID无效' };
      if (eventName === 'project-add-item' && !VALID_ITEM_TYPES.includes(data.itemType))
        return { valid: false, error: '子项类型无效' };
      return { valid: true };
    
    case 'project-set-visibility':
      if (!validateId(data.projectId))
        return { valid: false, error: '项目ID无效' };
      if (!VALID_VISIBILITY.includes(data.visibility))
        return { valid: false, error: '可见性值无效' };
      return { valid: true };
    
    case 'project-undo':
    case 'project-redo':
      if (!validateId(data.projectId))
        return { valid: false, error: '项目ID无效' };
      return { valid: true };
    
    case 'annotation-create':
      if (!validateId(data.documentId))
        return { valid: false, error: '文档ID无效' };
      if (!data.content || !validateString(data.content.text, 1000))
        return { valid: false, error: '批注内容无效' };
      return { valid: true };
    
    case 'annotation-reply':
      if (!validateId(data.annotationId))
        return { valid: false, error: '批注ID无效' };
      if (!validateString(data.text, 500))
        return { valid: false, error: '回复内容无效' };
      return { valid: true };
    
    case 'annotation-update-status':
      if (!validateId(data.annotationId))
        return { valid: false, error: '批注ID无效' };
      if (!VALID_STATUS.includes(data.status))
        return { valid: false, error: '状态值无效' };
      return { valid: true };
    
    case 'annotation-delete':
      if (!validateId(data.annotationId))
        return { valid: false, error: '批注ID无效' };
      return { valid: true };
    
    case 'user-message-to-user':
    case 'chat-send':
      if (!validateString(data.target, MAX_NAME_LEN) || !data.target.trim())
        return { valid: false, error: '目标用户无效' };
      if (!validateString(data.text, 500))
        return { valid: false, error: '消息内容无效' };
      return { valid: true };
    
    case 'user-message-to-admin':
      if (!validateString(data, 500))
        return { valid: false, error: '消息内容无效' };
      return { valid: true };
    
    case 'admin-set-role':
      if (!validateString(data.userName, MAX_NAME_LEN))
        return { valid: false, error: '用户名无效' };
      if (!['viewer', 'commenter', 'editor'].includes(data.role))
        return { valid: false, error: '角色值无效' };
      return { valid: true };
    
    case 'admin-ban-user':
    case 'admin-unban-user':
      if (!validateString(data.userName, MAX_NAME_LEN))
        return { valid: false, error: '用户名无效' };
      return { valid: true };
    
    default:
      return { valid: true };
  }
}

io.on('connection', (socket) => {
  if (socket.handshake.query && socket.handshake.query.bridge === 'true') {
    const rip = (socket.handshake.address || '').replace(/^::ffff:/, '');
    console.log(`[桥接] 收到桥接连接 ${socket.id} 来自 ${rip}`);
    setupBridge(socket, rip, true);
    return;
  }

  console.log(`[浏览器] ${socket.id}`);
  const peerList = [];
  for (const [sid, p] of peers) if (p.connected) peerList.push({ serverId: sid, name: p.name, ip: p.ip, port: p.port, connected: true, note: p.note || '' });
  const userList = [];
  for (const [sid, u] of onlineUsers) {
    const userObj = users[u.name];
    userList.push({ id: sid, name: u.name, joinedAt: u.joinedAt, isAdmin: u.isAdmin || false, role: userObj?.role || (u.isAdmin ? 'editor' : 'commenter') });
  }
  socket.emit('init', {
    serverId: SERVER_ID, serverName: SERVER_NAME,
    projects: projects.map(p => ({...p})), peers: peerList,
    scanState, onlineUsers: userList,
    operationLog: getRecentLogs(50),
  });

  // ── 认证 ──
  socket.on('join', async ({ name, password, fingerprint, token }) => {
    const userName = (name || '').trim();
    if (!userName) return;
    const ip = (socket.handshake.address || '').replace(/^::ffff:/, '');
    console.log(`[login] 尝试登录: 用户名="${userName}" IP=${ip} token=${token ? '有' : '无'} fingerprint=${fingerprint ? '有' : '无'}`);
    // 管理员豁免频率限制
    const isAdminUser = users[userName]?.isAdmin || false;
    if (!isAdminUser && !checkRateLimit(`login:${ip}`, 20, 60000)) {
      console.log(`[login] 失败: 登录频繁 IP=${ip}`);
      socket.emit('login-error', '登录尝试过于频繁，请稍后再试');
      socket.disconnect();
      return;
    }
    // 针对特定用户的暴力破解防护：每分钟5次
    if (!isAdminUser && !checkRateLimit(`loginUser:${userName}`, 5, 60000)) {
      console.log(`[login] 失败: 用户 "${userName}" 登录频繁`);
      socket.emit('login-error', '该账户登录尝试过于频繁，请稍后再试');
      socket.disconnect();
      return;
    }
    // 指纹级别限制：每分钟3次（比IP更严格，指纹是设备唯一标识）
    if (!isAdminUser && fingerprint && !checkRateLimit(`loginFp:${fingerprint}`, 3, 60000)) {
      console.log(`[login] 失败: 指纹登录频繁 fingerprint=${fingerprint.slice(0, 12)}...`);
      socket.emit('login-error', '登录尝试过于频繁，请稍后再试');
      socket.disconnect();
      return;
    }

    // 如果携带 token，优先验证 token
    if (token) {
      const tokenUser = auth.validateSessionToken(token);
      if (tokenUser === userName) {
        console.log(`[login] 成功: token 验证通过 用户="${userName}"`);
        socket.userName = userName;
        socket.isAdmin = users[userName]?.isAdmin || false;
        auth.updateLastSeen(userName);
        onlineUsers.set(socket.id, { name: userName, joinedAt: Date.now(), isAdmin: socket.isAdmin, fingerprint: fingerprint || '' });
        broadcastOnlineUsers();
        addLog(socket.id, userName, 'reconnected', 'system', '');
        socket.emit('login-success', { userName, isAdmin: socket.isAdmin, hasPassword: !!users[userName]?.passwordHash, token, avatar: users[userName]?.avatar || '' });
        return;
      }
      console.log(`[login] token 无效，回退到密码验证`);
      // token 无效 → 回退到密码验证
    }
    if (fingerprint && auth.isFingerprintBanned(fingerprint)) {
      console.log(`[login] 失败: 指纹被封 fingerprint=${fingerprint}`);
      socket.emit('login-error', '你的设备已被拉黑，无法进入');
      socket.disconnect();
      return;
    }
    if (auth.isNameBanned(userName)) {
      console.log(`[login] 失败: 用户名被封 userName="${userName}"`);
      socket.emit('login-error', '该用户已被拉黑');
      socket.disconnect();
      return;
    }

    socket.userName = userName;
    let isAdmin = false;

    if (users[userName] && users[userName].isAdmin) {
      console.log(`[login] 管理员用户 "${userName}" 正在验证密码...`);
      if (await auth.validatePassword(userName, password || '')) {
        isAdmin = true;
        console.log(`[login] 成功: 管理员 "${userName}" 密码验证通过`);
      } else {
        console.log(`[login] 失败: 管理员 "${userName}" 密码错误`);
        socket.emit('login-error', '管理员密码错误');
        return;
      }
    } else {
      console.log(`[login] 普通用户 "${userName}" 登录流程`);
      if (users[userName]) {
        const record = users[userName];
        if (record.passwordHash) {
          if (!(await auth.validatePassword(userName, password || ''))) {
            console.log(`[login] 失败: 用户 "${userName}" 密码错误`);
            socket.emit('login-error', '密码错误，请重试');
            return;
          }
          console.log(`[login] 用户 "${userName}" 密码验证通过`);
        } else if (password) {
          record.passwordHash = await auth.hashPwd(password);
          console.log(`[login] 用户 "${userName}" 首次设置密码`);
        }
      } else {
        // 新用户注册频率限制：每IP每小时最多10次
        const ip = socket.handshake?.address || 'unknown';
        if (!checkRateLimit(`register:${ip}`, 10, 3600000)) {
          console.log(`[login] 拒绝: 注册过于频繁 IP=${ip}`);
          socket.emit('login-error', '注册过于频繁，请稍后再试');
          return;
        }
        console.log(`[login] 新用户 "${userName}" 自动注册`);
        users[userName] = {
          passwordHash: password ? await auth.hashPwd(password) : '',
          isAdmin: false, fingerprint: '', isBanned: false,
          role: 'editor',
          lastSeen: 0,
          avatar: ''
        };
      }
    }
    if (fingerprint) users[userName].fingerprint = fingerprint;
    auth.saveUsers();

    socket.isAdmin = isAdmin;
    onlineUsers.set(socket.id, { name: userName, joinedAt: Date.now(), isAdmin, fingerprint: fingerprint || '' });
    auth.updateLastSeen(userName);
    broadcastOnlineUsers();
    addLog(socket.id, userName, 'joined', 'system', '');
    socket.emit('login-success', { userName, isAdmin, hasPassword: !!users[userName]?.passwordHash, role: isAdmin ? 'editor' : (users[userName]?.role || 'commenter'), avatar: users[userName]?.avatar || '', token: auth.generateSessionToken(userName) });
  });

  socket.on('set-server-name', (name) => {
    if (!validateString(name, 50) || !name.trim()) return;
    if (!checkRateLimit(`serverRename:${socket.id}`, 1, 600000)) return;
    SERVER_NAME = name.trim(); socket.userName = SERVER_NAME; broadcastDiscover();
    for (const [sid, p] of peers) {
      if (p && p.socket) p.socket.emit('bridge-msg', { type: 'peer-rename', serverId: SERVER_ID, name: SERVER_NAME });
    }
  });
  socket.on('lan-toggle', (on) => {
    if (on && scanState === 'idle') { startScan(); broadcastDiscover(); scanInterval = setInterval(broadcastDiscover, 5000); }
    else if (!on) stopScan();
  });
  socket.on('refresh-lan', () => {
    if (scanState === 'nobody' || scanState === 'idle') { startScan(); broadcastDiscover(); scanInterval = setInterval(broadcastDiscover, 5000); }
    else broadcastDiscover();
  });
  socket.on('peer-note', ({ serverId, note }) => {
    if (!validateString(serverId, 50)) return;
    if (note && !validateString(note, 200)) return;
    if (peers.has(serverId)) { peers.get(serverId).note = note || ''; broadcastPeers(); }
  });

  // ── 项目管理 ──
  socket.on('project-create', (data) => {
    console.log('收到 project-create 请求:', data);
    if (!validateEventPayload('project-create', data).valid) {
      console.log('验证失败');
      return;
    }
    const name = data.name || '未命名';
    
    // 重名检查：同文件夹同类型项目不允许重名
    const isDuplicate = projects.some(p => 
      p.name === name && 
      !p.deleted && 
      p.type === data.type && 
      p.parentId === (data.parentId || undefined)
    );
    
    if (isDuplicate) {
      console.log('重名检查失败:', name);
      socket.emit('project-update-error', '项目名称已存在');
      return;
    }
    
    const p = { 
      id: uuid().slice(0, 12), 
      type: data.type, 
      name, 
      data: data.data != null && typeof data.data === 'object' && Object.keys(data.data).length > 0
        ? data.data
        : projectSvc.getDefaultData(data.type), 
      createdAt: Date.now(), 
      updatedAt: Date.now(), 
      owner: socket.userName || SERVER_NAME, 
      visibility: 'private',
      parentId: data.parentId || undefined
    };
    projects.push(p); 
    console.log('项目创建成功:', p);
    socket.emit('project-created', p);
    addLog(socket.id, socket.userName || SERVER_NAME, 'created', p.type, p.name);
    broadcastToPeers({ type: 'projects-sync', projects: projects.map(x => ({...x})) }, null);
    projectSvc.saveProjects();
  });
  socket.on('project-add-item', ({ projectId, itemType, itemName, customTypeName }) => {
    const p = projects.find(x => x.id === projectId);
    if (!p) return;
    if (!projectSvc.canEditProject(socket.userName, p, auth)) { socket.emit('project-update-error', '你没有编辑权限'); return; }
    // 允许任意类型，支持自定义类型
    const finalItemType = itemType === 'custom' ? (customTypeName || 'custom') : itemType;
    if (!p.data.items) p.data.items = [];
    const name = itemName || projectSvc.getDefaultItemName(finalItemType);
    // 同名检查：同一容器内同类型不能重名
    if (p.data.items.some(it => it.type === finalItemType && it.name === name)) {
      socket.emit('project-update-error', `${projectSvc.getItemTypeLabel(finalItemType)}「${name}」已存在`);
      return;
    }
    const item = {
      id: uuid().slice(0, 12),
      type: finalItemType,
      name: name,
      data: JSON.parse(JSON.stringify(projectSvc.getDefaultData(finalItemType))),
    };
    p.data.items.push(item);
    p.updatedAt = Date.now();
    projectSvc.saveProjects();
    io.emit('project-item-added', { projectId, item });
    addLog(socket.id, socket.userName, 'added item', p.type, p.name + ' → ' + item.name);
  });
  socket.on('project-remove-item', ({ projectId, itemId }) => {
    const p = projects.find(x => x.id === projectId);
    if (!p || !p.data.items) return;
    if (!projectSvc.canEditProject(socket.userName, p, auth)) { socket.emit('project-update-error', '你没有编辑权限'); return; }
    p.data.items = p.data.items.filter(it => it.id !== itemId);
    p.updatedAt = Date.now();
    projectSvc.saveProjects();
    io.emit('project-item-removed', { projectId, itemId });
    addLog(socket.id, socket.userName, 'removed item', p.type, p.name);
  });
  socket.on('project-create-batch', (data) => {
    if (!socket.userName) return;
    const { name, children } = data;
    if (!validateString(name, 50) || !name.trim()) return;
    const folder = { id: uuid().slice(0, 12), type: 'folder', name, data: { children: [] }, createdAt: Date.now(), updatedAt: Date.now(), owner: socket.userName || SERVER_NAME };
    projects.push(folder);
    socket.emit('project-created', folder);
    addLog(socket.id, socket.userName || SERVER_NAME, 'created', 'folder', folder.name);
    const created = [folder];
    (children || []).forEach(c => {
      const child = { id: uuid().slice(0, 12), type: c.type, name: c.name || '未命名', data: projectSvc.getDefaultData(c.type), createdAt: Date.now(), updatedAt: Date.now(), owner: socket.userName || SERVER_NAME, parentId: folder.id };
      projects.push(child);
      socket.emit('project-created', child);
      created.push(child);
      folder.data.children.push(child.id);
    });
    broadcastToPeers({ type: 'projects-sync', projects: projects.map(x => ({...x})) }, null);
    projectSvc.saveProjects();
  });

  // ── 重命名项目 ──
  socket.on('project-rename', ({ id, name }) => {
    if (!validateString(name, 50) || !name.trim()) { socket.emit('project-update-error', '名称无效'); return; }
    const p = projects.find(x => x.id === id);
    if (!p) return;
    if (!projectSvc.canEditProject(socket.userName, p, auth)) { socket.emit('project-update-error', '你没有修改权限'); return; }
    if (projects.some(x => x.name === name && x.id !== id && !x.deleted && x.type !== 'folder')) {
      socket.emit('project-update-error', '项目名称已存在');
      return;
    }
    p.name = name.trim();
    p.updatedAt = Date.now();
    projectSvc.saveProjects();
    io.emit('project-updated', { id: p.id, name: p.name, data: p.data, updatedAt: p.updatedAt });
    addLog(socket.id, socket.userName, 'renamed', p.type, name);
  });

  // ── 重命名子项 ──
  socket.on('project-item-rename', ({ projectId, itemId, name }) => {
    if (!validateString(name, 50) || !name.trim()) { socket.emit('project-update-error', '名称无效'); return; }
    const p = projects.find(x => x.id === projectId);
    if (!p || !p.data.items) return;
    if (!projectSvc.canEditProject(socket.userName, p, auth)) { socket.emit('project-update-error', '你没有修改权限'); return; }
    const item = p.data.items.find(it => it.id === itemId);
    if (!item) return;
    if (p.data.items.some(it => it.type === item.type && it.name === name && it.id !== itemId)) {
      socket.emit('project-update-error', `该${projectSvc.getItemTypeLabel(item.type)}名称已存在`);
      return;
    }
    item.name = name.trim();
    p.updatedAt = Date.now();
    projectSvc.saveProjects();
    io.emit('project-item-added', { projectId, item });
    addLog(socket.id, socket.userName, 'renamed item', p.type, name);
  });

  socket.on('project-update', (data) => {
    if (!validateEventPayload('project-update', data).valid) return;
    const p = projects.find(x => x.id === data.id); if (!p) return;
    if (!projectSvc.canEditProject(socket.userName, p, auth)) {
      socket.emit('project-update-error', '你没有修改此项目的权限');
      return;
    }
    // 保存快照用于撤回
    const before = JSON.parse(JSON.stringify(p.data || {}));
    if (data.name !== undefined) p.name = data.name;
    if (data.data !== undefined) p.data = data.data;
    p.updatedAt = Date.now();
    socket.emit('project-updated', { id: p.id, name: p.name, data: p.data, updatedAt: p.updatedAt });
    addLog(socket.id, socket.userName || SERVER_NAME, 'updated', p.type, p.name);
    // 记录操作历史（用于撤回）
    pushProjectOp(p.id, socket.userName, 'update', before, JSON.parse(JSON.stringify(p.data || {})));
    broadcastToPeers({ type: 'projects-sync', projects: projects.map(x => ({...x})) }, null);
    projectSvc.saveProjects();
  });
  socket.on('project-delete', (id) => {
    if (!validateEventPayload('project-delete', id).valid) return;
    const p = projects.find(x => x.id === id);
    if (!p) return;
    if (!projectSvc.canDeleteProject(socket.userName, p, auth)) {
      socket.emit('project-update-error', '你没有删除此项目的权限');
      return;
    }
    p.deleted = true; p.deletedAt = Date.now();
    socket.emit('project-deleted', id);
    addLog(socket.id, socket.userName || SERVER_NAME, 'deleted', p.type, p.name);
    broadcastToPeers({ type: 'projects-sync', projects: projects.map(x => ({...x})) }, null);
    projectSvc.saveProjects();
  });
  socket.on('project-restore', (id) => {
    const p = projects.find(x => x.id === id);
    if (!p) return;
    p.deleted = false; delete p.deletedAt;
    socket.emit('project-restored', id);
    addLog(socket.id, socket.userName || SERVER_NAME, 'restored', p.type, p.name);
    broadcastToPeers({ type: 'projects-sync', projects: projects.map(x => ({...x})) }, null);
    projectSvc.saveProjects();
  });
  socket.on('project-permanent-delete', (id) => {
    console.log('收到 project-permanent-delete 请求:', id);
    const idx = projects.findIndex(x => x.id === id);
    if (idx < 0) {
      console.log('项目不存在:', id);
      return;
    }
    const p = projects[idx];
    // 允许管理员或项目所有者永久删除
    if (!socket.isAdmin && p.owner !== socket.userName) {
      console.log('权限不足:', socket.userName, '尝试删除', p.owner, '的项目');
      socket.emit('project-update-error', '你没有永久删除此项目的权限');
      return;
    }
    projects.splice(idx, 1);
    console.log('永久删除成功:', id, p.name);
    socket.emit('project-permanently-deleted', id);
    if (p) addLog(socket.id, socket.userName || SERVER_NAME, 'permanently deleted', p.type, p.name);
    broadcastToPeers({ type: 'projects-sync', projects: projects.map(x => ({...x})) }, null);
    projectSvc.saveProjects();
  });
  socket.on('project-transfer', ({ ids, targetServerId }) => {
    const toSend = projects.filter(p => ids.includes(p.id)); if (!toSend.length) return;
    const tp = peers.get(targetServerId);
    if (tp && tp.connected) {
      tp.socket.emit('bridge-msg', { type: 'project-transfer', projects: toSend.map(p => ({...p})), fromName: SERVER_NAME, fromId: SERVER_ID });
      socket.emit('transfer-sent', { count: toSend.length, to: tp.name });
    } else socket.emit('transfer-failed', { reason: '对方不在线' });
  });

  // ── 操作锁 ──
  socket.on('focus-lock', ({ type, id }) => {
    if (!validateString(type, 50) || !validateString(id, 100)) return;
    const name = socket.userName || SERVER_NAME;
    socket.broadcast.emit('focus-lock', { type, id, user: name });
    broadcastToPeers({ type: 'focus-lock', lockType: type, lockId: id, user: name }, null);
  });
  socket.on('focus-release', ({ type, id }) => {
    if (!validateString(type, 50) || !validateString(id, 100)) return;
    const name = socket.userName || SERVER_NAME;
    socket.broadcast.emit('focus-release', { type, id, user: name });
    broadcastToPeers({ type: 'focus-release', lockType: type, lockId: id, user: name }, null);
  });
  socket.on('realtime-event', (data) => {
    if (!data || !data.event || !validateString(data.event, 100)) return;
    const msg = { type: 'realtime', _msgId: uuid(), origin: SERVER_ID, event: data.event, data: data.payload };
    socket.broadcast.emit(data.event, data.payload);
    broadcastToPeers(msg, null);
  });

  // ── 白板实时同步 ──
  socket.on('whiteboard:add', (el) => {
    if (!el || !el.id || typeof el.id !== 'string' || el.id.length > 100) return;
    const elStr = JSON.stringify(el);
    if (elStr.length > 50000) return; // 单元素最大50KB
    el.createdBy = socket.userName || el.createdBy;
    el.modifiedBy = socket.userName || el.modifiedBy;
    socket.broadcast.emit('whiteboard:op', { type: 'add', elementId: el.id, after: el, userId: socket.userName, timestamp: Date.now() });
    socket.broadcast.emit('whiteboard:add', el);
  });

  socket.on('whiteboard:update', ({ id, patch }) => {
    if (!id || typeof id !== 'string' || id.length > 100) return;
    const patchStr = JSON.stringify(patch || {});
    if (patchStr.length > 50000) return;
    patch.modifiedBy = socket.userName || patch.modifiedBy;
    socket.broadcast.emit('whiteboard:op', { type: 'update', elementId: id, after: patch, userId: socket.userName, timestamp: Date.now() });
    socket.broadcast.emit('whiteboard:update', { id, patch });
  });

  socket.on('whiteboard:delete', (id) => {
    if (!id || typeof id !== 'string' || id.length > 100) return;
    socket.broadcast.emit('whiteboard:op', { type: 'delete', elementId: id, userId: socket.userName, timestamp: Date.now() });
    socket.broadcast.emit('whiteboard:delete', id);
  });

  socket.on('whiteboard:cursor', (pos) => {
    const cursor = {
      userId: socket.userName || 'unknown',
      userName: socket.userName || '匿名',
      x: pos.x,
      y: pos.y,
      color: '#1a73e8',
      lastUpdate: Date.now(),
    };
    socket.broadcast.emit('whiteboard:cursor', cursor);
  });

  // ── 管理操作 ──
  socket.on('admin-list-users', () => {
    if (!socket.isAdmin) return;
    const onlineNames = new Set();
    for (const [, u] of onlineUsers) onlineNames.add(u.name);
    console.log('[admin] onlineUsers size:', onlineUsers.size, 'onlineNames:', [...onlineNames]);
    const list = Object.entries(users).map(([name, u]) => ({
      name, isAdmin: u.isAdmin, hasPassword: !!u.passwordHash,
      isBanned: u.isBanned, fingerprint: u.fingerprint || '',
      role: u.isAdmin ? 'editor' : (u.role || 'commenter'),
      online: onlineNames.has(name),
      lastSeen: u.lastSeen || 0,
    }));
    console.log('[admin] users list:', list.map(u => ({ name: u.name, online: u.online })));
    socket.emit('admin-users-list', list);
  });
  socket.on('admin-change-password', async ({ targetName, newPassword }) => {
    if (!validateString(targetName, 50) || !validateString(newPassword, 100)) return;
    if (!socket.isAdmin || !users[targetName] || users[targetName].isAdmin || !newPassword) return;
    users[targetName].passwordHash = await auth.hashPwd(newPassword);
    users[targetName].pwdLegacy = false;
    auth.saveUsers();
    broadcastOnlineUsers();
    addLog(socket.id, socket.userName, 'changed password for', 'system', targetName);
  });

  // ── 用户自行更新资料 ──
  socket.on('update-profile', async ({ field, value }) => {
    const userName = socket.userName;
    if (!userName || !users[userName]) return;

    if (field === 'name') {
      if (!validateString(value, 50) || value.trim().length < 1) return;
      // 频率限制：每6小时1次
      if (!checkRateLimit(`rename:${userName}`, 1, 21600000)) {
        return socket.emit('profile-update-error', '名称修改过于频繁，每6小时仅可修改1次');
      }
      const newName = value.trim();
      if (newName === userName) return socket.emit('profile-update-error', '新名称与当前相同');
      if (auth.isNameBanned(newName)) return socket.emit('profile-update-error', '该名称已被禁止使用');
      if (users[newName]) return socket.emit('profile-update-error', '该名称已被他人使用');

      // 迁移用户数据
      users[newName] = { ...users[userName] };
      delete users[userName];
      auth.saveUsers();
      // 更新 socket
      socket.userName = newName;
      // 通知客户端
      socket.emit('profile-updated', { field: 'name', value: newName });
      addLog(socket.id, userName, 'renamed to', 'system', newName);
    } else if (field === 'password') {
      const { oldPassword, newPassword } = value;
      if (!oldPassword || !newPassword || newPassword.length < 3) return;
      if (!(await auth.validatePassword(userName, oldPassword))) {
        return socket.emit('profile-update-error', '当前密码错误');
      }
      users[userName].passwordHash = await auth.hashPwd(newPassword);
      users[userName].pwdLegacy = false;
      auth.saveUsers();
      socket.emit('profile-updated', { field: 'password' });
      addLog(socket.id, userName, 'changed password', 'system', '');
    }
  });
  socket.on('admin-ban-user', ({ targetName, fingerprint }) => {
    if (!validateString(targetName, 50) || (fingerprint && !validateString(fingerprint, 200))) return;
    if (!socket.isAdmin) return;
    if (targetName && users[targetName]) {
      if (users[targetName].isAdmin) return;
      users[targetName].isBanned = true;
      auth.saveUsers();
      for (const [sid, u] of onlineUsers) {
        if (u.name === targetName) {
          io.to(sid).emit('kicked', '你已被管理员拉黑');
          io.sockets.sockets.get(sid)?.disconnect();
          break;
        }
      }
      addLog(socket.id, socket.userName, 'banned', 'system', targetName);
    }
    if (fingerprint) {
      for (const n in users) {
        if (users[n].fingerprint === fingerprint && !users[n].isAdmin) users[n].isBanned = true;
      }
      auth.saveUsers();
      for (const [sid, u] of onlineUsers) {
        if (u.fingerprint === fingerprint && !u.isAdmin) {
          io.to(sid).emit('kicked', '你的设备已被拉黑');
          io.sockets.sockets.get(sid)?.disconnect();
        }
      }
    }
    broadcastOnlineUsers();
  });
  socket.on('admin-unban-user', ({ targetName }) => {
    if (!validateString(targetName, 50)) return;
    if (!socket.isAdmin || !users[targetName]) return;
    users[targetName].isBanned = false;
    auth.saveUsers();
    addLog(socket.id, socket.userName, 'unbanned', 'system', targetName);
    broadcastOnlineUsers();
  });

  // ── 角色管理 ──
  socket.on('admin-set-role', ({ targetName, role }) => {
    if (!validateString(targetName, 50) || !['viewer', 'commenter', 'editor'].includes(role)) return;
    if (!socket.isAdmin || !users[targetName] || users[targetName].isAdmin) return;
    if (!['editor', 'commenter', 'viewer'].includes(role)) return;
    users[targetName].role = role;
    auth.saveUsers();
    addLog(socket.id, socket.userName, 'set role', 'system', `${targetName} → ${role}`);
    broadcastOnlineUsers();
    // 通知目标用户角色变更
    for (const [sid, u] of onlineUsers) {
      if (u.name === targetName) io.to(sid).emit('role-changed', { role });
    }
  });

  // ── 消息权限申请 ──
  const msgPermissionRequests = [];
  socket.on('admin-request-msg-permission', ({ targetName }) => {
    if (!validateString(targetName, 50) || !targetName.trim()) return;
    if (!socket.userName) return;
    const req = { from: socket.userName, target: targetName.trim(), time: Date.now() };
    msgPermissionRequests.push(req);
    addLog(socket.id, socket.userName, 'request msg permission', 'system', `→ ${targetName}`);
    // 通知所有管理员
    for (const [sid, u] of onlineUsers) {
      if (u.isAdmin) io.to(sid).emit('admin-msg-permission-request', req);
    }
    socket.emit('request-sent', '消息权限申请已发送给管理员');
  });
  socket.on('admin-list-msg-requests', () => {
    if (!socket.isAdmin) return;
    socket.emit('admin-msg-requests-list', msgPermissionRequests);
  });
  socket.on('admin-approve-msg-permission', ({ from, approve }) => {
    if (!socket.isAdmin) return;
    if (!validateString(from, 50)) return;
    const req = msgPermissionRequests.find(r => r.from === from);
    const idx = msgPermissionRequests.findIndex(r => r.from === from);
    if (idx >= 0) msgPermissionRequests.splice(idx, 1);
    // 通知申请者
    for (const [sid, u] of onlineUsers) {
      if (u.name === from) {
        if (approve && req) {
          const key = `${from}→${req.target}`;
          messagePermissions[key] = true;
          saveMsgPermissions();
          io.to(sid).emit('message-permission-granted', { target: req.target });
        } else {
          io.to(sid).emit('message-permission-denied', {});
        }
      }
    }
    addLog(socket.id, socket.userName, 'msg permission', 'system', `${from} → ${approve ? '批准' : '拒绝'}`);
  });

  // ── 角色查询 ──
  socket.on('admin-get-roles', () => {
    if (!socket.isAdmin) return;
    const roleList = [];
    for (const name in users) {
      if (users[name].isAdmin) continue;
      roleList.push({ name, role: getUserRole(name) });
    }
    socket.emit('admin-roles-list', roleList);
  });

  socket.on('get-my-role', () => {
    if (!socket.userName) return;
    socket.emit('my-role', { role: getUserRole(socket.userName) });
  });

  socket.on('check-edit-permission', () => {
    if (!socket.userName) { socket.emit('edit-permission', { allowed: false }); return; }
    socket.emit('edit-permission', { allowed: auth.canEdit(socket.userName) });
  });

  socket.on('check-comment-permission', () => {
    if (!socket.userName) { socket.emit('comment-permission', { allowed: false }); return; }
    socket.emit('comment-permission', { allowed: auth.canComment(socket.userName) });
  });

  // ── 用户 → 管理员消息 ──
  socket.on('user-message-to-admin', (text) => {
    if (!validateString(text, 500)) return;
    if (!socket.userName) return;
    if (!checkRateLimit(`msgAdmin:${socket.userName}`, 5, 60000)) return;
    const msg = { from: socket.userName, text: text.trim(), time: Date.now() };
    if (!msg.text) return;
    for (const [sid, u] of onlineUsers) {
      if (u.isAdmin) io.to(sid).emit('admin-incoming-msg', msg);
    }
    addLog(socket.id, socket.userName, 'sent message to admin', 'system', msg.text.slice(0, 30));
  });

  // ── 忘记密码 ──
  socket.on('forgot-password-request', ({ name, newPassword, reason }) => {
    if (!validateString(name, 50) || !validateString(newPassword, 100) || !validateString(reason, 200)) { socket.emit('forgot-password-result', { ok: false, error: '参数无效' }); return; }
    const userName = (name || '').trim();
    if (!userName || !users[userName]) {
      socket.emit('forgot-password-result', { ok: false, error: '用户不存在' });
      return;
    }
    const ip = (socket.handshake.address || '').replace(/^::ffff:/, '');
    if (!checkRateLimit(`forgot:${ip}`, 3, 300000)) {
      socket.emit('forgot-password-result', { ok: false, error: '申请过于频繁，请5分钟后再试' });
      return;
    }
    if (users[userName] && users[userName].isAdmin) {
      socket.emit('forgot-password-result', { ok: false, error: '管理员不能通过此方式重置密码' });
      return;
    }
    const req = { id: ++pwdResetId, name: userName, newPassword: newPassword || '', reason: reason || '', time: Date.now() };
    passwordResets.push(req);
    savePasswordResets();
    socket.emit('forgot-password-result', { ok: true });
    addLog(socket.id, socket.userName, 'requested password reset', 'system', userName);
    for (const [sid, u] of onlineUsers) {
      if (u.isAdmin) io.to(sid).emit('admin-reset-request', req);
    }
  });
  socket.on('admin-list-resets', () => {
    if (!socket.isAdmin) return;
    socket.emit('admin-resets-list', passwordResets);
  });
  socket.on('admin-approve-reset', async ({ requestId, name, newPassword, approve }) => {
    if (!socket.isAdmin) return;
    passwordResets = passwordResets.filter(r => r.id !== requestId);
    savePasswordResets();
    if (approve && name && users[name] && !users[name].isAdmin) {
      users[name].passwordHash = await auth.hashPwd(newPassword || '');
      users[name].pwdLegacy = false;
      auth.saveUsers();
      addLog(socket.id, socket.userName, 'approved password reset', 'system', name);
      for (const [sid, u] of onlineUsers) {
        if (u.name === name) io.to(sid).emit('kicked', '管理员已重置你的密码，请重新登录');
      }
    } else {
      addLog(socket.id, socket.userName, 'rejected password reset', 'system', name || 'unknown');
    }
  });

  // ── 用户对用户私聊 ──
  socket.on('user-message-to-user', ({ target, text }) => {
    if (!validateEventPayload('user-message-to-user', { target, text }).valid) return;
    if (!socket.userName || !target || !text) return;
    if (!checkRateLimit(`msgUser:${socket.userName}`, 10, 60000)) return;
    const msg = { from: socket.userName, text: text.trim(), time: Date.now() };
    if (!msg.text) return;
    // 存储到历史
    const key = getChatKey(socket.userName, target);
    if (!chatHistory[key]) chatHistory[key] = [];
    chatHistory[key].push(msg);
    saveChatHistory();
    // 转发给目标（兼容新旧客户端）
    for (const [sid, u] of onlineUsers) {
      if (u.name === target) {
        io.to(sid).emit('user-incoming-msg', msg);
        io.to(sid).emit('chat-message', msg);
        break;
      }
    }
    addLog(socket.id, socket.userName, 'sent message to', 'system', target);
  });

  // ── 私聊：客户端 chat-send（对齐客户端事件） ──
  socket.on('chat-send', (data) => {
    // 兼容客户端传的 to 和服务端用的 target
    const target = data.target || data.to;
    const text = data.text;
    if (!validateEventPayload('chat-send', { target, text }).valid) return;
    if (!socket.userName || !target || !text) return;
    if (!checkRateLimit(`msgUser:${socket.userName}`, 10, 60000)) return;
    // 权限检查：管理员可发，或已被授予权限
    const isAdmin = socket.isAdmin || false;
    const permKey = `${socket.userName}→${target}`;
    if (!isAdmin && !messagePermissions[permKey]) {
      socket.emit('no-permission', '你还没有给此用户发消息的权限，请先申请');
      return;
    }
    const msg = { from: socket.userName, text: text.trim(), time: Date.now() };
    if (!msg.text) return;
    // 存储到历史
    const key = getChatKey(socket.userName, target);
    if (!chatHistory[key]) chatHistory[key] = [];
    chatHistory[key].push(msg);
    saveChatHistory();
    // 转发给目标（客户端已在 sendChat 中本地显示，不需回发给自己）
    for (const [sid, u] of onlineUsers) {
      if (u.name === target) { io.to(sid).emit('chat-message', msg); break; }
    }
    addLog(socket.id, socket.userName, 'sent message to', 'system', target);
  });

  // ── 私聊：获取历史 ──
  socket.on('chat-get-history', ({ with: targetName }) => {
    if (!socket.userName || !targetName) return;
    const key = getChatKey(socket.userName, targetName);
    const messages = chatHistory[key] || [];
    socket.emit('chat-history', { with: targetName, messages });
  });

  socket.on('check-message-permission', ({ target }) => {
    if (!socket.userName) return;
    const key = `${socket.userName}→${target}`;
    socket.emit('message-permission-status', { target, permitted: !!messagePermissions[key] });
  });
  socket.on('request-message-permission', ({ target }) => {
    if (!socket.userName) return;
    const from = socket.userName;
    const key = `${from}→${target}`;
    if (messagePermissions[key]) { socket.emit('message-permission-granted', { target }); return; }
    // 给申请者确认
    socket.emit('request-sent', '消息权限申请已发送给管理员');
    for (const [sid, u] of onlineUsers) {
      if (u.isAdmin) io.to(sid).emit('admin-permission-request', { from, target });
    }
  });
  socket.on('admin-approve-permission', ({ from, target, approve }) => {
    if (!socket.isAdmin) return;
    if (!from || !target) {
      socket.emit('toast', { msg: '审批失败：缺少目标用户信息', type: 'error' });
      return;
    }
    const key = `${from}→${target}`;
    if (approve) {
      messagePermissions[key] = true;
      saveMsgPermissions();
      for (const [sid, u] of onlineUsers) {
        if (u.name === from) { io.to(sid).emit('message-permission-granted', { target }); break; }
      }
      addLog(socket.id, socket.userName, 'approved message permission', 'system', `${from}→${target}`);
    } else {
      for (const [sid, u] of onlineUsers) {
        if (u.name === from) { io.to(sid).emit('message-permission-denied', { target }); break; }
      }
      addLog(socket.id, socket.userName, 'rejected message permission', 'system', `${from}→${target}`);
    }
  });

  // ── 统计 ──
  socket.on('admin-get-stats', () => {
    if (!socket.isAdmin) return;
    socket.emit('admin-stats', {
      onlineUsers: onlineUsers.size, peers: peers.size,
      projects: projects.length, logCount: operationLog.length,
    });
  });

  // ── 批注系统 ──
  socket.on('annotation-list', ({ documentId }) => {
    if (!socket.userName) return;
    const docAnnotations = annotations.filter(a => a.documentId === documentId);
    socket.emit('annotation-list-result', { documentId, annotations: docAnnotations });
  });

  socket.on('annotation-create', ({ documentId, anchor, content }) => {
    if (!validateEventPayload('annotation-create', { documentId, anchor, content }).valid) return;
    if (!socket.userName) { socket.emit('annotation-error', '请先登录'); return; }
    if (!auth.canComment(socket.userName)) { socket.emit('annotation-error', '你没有评论权限'); return; }
    if (!documentId || !content || !content.text) { socket.emit('annotation-error', '批注内容不能为空'); return; }
    const ann = {
      id: uuid().slice(0, 12),
      documentId,
      userId: socket.userName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'open',
      anchor: anchor || { type: 'text-range', startOffset: 0, endOffset: 0, text: '' },
      content: { text: content.text, attachments: content.attachments || [] },
      replyThread: [],
    };
    annotations.push(ann);
    saveAnnotations();
    io.emit('annotation-created', ann);
    addLog(socket.id, socket.userName, 'created annotation', documentId, content.text.slice(0, 30));
  });

  socket.on('annotation-reply', ({ annotationId, text }) => {
    if (!validateEventPayload('annotation-reply', { annotationId, text }).valid) return;
    if (!socket.userName) { socket.emit('annotation-error', '请先登录'); return; }
    if (!auth.canComment(socket.userName)) { socket.emit('annotation-error', '你没有评论权限'); return; }
    const ann = annotations.find(a => a.id === annotationId);
    if (!ann) { socket.emit('annotation-error', '批注不存在'); return; }
    const reply = { userId: socket.userName, text: text.trim(), timestamp: Date.now() };
    ann.replyThread.push(reply);
    ann.updatedAt = Date.now();
    saveAnnotations();
    io.emit('annotation-replied', { annotationId, reply });
    addLog(socket.id, socket.userName, 'replied annotation', annotationId, text.slice(0, 30));
  });

  socket.on('annotation-update-status', ({ annotationId, status }) => {
    if (!validateEventPayload('annotation-update-status', { annotationId, status }).valid) return;
    if (!socket.userName) return;
    const ann = annotations.find(a => a.id === annotationId);
    if (!ann) { socket.emit('annotation-error', '批注不存在'); return; }
    // 仅批注作者或管理员可以修改状态
    if (ann.userId !== socket.userName && !socket.isAdmin) { socket.emit('annotation-error', '你没有权限修改此批注状态'); return; }
    if (!['open', 'resolved', 'rejected', 'pending'].includes(status)) return;
    ann.status = status;
    ann.updatedAt = Date.now();
    saveAnnotations();
    io.emit('annotation-status-updated', { annotationId, status, updatedBy: socket.userName });
    addLog(socket.id, socket.userName, 'changed annotation status', annotationId, status);
  });

  socket.on('annotation-delete', ({ annotationId }) => {
    if (!validateEventPayload('annotation-delete', { annotationId }).valid) return;
    if (!socket.userName) return;
    const ann = annotations.find(a => a.id === annotationId);
    if (!ann) return;
    // 仅批注作者或管理员可以删除
    if (ann.userId !== socket.userName && !socket.isAdmin) { socket.emit('annotation-error', '你没有权限删除此批注'); return; }
    annotations = annotations.filter(a => a.id !== annotationId);
    saveAnnotations();
    io.emit('annotation-deleted', { annotationId });
    addLog(socket.id, socket.userName, 'deleted annotation', annotationId, '');
  });

  // ── 项目可见性 ──
  socket.on('project-set-visibility', ({ projectId, visibility }) => {
    if (!validateEventPayload('project-set-visibility', { projectId, visibility }).valid) return;
    if (!['private', 'public-read', 'public-edit'].includes(visibility)) return;
    const p = projects.find(x => x.id === projectId);
    if (!p || !projectSvc.canChangeVisibility(socket.userName, p, auth)) { socket.emit('project-update-error', '你没有权限修改项目可见性'); return; }
    p.visibility = visibility;
    p.updatedAt = Date.now();
    projectSvc.saveProjects();
    io.emit('project-visibility-changed', { projectId, visibility, changedBy: socket.userName });
    addLog(socket.id, socket.userName, 'changed visibility', p.type, p.name + ' → ' + visibility);
  });

  // ── 操作撤回/恢复 ──
  socket.on('project-undo', ({ projectId }) => {
    if (!validateEventPayload('project-undo', { projectId }).valid) return;
    if (!socket.userName) return;
    const p = projects.find(x => x.id === projectId);
    if (!p) return;
    const ops = projectOps.get(projectId) || [];
    const idx = ops.map((o, i) => ({ o, i })).filter(x => x.o.userId === socket.userName).pop();
    if (!idx) { socket.emit('project-update-error', '没有可撤回的操作'); return; }
    const op = ops[idx.i];
    p.data = JSON.parse(JSON.stringify(op.before));
    p.updatedAt = Date.now();
    ops.splice(idx.i, 1);
    projectOps.set(projectId, ops);
    if (!projectRedoOps.has(projectId)) projectRedoOps.set(projectId, []);
    projectRedoOps.get(projectId).push({ ...op, after: op.before, before: op.after });
    const redoStack = projectRedoOps.get(projectId);
    if (redoStack.length > 50) redoStack.splice(0, redoStack.length - 50);
    projectSvc.saveProjects();
    socket.emit('project-updated', { id: p.id, name: p.name, data: p.data, updatedAt: p.updatedAt });
    socket.emit('project-undo-result', { ok: true, userName: socket.userName });
    addLog(socket.id, socket.userName, 'undo', p.type, p.name);
  });

  socket.on('project-redo', ({ projectId }) => {
    if (!validateEventPayload('project-redo', { projectId }).valid) return;
    if (!socket.userName) return;
    const p = projects.find(x => x.id === projectId);
    if (!p) return;
    const redoStack = projectRedoOps.get(projectId) || [];
    const idx = redoStack.map((o, i) => ({ o, i })).filter(x => x.o.userId === socket.userName).pop();
    if (!idx) { socket.emit('project-update-error', '没有可恢复的操作'); return; }
    const op = redoStack[idx.i];
    p.data = JSON.parse(JSON.stringify(op.after));
    p.updatedAt = Date.now();
    redoStack.splice(idx.i, 1);
    if (!projectOps.has(projectId)) projectOps.set(projectId, []);
    projectOps.get(projectId).push({ ...op, before: op.before, after: op.after });
    projectSvc.saveProjects();
    socket.emit('project-updated', { id: p.id, name: p.name, data: p.data, updatedAt: p.updatedAt });
    socket.emit('project-redo-result', { ok: true, userName: socket.userName });
    addLog(socket.id, socket.userName, 'redo', p.type, p.name);
  });

  socket.on('disconnect', () => {
    if (socket.userName) auth.updateLastSeen(socket.userName);
    onlineUsers.delete(socket.id);
    broadcastOnlineUsers();
    broadcastToPeers({ type: 'focus-release-all', user: socket.userName || SERVER_NAME }, null);
  });
});

// ─── 桥接消息处理 ────────────────────────────────────────
function handleBridgeMessage(fromId, msg) {
  try {
    switch (msg.type) {
      case 'projects-sync':
        projectSvc.mergeProjects(msg.projects);
        broadcastToBrowsers({ type: 'projects-update' });
        broadcastToPeers(msg, fromId);
        break;
      case 'project-transfer':
        const newOnes = [];
        msg.projects.forEach(p => { if (!projects.find(x => x.id === p.id)) { projects.push({...p}); newOnes.push(p); } });
        broadcastToBrowsers({ type: 'projects-received', projects: newOnes, from: msg.fromName });
        broadcastToBrowsers({ type: 'projects-update' });
        broadcastToPeers(msg, fromId);
        break;
      case 'realtime':
        if (msg._msgId && isDuplicate(msg._msgId)) break;
        broadcastToBrowsers({ type: 'realtime', origin: msg.origin, event: msg.event, data: msg.data });
        if (msg.origin !== SERVER_ID) io.emit(msg.event, msg.data);
        if (msg._msgId) broadcastToPeers(msg, fromId);
        break;
      case 'focus-lock':
        io.emit('focus-lock', { type: msg.lockType, id: msg.lockId, user: msg.user });
        broadcastToPeers(msg, fromId);
        break;
      case 'focus-release':
        io.emit('focus-release', { type: msg.lockType, id: msg.lockId, user: msg.user });
        broadcastToPeers(msg, fromId);
        break;
      case 'focus-release-all':
        io.emit('focus-release-all', { user: msg.user });
        broadcastToPeers(msg, fromId);
        break;
      case 'peer-rename':
        const p = peers.get(fromId);
        if (p) { p.name = msg.name; broadcastPeers(); }
        break;
      case 'fenjing-sync':
        if (msg.state) {
          fenjingState = msg.state;
          fenjingNsp.emit('fenjing:state-sync', fenjingState);
        }
        break;
    }
  } catch (e) { console.error('[桥接] 处理消息异常:', e.message); }
}

// ─── 工具函数 ────────────────────────────────────────────
function broadcastToBrowsers(data) { io.emit('bridge-message', data); }

function broadcastToPeers(msg, excludeId) {
  for (const [sid, p] of peers) {
    if (sid !== excludeId && p.connected) sendToPeer(sid, msg);
  }
}

function sendToPeer(serverId, msg) {
  const p = peers.get(serverId);
  if (p && p.connected) p.socket.emit('bridge-msg', msg);
}

function broadcastPeers() {
  const list = [];
  for (const [sid, p] of peers) {
    list.push({
      serverId: sid, name: p.name, ip: p.ip, port: p.port,
      connected: p.connected, note: p.note || '',
      reconnecting: !p.connected && p.reconnectTimer !== null,
    });
  }
  broadcastToBrowsers({ type: 'peers-update', peers: list });
}

// ─── 分镜工具 namespace ────────────────────────────────────
const fenjingNsp = io.of('/fenjing');
let fenjingState = loadFenjingState() || { projectName: '未命名项目', scenes: [], shots: [] };

fenjingNsp.on('connection', (socket) => {
  console.log(`[fenjing连接] ${socket.id}`);
  socket.emit('fenjing:state-sync', fenjingState);
  socket.on('fenjing:shots-update', (shots) => {
    if (!Array.isArray(shots) || shots.length > 10000) return;
    fenjingState.shots = shots;
    socket.broadcast.emit('fenjing:shots-update', shots);
    saveFenjingState(fenjingState);
    broadcastToPeers({ type: 'fenjing-sync', state: fenjingState }, null);
  });
  socket.on('fenjing:scenes-update', (scenes) => {
    if (!Array.isArray(scenes) || scenes.length > 1000) return;
    fenjingState.scenes = scenes;
    socket.broadcast.emit('fenjing:scenes-update', scenes);
    saveFenjingState(fenjingState);
    broadcastToPeers({ type: 'fenjing-sync', state: fenjingState }, null);
  });
  socket.on('fenjing:project-rename', (name) => {
    if (!validateString(name, 100)) return;
    fenjingState.projectName = name;
    socket.broadcast.emit('fenjing:project-rename', name);
    saveFenjingState(fenjingState);
    broadcastToPeers({ type: 'fenjing-sync', state: fenjingState }, null);
  });
  // 加载项目分镜数据
  socket.on('fenjing:load-item', ({ itemId, projectId }) => {
    let targetItem = null;
    let targetProject = null;
    if (projectId) {
      targetProject = projects.find(p => p.id === projectId);
      if (targetProject && targetProject.data.items) {
        targetItem = targetProject.data.items.find(it => it.id === itemId);
      }
    }
    if (targetItem && targetItem.type === 'storyboard') {
      fenjingState = JSON.parse(JSON.stringify(targetItem.data || { projectName: targetItem.name, scenes: [], shots: [] }));
      fenjingState.projectName = fenjingState.projectName || targetItem.name;
    } else {
      fenjingState = { projectName: '未命名项目', scenes: [], shots: [] };
    }
    fenjingNsp.emit('fenjing:state-sync', fenjingState);
  });
  // 保存分镜数据到项目
  socket.on('fenjing:save-item', ({ itemId, projectId }) => {
    let targetProject = null;
    let targetItem = null;
    if (projectId) {
      targetProject = projects.find(p => p.id === projectId);
      if (targetProject && targetProject.data.items) {
        targetItem = targetProject.data.items.find(it => it.id === itemId);
      }
    }
    if (targetItem && targetProject) {
      targetItem.data = { projectName: fenjingState.projectName, scenes: fenjingState.scenes, shots: fenjingState.shots };
      targetProject.updatedAt = Date.now();
      projectSvc.saveProjects();
      io.emit('project-item-added', { projectId, item: targetItem });
    }
  });
});

// ─── 主动连接对方（UDP 发现后调用） ────────────────────
let connectPeerId = 0;

function connectToPeer(serverId, name, ip, port) {
  const tempId = serverId || `tmp_${++connectPeerId}`;
  if (peers.has(tempId) || (serverId && peers.has(serverId))) return;

  console.log(`[桥接] 连接 ${name} @ ${ip}:${port}...`);
  const url = `http://${ip}:${port}`;
  const sock = SocketIOClient(url, {
    query: { bridge: 'true' }, transports: ['websocket'],
    reconnection: true, reconnectionDelay: 2000, reconnectionAttempts: Infinity,
  });

  let realServerId = serverId;

  sock.on('connect', () => {
    console.log(`[桥接] Socket.IO 连到 ${name}`);
    sock.emit('handshake', { serverId: SERVER_ID, name: SERVER_NAME, port: HTTP_PORT });
  });

  sock.on('handshake-ack', (data) => {
    realServerId = data.serverId;
    if (peers.has(realServerId)) {
      const ex = peers.get(realServerId);
      if (ex.connected) { sock.disconnect(); return; }
      console.log(`[桥接] ${data.name} 重连成功`);
      clearTimeout(ex.reconnectTimer);
      ex.socket = sock; ex.connected = true; ex.reconnectTimer = null;
      broadcastPeers();
      sendToPeer(realServerId, { type: 'projects-sync', projects: projects.map(x => ({...x})) });
      sock.on('bridge-msg', (msg) => handleBridgeMessage(realServerId, msg));
      sock.on('disconnect', () => handlePeerDisconnect(realServerId));
      return;
    }
    const p = { socket: sock, name: data.name, ip, port, connected: true, note: '', reconnectTimer: null };
    peers.set(realServerId, p);
    if (tempId !== realServerId) peers.delete(tempId);
    console.log(`[桥接] 握手完成，已加入 ${data.name}`);
    foundPeer();
    sendToPeer(realServerId, { type: 'projects-sync', projects: projects.map(x => ({...x})) });
    broadcastPeers();
    sock.on('bridge-msg', (msg) => handleBridgeMessage(realServerId, msg));
    sock.on('disconnect', () => handlePeerDisconnect(realServerId));
  });

  sock.on('connect_error', (err) => { /* 桥接连接失败 */ });
  setTimeout(() => { if (!sock.connected) sock.close(); }, 10000);
}

function autoJoin() {
  if (!JOIN_TARGET) return;
  const [host, portStr] = JOIN_TARGET.split(':');
  const port = parseInt(portStr) || 3000;
  connectToPeer(null, host, host, port);
}

// ─── 全局异常兜底 ──────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[崩溃] 未捕获异常:', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[崩溃] 未处理的 Promise 拒绝:', reason);
});

// ─── 启动 ────────────────────────────────────────────────
function startServer(port) {
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ 端口 ${port} 已被占用！`);
      console.error('   可能已有另一个服务在运行。');
      console.error('   解决方案：');
      console.error(`     1. 关闭已运行的服务`);
      console.error(`     2. 或换一个端口: node server.js --port ${port + 1}`);
      console.error('');
      process.exit(1);
    } else {
      console.error('[崩溃] 服务器错误:', err.message);
      process.exit(1);
    }
  });
  server.listen(port, '0.0.0.0', () => {
  if (JOIN_TARGET) setTimeout(autoJoin, 1500);
  let ip = 'localhost';
  try {
    for (const name of Object.keys(os.networkInterfaces()))
      for (const iface of os.networkInterfaces()[name])
        if (iface.family === 'IPv4' && !iface.internal) { ip = iface.address; break; }
  } catch (_) { /* 获取本机 IP 失败，使用 localhost */ }
  console.log('╔══════════════════════════════════════════╗');
  console.log(JOIN_TARGET ? '║    🧪 测试实例 (--join 模式)              ║' : '║    🎬 多机协作创作工作室 v2.0            ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  服务ID: ${SERVER_ID.padEnd(28)}║`);
  console.log(`║  本机:   http://localhost:${HTTP_PORT}${' '.repeat(13 - String(HTTP_PORT).length)}║`);
  if (JOIN_TARGET) console.log(`║  加入:   ${JOIN_TARGET.padEnd(27)}║`);
  else console.log(`║  局域网: http://${ip}:${HTTP_PORT}${' '.repeat(Math.max(0, 23 - ip.length - String(HTTP_PORT).length))}║`);
  console.log('║                                        ║');
  if (JOIN_TARGET) {
    console.log('║  浏览器1 → http://localhost:3000         ║');
    console.log(`║  浏览器2 → http://localhost:${HTTP_PORT}${' '.repeat(15 - String(HTTP_PORT).length)}║`);
  } else {
    console.log('║  多台电脑打开页面 → 开启局域网          ║');
    console.log('║  自动发现并组建协作网络                  ║');
  }
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  👑 管理员: 热合曼                        ║');
  console.log('║  🔑 密码: 已设置（登录页输入）            ║');
  console.log('║  💡 登录后可在右侧面板修改密码           ║');
  console.log('╚══════════════════════════════════════════╝');
  });
}

startServer(HTTP_PORT);
