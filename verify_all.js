const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.exec('cd /root/collab-studio/collab-studio && find . -not -path ./node_modules -not -path ./node_modules/* -not -path ./data -not -path ./data/* -not -path ./.git -not -path ./.git/* -not -name server.log -not -name start.sh -not -name _t.js -not -name package-lock.json | sort && echo "=== Cleanup ===" && rm -f start.sh _t.js 2>/dev/null && echo "temp files removed" && echo "=== Admin check ===" && cat .admin.env', (err, stream) => {
    let out = '';
    stream.on('data', (d) => { out += d; });
    stream.on('close', () => {
      console.log(out);
      conn.end();
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
