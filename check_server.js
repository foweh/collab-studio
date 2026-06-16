const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('Connected. Checking server status...\n');
  
  conn.exec('cd /root/collab-studio/collab-studio && echo "=== PROCESSES ===" && ps aux | grep node && echo "=== SERVER LOG ===" && tail -20 server.log && echo "=== CURL TEST ===" && curl -s localhost:3000 | head -5', (err, stream) => {
    if (err) { console.error('Error:', err); conn.end(); return; }
    stream.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
    stream.on('close', () => { conn.end(); });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
