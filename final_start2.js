const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('Creating start script and launching...');
  
  // Write a start script
  const startScript = `#!/bin/bash
cd /root/collab-studio/collab-studio
pkill -f "node server.js" 2>/dev/null
sleep 1
export ADMIN_PASSWORD="Abdurahman666%"
nohup node server.js > server.log 2>&1 &
echo "Server PID: $!"
sleep 3
echo "=== LOG ==="
tail -5 server.log
echo "=== CURL ==="
curl -s localhost:3000 | head -5
`;
  const b64 = Buffer.from(startScript).toString('base64');
  const cmd = `echo ${JSON.stringify(b64)} | base64 -d > /root/collab-studio/collab-studio/start.sh && bash /root/collab-studio/collab-studio/start.sh`;
  
  conn.exec(cmd, (err, stream) => {
    let out = '';
    stream.on('data', (d) => { out += d; });
    stream.stderr.on('data', (d) => { out += 'E:' + d; });
    stream.on('close', (code) => {
      console.log(out);
      console.log('Exit:', code);
      conn.end();
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
