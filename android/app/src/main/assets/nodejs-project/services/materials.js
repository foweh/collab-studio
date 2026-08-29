// ─── 素材库服务 ────────────────────────────────────────
// 各部门独立素材库: 上传/列表/详情/编辑/删除/下载统计
// 数据: data/materials.json
// 文件: uploads/{departmentId}/{yyyymm}/{uuid}.ext (由 server.js 的 multer 落盘)
// 权限: 干事查看/下载; 副部长+上传/编辑; 部长删除; 跨部门不可见

const path = require('path');
const { v4: uuid } = require('uuid');
const { loadJSON, saveJSON, DATA_DIR } = require('../utils/persist');

const MATERIALS_FILE = path.join(DATA_DIR, 'materials.json');

const MATERIAL_CATEGORIES = ['视频素材', '图片素材', '设计源文件', '文档模板', '音频素材'];

let materials = loadJSON(MATERIALS_FILE, []);
if (!Array.isArray(materials)) materials = [];

function saveMaterials() { saveJSON(MATERIALS_FILE, materials); }

// ─── 查询 ─────────────────────────────────────────────
// 部门隔离: 只能看本部门素材; 站长/副站长全局
function listMaterials(userName, auth, filter = {}) {
  const isAdmin = auth.isAdmin(userName) || auth.isDeputyAdmin(userName);
  return materials.filter(m => {
    if (m.status === 'archived' && !isAdmin) return false;
    if (!isAdmin && m.departmentId !== auth.getDepartmentId(userName)) return false; // 跨部门不可见
    if (filter.category && m.category !== filter.category) return false;
    if (filter.tag && !(m.tags || []).includes(filter.tag)) return false;
    if (filter.keyword && !(m.name || '').includes(filter.keyword)) return false;
    return true;
  });
}

function getMaterial(id) {
  return materials.find(m => m.id === id) || null;
}

// ─── 新增(上传后调用) ─────────────────────────────────
function addMaterial({ departmentId, name, fileUrl, fileSize, fileType, category, tags, uploadedBy }) {
  const mat = {
    id: 'mat_' + uuid().slice(0, 10),
    departmentId,
    name: name || '未命名素材',
    fileUrl,
    fileSize: fileSize || 0,
    fileType: fileType || 'application/octet-stream',
    category: category || '其他',
    tags: Array.isArray(tags) ? tags : [],
    uploadedBy,
    uploadedAt: new Date().toISOString(),
    downloadCount: 0,
    status: 'active',
  };
  materials.push(mat);
  saveMaterials();
  return mat;
}

// ─── 更新(副部长+) ────────────────────────────────────
function updateMaterial(id, updates) {
  const m = getMaterial(id);
  if (!m) return null;
  if (updates.name !== undefined) m.name = updates.name;
  if (updates.category !== undefined) m.category = updates.category;
  if (updates.tags !== undefined) m.tags = Array.isArray(updates.tags) ? updates.tags : [];
  saveMaterials();
  return m;
}

// ─── 删除(部长) ───────────────────────────────────────
function deleteMaterial(id) {
  const idx = materials.findIndex(m => m.id === id);
  if (idx === -1) return false;
  materials.splice(idx, 1);
  saveMaterials();
  return true;
}

// 软归档(部长)
function archiveMaterial(id) {
  const m = getMaterial(id);
  if (!m) return false;
  m.status = 'archived';
  saveMaterials();
  return true;
}

// ─── 下载统计 ─────────────────────────────────────────
function incrementDownload(id) {
  const m = getMaterial(id);
  if (!m) return null;
  m.downloadCount = (m.downloadCount || 0) + 1;
  saveMaterials();
  return m;
}

// ─── 权限辅助 ─────────────────────────────────────────
// 素材权限: 干事 read / 副部长 read+write / 部长 read+write+delete
function canAccessMaterial(userName, mat, auth) {
  if (!userName || !mat) return 'none';
  if (auth.isAdmin(userName) || auth.isDeputyAdmin(userName)) return 'write';
  if (auth.getDepartmentId(userName) !== mat.departmentId) return 'none'; // 跨部门不可见
  const role = auth.getDeptRole(userName);
  if (role === 'leader') return 'write';
  if (role === 'vice') return 'write';
  return 'read'; // 干事
}

function canUploadMaterial(userName, auth) {
  if (!userName) return false;
  if (auth.isAdmin(userName)) return true;
  const role = auth.getDeptRole(userName);
  return role === 'leader' || role === 'vice'; // 部长/副部长可上传
}

module.exports = {
  MATERIAL_CATEGORIES,
  materials,
  listMaterials,
  getMaterial,
  addMaterial,
  updateMaterial,
  deleteMaterial,
  archiveMaterial,
  incrementDownload,
  canAccessMaterial,
  canUploadMaterial,
  saveMaterials,
};
