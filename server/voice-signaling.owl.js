// voice-signaling.owl.js
// Simple Socket.io signaling helper for WebRTC voice chat (owl)
// Usage: require and call with your socket.io server instance and optional namespace
// Example:
//   const io = require('socket.io')(server);
//   require('./server/voice-signaling.owl.js')(io, { namespace: '/game' });

module.exports = function (io, { namespace = '/' } = {}) {
  const nsp = (namespace === '/') ? io : io.of(namespace);

  // maps userId -> socket.id
  const userSocket = new Map();
  // maps socket.id -> { roomId, userId }
  const socketMeta = new Map();

  nsp.on('connection', (socket) => {
    console.log('[voice][owl] client connected', socket.id);

    socket.on('voice-join', ({ roomId, userId }) => {
      socket.join(roomId);
      userSocket.set(userId, socket.id);
      socketMeta.set(socket.id, { roomId, userId });

      // send back current users in the room
      const clients = Array.from(nsp.adapter.rooms.get(roomId) || []);
      // convert socket ids to userIds
      const users = [];
      for (const sId of clients) {
        const meta = socketMeta.get(sId);
        if (meta && meta.userId) users.push(meta.userId);
      }
      socket.emit('voice-users', users);

      // notify others
      socket.to(roomId).emit('voice-user-joined', userId);
      console.log(`[voice][owl] ${userId} joined ${roomId}`);
    });

    socket.on('voice-leave', ({ roomId, userId }) => {
      socket.leave(roomId);
      userSocket.delete(userId);
      socketMeta.delete(socket.id);
      socket.to(roomId).emit('voice-user-left', userId);
    });

    // forwarding signaling messages
    socket.on('voice-offer', ({ to, from, offer }) => {
      const toSocketId = userSocket.get(to);
      if (toSocketId) {
        nsp.to(toSocketId).emit('voice-offer', { from, offer });
      }
    });

    socket.on('voice-answer', ({ to, from, answer }) => {
      const toSocketId = userSocket.get(to);
      if (toSocketId) {
        nsp.to(toSocketId).emit('voice-answer', { from, answer });
      }
    });

    socket.on('voice-ice-candidate', ({ to, from, candidate }) => {
      const toSocketId = userSocket.get(to);
      if (toSocketId) {
        nsp.to(toSocketId).emit('voice-ice-candidate', { from, candidate });
      }
    });

    socket.on('disconnect', () => {
      const meta = socketMeta.get(socket.id);
      if (meta) {
        const { roomId, userId } = meta;
        socket.to(roomId).emit('voice-user-left', userId);
        userSocket.delete(userId);
        socketMeta.delete(socket.id);
        console.log(`[voice][owl] ${userId} disconnected from ${roomId}`);
      }
    });
  });
};
