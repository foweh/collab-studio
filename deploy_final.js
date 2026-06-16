const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const HOST = '8.213.147.43';
const USER = 'root';
const PASS = 'Abdurahman666%';
const DST = '/root/collab-studio/collab-studio';

const files = ['server.js', 'public/app.js', 'public/fenjing/index.html'];

const conn = new Client();
conn.on('ready', () => {
  console.log('Connected\n');
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); conn.end(); return; }
    let p = files.length;
    files.forEach((f) => {
      const local = path.join(__dirname, f);
      const remote = path.posix.join(DST, f.replace(/\\/g, '/'));
      const buf = fs.readFileSync(local);
      sftp.writeFile(remote, buf, (err) => {
        if (err) console.log('FAIL:', f);
        else console.log('OK:', f, (buf.length/1024).toFixed(1)+'KB');
        if (--p === 0) {
          sftp.end();
          conn.exec('cd ' + DST + ' && pkill -f "node server.js" 2>/dev/null; sleep 1; nohup node server.js > server.log 2>&1 & sleep 3 && curl -s -o /dev/null -w "%{http_code}" localhost:3000', (e2, s2) => {
            let o = '';
            s2.on('data', (d) => { o += d; });
            s2.on('close', () => { console.log('\nHTTP:', o); conn.end(); });
          });
        }
      });
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 10000 });
