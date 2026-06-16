# 问题诊断报告

## Session: project-permission-storyboard-issues
## 日期: 2026-06-14

---

## 一、问题总览

| # | 问题类型 | 严重程度 | 描述 |
|---|---------|---------|------|
| 1 | 数据初始化不完整 | 高 | `getDefaultData` 缺少 `storyboard` 类型 |
| 2 | 批量创建无权限校验 | 高 | `project-create-batch` 未校验用户权限 |
| 3 | 分镜系统独立 | 高 | fenjing 与项目系统完全脱节 |
| 4 | 权限校验逻辑混乱 | 中 | public-read 项目权限判断不一致 |
| 5 | 前后端重复校验 | 低 | 重名检查重复，可能导致体验不一致 |

---

## 二、详细问题分析

### 问题1: `getDefaultData` 缺少 `storyboard` 类型

**文件**: 
- `public/app.js` 第448-455行
- `services/project.js` 第23-30行

**现状**:
```javascript
// 前端 app.js
function getDefaultData(type) {
  switch (type) {
    case 'script': return { acts: [] };
    case 'mindmap': return { nodes: [], edges: [] };
    case 'story': return { chapters: [] };
    case 'folder': return { children: [] };
    default: return {};  // storyboard 和 project 都返回空对象
  }
}
```

```javascript
// 后端 projectSvc
function getDefaultData(type) {
  switch (type) {
    case 'script': return { acts: [] };
    case 'mindmap': return { nodes: [], edges: [] };
    case 'story': return { chapters: [] };
    case 'folder': return { children: [] };
    case 'project': return { items: [] };
    default: return {};  // storyboard 缺少
  }
}
```

**影响**:
- 创建 `storyboard` 类型项目时，默认数据为空对象 `{}`
- 可能导致前端渲染错误或数据不一致

**修复建议**:
```javascript
// 添加 storyboard 默认数据
case 'storyboard': return { items: [] };  // 或适当的分镜数据结构
```

---

### 问题2: `project-create-batch` 无权限校验

**文件**: `server.js` 第630-648行

**现状**:
```javascript
socket.on('project-create-batch', (data) => {
  const { name, children } = data;
  if (!name) return;  // 只检查 name，非空即创建
  // 没有权限校验！
  const folder = { id: uuid().slice(0, 12), type: 'folder', name, ... };
  projects.push(folder);
  // ...
});
```

**影响**:
- 任何登录用户都可以创建任意名称的文件夹和子项目
- 无法控制谁能创建项目

**修复建议**:
```javascript
socket.on('project-create-batch', (data) => {
  if (!socket.userName) return;  // 必须登录
  if (!auth.canCreateProject?.(socket.userName)) {  // 如果有权限控制
    socket.emit('project-update-error', '你没有创建项目的权限');
    return;
  }
  // ...
});
```

---

### 问题3: 分镜系统与项目系统完全独立

**文件**: `server.js` 第1212-1237行

**现状**:
- 分镜使用独立的 `fenjingState` 和 `fenjing-state.json`
- 与 `projects` 数组完全分离
- `/fenjing` 和 `/storyboard` 是独立路由
- 分镜数据保存在 `FENJING_FILE`，不经过项目服务

```javascript
// 独立的分镜状态
let fenjingState = loadFenjingState() || { projectName: '未命名项目', scenes: [], shots: [] };

// 独立的事件处理
fenjingNsp.on('connection', (socket) => {
  socket.on('fenjing:shots-update', (shots) => {
    fenjingState.shots = shots;
    saveFenjingState(fenjingState);  // 保存到 fenjing-state.json
    // ...
  });
});
```

**影响**:
- 分镜内容无法在项目列表中看到
- 无法给分镜设置可见性/权限
- 无法在项目详情页查看分镜

**修复建议**:
- 方案A: 将 fenjing 作为 `storyboard` 类型项目的一个子项
- 方案B: 在项目系统中添加对 fenjing 状态的引用
- 方案C: 统一使用 projects.json 存储所有类型数据

---

### 问题4: public-read 项目权限判断问题

**文件**: `services/project.js` 第52-60行

**现状**:
```javascript
function canEditProject(userName, project, auth) {
  if (!userName || !auth.getUser(userName)) return false;
  if (auth.isAdmin(userName)) return true;
  if (project.owner === userName) return auth.canEdit(userName);
  if (project.visibility === 'public-edit') return auth.canEdit(userName);
  if (project.visibility === 'public-read') return false;  // 明确禁止编辑
  return false;
}
```

**问题**:
- `auth.canEdit(userName)` 可能返回 `false`（用户被禁用编辑）
- 但对于管理员或所有者，应该绕过这个检查
- `canChangeVisibility` 的逻辑略有不同

**修复建议**:
```javascript
function canEditProject(userName, project, auth) {
  if (!userName || !auth.getUser(userName)) return false;
  if (auth.isAdmin(userName)) return true;
  if (project.owner === userName) return true;  // 所有者始终可编辑
  if (project.visibility === 'public-edit') return true;  // 公开编辑项目
  if (project.visibility === 'public-read') return false;  // 公开只读
  return false;
}
```

---

### 问题5: 前后端重复校验重名

**文件**: 
- `public/app.js` 第518-523行
- `server.js` 第585-588行

**现状**:
```javascript
// 前端 app.js - 新建项目
if (projects.some(p => p.name === name && !p.deleted)) {
  showAlert('项目名称已存在，请换一个', '提示', '⚠️');
  return;
}
socket.emit('project-create', { type: 'project', name, data: { items: [] } });

// 后端 server.js - 再次检查
if (projects.some(p => p.name === name && !p.deleted && p.type !== 'folder')) {
  socket.emit('project-update-error', '项目名称已存在');
  return;
}
```

**问题**:
- 前端基于本地数据检查，后端基于服务器数据检查
- 多用户环境下可能产生竞态条件
- 两个检查逻辑略有不同（后端排除 folder）

**修复建议**:
- 只保留后端检查，前端不做预检
- 或确保前端数据与后端同步

---

## 三、假设验证状态

| 假设 | 状态 | 证据 |
|------|------|------|
| H1: 项目创建数据问题 | **已确认** | getDefaultData 缺少 storyboard 和 project 类型 |
| H2: 权限校验漏洞 | **已确认** | project-create-batch 无权限校验 |
| H3: 分镜集成问题 | **已确认** | fenjingState 与 projects 完全独立 |
| H4: 前后端事件不一致 | **部分确认** | 重复校验存在，但基本逻辑一致 |
| H5: 多节点同步冲突 | **待验证** | 需要运行时验证 |

---

## 四、修复优先级

### P0 (紧急修复)
1. 补充 `getDefaultData` 中缺失的类型
2. 为 `project-create-batch` 添加权限校验

### P1 (重要修复)
3. 将分镜系统与项目系统集成
4. 统一权限校验逻辑

### P2 (优化)
5. 移除前端重复的重名检查

---

## 六、修复记录

### 2026-06-14 修复内容

#### 修复1: getDefaultData 补充缺失类型
- **文件**: `public/app.js`, `services/project.js`
- **变更**: 添加 `storyboard` 和 `project` 类型的默认数据 `{ items: [] }`

#### 修复2: project-create-batch 添加权限校验
- **文件**: `server.js`
- **变更**: 添加 `if (!socket.userName) return;` 检查

#### 修复3: canEditProject 权限逻辑修正
- **文件**: `services/project.js`
- **变更**: 所有者始终可编辑自己的项目，不受 `auth.canEdit` 状态影响

#### 修复4: 移除前端重复的重名检查
- **文件**: `public/app.js`
- **变更**: 移除前端的新建项目时的重复重名检查，由后端统一处理

---

## 七、后续行动

- [x] 与用户确认修复优先级
- [x] 实施 P0 修复
- [ ] 验证修复效果
- [ ] 继续 P1 修复（分镜集成）
