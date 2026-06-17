// ─── i18n — 中英双语 ─────────────────────────────────────
const i18n = {
  zh: {
    title: '🎬 协作创作工作室',
    subtitle: '局域网 · 实时协作 · 剧本 / 思维导图 / 故事',
    namePlaceholder: '你的名字...',
    joinBtn: '进入工作室',
    project: '项目',
    script: '剧本',
    mindmap: '导图',
    story: '故事',
    devices: '设备',
    help: '帮助',
    myProject: '📂 我的项目',
    newScript: '+ 剧本',
    newMindmap: '+ 思维导图',
    newStory: '+ 故事',
    scriptEditor: '📜 剧本编辑器',
    mindmapEditor: '🧠 思维导图',
    storyEditor: '📖 故事编辑器',
    deviceMgr: '💻 设备管理',
    peers: '🤝 协作对象',
    waiting: '🔄 等待发现设备…',
    waitingHint: '多台电脑都打开"开启局域网"',
    scanning: '🔍 正在扫描…',
    nobody: '⏰ 扫描结束，未发现设备',
    online: '在线',
    offline: '离线',
    backProject: '← 返回文件夹',
    addAct: '+ 幕',
    addScene: '+ 场',
    addDialogue: '+ 对白',
    sendProject: '📤 发送项目',
    send: '发送选中项目',
    peerNote: '📝 对方备注',
    notePlaceholder: '给对方写个备注...',
    save: '保存备注',
    chat: '💬 群聊',
    chatPlaceholder: '打字回车发送...',
    sendBtn: '发送',
    lanOn: '🟢 局域网: 开启',
    lanOff: '🔴 局域网: 关闭',
    refreshLan: '🔄 搜索设备',
    fullscreen: '⛶ 全屏',
    addRoot: '➕ 根',
    addChild: '👶 子节点',
    addSibling: '↔️ 同级',
    delete: '🗑️ 删除',
    fitScreen: '⊞ 适应',
    zoomIn: '🔍+',
    zoomOut: '🔍-',
    locked: '🔒',
    editing: '正在编辑',
    transfer: '📤 发送项目给对方',
    receive: '📥 收到项目',
    confirm: '知道了',
    noDevice: '暂无其他设备',
    noDeviceHint: '开启局域网模式后自动搜索',
    addNote: '给对方添加备注...',
  },
  en: {
    title: '🎬 CollabStudio',
    subtitle: 'LAN · Real-time · Script / Mind Map / Story',
    namePlaceholder: 'Your name...',
    joinBtn: 'Enter Studio',
    project: 'Projects',
    script: 'Script',
    mindmap: 'Mindmap',
    story: 'Story',
    devices: 'Devices',
    help: 'Help',
    myProject: '📂 My Projects',
    newScript: '+ Script',
    newMindmap: '+ Mind Map',
    newStory: '+ Story',
    scriptEditor: '📜 Script Editor',
    mindmapEditor: '🧠 Mind Map',
    storyEditor: '📖 Story Editor',
    deviceMgr: '💻 Devices',
    peers: '🤝 Teammates',
    waiting: '🔄 Waiting for devices…',
    waitingHint: 'Everyone should enable LAN mode',
    scanning: '🔍 Scanning…',
    nobody: '⏰ Scan complete — no devices found',
    online: 'Online',
    offline: 'Offline',
    backProject: '← Back to Folder',
    addAct: '+ Act',
    addScene: '+ Scene',
    addDialogue: '+ Line',
    sendProject: '📤 Send Projects',
    send: 'Send Selected',
    peerNote: '📝 Notes',
    notePlaceholder: 'Add a note about this teammate...',
    save: 'Save',
    chat: '💬 Chat',
    chatPlaceholder: 'Type and press Enter...',
    sendBtn: 'Send',
    lanOn: '🟢 LAN: On',
    lanOff: '🔴 LAN: Off',
    refreshLan: '🔄 Scan',
    fullscreen: '⛶ Fullscreen',
    addRoot: '➕ Root',
    addChild: '👶 Child',
    addSibling: '↔️ Sibling',
    delete: '🗑️ Delete',
    fitScreen: '⊞ Fit',
    zoomIn: '🔍+',
    zoomOut: '🔍-',
    locked: '🔒',
    editing: 'editing',
    transfer: '📤 Send Projects',
    receive: '📥 Projects Received',
    confirm: 'Got it',
    noDevice: 'No other devices',
    noDeviceHint: 'Enable LAN mode to discover',
    addNote: 'Add a note...',
  },
};

let currentLang = 'zh';

function t(key) {
  return i18n[currentLang]?.[key] || i18n.zh[key] || key;
}

function setLang(lang) {
  if (!i18n[lang]) return;
  currentLang = lang;
  localStorage.setItem('collab-lang', lang);
  applyLang();
}

function toggleLang() {
  setLang(currentLang === 'zh' ? 'en' : 'zh');
}

function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  // Update title
  document.title = t('title');
  // Update lang badge
  const badge = document.getElementById('lang-badge');
  if (badge) badge.textContent = currentLang === 'zh' ? '🇨🇳 中文' : '🇬🇧 English';
}

// Auto-load saved language
const savedLang = localStorage.getItem('collab-lang');
if (savedLang && i18n[savedLang]) currentLang = savedLang;

// Export for use in other modules
window.t = t;
window.setLang = setLang;
window.toggleLang = toggleLang;
window.currentLang = currentLang;
