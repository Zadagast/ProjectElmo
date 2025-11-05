// Simple WebSocket server for Project Elmo multiplayer
// Usage: npm install && npm start
const WebSocket = require('ws');
const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

// rooms: roomId -> { clients: Set(ws), state: snapshot, meta: {names: Map(ws->name)} }
const rooms = new Map();

function send(ws, obj){
  try{ ws.send(JSON.stringify(obj)); }catch(e){ console.warn('send err', e); }
}

wss.on('connection', (ws) => {
  ws._room = null;
  ws._name = null;

  ws.on('message', (data) => {
    let msg = null;
    try{ msg = JSON.parse(data.toString()); }catch(e){ return send(ws, { type: 'error', message: 'invalid json' }); }
    const { type } = msg;
    if(type === 'join'){
      const roomId = msg.room || 'default';
      const name = msg.name || 'Player';
      let room = rooms.get(roomId);
      if(!room){ room = { clients: new Set(), state: null, names: new Map() }; rooms.set(roomId, room); }
      room.clients.add(ws);
      room.names.set(ws, name);
      ws._room = roomId;
      ws._name = name;
      // notify the joining client
      send(ws, { type: 'joined', room: roomId, players: room.clients.size });
      // notify others
      room.clients.forEach(c=>{ if(c !== ws) send(c, { type: 'opponentJoined', name }); });
      // if we have a saved state, send it to the new client
      if(room.state) send(ws, { type: 'state', snapshot: room.state });
    } else if(type === 'leave'){
      const roomId = ws._room; if(!roomId) return;
      const room = rooms.get(roomId); if(!room) return;
      room.clients.delete(ws); room.names.delete(ws); ws._room = null; ws._name = null;
      room.clients.forEach(c=> send(c, { type: 'opponentLeft', name: msg.name || 'Opponent' }));
      if(room.clients.size === 0) rooms.delete(roomId);
    } else if(type === 'snapshot'){
      const roomId = msg.room || ws._room || 'default';
      const room = rooms.get(roomId); if(!room) return send(ws, { type: 'error', message: 'no such room' });
      // store and broadcast
      room.state = msg.snapshot;
      room.clients.forEach(c=>{ if(c !== ws) send(c, { type: 'snapshot', snapshot: msg.snapshot, from: ws._name }); });
    } else if(type === 'requestState'){
      const roomId = msg.room || ws._room || 'default';
      const room = rooms.get(roomId); if(room && room.state) send(ws, { type: 'state', snapshot: room.state });
    } else if(type === 'ping'){ send(ws, { type: 'pong' }); }
    else { send(ws, { type: 'error', message: 'unknown message type' }); }
  });

  ws.on('close', ()=>{
    const roomId = ws._room; if(!roomId) return;
    const room = rooms.get(roomId); if(!room) return;
    const name = room.names.get(ws) || 'Opponent';
    room.clients.delete(ws); room.names.delete(ws);
    room.clients.forEach(c=> send(c, { type: 'opponentLeft', name }));
    if(room.clients.size === 0) rooms.delete(roomId);
  });
});

console.log('Multiplayer server listening on port', PORT);
