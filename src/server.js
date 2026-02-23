import dotenv from 'dotenv';
import http from 'http';
import app from './app.js';
import { connectDb } from './config/db.js';
import { initSocket } from './realtime/socket.js';

dotenv.config();

const port = process.env.PORT || 4000;

const start = async () => {
  await connectDb(process.env.MONGO_URI);
  const server = http.createServer(app);
  initSocket(server);
  server.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
};

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
