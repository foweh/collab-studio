const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const testScript = `
cd /root/collab-studio/collab-studio && node -e "
const { io } = require('socket.io-client');

// Connect to fenjing namespace
const s1 = io('http://localhost:3000/fenjing');
let stateReceived = false;

s1.on('connect', () => {
  console.log('S1 CONNECTED:', s1.id);
});

s1.on('fenjing:state-sync', (state) => {
  if (!stateReceived) {
    console.log('S1 INITIAL STATE: ' + state.shots.length + ' shots, ' + state.scenes.length + ' scenes');
    stateReceived = true;
    
    // Add a new scene to test sync
    const newScene = { id: 'test-' + Date.now(), name: '测试同步', order: state.scenes.length };
    state.scenes.push(newScene);
    console.log('S1 EMITTING scenes-update with ' + state.scenes.length + ' scenes');
    s1.emit('fenjing:scenes-update', state.scenes);
    
    // Connect a second client
    setTimeout(() => {
      const s2 = io('http://localhost:3000/fenjing');
      s2.on('connect', () => { console.log('S2 CONNECTED:', s2.id); });
      s2.on('fenjing:scenes-update', (scenes) => { console.log('S2 RECEIVED scenes-update: ' + scenes.length + ' scenes, last: ' + scenes[scenes.length-1].name); });
      s2.on('fenjing:state-sync', (st) => { console.log('S2 STATE: ' + st.scenes.length + ' scenes'); });
      setTimeout(() => process.exit(0), 3000);
    }, 1000);
  }
});

setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 8000);
" 2>&1
`;

  conn.exec(testScript, (err, stream) => {
    let out = '';
    stream.on('data', (d) => { out += d; });
    stream.stderr.on('data', (d) => { out += 'E:' + d; });
    stream.on('close', () => {
      console.log(out);
      conn.end();
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
