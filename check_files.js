const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.exec('ls -la /root/collab-studio/collab-studio/utils/ && echo "---" && ls -la /root/collab-studio/collab-studio/services/ && echo "---" && cat /root/collab-studio/collab-studio/utils/persist.js | head -5', (err, stream) => {
    if (err) { console.error('Error:', err); conn.end(); return; }
    stream.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
    stream.on('close', () => { conn.end(); });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
