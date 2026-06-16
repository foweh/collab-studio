const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  // Upload .admin.env
  const envContent = '# 管理员账户配置\nADMIN_USERNAME=热合曼\nADMIN_PASSWORD=262752\n';
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); conn.end(); return; }
    sftp.writeFile('/root/collab-studio/collab-studio/.admin.env', Buffer.from(envContent), (err) => {
      if (err) { console.error(err); conn.end(); return; }
      console.log('.admin.env written');
      
      // Create start script
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
      
      const cmd = `echo ${JSON.stringify(scr)} | base64 -d > /root/collab-studio/collab-studio/start.sh && chmod +x /root/collab-studio/collab-studio/start.sh && bash /root/collab-studio/collab-studio/start.sh`;
      
      conn.exec(cmd, (err2, stream) => {
        let out = '';
        stream.on('data', (d) => { out += d; process.stdout.write(d); });
        stream.stderr.on('data', (d) => { out += 'E:' + d; });
        stream.on('close', (code) => {
          console.log('\nExit:', code);
          conn.end();
        });
      });
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
