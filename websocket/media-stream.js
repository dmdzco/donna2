/**
 * WebSocket handlers for Twilio Media Streams and Browser Calls
 */

import { WebSocketServer } from 'ws';
import { parse as parseUrl } from 'url';
import { V1AdvancedSession } from '../pipelines/v1-advanced.js';
import { seniorService } from '../services/seniors.js';
import { memoryService } from '../services/memory.js';
import { schedulerService } from '../services/scheduler.js';
import { BrowserSession } from '../browser-session.js';

/**
 * Set up WebSocket servers for Twilio media streams and browser calls.
 *
 * @param {import('http').Server} server - HTTP server to attach to
 * @param {Map} sessions - Active call sessions map
 * @param {Map} callMetadata - Call metadata map
 */
export function setupWebSockets(server, sessions, callMetadata) {
  // Create WebSocket server for Twilio Media Streams
  const wss = new WebSocketServer({ noServer: true });

  wss.on('error', (error) => {
    console.error('[WSS] Server error:', error);
  });

  wss.on('connection', async (twilioWs, req) => {
    console.log('New WebSocket connection from Twilio');

    // Send a ping to keep connection alive
    const pingInterval = setInterval(() => {
      if (twilioWs.readyState === 1) {
        twilioWs.ping();
      }
    }, 30000);

    let streamSid = null;
    let callSid = null;
    let geminiSession = null;

    twilioWs.on('message', async (message) => {
      try {
        const data = JSON.parse(message);

        switch (data.event) {
          case 'connected':
            console.log('Twilio media stream connected');
            break;

          case 'start':
            streamSid = data.start.streamSid;
            callSid = data.start.callSid;
            console.log(`[${callSid}] Stream started: ${streamSid}`);

            // Wait for metadata from /voice/answer (may not be ready yet due to race condition)
            let metadata = callMetadata.get(callSid);
            if (!metadata) {
              console.log(`[${callSid}] Waiting for call metadata...`);
              for (let i = 0; i < 10; i++) { // Wait up to 1 second
                await new Promise(resolve => setTimeout(resolve, 100));
                metadata = callMetadata.get(callSid);
                if (metadata) {
                  console.log(`[${callSid}] Metadata ready after ${(i + 1) * 100}ms`);
                  break;
                }
              }
            }
            metadata = metadata || {};

            // Get reminder context which now includes the delivery record
            const reminderContext = schedulerService.getReminderContext(callSid);
            const currentDelivery = reminderContext?.delivery || null;

            // V3.1: Always use V1 (Claude + 2-layer observer)
            console.log(`[${callSid}] Creating V1 session (Claude + 2-layer observer)${currentDelivery ? ' with reminder tracking' : ''}${metadata.preGeneratedGreeting ? ' with pre-generated greeting' : ''}`);
            geminiSession = new V1AdvancedSession(
              twilioWs,
              streamSid,
              metadata.senior,
              metadata.memoryContext,
              metadata.reminderPrompt,
              [], // pendingReminders
              currentDelivery, // delivery record for acknowledgment tracking
              metadata.preGeneratedGreeting, // pre-generated greeting (for instant response)
              'check-in', // callType
              callSid // Twilio call SID for database lookups
            );
            sessions.set(callSid, geminiSession);

            try {
              await geminiSession.connect();
            } catch (error) {
              console.error(`[${callSid}] Failed to start V1 session:`, error);
            }
            break;

          case 'media':
            // Forward audio to Gemini
            if (geminiSession && data.media?.payload) {
              geminiSession.sendAudio(data.media.payload);
            }
            break;

          case 'stop':
            console.log(`[${callSid}] Stream stopped`);
            // Don't close here - let status callback handle it for proper memory extraction
            break;
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });

    twilioWs.on('close', async () => {
      console.log(`[${callSid}] WebSocket closed`);
      clearInterval(pingInterval);
      // Close session if still in sessions map (status callback may have already handled it)
      if (geminiSession && sessions.has(callSid)) {
        try {
          await geminiSession.close();
        } catch (error) {
          console.error(`[${callSid}] Error closing session on WS close:`, error);
        }
        sessions.delete(callSid);
      }
    });

    twilioWs.on('error', (error) => {
      console.error(`[${callSid}] WebSocket error:`, error);
    });
  });

  // === BROWSER CALL WebSocket (V1 pipeline) ===
  const browserWss = new WebSocketServer({ noServer: true });

  browserWss.on('connection', async (browserWs, req) => {
    console.log('[Browser] New browser call connection');
    const { query } = parseUrl(req.url, true);
    const seniorId = query.seniorId;
    let senior = null;
    let memoryContext = null;
    let browserSession = null;

    if (seniorId) {
      try {
        senior = await seniorService.getById(seniorId);
        if (senior) {
          console.log(`[Browser] Found senior: ${senior.name}`);
          memoryContext = await memoryService.buildContext(senior.id, null, senior);
        }
      } catch (error) {
        console.error('[Browser] Error fetching senior:', error);
      }
    }

    browserSession = new BrowserSession(browserWs, senior, memoryContext);

    try {
      await browserSession.connect();
    } catch (error) {
      console.error('[Browser] Failed to start session:', error);
      browserWs.close();
      return;
    }

    browserWs.on('message', (message) => {
      if (Buffer.isBuffer(message) || message instanceof ArrayBuffer) {
        browserSession.sendAudio(message);
      }
    });

    browserWs.on('close', async () => {
      console.log('[Browser] Connection closed');
      if (browserSession) {
        await browserSession.close();
      }
    });

    browserWs.on('error', (error) => {
      console.error('[Browser] WebSocket error:', error);
    });
  });

  // Handle WebSocket upgrade for Twilio media stream and browser calls
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

    if (pathname === '/media-stream') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (pathname === '/browser-call') {
      browserWss.handleUpgrade(request, socket, head, (ws) => {
        browserWss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });
}
