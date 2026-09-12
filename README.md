# Collab Studio

> 局域网实时协作创作工作室 —— 剧本 / 思维导图 / 故事 / 分镜，零配置，无需云端。

![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-LAN-FF6B6B)

Collab Studio 是一个**面向局域网的多人在线协作创作平台**。每台电脑执行 `node server.js`，同网段节点通过 UDP 广播自动发现并组网，无需中心服务器、无需公网。除创作编辑器外，还内置素材库、设备管理、审核状态机、部门工作台等组织协作能力。

- 详细介绍与目录结构：[docs/项目介绍.md](docs/项目介绍.md)
- 仓库：https://github.com/foweh/collab-studio

---

## 功能

| 类别 | 功能 |
| --- | --- |
| 创作编辑器 | 剧本、思维导图（类 XMind，支持 AI 生成/展开/对话）、故事、分镜、白板 |
| 多机协作 | UDP 自动发现 + Socket.IO 实时同步，支持 `--join` 手动加入 |
| 部门化 | 8 部门工作台、素材库、设备管理、审核状态机、数据看板 |
| 组织管理 | 用户与角色（站长/编辑者/评论者/观察者）、消息权限审批、群聊、找回密码审批 |
| AI 能力 | DeepSeek 集成：思维导图生成、文档助手（初稿/续写/润色/大纲/拟标题） |
| 第三方集成 | 剪映草稿生成（capcut-mate）、视频场景检测（PySceneDetect + TransNetV2） |
| 其他 | 中英双语、HTTPS 自签名、二维码手机扫码访问、纯前端本地工具集 |

---

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务（默认端口 3000，自动跳转 HTTPS）
node server.js

# 指定端口
node server.js --port 3001

# 加入已有的工作室节点
node server.js --join 192.168.1.100:3000
```

浏览器打开 `http://localhost:3000`，输入名字即可进入。

### 多人协作

- 每台机器运行 `node server.js` 启动一个节点；
- 各节点通过 **UDP 广播**（端口 `41234`）自动发现并组网；
- 任意节点进入后，工作室内的剧本 / 导图 / 故事 / 分镜等实时同步；
- 也可用 `--join` 手动加入指定节点。

### Docker

```bash
docker compose up -d
```

映射 `3000`（HTTP）与 `41234/udp`（发现），挂载 `./data` 持久化；管理员密码通过环境变量 `ADMIN_PASSWORD` 注入。

---

## 目录结构（简）

```
collab-studio/
├─ server.js          服务端入口（Express + Socket.IO + UDP 发现 + HTTPS）
├─ services/          业务逻辑：auth / project / department / state-machine / ai / materials / devices ...
├─ utils/             工具：persist（JSON 落盘）、ratelimit
├─ public/            前端（原生 JS）：app.js、各编辑器、dept-views、tools、vendor 本地化库
├─ scripts/           gen-ssl-certs.js
├─ scenedetect-server/ 视频场景检测（Flask + PySceneDetect + TransNetV2）
├─ android/           Android 版外壳
├─ installer/         Windows 安装器
├─ test/              测试
└─ docs/              文档
```

完整结构见 [docs/项目介绍.md](docs/项目介绍.md)。

---

## 技术栈

- **后端**：Node.js (>=18) + Express + Socket.IO + UDP(dgram)
- **前端**：原生 JavaScript (ES Modules) + Canvas；第三方库全部本地化（离线可用）
- **AI**：DeepSeek API（`deepseek-chat`）
- **认证**：bcryptjs + 会话 token
- **视频场景检测**：Python + Flask + PySceneDetect + TransNetV2

---

## 数据与配置

| 路径 | 说明 | 入库 |
| --- | --- | --- |
| `data/` | 运行时数据（用户 / 项目 / 日志 / 权限 / token / AI 配置等） | 否 |
| `uploads/` | 素材上传文件 | 否 |
| `ssl/` | TLS 自签名证书 | 否 |
| `.admin.env` | 管理员账户（明文，启动时哈希） | 否 |
| `.env.example` | 环境变量模板 | 是 |

端口（均可用环境变量覆盖）：HTTP `3000`、HTTPS `443`、UDP `41234`、场景检测 `5000/5001`、剪映 `9527`。

---

## 开发约定

后端存在三份副本（主版 / `android/` / `installer/`）。**只改主版，再用同步脚本同步**，避免漂移：

```bash
node sync-build.js          # 同步 server.js / services/ / utils/ 并校验 SHA-256 一致
node sync-build.js --deps   # 同步的同时合并依赖
```

注意：`sync-build.js` 目前只同步后端，不含 `public/` 前端。

---

## 测试

```bash
node test/basic.test.js
node test/lan-sync.test.js
```

---

## 许可证

[MIT](LICENSE) © CollabStudio
