const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.exec('cd /root/collab-studio/collab-studio && echo "--- ROOT ---" && ls && echo "--- PUBLIC ---" && ls public && echo "--- AVATARS ---" && ls public/avatars && echo "--- SERVICES ---" && ls services && echo "--- UTILS ---" && ls utils && echo "--- DOCS ---" && ls docs && echo "--- TEST ---" && ls test && echo "--- STATUS ---" && curl -s -o /dev/null -w "%{http_code}" localhost:3000 && echo ""', (err, stream) => {
    let out = '';
    stream.on('data', (d) => { out += d; });
    stream.on('close', () => {
      console.log(out);
      conn.end();
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
