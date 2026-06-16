const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  // Write test script INTO the project directory
  const script = Buffer.from(`const bcrypt = require('bcryptjs');
console.log('bcryptjs found at:', require.resolve('bcryptjs'));
console.log('hash:', bcrypt.hashSync('test', 1).slice(0,10));
`).toString('base64');
  
  const cmd = `echo ${script} | base64 -d > /root/collab-studio/collab-studio/_t.js && node /root/collab-studio/collab-studio/_t.js`;
  
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
