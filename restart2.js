const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('Connected');
  
  // First: kill old server and start new one
  const cmd = 'cd /root/collab-studio/collab-studio && pkill -f "node server.js" 2>/dev/null || true && sleep 1 && ADMIN_PASSWORD="Abdurahman666%" nohup node server.js > server.log 2>&1 &';
  
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('Err1:', err); conn.end(); return; }
    let out = '';
    stream.on('data', (d) => { out += d.toString(); });
    stream.stderr.on('data', (d) => { out += 'STDERR:' + d.toString(); });
    stream.on('close', (code) => {
      console.log('Start cmd done, code:', code);
      console.log('Out:', out.slice(0, 200));
      
      // Wait 2s then check
      setTimeout(() => {
        conn.exec('cd /root/collab-studio/collab-studio && sleep 2 && ps aux | grep "node server" | grep -v grep && echo "---" && tail -10 server.log && echo "---" && curl -s localhost:3000', (err2, stream2) => {
          if (err2) { console.error('Err2:', err2); conn.end(); return; }
          let out2 = '';
          stream2.on('data', (d) => { out2 += d.toString(); });
          stream2.stderr.on('data', (d) => { out2 += 'STDERR:' + d.toString(); });
          stream2.on('close', () => {
            console.log('\n=== Server Status ===');
            console.log(out2);
            conn.end();
          });
        });
      }, 3000);
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
