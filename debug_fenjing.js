const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`
echo "=== Fenjing page ==="
curl -s -o /dev/null -w "%{http_code}" localhost:3000/fenjing/
echo ""
echo "=== Socket.IO ==="
curl -s -o /dev/null -w "%{http_code}" localhost:3000/socket.io/socket.io.js
echo ""
echo "=== Fenjing state ==="
cat /root/collab-studio/collab-studio/data/fenjing-state.json
echo ""
echo "=== Server log (tail) ==="
tail -10 /root/collab-studio/collab-studio/server.log
echo ""
echo "=== Test fenjing namespace ==="
node -e "
const { io } = require('socket.io-client');
const s = io('http://localhost:3000/fenjing', { transports: ['websocket','polling'] });
s.on('connect', () => { console.log('FENJING CONNECTED:', s.id); });
s.on('fenjing:state-sync', (state) => { console.log('STATE RECEIVED, shots:', state.shots.length, 'scenes:', state.scenes.length); s.close(); process.exit(0); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 5000);
" 2>&1
  `, (err, stream) => {
    let out = '';
    stream.on('data', (d) => { out += d; });
    stream.stderr.on('data', (d) => { out += 'E:' + d; });
    stream.on('close', () => {
      console.log(out);
      conn.end();
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
