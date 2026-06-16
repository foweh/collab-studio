// ─── 剧本编辑器 v2 — 角色管理 + 动作描写 + 拖拽 + 导出 ─
(function() {

let currentProject = null;

const container = $('#script-editor');
const scriptTitle = $('#script-title');

// ─── 工具 ────────────────────────────────────────────────
function autoResize(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; }

function getCharacters() {
  if (!currentProject) return [];
  const map = new Map();
  (currentProject.data.acts || []).forEach(act =>
    (act.scenes || []).forEach(scene =>
      (scene.lines || []).forEach(line => {
        if (line.type === 'dialogue' && line.character) {
          if (!map.has(line.character)) map.set(line.character, 0);
          map.set(line.character, map.get(line.character) + 1);
        }
      })
    )
  );
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

function lineHtml(line, ai, si, li) {
  const type = line.type || 'dialogue';
  const typeClass = `d-${type}`;
  if (type === 'dialogue') {
    return `<div class="d-line ${typeClass}" draggable="true" data-ai="${ai}" data-si="${si}" data-li="${li}">
      <span class="d-drag-handle">⠿</span>
      <input class="d-char" value="${esc(line.character || '')}" data-ai="${ai}" data-si="${si}" data-li="${li}" placeholder="角色" list="char-suggest-${ai}-${si}">
      <datalist id="char-suggest-${ai}-${si}"></datalist>
      <textarea class="d-text" rows="1" data-ai="${ai}" data-si="${si}" data-li="${li}" placeholder="对白...">${esc(line.text || '')}</textarea>
      <span class="d-type-badge" data-ai="${ai}" data-si="${si}" data-li="${li}" title="切换类型">🎭</span>
      <button class="d-del" data-ai="${ai}" data-si="${si}" data-li="${li}">×</button>
    </div>`;
  }
  const badge = type === 'action' ? '✍️' : '🌄';
  const placeholder = type === 'action' ? '动作...' : '环境描写...';
  return `<div class="d-line ${typeClass}" draggable="true" data-ai="${ai}" data-si="${si}" data-li="${li}">
    <span class="d-drag-handle">⠿</span>
    <textarea class="d-type-text" rows="2" data-ai="${ai}" data-si="${si}" data-li="${li}" placeholder="${placeholder}">${esc(line.text || '')}</textarea>
    <span class="d-type-badge" data-ai="${ai}" data-si="${si}" data-li="${li}" title="切换类型">${badge}</span>
    <button class="d-del" data-ai="${ai}" data-si="${si}" data-li="${li}">×</button>
  </div>`;
}

// ─── 渲染 ────────────────────────────────────────────────
function renderScript() {
  if (!currentProject) return;
  const data = currentProject.data || { acts: [] };
  if (!data.acts) data.acts = [];

  // 收集角色生成建议列表
  const chars = getCharacters();

  container.innerHTML = '';

  // 角色统计（折叠式）
  if (chars.length > 0) {
    const charBar = document.createElement('div');
    charBar.className = 'script-charbar';
    charBar.innerHTML = `<span style="color:var(--text-dim);font-size:12px">🎭 角色 (${chars.length})</span>`;
    chars.forEach(c => {
      const tag = document.createElement('span');
      tag.className = 'script-char-tag';
      tag.textContent = `${c.name} ${c.count}`;
      tag.title = `${c.name}: ${c.count} 句对白`;
      // 点击插入新对白
      tag.addEventListener('click', () => {
        if (data.acts.length === 0) return;
        const lastAct = data.acts[data.acts.length - 1];
        if (lastAct.scenes.length === 0) lastAct.scenes.push({ location: '', time: '', lines: [] });
        const lastScene = lastAct.scenes[lastAct.scenes.length - 1];
        if (!lastScene.lines) lastScene.lines = [];
        lastScene.lines.push({ type: 'dialogue', character: c.name, text: '' });
        renderScript(); saveData();
      });
      charBar.appendChild(tag);
    });
    container.appendChild(charBar);
  }

  data.acts.forEach((act, ai) => {
    if (!act.scenes) act.scenes = [];
    const sec = document.createElement('div');
    sec.className = 'act-section';
    sec.innerHTML = `
      <div class="act-header" draggable="true" data-ai="${ai}">
        <span class="act-drag">⠿</span>
        <input class="act-title" value="${esc(act.title)}" data-ai="${ai}" placeholder="幕标题...">
        <button class="toolbar-btn add-scene-btn" data-ai="${ai}" style="font-size:12px;padding:2px 10px">+ 场</button>
        <button class="tool-btn danger del-act-btn" data-ai="${ai}" style="font-size:12px;padding:2px 8px">删幕</button>
        <span class="act-arrow" data-ai="${ai}">${act._collapsed ? '▶' : '▼'}</span>
      </div>
      <div class="scenes-list" style="${act._collapsed ? 'display:none' : ''}"></div>
    `;
    const scenesList = sec.querySelector('.scenes-list');

    // 折叠
    sec.querySelector('.act-arrow').addEventListener('click', () => {
      act._collapsed = !act._collapsed;
      renderScript(); saveData();
    });

    // 拖拽排序幕
    const actHeader = sec.querySelector('.act-header');
    actHeader.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', `act:${ai}`);
      actHeader.classList.add('dragging');
    });
    actHeader.addEventListener('dragend', () => actHeader.classList.remove('dragging'));
    actHeader.addEventListener('dragover', e => {
      e.preventDefault();
      const dt = e.dataTransfer.getData('text/plain');
      if (dt.startsWith('act:')) actHeader.classList.add('drag-over');
    });
    actHeader.addEventListener('dragleave', () => actHeader.classList.remove('drag-over'));
    actHeader.addEventListener('drop', e => {
      e.preventDefault(); actHeader.classList.remove('drag-over');
      const dt = e.dataTransfer.getData('text/plain');
      if (!dt.startsWith('act:')) return;
      const fromAi = parseInt(dt.split(':')[1]);
      if (fromAi === ai) return;
      const item = data.acts.splice(fromAi, 1)[0];
      data.acts.splice(ai > fromAi ? ai - 1 : ai, 0, item);
      renderScript(); saveData();
    });

    act.scenes.forEach((scene, si) => {
      if (!scene.lines) scene.lines = [];
      const sc = document.createElement('div');
      sc.className = 'scene-card';
      sc.draggable = true;
      sc.innerHTML = `
        <div class="scene-header" data-ai="${ai}" data-si="${si}">
          <span class="scene-drag">⠿</span>
          <span style="color:var(--text-dim);font-size:11px;min-width:28px">${si+1}</span>
          <input class="scene-location" value="${esc(scene.location || '')}" data-ai="${ai}" data-si="${si}" placeholder="场景地点...">
          <input class="scene-time" value="${esc(scene.time || '')}" data-ai="${ai}" data-si="${si}" placeholder="时间...">
          <button class="tool-btn add-action-btn" data-ai="${ai}" data-si="${si}" style="font-size:11px;padding:1px 6px">✍️动</button>
          <button class="tool-btn add-action-btn" data-ai="${ai}" data-si="${si}" data-type="env" style="font-size:11px;padding:1px 6px">🌄环</button>
          <button class="tool-btn add-dialogue-btn" data-ai="${ai}" data-si="${si}" style="font-size:11px;padding:1px 6px">🎭对白</button>
          <button class="tool-btn danger del-scene-btn" data-ai="${ai}" data-si="${si}" style="font-size:11px;padding:1px 6px">×</button>
        </div>
        <div class="scene-lines"></div>
      `;

      // 场景拖拽
      sc.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', `scene:${ai}:${si}`);
        sc.classList.add('dragging');
      });
      sc.addEventListener('dragend', () => sc.classList.remove('dragging'));
      sc.addEventListener('dragover', e => {
        e.preventDefault();
        const dt = e.dataTransfer.getData('text/plain');
        if (dt.startsWith('scene:') || dt.startsWith('line:')) sc.classList.add('drag-over');
      });
      sc.addEventListener('dragleave', () => sc.classList.remove('drag-over'));
      sc.addEventListener('drop', e => {
        e.preventDefault(); sc.classList.remove('drag-over');
        const dt = e.dataTransfer.getData('text/plain');
        if (dt.startsWith('scene:')) {
          const [_, fromAi, fromSi] = dt.split(':').map(Number);
          if (fromAi === ai && fromSi === si) return;
          const item = data.acts[fromAi].scenes.splice(fromSi, 1)[0];
          const insertIdx = fromAi === ai && fromSi < si ? si - 1 : si;
          data.acts[ai].scenes.splice(insertIdx, 0, item);
          renderScript(); saveData();
        }
      });

      const linesDiv = sc.querySelector('.scene-lines');

      scene.lines.forEach((line, li) => {
        const div = document.createElement('div');
        div.innerHTML = lineHtml(line, ai, si, li);
        const lineEl = div.firstElementChild;

        // 拖拽行
        lineEl.addEventListener('dragstart', e => {
          e.dataTransfer.setData('text/plain', `line:${ai}:${si}:${li}`);
          lineEl.classList.add('dragging');
        });
        lineEl.addEventListener('dragend', () => lineEl.classList.remove('dragging'));
        lineEl.addEventListener('dragover', e => {
          e.preventDefault();
          const dt = e.dataTransfer.getData('text/plain');
          if (dt.startsWith('line:')) lineEl.classList.add('drag-over');
        });
        lineEl.addEventListener('dragleave', () => lineEl.classList.remove('drag-over'));
        lineEl.addEventListener('drop', e => {
          e.preventDefault(); lineEl.classList.remove('drag-over');
          const dt = e.dataTransfer.getData('text/plain');
          if (!dt.startsWith('line:')) return;
          const [_, fromAi, fromSi, fromLi] = dt.split(':').map(Number);
          if (fromAi === ai && fromSi === si && fromLi === li) return;
          const fromScene = currentProject.data.acts[fromAi].scenes[fromSi];
          if (!fromScene) return;
          const item = fromScene.lines.splice(fromLi, 1)[0];
          if (fromAi === ai && fromSi === si && fromLi < li) {
            scene.lines.splice(li - 1, 0, item);
          } else {
            scene.lines.splice(li, 0, item);
          }
          renderScript(); saveData();
        });

        linesDiv.appendChild(div.firstElementChild);
      });

      scenesList.appendChild(sc);
    });

    container.appendChild(sec);
  });

  // 如果没有幕，显示占位
  if (data.acts.length === 0) {
    container.innerHTML = '<div class="editor-placeholder">点击顶部「+ 幕」开始创作</div>';
  }

  bindEvents();
}

// ─── 事件绑定 ────────────────────────────────────────────
function bindEvents() {
  // 幕标题
  container.querySelectorAll('.act-title').forEach(inp => {
    inp.addEventListener('change', () => {
      const ai = parseInt(inp.dataset.ai);
      if (currentProject.data.acts[ai]) {
        currentProject.data.acts[ai].title = inp.value;
        saveData();
      }
    });
  });

  // 添加场
  container.querySelectorAll('.add-scene-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ai = parseInt(btn.dataset.ai);
      const act = currentProject.data.acts[ai];
      if (act) {
        act.scenes.push({ location: '', time: '', lines: [] });
        renderScript(); saveData();
      }
    });
  });

  // 删幕
  container.querySelectorAll('.del-act-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ai = parseInt(btn.dataset.ai);
      if (await showConfirm('删除此幕？此操作不可恢复。', '删除确认', '🗑️')) {
        currentProject.data.acts.splice(ai, 1);
        renderScript(); saveData();
      }
    });
  });

  // 场景地点/时间
  container.querySelectorAll('.scene-location').forEach(inp => {
    inp.addEventListener('change', () => {
      const ai = parseInt(inp.dataset.ai), si = parseInt(inp.dataset.si);
      const sc = currentProject.data.acts[ai]?.scenes[si];
      if (sc) { sc.location = inp.value; saveData(); }
    });
  });
  container.querySelectorAll('.scene-time').forEach(inp => {
    inp.addEventListener('change', () => {
      const ai = parseInt(inp.dataset.ai), si = parseInt(inp.dataset.si);
      const sc = currentProject.data.acts[ai]?.scenes[si];
      if (sc) { sc.time = inp.value; saveData(); }
    });
  });

  // 删场
  container.querySelectorAll('.del-scene-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ai = parseInt(btn.dataset.ai), si = parseInt(btn.dataset.si);
      if (await showConfirm('删除此场？此操作不可恢复。', '删除确认', '🗑️')) {
        currentProject.data.acts[ai].scenes.splice(si, 1);
        renderScript(); saveData();
      }
    });
  });

  // +动作/环境描写
  container.querySelectorAll('.add-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ai = parseInt(btn.dataset.ai), si = parseInt(btn.dataset.si);
      const scene = currentProject.data.acts[ai]?.scenes[si];
      if (scene) {
        if (!scene.lines) scene.lines = [];
        const type = btn.dataset.type || 'action';
        scene.lines.push({ type, text: '' });
        renderScript(); saveData();
      }
    });
  });

  // +对白
  container.querySelectorAll('.add-dialogue-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ai = parseInt(btn.dataset.ai), si = parseInt(btn.dataset.si);
      const scene = currentProject.data.acts[ai]?.scenes[si];
      if (scene) {
        if (!scene.lines) scene.lines = [];
        scene.lines.push({ type: 'dialogue', character: '', text: '' });
        renderScript(); saveData();
      }
    });
  });

  // 角色名
  container.querySelectorAll('.d-char').forEach(inp => {
    // 自动补全建议
    const ai = parseInt(inp.dataset.ai), si = parseInt(inp.dataset.si);
    const datalist = document.getElementById(`char-suggest-${ai}-${si}`);
    if (datalist) {
      const chars = getCharacters();
      datalist.innerHTML = chars.map(c => `<option value="${esc(c.name)}">`).join('');
    }
    inp.addEventListener('change', () => {
      const ai = parseInt(inp.dataset.ai), si = parseInt(inp.dataset.si), li = parseInt(inp.dataset.li);
      const line = currentProject.data.acts[ai]?.scenes[si]?.lines[li];
      if (line) { line.character = inp.value; saveData(); }
    });
  });

  // 对白/动作文本
  container.querySelectorAll('.d-text').forEach(ta => {
    ta.addEventListener('input', () => autoResize(ta));
    ta.addEventListener('change', () => {
      const ai = parseInt(ta.dataset.ai), si = parseInt(ta.dataset.si), li = parseInt(ta.dataset.li);
      const line = currentProject.data.acts[ai]?.scenes[si]?.lines[li];
      if (line) { line.text = ta.value; saveData(); }
    });
  });
  container.querySelectorAll('.d-type-text').forEach(ta => {
    ta.addEventListener('input', () => autoResize(ta));
    ta.addEventListener('change', () => {
      const ai = parseInt(ta.dataset.ai), si = parseInt(ta.dataset.si), li = parseInt(ta.dataset.li);
      const line = currentProject.data.acts[ai]?.scenes[si]?.lines[li];
      if (line) { line.text = ta.value; saveData(); }
    });
  });

  // 切换类型（对白 → 动作 → 环境描写 → 对白）
  container.querySelectorAll('.d-type-badge').forEach(badge => {
    badge.addEventListener('click', () => {
      const ai = parseInt(badge.dataset.ai), si = parseInt(badge.dataset.si), li = parseInt(badge.dataset.li);
      const line = currentProject.data.acts[ai]?.scenes[si]?.lines[li];
      if (line) {
        const types = ['dialogue', 'action', 'env'];
        const idx = types.indexOf(line.type || 'dialogue');
        line.type = types[(idx + 1) % types.length];
        if (line.type === 'dialogue' && !line.character) line.character = '';
        renderScript(); saveData();
      }
    });
  });

  // 删除行
  container.querySelectorAll('.d-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const ai = parseInt(btn.dataset.ai), si = parseInt(btn.dataset.si), li = parseInt(btn.dataset.li);
      const scene = currentProject.data.acts[ai]?.scenes[si];
      if (scene) { scene.lines.splice(li, 1); renderScript(); saveData(); }
    });
  });
}

// ─── 保存 ────────────────────────────────────────────────
function saveData() {
  if (!currentProject) return;
  socket.emit('project-update', { id: currentProject.id, data: currentProject.data });
  socket.emit('realtime-event', {
    module: 'script', event: 'script-updated',
    payload: { id: currentProject.id, data: currentProject.data },
  });
}

// ─── 导出 ────────────────────────────────────────────────
function exportScript(mode) {
  if (!currentProject) return;
  const data = currentProject.data;
  let text = `# ${currentProject.name}\n\n`;

  (data.acts || []).forEach((act, ai) => {
    text += `## ${act.title || `第${ai+1}幕`}\n\n`;
    (act.scenes || []).forEach((scene, si) => {
      const loc = scene.location || '??';
      const time = scene.time || '??';
      text += `### 第${si+1}场 - ${loc} - ${time}\n\n`;
      (scene.lines || []).forEach(line => {
        if (line.type === 'action') {
          text += `*[动作] ${line.text || ''}*\n\n`;
        } else if (line.type === 'env') {
          text += `*[环境] ${line.text || ''}*\n\n`;
        } else {
          text += `**${line.character || '??'}**: ${line.text || ''}\n\n`;
        }
      });
    });
  });

  if (mode === 'clipboard') {
    navigator.clipboard.writeText(text).then(() => showToast('📋 已复制到剪贴板'));
  } else {
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${currentProject.name || '剧本'}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('📤 导出完成');
  }
}

function showToast(msg) {
  let el = document.getElementById('script-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'script-toast';
    el.style.cssText = 'position:absolute;bottom:60px;left:50%;transform:translateX(-50%);background:#1a3a1a;color:#66bb6a;padding:8px 16px;border-radius:8px;font-size:13px;z-index:100;border:1px solid #66bb6a;box-shadow:0 2px 12px rgba(0,0,0,0.4);transition:opacity 0.3s';
    document.getElementById('script-editor').appendChild(el);
  }
  el.textContent = msg; el.style.opacity = '1';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

// ─── 实时同步 ────────────────────────────────────────────
socket.on('script-updated', (data) => {
  if (currentProject && currentProject.id === data.id) {
    currentProject.data = data.data;
    renderScript();
  }
});

// ─── 导出API ────────────────────────────────────────────
window.openScriptEditor = function(project) {
  currentProject = project;

  // 迁移旧数据格式 → 新格式
  const data = project.data || {};
  if (data.acts) {
    data.acts.forEach(act => {
      if (act.scenes) {
        act.scenes.forEach(scene => {
          // 旧格式：scene.dialogues → scene.lines
          if (scene.dialogues && !scene.lines) {
            scene.lines = scene.dialogues.map(d => ({
              type: 'dialogue',
              character: d.character || '',
              text: d.text || '',
            }));
            delete scene.dialogues;
          }
          if (!scene.lines) scene.lines = [];
        });
      }
    });
  }

  scriptTitle.textContent = `📜 ${esc(project.name)}`;
  renderScript();

  // 设置批注文档上下文
  if (window.setAnnotationDocument) {
    window.setAnnotationDocument(project.id);
  }
};

// ─── 幕按钮 ──────────────────────────────────────────────
document.getElementById('script-add-act').addEventListener('click', () => {
  if (!currentProject) return;
  currentProject.data.acts.push({ title: `第${currentProject.data.acts.length + 1}幕`, scenes: [] });
  renderScript(); saveData();
});

// ─── 导出按钮（动态创建在顶部） ────────────────────────
const exportBtn = document.createElement('button');
exportBtn.className = 'toolbar-btn';
exportBtn.textContent = '📤 导出';
exportBtn.title = '导出剧本';
exportBtn.style.cssText = 'font-size:12px;padding:2px 10px';
exportBtn.addEventListener('click', () => {
  if (!currentProject) return;
  const text = `# ${currentProject.name}\n\n`;
  exportScript('file');
});
document.querySelector('#panel-script .panel-actions').appendChild(exportBtn);

// ─── CollabStudio API ──────────────────────────────────
window.registerCollabModule && window.registerCollabModule('script', {
  name: 'script', open: (project) => window.openScriptEditor(project),
  save: () => saveData(),
  getData: () => currentProject ? currentProject.data : null,
  setData: (data) => { if (currentProject) { currentProject.data = data; renderScript(); } },
});

})();
