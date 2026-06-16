// ─── 思维导图 v3 — 类 XMind 完整版 ──────────────────────
(function() {

let currentProject = null;
let nodes = [];
let edges = [];
let selectedIds = new Set();
let nodeCounter = 0;

// 摄像机
const camera = { x: 0, y: 0, zoom: 1 };

// 拖拽
let drag = { active: false, nodeId: null, offX: 0, offY: 0, type: null };
let pan = { active: false, startX: 0, startY: 0, camX: 0, camY: 0 };

// DOM
const canvas = document.getElementById('mindmap-canvas');
const ctx = canvas.getContext('2d');
const titleEl = document.getElementById('mindmap-title');

// ─── 常量 ────────────────────────────────────────────────
const NODE_MIN_W = 100;
const NODE_H = 38;
const NODE_PAD = 14;
const LEVEL_GAP = 50;
const VERT_GAP = 12;
const FONT = '14px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
const COLORS = ['#4fc3f7','#7c4dff','#ff7043','#66bb6a','#ffca28','#ec407a','#26c6da','#ab47bc'];
const MARKERS = { 'priority1':'🔴','priority2':'🟠','priority3':'🟡','priority4':'🔵','priority5':'⚪','done':'✅','progress':'🔄','star':'⭐','important':'❗','question':'❓','idea':'💡','warning':'⚠️' };

// ─── 边查询工具函数 ──────────────────────────────────────
function getChildren(nodeId) {
  return edges.filter(e => e.from === nodeId).map(e => nodes.find(n => n.id === e.to)).filter(Boolean);
}

function getChildIds(nodeId) {
  return edges.filter(e => e.from === nodeId).map(e => e.to);
}

function getParentIds(nodeId) {
  return edges.filter(e => e.to === nodeId).map(e => e.from);
}

function getRootIds() {
  const hasInEdge = new Set(edges.map(e => e.to));
  return nodes.filter(n => !hasInEdge.has(n.id)).map(n => n.id);
}

function collectDescendants(id, visited = new Set()) {
  visited.add(id);
  for (const childId of getChildIds(id)) {
    if (!visited.has(childId)) collectDescendants(childId, visited);
  }
  return visited;
}

// ─── 撤销栈 ──────────────────────────────────────────────
let undoStack = [];
let redoStack = [];
const MAX_UNDO = 50;

function pushUndo() {
  undoStack.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) });
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack = [];
}

function undo() {
  if (undoStack.length === 0) return;
  redoStack.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) });
  const state = undoStack.pop();
  nodes = state.nodes; edges = state.edges;
  nodeCounter = nodes.reduce((m, n) => Math.max(m, parseInt(n.id.replace('n','')) || 0), 0);
  selectedIds.clear();
  render(); saveData();
}

function redo() {
  if (redoStack.length === 0) return;
  undoStack.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) });
  const state = redoStack.pop();
  nodes = state.nodes; edges = state.edges;
  nodeCounter = nodes.reduce((m, n) => Math.max(m, parseInt(n.id.replace('n','')) || 0), 0);
  selectedIds.clear();
  render(); saveData();
}

// ─── 搜索 ────────────────────────────────────────────────
let searchActive = false;
let searchQuery = '';

function startSearch() {
  // 使用页面内搜索输入，而非 prompt()
  let input = document.getElementById('mm-search-input');
  if (!input) {
    input = document.createElement('input');
    input.id = 'mm-search-input';
    input.type = 'text';
    input.placeholder = '搜索节点...';
    input.style.cssText = 'position:absolute;top:8px;right:8px;z-index:100;padding:6px 12px;border:1px solid var(--accent);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px;width:180px;outline:none';
    const parent = document.getElementById('mindmap-editor');
    parent.appendChild(input);
    input.addEventListener('blur', () => {
      setTimeout(() => { if (input && input !== document.activeElement) { input.remove(); searchActive = false; render(); } }, 200);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        searchQuery = input.value.trim();
        searchActive = !!searchQuery;
        input.remove();
        render();
        if (searchActive) {
          const found = nodes.filter(n => (n.text||'').includes(searchQuery));
          if (found.length > 0) {
            selectedIds.clear();
            selectedIds.add(found[0].id);
            const n = found[0];
            camera.x = canvas.width / 2 - (n.x + (n.width||NODE_MIN_W)/2) * camera.zoom;
            camera.y = canvas.height / 2 - (n.y + NODE_H/2) * camera.zoom;
            render();
          }
        }
      }
      if (e.key === 'Escape') { input.remove(); searchActive = false; render(); }
    });
  }
  input.value = searchQuery || '';
  input.focus();
  input.select();
}

// ─── 尺寸管理 ────────────────────────────────────────────
window.mmResize = function() {
  const parent = canvas.parentElement;
  canvas.width = parent.clientWidth;
  canvas.height = parent.clientHeight;
  render();
};
window.addEventListener('resize', () => {
  if (document.getElementById('panel-mindmap').classList.contains('active')) mmResize();
});

// ─── 打开导图 ────────────────────────────────────────────
window.openMindMapEditor = function(project) {
  currentProject = project;
  // 记住上次打开的导图
  try { localStorage.setItem('mm-last-id', project.id); } catch(e) {}
  // 去掉项目名中可能自带的 emoji（防止双图标）
  const cleanName = (project.name || '').replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2702}-\u{27B0}\s]+/u, '');
  titleEl.textContent = `🧠 ${esc(cleanName || project.name)}`;
  const data = project.data || { nodes: [], edges: [] };
  nodes = JSON.parse(JSON.stringify(data.nodes || []));
  edges = JSON.parse(JSON.stringify(data.edges || []));
  nodeCounter = nodes.reduce((m, n) => Math.max(m, parseInt(n.id.replace('n','')) || 0), 0);
  undoStack = []; redoStack = [];
  if (nodes.length === 0) {
    addNodeInternal('中心主题', COLORS[0]);
    autoLayout();
  }
  const root = nodes.find(n => getParentIds(n.id).length === 0);
  if (root) { camera.x = canvas.width / 2 - root.x; camera.y = canvas.height / 3 - root.y; camera.zoom = 1; }
  selectedIds.clear();
  setTimeout(mmResize, 50);
  updateHistoryList();
}

// ─── 布局引擎 ────────────────────────────────────────────
function autoLayout() {
  const rootIds = getRootIds();
  const roots = rootIds.map(id => nodes.find(n => n.id === id)).filter(Boolean);
  if (roots.length === 0) return;

  // 更新所有节点尺寸
  nodes.forEach(n => {
    n.textWidth = measureText(n.text || '节点');
    n.width = Math.max(NODE_MIN_W, n.textWidth + NODE_PAD * 2);
    n.height = NODE_H;
  });

  // 递归计算子树布局
  function layoutSubtree(nodeId, x) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return { totalH: 0 };
    if (node.collapsed) return { totalH: node.height + VERT_GAP };
    const children = getChildren(nodeId);
    if (children.length === 0) return { totalH: node.height + VERT_GAP };
    const results = children.map(c => layoutSubtree(c.id, x + LEVEL_GAP + node.width));
    const totalH = results.reduce((sum, r) => sum + r.totalH, 0);
    let yOff = -totalH / 2;
    children.forEach((c, i) => {
      c.x = x + LEVEL_GAP + (node.width / 2);
      c.y = yOff + results[i].totalH / 2 - c.height / 2;
      yOff += results[i].totalH;
    });
    return { totalH: Math.max(totalH, node.height + VERT_GAP) };
  }

  // 布局每个根节点（纵向排列多个根）
  let rootY = 0;
  roots.forEach((root, ri) => {
    root.x = 60 + ri * 30;
    root.y = rootY;
    const result = layoutSubtree(root.id, root.x);
    rootY += result.totalH + 20; // 每个根子树之间留 20px 间距
  });

  // 整体居中
  const bounds = getBounds();
  if (bounds.minY !== Infinity && bounds.minY < 0) {
    const shiftY = -bounds.minY + 30;
    nodes.forEach(n => { n.y += shiftY; });
  }
}

function autoLayoutAll() { pushUndo(); autoLayout(); render(); saveData(); }

function getBounds() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x + (n.width || NODE_MIN_W) > maxX) maxX = n.x + (n.width || NODE_MIN_W);
    if (n.y + (n.height || NODE_H) > maxY) maxY = n.y + (n.height || NODE_H);
  });
  return { minX, minY, maxX, maxY };
}

function measureText(text) { ctx.font = FONT; return ctx.measureText(text).width; }

// ─── 渲染引擎 ────────────────────────────────────────────
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.zoom, camera.zoom);
  drawGrid();
  edges.forEach(e => {
    if (isCollapsed(e.from) && !isCollapsedAncestorVisible(e.from)) return;
    if (isCollapsed(e.from)) return;
    const from = nodes.find(n => n.id === e.from);
    const to = nodes.find(n => n.id === e.to);
    if (!from || !to) return;
    if (isCollapsed(to)) return;
    if (isCollapsedAncestor(to)) return;
    drawEdge(from, to);
  });
  // 先渲染未被选中的节点
  nodes.forEach(n => { if (!selectedIds.has(n.id)) drawNode(n, false); });
  // 再渲染选中的节点（在顶层）
  nodes.forEach(n => { if (selectedIds.has(n.id)) drawNode(n, true); });
  // 绘制连接线拖拽
  if (connDrag) {
    const from = nodes.find(n => n.id === connDrag.fromId);
    if (from) {
      const fx = from.x + (from.width || NODE_MIN_W);
      const fy = from.y + (from.height || NODE_H) / 2;
      const w = screenToWorld(connDrag.currentX, connDrag.currentY);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.bezierCurveTo((fx + w.x) / 2, fy, (fx + w.x) / 2, w.y, w.x, w.y);
      ctx.strokeStyle = 'rgba(79, 195, 247, 0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      // 终点圆
      ctx.beginPath();
      ctx.arc(w.x, w.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(79, 195, 247, 0.4)';
      ctx.fill();
    }
  }

  ctx.restore();
  drawHUD();
}

function isCollapsed(id) {
  const n = nodes.find(x => x.id === id);
  return n && n.collapsed;
}

function isCollapsedAncestor(id) {
  const visited = new Set();
  const queue = [...getParentIds(id)];
  while (queue.length) {
    const pid = queue.shift();
    if (visited.has(pid)) continue;
    visited.add(pid);
    const p = nodes.find(n => n.id === pid);
    if (p && p.collapsed) return true;
    queue.push(...getParentIds(pid));
  }
  return false;
}

function drawGrid() {
  const gridSize = 40 * camera.zoom;
  const offsetX = camera.x % gridSize;
  const offsetY = camera.y % gridSize;
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = offsetX; x < canvas.width; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
  for (let y = offsetY; y < canvas.height; y += gridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
}

function drawEdge(from, to) {
  const fx = from.x + (from.width || NODE_MIN_W);
  const fy = from.y + (from.height || NODE_H) / 2;
  const tx = to.x;
  const ty = to.y + (to.height || NODE_H) / 2;
  const cx = (fx + tx) / 2;
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.bezierCurveTo(cx, fy, cx, ty, tx, ty);
  ctx.strokeStyle = 'rgba(79, 195, 247, 0.25)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath(); ctx.arc(tx, ty, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(79, 195, 247, 0.35)'; ctx.fill();
}

function drawNode(node, selected) {
  const x = node.x, y = node.y, w = node.width || NODE_MIN_W, h = node.height || NODE_H;
  const color = node.color || '#4fc3f7';
  const shape = node.shape || 'rect';

  ctx.save();
  ctx.shadowColor = selected ? 'rgba(79, 195, 247, 0.5)' : 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = selected ? 20 : 6;
  ctx.shadowOffsetY = selected ? 0 : 2;

  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, selected ? '#2a3a6a' : '#1e2a4a');
  grad.addColorStop(1, selected ? '#1e2a50' : '#162040');

  function drawBody() {
    switch (shape) {
      case 'ellipse': ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); break;
      case 'diamond':
        ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h / 2);
        ctx.lineTo(x + w / 2, y + h); ctx.lineTo(x, y + h / 2);
        ctx.closePath(); break;
      default: ctx.roundRect(x, y, w, h, 8); break;
    }
  }

  ctx.beginPath(); drawBody(); ctx.fillStyle = grad; ctx.fill();
  ctx.shadowBlur = 0;

  // 左侧色条（仅 rect 有）
  if (shape === 'rect') {
    ctx.beginPath(); ctx.roundRect(x, y, 4, h, { upperLeft: 8, lowerLeft: 8 });
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = selected ? color : 'rgba(255,255,255,0.06)';
    ctx.lineWidth = selected ? 1.5 : 0.5;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.stroke();
  } else {
    ctx.strokeStyle = selected ? color : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = selected ? 1.5 : 0.5;
    ctx.beginPath(); drawBody(); ctx.stroke();
  }

  // 选中虚线框
  if (selected) {
    ctx.save();
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.35)'; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); drawBody(); ctx.stroke();
    ctx.restore();
  }

  // 文字
  ctx.fillStyle = '#e8e8f0'; ctx.font = FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const displayText = editingNodeId === node.id ? editingText : (node.text || '节点');
  const maxW = w - 20;
  ctx.save(); ctx.beginPath(); drawBody(); ctx.clip();
  ctx.fillText(displayText, x + w / 2, y + h / 2, maxW);
  // 编辑模式：闪烁光标
  if (editingNodeId === node.id && cursorVisible) {
    const cursorText = displayText || '';
    const cw = measureText(cursorText);
    const cx = x + w / 2 + cw / 2 + 2;
    ctx.beginPath();
    ctx.moveTo(cx, y + 4);
    ctx.lineTo(cx, y + h - 4);
    ctx.strokeStyle = '#e8e8f0';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();

  // 标记
  if (node.marker && MARKERS[node.marker]) {
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(MARKERS[node.marker], x + w + 4, y - 4);
  }

  // 折叠按钮
  const children = getChildren(node.id);
  if (children.length > 0) {
    const bx = x + w + 4, by = y + h / 2 - 7;
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(79, 195, 247, 0.25)';
    ctx.beginPath(); ctx.roundRect(bx, by, 14, 14, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(node.collapsed ? '+' : '−', bx + 7, by + 7);
  }

  // 折叠提示线
  if (node.collapsed && children.length > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(x + w + 22, y + h / 2);
    ctx.lineTo(x + w + 60, y + h / 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${children.length}个子节点`, x + w + 26, y + h / 2);
  }

  // 搜索高亮
  if (searchActive && searchQuery && (node.text||'').toLowerCase().includes(searchQuery.toLowerCase())) {
    ctx.strokeStyle = '#ffca28'; ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.roundRect(x - 2, y - 2, w + 4, h + 4, 9); ctx.stroke();
  }

  // 连接点指示器（加大）
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(x + w + 10, y + h / 2, 7, 0, Math.PI * 2);
  ctx.fillStyle = selected ? 'rgba(79, 195, 247, 0.7)' : 'rgba(79, 195, 247, 0.2)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(79, 195, 247, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // 悬浮提示（hover 时变大）
  // 鼠标移到连接点上会触发 hitNodeConnector → cursor: crosshair

  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = '12px sans-serif';
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText(`${Math.round(camera.zoom * 100)}%`, canvas.width - 12, canvas.height - 8);
  if (searchActive) {
    ctx.fillStyle = 'rgba(255, 202, 40, 0.6)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`🔍 "${searchQuery}"`, 12, 12);
  }
}

// ─── 坐标系 ──────────────────────────────────────────────
function screenToWorld(sx, sy) { return { x: (sx - camera.x) / camera.zoom, y: (sy - camera.y) / camera.zoom }; }
function worldToScreen(wx, wy) { return { x: wx * camera.zoom + camera.x, y: wy * camera.zoom + camera.y }; }

function hitTest(sx, sy) {
  const w = screenToWorld(sx, sy);
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const nw = n.width || NODE_MIN_W, nh = n.height || NODE_H;
    if (w.x >= n.x && w.x <= n.x + nw && w.y >= n.y && w.y <= n.y + nh) return n;
  }
  return null;
}

function hitCollapseButton(sx, sy) {
  const w = screenToWorld(sx, sy);
  for (const n of nodes) {
    const children = getChildren(n.id);
    if (children.length === 0) continue;
    const bx = n.x + (n.width||NODE_MIN_W) + 4, by = n.y + (n.height||NODE_H)/2 - 7;
    if (w.x >= bx && w.x <= bx + 14 && w.y >= by && w.y <= by + 14) return n;
  }
  return null;
}

// ─── 浮动节点工具栏 ──────────────────────────────────────
let floatBar = null;

function showFloatingToolbar(node) {
  hideFloatingToolbar();
  const bar = document.createElement('div');
  bar.className = 'mm-float-bar';
  document.getElementById('mindmap-editor').appendChild(bar);
  floatBar = bar;

  // 颜色
  const cg = document.createElement('div'); cg.className = 'mm-fb-group';
  COLORS.forEach(c => {
    const dot = document.createElement('span');
    dot.className = 'mm-fb-color' + (c === node.color ? ' active' : '');
    dot.style.background = c;
    dot.addEventListener('click', e => { e.stopPropagation(); node.color = c; hideFloatingToolbar(); render(); saveData(); pushUndo(); });
    cg.appendChild(dot);
  });
  bar.appendChild(cg);
  bar.appendChild(sepEl());

  // 形状
  [{k:'rect',l:'▭'},{k:'ellipse',l:'○'},{k:'diamond',l:'◇'}].forEach(sh => {
    const b = document.createElement('button');
    b.className = 'mm-fb-btn' + (node.shape === sh.k ? ' active' : '');
    b.textContent = sh.l; b.title = sh.k;
    b.addEventListener('click', e => { e.stopPropagation(); node.shape = sh.k; hideFloatingToolbar(); render(); saveData(); pushUndo(); });
    bar.appendChild(b);
  });
  bar.appendChild(sepEl());

  // 添加子节点
  const cb = document.createElement('button');
  cb.className = 'mm-fb-btn'; cb.textContent = '➕子';
  cb.addEventListener('click', e => { e.stopPropagation(); hideFloatingToolbar(); addChild(); });
  bar.appendChild(cb);
  bar.appendChild(sepEl());

  // 删除
  const db = document.createElement('button');
  db.className = 'mm-fb-btn mm-fb-del'; db.textContent = '🗑';
  db.addEventListener('click', e => { e.stopPropagation(); hideFloatingToolbar(); deleteSelected(); });
  bar.appendChild(db);

  // 定位
  setTimeout(() => {
    const r = bar.getBoundingClientRect();
    const ed = document.getElementById('mindmap-editor').getBoundingClientRect();
    const cx = (node.x + (node.width || NODE_MIN_W) / 2) * camera.zoom + camera.x;
    const ty = node.y * camera.zoom + camera.y - r.height - 6;
    bar.style.position = 'absolute';
    bar.style.left = Math.max(4, cx - r.width / 2) + 'px';
    bar.style.top = Math.max(4, ty) + 'px';
    bar.style.transform = 'none';
  }, 0);

  function sepEl() { const s = document.createElement('span'); s.className = 'mm-fb-sep'; return s; }
}

function hideFloatingToolbar() {
  if (floatBar) { floatBar.remove(); floatBar = null; }
}

// 选中节点时显示浮动工具栏（在渲染后调用）
function onSelectionChanged() {
  if (selectedIds.size === 1) {
    const node = nodes.find(n => n.id === [...selectedIds][0]);
    if (node) showFloatingToolbar(node);
  } else {
    hideFloatingToolbar();
  }
}

// ─── 连接线拖拽 ──────────────────────────────────────────
let connDrag = null;

/** 检测鼠标是否在节点右侧连接点上 */
function hitNodeConnector(sx, sy) {
  const w = screenToWorld(sx, sy);
  for (const n of nodes) {
    // 右侧连接点（x + w + 10 处画的小圆）
    const nx = n.x + (n.width || NODE_MIN_W) + 10;
    const ny = n.y + (n.height || NODE_H) / 2;
    if (Math.hypot(w.x - nx, w.y - ny) < 18) return n;
  }
  return null;
}

// ─── 鼠标事件 ────────────────────────────────────────────
canvas.addEventListener('mousedown', onMouseDown);
// 点击 canvas 外结束编辑
document.addEventListener('mousedown', (e) => {
  if (editingNodeId && !e.target.closest('#mindmap-editor')) {
    finishEditing(true);
  }
});
canvas.addEventListener('mousemove', onMouseMove);
canvas.addEventListener('mouseup', onMouseUp);
canvas.addEventListener('wheel', onWheel, { passive: false });
canvas.addEventListener('dblclick', onDblClick);
canvas.addEventListener('contextmenu', onContextMenu);

function onMouseDown(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

  // 编辑中点击 node 外部 → 结束编辑
  if (editingNodeId) {
    const hit = hitTest(sx, sy);
    if (!hit || hit.id !== editingNodeId) {
      finishEditing(true);
      // 如果点击的是另一个 node，继续让选中逻辑执行
    } else {
      return; // 点击同一个 node，保持编辑
    }
  }

  // 检查是否点击了连接点（开始拖拽连线）
  const connH = hitNodeConnector(sx, sy);
  if (connH) {
    connDrag = { fromId: connH.id, startX: sx, startY: sy, currentX: sx, currentY: sy };
    canvas.style.cursor = 'crosshair';
    return;
  }

  const collapseHit = hitCollapseButton(sx, sy);
  if (collapseHit) {
    toggleCollapse(collapseHit.id);
    return;
  }
  const hit = hitTest(sx, sy);
  if (hit) {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      if (selectedIds.has(hit.id)) selectedIds.delete(hit.id); else selectedIds.add(hit.id);
      render(); onSelectionChanged(); return;
    }
    selectedIds.clear(); selectedIds.add(hit.id); render(); onSelectionChanged();
    drag.active = true; drag.nodeId = hit.id; drag.type = 'node';
    const ws = worldToScreen(hit.x, hit.y);
    drag.offX = sx - ws.x; drag.offY = sy - ws.y;
  } else {
    selectedIds.clear(); render(); onSelectionChanged();
    pan.active = true; pan.startX = sx; pan.startY = sy;
    pan.camX = camera.x; pan.camY = camera.y;
    canvas.style.cursor = 'grabbing';
  }
}

function onMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  // 连接线拖拽
  if (connDrag) {
    connDrag.currentX = sx; connDrag.currentY = sy;
    render();
    return;
  }

  if (drag.active && drag.nodeId) {
    const node = nodes.find(n => n.id === drag.nodeId);
    if (node) {
      const wPos = screenToWorld(sx - drag.offX, sy - drag.offY);
      const dx = wPos.x - node.x, dy = wPos.y - node.y;
      for (const id of selectedIds) { const n = nodes.find(nd => nd.id === id); if (n) { n.x += dx; n.y += dy; } }
      render();
    }
  } else if (pan.active) {
    camera.x = pan.camX + (sx - pan.startX); camera.y = pan.camY + (sy - pan.startY);
    render();
  } else {
    if (hitNodeConnector(sx, sy)) canvas.style.cursor = 'crosshair';
    else if (hitTest(sx, sy)) canvas.style.cursor = 'pointer';
    else canvas.style.cursor = 'grab';
  }
}

function onMouseUp(_e) {
  if (drag.active) { saveData(); }
  drag.active = false; drag.nodeId = null;
  pan.active = false;

  // 连接线拖拽释放
  if (connDrag) {
    const rect = canvas.getBoundingClientRect();
    const sx = _e.clientX - rect.left, sy = _e.clientY - rect.top;
    const target = hitTest(sx, sy);
    if (target && target.id !== connDrag.fromId) {
      // 检查是否已有连接
      const exists = edges.some(e => e.from === connDrag.fromId && e.to === target.id);
      if (!exists) {
        pushUndo();
        edges.push({ from: connDrag.fromId, to: target.id });
        render(); saveData();
      }
    }
    connDrag = null;
  }

  canvas.style.cursor = 'grab';
}

function onWheel(e) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    const oldZoom = camera.zoom;
    camera.zoom = Math.max(0.2, Math.min(3, camera.zoom + delta));
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    camera.x = mx - (mx - camera.x) * (camera.zoom / oldZoom);
    camera.y = my - (my - camera.y) * (camera.zoom / oldZoom);
    render();
  } else {
    camera.y -= e.deltaY * 0.5; render();
  }
}

function onDblClick(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const hit = hitTest(sx, sy);
  if (hit) { startEditing(hit); }
}

// ─── 右键菜单 ────────────────────────────────────────────
let contextMenu = null;

function onContextMenu(e) {
  e.preventDefault(); hideContextMenu();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const hit = hitTest(sx, sy);

  // ── 右键空白区域 ──
  if (!hit) {
    const items = [
      { icon: '➕', label: '新建节点', action: () => { const w = screenToWorld(sx, sy); pushUndo(); const id = addNodeInternal('新节点', COLORS[nodeCounter % COLORS.length]); const n = nodes.find(x => x.id === id); if (n) { n.x = w.x - 50; n.y = w.y - NODE_H/2; } selectedIds.clear(); selectedIds.add(id); render(); saveData(); } },
      { icon: '📄', label: '粘贴', shortcut: '⌘V', action: pasteNodes },
      { sep: true },
      { icon: '⊞', label: '自动布局', action: autoLayoutAll },
      { icon: '⬆', label: '适应屏幕', action: fitToScreen },
      { sep: true },
      { icon: '🔍', label: '搜索', shortcut: '⌘F', action: startSearch },
      { sep: true },
      { icon: '−', label: '缩小', action: zoomOut },
      { icon: '+', label: '放大', action: zoomIn },
      { icon: '🗑', label: '清空导图', action: async () => { if (await showConfirm('清空所有节点？', '清空确认', '🗑️')) { pushUndo(); nodes = []; edges = []; selectedIds.clear(); render(); saveData(); } } },
    ];
    buildContextMenu(items, e);
    return;
  }

  // ── 右键节点 ──
  if (!selectedIds.has(hit.id)) { selectedIds.clear(); selectedIds.add(hit.id); render(); onSelectionChanged(); }
  const targetNode = hit;

  const items = [];

  // 多选连接
  if (selectedIds.size >= 2) {
    items.push({ icon: '🔗', label: '连接选中', action: connectSelectedNodes });
    items.push({ sep: true });
  }

  // ── 编辑 ──
  items.push({ icon: '✏️', label: '编辑', shortcut: 'F2', action: () => startEditing(targetNode) });
  items.push({ icon: '🌱', label: '子节点', shortcut: 'Tab', action: addChild });
  items.push({ icon: '↔', label: '同级', shortcut: 'Enter', action: addSibling });
  items.push({ icon: '👆', label: '上级', action: addParent });
  items.push({ sep: true });

  // ── 复制/删除 ──
  items.push({ icon: '📋', label: '复制', shortcut: '⌘C', action: copySelected });
  items.push({ icon: '📄', label: '粘贴', shortcut: '⌘V', action: pasteNodes });
  items.push({ icon: '🗑', label: '删除', shortcut: 'Del', action: deleteSelected });
  items.push({ sep: true });

  // ── 节点属性 ──
  items.push({ icon: targetNode.collapsed ? '▶' : '▼', label: targetNode.collapsed ? '展开' : '折叠', action: () => toggleCollapse(targetNode.id) });
  items.push({ icon: '🎨', label: '颜色', children: COLORS.map(c => ({ color: c })) });
  items.push({ icon: '🏷', label: '标记', children: Object.keys(MARKERS).map(k => ({ label: `${MARKERS[k]} ${k}` })) });
  items.push({ icon: '📝', label: '备注', action: () => showNote(targetNode) });
  items.push({ sep: true });

  // ── 视图 ──
  items.push({ icon: '⊞', label: '自动布局', action: autoLayoutAll });
  items.push({ icon: '⬆', label: '适应屏幕', action: fitToScreen });
  items.push({ icon: '⛶', label: '全屏', action: openFullscreen });

  const menu = buildContextMenu(items, e);
  menu.dataset.nodeId = targetNode.id;
}

function connectSelectedNodes() {
  if (selectedIds.size < 2) return;
  pushUndo();
  const ids = [...selectedIds];
  for (let i = 0; i < ids.length - 1; i++) {
    const from = ids[i], to = ids[i + 1];
    const exists = edges.some(e => e.from === from && e.to === to);
    if (!exists) {
      edges.push({ from, to });
    }
  }
  render(); saveData();
  showToast(`🔗 ${ids.length} 个节点已连接`);
}

function positionMenu(menu, e) {
  const mr = menu.getBoundingClientRect();
  if (mr.right > window.innerWidth) menu.style.left = (window.innerWidth - mr.width - 10) + 'px';
  if (mr.bottom > window.innerHeight) menu.style.top = (window.innerHeight - mr.height - 10) + 'px';
}

let _mmActionId = 0;

function buildContextMenu(items, e) {
  hideContextMenu();
  if (!window._mmActions) window._mmActions = {};
  const menu = document.createElement('div');
  menu.className = 'mm-context-menu';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';

  for (const item of items) {
    if (item.sep) {
      const sep = document.createElement('div');
      sep.className = 'mm-cm-sep';
      menu.appendChild(sep);
      continue;
    }

    if (item.children) {
      // 子菜单
      const wrapper = document.createElement('div');
      wrapper.className = 'mm-cm-sub';
      const header = document.createElement('div');
      header.className = 'mm-cm-item';
      header.innerHTML = `<span class="mm-cm-icon">${item.icon||''}</span><span class="mm-cm-label">${item.label}</span><span class="mm-cm-arrow">▶</span>`;
      wrapper.appendChild(header);

      const subMenu = document.createElement('div');
      subMenu.className = 'mm-cm-sub-menu';
      for (const sub of item.children) {
        const el = document.createElement('div');
        el.className = 'mm-cm-item';
        if (sub.color) {
          el.innerHTML = `<span class="mm-color-swatch" style="background:${sub.color}"></span>`;
          el.dataset.cmColor = sub.color;
        } else {
          el.innerHTML = `<span>${sub.label}</span>`;
          el.dataset.cmMarker = sub.label.split(' ')[1];
        }
        subMenu.appendChild(el);
      }
      wrapper.appendChild(subMenu);
      menu.appendChild(wrapper);
    } else {
      const el = document.createElement('div');
      el.className = 'mm-cm-item';
      el.innerHTML = `<span class="mm-cm-icon">${item.icon||''}</span><span class="mm-cm-label">${item.label}</span>${item.shortcut ? `<span class="mm-cm-shortcut">${item.shortcut}</span>` : ''}`;
      if (item.action) {
        const id = 'ma' + (++_mmActionId);
        window._mmActions[id] = item.action;
        el.dataset.cmAction = id;
      }
      menu.appendChild(el);
    }
  }

  document.body.appendChild(menu);
  contextMenu = menu;
  positionMenu(menu, e);
  return menu;
}

document.addEventListener('click', (e) => {
  if (!contextMenu) return;
  const item = e.target.closest('.mm-cm-item');
  if (!item || !contextMenu.contains(item)) return;

  // 子菜单 header 不触发
  if (item.closest('.mm-cm-sub') && !item.closest('.mm-cm-sub-menu')) return;

  // 颜色选择
  if (item.dataset.cmColor) {
    setNodeColor(contextMenu.dataset.nodeId, item.dataset.cmColor);
    hideContextMenu();
    return;
  }

  // 标记选择
  if (item.dataset.cmMarker) {
    const node = nodes.find(n => n.id === contextMenu.dataset.nodeId);
    if (node) setMarker(node.id, node.marker === item.dataset.cmMarker ? null : item.dataset.cmMarker);
    hideContextMenu();
    return;
  }

  // 内联 action
  if (item.dataset.cmAction && window._mmActions && window._mmActions[item.dataset.cmAction]) {
    hideContextMenu();
    window._mmActions[item.dataset.cmAction]();
    return;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideContextMenu();
});

// 点击菜单外部关闭
document.addEventListener('mousedown', (e) => {
  if (contextMenu && !contextMenu.contains(e.target)) hideContextMenu();
});

function hideContextMenu() {
  if (contextMenu) { contextMenu.remove(); contextMenu = null; }
}

// ─── 节点操作 ────────────────────────────────────────────
function addNodeInternal(text, color) {
  const id = 'n' + (++nodeCounter);
  const nw = measureText(text) + NODE_PAD * 2 + 10;
  nodes.push({ id, text: text || '节点', x: 0, y: 0, width: Math.max(NODE_MIN_W, nw), height: NODE_H, color: color || COLORS[0], collapsed: false, marker: null, note: '' });
  return id;
}

function getSelectedNode() {
  if (selectedIds.size === 0) return null;
  return nodes.find(n => n.id === [...selectedIds][0]);
}

function findVacantSpot(baseX, baseY, w, h, excludeId) {
  // 从 baseX, baseY 开始找空位，逐步偏移直到不与其他节点重叠
  let attempts = 0;
  const pad = 10;
  while (attempts < 30) {
    let overlap = false;
    for (const n of nodes) {
      if (n.id === excludeId) continue;
      const nw = n.width || NODE_MIN_W, nh = n.height || NODE_H;
      if (baseX < n.x + nw + pad && baseX + w + pad > n.x &&
          baseY < n.y + nh + pad && baseY + h + pad > n.y) {
        overlap = true;
        break;
      }
    }
    if (!overlap) return { x: baseX, y: baseY };
    // 有重叠：尝试偏移
    if (attempts % 2 === 0) baseX += 40;
    else { baseX -= 40; baseY += 50; }
    attempts++;
  }
  return { x: baseX, y: baseY }; // 保底
}

function addChild() {
  const parent = getSelectedNode(); if (!parent) return;
  pushUndo();
  const id = addNodeInternal('子节点', COLORS[(nodeCounter + 1) % COLORS.length]);
  edges.push({ from: parent.id, to: id });
  const child = nodes.find(n => n.id === id);
  const ch = child.height || NODE_H;
  // 计算已有子节点数量
  const existingChildren = getChildren(parent.id).filter(c => c.id !== id);
  const baseX = parent.x + (parent.width || NODE_MIN_W) + LEVEL_GAP;
  const baseY = existingChildren.length > 0
    ? existingChildren[existingChildren.length - 1].y
    : parent.y;
  const spot = findVacantSpot(baseX, baseY + (existingChildren.length > 0 ? ch + VERT_GAP : 0), child.width || NODE_MIN_W, ch, id);
  child.x = spot.x; child.y = spot.y;
  selectedIds.clear(); selectedIds.add(id);
  render(); saveData();
  const s = worldToScreen(child.x, child.y);
  startEditing(child);
}

function addSibling() {
  const ref = getSelectedNode(); if (!ref) return;
  const parentIds = getParentIds(ref.id);
  if (parentIds.length === 0) return;
  const parentId = parentIds[0];
  pushUndo();
  const id = addNodeInternal('同级节点', COLORS[nodeCounter % COLORS.length]);
  edges.push({ from: parentId, to: id });
  const sibling = nodes.find(n => n.id === id);
  const sh = sibling.height || NODE_H;
  const existing = getChildren(parentId);
  const lastY = existing.reduce((max, n) => Math.max(max, n.y + (n.height || NODE_H)), 0);
  const spot = findVacantSpot(ref.x, lastY + VERT_GAP, sibling.width || NODE_MIN_W, sh, id);
  sibling.x = spot.x; sibling.y = spot.y;
  selectedIds.clear(); selectedIds.add(id);
  render(); saveData(); startEditing(sibling);
}

function addParent() {
  const child = getSelectedNode(); if (!child) return;
  pushUndo();
  const id = addNodeInternal('上级节点', COLORS[nodeCounter % COLORS.length]);
  const parent = nodes.find(n => n.id === id);
  // 将原有指向 child 的边重定向到新节点
  const incomingEdges = edges.filter(e => e.to === child.id);
  incomingEdges.forEach(e => { e.to = id; });
  // 新节点 → child
  edges.push({ from: id, to: child.id });
  parent.x = child.x - 120; parent.y = child.y;
  selectedIds.clear(); selectedIds.add(id);
  render(); saveData();
}

function deleteSelected() {
  if (selectedIds.size === 0) return;
  pushUndo();
  const toDelete = new Set();
  for (const id of selectedIds) {
    const descendants = collectDescendants(id);
    for (const did of descendants) toDelete.add(did);
  }
  nodes = nodes.filter(n => !toDelete.has(n.id));
  edges = edges.filter(e => !toDelete.has(e.from) && !toDelete.has(e.to));
  selectedIds.clear();
  autoLayout(); render(); saveData();
}

function toggleCollapse(id) {
  pushUndo();
  const node = nodes.find(n => n.id === id);
  if (node) { node.collapsed = !node.collapsed; autoLayout(); render(); saveData(); }
}

function expandAll() {
  pushUndo();
  nodes.forEach(n => { n.collapsed = false; });
  autoLayout(); render(); saveData();
}

function setNodeColor(id, color) {
  pushUndo();
  const node = nodes.find(n => n.id === id);
  if (node) { node.color = color; render(); saveData(); }
}

function setMarker(id, marker) {
  pushUndo();
  const node = nodes.find(n => n.id === id);
  if (node) { node.marker = marker; render(); saveData(); }
}

// ─── 复制 / 粘贴 / 剪切 ─────────────────────────────────
let clipboard = null;

function copySelected() {
  if (selectedIds.size === 0) return;
  const rootId = [...selectedIds][0];
  const toCopy = collectDescendants(rootId);
  clipboard = {
    nodes: nodes.filter(n => toCopy.has(n.id)).map(n => {
      const { parentId, ...rest } = n;
      return { ...rest, id: undefined };
    }),
    edges: edges.filter(e => toCopy.has(e.from) && toCopy.has(e.to)).map(e => ({...e})),
  };
  showToast(`📋 已复制 ${clipboard.nodes.length} 个节点`);
}

function cutSelected() {
  if (selectedIds.size === 0) return;
  copySelected();
  deleteSelected();
}

function pasteNodes() {
  if (!clipboard || clipboard.nodes.length === 0) return;
  const parent = getSelectedNode();
  if (!parent) return;
  pushUndo();
  const idMap = {};
  const newNodes = clipboard.nodes.map(n => {
    const newId = 'n' + (++nodeCounter);
    idMap[n.id || 'old'] = newId;
    const { parentId, ...rest } = n;
    return { ...rest, id: newId };
  });
  // 重建边（边已包含所有连接关系，不再需要 parentId）
  const newEdges = clipboard.edges.map(e => ({
    from: idMap[e.from] || parent.id,
    to: idMap[e.to] || (newNodes[0] ? newNodes[0].id : ''),
  })).filter(e => e.to);

  nodes.push(...newNodes);
  edges.push(...newEdges);
  autoLayout();
  selectedIds.clear();
  if (newNodes[0]) selectedIds.add(newNodes[0].id);
  render(); saveData();
  showToast(`📄 已粘贴 ${newNodes.length} 个节点`);
}

// ─── 节点备注 ────────────────────────────────────────────
let noteOverlay = null;

function showNote(node) {
  hideNote();
  noteOverlay = document.createElement('div');
  noteOverlay.className = 'mm-note-overlay';
  noteOverlay.innerHTML = `
    <div class="mm-note-card">
      <div class="mm-note-header">
        <strong>📝 ${esc(node.text||'节点')}</strong>
        <button class="mm-note-close">×</button>
      </div>
      <textarea class="mm-note-textarea" rows="4" placeholder="写备注...">${esc(node.note||'')}</textarea>
    </div>
  `;
  document.body.appendChild(noteOverlay);

  const textarea = noteOverlay.querySelector('.mm-note-textarea');
  const close = noteOverlay.querySelector('.mm-note-close');

  let noteTimer;
  textarea.addEventListener('input', () => {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      node.note = textarea.value;
      saveData();
    }, 500);
  });

  const finish = () => { hideNote(); };
  close.addEventListener('click', finish);
  noteOverlay.addEventListener('click', (e) => { if (e.target === noteOverlay) finish(); });
  textarea.focus();
}

function hideNote() {
  if (noteOverlay) { noteOverlay.remove(); noteOverlay = null; }
}

// ─── Canvas 内联编辑 ────────────────────────────────────
let editingNodeId = null;
let editingText = '';
let cursorBlinkTimer = null;
let cursorVisible = true;

function startEditing(node) {
  if (isLocked('mindmap-node', node.id)) {
    showToast(`🔒 ${getLockUser('mindmap-node', node.id)} 正在编辑`);
    return;
  }
  acquireLock('mindmap-node', node.id);
  editingNodeId = node.id;
  editingText = node.text || '';
  cursorVisible = true;
  selectedIds.clear(); selectedIds.add(node.id);
  clearInterval(cursorBlinkTimer);
  cursorBlinkTimer = setInterval(() => {
    cursorVisible = !cursorVisible;
    render();
  }, 530);
  render();
}

function finishEditing(save) {
  if (!editingNodeId) return;
  clearInterval(cursorBlinkTimer);
  cursorBlinkTimer = null;
  const node = nodes.find(n => n.id === editingNodeId);
  if (node) {
    releaseLock('mindmap-node', editingNodeId);
    if (save !== false && node.text !== editingText) {
      pushUndo();
      node.text = editingText || '节点';
      node.textWidth = measureText(node.text);
      node.width = Math.max(NODE_MIN_W, node.textWidth + NODE_PAD * 2);
    }
  }
  editingNodeId = null;
  editingText = '';
  render();
  if (node) saveData();
}

// ─── Toast ────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  let el = document.getElementById('mm-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mm-toast';
    el.style.cssText = 'position:absolute;bottom:60px;left:50%;transform:translateX(-50%);background:#1a2a3a;color:#e0e0f0;padding:8px 16px;border-radius:8px;font-size:13px;z-index:100;border:1px solid #4fc3f7;box-shadow:0 2px 12px rgba(0,0,0,0.4);transition:opacity 0.3s';
    canvas.parentElement.appendChild(el);
  }
  el.textContent = msg; el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 2000);
}

window.addEventListener('locks-changed', () => {
  if (editingNodeId && isLocked('mindmap-node', editingNodeId)) {
    const user = getLockUser('mindmap-node', editingNodeId);
    if (user && user !== myName) { finishEditing(false); showToast(`🔒 ${user} 正在编辑`); }
  }
  if (document.getElementById('panel-mindmap').classList.contains('active')) render();
});

// ─── 保存 ────────────────────────────────────────────────
function saveData() {
  if (!currentProject) return;
  currentProject.data = { nodes: nodes.map(n => ({...n})), edges: edges.map(e => ({...e})) };
  socket.emit('project-update', { id: currentProject.id, data: currentProject.data });
}

// ─── 实时同步 ────────────────────────────────────────────
socket.on('project-updated', (data) => {
  if (currentProject && currentProject.id === data.id && data.data) {
    currentProject.data = data.data;
    nodes = JSON.parse(JSON.stringify(data.data.nodes || []));
    edges = JSON.parse(JSON.stringify(data.data.edges || []));
    nodeCounter = nodes.reduce((m, n) => Math.max(m, parseInt(n.id.replace('n','')) || 0), 0);
    render();
  }
});

// ─── 键盘快捷键 ──────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (noteOverlay || contextMenu) return;
  const panel = document.getElementById('panel-mindmap');
  if (!panel || !panel.classList.contains('active')) return;

  // ── Canvas 内编辑模式 ──
  if (editingNodeId) {
    if (e.key === 'Enter') { e.preventDefault(); finishEditing(true); return; }
    if (e.key === 'Escape') { e.preventDefault(); finishEditing(false); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      finishEditing(true);
      addChild();
      return;
    }
    if (e.key === 'Backspace') {
      // 删除时不要触发 deleteSelected
      e.preventDefault();
      editingText = editingText.slice(0, -1);
      const node = nodes.find(n => n.id === editingNodeId);
      if (node) {
        node.textWidth = measureText(editingText || '节点');
        node.width = Math.max(NODE_MIN_W, node.textWidth + NODE_PAD * 2);
      }
      render();
      return;
    }
    // 可打印字符
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      editingText += e.key;
      const node = nodes.find(n => n.id === editingNodeId);
      if (node) {
        node.textWidth = measureText(editingText || '节点');
        node.width = Math.max(NODE_MIN_W, node.textWidth + NODE_PAD * 2);
      }
      render();
      return;
    }
    return; // 编辑中其他键忽略
  }

  // ── 普通快捷键 ──
  if (e.ctrlKey || e.metaKey) {
    switch (e.key.toLowerCase()) {
      case 'z': e.preventDefault(); if (e.shiftKey) redo(); else undo(); break;
      case 'y': e.preventDefault(); redo(); break;
      case 'c': e.preventDefault(); copySelected(); break;
      case 'v': e.preventDefault(); pasteNodes(); break;
      case 'x': e.preventDefault(); cutSelected(); break;
      case 'f': e.preventDefault(); startSearch(); break;
      case 's': e.preventDefault(); saveData(); showToast('💾 已保存'); break;
    }
    return;
  }

  switch (e.key) {
    case 'Tab': e.preventDefault(); addChild(); break;
    case 'Enter': e.preventDefault(); addSibling(); break;
    case 'Delete': case 'Backspace': e.preventDefault(); deleteSelected(); break;
    case ' ': case 'F2': e.preventDefault(); const n = getSelectedNode(); if (n) startEditing(n); break;
  }
});

// ─── 工具栏 ──────────────────────────────────────────────
document.getElementById('mm-add-root').addEventListener('click', () => {
  pushUndo();
  const id = addNodeInternal('中心主题', COLORS[0]);
  autoLayout();
  selectedIds.clear(); selectedIds.add(id);
  render(); saveData();
});
// 面板头部的「+ 节点」按钮
const mmAddNodeBtn = document.getElementById('mindmap-add-node');
if (mmAddNodeBtn) mmAddNodeBtn.addEventListener('click', () => document.getElementById('mm-add-root').click());
document.getElementById('mm-add-child').addEventListener('click', addChild);
document.getElementById('mm-add-sibling').addEventListener('click', addSibling);
document.getElementById('mm-delete-node').addEventListener('click', deleteSelected);

// 事件绑定（按钮已在 HTML 中）
document.getElementById('mm-undo').addEventListener('click', undo);
document.getElementById('mm-redo').addEventListener('click', redo);
document.getElementById('mm-collapse-toggle').addEventListener('click', () => {
  const n = getSelectedNode(); if (n) { toggleCollapse(n.id); }
});

// 搜索按钮（动态创建）
const searchBtn = document.createElement('button');
searchBtn.className = 'tool-btn'; searchBtn.textContent = '🔍 搜索';
searchBtn.title = '搜索节点 (Ctrl+F)';
searchBtn.addEventListener('click', startSearch);
document.getElementById('mindmap-toolbar').appendChild(searchBtn);

// 历史下拉按钮（动态创建）
const histBtn = document.createElement('button');
histBtn.className = 'tool-btn'; histBtn.textContent = '📂 历史';
histBtn.title = '切换思维导图';
histBtn.addEventListener('click', toggleHistoryDropdown);
document.getElementById('mindmap-toolbar').appendChild(histBtn);

let histDropdown = null;
function toggleHistoryDropdown() {
  if (histDropdown) { histDropdown.remove(); histDropdown = null; return; }
  const mmProjects = (window.projects || []).filter(p => p.type === 'mindmap');
  if (mmProjects.length === 0) return;
  const dd = document.createElement('div');
  dd.className = 'mm-hist-dropdown';
  const rect = histBtn.getBoundingClientRect();
  dd.style.position = 'fixed';
  dd.style.left = rect.left + 'px';
  dd.style.top = (rect.bottom + 4) + 'px';
  dd.style.minWidth = '180px';
  // 当前项目排第一
  mmProjects.sort((a, b) => a.id === (currentProject && currentProject.id) ? -1 : b.id === (currentProject && currentProject.id) ? 1 : 0);
  mmProjects.forEach(p => {
    const item = document.createElement('div');
    item.className = 'mm-hist-item' + (p.id === (currentProject && currentProject.id) ? ' active' : '');
    item.innerHTML = `<span>🧠 ${esc(p.name)}</span><span style="color:var(--text-dim);font-size:11px">${timeAgo(p.updatedAt)}</span>`;
    item.addEventListener('click', () => {
      dd.remove(); histDropdown = null;
      if (p.id !== (currentProject && currentProject.id)) {
        openProjectFromList(p);
      }
    });
    dd.appendChild(item);
  });
  document.body.appendChild(dd);
  histDropdown = dd;
  // 点击外部关闭
  setTimeout(() => document.addEventListener('click', closeHist, { once: true }), 0);
}
function closeHist(e) { if (histDropdown && !histDropdown.contains(e.target) && e.target !== histBtn) { histDropdown.remove(); histDropdown = null; } }

// 辅助：直接从 projects 列表打开导图
function openProjectFromList(p) {
  if (window.openMindMapEditor) window.openMindMapEditor(p);
  // 切换到导图面板
  const navBtn = document.querySelector('.nav-btn[data-module="mindmap"]');
  if (navBtn) navBtn.click();
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  return Math.floor(diff / 86400000) + '天前';
}

function updateHistoryList() {
  // 更新历史按钮状态（如有的话）
}

// 缩放按钮（动态创建）
const zoomOutBtn = document.createElement('button');
zoomOutBtn.className = 'tool-btn'; zoomOutBtn.textContent = '🔍-';
zoomOutBtn.title = '缩小'; zoomOutBtn.addEventListener('click', () => { camera.zoom = Math.max(0.2, camera.zoom - 0.2); render(); });
document.getElementById('mindmap-toolbar').appendChild(zoomOutBtn);

const zoomInBtn = document.createElement('button');
zoomInBtn.className = 'tool-btn'; zoomInBtn.textContent = '🔍+';
zoomInBtn.title = '放大'; zoomInBtn.addEventListener('click', () => { camera.zoom = Math.min(3, camera.zoom + 0.2); render(); });
document.getElementById('mindmap-toolbar').insertBefore(zoomInBtn, document.getElementById('mindmap-toolbar').firstChild);

const fitBtn = document.createElement('button');
fitBtn.className = 'tool-btn'; fitBtn.textContent = '⊞ 适应';
fitBtn.title = '适应屏幕'; fitBtn.addEventListener('click', fitToScreen);
document.getElementById('mindmap-toolbar').appendChild(fitBtn);

const fullBtn = document.createElement('button');
fullBtn.className = 'tool-btn'; fullBtn.textContent = '⛶ 全屏';
fullBtn.title = '全屏页面'; fullBtn.addEventListener('click', openFullscreen);
document.getElementById('mindmap-toolbar').appendChild(fullBtn);

const exportBtn = document.createElement('button');
exportBtn.className = 'tool-btn'; exportBtn.textContent = '📤 导出';
exportBtn.title = '导出为图片';
exportBtn.addEventListener('click', exportImage);
document.getElementById('mindmap-toolbar').appendChild(exportBtn);

function fitToScreen() {
  const bounds = getBounds();
  if (bounds.minX === Infinity) return;
  const pad = 40;
  const bw = bounds.maxX - bounds.minX + pad * 2;
  const bh = bounds.maxY - bounds.minY + pad * 2;
  const zoomX = canvas.width / bw, zoomY = canvas.height / bh;
  camera.zoom = Math.min(zoomX, zoomY, 1.5);
  camera.x = -bounds.minX * camera.zoom + pad * camera.zoom;
  camera.y = -bounds.minY * camera.zoom + pad * camera.zoom;
  render();
}

function openFullscreen() {
  const el = document.getElementById('mindmap-editor');
  if (!el) return;
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    el.requestFullscreen().catch(() => {
      // 某些浏览器可能需要不同前缀
      if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else if (el.msRequestFullscreen) el.msRequestFullscreen();
    });
  }
}

function exportImage() {
  if (nodes.length === 0) return;

  // 计算完整边界：遍历所有节点，包括右侧连接点(+14)、标记(+24)、折叠按钮(+20)、折叠提示(+70)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    const w = (n.width || NODE_MIN_W);
    const h = (n.height || NODE_H);
    // 基本矩形
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    // 右侧扩展：连接点 + 折叠按钮 + 折叠提示
    let rightExtra = 14; // 连接点
    if (getChildren(n.id).length > 0) rightExtra = Math.max(rightExtra, 20); // 折叠按钮
    if (n.collapsed) rightExtra = Math.max(rightExtra, 70); // 折叠提示线
    if (n.marker) { // 标记在上面
      if (n.y - 24 < minY) minY = n.y - 24;
    }
    if (n.x + w + rightExtra > maxX) maxX = n.x + w + rightExtra;
    if (n.y + h > maxY) maxY = n.y + h;
  });

  const pad = 60;
  const totalW = maxX - minX + pad * 2;
  const totalH = maxY - minY + pad * 2;
  const scale = 2; // 2x 高清

  const expCanvas = document.createElement('canvas');
  expCanvas.width = Math.ceil(totalW * scale);
  expCanvas.height = Math.ceil(totalH * scale);
  const expCtx = expCanvas.getContext('2d');

  // 深色背景
  expCtx.fillStyle = '#0d0d1a';
  expCtx.fillRect(0, 0, expCanvas.width, expCanvas.height);

  // 网格
  expCtx.strokeStyle = 'rgba(255,255,255,0.03)';
  expCtx.lineWidth = 1;
  for (let x = 0; x < expCanvas.width; x += 40 * scale) {
    expCtx.beginPath(); expCtx.moveTo(x, 0); expCtx.lineTo(x, expCanvas.height); expCtx.stroke();
  }
  for (let y = 0; y < expCanvas.height; y += 40 * scale) {
    expCtx.beginPath(); expCtx.moveTo(0, y); expCtx.lineTo(expCanvas.width, y); expCtx.stroke();
  }

  expCtx.translate(Math.ceil(pad * scale), Math.ceil(pad * scale));
  expCtx.scale(scale, scale);
  expCtx.translate(-minX, -minY);

  // 绘制所有边
  edges.forEach(e => {
    const from = nodes.find(n => n.id === e.from);
    const to = nodes.find(n => n.id === e.to);
    if (!from || !to) return;
    if (isCollapsed(e.from) || isCollapsed(e.to) || isCollapsedAncestor(e.to)) return;
    const fx = from.x + (from.width || NODE_MIN_W);
    const fy = from.y + (from.height || NODE_H) / 2;
    const tx = to.x;
    const ty = to.y + (to.height || NODE_H) / 2;
    const cx = (fx + tx) / 2;
    expCtx.beginPath();
    expCtx.moveTo(fx, fy);
    expCtx.bezierCurveTo(cx, fy, cx, ty, tx, ty);
    expCtx.strokeStyle = 'rgba(79, 195, 247, 0.25)';
    expCtx.lineWidth = 2.5;
    expCtx.stroke();
    // 终点小圆点
    expCtx.beginPath();
    expCtx.arc(tx, ty, 3, 0, Math.PI * 2);
    expCtx.fillStyle = 'rgba(79, 195, 247, 0.4)';
    expCtx.fill();
  });

  // 绘制所有节点（用和屏幕渲染相同的方式）
  ctx.save();
  nodes.forEach(n => {
    const wasSelected = selectedIds.has(n.id);
    selectedIds.delete(n.id);
    // 临时替换 canvas context 为导出 context
    const origCtx = ctx;
    window.__exportCtx = expCtx;
    // 重新定义 ctx 指向导出 canvas
    // 但 drawNode 引用了外部 ctx 变量，无法直接替换
    // 改用内联绘制，保证和 drawNode 效果一致
    const x = n.x, y = n.y, w = n.width || NODE_MIN_W, h = n.height || NODE_H;
    const color = n.color || '#4fc3f7';
    const shape = n.shape || 'rect';

    expCtx.save();
    expCtx.shadowColor = 'rgba(0,0,0,0.3)';
    expCtx.shadowBlur = 6;
    expCtx.shadowOffsetY = 2;

    const grad = expCtx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#1e2a4a');
    grad.addColorStop(1, '#162040');

    function drawBody() {
      switch (shape) {
        case 'ellipse': expCtx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); break;
        case 'diamond':
          expCtx.moveTo(x + w / 2, y); expCtx.lineTo(x + w, y + h / 2);
          expCtx.lineTo(x + w / 2, y + h); expCtx.lineTo(x, y + h / 2);
          expCtx.closePath(); break;
        default: expCtx.roundRect(x, y, w, h, 8); break;
      }
    }

    expCtx.beginPath(); drawBody(); expCtx.fillStyle = grad; expCtx.fill();
    expCtx.shadowBlur = 0;

    if (shape === 'rect') {
      expCtx.beginPath(); expCtx.roundRect(x, y, 4, h, { upperLeft: 8, lowerLeft: 8 });
      expCtx.fillStyle = color; expCtx.fill();
      expCtx.strokeStyle = 'rgba(255,255,255,0.06)';
      expCtx.lineWidth = 0.5;
      expCtx.beginPath(); expCtx.roundRect(x, y, w, h, 8); expCtx.stroke();
    } else {
      expCtx.strokeStyle = 'rgba(255,255,255,0.08)';
      expCtx.lineWidth = 0.5;
      expCtx.beginPath(); drawBody(); expCtx.stroke();
    }

    // 文字
    expCtx.fillStyle = '#e8e8f0';
    expCtx.font = FONT;
    expCtx.textAlign = 'center';
    expCtx.textBaseline = 'middle';
    expCtx.save();
    expCtx.beginPath(); drawBody(); expCtx.clip();
    expCtx.fillText(n.text || '节点', x + w / 2, y + h / 2, w - 20);
    expCtx.restore();

    // 标记
    if (n.marker && MARKERS[n.marker]) {
      expCtx.font = '14px sans-serif';
      expCtx.textAlign = 'right';
      expCtx.textBaseline = 'bottom';
      expCtx.fillText(MARKERS[n.marker], x + w + 4, y - 4);
    }

    // 折叠按钮
    const children = getChildren(n.id);
    if (children.length > 0) {
      const bx = x + w + 4, by = y + h / 2 - 7;
      expCtx.fillStyle = 'rgba(79, 195, 247, 0.25)';
      expCtx.beginPath(); expCtx.roundRect(bx, by, 14, 14, 4); expCtx.fill();
      expCtx.fillStyle = '#fff'; expCtx.font = '11px sans-serif';
      expCtx.textAlign = 'center'; expCtx.textBaseline = 'middle';
      expCtx.fillText(n.collapsed ? '+' : '−', bx + 7, by + 7);
    }

    // 折叠提示线
    if (n.collapsed && children.length > 0) {
      expCtx.strokeStyle = 'rgba(255,255,255,0.15)'; expCtx.lineWidth = 1;
      expCtx.setLineDash([2, 3]);
      expCtx.beginPath(); expCtx.moveTo(x + w + 22, y + h / 2);
      expCtx.lineTo(x + w + 60, y + h / 2); expCtx.stroke();
      expCtx.setLineDash([]);
      expCtx.fillStyle = 'rgba(255,255,255,0.2)'; expCtx.font = '10px sans-serif';
      expCtx.textAlign = 'left'; expCtx.textBaseline = 'middle';
      expCtx.fillText(`${children.length}个子节点`, x + w + 26, y + h / 2);
    }

    // 连接点指示器
    expCtx.beginPath(); expCtx.arc(x + w + 10, y + h / 2, 4, 0, Math.PI * 2);
    expCtx.fillStyle = 'rgba(79, 195, 247, 0.15)';
    expCtx.fill();

    expCtx.restore();

    if (wasSelected) selectedIds.add(n.id);
  });
  ctx.restore();

  // 下载
  expCanvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(currentProject && currentProject.name) || '思维导图'}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('📤 导出完成');
  });
}

// ─── 导出 ────────────────────────────────────────────────
window.renderMindMap = render;
window.loadMindMapData = function(data) {
  nodes = JSON.parse(JSON.stringify(data.nodes || []));
  edges = JSON.parse(JSON.stringify(data.edges || []));
  render();
};

// 初始渲染
setTimeout(mmResize, 100);

// ─── CollabStudio API ──────────────────────────────────
window.registerCollabModule && window.registerCollabModule('mindmap', {
  name: 'mindmap',
  open: (project) => window.openMindMapEditor(project),
  save: () => saveData(),
  getData: () => currentProject ? currentProject.data : null,
  setData: (data) => { if (currentProject) { currentProject.data = data; render(); } },
});

})();
