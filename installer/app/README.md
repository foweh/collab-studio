# 🎬 CollabStudio — 多机协作创作工作室

> 零配置局域网实时协作平台，支持剧本、思维导图、故事、分镜同步编辑。

## ✨ 功能

| 模块 | 说明 |
|------|------|
| 📜 **剧本编辑器** | 幕/场/对白三级结构，角色管理，拖拽排序，导出 Markdown |
| 🧠 **思维导图** | 多根节点，拖拽/缩放/双指缩放，颜色/标记，导出 PNG |
| 📖 **故事编辑器** | 章节管理，富文本编辑，实时同步 |
| 🎬 **分镜 (Storyboard)** | 镜头列表 + 绘画板 (Canvas)，图片上传，镜头锁防冲突 |
| 💬 **群聊 & 私聊** | 群组管理，消息持久化，管理员审批 |
| 🔒 **权限控制** | 三级可见性 (private/public-read/public-edit)，角色管理 |
| 🌐 **局域网自动发现** | UDP 广播 + 服务端桥接，零配置即插即用 |
| ⚡ **实时秒级同步** | 版本化乐观并发控制，图片上传延迟冲突自动解决 |
| 📱 **移动端适配** | 触屏拖拽/双指缩放/长按菜单 |

## 🛠 技术栈

- **Runtime**: Node.js ≥ 18
- **Server**: Express 4 + Socket.IO 4
- **Client**: Vanilla JS + Vue 3 (分镜 SPA)
- **Auth**: bcryptjs + session tokens + device fingerprint
- **Storage**: JSON 文件 (atomic rename 持久化)
- **LAN**: UDP broadcast + Socket.IO bridge

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 启动服务（默认端口 3000）
node server.js

# 或指定端口
node server.js --port 8080
```

浏览器打开 `http://localhost:3000`，多台电脑在同一局域网下自动发现。

## 🏗 项目结构

```
collab-studio/
├── server.js              # 主服务端 (Express + Socket.IO + UDP)
├── services/              # 业务逻辑
│   ├── auth.js            # 用户认证
│   ├── project.js         # 项目管理 CRUD
│   ├── annotation.js      # 批注系统
│   └── logger.js          # 审计日志
├── utils/
│   ├── persist.js         # JSON 原子读写
│   └── ratelimit.js       # 滑动窗口限流
├── public/                # 前端静态文件
│   ├── index.html         # 主应用壳
│   ├── app.js             # 面板路由 + Socket 事件
│   ├── login.html         # 登录页
│   ├── mindmap.js         # 思维导图引擎
│   ├── script-editor.js   # 剧本编辑器
│   ├── story-editor.js    # 故事编辑器
│   ├── fenjing/           # 分镜 Vue3 SPA
│   └── style.css          # 全局样式
├── data/                  # 运行时数据 (不提交 git)
├── docs/                  # 文档
└── Dockerfile             # Docker 部署
```

## 🔐 安全

- 所有密码经 bcryptjs 哈希存储
- Helmet 安全头 + 输入校验 + 路径穿越防护
- 三级频率限制 (per-IP / per-user / per-fingerprint)
- `data/` 目录运行时权限 700

## 📄 License

MIT
