const fs = require('fs');
let c = fs.readFileSync('public/app.js', 'utf8');

// Fix 1: Add e.isComposing check to Enter key handler
const old = `  if (chatInput) chatInput.addEventListener('keydown', (e) => {\n    if (e.key === 'Enter') {\n      if (document.getElementById('chat-modal').dataset.groupId) sendGroupChat();\n      else sendChat();\n    }\n  });`;

const nw = `  if (chatInput) chatInput.addEventListener('keydown', (e) => {\n    if (e.key === 'Enter' && !e.isComposing) {\n      if (document.getElementById('chat-modal').dataset.groupId) sendGroupChat();\n      else sendChat();\n    }\n  });`;

if (c.includes(old)) {
  c = c.replace(old, nw);
  console.log('Fixed IME Enter key issue');
} else {
  console.log('NOT FOUND, trying with \\r\\n');
  const old2 = old.replace(/\n/g, '\r\n');
  if (c.includes(old2)) {
    c = c.replace(old2, nw.replace(/\n/g, '\r\n'));
    console.log('Fixed IME Enter key issue (CRLF)');
  } else {
    console.log('STILL NOT FOUND');
    const idx = c.indexOf('if (chatInput) chatInput.addEventListener');
    if (idx >= 0) console.log(JSON.stringify(c.substring(idx, idx + 250)));
  }
}

// Fix 2: Add sending lock to sendChat and sendGroupChat
// Add a global var for sending lock
let m = 'var sendingLock = false;';
if (!c.includes(m)) {
  // Find a good place - after let myGroups
  const insertPoint = 'let myGroups';
  const ins = 'let myGroups' + ' = [];';
  // Actually just prepend the lock to the sendChat function
  const oldSend = `function sendChat() {\n  const modal = document.getElementById('chat-modal');`;
  const newSend = `let _sendingLock = false;\n\nfunction sendChat() {\n  if (_sendingLock) return;\n  _sendingLock = true;\n  setTimeout(function() { _sendingLock = false; }, 500);\n  const modal = document.getElementById('chat-modal');`;
  
  if (c.includes(oldSend)) {
    c = c.replace(oldSend, newSend);
    console.log('Added sending lock to sendChat');
  } else {
    const oldSendCR = oldSend.replace(/\n/g, '\r\n');
    if (c.includes(oldSendCR)) {
      c = c.replace(oldSendCR, newSend.replace(/\n/g, '\r\n'));
      console.log('Added sending lock to sendChat (CRLF)');
    } else {
      console.log('sendChat function NOT FOUND');
    }
  }
  
  // Same for sendGroupChat
  const oldGSend = `function sendGroupChat() {\n  var modal = document.getElementById('chat-modal');\n  var inputEl = document.getElementById('chat-input');\n  if (!modal || !inputEl) return;\n  var groupId = modal.dataset.groupId;\n  if (!groupId) return; // not group mode, fallback to private\n  var text = inputEl.value.trim();\n  if (!text) return;\n  socket.emit('group-send', { groupId: groupId, text: text });\n  inputEl.value = '';\n  // 本地立即显示\n  var msgsEl = document.getElementById('chat-msgs');\n  if (msgsEl) {\n    var lastMsg = msgsEl.lastElementChild;\n    var lastMe = lastMsg && lastMsg.classList.contains('me') && lastMsg.classList.contains('group');\n    msgsEl.innerHTML += renderGroupMsgHtml(myName, text, Date.now(), true, lastMe);\n    msgsEl.scrollTop = msgsEl.scrollHeight;\n  }\n}`;
  
  const newGSend = `function sendGroupChat() {\n  if (_sendingLock) return;\n  _sendingLock = true;\n  setTimeout(function() { _sendingLock = false; }, 500);\n  var modal = document.getElementById('chat-modal');\n  var inputEl = document.getElementById('chat-input');\n  if (!modal || !inputEl) return;\n  var groupId = modal.dataset.groupId;\n  if (!groupId) return;\n  var text = inputEl.value.trim();\n  if (!text) return;\n  socket.emit('group-send', { groupId: groupId, text: text });\n  inputEl.value = '';\n  var msgsEl = document.getElementById('chat-msgs');\n  if (msgsEl) {\n    var lastMsg = msgsEl.lastElementChild;\n    var lastMe = lastMsg && lastMsg.classList.contains('me') && lastMsg.classList.contains('group');\n    msgsEl.innerHTML += renderGroupMsgHtml(myName, text, Date.now(), true, lastMe);\n    msgsEl.scrollTop = msgsEl.scrollHeight;\n  }\n}`;
  
  if (c.includes(oldGSend)) {
    c = c.replace(oldGSend, newGSend);
    console.log('Added sending lock to sendGroupChat');
  } else {
    const oldGSendCR = oldGSend.replace(/\n/g, '\r\n');
    if (c.includes(oldGSendCR)) {
      c = c.replace(oldGSendCR, newGSend.replace(/\n/g, '\r\n'));
      console.log('Added sending lock to sendGroupChat (CRLF)');
    } else {
      console.log('sendGroupChat function NOT FOUND');
      const idx = c.indexOf('function sendGroupChat');
      if (idx >= 0) console.log(JSON.stringify(c.substring(idx, idx + 400)));
    }
  }
}

fs.writeFileSync('public/app.js', c, 'utf8');
console.log('DONE');
