const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const HOST = '8.213.147.43';
const PORT = 22;
const USER = 'root';
const PASS = 'Abdurahman666%';
const DST = '/root/collab-studio/collab-studio';

const files = [
  'utils/persist.js',
  'utils/ratelimit.js',
  'services/auth.js',
  'services/project.js',
  'services/logger.js',
  'services/annotation.js',
  'public/shared.js',
  'public/i18n.js',
  'public/script-editor.js',
  'public/story-editor.js',
  'public/devices.js',
  'public/login.html',
  'public/default-avatar.png',
  'public/fenjing/index.html',
  'public/fenjing/assets/index-DSxpk27Y.js',
  'public/fenjing/assets/index-XptjBxIK.css',
];

// Also update files that might be stale
const updateFiles = [
  'server.js',
  'package.json',
  'public/index.html',
  'public/style.css',
  'public/app.js',
  'public/mindmap.js',
];

const allFiles = [...files, ...updateFiles];

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connected!');
  
  conn.sftp((err, sftp) => {
    if (err) { console.error('SFTP error:', err); conn.end(); return; }
    
    let pending = allFiles.length;
    let done = 0;
    let errors = 0;

    function checkDone() {
      done++;
      if (done >= pending) {
        console.log(`\nUploaded ${done - errors}/${pending} files (${errors} errors)`);
        sftp.end();
        
        // Now restart the server
        console.log('\nRestarting server...');
        conn.exec('cd ' + DST + ' && pkill -f "node server.js" 2>/dev/null; sleep 1; export ADMIN_PASSWORD=\'Abdurahman666%\' && nohup node server.js > server.log 2>&1 & sleep 2 && curl -s localhost:3000 | head -5', (err, stream) => {
          if (err) { console.error('Exec error:', err); conn.end(); return; }
          stream.on('data', (data) => { console.log('OUTPUT:\n' + data.toString()); });
          stream.stderr.on('data', (data) => { console.error('STDERR:', data.toString()); });
          stream.on('close', () => { console.log('\nDone!'); conn.end(); });
        });
      }
    }

    allFiles.forEach((f) => {
      const localPath = path.join(__dirname, f);
      const remotePath = path.posix.join(DST, f);
      const remoteDir = path.posix.dirname(remotePath);

      if (!fs.existsSync(localPath)) {
        console.log(`SKIP (missing): ${f}`);
        checkDone();
        return;
      }

      // Ensure remote directory exists
      sftp.mkdir(remoteDir, { recursive: true }, (err) => {
        // ignore "already exists" errors
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

conn.on('error', (err) => {
  console.error('Connection error:', err.message);
  process.exit(1);
});

conn.connect({
  host: HOST,
  port: PORT,
  username: USER,
  password: PASS,
  readyTimeout: 10000,
});
