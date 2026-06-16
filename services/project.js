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
    default: return {};
  }
}

function getDefaultItemName(type) {
  const names = { script: '新剧本', mindmap: '新导图', story: '新故事', storyboard: '新分镜' };
  return names[type] || '新项目';
}

function getItemTypeLabel(type) {
  const labels = { script: '剧本', mindmap: '导图', story: '故事', storyboard: '分镜' };
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
  }));
  saveJSON(PROJECTS_FILE, data);
}

// ─── 权限校验（基于 auth） ──────────────────────────────
function canEditProject(userName, project, auth) {
  if (!userName || !auth.getUser(userName)) return false;
  if (auth.isAdmin(userName)) return true;
  if (project.owner === userName) return true;
  if (project.visibility === 'public-edit') return auth.canEdit(userName);
  if (project.visibility === 'public-read') return false;
  return false;
}

function canDeleteProject(userName, project, auth) {
  if (!userName || !auth.getUser(userName)) return false;
  if (auth.isAdmin(userName)) return true;
  if (project.owner === userName) return true;
  return false;
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
    if (p.visibility === 'private') return auth.isAdmin(userName) || p.owner === userName;
    return true;
  });
}

function getDeletedProjects(userName, auth) {
  if (!auth.isAdmin(userName)) return [];
  return projects.filter(p => p.deleted);
}

function createProject(type, name, data, owner) {
  const p = {
    id: uuid().slice(0, 12),
    type, name: name || '未命名',
    data: data || getDefaultData(type),
    createdAt: Date.now(), updatedAt: Date.now(),
    owner: owner || 'unknown',
    visibility: 'private',
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

function mergeProjects(remoteList) {
  remoteList.forEach(rp => {
    const local = projects.find(p => p.id === rp.id);
    if (!local) projects.push({ ...rp });
    else if (rp.updatedAt > local.updatedAt) Object.assign(local, rp);
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
  // 权限
  canEditProject,
  canDeleteProject,
  canChangeVisibility,
  getDefaultData,
  getItemTypeLabel,
};
