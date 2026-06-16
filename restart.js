const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cmd = 'cd /root/collab-studio/collab-studio && pkill -f "node server.js" 2>/dev/null; sleep 1; ADMIN_PASSWORD="Abdurahman666%" nohup node server.js > server.log 2>&1 & sleep 2; echo "---STATUS---"; ps aux | grep "node server" | grep -v grep; echo "---LOG---"; tail -5 server.log; echo "---CURL---"; curl -s localhost:3000 | head -5';
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('Exec err:', err); conn.end(); return; }
    stream.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
    stream.on('close', () => { conn.end(); });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
