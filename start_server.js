const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('Connected. Starting server...\n');
  
  // Double-fork daemonize pattern via bash
  const cmd = `
cd /root/collab-studio/collab-studio
pkill -f "node server.js" 2>/dev/null
sleep 1
# Daemonize: double-fork via subshell
(
  export ADMIN_PASSWORD="Abdurahman666%"
  nohup node server.js > server.log 2>&1 &
  echo $! > server.pid
  disown
)
sleep 3
echo "=== PROCESS ==="
ps aux | grep "node server" | grep -v grep
echo "=== LOG ==="
tail -5 server.log
echo "=== HTTP STATUS ==="
curl -s -o /dev/null -w "%{http_code}" localhost:3000
echo ""
echo "=== PAGE ==="
curl -s localhost:3000 | head -3
`;
  
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('Error:', err); conn.end(); return; }
    stream.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write('ERR: ' + d.toString()));
    stream.on('close', (code) => {
      console.log('Exit:', code);
      conn.end();
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
