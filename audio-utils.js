// Audio conversion utilities for Twilio <-> Gemini
// Twilio: mulaw 8kHz
// Gemini: PCM 16-bit, 16kHz input / 24kHz output

// mulaw decode table
const MULAW_DECODE_TABLE = new Int16Array([
  -32124, -31100, -30076, -29052, -28028, -27004, -25980, -24956,
  -23932, -22908, -21884, -20860, -19836, -18812, -17788, -16764,
  -15996, -15484, -14972, -14460, -13948, -13436, -12924, -12412,
  -11900, -11388, -10876, -10364, -9852, -9340, -8828, -8316,
  -7932, -7676, -7420, -7164, -6908, -6652, -6396, -6140,
  -5884, -5628, -5372, -5116, -4860, -4604, -4348, -4092,
  -3900, -3772, -3644, -3516, -3388, -3260, -3132, -3004,
  -2876, -2748, -2620, -2492, -2364, -2236, -2108, -1980,
  -1884, -1820, -1756, -1692, -1628, -1564, -1500, -1436,
  -1372, -1308, -1244, -1180, -1116, -1052, -988, -924,
  -876, -844, -812, -780, -748, -716, -684, -652,
  -620, -588, -556, -524, -492, -460, -428, -396,
  -372, -356, -340, -324, -308, -292, -276, -260,
  -244, -228, -212, -196, -180, -164, -148, -132,
  -120, -112, -104, -96, -88, -80, -72, -64,
  -56, -48, -40, -32, -24, -16, -8, 0,
  32124, 31100, 30076, 29052, 28028, 27004, 25980, 24956,
  23932, 22908, 21884, 20860, 19836, 18812, 17788, 16764,
  15996, 15484, 14972, 14460, 13948, 13436, 12924, 12412,
  11900, 11388, 10876, 10364, 9852, 9340, 8828, 8316,
  7932, 7676, 7420, 7164, 6908, 6652, 6396, 6140,
  5884, 5628, 5372, 5116, 4860, 4604, 4348, 4092,
  3900, 3772, 3644, 3516, 3388, 3260, 3132, 3004,
  2876, 2748, 2620, 2492, 2364, 2236, 2108, 1980,
  1884, 1820, 1756, 1692, 1628, 1564, 1500, 1436,
  1372, 1308, 1244, 1180, 1116, 1052, 988, 924,
  876, 844, 812, 780, 748, 716, 684, 652,
  620, 588, 556, 524, 492, 460, 428, 396,
  372, 356, 340, 324, 308, 292, 276, 260,
  244, 228, 212, 196, 180, 164, 148, 132,
  120, 112, 104, 96, 88, 80, 72, 64,
  56, 48, 40, 32, 24, 16, 8, 0
]);

// Encode PCM sample to mulaw
function encodeMulaw(sample) {
  const MULAW_MAX = 0x1FFF;
  const MULAW_BIAS = 33;

  let sign = (sample >> 8) & 0x80;
  if (sign) sample = -sample;
  sample += MULAW_BIAS;
  if (sample > MULAW_MAX) sample = MULAW_MAX;

  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}

  let mantissa = (sample >> (exponent + 3)) & 0x0F;
  let mulawByte = ~(sign | (exponent << 4) | mantissa);

  return mulawByte & 0xFF;
}

// Decode mulaw byte to PCM sample
function decodeMulaw(mulawByte) {
  return MULAW_DECODE_TABLE[mulawByte];
}

// Convert mulaw 8kHz buffer to PCM 16kHz buffer (with upsampling)
export function mulawToPcm16k(mulawBuffer) {
  const pcmSamples = [];

  for (let i = 0; i < mulawBuffer.length; i++) {
    const sample = decodeMulaw(mulawBuffer[i]);
    // Upsample 8kHz to 16kHz by duplicating samples
    pcmSamples.push(sample);
    pcmSamples.push(sample);
  }

  // Convert to 16-bit little-endian buffer
  const pcmBuffer = Buffer.alloc(pcmSamples.length * 2);
  for (let i = 0; i < pcmSamples.length; i++) {
    pcmBuffer.writeInt16LE(pcmSamples[i], i * 2);
  }

  return pcmBuffer;
}

// Convert PCM 24kHz buffer to mulaw 8kHz buffer (with downsampling)
export function pcm24kToMulaw8k(pcmBuffer) {
  const numSamples = pcmBuffer.length / 2;
  const mulawSamples = [];

  // Downsample 24kHz to 8kHz (take every 3rd sample)
  for (let i = 0; i < numSamples; i += 3) {
    const sample = pcmBuffer.readInt16LE(i * 2);
    mulawSamples.push(encodeMulaw(sample));
  }

  return Buffer.from(mulawSamples);
}

// Convert base64 mulaw to base64 PCM 16kHz
export function base64MulawToBase64Pcm16k(base64Mulaw) {
  const mulawBuffer = Buffer.from(base64Mulaw, 'base64');
  const pcmBuffer = mulawToPcm16k(mulawBuffer);
  return pcmBuffer.toString('base64');
}

// Convert base64 PCM 24kHz to base64 mulaw 8kHz
export function base64Pcm24kToBase64Mulaw8k(base64Pcm) {
  const pcmBuffer = Buffer.from(base64Pcm, 'base64');
  const mulawBuffer = pcm24kToMulaw8k(pcmBuffer);
  return mulawBuffer.toString('base64');
}

/**
 * Apply volume gain to PCM 16-bit audio buffer
 * @param {Buffer} pcmBuffer - PCM 16-bit audio buffer
 * @param {number} gain - Volume multiplier (0.5 = -6dB, 1.0 = unchanged, 2.0 = +6dB)
 * @returns {Buffer} - Adjusted PCM buffer
 */
export function applyVolumeGain(pcmBuffer, gain = 1.0) {
  if (gain === 1.0) return pcmBuffer;

  const numSamples = pcmBuffer.length / 2;
  const outputBuffer = Buffer.alloc(pcmBuffer.length);

  for (let i = 0; i < numSamples; i++) {
    let sample = pcmBuffer.readInt16LE(i * 2);
    // Apply gain and clamp to 16-bit range
    sample = Math.round(sample * gain);
    sample = Math.max(-32768, Math.min(32767, sample));
    outputBuffer.writeInt16LE(sample, i * 2);
  }

  return outputBuffer;
}
