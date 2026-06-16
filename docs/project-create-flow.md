# 项目创建逻辑详解

## 概述

本文档详细说明 Collab Studio 项目创建的整体流程，涵盖前端交互、后端处理、数据持久化、权限控制、事件广播等完整链路。

---

## 一、整体架构

```
[前端 Browser]  <--Socket.IO-->  [后端 server.js]  <-->  [services/project.js]  <-->  [projects.json]
                                       |
                                  [对等节点 peers]
```

- 前端通过 Socket.IO 发送 `project-create` 事件
- 后端 server.js 接收并处理，创建后将结果同步给所有客户端和对等节点
- 项目数据最终持久化到 `projects.json`

---

## 二、前端触发流程

### 2.1 入口点

文件: `public/app.js`

用户点击"新建项目"按钮，触发 `showNewProjectModal()` 弹窗函数。

### 2.2 弹窗输入

```javascript
// 第519行附近
socket.emit('project-create', { type: 'project', name, data: { items: [] } });
```

发送的数据结构:
```javascript
{
  type: 'project',       // 项目类型
  name: '项目名称',      // 用户输入的名称
  data: { items: [] }   // 项目数据，初始为空项目列表
}
```

### 2.3 等待响应

```javascript
// 第291行
socket.on('project-created', (p) => {
  projects.push(p);      // 追加到本地数组
  renderProjects();      // 重新渲染项目列表UI
});
```

---

## 三、后端处理流程

文件: `server.js` 第580-594行

### 3.1 事件接收

```javascript
socket.on('project-create', (data) => {
```

### 3.2 数据验证

```javascript
if (!validateEventPayload('project-create', data).valid) return;
```

调用 `validateEventPayload` 验证数据结构和安全性。

### 3.3 重名检查

```javascript
if (projects.some(p => p.name === name && !p.deleted && p.type !== 'folder')) {
  socket.emit('project-update-error', '项目名称已存在');
  return;
}
```

检查逻辑:
- 同一级别下不允许存在同名项目
- 已删除(deleted=true)的项目不参与检查
- 文件夹类型不受此限制

### 3.4 创建项目对象

```javascript
const p = {
  id: uuid().slice(0, 12),                                    // 12位唯一标识符
  type: data.type,                                            // 项目类型
  name: name || '未命名',                                      // 名称，默认"未命名"
  data: data.data || projectSvc.getDefaultData(data.type),    // 项目数据
  createdAt: Date.now(),                                      // 创建时间戳
  updatedAt: Date.now(),                                      // 更新时间戳
  owner: socket.userName || SERVER_NAME,                      // 所有者
  visibility: 'private'                                        // 可见性，默认私有
};
```

项目类型(type)对应关系:

| type | 含义 | 默认数据 |
|------|------|----------|
| script | 剧本 | { acts: [] } |
| mindmap | 导图 | { nodes: [], edges: [] } |
| story | 故事 | { chapters: [] } |
| storyboard | 分镜 | { items: [] } |
| folder | 文件夹 | { children: [] } |
| project | 组合项目 | { items: [] } |

### 3.5 添加到内存

```javascript
projects.push(p);
```

### 3.6 通知发起客户端

```javascript
socket.emit('project-created', p);
```

将完整的项目对象返回给请求方。

### 3.7 操作日志

```javascript
addLog(socket.id, socket.userName || SERVER_NAME, 'created', p.type, p.name);
```

记录操作审计日志，格式: `[socketId] [username] created [type] [name]`

### 3.8 同步对等节点

```javascript
broadcastToPeers({ type: 'projects-sync', projects: projects.map(x => ({...x})) }, null);
```

将完整项目列表同步给所有连接的协作节点，实现多机协作。

### 3.9 持久化存储

```javascript
projectSvc.saveProjects();
```

---

## 四、数据持久化

文件: `services/project.js`

### 4.1 保存函数

```javascript
function saveProjects() {
  const data = projects.map(p => ({
    id: p.id,
    type: p.type,
    name: p.name,
    data: p.data,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    owner: p.owner,
    parentId: p.parentId || undefined,
    deleted: p.deleted || undefined,
    deletedAt: p.deletedAt || undefined,
    visibility: p.visibility || 'private',
  }));
  saveJSON(PROJECTS_FILE, data);
}
```

### 4.2 存储路径

```javascript
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
// DATA_DIR 默认: path.join(os.homedir(), '.collab-studio')
```

### 4.3 数据加载

启动时通过 `loadJSON(PROJECTS_FILE, [])` 加载已有项目。

---

## 五、权限控制

### 5.1 编辑权限

```javascript
function canEditProject(userName, project, auth) {
  if (!userName || !auth.getUser(userName)) return false;     // 用户必须存在
  if (auth.isAdmin(userName)) return true;                     // 管理员可编辑所有项目
  if (project.owner === userName) return auth.canEdit(userName);  // 所有者可编辑
  if (project.visibility === 'public-edit') return auth.canEdit(userName);  // 公开编辑项目
  if (project.visibility === 'public-read') return false;     // 公开只读项目不可编辑
  return false;
}
```

### 5.2 删除权限

```javascript
function canDeleteProject(userName, auth) {
  if (!userName || !auth.getUser(userName)) return false;
  return auth.isAdmin(userName);
}
```

只有管理员可以删除项目。

### 5.3 可见性修改权限

```javascript
function canChangeVisibility(userName, project, auth) {
  if (!userName || !auth.getUser(userName)) return false;
  return auth.isAdmin(userName) || project.owner === userName;
}
```

管理员或所有者可以修改项目可见性。

---

## 六、完整时序图

```
用户                    前端app.js              server.js           services/project.js       对等节点
 |                         |                      |                      |                      |
 |  点击"新建项目"          |                      |                      |                      |
 |------------------------->|                      |                      |                      |
 |                         |  showNewProjectModal |                      |                      |
 |<-------------------------|                      |                      |                      |
 |                         |                      |                      |                      |
 |  输入名称，点击确认      |                      |                      |                      |
 |------------------------->|                      |                      |                      |
 |                         | socket.emit          |                      |                      |
 |                         | project-create ----->|                      |                      |
 |                         |                      |                      |                      |
 |                         |                      | validateEventPayload |                      |
 |                         |                      | validateEventPayload |                      |
 |                         |                      |         |             |                      |
 |                         |                      | 重名检查 |             |                      |
 |                         |                      |         |             |                      |
 |                         |                      | 创建项目对象          |                      |
 |                         |                      |         |             |                      |
 |                         |                      | projects.push(p)    |                      |
 |                         |                      |         |             |                      |
 |                         |                      | addLog               |                      |
 |                         |                      |         |             |                      |
 |                         |                      | broadcastToPeers ----------------> 同步项目列表
 |                         |                      |         |             |                      |
 |                         |                      | saveProjects -------------------------> 持久化
 |                         |                      |         |             |                      |
 |                         | socket.emit          |         |             |                      |
 |                         | project-created <----|         |             |                      |
 |                         |         |            |         |             |                      |
 |                         | projects.push(p)     |         |             |                      |
 |                         | renderProjects()     |         |             |                      |
 |  更新UI                 |         |            |         |             |                      |
 |<-------------------------|         |            |         |             |                      |
```

---

## 七、错误处理

| 错误类型 | 触发条件 | 返回事件 |
|----------|----------|----------|
| 数据验证失败 | validateEventPayload 返回 invalid | 无(直接return) |
| 项目名称已存在 | 同级存在同名未删除项目 | project-update-error |
| 无编辑权限 | canEditProject 返回 false | project-update-error |

---

## 八、相关文件索引

| 文件 | 职责 |
|------|------|
| public/app.js | 前端Socket.IO客户端，发送project-create请求 |
| server.js | 后端Socket.IO服务端，处理项目创建逻辑 |
| services/project.js | 项目数据模型、CRUD操作、权限校验 |
| utils/persist.js | JSON文件持久化工具 |
| services/auth.js | 用户认证和权限管理 |
