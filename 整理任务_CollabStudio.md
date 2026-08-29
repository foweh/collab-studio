# Collab Studio 整理任务清单

> 局域网实时协作创作工作室(剧本/导图/故事/分镜 + AI + 剪映 + 场景检测)整理与修复任务书。
> 执行方式:P0 → P1 → P2 逐项完成,每项独立 git commit,完成后更新本文件状态。

## 项目概述

Collab Studio 是一个"创作协作全家桶":剧本/故事/导图/分镜实时协作、DeepSeek AI 集成、剪映(CapCut)草稿同步、PySceneDetect 视频场景检测、私聊/群聊/批注/白板,三端打包(Windows EXE / Android APK / Docker)。

## 三份 server.js 差异摘要

| 版本 | 路径 | 行数 | 状态 |
|------|------|------|------|
| 主版 | `server.js` | 2789 | 最新(含 AI/音乐代理) |
| Android 版 | `android/app/src/main/assets/nodejs-project/server.js` | 2711 | 缺 AI 模块 + 音乐代理 |
| Installer 版 | `installer/app/server.js` | 2695 | 缺 AI 模块 + 音乐代理,同步过滤/`--data-dir`/merge 来源均回归 |

主要差异:
1. **AI 模块缺失**:两个副本均无 `services/ai.js` 引用和 4 个 `/api/ai/*` 路由
2. **音乐搜索代理缺失**:两个副本均无 `httpJSON`
3. **installer 版同步过滤回归**:13 处 `projects.map(x => ({...x}))`(含私有项目)替代 `getShareableProjects()`
4. **installer 版 `--data-dir` 丢失**:args 解析移到 require persist 之后,参数失效
5. **installer 版 `mergeProjects` 缺 source 参数**:syncedFrom 追踪丢失
6. **启动横幅管理员名硬编码**:主版 `热合曼` / 副本 `admin`

---

## P0 — 安全与隐私(必须立即修复)

### P0-1:统一同步过滤
- 状态:[x]
- 问题:installer 版 13 处全量发送私有项目;main 版出站 `connectToPeer` 2 处也存在同样问题
- 涉及文件:`server.js`(main 版 2671/2681 行)、`installer/app/server.js`(13 处)
- 修复:将 `projects.map(x => ({...x}))` 改为 `projectSvc.getShareableProjects()`
- 预期结果:同步广播只包含公开项目,私有项目不再出现在网络中
- 验收:grep 三份文件确认所有 `projects-sync` 广播均用 `getShareableProjects()`(✅ main 2 处 + installer 14 处已替换,残留 0)
- 测试:冒烟通过 — 私有项目对他人不可见,public-read 项目可见,更新后私有项目仍被过滤
- 备注:顺带发现 `project-create` 硬编码 `visibility:'private'`,传入的 visibility 被忽略(记录待后续处理)

### P0-2:`project-restore` 补权限校验
- 状态:[x]
- 问题:恢复项目无权限校验,任意登录用户可恢复他人已删除项目(delete 有校验而 restore 没有)
- 涉及文件:`server.js`(project-restore handler,约 1443 行)
- 修复:与 `project-delete` 对齐,加 `canDeleteProject(socket.userName, p, auth)` 校验;`validateEventPayload` 补充字符串 ID 支持
- 预期结果:非 owner/admin 无法恢复他人项目
- 验收:非 owner socket 触发 restore 返回权限错误(✅ 冒烟测试:bob 被拒 / alice 成功)

### P0-3:`chat-get-history` 补权限校验
- 状态:[x]
- 问题:读取任意两人聊天历史无权限校验,与"发消息需审批"严重不对称(发要审批、读不用)
- 涉及文件:`server.js`(chat-get-history handler,约 1836 行)
- 修复:仅对话双方本人或已获 `messagePermissions` 授权可读
- 预期结果:未授权用户无法读取他人私聊历史
- 验收:未授权 socket 请求历史返回空或拒绝
- 分析修正:经代码核实,`getChatKey(socket.userName, targetName)` 首参恒为请求者自身,key 天然只可能对应"自己参与的对话",原始越权场景实际不成立;但 `join(':')` 在用户名含冒号时可产生 key 碰撞(历史遗留,用户名校验未排除 `:`),存在读到他人私聊的理论路径。本次加固:解析 key 校验请求者确为对话参与者,非常规 key 保守拒绝
- 测试:✅ 冒烟通过 — 参与者可读自身历史、第三方读不到、超长目标名被拒

### P0-4:AI 端点加频率限制
- 状态:[x]
- 问题:`/api/ai/mindmap/*` 三端点无限流,任意登录用户可无限消耗 DeepSeek API 额度
- 涉及文件:`server.js`(/api/ai/mindmap/generate、expand、chat)
- 修复:按用户 `checkRateLimit`(5 次/分钟)
- 预期结果:AI 调用受频率限制保护
- 验收:连续调用超限后返回限流错误(✅ 冒烟测试:配置 token 后连续调用 6 次,第 6 次返回 429;HTTP 无会话,实际按 IP 限流)

---

## P1 — 架构一致性(本周)

### P1-5:构建脚本结束三份代码漂移
- 状态:[x]
- 问题:三份 server.js + services + utils 手工复制,功能不一致(见差异摘要)
- 涉及文件:新建 `sync-build.js`,同步目标 `android/app/src/main/assets/nodejs-project/`、`installer/app/`
- 修复:编写同步脚本,把主版 `server.js`、`services/`、`utils/` 同步到两个副本;执行一次同步
- 预期结果:三份 server.js 内容一致(hash 相同)
- 验收:`sync-build.js` 存在且执行后三份文件 hash 一致;README 补充"构建时运行"说明
- 结果:✅ 已执行 `node sync-build.js --deps`,三份 server.js SHA-256 完全一致(`9fc4de38...`);副本补齐 `services/ai.js`(原缺失);`package.json` 合并依赖(android 补 helmet,installer 已有);installer 副本四项缺口(`--data-dir`/AI/音乐代理/getShareableProjects)全部恢复,启动验证通过

### P1-6:installer 补齐(由 P1-5 同步后验证)
- 状态:[x]
- 问题:installer 版缺 `--data-dir` 提前解析、AI 模块、音乐代理
- 涉及文件:`installer/app/server.js`
- 修复:P1-5 同步后验证缺失功能已恢复;补回 `--data-dir` 解析位置
- 预期结果:installer 版与主版功能等价
- 验收:installer 版含 `/api/ai/*` 路由与 `--data-dir` 解析
- 结果:✅ P1-5 同步后 installer 版与主版 hash 一致,`--data-dir` 提前解析/AI 路由/音乐代理均恢复;用主版依赖启动验证通过(横幅、AI 端点、数据目录均正常)

### P1-7:会话 token 持久化
- 状态:[x]
- 问题:`sessionTokens` 存内存 Map,服务器重启全部掉线且 token 失效
- 涉及文件:`services/auth.js`
- 修复:token → 用户映射落盘 `data/tokens.json`,启动时加载,过期清理
- 预期结果:重启后已签发 token 仍有效
- 验收:签发 token → 模拟重启 → token 校验通过(✅ 冒烟测试:重启后旧 token 登录成功,伪造 token + 错误密码被拒)

### P1-8:启动横幅管理员名
- 状态:[x]
- 问题:启动横幅硬编码 `热合曼`(主版)/ `admin`(副本),与配置不符时误导
- 涉及文件:`server.js`(启动横幅,约 2765 行)
- 修复:改用 `adminConfig.ADMIN_USERNAME`
- 预期结果:横幅显示实际配置的管理员名
- 验收:启动日志横幅显示 `.admin.env` 中配置的用户名(✅ 验证:横幅输出与 .admin.env 的 ADMIN_USERNAME 一致)

### P1-9:审批请求落盘
- 状态:[x]
- 问题:消息权限审批请求(`msgPermissionRequests`)与群邀请请求(`groupInviteRequests`)存内存数组,重启丢失
- 涉及文件:`server.js`
- 修复:持久化到 `data/pending-requests.json`,启动时恢复
- 预期结果:重启后待审批请求不丢失
- 验收:发起请求 → 重启 → 审批列表仍可见(✅ 冒烟测试:消息权限申请重启后仍存在;顺带修复 `msgPermissionRequests` 原本声明在连接回调内、每连接一份的 bug,已提升到模块级)

---

## P2 — 加固与体验(下个迭代)

### P2-10:HTTPS 证书生成脚本
- 状态:[x]
- 问题:仅自动检测 `ssl/` 目录证书,无证书则明文 HTTP;缺少 HTTPS 部署说明
- 涉及文件:新建 `scripts/gen-ssl-certs.js`、`README.md`
- 修复:openssl 自签名证书生成脚本 + README HTTPS 部署章节
- 预期结果:可一键生成证书启用 HTTPS
- 验收:脚本生成 `ssl/privkey.pem` + `ssl/cert.pem`,README 有说明
- 结果:✅ 脚本已创建并实测生成证书成功(openssl 自签,含 SAN,10 年有效期);server.js SSL 加载验证通过;`ssl/` 已加入 .gitignore;README HTTPS 章节在 P2-15 统一补充

### P2-11:剪映安装路径可配置
- 状态:[x]
- 问题:`D:\JianyingPro\CapCut.exe` 硬编码,非 D 盘/自定义安装找不到
- 涉及文件:`services/capcut-mate.js`
- 修复:`capcut-mate.json` 支持 `installPath` 配置,自动探测兜底
- 预期结果:可配置剪映路径
- 验收:配置 installPath 后 `_findInstallPath` 优先返回该路径(✅ 冒烟测试:设置/持久化/重启恢复全部通过;新增 `POST /api/capcut/install-path` 端点;顺带修复 `_saveConfig` 仅在 port>0 时保存导致 installPath 无法独立落盘的问题)

### P2-12:白板持久化
- 状态:[x]
- 问题:白板元素仅广播不存储,刷新/重启丢失
- 涉及文件:`server.js`(whiteboard:* handlers)
- 修复:按房间落盘 `data/whiteboard-*.json`,连接时发送历史
- 预期结果:白板内容重启可恢复
- 验收:添加元素 → 重启 → 新连接能收到历史元素(✅ 冒烟测试:落盘/重启恢复/更新持久化/删除同步 5 项全通过;新增 `whiteboard:history`/`whiteboard:clear` 事件与房间支持,原有广播事件不变)

### P2-13:音乐代理白名单
- 状态:[ ]
- 问题:`httpJSON` 任意 URL 代理,理论上可被利用做内网探测
- 涉及文件:`server.js`(httpJSON)
- 修复:目标域名白名单校验
- 预期结果:仅白名单域名可代理
- 验收:非白名单 URL 请求被拒绝

### P2-14:魔法数字集中
- 状态:[ ]
- 问题:`1920×1080`、`:3000`、`2MB`、`500` 等散落各处
- 涉及文件:`server.js`、`services/capcut-mate.js`
- 修复:集中到文件顶部 `CONFIG` 常量,不改行为
- 预期结果:常量集中定义,便于调整
- 验收:各引用点使用常量且行为不变

### P2-15:README 补齐
- 状态:[ ]
- 问题:README 严重滞后(未提登录/AI/剪映/场景检测/白板/聊天)
- 涉及文件:`README.md`
- 修复:补齐功能清单、登录认证、AI、剪映、场景检测、部署章节
- 预期结果:README 反映项目现状
- 验收:README 含全部主要模块说明与启动/部署指引

---

## 执行记录

| 编号 | 状态 | Commit | 说明 |
|------|------|--------|------|
| P0-1 | [x] | - | - |
| P0-2 | [x] | - | - |
| P0-3 | [x] | - | - |
| P0-4 | [x] | - | - |
| P1-5 | [x] | - | - |
| P1-6 | [x] | - | - |
| P1-7 | [x] | - | - |
| P1-8 | [x] | - | - |
| P1-9 | [x] | - | - |
| P2-10 | [x] | - | - |
| P2-11 | [x] | - | - |
| P2-12 | [x] | - | - |
| P2-13 | [ ] | - | - |
| P2-14 | [ ] | - | - |
| P2-15 | [ ] | - | - |
