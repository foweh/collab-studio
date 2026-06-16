// ─── 认证服务 ──────────────────────────────────────────
// 用户管理、密码哈希、会话令牌、角色权限

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const { loadJSON, saveJSON, DATA_DIR } = require('../utils/persist');

const SALT_ROUNDS = 10;
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// ─── 用户数据 ─────────────────────────────────────────
let users = loadJSON(USERS_FILE, {});

// ─── 会话令牌 ─────────────────────────────────────────
const sessionTokens = new Map(); // token → { userName, expiresAt }

function generateSessionToken(userName) {
  const token = 'tok_' + crypto.randomBytes(16).toString('hex');
  sessionTokens.set(token, { userName, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  if (sessionTokens.size > 1000) {
    for (const [t, s] of sessionTokens) {
      if (Date.now() > s.expiresAt) sessionTokens.delete(t);
    }
  }
  return token;
}

function validateSessionToken(token) {
  if (!token || !sessionTokens.has(token)) return null;
  const session = sessionTokens.get(token);
  if (Date.now() > session.expiresAt) {
    sessionTokens.delete(token);
    return null;
  }
  return session.userName;
}

async function hashPwd(pwd) {
  return await bcrypt.hash(pwd || '', SALT_ROUNDS);
}

async function validatePassword(name, pwd) {
  if (!users[name]) { console.log(`[auth] validatePassword: 用户 ${name} 不存在`); return false; }
  const record = users[name];
  const hashField = record.passwordHash || record.password;
  if (!hashField) {
    console.log(`[auth] validatePassword: 用户 ${name} 无密码`);
    return !pwd;
  }
  if (typeof pwd !== 'string') {
    console.log(`[auth] validatePassword: 用户 ${name} 密码参数类型错误: ${typeof pwd}`);
    return false;
  }
  if (hashField.length < 20) {
    // 旧版 SHA256 → 升级到 bcrypt
    const oldHash = crypto.createHash('sha256').update(pwd || '').digest('hex').slice(0, 16);
    if (hashField === oldHash) {
      console.log(`[auth] validatePassword: 用户 ${name} 旧版 SHA256 密码验证通过，升级到 bcrypt`);
      record.passwordHash = await bcrypt.hash(pwd || '', SALT_ROUNDS);
      record.pwdLegacy = false;
      saveUsers();
      return true;
    }
    console.log(`[auth] validatePassword: 用户 ${name} 旧版 SHA256 密码不匹配`);
    return false;
  }
  const match = await bcrypt.compare(pwd || '', hashField);
  console.log(`[auth] validatePassword: 用户 ${name} bcrypt 验证结果: ${match}`);
  return match;
}

// ─── 管理员初始化 ─────────────────────────────────────
let adminReady = null;

function initAdmin(adminPasswordFromEnv, adminUserName = '热合曼') {
  adminReady = (async () => {
    let adminPwd = adminPasswordFromEnv;
    if (!adminPwd) {
      const existing = users[adminUserName];
      const hasHash = existing && (existing.passwordHash || existing.password);
      if (!hasHash) {
        adminPwd = crypto.randomBytes(4).toString('hex');
        console.log(`[用户] ⚠️ 未设置 ADMIN_PASSWORD 环境变量，已生成临时管理员密码: ${adminPwd}`);
        console.log('[用户] 💡 请立即登录并修改密码，或设置环境变量 ADMIN_PASSWORD=你的密码');
      }
    }
    if (!adminPwd) {
      console.log('[用户] 管理员已有密码，使用现有凭证登录');
      return;
    }

    if (users[adminUserName]) {
      const ex = users[adminUserName];
      const curHash = ex.passwordHash || ex.password || '';
      let needReset = false;
      if (curHash.length >= 20) {
        try { needReset = !bcrypt.compareSync(adminPwd, curHash); }
        catch (_) { needReset = true; }
      } else if (curHash.length > 0) {
        needReset = true;
      }
      if (needReset) {
        ex.passwordHash = await bcrypt.hash(adminPwd, SALT_ROUNDS);
        ex.pwdLegacy = false;
        saveUsers();
        console.log('[用户] 管理员密码已重置');
      }
      return;
    }

    // 首次创建管理员
    const hash = await bcrypt.hash(adminPwd, SALT_ROUNDS);
    users[adminUserName] = { passwordHash: hash, isAdmin: true, fingerprint: '', isBanned: false, pwdLegacy: false };
    saveUsers();
    console.log('[用户] 管理员账号已创建');
  })();
  adminReady.catch(e => console.error('[用户] 管理员初始化失败', e));
}

// ─── 公共 API ─────────────────────────────────────────

function getUser(name) { return users[name] || null; }

function getUsers() { return users; }

function getOrCreateUser(name, password) {
  if (!users[name]) {
    users[name] = {
      passwordHash: password ? hashPwdSync(password) : '',
      isAdmin: false, fingerprint: '', isBanned: false,
      role: 'editor',
      lastSeen: 0,
      avatar: ''
    };
  }
  return users[name];
}

function updateLastSeen(name) {
  if (users[name]) {
    users[name].lastSeen = Date.now();
    saveUsers();
  }
}

function updateUserField(name, field, value) {
  if (!users[name]) return false;
  const allowed = ['avatar', 'fingerprint', 'isBanned', 'role', 'passwordHash', 'pwdLegacy'];
  if (!allowed.includes(field)) return false;
  users[name][field] = value;
  saveUsers();
  return true;
}

function updateUser(name, updates) {
  if (users[name]) Object.assign(users[name], updates);
  saveUsers();
}

function setUserFingerprint(name, fp) {
  if (users[name]) users[name].fingerprint = fp;
  saveUsers();
}

function hashPwdSync(pwd) { return bcrypt.hashSync(pwd || '', SALT_ROUNDS); }

function isNameBanned(name) { return users[name] && users[name].isBanned; }

function isFingerprintBanned(fp) {
  if (!fp) return false;
  for (const n in users) {
    if (users[n].fingerprint === fp && users[n].isBanned) {
      console.log(`[auth] isFingerprintBanned: 用户 ${n} 被禁，指纹 ${fp} 被封`);
      return true;
    }
  }
  return false;
}

function isAdmin(name) { return users[name] && users[name].isAdmin; }

// ─── 角色权限 ─────────────────────────────────────────
function getUserRole(name) {
  if (!users[name]) return 'viewer';
  if (users[name].isAdmin) return 'editor';
  return users[name].role || 'commenter';
}

function canEdit(name) {
  return users[name] && (users[name].isAdmin || getUserRole(name) === 'editor');
}

function canComment(name) {
  if (!users[name]) return false;
  if (users[name].isAdmin) return true;
  const role = getUserRole(name);
  return role === 'editor' || role === 'commenter';
}

function saveUsers() { saveJSON(USERS_FILE, users); }

module.exports = {
  // 初始化
  initAdmin,
  adminReady,
  // 令牌
  generateSessionToken,
  validateSessionToken,
  // 用户
  getUser,
  getUsers,
  getOrCreateUser,
  updateLastSeen,
  updateUser,
  updateUserField,
  setUserFingerprint,
  isNameBanned,
  isFingerprintBanned,
  isAdmin,
  // 认证
  validatePassword,
  hashPwd,
  // 角色
  getUserRole,
  canEdit,
  canComment,
  saveUsers,
  users,
};
