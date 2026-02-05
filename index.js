import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import twilio from 'twilio';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { apiLimiter } from './middleware/rate-limit.js';
import { clerkMiddleware } from './middleware/auth.js';
import { mountRoutes } from './routes/index.js';
import { setupWebSockets } from './websocket/media-stream.js';
import { startScheduler } from './services/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Trust proxy for Railway/Vercel (needed for rate limiting and X-Forwarded-For)
app.set('trust proxy', 1);

// CORS - allow admin dashboard, consumer app, observability, and local development
app.use(cors({
  origin: [
    'https://donna-admin.vercel.app',
    'https://admin-v2-liart.vercel.app',
    'https://consumer-ruddy.vercel.app',
    'https://observability-production-3677.up.railway.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',  // Admin dashboard (React)
    'http://localhost:5174',  // Consumer app (React)
    'http://localhost:5175',  // Admin v2 (React)
  ],
  credentials: true,
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files (admin UI)
app.use(express.static(join(__dirname, 'public')));

// Rate limiting for API routes (100 req/min per IP)
app.use('/api/', apiLimiter);

// Clerk authentication middleware (initializes auth state)
app.use(clerkMiddleware());

const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : `http://localhost:${PORT}`;
const WS_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `wss://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : `ws://localhost:${PORT}`;

// Initialize Twilio client for outbound calls
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Store active sessions and call metadata (shared across routes and websockets)
const sessions = new Map();
const callMetadata = new Map();

// Make shared state available to route handlers via app.get()
app.set('sessions', sessions);
app.set('callMetadata', callMetadata);
app.set('twilioClient', twilioClient);
app.set('baseUrl', BASE_URL);
app.set('wsUrl', WS_URL);

// Mount all routes
mountRoutes(app);

// Create HTTP server and set up WebSockets
const server = createServer(app);
setupWebSockets(server, sessions, callMetadata);

server.listen(PORT, () => {
  console.log(`Donna v3.0 listening on port ${PORT}`);
  console.log(`Voice webhook: ${BASE_URL}/voice/answer`);
  console.log(`Media stream: ${WS_URL}/media-stream`);
  console.log(`Browser call: ${WS_URL}/browser-call`);
  console.log(`Pipeline: Claude + 4-layer observer + ElevenLabs streaming`);
  console.log(`Features: Dynamic model routing, Post-turn agent, Streaming TTS`);

  // Start the reminder scheduler (check every minute)
  startScheduler(BASE_URL, 60000);
});
