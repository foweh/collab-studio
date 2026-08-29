// ─── 部门服务 ──────────────────────────────────────────
// 8 部门定义 + 用户部门归属管理 + 项目部门归属
// 数据: data/departments.json(部门定义)
// 用户部门字段: users.json 的 departmentId / deptRole
// 项目部门字段: projects.json 的 departmentId

const path = require('path');
const { loadJSON, saveJSON, DATA_DIR } = require('../utils/persist');

const DEPARTMENTS_FILE = path.join(DATA_DIR, 'departments.json');

// 8 部门定义(吉林农业科技学院校易班学生工作站)
const DEFAULT_DEPARTMENTS = [
  { id: 'media-directing',   name: '传媒编导部',   description: '视频内容生产、活动直播导播、影视后期' },
  { id: 'editorial-public',  name: '采编宣传部',   description: '公众号运营、新闻采写、思政项目申报' },
  { id: 'culture-design',    name: '文化设计部',   description: '平面视觉、文创、手绘、简单动画' },
  { id: 'secretariat',       name: '秘书处',       description: '行政统筹、档案归档、物资管理、考勤' },
  { id: 'host-broadcast',    name: '主持播音部',   description: '线下主持、音频栏目、配音、朗诵演讲' },
  { id: 'dev-operations',    name: '发展运营部',   description: '平台运维、易班APP、轻应用、数据统计' },
  { id: 'multimedia',        name: '多媒体工作部', description: '抖音短视频、航拍、微电影' },
  { id: 'event-planning',    name: '活动策划部',   description: '线上线下活动全流程策划与执行' },
];

// 部门角色
const DEPT_ROLES = ['leader', 'vice', 'member']; // 部长/副部长/干事

let departments = loadJSON(DEPARTMENTS_FILE, null);
if (!Array.isArray(departments) || departments.length === 0) {
  // 首次初始化(向后兼容: 老数据无此文件时用默认 8 部门)
  departments = JSON.parse(JSON.stringify(DEFAULT_DEPARTMENTS));
  saveDepartments();
}

function saveDepartments() { saveJSON(DEPARTMENTS_FILE, departments); }

// ─── 部门查询 ─────────────────────────────────────────
function listDepartments() {
  return departments.map(d => ({ ...d }));
}

function getDepartment(deptId) {
  return departments.find(d => d.id === deptId) || null;
}

function isValidDepartmentId(deptId) {
  return !!deptId && departments.some(d => d.id === deptId);
}

function isValidDeptRole(role) {
  return DEPT_ROLES.includes(role);
}

// ─── 用户部门归属(操作 auth.users 对象) ──────────────
// usersObj 由 auth.js 传入(引用同一对象), users 对象格式:
// { departmentId, deptRole } 追加在用户记录上

function getDeptRoleLabel(role) {
  const map = { leader: '部长', vice: '副部长', member: '干事' };
  return map[role] || '';
}

/**
 * 分配用户到部门并设置部门角色
 * @param {object} user 用户记录对象(引用)
 * @param {string|null} deptId 部门 id 或 null(移除部门)
 * @param {string|null} deptRole 部门角色 leader/vice/member
 * @returns {boolean}
 */
function assignUserToDept(user, deptId, deptRole) {
  if (!user) return false;
  if (deptId === null || deptId === undefined || deptId === '') {
    user.departmentId = null;
    user.deptRole = null;
    return true;
  }
  if (!isValidDepartmentId(deptId)) return false;
  if (deptRole && !isValidDeptRole(deptRole)) return false;
  user.departmentId = deptId;
  user.deptRole = deptRole || 'member';
  return true;
}

// 用户默认无部门(向后兼容: 老用户补空字段)
function ensureUserDeptFields(user) {
  if (user && user.departmentId === undefined) user.departmentId = null;
  if (user && user.deptRole === undefined) user.deptRole = null;
}

// ─── 部门成员 ─────────────────────────────────────────
function getDeptMembers(usersObj, deptId) {
  const members = [];
  for (const name in usersObj) {
    const u = usersObj[name];
    if (u.departmentId === deptId) {
      members.push({ name, deptRole: u.deptRole || 'member', isAdmin: !!u.isAdmin, role: u.role || 'commenter' });
    }
  }
  return members;
}

// ─── 项目部门归属 ─────────────────────────────────────
// 项目对象增加 departmentId 字段(project.js 持久化时保留)

module.exports = {
  DEFAULT_DEPARTMENTS,
  DEPT_ROLES,
  departments,
  listDepartments,
  getDepartment,
  isValidDepartmentId,
  isValidDeptRole,
  assignUserToDept,
  ensureUserDeptFields,
  getDeptRoleLabel,
  getDeptMembers,
  saveDepartments,
};
