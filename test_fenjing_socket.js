const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  // Test fenjing connection using socket.io-client on the server
  const testScript = `
cd /root/collab-studio/collab-studio && node -e "
const { io } = require('socket.io-client');
const s = io('http://localhost:3000/fenjing');
s.on('connect', () => { console.log('CONNECTED', s.id); });
s.on('fenjing:state-sync', (state) => { console.log('STATE:', JSON.stringify(state).slice(0,100)); });
s.on('connect_error', (err) => { console.log('ERR:', err.message); });
setTimeout(() => { console.log('EXIT'); process.exit(0); }, 4000);
" 2>&1
`;

  conn.exec(testScript, (err, stream) => {
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
