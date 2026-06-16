const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.exec('cd /root/collab-studio/collab-studio && pkill -f "node server.js" 2>/dev/null; sleep 1; nohup node server.js > server.log 2>&1 & sleep 3 && ps aux | grep "node server" | grep -v grep && echo "---" && tail -5 server.log && echo "---" && curl -s localhost:3000 | head -3', (err, stream) => {
    let out = '';
    stream.on('data', (d) => { out += d; });
    stream.stderr.on('data', (d) => { out += 'E:' + d; });
    stream.on('close', (code) => {
      console.log('Exit:', code);
      console.log(out || '(no output)');
      conn.end();
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
