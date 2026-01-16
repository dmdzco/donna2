import express from 'express';
import twilio from 'twilio';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', milestone: 1 });
});

// Twilio webhook - incoming call
app.post('/voice/answer', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say({
    voice: 'Polly.Joanna',
    language: 'en-US'
  }, 'Hello! This is Donna, your friendly companion. I hope you are having a wonderful day. Goodbye for now!');

  res.type('text/xml');
  res.send(twiml.toString());
});

// Twilio status callback
app.post('/voice/status', (req, res) => {
  console.log(`Call ${req.body.CallSid}: ${req.body.CallStatus}`);
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Donna listening on port ${PORT}`);
});
