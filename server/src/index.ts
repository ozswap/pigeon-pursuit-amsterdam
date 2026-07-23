import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import apiRoutes from './routes/api.js';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
app.use(express.json({ limit: '16kb' }));
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'canal-courier-api' });
});

app.use('/api/v1', apiRoutes);

app.listen(PORT, () => {
  console.log(`Canal Courier API listening on :${PORT}`);
});
