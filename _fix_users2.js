const fs = require('fs');
let c = fs.readFileSync('public/app.js', 'utf8');

// Update renderCreateGroupUsers to filter existing group members when in add-member mode
const old = `function renderCreateGroupUsers(users) {
  var el = document.getElementById('create-group-user-list');
  if (!el) return;
  if (!users || users.length === 0) {
    el.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-dim);font-size:13px">没有可添加的用户</div>';
    return;
  }
  var others = users.filter(function(u) { return u.name !== myName; });
  if (others.length === 0) {
    el.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-dim);font-size:13px">没有其他可添加的用户</div>';
    return;
  }
  el.innerHTML = others.map(function(u) {`;

const nw = `function renderCreateGroupUsers(users) {
  var el = document.getElementById('create-group-user-list');
  if (!el) return;
  if (!users || users.length === 0) {
    el.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-dim);font-size:13px">没有可添加的用户</div>';
    return;
  }
  // 排除自己和已在群中的成员
  var modal = document.getElementById('create-group-modal');
  var targetGroupId = modal ? modal.dataset.groupTarget : null;
  var targetGroup = targetGroupId ? myGroups.find(function(g) { return g.id === targetGroupId; }) : null;
  var existingMembers = targetGroup ? (targetGroup.members || []) : [];
  var others = users.filter(function(u) {
    if (u.name === myName) return false;
    if (existingMembers.indexOf(u.name) >= 0) return false;
    return true;
  });
  if (others.length === 0) {
    el.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-dim);font-size:13px">没有其他可添加的用户</div>';
    return;
  }
  el.innerHTML = others.map(function(u) {`;

if (c.includes(old)) {
  c = c.replace(old, nw);
  fs.writeFileSync('public/app.js', c, 'utf8');
  console.log('Updated renderCreateGroupUsers to filter existing group members');
} else {
  console.log('NOT FOUND');
  const idx = c.indexOf('function renderCreateGroupUsers');
  if (idx >= 0) console.log(JSON.stringify(c.substring(idx, idx + 300)));
}
