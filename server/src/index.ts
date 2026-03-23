import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { registerSocketHandlers } from './socketHandlers';

const app = express();
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.get('/health', (_req, res) => res.json({ ok: true }));

registerSocketHandlers(io);

const PORT = Number(process.env.PORT) || 3001;

if (require.main === module) {
  httpServer.listen(PORT, () => console.log(`Server listening on :${PORT}`));
}

export { httpServer };
