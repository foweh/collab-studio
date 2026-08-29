// ─── DeepSeek AI 服务 ──────────────────────────────────
// 提供思维导图 AI 生成、节点展开、聊天控制等功能。
// 配置存储在 data 目录的 ai-config.json 中。

const { loadJSON, saveJSON, DATA_DIR } = require('../utils/persist');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const CONFIG_FILE = path.join(DATA_DIR, 'ai-config.json');

function loadConfig() {
  const cfg = loadJSON(CONFIG_FILE, {});
  return {
    api_token: cfg.api_token || '',
    api_url: cfg.api_url || 'https://api.deepseek.com/chat/completions',
    model: cfg.model || 'deepseek-chat'
  };
}

function saveConfig(cfg) {
  saveJSON(CONFIG_FILE, {
    api_token: cfg.api_token || '',
    api_url: cfg.api_url || 'https://api.deepseek.com/chat/completions',
    model: cfg.model || 'deepseek-chat'
  });
}

/**
 * 调用 DeepSeek API，带指数退避重试。
 */
function callDeepSeek(config, messages, { temperature = 0.7, max_tokens = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: config.model || 'deepseek-chat',
      messages,
      temperature,
      max_tokens
    });

    const url = new URL(config.api_url || 'https://api.deepseek.com/chat/completions');
    const options = {
      method: 'POST',
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      headers: {
        'Authorization': `Bearer ${config.api_token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const transport = url.protocol === 'http:' ? http : https;

    const doRequest = (attempt) => {
      const req = transport.request(options, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => {
          if (resp.statusCode !== 200) {
            if (attempt < 2) {
              setTimeout(() => doRequest(attempt + 1), Math.pow(2, attempt) * 1000);
            } else {
              reject(new Error(`API 返回 ${resp.statusCode}: ${data.substring(0, 200)}`));
            }
            return;
          }
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (e) {
            reject(new Error('API 返回数据解析失败'));
          }
        });
      });

      req.on('error', (e) => {
        if (attempt < 2) {
          setTimeout(() => doRequest(attempt + 1), Math.pow(2, attempt) * 1000);
        } else {
          reject(e);
        }
      });

      req.setTimeout(120000, () => {
        req.destroy();
        if (attempt < 2) {
          setTimeout(() => doRequest(attempt + 1), Math.pow(2, attempt) * 1000);
        } else {
          reject(new Error('API 请求超时'));
        }
      });

      req.write(payload);
      req.end();
    };

    doRequest(0);
  });
}

/**
 * 提取 AI 返回内容中的 JSON（去除 markdown 代码块包裹）。
 */
function extractJson(content) {
  let text = content.trim();
  if (text.startsWith('```json')) text = text.substring(7);
  else if (text.startsWith('```')) text = text.substring(3);
  if (text.endsWith('```')) text = text.slice(0, -3);
  text = text.trim();
  return JSON.parse(text);
}

// ─── 思维导图生成 ───────────────────────────────────────

async function generateMindmap(topic, config) {
  const systemPrompt = `你是一个专业的思维导图生成助手。请严格根据用户主题生成一份内容丰富、层次完整的思维导图，必须以 JSON 格式返回，不要包含任何说明文字。

要求：
1. 至少包含 3 个层级（根节点 -> 一级分支 -> 二级分支 -> 三级分支）
2. 每个节点至少包含 3-6 个子节点
3. 内容具体、实用，避免空泛
4. JSON 格式：{"root": "主题", "children": [{"text": "分支", "children": [...]}]}
5. 总节点数建议在 30-80 个之间`;
  const userPrompt = `请为主题 "${topic}" 生成一份详细的思维导图。`;

  const result = await callDeepSeek(config, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], { temperature: 0.8, max_tokens: 4000 });

  return extractJson(result.choices[0].message.content);
}

// ─── 节点展开 ───────────────────────────────────────────

async function expandNode(targetNode, context, config) {
  const systemPrompt = `你是思维导图节点展开助手。请根据目标节点及其上下文，生成 3-6 个子分支。必须以 JSON 格式返回，不要包含任何说明文字。
格式：{"children": [{"text": "子节点1"}, {"text": "子节点2"}, ...]}
节点文字要简洁（2-8个字），内容要具体、有层次感。`;
  const userPrompt = `${context}\n请为该节点生成子分支。`;

  const result = await callDeepSeek(config, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], { temperature: 0.8, max_tokens: 2000 });

  return extractJson(result.choices[0].message.content);
}

// ─── AI 聊天控制 ────────────────────────────────────────

async function chatControl(userMessage, mindmapJson, chatHistory, config) {
  const systemPrompt = `你是用户的思维导图协作伙伴，像一位耐心的创意搭档。你拥有对当前导图的完全可见权，目标是通过多轮聊天和用户一起把思维导图逐步完善。你要主动理解用户的想法方向，评估哪些内容值得加入导图。当你判断用户确实想往某个方向发展时，就主动提出结构建议并直接执行合理的修改；当你不确定时，用温和的问题引导用户，而不是一次性改太多。

返回格式（严格）：
{"reply": "给用户看的回复（包含建议、追问或确认）", "actions": [操作1, 操作2, ...]}

可用操作类型（必须按格式返回）：
1. {"type": "add_child", "parent_id": 数字, "text": "内容"} - 在 parent_id 指定的节点下添加一个子节点。parent_id 必须是当前导图中真实存在的节点 id。
2. {"type": "add_sibling", "node_id": 数字, "text": "内容"} - 在 node_id 节点旁边添加一个兄弟节点（会挂在同一父节点下）。若该节点无父节点，则在其右侧平移添加。
3. {"type": "edit", "node_id": 数字, "text": "新内容"} - 修改 node_id 节点的文字内容。
4. {"type": "delete", "node_id": 数字} - 删除 node_id 节点及其整个子树。谨慎使用，除非用户明确要求删除。
5. {"type": "set_color", "node_id": 数字, "color": "#rrggbb"} - 修改 node_id 节点的颜色。颜色必须使用 hex 格式，如 #3b82f6（蓝）、#ef4444（红）、#10b981（绿）、#f59e0b（黄）。
6. {"type": "expand", "node_id": 数字} - 让 AI 自动为 node_id 节点生成若干子分支。适用于用户说"帮我展开这个""再细化一下"等场景。
7. {"type": "connect", "from_id": 数字, "to_id": 数字} - 在 from_id 和 to_id 两个节点之间建立一条连线。用于表达节点之间的关联、因果关系、流程顺序、层级补充等。

协作规则：
- 主动评估用户意图：如果用户提到某个方向、概念或想法，即使没明确说"添加"，你也可以判断它是否适合加入导图。
- 小步快跑：每次对话只添加 1-3 个关键节点或做少量调整，避免一次性大量改动。
- 边做边问：执行少量操作后，通过 reply 追问用户"这样是否符合你的方向？""接下来想深入哪个部分？""还有哪个方面想补充？"
- 用户表达方向或默许时主动执行：比如用户说"我想做一个摄影教程""我觉得可以加上后期""往这个方向走"，你就主动添加相关节点。
- 如果用户只是打招呼、闲聊、让你评价导图、没有表达任何想法方向，则只回复文字，actions 为空。
- 优先使用当前导图中已有的节点 id，严禁编造不存在的 id。
- 节点文字要简洁，一般 2-6 个字，便于导图阅读。
- 颜色选择要协调，同一分支下相关子节点使用相近或协调的颜色。

示例 1：用户说"我想出一个剪映进阶教程"：
{"reply": "好主意，我先为你搭建一个剪映进阶教程的框架，包含核心模块。接下来我们可以逐个细化。", "actions": [{"type": "add_child", "parent_id": 1, "text": "剪辑思维"}, {"type": "add_child", "parent_id": 1, "text": "转场技巧"}, {"type": "add_child", "parent_id": 1, "text": "调色与包装"}]}

示例 2：用户说"我觉得可以加上拍摄部分"（已有剪映教程导图）：
{"reply": "已把拍摄与呈现加入教程结构。你觉得是放在前期准备下，还是作为独立模块？", "actions": [{"type": "add_child", "parent_id": 1, "text": "拍摄与呈现"}]}

示例 3：用户说"这个导图怎么样？"：
{"reply": "当前导图结构比较清晰，核心主题明确。如果你想继续深入，可以告诉我你最想先完善哪个部分？", "actions": []}

现在请根据当前导图结构和本轮用户输入返回 JSON。`;
  const userPrompt = `当前思维导图结构：\n\`\`\`json\n${mindmapJson}\n\`\`\`\n\n用户指令：${userMessage}`;

  const messages = [{ role: 'system', content: systemPrompt }];
  for (const [userMsg, assistantMsg] of (chatHistory || []).slice(-6)) {
    messages.push({ role: 'user', content: userMsg });
    messages.push({ role: 'assistant', content: assistantMsg });
  }
  messages.push({ role: 'user', content: userPrompt });

  const result = await callDeepSeek(config, messages, { temperature: 0.7, max_tokens: 3000 });

  return extractJson(result.choices[0].message.content);
}

// ─── AI 文档助手(部门化阶段三) ─────────────────────────
// 场景: draft(初稿) / continue(续写) / polish(润色) / outline(大纲) / title(拟标题)
// 用于: 推文/策划案/会议记录/主持稿等文档型项目

async function aiDoc(projectType, docTitle, currentContent, action, userInstruction, config) {
  const typeLabels = {
    article: '公众号推文', activity: '活动策划案', meeting: '会议记录',
    'audio-project': '主持稿/稿件', 'video-project': '视频脚本', 'design-task': '设计说明',
  };
  const typeLabel = typeLabels[projectType] || '文档';

  let systemPrompt = '';
  switch (action) {
    case 'draft':
      systemPrompt = `你是校园学生组织的资深${typeLabel}撰稿人。根据用户提供的主题，生成一份完整的${typeLabel}初稿。
要求：
- 结构清晰，使用 Markdown 标题分层（## 小标题）
- 语言符合校园学生组织风格，正式但不僵硬
- 内容具体可执行，不要空话套话
- 推文：含开头钩子、正文分节、结尾号召
- 策划案：含活动背景、目标、时间地点、流程安排、预算、应急预案
- 会议记录：含会议主题、时间地点、参会人、议程、决议事项
只输出正文内容，不要解释。`;
      break;
    case 'continue':
      systemPrompt = `你是${typeLabel}续写助手。用户给你一篇半成品，请从断处自然续写，保持风格一致、内容衔接。只输出续写部分。`;
      break;
    case 'polish':
      systemPrompt = `你是${typeLabel}润色编辑。请润色以下文本：修正错别字和病句、让表达更通顺有力、保留原意。只输出润色后的完整文本。`;
      break;
    case 'outline':
      systemPrompt = `你是${typeLabel}策划顾问。请为给定主题生成一份详细大纲（Markdown 列表/标题），涵盖${typeLabel}应有的所有关键部分，每部分用一句话说明要点。只输出大纲。`;
      break;
    case 'title':
      systemPrompt = `你是校园新媒体标题专家。为以下${typeLabel}生成 5 个吸引人的标题候选，用数字列表输出，每个不超过 20 字。只输出 5 个标题。`;
      break;
    default:
      systemPrompt = `你是${typeLabel}助手。请根据用户指令处理以下文本。`;
  }

  const userPrompt = `文档标题：${docTitle || '（未命名）'}\n\n${currentContent ? '当前内容：\n' + currentContent + '\n\n' : ''}${userInstruction ? '用户要求：' + userInstruction : ''}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const result = await callDeepSeek(config, messages, { temperature: action === 'title' ? 0.9 : 0.7, max_tokens: 3000 });
  return result.choices[0].message.content;
}

module.exports = {
  loadConfig,
  saveConfig,
  generateMindmap,
  expandNode,
  chatControl,
  aiDoc
};
