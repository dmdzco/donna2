import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { authRouter } from './routes/auth.js';
import { seniorsRouter } from './routes/seniors.js';
import { remindersRouter } from './routes/reminders.js';
import { conversationsRouter } from './routes/conversations.js';
import { voiceRouter } from './routes/voice.js';
import testPhase1Router from './routes/test-phase1.js';
import testPhase2Router from './routes/test-phase2.js';
import testPhase3Router from './routes/test-phase3.js';
import { errorHandler } from './middleware/error-handler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.WEB_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use('/test', express.static(path.join(__dirname, '../public')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/seniors', seniorsRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/voice', voiceRouter);

// Test routes
app.use('/api/test/phase1', testPhase1Router);
app.use('/api/test/phase2', testPhase2Router);
app.use('/api/test/phase3', testPhase3Router);

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Donna API server running on port ${PORT}`);
});

export default app;
