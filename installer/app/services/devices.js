// ─── 设备管理服务 ──────────────────────────────────────
// 传媒编导部/多媒体工作部设备管理: 借还/状态流转/历史
// 数据: data/devices.json + data/device_borrow_logs.json
// 权限: 干事查看/借用/归还自己; 副部长+新增/编辑; 部长删除/状态变更; 跨部门不可见

const path = require('path');
const { v4: uuid } = require('uuid');
const { loadJSON, saveJSON, DATA_DIR } = require('../utils/persist');

const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const BORROW_LOGS_FILE = path.join(DATA_DIR, 'device_borrow_logs.json');

const DEVICE_TYPES = ['摄像机', '三脚架', '补光灯', '收音设备', '无人机', '稳定器', '相机'];
const DEVICE_STATUSES = ['available', 'borrowed', 'maintenance'];

let devices = loadJSON(DEVICES_FILE, []);
if (!Array.isArray(devices)) devices = [];
let borrowLogs = loadJSON(BORROW_LOGS_FILE, []);
if (!Array.isArray(borrowLogs)) borrowLogs = [];

function saveDevices() { saveJSON(DEVICES_FILE, devices); }
function saveBorrowLogs() { saveJSON(BORROW_LOGS_FILE, borrowLogs); }

// ─── 查询(部门隔离) ───────────────────────────────────
function listDevices(userName, auth, filter = {}) {
  const isAdmin = auth.isAdmin(userName) || auth.isDeputyAdmin(userName);
  return devices.filter(d => {
    if (!isAdmin && d.departmentId !== auth.getDepartmentId(userName)) return false; // 跨部门不可见
    if (filter.type && d.type !== filter.type) return false;
    if (filter.status && d.status !== filter.status) return false;
    if (filter.keyword && !(d.name || '').includes(filter.keyword) && !(d.model || '').includes(filter.keyword)) return false;
    return true;
  });
}

function getDevice(id) {
  return devices.find(d => d.id === id) || null;
}

// ─── 新增(副部长+) ────────────────────────────────────
function addDevice({ departmentId, name, type, model, serialNumber, createdBy }) {
  const dev = {
    id: 'dev_' + uuid().slice(0, 10),
    departmentId,
    name: name || '未命名设备',
    type: type || '其他',
    model: model || '',
    serialNumber: serialNumber || '',
    status: 'available',
    borrowedBy: null,
    borrowedAt: null,
    expectedReturnAt: null,
    maintenanceNote: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy,
  };
  devices.push(dev);
  saveDevices();
  return dev;
}

// ─── 编辑(副部长+) ────────────────────────────────────
function updateDevice(id, updates) {
  const d = getDevice(id);
  if (!d) return null;
  if (updates.name !== undefined) d.name = updates.name;
  if (updates.type !== undefined) d.type = updates.type;
  if (updates.model !== undefined) d.model = updates.model;
  if (updates.serialNumber !== undefined) d.serialNumber = updates.serialNumber;
  d.updatedAt = new Date().toISOString();
  saveDevices();
  return d;
}

// ─── 删除(部长) ───────────────────────────────────────
function deleteDevice(id) {
  const idx = devices.findIndex(d => d.id === id);
  if (idx === -1) return false;
  devices.splice(idx, 1);
  saveDevices();
  return true;
}

// ─── 借用(干事+) ──────────────────────────────────────
function borrowDevice(id, borrowerName, expectedReturnAt) {
  const d = getDevice(id);
  if (!d) return { error: '设备不存在' };
  if (d.status !== 'available') return { error: '设备当前不可借用(' + d.status + ')' };
  d.status = 'borrowed';
  d.borrowedBy = borrowerName;
  d.borrowedAt = new Date().toISOString();
  d.expectedReturnAt = expectedReturnAt || null;
  d.updatedAt = new Date().toISOString();
  const log = {
    id: 'log_' + uuid().slice(0, 10),
    deviceId: id,
    borrowerName,
    borrowerId: borrowerName,
    borrowedAt: d.borrowedAt,
    expectedReturnAt: d.expectedReturnAt,
    returnedAt: null,
    status: 'borrowed',
  };
  borrowLogs.push(log);
  saveDevices();
  saveBorrowLogs();
  return { ok: true, device: d, log };
}

// ─── 归还(借用人本人) ────────────────────────────────
function returnDevice(id, userName) {
  const d = getDevice(id);
  if (!d) return { error: '设备不存在' };
  if (d.status !== 'borrowed') return { error: '设备未在借用中' };
  if (d.borrowedBy !== userName) return { error: '仅借用人本人可归还' };
  const log = borrowLogs.filter(l => l.deviceId === id && l.status === 'borrowed').pop();
  if (log) {
    log.returnedAt = new Date().toISOString();
    log.status = 'returned';
  }
  d.status = 'available';
  d.borrowedBy = null;
  d.borrowedAt = null;
  d.expectedReturnAt = null;
  d.updatedAt = new Date().toISOString();
  saveDevices();
  saveBorrowLogs();
  return { ok: true, device: d };
}

// ─── 状态变更(部长: 维护中/启用) ──────────────────────
function setDeviceStatus(id, status) {
  const d = getDevice(id);
  if (!d) return { error: '设备不存在' };
  if (!['available', 'maintenance'].includes(status)) return { error: '无效状态' };
  if (d.status === 'borrowed') return { error: '设备借用中, 不可变更状态' };
  d.status = status;
  d.updatedAt = new Date().toISOString();
  saveDevices();
  return { ok: true, device: d };
}

// ─── 借用历史 ─────────────────────────────────────────
function getDeviceLogs(id) {
  return borrowLogs.filter(l => l.deviceId === id).sort((a, b) => (b.borrowedAt || '').localeCompare(a.borrowedAt || ''));
}

// ─── 超时检测(可选, 后续迭代) ─────────────────────────
function checkOverdue() {
  const now = new Date();
  let changed = false;
  devices.forEach(d => {
    if (d.status === 'borrowed' && d.expectedReturnAt && new Date(d.expectedReturnAt) < now) {
      const log = borrowLogs.filter(l => l.deviceId === d.id && l.status === 'borrowed').pop();
      if (log) log.status = 'overdue';
      changed = true;
    }
  });
  if (changed) saveBorrowLogs();
}

// ─── 权限辅助 ─────────────────────────────────────────
// 设备权限: 干事 read / 副部长 read+write / 部长 read+write+admin
function canAccessDevice(userName, dev, auth) {
  if (!userName || !dev) return 'none';
  if (auth.isAdmin(userName) || auth.isDeputyAdmin(userName)) return 'write';
  if (auth.getDepartmentId(userName) !== dev.departmentId) return 'none';
  const role = auth.getDeptRole(userName);
  if (role === 'leader' || role === 'vice') return 'write';
  return 'read';
}

// 设备部门限定: 仅传媒编导部/多媒体工作部使用
const DEVICE_DEPTS = ['media-directing', 'multimedia'];
function isDeviceDept(deptId) { return DEVICE_DEPTS.includes(deptId); }

module.exports = {
  DEVICE_TYPES,
  DEVICE_STATUSES,
  DEVICE_DEPTS,
  isDeviceDept,
  devices,
  borrowLogs,
  listDevices,
  getDevice,
  addDevice,
  updateDevice,
  deleteDevice,
  borrowDevice,
  returnDevice,
  setDeviceStatus,
  getDeviceLogs,
  checkOverdue,
  canAccessDevice,
  saveDevices,
  saveBorrowLogs,
};
