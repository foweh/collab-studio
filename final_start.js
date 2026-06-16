const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('Starting server...');
  
  const cmd = 'cd /root/collab-studio/collab-studio && pkill -f "node server.js" 2>/dev/null; sleep 1; bash -c \'export ADMIN_PASSWORD="Abdurahman666%"; nohup node server.js > server.log 2>&1 & echo PID:$!\' && sleep 3 && echo "=== LOG ===" && tail -5 server.log && echo "=== CURL ===" && curl -s localhost:3000 | head -5';
  
  conn.exec(cmd, (err, stream) => {
    let out = '';
    stream.on('data', (d) => { out += d; process.stdout.write(d); });
    stream.stderr.on('data', (d) => { process.stderr.write('E:' + d); });
    stream.on('close', (code) => {
      console.log('\nExit:', code);
      conn.end();
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
