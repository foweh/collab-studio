# CollabStudio 协作创作工作室

## 入口
- server.js — Node.js 单体服务端 (Express + Socket.IO)
- public/login.html — 登录页
- public/app.js — 主应用壳 (面板路由)
- public/fenjing/index.html — 分镜 SPA (Vue3)

## 数据模型
### 项目 (projects.json)
- id / type / name / owner / visibility
- _version — 乐观并发控制版本戳
- createdAt / updatedAt / deleted / deletedAt
- parentId — 文件夹层级
- data.items[] — 项目容器子项
### 项目类型
- script — 剧本 (acts[].scenes[].lines[])
- mindmap — 思维导图 (nodes[] + edges[])
- story — 故事 (chapters[])
- storyboard — 分镜 (items[])
- folder — 文件夹 (children[])
- project — 复合容器
### 分镜 (fenjing-state.json)
- projectName / scenes[] / shots[]
- _version — 版本戳
- 多项目: fenjing-projects.json + fenjing-p-{id}.json
### 用户 (users.json)
- name / passwordHash / isAdmin / role / avatar
- fingerprint — 设备指纹
- isBanned / lastSeen
### 群聊
- groups.json — 群聊分组
- group-chat-history.json — 群聊消息 (每组上限500条)
### 私聊
- chat-history.json — 私聊历史
- message-permissions.json — 私聊权限 (管理员审批)
### 操作日志
- operation-log.json — 审计日志 (上限500条)

## 实时同步
### Socket.IO 双通道
- 主 namespace `/` — 项目管理、聊天、白板
- 分镜 namespace `/fenjing` — 分镜状态同步
### 版本化乐观并发控制
- 每个状态对象有 `_version` 计数器
- 客户端更新带 `baseVersion`
- 服务端 compare-and-swap
- 版本冲突 → 拒绝 + 返回当前状态 → 客户端 rebase 重试
### 写序列化
- enqueueWrite(key, fn) — Promise 链串行写
- 同一对象写入不并发
### 镜头级细粒度更新
- fenjing:shot-update — 单镜头 patch
- fenjing:shots-update — 批量操作 (排序/增删)
- 不同镜头互不影响
### 桥接 (Server↔Server)
- UDP 广播发现 (端口 41234)
- Socket.IO client 连接远端
- 消息类型: projects-sync / realtime / focus-lock / fenjing-sync
- seenMessages 去重 (30s TTL)
### 消息广播
- broadcastToBrowsers — io.emit
- broadcastToPeers — mesh 转发 (排除来源)
- socket.broadcast.emit — 排除发送者

## 认证流程
### 登录
- 用户名 (必填) + 密码 (可选)
- 新用户自动注册
- bcryptjs 密码哈希
- device fingerprint 设备指纹
- sessionStorage + token 会话管理
- 角色: admin → editor → commenter (权限递减)
### 权限控制
- canEditProject — owner / admin / public-edit
- canDeleteProject — owner / admin
- canChangeVisibility — owner / admin
### 安全
- helmet 安全头
- rate-limit (per-IP / per-user / per-fingerprint)
- 输入验证 (validateString / validateId)
- 文件路径穿越防护
### 踢出
- admin-ban-user → kicked 事件 + disconnect
- 设备封禁 (fingerprint)
- 密码重置踢出

## 局域网发现
### UDP 广播
- 每5秒广播 discover 到 255.255.255.255:41234
- 收到 discover → 回复 hello
- 低 serverId 的一方主动发起桥接
### 桥接连接
- Socket.IO client → 远端服务器
- handshake 交换 serverId / name / port
- 成功后发送 projects-sync 全量同步
### 重连
- 5分钟宽限期 (RECONNECT_TIMEOUT)
- 期间断开保留节点信息
- 超时后移除节点

## 图片上传
### 头像上传
- POST /api/upload-avatar
- base64 → 文件 (public/avatars/)
- 限制: 2MB / 每天5次
- 广播 user-avatar-updated
### 分镜图片上传
- POST /api/fenjing/upload-image
- base64 → 文件 (data/fenjing-images/)
- 上传只存文件，不修改状态
- 版本化 shot-update 应用 URL
### 冲突处理
- 上传前记录 baseVersion
- 上传成功后 emit shot-update(baseVersion)
- 版本冲突 → rejected → 自动重试

## 项目可见性与踢出
### 可见性级别
- private — 仅 owner/admin 可见
- public-read — 所有人可读
- public-edit — 所有人可编辑
### projectViewers 追踪
- Map<projectId, Set<socketId>>
- project-open / project-close 事件注册
- disconnect 时清理
### 踢出逻辑
- 可见性变更 → 遍历 projectViewers
- 非 owner/admin 且失去权限 → project-kicked
- 客户端: showAlert + 强制回项目列表
- 同时 emit project-removed 清理列表

## 客户端模块
### 主应用壳 (app.js)
- 5面板导航: 项目/设备/日志/消息/设置
- window.CollabStudio 全局 API
- registerCollabModule 模块注册
- openProject → 路由到对应模块
- switchModule → 面板切换
### 剧本编辑器 (script-editor.js)
- 幕(Act) → 场(Scene) → 行(Line)
- 行类型: dialogue / action / env
- 角色管理 + 拖拽排序
- 导出 Markdown
### 思维导图 (mindmap.js + mindmap-full.html)
- 节点 + 连线画布 (Canvas)
- 缩放/拖拽/XMind风格
- 实时同步 mindmap-updated
- 导出 PNG
### 故事编辑器 (story-editor.js)
- 章节管理
- 富文本编辑
- 实时同步 story-updated
### 分镜 (fenjing/index.html)
- Vue3 SPA
- 镜头列表 + 绘画板 (Canvas)
- fenjingSocket /fenjing namespace
- shot-lock 编辑锁
- localStorage ↔ 服务器双向同步
- 导出/下载分镜图
### 绘画板 (fenjing 内嵌)
- Canvas 画笔/形状/橡皮
- 保存到镜头 → HTTP 上传图片
- 版本化 shot-update 避免冲突
### 聊天
- 私聊 (需管理员审批权限)
- 群聊 (创建/邀请/解散)
- 消息持久化 + 实时广播

## 服务器管理
### 优雅关闭
- SIGINT/SIGTERM → gracefulShutdown
- emit server-shutdown 到所有客户端
- 300ms 后 disconnectSockets + server.close
### 登录页持续检测
- reconnectionAttempts: Infinity
- server-shutdown → serverDown=true
- connect 时 serverDown→false → 显示"✅ 已恢复"
- 标签页不关就一直重试
### CLI
- --port 指定端口
- --join IP:PORT 测试模式
- .admin.env 管理员配置

## 技术栈
- Node.js + Express 4
- Socket.IO 4 (WebSocket + polling)
- Vue 3 (分镜 SPA)
- bcryptjs 密码哈希
- helmet 安全头
- uuid 唯一ID
- JSON 文件持久化 (atomic rename)
- UDP dgram 局域网发现