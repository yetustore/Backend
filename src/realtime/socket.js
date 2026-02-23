import { Server } from 'socket.io';

let io;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
  });

  io.on('connection', (socket) => {
    socket.emit('connected', { ok: true });
  });

  return io;
};

export const getIo = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

export const safeEmit = (event, payload) => {
  try {
    if (io) io.emit(event, payload);
  } catch {
    // no-op
  }
};
