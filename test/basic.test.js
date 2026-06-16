// ─── Collab Studio 基础测试 ────────────────────────────
// 运行: node test/basic.test.js

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('🧪 运行基础测试...\n');

// 1. 测试模块加载
try {
  const persist = require('../utils/persist');
  assert.ok(persist.ensureDataDir, 'persist.ensureDataDir 应该存在');
  assert.ok(persist.loadJSON, 'persist.loadJSON 应该存在');
  assert.ok(persist.saveJSON, 'persist.saveJSON 应该存在');
  assert.ok(persist.DATA_DIR, 'persist.DATA_DIR 应该存在');
  console.log('✅ utils/persist.js 加载正常');
} catch (e) {
  console.log('❌ utils/persist.js 加载失败:', e.message);
  process.exit(1);
}

// 2. 测试 AuthService 加载
try {
  const auth = require('../services/auth');
  assert.ok(auth.generateSessionToken, 'generateSessionToken 应该存在');
  assert.ok(auth.validateSessionToken, 'validateSessionToken 应该存在');
  assert.ok(auth.validatePassword, 'validatePassword 应该存在');
  assert.ok(auth.canEdit, 'canEdit 应该存在');
  assert.ok(auth.isAdmin, 'isAdmin 应该存在');
  assert.ok(auth.getUserRole, 'getUserRole 应该存在');
  console.log('✅ services/auth.js 加载正常');
} catch (e) {
  console.log('❌ services/auth.js 加载失败:', e.message);
  process.exit(1);
}

// 3. 测试 ProjectService 加载
try {
  const project = require('../services/project');
  assert.ok(project.createProject, 'createProject 应该存在');
  assert.ok(project.getProject, 'getProject 应该存在');
  assert.ok(project.softDeleteProject, 'softDeleteProject 应该存在');
  assert.ok(project.saveProjects, 'saveProjects 应该存在');
  assert.ok(project.getDefaultData, 'getDefaultData 应该存在');
  console.log('✅ services/project.js 加载正常');
} catch (e) {
  console.log('❌ services/project.js 加载失败:', e.message);
  process.exit(1);
}

// 4. 测试 AnnotationService 加载
try {
  const ann = require('../services/annotation');
  assert.ok(ann.createAnnotation, 'createAnnotation 应该存在');
  assert.ok(ann.addReply, 'addReply 应该存在');
  assert.ok(ann.getAnnotations, 'getAnnotations 应该存在');
  console.log('✅ services/annotation.js 加载正常');
} catch (e) {
  console.log('❌ services/annotation.js 加载失败:', e.message);
  process.exit(1);
}

// 5. 测试 LoggerService 加载
try {
  const log = require('../services/logger');
  assert.ok(log.addLog, 'addLog 应该存在');
  assert.ok(log.getRecentLogs, 'getRecentLogs 应该存在');
  console.log('✅ services/logger.js 加载正常');
} catch (e) {
  console.log('❌ services/logger.js 加载失败:', e.message);
  process.exit(1);
}

// 6. 测试 persist 原子写入
try {
  const { saveJSON, loadJSON, DATA_DIR } = require('../utils/persist');
  const testFile = path.join(DATA_DIR, '.test-atomic.json');
  saveJSON(testFile, { test: 'data' });
  const loaded = loadJSON(testFile, {});
  assert.strictEqual(loaded.test, 'data', '读写应该一致');
  fs.unlinkSync(testFile); // 清理
  console.log('✅ 原子写入/读取正常');
} catch (e) {
  console.log('❌ 原子写入测试失败:', e.message);
  process.exit(1);
}

// 7. 测试 AuthService 令牌
try {
  const auth = require('../services/auth');
  const token = auth.generateSessionToken('测试用户');
  assert.ok(token, '令牌应该非空');
  assert.ok(token.startsWith('tok_'), '令牌应以 tok_ 开头');
  const user = auth.validateSessionToken(token);
  assert.strictEqual(user, '测试用户', '令牌验证应返回用户名');
  console.log('✅ 会话令牌生成/验证正常');
} catch (e) {
  console.log('❌ 令牌测试失败:', e.message);
  process.exit(1);
}

console.log('\n🎉 全部测试通过!');
