// ─── 设备管理（多机版） ──────────────────────────────────
(function() {

const deviceList = $('#device-list');

function renderDevices() {
  deviceList.innerHTML = '';

  // 本机
  const selfCard = createCard({
    id: 'self', name: myName || '我', isSelf: true,
    online: true, note: '', ip: '本机',
  });
  deviceList.appendChild(selfCard);

  // 所有在线设备
  if (peers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'device-card';
    empty.innerHTML = `
      <div class="d-status offline"></div>
      <div class="d-info">
        <div class="d-name" style="color:var(--text-dim)">暂无其他设备</div>
        <div class="d-meta">开启局域网模式后自动搜索</div>
      </div>`;
    deviceList.appendChild(empty);
  } else {
    peers.forEach(p => {
      const card = createCard({
        id: p.serverId, name: p.name, isSelf: false,
        online: p.connected, note: p.note || '', ip: p.ip || '局域网',
        serverId: p.serverId,
      });
      deviceList.appendChild(card);
    });
  }
}

function createCard(info) {
  const div = document.createElement('div');
  div.className = 'device-card';
  div.innerHTML = `
    <div class="d-status ${info.online ? 'online' : 'offline'}"></div>
    <div class="d-info">
      <div class="d-name">${info.isSelf ? '🖥️ ' : '💻 '}${esc(info.name)} ${info.isSelf ? '(我)' : ''}</div>
      <div class="d-note" id="d-note-${info.id}">${info.note ? `📝 ${esc(info.note)}` : ''}</div>
      <div class="d-meta">${info.ip} · ID: ${info.serverId || info.id}</div>
      ${!info.isSelf ? `
        <input class="d-note-input" data-id="${info.serverId}" placeholder="给对方添加备注..." value="${esc(info.note)}">
      ` : ''}
    </div>
  `;

  if (!info.isSelf) {
    const noteInput = div.querySelector('.d-note-input');
    const noteDisplay = div.querySelector('.d-note');
    noteInput.addEventListener('change', () => {
      const note = noteInput.value.trim();
      socket.emit('peer-note', { serverId: info.serverId, note });
      noteDisplay.textContent = note ? `📝 ${note}` : '';
    });
  }

  return div;
}

// 监听 peers 变化
socket.on('bridge-message', (msg) => {
  if (msg.type === 'peers-update') {
    peers = msg.peers || [];
    const devicePanel = document.getElementById('panel-devices');
    if (devicePanel && devicePanel.classList.contains('active')) {
      renderDevices();
    }
  }
});

// 切换到设备面板时刷新
document.querySelector('.nav-btn[data-module="devices"]').addEventListener('click', () => {
  setTimeout(renderDevices, 100);
});

window.renderDevices = renderDevices;

})();
