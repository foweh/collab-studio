const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('Connected');
  
  // Step 1: Kill old server
  conn.exec('pkill -f "node server.js" 2>/dev/null; echo "killed"', (err, stream) => {
    let out = '';
    stream.on('data', (d) => { out += d; });
    stream.on('close', () => {
      console.log('Kill result:', out.trim());
      
      // Step 2: Start server in background with a wrapper script
      conn.exec('bash -c \'cd /root/collab-studio/collab-studio && ADMIN_PASSWORD="Abdurahman666%" nohup node server.js > server.log 2>&1 & echo $!\'', (err2, stream2) => {
        let out2 = '';
        stream2.on('data', (d) => { out2 += d; });
        stream2.on('close', () => {
          console.log('PID:', out2.trim());
          
          // Step 3: Wait and check
          setTimeout(() => {
            conn.exec('ps aux | grep "node server" | grep -v grep; echo "---"; tail -5 /root/collab-studio/collab-studio/server.log; echo "---"; curl -s localhost:3000 | head -3', (err3, stream3) => {
              let out3 = '';
              stream3.on('data', (d) => { out3 += d; });
              stream3.on('close', () => {
                console.log('\n=== STATUS ===\n' + out3);
                conn.end();
              });
            });
          }, 3000);
        });
      });
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
