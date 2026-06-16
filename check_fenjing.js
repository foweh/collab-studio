const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  // Check fenjing is accessible
  const cmd = `echo "=== fenjing page ===" && curl -s -o /dev/null -w "%{http_code}" localhost:3000/fenjing/ && echo "" && echo "=== fenjing index exists? ===" && ls -la /root/collab-studio/collab-studio/public/fenjing/index.html && echo "=== server fenjing code ===" && grep -c "fenjing" /root/collab-studio/collab-studio/server.js && echo "=== fenjing state file ===" && cat /root/collab-studio/collab-studio/data/fenjing-state.json 2>/dev/null || echo "no state file yet"`;
  
  conn.exec(cmd, (err, stream) => {
    let out = '';
    stream.on('data', (d) => { out += d; });
    stream.stderr.on('data', (d) => { out += d; });
    stream.on('close', () => {
      console.log(out);
      conn.end();
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
