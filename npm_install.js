const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('Running npm install...');
  conn.exec('cd /root/collab-studio/collab-studio && npm install 2>&1', (err, stream) => {
    let out = '';
    stream.on('data', (d) => { out += d; process.stdout.write(d); });
    stream.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
    stream.on('close', (code) => {
      console.log('\nnpm install exit:', code);
      
      // Start server after install
      conn.exec('bash -c \'cd /root/collab-studio/collab-studio && pkill -f "node server.js" 2>/dev/null; sleep 1; ADMIN_PASSWORD="Abdurahman666%" nohup node server.js > server.log 2>&1 & echo PID:$!\'', (err2, stream2) => {
        let out2 = '';
        stream2.on('data', (d) => { out2 += d; });
        stream2.on('close', () => {
          console.log('Start:', out2.trim());
          
          setTimeout(() => {
            conn.exec('tail -10 /root/collab-studio/collab-studio/server.log && echo "---" && curl -s localhost:3000 | head -3', (err3, stream3) => {
              let out3 = '';
              stream3.on('data', (d) => { out3 += d; });
              stream3.on('close', () => {
                console.log('\n=== Result ===\n' + out3);
                conn.end();
              });
            });
          }, 4000);
        });
      });
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
