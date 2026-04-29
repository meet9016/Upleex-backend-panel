const { Server } = require('socket.io');

let io;
const userSockets = new Map(); // userId -> [socketIds]
const vendorSockets = new Map(); // vendorId -> [socketIds]
const adminSockets = new Set(); // set of admin socketIds

const init = (server) => {
  io = new Server(server, {
    path: '/api/socket.io',
    cors: {
      origin: function(origin, callback) {
        const allowedOrigins = [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:3002',
          'http://localhost:3003',
          'https://upleex.2min.cloud',
          'https://admin.upleex.2min.cloud',
          'https://vendor.upleex.2min.cloud',
          'https://upleex.com',
          'https://www.upleex.com',
          'https://admin.upleex.com',
          'https://vendor.upleex.com',
          'https://upleex.digitalks.co.in',
        ];
        
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,       // 60s — wait before declaring connection dead
    pingInterval: 25000,      // 25s — heartbeat every 25s
    upgradeTimeout: 30000,    // 30s — time to upgrade from polling to websocket
    maxHttpBufferSize: 1e6,   // 1MB
  });

   console.log('[Socket] Socket.io initialized');

  io.on('connection', (socket) => {
    console.log('New Socket.io connection established:', socket.id, 'from origin:', socket.handshake.headers.origin);

    // Join room based on user type and ID
    socket.on('join', (data) => {
      const { id, type } = data; // type: 'user', 'vendor', 'admin'
      if (!id || !type) {
        console.warn('Invalid join data:', data);
        return;
      }

      const roomId = `${type}_${id.toString()}`;
      socket.join(roomId);
      console.log(`Socket ${socket.id} joined room: ${roomId}`);

      if (type === 'user') {
        const sockets = userSockets.get(id) || [];
        userSockets.set(id, [...sockets, socket.id]);
        console.log(`User ${id} connected. Total sockets: ${userSockets.get(id).length}`);
      } else if (type === 'vendor') {
        const sockets = vendorSockets.get(id) || [];
        vendorSockets.set(id, [...sockets, socket.id]);
        console.log(`Vendor ${id} connected. Total sockets: ${vendorSockets.get(id).length}`);
      } else if (type === 'admin') {
        adminSockets.add(socket.id);
        socket.join('admin_room');
        console.log(`Admin connected. Total admins: ${adminSockets.size}`);
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      // Clean up maps
      adminSockets.delete(socket.id);
      userSockets.forEach((sockets, userId) => {
        const idx = sockets.indexOf(socket.id);
        if (idx > -1) {
          sockets.splice(idx, 1);
          if (sockets.length === 0) userSockets.delete(userId);
        }
      });
      vendorSockets.forEach((sockets, vendorId) => {
        const idx = sockets.indexOf(socket.id);
        if (idx > -1) {
          sockets.splice(idx, 1);
          if (sockets.length === 0) vendorSockets.delete(vendorId);
        }
      });
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

const emitToUser = (userId, event, data) => {
  if (io) {
    const roomId = `user_${String(userId)}`;
    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    console.log(`[Socket] Emitting '${event}' to room '${roomId}' | sockets in room: ${roomSockets ? roomSockets.size : 0}`);
    io.to(roomId).emit(event, data);
  } else {
    console.warn('[Socket] emitToUser called but io not initialized');
  }
};

const emitToVendor = (vendorId, event, data) => {
  if (io) {
    const roomId = `vendor_${vendorId.toString()}`;
    io.to(roomId).emit(event, data);
    console.log(`Emitting ${event} to room ${roomId}`);
  }
};

const emitToAdmin = (event, data) => {
  if (io) {
    io.to('admin_room').emit(event, data);
    console.log(`Emitting ${event} to admin_room`);
  }
};

module.exports = {
  init,
  getIO,
  emitToUser,
  emitToVendor,
  emitToAdmin,
};
