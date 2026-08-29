// ─── 部门专属视图(阶段三) ─────────────────────────────
// 按项目类型渲染专属编辑器:
//   article(推文) / design-task(设计任务) / activity(活动) / meeting(会议记录)
//   audio-project(音频项目) / video-project(视频项目)
// 通用能力: AI 文档助手(初稿/续写/润色/大纲/拟标题) + 状态机 + 导出 MD/HTML

(function () {
  const api = { open: openDeptProject };

  // 当前项目
  let cur = null;
  let curPanel = null;

  function openDeptProject(p) {
    cur = p;
    // 查找对应面板
    const panel = document.getElementById('panel-dept-doc');
    if (!panel) { console.error('[dept-views] 缺少 panel-dept-doc'); return; }
    curPanel = panel;
    panel.classList.add('active');
    const typeConfig = TYPES[p.type] || TYPES.fallback;
    renderHeader(typeConfig);
    renderBody(typeConfig);
    loadWorkflow(p);
  }

  // ─── 类型配置 ───────────────────────────────────────
  const TYPES = {
    article: {
      label: '📝 推文编辑器', icon: '📝',
      fields: [
        { key: 'title', label: '标题', type: 'input' },
        { key: 'summary', label: '摘要', type: 'textarea', rows: 2 },
        { key: 'content', label: '正文(Markdown)', type: 'textarea', rows: 18 },
      ],
      aiActions: ['draft', 'title', 'polish', 'outline'],
      exportName: (p) => (p.data.title || p.name) + '.html',
      toMarkdown: (p) => {
        const d = p.data || {};
        return `# ${d.title || p.name}\n\n${d.summary ? '> ' + d.summary + '\n\n' : ''}${d.content || ''}`;
      },
    },
    'design-task': {
      label: '🎨 设计任务', icon: '🎨',
      fields: [
        { key: 'title', label: '任务名称', type: 'input' },
        { key: 'description', label: '需求描述', type: 'textarea', rows: 6 },
        { key: 'assignee', label: '负责人', type: 'input' },
      ],
      aiActions: ['draft', 'polish'],
      exportName: (p) => (p.data.title || p.name) + '.html',
      toMarkdown: (p) => {
        const d = p.data || {};
        return `# ${d.title || p.name}\n\n负责人：${d.assignee || '未分配'}\n\n## 需求描述\n\n${d.description || ''}`;
      },
    },
    activity: {
      label: '📋 活动策划', icon: '📋',
      fields: [
        { key: 'title', label: '活动名称', type: 'input' },
        { key: 'plan', label: '策划案正文', type: 'textarea', rows: 18 },
        { key: 'budget', label: '预算', type: 'textarea', rows: 4 },
      ],
      aiActions: ['draft', 'polish', 'outline'],
      exportName: (p) => (p.data.title || p.name) + '.html',
      toMarkdown: (p) => {
        const d = p.data || {};
        return `# ${d.title || p.name}\n\n## 策划案\n\n${d.plan || ''}\n\n## 预算\n\n${d.budget || ''}`;
      },
    },
    meeting: {
      label: '📄 会议记录', icon: '📄',
      fields: [
        { key: 'title', label: '会议主题', type: 'input' },
        { key: 'date', label: '时间', type: 'input' },
        { key: 'attendees', label: '参会人(逗号分隔)', type: 'input' },
        { key: 'minutes', label: '会议记录', type: 'textarea', rows: 12 },
      ],
      aiActions: ['draft', 'polish'],
      exportName: (p) => (p.data.title || p.name) + '.html',
      toMarkdown: (p) => {
        const d = p.data || {};
        return `# 会议记录：${d.title || p.name}\n\n时间：${d.date || ''}\n\n参会人：${d.attendees || ''}\n\n## 内容\n\n${d.minutes || ''}`;
      },
    },
    'audio-project': {
      label: '🎙️ 音频项目', icon: '🎙️',
      fields: [
        { key: 'title', label: '栏目/项目名称', type: 'input' },
        { key: 'content', label: '稿件内容', type: 'textarea', rows: 14 },
      ],
      aiActions: ['draft', 'polish', 'outline'],
      exportName: (p) => (p.data.title || p.name) + '.html',
      toMarkdown: (p) => {
        const d = p.data || {};
        return `# ${d.title || p.name}\n\n${d.content || ''}`;
      },
    },
    'video-project': {
      label: '🎬 视频项目', icon: '🎬',
      fields: [
        { key: 'title', label: '视频项目名称', type: 'input' },
        { key: 'plan', label: '拍摄计划/脚本', type: 'textarea', rows: 14 },
      ],
      aiActions: ['draft', 'outline'],
      exportName: (p) => (p.data.title || p.name) + '.html',
      toMarkdown: (p) => {
        const d = p.data || {};
        return `# ${d.title || p.name}\n\n${d.plan || ''}`;
      },
    },
    fallback: {
      label: '📄 项目', icon: '📄',
      fields: [],
      aiActions: [],
      exportName: (p) => p.name + '.md',
      toMarkdown: (p) => JSON.stringify(p.data || {}, null, 2),
    },
  };

  // ─── 渲染 ───────────────────────────────────────────
  function renderHeader(typeConfig) {
    const title = document.getElementById('dept-doc-title');
    if (title) title.textContent = typeConfig.icon + ' ' + (cur.name || '未命名') + ' — ' + typeConfig.label;
  }

  function renderBody(typeConfig) {
    const body = document.getElementById('dept-doc-body');
    if (!body) return;
    const d = cur.data || {};
    // 状态条
    const statusHtml = `<div id="dept-status-bar" style="margin-bottom:12px"></div>`;
    // 字段表单
    const fieldsHtml = typeConfig.fields.map(f => `
      <div style="margin-bottom:12px">
        <label style="display:block;font-size:12px;color:var(--text-dim);margin-bottom:4px">${f.label}</label>
        ${f.type === 'textarea'
          ? `<textarea id="dept-f-${f.key}" rows="${f.rows || 6}" style="width:100%;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:inherit;box-sizing:border-box">${esc(d[f.key] !== undefined ? d[f.key] : '')}</textarea>`
          : `<input id="dept-f-${f.key}" value="${esc(d[f.key] !== undefined ? d[f.key] : '')}" style="width:100%;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);box-sizing:border-box">`}
      </div>`).join('');

    // AI 操作按钮
    const aiButtons = typeConfig.aiActions.map(a => {
      const labels = { draft: '🤖 AI 初稿', title: '🎯 AI 拟标题', polish: '✨ AI 润色', outline: '📑 AI 大纲', continue: '✍️ AI 续写' };
      return `<button class="tool-btn" style="background:#3b82f6;color:#fff;border:none;margin-right:6px" onclick="window.deptViews.aiAction('${a}')">${labels[a] || a}</button>`;
    }).join('');

    // 操作按钮(保存/导出/返回)
    const statBtn = (['article', 'audio-project'].includes(cur.type))
      ? `<button class="toolbar-btn" onclick="window.deptViews.showStats()" style="font-size:13px">📊 字数/时长</button>`
      : '';
    const actionsHtml = `
      <button class="toolbar-btn primary" onclick="window.deptViews.save()" style="font-size:13px">💾 保存</button>
      <button class="toolbar-btn" onclick="window.deptViews.exportHtml()" style="font-size:13px">⬇️ 导出 HTML</button>
      <button class="toolbar-btn" onclick="window.deptViews.exportMd()" style="font-size:13px">⬇️ 导出 MD</button>
      ${statBtn}
      <button class="toolbar-btn" onclick="window.deptViews.goBack()" style="font-size:13px">← 返回</button>
    `;

    body.innerHTML = `
      <div style="padding:16px;max-width:900px;margin:0 auto">
        ${statusHtml}
        <div style="margin-bottom:12px;display:flex;gap:6px;flex-wrap:wrap">${actionsHtml}</div>
        <div style="margin-bottom:12px;display:flex;gap:6px;flex-wrap:wrap">${aiButtons}<span id="dept-ai-status" style="font-size:12px;color:var(--text-dim);align-self:center"></span></div>
        <div id="dept-doc-fields">${fieldsHtml}</div>
        <div id="dept-doc-preview" style="display:none;margin-top:16px;border:1px solid var(--border);border-radius:8px;padding:16px;background:var(--surface2)">
          <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px">👁️ 预览</div>
          <div id="dept-doc-preview-content"></div>
        </div>
      </div>`;
  }

  // ─── 状态机加载 ─────────────────────────────────────
  function loadWorkflow(p) {
    const bar = document.getElementById('dept-status-bar');
    if (!bar) return;
    if (window.CollabStudio.socket) {
      window.CollabStudio.socket.emit('workflow-status', { projectId: p.id });
    }
  }

  // ─── 保存 ───────────────────────────────────────────
  function save() {
    const d = Object.assign({}, cur.data || {});
    const tc = TYPES[cur.type] || TYPES.fallback;
    tc.fields.forEach(f => {
      const el = document.getElementById('dept-f-' + f.key);
      if (el) d[f.key] = el.value;
    });
    // 保存状态
    if (window.CollabStudio.socket) {
      window.CollabStudio.socket.emit('project-update', { id: cur.id, data: d, baseVersion: cur._version || 0 });
    }
    showToast('💾 已保存');
  }

  // ─── 导出 ───────────────────────────────────────────
  function toHtml() {
    const tc = TYPES[cur.type] || TYPES.fallback;
    const md = tc.toMarkdown(cur);
    return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>${esc(cur.name)}</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.8;color:#333}
      h1{border-bottom:2px solid #4f46e5;padding-bottom:8px}h2{color:#4f46e5;margin-top:28px}
      blockquote{border-left:4px solid #ddd;margin:0;padding-left:16px;color:#666}
      pre,code{background:#f4f4f5;padding:2px 6px;border-radius:4px}
    </style></head><body>\n${mdToHtml(md)}\n</body></html>`;
  }

  function mdToHtml(md) {
    return (md || '')
      .replace(/^# (.*)$/gm, '<h1>$1</h1>')
      .replace(/^## (.*)$/gm, '<h2>$1</h2>')
      .replace(/^### (.*)$/gm, '<h3>$1</h3>')
      .replace(/^> (.*)$/gm, '<blockquote>$1</blockquote>')
      .replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>')
      .split('\n\n').map(b => {
        if (b.startsWith('<')) return b;
        return '<p>' + b.replace(/\n/g, '<br>') + '</p>';
      }).join('\n');
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportHtml() {
    const tc = TYPES[cur.type] || TYPES.fallback;
    download(tc.exportName(cur), toHtml(), 'text/html;charset=utf-8');
    showToast('⬇️ 已导出 HTML(可用 Word 打开)');
  }

  function exportMd() {
    const tc = TYPES[cur.type] || TYPES.fallback;
    download((cur.data.title || cur.name) + '.md', tc.toMarkdown(cur), 'text/markdown;charset=utf-8');
    showToast('⬇️ 已导出 Markdown');
  }

  // ─── AI 操作 ────────────────────────────────────────
  function aiAction(action) {
    const status = document.getElementById('dept-ai-status');
    if (status) status.textContent = '⏳ AI 思考中...';
    const tc = TYPES[cur.type] || TYPES.fallback;
    const d = cur.data || {};
    // 组装当前内容(从字段)
    const fieldValues = {};
    tc.fields.forEach(f => {
      const el = document.getElementById('dept-f-' + f.key);
      fieldValues[f.key] = el ? el.value : d[f.key];
    });
    const contentText = fieldValues.content || fieldValues.plan || fieldValues.minutes || '';
    const instruction = action === 'draft' ? (prompt('输入主题(如: 校园迎新晚会预告):') || '') : '';

    fetch('/api/ai/doc', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectType: cur.type, docTitle: fieldValues.title || cur.name,
        content: contentText, action, instruction,
      }),
    }).then(r => r.json()).then(data => {
      if (data.error) { if (status) status.textContent = ''; alert('❌ ' + data.error); return; }
      if (action === 'title') {
        // 拟标题: 填到标题字段
        const el = document.getElementById('dept-f-title');
        if (el) el.value = data.text.replace(/^\d+[\.\)、]\s*/gm, '').split('\n').join(' | ');
        if (status) status.textContent = '🎯 标题已生成';
      } else {
        // 其他: 填入主内容字段(优先 content, 其次 plan/minutes)
        const key = ['content', 'plan', 'minutes'].find(k => document.getElementById('dept-f-' + k)) || 'content';
        const el = document.getElementById('dept-f-' + key);
        if (el) el.value = data.text;
        if (status) status.textContent = '✅ AI 生成完成';
      }
    }).catch(e => { if (status) status.textContent = ''; alert('❌ ' + e.message); });
  }

  // ─── 字数/时长统计(推文/音频稿件) ─────────────────
  function showStats() {
    const tc = TYPES[cur.type] || TYPES.fallback;
    const d = cur.data || {};
    let text = '';
    tc.fields.forEach(f => {
      const el = document.getElementById('dept-f-' + f.key);
      const v = (el ? el.value : '') || d[f.key] || '';
      text += ' ' + v;
    });
    const chars = text.replace(/\s/g, '').length;         // 去空白后的字数
    const cjkChars = (text.match(/[\u4e00-\u9fff]/g) || []).length; // 汉字数
    const minutes = chars / 200;                           // 按 200字/分钟 朗读
    const m = Math.floor(minutes), s = Math.round((minutes - m) * 60);
    showToast(`📊 字数: ${chars} 字(汉字 ${cjkChars})\n🕐 朗读约 ${m} 分 ${s} 秒(按 200字/分)`);
  }

  // ─── 返回 ───────────────────────────────────────────
  function goBack() {
    if (window.CollabStudio.socket && cur) {
      window.CollabStudio.socket.emit('project-close', { projectId: cur.id });
    }
    cur = null;
    switchModule('projects');
  }

  // ─── 状态机事件监听 ─────────────────────────────────
  window.deptViews = {
    open: openDeptProject, save, exportHtml, exportMd, aiAction, goBack, showStats,
    _cur: () => cur,
  };

  // socket 事件(由 app.js 初始化后绑定)
  function bindSocket() {
    const socket = window.CollabStudio.socket;
    if (!socket) return;
    if (socket._deptViewsBound) return;
    socket._deptViewsBound = true;

    socket.on('workflow-status-result', (data) => {
      const bar = document.getElementById('dept-status-bar');
      if (!bar || !cur || data.projectId !== cur.id) return;
      const curStatus = data.current;
      const curInfo = data.statuses.find(s => s.id === curStatus);
      const dots = data.statuses.map(s => `
        <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:16px;font-size:12px;margin-right:6px;background:${s.id === curStatus ? s.color : 'var(--surface2)'};color:${s.id === curStatus ? '#fff' : 'var(--text-dim)'};border:1px solid ${s.id === curStatus ? s.color : 'var(--border)'}">${s.label}</span>`).join('');
      const btns = (data.transitions || []).map(t => `
        <button class="tool-btn" style="background:var(--accent);color:#fff;border:none;margin-right:6px" onclick="window.deptViews.transition('${t.to}')">${t.label}</button>`).join('');
      bar.innerHTML = `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">${dots}<span style="flex:1"></span>${btns}</div>`;
    });

    socket.on('workflow-transition-result', (r) => {
      if (r.ok && cur && r.projectId === cur.id) {
        showToast(`✅ 状态已更新: ${r.from} → ${r.to}`);
        socket.emit('workflow-status', { projectId: cur.id });
      }
    });

    socket.on('workflow-changed', (r) => {
      if (cur && r.projectId === cur.id) {
        socket.emit('workflow-status', { projectId: cur.id });
      }
    });

    socket.on('workflow-error', (msg) => { showToast('❌ ' + msg); });

    socket.on('project-updated', (data) => {
      if (cur && data && data.id === cur.id) {
        // 更新版本号
        cur._version = (cur._version || 0) + 1;
      }
    });
  }

  // app.js 会在 socket 连接后调用所有模块的 bindSocket
  if (window.CollabStudio) {
    const mod = { openProject: openDeptProject, bindSocket };
    window.CollabStudio.modules['dept-doc'] = mod;
    // 兼容旧引用
    window.CollabStudio.modules['article'] = mod;
    window.CollabStudio.modules['design-task'] = mod;
    window.CollabStudio.modules['activity'] = mod;
    window.CollabStudio.modules['meeting'] = mod;
    window.CollabStudio.modules['audio-project'] = mod;
    window.CollabStudio.modules['video-project'] = mod;

    // 自动绑定 socket 事件(等 app.js 创建 socket 后)
    (function tryBind() {
      const socket = window.CollabStudio.socket;
      if (!socket) { setTimeout(tryBind, 300); return; }
      if (socket.connected) bindSocket();
      else socket.once('connect', bindSocket);
    })();
  }
})();
