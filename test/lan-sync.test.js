// 局域网同步逻辑单元测试
const path = require('path');
const fs = require('fs');

// 临时数据目录，避免污染真实数据
const TEST_DATA_DIR = path.join(__dirname, 'tmp-data-' + Date.now());
process.env.DATA_DIR = TEST_DATA_DIR;

// 强制重新加载 persist 以使用临时目录
const persist = require('../utils/persist');
persist.ensureDataDir();

// 加载被测模块
const projectSvc = require('../services/project');

const authMock = {
  getUser: (name) => name ? { name } : null,
  isAdmin: (name) => name === 'admin',
  canEdit: (name) => true,
};

function clearProjects() {
  const all = projectSvc.getAllProjects();
  all.length = 0;
}

function makeRemoteProject(opts) {
  return {
    id: opts.id || 'r' + Math.random().toString(36).slice(2, 10),
    type: opts.type || 'script',
    name: opts.name || '远程项目',
    data: opts.data || { acts: [] },
    createdAt: opts.createdAt || Date.now(),
    updatedAt: opts.updatedAt || Date.now(),
    owner: opts.owner || 'userB',
    visibility: opts.visibility || 'private',
    _version: opts._version || 0,
  };
}

function makeLocalProject(opts) {
  return projectSvc.createProject(opts.type || 'script', opts.name || '本地项目', opts.data, opts.owner || 'userA');
}

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}

console.log('数据目录:', TEST_DATA_DIR);

// 测试 1: 只同步公开项目，私密项目不同步
console.log('\n[测试1] 只同步公开项目');
clearProjects();
const remotePrivate = makeRemoteProject({ name: '远程私密', visibility: 'private', owner: 'userB' });
const remotePublicRead = makeRemoteProject({ name: '远程公开只读', visibility: 'public-read', owner: 'userB' });
const remotePublicEdit = makeRemoteProject({ name: '远程公开编辑', visibility: 'public-edit', owner: 'userB' });
projectSvc.mergeProjects([remotePrivate, remotePublicRead, remotePublicEdit], { serverId: 'srvB', serverName: 'B电脑' });
assert(projectSvc.getAllProjects().length === 2, '只应同步 2 个公开项目');
assert(projectSvc.getProject(remotePrivate.id) === undefined, '私密项目不应被同步');
assert(projectSvc.getProject(remotePublicRead.id) !== undefined, 'public-read 项目应被同步');
assert(projectSvc.getProject(remotePublicEdit.id) !== undefined, 'public-edit 项目应被同步');

// 测试 2: 同步项目标记来源
console.log('\n[测试2] 同步项目标记来源');
const synced = projectSvc.getProject(remotePublicEdit.id);
assert(synced && synced.syncedFrom && synced.syncedFrom.serverId === 'srvB', '同步项目应记录来源 serverId');
assert(synced && synced.syncedFrom && synced.syncedFrom.serverName === 'B电脑', '同步项目应记录来源 serverName');

// 测试 3: 同名/同 ID 的本地私密项目不被远程项目覆盖
console.log('\n[测试3] 本地私密项目不被覆盖');
clearProjects();
const localPrivate = makeLocalProject({ name: '同名项目', type: 'script', owner: 'userA' });
projectSvc.setProjectVisibility(localPrivate.id, 'private');
projectSvc.mergeProjects([{ ...localPrivate, owner: 'userB', visibility: 'public-read' }], { serverId: 'srvB' });
const after = projectSvc.getProject(localPrivate.id);
assert(after.owner === 'userA', '本地私密项目所有者应保持不变');
assert(after.visibility === 'private', '本地私密项目可见性应保持不变');

// 测试 4: 版本冲突解决 - 远程版本更高则更新
console.log('\n[测试4] 高版本远程项目更新本地');
clearProjects();
const local = makeLocalProject({ name: '协作项目', owner: 'userA' });
projectSvc.setProjectVisibility(local.id, 'public-edit');
const remoteNewer = { ...local, _version: 5, updatedAt: Date.now() + 1000, data: { acts: [{ name: '新幕' }] } };
projectSvc.mergeProjects([remoteNewer], { serverId: 'srvB' });
const updated = projectSvc.getProject(local.id);
assert(updated._version === 5, '本地版本应升级到远程版本');
assert(updated.data.acts.length === 1, '本地数据应被远程数据覆盖');
// 本地原始项目不应被标记 syncedFrom
assert(!updated.syncedFrom, '本地原始项目不应被标记 syncedFrom');

// 测试 5: getShareableProjects 只返回公开未删除项目
console.log('\n[测试5] getShareableProjects 过滤');
clearProjects();
const p1 = makeLocalProject({ name: '公开项目', owner: 'userA' });
projectSvc.setProjectVisibility(p1.id, 'public-read');
const p2 = makeLocalProject({ name: '私密项目', owner: 'userA' });
projectSvc.setProjectVisibility(p2.id, 'private');
const p3 = makeLocalProject({ name: '已删除公开', owner: 'userA' });
projectSvc.setProjectVisibility(p3.id, 'public-read');
projectSvc.softDeleteProject(p3.id);
const shareable = projectSvc.getShareableProjects ? projectSvc.getShareableProjects() : [];
assert(shareable.length === 1 && shareable[0].id === p1.id, '只应返回未删除的公开项目');

// 测试 6: 权限 - public-edit 可被非所有者编辑
console.log('\n[测试6] public-edit 权限');
clearProjects();
const pEdit = makeLocalProject({ name: '协作编辑', owner: 'userA' });
projectSvc.setProjectVisibility(pEdit.id, 'public-edit');
assert(projectSvc.canEditProject('userB', pEdit, authMock) === true, 'public-edit 项目应允许他人编辑');
const pRead = makeLocalProject({ name: '只读', owner: 'userA' });
projectSvc.setProjectVisibility(pRead.id, 'public-read');
assert(projectSvc.canEditProject('userB', pRead, authMock) === false, 'public-read 项目不应允许他人编辑');
const pPvt = makeLocalProject({ name: '私密', owner: 'userA' });
projectSvc.setProjectVisibility(pPvt.id, 'private');
assert(projectSvc.canEditProject('userB', pPvt, authMock) === false, 'private 项目不应允许他人编辑');

console.log('\n────────────────────');
console.log(`通过: ${passed}  失败: ${failed}`);

// 清理临时数据
if (fs.existsSync(TEST_DATA_DIR)) {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  console.log('已清理临时数据目录');
}

process.exit(failed > 0 ? 1 : 0);
