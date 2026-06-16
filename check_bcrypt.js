const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.exec('cd /root/collab-studio/collab-studio && node -e "console.log(require.resolve(\"bcryptjs\"))" && echo "---" && ls -la node_modules/bcryptjs/ && echo "---" && cat node_modules/bcryptjs/package.json | head -10', (err, stream) => {
    let out = '';
    stream.on('data', (d) => { out += d; });
    stream.stderr.on('data', (d) => { out += 'ERR:' + d; });
    stream.on('close', () => {
      console.log(out);
      conn.end();
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
