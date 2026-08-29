// ─── 通用审核/状态机引擎 ──────────────────────────────
// 各部门流程类项目共用的状态流转引擎
// 数据: 状态存项目 data.status, 流转记录存 data/workflow_logs.json
// 权限: 每步可操作角色可配置(leader/vice/member/admin)

const path = require('path');
const { v4: uuid } = require('uuid');
const { loadJSON, saveJSON, DATA_DIR } = require('../utils/persist');

const WORKFLOW_LOGS_FILE = path.join(DATA_DIR, 'workflow_logs.json');
let workflowLogs = loadJSON(WORKFLOW_LOGS_FILE, []);
if (!Array.isArray(workflowLogs)) workflowLogs = [];

function saveWorkflowLogs() { saveJSON(WORKFLOW_LOGS_FILE, workflowLogs); }

// ─── 各部门状态机配置 ─────────────────────────────────
// statuses: 有序状态列表; 每步的 allowedRoles: 可执行该流转的角色
const WORKFLOWS = {
  // 采编部推文: 草稿→初审(副部长)→终审(部长)→发布
  article: {
    statuses: [
      { id: 'draft', label: '草稿', color: '#94a3b8' },
      { id: 'first_review', label: '待初审', color: '#f59e0b' },
      { id: 'second_review', label: '待终审', color: '#f97316' },
      { id: 'published', label: '已发布', color: '#22c55e' },
      { id: 'rejected', label: '已驳回', color: '#ef4444' },
    ],
    transitions: {
      draft: [ { to: 'first_review', roles: ['leader', 'vice'], label: '提交初审' } ],
      first_review: [ { to: 'second_review', roles: ['vice', 'leader'], label: '通过初审' }, { to: 'draft', roles: ['vice', 'leader'], label: '驳回' } ],
      second_review: [ { to: 'published', roles: ['leader'], label: '终审发布' }, { to: 'draft', roles: ['leader'], label: '驳回' } ],
      published: [],
      rejected: [ { to: 'draft', roles: ['leader', 'vice'], label: '重新编辑' } ],
    },
  },
  // 活动策划: 策划→待审批→执行→结束→复盘
  activity: {
    statuses: [
      { id: 'planning', label: '策划中', color: '#94a3b8' },
      { id: 'pending_approval', label: '待审批', color: '#f59e0b' },
      { id: 'executing', label: '执行中', color: '#3b82f6' },
      { id: 'ended', label: '已结束', color: '#8b5cf6' },
      { id: 'reviewed', label: '已复盘', color: '#22c55e' },
      { id: 'rejected', label: '已驳回', color: '#ef4444' },
    ],
    transitions: {
      planning: [ { to: 'pending_approval', roles: ['leader', 'vice'], label: '提交审批' } ],
      pending_approval: [ { to: 'executing', roles: ['leader', 'admin'], label: '批准执行' }, { to: 'planning', roles: ['leader', 'admin'], label: '驳回修改' } ],
      executing: [ { to: 'ended', roles: ['leader', 'vice'], label: '活动结束' } ],
      ended: [ { to: 'reviewed', roles: ['leader', 'vice'], label: '完成复盘' } ],
      reviewed: [],
      rejected: [ { to: 'planning', roles: ['leader', 'vice'], label: '重新策划' } ],
    },
  },
  // 设计任务: 待接单→进行中→待审核→完成
  'design-task': {
    statuses: [
      { id: 'todo', label: '待接单', color: '#94a3b8' },
      { id: 'doing', label: '进行中', color: '#3b82f6' },
      { id: 'review', label: '待审核', color: '#f59e0b' },
      { id: 'done', label: '已完成', color: '#22c55e' },
      { id: 'rejected', label: '被打回', color: '#ef4444' },
    ],
    transitions: {
      todo: [ { to: 'doing', roles: ['member', 'vice', 'leader'], label: '接单' } ],
      doing: [ { to: 'review', roles: ['member', 'vice', 'leader'], label: '提交审核' } ],
      review: [ { to: 'done', roles: ['leader', 'vice'], label: '验收通过' }, { to: 'doing', roles: ['leader', 'vice'], label: '打回修改' } ],
      done: [],
      rejected: [ { to: 'doing', roles: ['member', 'vice', 'leader'], label: '继续修改' } ],
    },
  },
  // 秘书处会议记录: 记录→归档
  meeting: {
    statuses: [
      { id: 'draft', label: '记录中', color: '#94a3b8' },
      { id: 'archived', label: '已归档', color: '#22c55e' },
    ],
    transitions: {
      draft: [ { to: 'archived', roles: ['leader', 'vice', 'member'], label: '归档' } ],
      archived: [ { to: 'draft', roles: ['leader'], label: '重新编辑' } ],
    },
  },
  // 主持播音部音频项目: 草稿→录制→后期→完成
  'audio-project': {
    statuses: [
      { id: 'draft', label: '稿件打磨', color: '#94a3b8' },
      { id: 'recording', label: '录制中', color: '#f59e0b' },
      { id: 'post', label: '后期制作', color: '#8b5cf6' },
      { id: 'done', label: '已输出', color: '#22c55e' },
    ],
    transitions: {
      draft: [ { to: 'recording', roles: ['member', 'vice', 'leader'], label: '开始录制' } ],
      recording: [ { to: 'post', roles: ['member', 'vice', 'leader'], label: '进入后期' } ],
      post: [ { to: 'done', roles: ['vice', 'leader'], label: '输出完成' } ],
      done: [],
    },
  },
  // 视频项目: 前期→拍摄→后期→成片
  'video-project': {
    statuses: [
      { id: 'preproduction', label: '前期筹备', color: '#94a3b8' },
      { id: 'shooting', label: '拍摄中', color: '#f59e0b' },
      { id: 'postproduction', label: '后期剪辑', color: '#8b5cf6' },
      { id: 'finished', label: '已成片', color: '#22c55e' },
    ],
    transitions: {
      preproduction: [ { to: 'shooting', roles: ['leader', 'vice'], label: '开始拍摄' } ],
      shooting: [ { to: 'postproduction', roles: ['leader', 'vice'], label: '进入后期' } ],
      postproduction: [ { to: 'finished', roles: ['leader', 'vice'], label: '成片完成' } ],
      finished: [],
    },
  },
};

// 默认兜底工作流(无配置的类型用简单流转)
const FALLBACK = {
  statuses: [ { id: 'open', label: '进行中', color: '#3b82f6' }, { id: 'done', label: '已完成', color: '#22c55e' } ],
  transitions: { open: [ { to: 'done', roles: ['leader', 'vice', 'member'], label: '完成' } ], done: [] },
};

function getWorkflow(type) {
  return WORKFLOWS[type] || FALLBACK;
}

function getStatusLabel(type, statusId) {
  const wf = getWorkflow(type);
  const s = wf.statuses.find(x => x.id === statusId);
  return s ? s.label : statusId;
}

function getStatusColor(type, statusId) {
  const wf = getWorkflow(type);
  const s = wf.statuses.find(x => x.id === statusId);
  return s ? s.color : '#94a3b8';
}

// 获取某状态下可执行的流转(按角色过滤)
function getAvailableTransitions(type, statusId, deptRole, isAdmin) {
  const wf = getWorkflow(type);
  const t = wf.transitions[statusId] || [];
  return t.filter(x => isAdmin || !x.roles || x.roles.includes(deptRole));
}

// 执行状态流转: 校验角色 + 记录日志
// project: 项目对象(data.status 会被更新), auth: auth 模块, userName: 操作人
function transition(project, toStatus, userName, deptRole, auth, opts = {}) {
  const type = project.type;
  const wf = getWorkflow(type);
  const cur = (project.data && project.data.status) || (wf.statuses[0] && wf.statuses[0].id) || 'open';
  // 校验目标状态存在
  if (!wf.statuses.some(s => s.id === toStatus)) return { error: '无效的目标状态: ' + toStatus };
  // 校验流转合法性
  const t = (wf.transitions[cur] || []).find(x => x.to === toStatus);
  if (!t) return { error: '不允许从「' + getStatusLabel(type, cur) + '」流转到「' + getStatusLabel(type, toStatus) + '」' };
  // 校验角色
  if (!t.roles.includes(deptRole) && !(auth && auth.isAdmin && auth.isAdmin(userName))) {
    return { error: '你的角色无权执行此操作' };
  }
  // 执行
  const oldStatus = cur;
  if (!project.data) project.data = {};
  project.data.status = toStatus;
  if (project.data.updatedAt) project.data.updatedAt = Date.now();
  // 记录日志
  workflowLogs.push({
    id: 'wf_' + uuid().slice(0, 10),
    projectId: project.id,
    type,
    from: oldStatus,
    to: toStatus,
    operator: userName,
    note: opts.note || '',
    at: new Date().toISOString(),
  });
  if (workflowLogs.length > 2000) workflowLogs = workflowLogs.slice(-2000);
  saveWorkflowLogs();
  return { ok: true, from: oldStatus, to: toStatus };
}

// 查询项目流转历史
function getProjectLogs(projectId) {
  return workflowLogs.filter(l => l.projectId === projectId);
}

module.exports = {
  WORKFLOWS,
  getWorkflow,
  getStatusLabel,
  getStatusColor,
  getAvailableTransitions,
  transition,
  getProjectLogs,
  workflowLogs,
};
