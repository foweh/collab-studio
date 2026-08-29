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
├── sync-build.js          # 同步构建：主版 → android / installer 副本
├── scripts/
│   └── gen-ssl-certs.js   # HTTPS 自签名证书生成
├── services/              # 业务逻辑
│   ├── auth.js            # 用户认证 / 会话令牌（持久化）
│   ├── project.js         # 项目管理 CRUD
│   ├── ai.js              # DeepSeek AI（导图生成/展开/聊天）
│   ├── capcut-mate.js     # 剪映（CapCut）集成
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
├── scenedetect-server/    # 视频场景检测 (PySceneDetect Flask 子进程)
├── data/                  # 运行时数据 (不提交 git)
├── docs/                  # 文档
├── android/               # Android 客户端工程（内嵌 Node.js 副本）
├── installer/             # Windows 安装器工程（内嵌 Node.js 副本）
└── Dockerfile             # Docker 部署
```

## 登录与权限

- 打开页面输入用户名即自动注册（密码可选），也可设置密码
- 管理员从 `.admin.env` 配置（`ADMIN_USERNAME` / `ADMIN_PASSWORD`），启动时自动创建
- 角色三级：admin / editor / commenter，管理员可在设置面板调整
- 会话令牌持久化到 `data/tokens.json`，服务器重启后已登录用户不掉线
- 三级限流防爆破：按 IP（20/分）、按用户（5/分）、按设备指纹（3/分）
- 设备指纹封禁：管理员可拉黑指定设备

## AI 思维导图（DeepSeek）

- 设置面板填入 DeepSeek API Token（`data/ai-config.json`）
- 一键生成：输入主题自动生成 30-80 节点的多层导图
- AI 展开：选中节点后让 AI 生成子分支
- AI 聊天协作：对话式编辑导图，AI 可执行增删改节点、连线、着色等操作
- 接口限流：`/api/ai/mindmap/*` 按 IP 5 次/分钟

## 剪映（CapCut）集成

- 自动扫描剪映小助手端口，连接后同步草稿、推送操作批次、导出视频
- 剪映安装路径可配置：`POST /api/capcut/install-path`，或编辑 `data/capcut-mate.json` 的 `installPath`
- 无小助手服务时自动进入模拟模式，便于开发调试

## 视频场景检测（PySceneDetect）

- 服务端启动时自动拉起 Flask 子进程（需 Python + `pip install flask opencv-python imagehash Pillow`）
- 支持 2GB 内视频上传、按镜头切分、截图导出、进度查询
- 页面入口：`http://localhost:3000/scenedetect.html`

## 白板

- 多用户实时白板（Canvas），支持画笔/形状/连线/光标共享
- 内容按房间持久化到 `data/whiteboards/`，刷新/重启可恢复

## HTTPS 部署

```bash
# 一键生成自签名证书（默认包含 localhost + 127.0.0.1）
node scripts/gen-ssl-certs.js

# 或指定域名/IP
node scripts/gen-ssl-certs.js myhost.lan 192.168.1.100
```

- 证书生成到 `ssl/`（已 gitignore），重启服务自动启用 HTTPS（443），HTTP 3000 自动跳转
- 自签名证书浏览器会提示不安全，首次访问需手动信任；正式部署建议使用受信任 CA 证书

## 同步构建（三端副本）

```bash
# 把主版 server.js + services/ + utils/ 同步到 android/ 与 installer/ 副本
node sync-build.js

# 同步并合并 package.json 依赖（新依赖添加后执行一次）
node sync-build.js --deps
```

- android/ 与 installer/ 内嵌后端副本由本脚本维护，**不要手工修改副本代码**
- 每次修改主版后端代码后运行一次 `node sync-build.js` 即可

## 🔐 安全

- 所有密码经 bcryptjs 哈希存储
- Helmet 安全头 + 输入校验 + 路径穿越防护
- 三级频率限制 (per-IP / per-user / per-fingerprint)
- 私有项目不进入局域网同步广播（`getShareableProjects` 过滤）
- 音乐代理域名白名单（防 SSRF）
- `data/` 目录运行时权限 700

## 📄 License

MIT
