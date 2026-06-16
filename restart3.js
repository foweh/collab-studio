const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('Connected. Executing...\n');
  
  const cmd = 'cd /root/collab-studio/collab-studio && pkill -f "node server.js" 2>/dev/null; sleep 1; ADMIN_PASSWORD="Abdurahman666%" nohup node server.js > server.log 2>&1 & sleep 3; echo "=== PROCESS ==="; ps aux | grep "node server" | grep -v grep; echo "=== LOG (last 10) ==="; tail -10 server.log; echo "=== HTTP TEST ==="; curl -s -o /dev/null -w "%{http_code}" localhost:3000; echo ""';
  
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('Error:', err); conn.end(); return; }
    stream.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write('ERR: ' + d.toString()));
    stream.on('close', (code) => {
      console.log('\nExit code:', code);
      conn.end();
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
