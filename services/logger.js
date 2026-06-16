// ─── 操作审计日志服务 ──────────────────────────────────

const path = require('path');
const { loadJSON, saveJSON, DATA_DIR } = require('../utils/persist');

const LOG_FILE = path.join(DATA_DIR, 'operation-log.json');
const MAX_LOG = 500;

let logId = 0;
const operationLog = [];

function loadOperationLog() {
  const data = loadJSON(LOG_FILE, []);
  if (Array.isArray(data)) {
    data.forEach(e => { if (e.id > logId) logId = e.id; });
    return data;
  }
  return [];
}

// 初始化
const savedLogs = loadOperationLog();
savedLogs.forEach(e => operationLog.push(e));

let ioRef = null;

function setIO(io) { ioRef = io; }

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
  if (ioRef) ioRef.emit('operation-log', entry);
  return entry;
}

function getRecentLogs(count = 50) { return operationLog.slice(-count); }

function appendOperationLog(entry) {
  let log = loadJSON(LOG_FILE, []);
  log.push(entry);
  if (log.length > MAX_LOG) log = log.slice(log.length - MAX_LOG);
  saveJSON(LOG_FILE, log);
}

module.exports = { setIO, addLog, getRecentLogs };
