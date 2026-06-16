const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  // Upload .admin.env via SFTP
  const content = `# 管理员账户配置文件
ADMIN_USERNAME=热合曼
ADMIN_PASSWORD=262752
`;
  conn.sftp((err, sftp) => {
    if (err) { console.error('SFTP err:', err); conn.end(); return; }
    sftp.writeFile('/root/collab-studio/collab-studio/.admin.env', Buffer.from(content), (err) => {
      if (err) { console.error('Write err:', err); conn.end(); return; }
      console.log('.admin.env uploaded');
      
      // Restart server WITHOUT setting ADMIN_PASSWORD env var (use .admin.env)
      const cmd = 'cd /root/collab-studio/collab-studio && pkill -f "node server.js" 2>/dev/null; sleep 1; bash -c "nohup node server.js > server.log 2>&1 &" && sleep 3 && echo "=== LOG ===" && tail -8 server.log && echo "=== CURL ===" && curl -s localhost:3000 | head -3';
      conn.exec(cmd, (err2, stream) => {
        let out = '';
        stream.on('data', (d) => { out += d; });
        stream.stderr.on('data', (d) => { out += 'E:' + d; });
        stream.on('close', () => {
          console.log(out);
          conn.end();
        });
      });
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
