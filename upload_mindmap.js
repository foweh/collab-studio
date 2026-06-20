const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const HOST = '8.213.147.43';
const USER = 'root';
const PASS = 'Abdurahman666%';
const DST = '/root/collab-studio/collab-studio';

const file = 'public/mindmap.js';

const conn = new Client();
conn.on('ready', () => {
  console.log('Connected. Uploading mindmap.js...\n');
  conn.sftp((err, sftp) => {
    if (err) { console.error('SFTP error:', err); conn.end(); return; }

    const localPath = path.join(__dirname, file);
    const remotePath = path.posix.join(DST, file);
    const remoteDir = path.posix.dirname(remotePath);

    sftp.mkdir(remoteDir, { recursive: true }, () => {
      const buf = fs.readFileSync(localPath);
      sftp.writeFile(remotePath, buf, (err) => {
        if (err) {
          console.log(`FAIL: ${file} - ${err.message}`);
          conn.end();
          return;
        }
        console.log(`  OK: ${file} (${(buf.length/1024).toFixed(1)}KB)`);

        // Restart server
        const cmd = `cd ${DST} && pkill -f "node server.js" 2>/dev/null; sleep 1; nohup node server.js > server.log 2>&1 & sleep 3; tail -3 server.log`;
        conn.exec(cmd, (err2, stream) => {
          if (err2) { console.error(err2); conn.end(); return; }
          stream.on('data', (d) => process.stdout.write(d.toString()));
          stream.on('close', () => {
            console.log('\n✅ Server restarted.');
            conn.end();
          });
        });
      });
    });
  });
});

conn.on('error', (err) => { console.error('Conn error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 10000 });
