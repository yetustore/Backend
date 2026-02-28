import dotenv from 'dotenv';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import app from './app.js';
import { connectDb } from './config/db.js';
import { initSocket } from './realtime/socket.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

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


setInterval(async () => {
  try {
    const response = await fetch('https://apiyetustore.onrender.com/ping');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.text();
    console.log(data);
  } catch (error) {
    console.error('Erro ao chamar rota:', error);
  }
}, 10 * 60 * 1000);
