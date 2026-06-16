const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const HOST = '8.213.147.43';
const USER = 'root';
const PASS = 'Abdurahman666%';
const DST = '/root/collab-studio/collab-studio';

// Files missing from the server
const files = [
  'public/avatars/avatar_热合曼_1781530519044.jpg',
  'public/avatars/avatar_jkm_1781531571759.jpg',
  'docs/project-create-flow.md',
  'test/basic.test.js',
  '.env.example',
  'Dockerfile',
  'docker-compose.yml',
  '.gitignore',
];

const conn = new Client();

conn.on('ready', () => {
  console.log('Connected. Uploading missing files...\n');
  
  conn.sftp((err, sftp) => {
    if (err) { console.error('SFTP error:', err); conn.end(); return; }
    
    let pending = files.length;
    let done = 0;
    let errors = 0;

    function checkDone() {
      done++;
      if (done >= pending) {
        console.log(`\nDone: ${done - errors}/${pending} uploaded, ${errors} errors`);
        
        // Restart server
        const scr = Buffer.from(`#!/bin/bash
cd /root/collab-studio/collab-studio
pkill -f "node server.js" 2>/dev/null
sleep 1
nohup node server.js > server.log 2>&1 &
echo "PID: $!"
sleep 3
tail -5 server.log
echo "---"
curl -s localhost:3000 | head -3
`).toString('base64');
        
        const cmd = `echo ${JSON.stringify(scr)} | base64 -d > /root/collab-studio/collab-studio/start.sh && bash /root/collab-studio/collab-studio/start.sh`;
        
        conn.exec(cmd, (err2, stream) => {
          if (err2) { console.error(err2); conn.end(); return; }
          stream.on('data', (d) => process.stdout.write(d.toString()));
          stream.on('close', () => conn.end());
        });
      }
    }

    files.forEach((f) => {
      const localPath = path.join(__dirname, f);
      const remotePath = path.posix.join(DST, f);
      const remoteDir = path.posix.dirname(remotePath);

      if (!fs.existsSync(localPath)) {
        console.log(`SKIP (local missing): ${f}`);
        checkDone();
        return;
      }

      sftp.mkdir(remoteDir, { recursive: true }, (err) => {
        const buf = fs.readFileSync(localPath);
        sftp.writeFile(remotePath, buf, (err) => {
          if (err) {
            console.log(`FAIL: ${f} - ${err.message}`);
            errors++;
          } else {
            console.log(`  OK: ${f} (${(buf.length/1024).toFixed(1)}KB)`);
          }
          checkDone();
        });
      });
    });
  });
});

conn.on('error', (err) => { console.error('Conn error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 10000 });
