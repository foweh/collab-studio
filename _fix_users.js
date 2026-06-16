const fs = require('fs');
let c = fs.readFileSync('public/app.js', 'utf8');

// Fix renderCreateGroupUsers - filter self first, then check empty
const old = `  el.innerHTML = users.map(function(u) {
    if (u.name === myName) return ''; // exclude self
    var initial = u.name.charAt(0).toUpperCase();
    var colorIdx = u.name.length % AVATAR_COLORS.length;
    var bgColor = AVATAR_COLORS[colorIdx];
    var avatarStyle = u.avatar
      ? 'background-image:url(/avatars/' + u.avatar + '?v=' + Date.now() + ');background-size:cover;background-position:center'
      : 'background:' + bgColor;
    return '<label class="create-user-item">' +
      '<input type="checkbox" class="create-user-cb" value="' + esc(u.name) + '">' +
      '<div class="create-user-avatar" style="' + avatarStyle + '">' + (u.avatar ? '' : initial) + '</div>' +
      '<span class="create-user-name">' + esc(u.name) + '</span>' +
    '</label>';
  }).join('');`;

const nw = `  var others = users.filter(function(u) { return u.name !== myName; });
  if (others.length === 0) {
    el.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-dim);font-size:13px">没有其他可添加的用户</div>';
    return;
  }
  el.innerHTML = others.map(function(u) {
    var initial = u.name.charAt(0).toUpperCase();
    var colorIdx = u.name.length % AVATAR_COLORS.length;
    var bgColor = AVATAR_COLORS[colorIdx];
    var avatarStyle = u.avatar
      ? 'background-image:url(/avatars/' + u.avatar + '?v=' + Date.now() + ');background-size:cover;background-position:center'
      : 'background:' + bgColor;
    return '<label class="create-user-item">' +
      '<input type="checkbox" class="create-user-cb" value="' + esc(u.name) + '">' +
      '<div class="create-user-avatar" style="' + avatarStyle + '">' + (u.avatar ? '' : initial) + '</div>' +
      '<span class="create-user-name">' + esc(u.name) + '</span>' +
    '</label>';
  }).join('');`;

if (c.includes(old)) {
  c = c.replace(old, nw);
  fs.writeFileSync('public/app.js', c, 'utf8');
  console.log('Fixed renderCreateGroupUsers');
} else {
  console.log('NOT FOUND');
  const idx = c.indexOf('el.innerHTML = users.map');
  if (idx >= 0) console.log('found at', idx, 'chars:', JSON.stringify(c.substring(idx, idx + 500)));
}
