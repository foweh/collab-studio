// ─── 项目管理服务 ──────────────────────────────────────
// 项目 CRUD、可见性、撤回/恢复、子项管理

const path = require('path');
const { v4: uuid } = require('uuid');
const { loadJSON, saveJSON, DATA_DIR } = require('../utils/persist');

const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

// ─── 项目数据 ─────────────────────────────────────────
let projects = loadJSON(PROJECTS_FILE, []);

// 操作历史（用于撤回/恢复）
const projectOps = new Map(); // projectId → [...]
const projectRedoOps = new Map(); // projectId → [...]

// ─── 默认数据 ─────────────────────────────────────────
function getDefaultData(type) {
  switch (type) {
    case 'script': return { acts: [] };
    case 'mindmap': return { nodes: [], edges: [] };
    case 'story': return { chapters: [] };
    case 'storyboard': return { items: [] };
    case 'folder': return { children: [] };
    case 'project': return { items: [] };
    // ── 部门化新类型(阶段三) ──
    case 'article': return { title: '', summary: '', cover: '', content: '', status: 'draft' };       // 推文(采编部)
    case 'design-task': return { title: '', description: '', status: 'todo', assignee: '' };           // 设计任务(文化设计部)
    case 'activity': return { title: '', plan: '', budget: '', status: 'planning' };                   // 活动(活动策划部)
    case 'meeting': return { title: '', date: '', attendees: [], minutes: '', status: 'draft' };       // 会议记录(秘书处)
    case 'audio-project': return { title: '', scripts: [], status: 'draft' };                          // 音频项目(主持播音部)
    case 'video-project': return { title: '', status: 'preproduction', links: [] };                    // 视频项目(传媒/多媒体部)
    default: return {};
  }
}

// 部门 → 默认项目类型映射(工作台默认视图)
const DEPT_DEFAULT_TYPES = {
  'media-directing': 'storyboard',   // 传媒编导部: 分镜
  'editorial-public': 'article',     // 采编宣传部: 推文
  'culture-design': 'design-task',   // 文化设计部: 设计任务
  'secretariat': 'meeting',          // 秘书处: 会议记录
  'host-broadcast': 'audio-project', // 主持播音部: 音频项目
  'dev-operations': 'mindmap',       // 发展运营部: 导图(流程规划)
  'multimedia': 'video-project',     // 多媒体工作部: 视频项目
  'event-planning': 'activity',      // 活动策划部: 活动
};

// 部门 → 可用类型列表(工作台可创建)
const DEPT_ALLOWED_TYPES = {
  'media-directing': ['storyboard', 'script', 'video-project', 'mindmap'],
  'editorial-public': ['article', 'mindmap'],
  'culture-design': ['design-task', 'mindmap'],
  'secretariat': ['meeting', 'mindmap'],
  'host-broadcast': ['audio-project', 'mindmap'],
  'dev-operations': ['mindmap'],
  'multimedia': ['video-project', 'script', 'storyboard', 'mindmap'],
  'event-planning': ['activity', 'mindmap'],
};

function getDeptDefaultType(deptId) { return DEPT_DEFAULT_TYPES[deptId] || 'mindmap'; }
function getDeptAllowedTypes(deptId) { return DEPT_ALLOWED_TYPES[deptId] || ['mindmap']; }

function getDefaultItemName(type) {
  const names = { script: '新剧本', mindmap: '新导图', story: '新故事', storyboard: '新分镜',
    article: '新推文', 'design-task': '新设计任务', activity: '新活动', meeting: '新会议记录',
    'audio-project': '新音频项目', 'video-project': '新视频项目' };
  return names[type] || '新项目';
}

function getItemTypeLabel(type) {
  const labels = { script: '剧本', mindmap: '导图', story: '故事', storyboard: '分镜',
    article: '推文', 'design-task': '设计任务', activity: '活动', meeting: '会议记录',
    'audio-project': '音频项目', 'video-project': '视频项目' };
  return labels[type] || type;
}

// ─── 持久化 ───────────────────────────────────────────
function saveProjects() {
  const data = projects.map(p => ({
    id: p.id, type: p.type, name: p.name, data: p.data,
    createdAt: p.createdAt, updatedAt: p.updatedAt,
    owner: p.owner, parentId: p.parentId || undefined,
    deleted: p.deleted || undefined, deletedAt: p.deletedAt || undefined,
    visibility: p.visibility || 'private',
    departmentId: p.departmentId || undefined,  // 部门项目归属(部门化改造)
    assigneeId: p.assigneeId || undefined,      // 分配给干事(只读增强)
    _version: p._version || 0,
    syncedFrom: p.syncedFrom || undefined,
  }));
  saveJSON(PROJECTS_FILE, data);
}

// ─── 权限校验（基于 auth） ──────────────────────────────
// 部门项目(departmentId 非空): 部长/副部长可编辑, 干事只读(被分配者可编辑)
// 个人项目(无部门): 维持原逻辑(owner/admin/public-edit)
function canEditProject(userName, project, auth) {
  if (!userName || !auth.getUser(userName)) return false;
  if (auth.isAdmin(userName)) return true;   // 站长
  if (project.owner === userName) return true;
  if (project.visibility === 'public-edit') return auth.canEdit(userName);
  if (project.visibility === 'public-read') return false;
  // 部门项目: 本部门部长/副部长可编辑
  if (project.departmentId && auth.getDepartmentId(userName) === project.departmentId) {
    if (auth.canEditInDept(userName)) return true;
    // 干事: 被分配给该项目的可编辑
    if (project.assigneeId === userName) return true;
  }
  return false;
}

function canDeleteProject(userName, project, auth) {
  if (!userName || !auth.getUser(userName)) return false;
  if (auth.isAdmin(userName)) return true;
  if (project.owner === userName) return true;
  // 部门项目: 本部门部长可删除
  if (project.departmentId && auth.getDepartmentId(userName) === project.departmentId && auth.isDeptLeader(userName)) {
    return true;
  }
  return false;
}

// 部门项目可见性: 本部门成员可见; 干事只读(除非被分配); 部长/副部长可编辑
// 返回 'none' | 'read' | 'edit'
function getProjectAccess(userName, project, auth) {
  if (!userName || !auth.getUser(userName)) return 'none';
  if (auth.isAdmin(userName)) return 'edit';            // 站长
  if (auth.isDeputyAdmin(userName)) return 'read';      // 副站长: 全局只读
  if (project.visibility === 'public-edit') return auth.canEdit(userName) ? 'edit' : 'read';
  if (project.visibility === 'public-read') return 'read';
  if (project.owner === userName) return 'edit';
  if (project.departmentId) {
    if (auth.getDepartmentId(userName) !== project.departmentId) return 'none';  // 部门硬隔离
    if (auth.canEditInDept(userName)) return 'edit';     // 部长/副部长
    if (project.assigneeId === userName) return 'edit';  // 被分配的干事
    return 'read';                                       // 普通干事只读
  }
  return 'none';
}

function canViewProject(userName, project, auth) {
  return getProjectAccess(userName, project, auth) !== 'none';
}

function canChangeVisibility(userName, project, auth) {
  if (!userName || !auth.getUser(userName)) return false;
  return auth.isAdmin(userName) || project.owner === userName;
}

// ─── 撤回/恢复 ────────────────────────────────────────
function pushProjectOp(projectId, userId, action, before, after) {
  if (!projectOps.has(projectId)) projectOps.set(projectId, []);
  const ops = projectOps.get(projectId);
  ops.push({ userId, action, before, after, timestamp: Date.now() });
  if (ops.length > 200) ops.splice(0, ops.length - 200);
  projectRedoOps.delete(projectId);
}

// ─── 公共 API ─────────────────────────────────────────
function getProject(id) { return projects.find(p => p.id === id); }

function getAllProjects() { return projects; }

function getVisibleProjects(userName, auth) {
  return projects.filter(p => {
    if (p.deleted) return false;
    // 部门项目: 按部门隔离过滤
    if (p.departmentId) {
      // 站长/副站长可见全部; 本部门成员可见; public-read/public-edit 全局公开
      if (auth.isAdmin(userName) || auth.isDeputyAdmin(userName)) return true;
      if (auth.getDepartmentId(userName) === p.departmentId) return true;
      return p.visibility === 'public-read' || p.visibility === 'public-edit';
    }
    if (p.visibility === 'private') return auth.isAdmin(userName) || p.owner === userName;
    return true;
  });
}

function getDeletedProjects(userName, auth) {
  if (!auth.isAdmin(userName)) return [];
  return projects.filter(p => p.deleted);
}

function createProject(type, name, data, owner, opts) {
  const p = {
    id: uuid().slice(0, 12),
    type, name: name || '未命名',
    data: data || getDefaultData(type),
    createdAt: Date.now(), updatedAt: Date.now(),
    owner: owner || 'unknown',
    visibility: 'private',
    departmentId: (opts && opts.departmentId) || undefined,  // 部门项目归属
    assigneeId: (opts && opts.assigneeId) || undefined,      // 分配给干事
    _version: 0,
  };
  projects.push(p);
  saveProjects();
  return p;
}

function updateProject(id, updates) {
  const p = getProject(id);
  if (!p) return null;
  if (updates.name !== undefined) p.name = updates.name;
  if (updates.data !== undefined) {
    pushProjectOp(id, updates._userId || 'system', 'update', JSON.parse(JSON.stringify(p.data)), JSON.parse(JSON.stringify(updates.data)));
    p.data = updates.data;
  }
  p.updatedAt = Date.now();
  p._version = (p._version || 0) + 1;
  saveProjects();
  return p;
}

function softDeleteProject(id) {
  const p = getProject(id);
  if (!p) return null;
  p.deleted = true;
  p.deletedAt = Date.now();
  saveProjects();
  return p;
}

function restoreProject(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return null;
  p.deleted = false;
  p.deletedAt = undefined;
  p.updatedAt = Date.now();
  saveProjects();
  return p;
}

function permanentDeleteProject(id) {
  const idx = projects.findIndex(x => x.id === id);
  if (idx === -1) return false;
  projects.splice(idx, 1);
  saveProjects();
  return true;
}

function addProjectItem(projectId, itemType, itemName) {
  const p = getProject(projectId);
  if (!p) return null;
  if (!['script', 'mindmap', 'story', 'storyboard'].includes(itemType)) return null;
  if (!p.data.items) p.data.items = [];
  const item = {
    id: uuid().slice(0, 12),
    type: itemType,
    name: itemName || getDefaultItemName(itemType),
    data: JSON.parse(JSON.stringify(getDefaultData(itemType))),
  };
  p.data.items.push(item);
  p.updatedAt = Date.now();
  saveProjects();
  return item;
}

function removeProjectItem(projectId, itemId) {
  const p = getProject(projectId);
  if (!p || !p.data.items) return false;
  const idx = p.data.items.findIndex(it => it.id === itemId);
  if (idx === -1) return false;
  p.data.items.splice(idx, 1);
  p.updatedAt = Date.now();
  saveProjects();
  return true;
}

function setProjectVisibility(projectId, visibility) {
  const p = getProject(projectId);
  if (!p) return null;
  p.visibility = visibility;
  p.updatedAt = Date.now();
  saveProjects();
  return p;
}

function undoProjectOp(projectId, userName) {
  const p = getProject(projectId);
  if (!p) return null;
  const ops = projectOps.get(projectId) || [];
  const idx = ops.map((o, i) => ({ o, i })).filter(x => x.o.userId === userName).pop();
  if (!idx) return null;
  const op = ops[idx.i];
  p.data = JSON.parse(JSON.stringify(op.before));
  p.updatedAt = Date.now();
  ops.splice(idx.i, 1);
  projectOps.set(projectId, ops);
  if (!projectRedoOps.has(projectId)) projectRedoOps.set(projectId, []);
  projectRedoOps.get(projectId).push({ ...op, after: op.before, before: op.after });
  const redoStack = projectRedoOps.get(projectId);
  if (redoStack.length > 50) redoStack.splice(0, redoStack.length - 50);
  saveProjects();
  return { id: p.id, name: p.name, data: p.data, updatedAt: p.updatedAt };
}

function redoProjectOp(projectId, userName) {
  const p = getProject(projectId);
  if (!p) return null;
  const redoStack = projectRedoOps.get(projectId) || [];
  const idx = redoStack.map((o, i) => ({ o, i })).filter(x => x.o.userId === userName).pop();
  if (!idx) return null;
  const op = redoStack[idx.i];
  p.data = JSON.parse(JSON.stringify(op.after));
  p.updatedAt = Date.now();
  redoStack.splice(idx.i, 1);
  if (!projectOps.has(projectId)) projectOps.set(projectId, []);
  projectOps.get(projectId).push({ ...op, before: op.before, after: op.after });
  saveProjects();
  return { id: p.id, name: p.name, data: p.data, updatedAt: p.updatedAt };
}

// 可跨机同步的项目：只包含公开项目，且不含已删除项目
function getShareableProjects() {
  return projects
    .filter(p => !p.deleted && p.visibility && p.visibility !== 'private')
    .map(p => ({ ...p }));
}

function mergeProjects(remoteList, source) {
  remoteList.forEach(rp => {
    // 只同步公开项目：私密项目不允许跨机同步
    if (!rp.visibility || rp.visibility === 'private') return;

    const local = projects.find(p => p.id === rp.id);
    if (!local) {
      // 新增同步项目，保留来源标记
      const synced = {
        ...rp,
        _version: rp._version || 0,
        syncedFrom: source || rp.syncedFrom || undefined,
      };
      projects.push(synced);
    } else {
      // 本地已有该项目：只有当初始来源相同或是公开项目时才允许合并，
      // 防止本地私密项目被同名/同 ID 的远端项目覆盖。
      if (local.owner !== rp.owner && local.visibility === 'private') return;

      const remoteVer = rp._version || 0;
      const localVer = local._version || 0;
      // 本地是原始项目时，不应接受远端带来的 syncedFrom 标记
      const incoming = { ...rp };
      if (!local.syncedFrom) delete incoming.syncedFrom;
      if (remoteVer > localVer) {
        Object.assign(local, incoming);
        local._version = remoteVer;
        // 只有本地副本才保留/更新 syncedFrom；本地原始项目不标记来源
        if (source && local.syncedFrom) local.syncedFrom = source;
      } else if (remoteVer === localVer && rp.updatedAt > local.updatedAt) {
        Object.assign(local, incoming);
        local._version = localVer + 1;
        if (source && local.syncedFrom) local.syncedFrom = source;
      }
    }
  });
}

function transferProjects(ids, fromServerId, fromName) {
  const transferred = [];
  ids.forEach(id => {
    const p = projects.find(x => x.id === id);
    if (p) transferred.push({ ...p });
  });
  return transferred;
}

module.exports = {
  // 数据
  projects,
  getProject,
  getAllProjects,
  getVisibleProjects,
  getDeletedProjects,
  // CRUD
  createProject,
  updateProject,
  softDeleteProject,
  restoreProject,
  permanentDeleteProject,
  // 子项
  addProjectItem,
  removeProjectItem,
  // 可见性
  setProjectVisibility,
  // 撤回/恢复
  undoProjectOp,
  redoProjectOp,
  // 同步
  mergeProjects,
  transferProjects,
  saveProjects,
  getShareableProjects,
  // 权限
  canEditProject,
  canDeleteProject,
  canChangeVisibility,
  canViewProject,
  getProjectAccess,
  getDefaultData,
  getItemTypeLabel,
  getDeptDefaultType,
  getDeptAllowedTypes,
};
