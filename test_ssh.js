const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('Connected!');
  conn.exec('echo hello && ls /root/collab-studio/collab-studio/utils/', (err, stream) => {
    if (err) { console.error('Exec error:', err); conn.end(); return; }
    console.log('Stream opened');
    stream.on('data', (d) => console.log('STDOUT:', d.toString()));
    stream.stderr.on('data', (d) => console.log('STDERR:', d.toString()));
    stream.on('close', (code, signal) => {
      console.log('Close - code:', code, 'signal:', signal);
      conn.end();
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.on('close', () => console.log('Connection closed'));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000, debug: (msg) => console.log('DEBUG:', msg) });
