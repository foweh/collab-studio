const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cmd = `cat > /tmp/test_bcrypt.js << 'ENDSCRIPT'
const bcrypt = require('bcryptjs');
console.log('bcryptjs resolved:', require.resolve('bcryptjs'));
console.log('hash test:', bcrypt.hashSync('test', 1).slice(0, 10));
ENDSCRIPT
cd /root/collab-studio/collab-studio && node /tmp/test_bcrypt.js`;
  
  conn.exec(cmd, (err, stream) => {
    let out = '';
    stream.on('data', (d) => { out += d; });
    stream.stderr.on('data', (d) => { out += 'ERR:' + d; });
    stream.on('close', (code) => {
      console.log('Exit:', code);
      console.log(out);
      conn.end();
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
