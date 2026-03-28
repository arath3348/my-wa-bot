const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  getContentType,
} = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const QRCode = require('qrcode');
const qrcode = require('qrcode-terminal');
const http = require('http');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// ─── CONFIG ───────────────────────────────────────────────
const PHONE_NUMBER = process.env.PHONE_NUMBER || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const PORT = process.env.PORT || 8080;

const GEMINI_MODELS = [
  'gemini-2.0-flash-exp',   // අලුත්ම - quota වැඩිම
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
];
// ──────────────────────────────────────────────────────────

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

let currentQR = null;
let pairingCode = null;
let botStatus = 'Starting...';
let sock = null;

// ─── HTTP SERVER ──────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const html = (body) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <meta http-equiv="refresh" content="5"><title>WA Bot</title>
    <style>
      body{background:#111;color:#0f0;font-family:monospace;text-align:center;padding:30px}
      img{border:4px solid #0f0;border-radius:8px;margin:10px}
      .code{font-size:36px;letter-spacing:8px;color:#ff0;background:#222;padding:20px;border-radius:8px;display:inline-block;margin:15px}
      .status{color:#888;font-size:13px}
      .btn{background:#0f0;color:#000;padding:12px 25px;text-decoration:none;border-radius:6px;font-size:16px;display:inline-block;margin:10px}
    </style></head><body>${body}</body></html>`);
  };

  if (req.url === '/qr') {
    if (pairingCode) {
      html(`<h2>📱 Pairing Code</h2>
        <p>WhatsApp → ⋮ → Linked Devices → Link a Device → <b>Link with phone number instead</b></p>
        <p>Number: <b>+${PHONE_NUMBER}</b></p>
        <div class="code">${pairingCode}</div>
        <p class="status">Status: ${botStatus}</p>`);
    } else if (currentQR) {
      try {
        const img = await QRCode.toDataURL(currentQR, { width: 280 });
        html(`<h2>📱 QR Scan කරන්න</h2>
          <p>WhatsApp → ⋮ → Linked Devices → Link a Device</p>
          <img src="${img}"/>
          <p class="status">Status: ${botStatus}</p>`);
      } catch (e) {
        html(`<h2>QR Error</h2>`);
      }
    } else {
      html(`<h2>⏳ ${botStatus}</h2><p>Wait කරන්න...</p>`);
    }
  } else {
    html(`<h1>🤖 WhatsApp AI Bot</h1>
      <p>Status: <b>${botStatus}</b></p><br>
      <a class="btn" href="/qr">📱 QR / Pairing Code</a>`);
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`✅ HTTP Server on port ${PORT}`));

// ─── CONTACT PERSONAS ─────────────────────────────────────
const contactPersonas = {};
// ✅ ඔයාගේ contacts add කරන්න:
// contactPersonas['94771234567@s.whatsapp.net'] = {
//   name: 'Kamal',
//   style: 'Best friend. Casual Sinhala-English. Uses machan.'
// };

// ─── MY STYLE ─────────────────────────────────────────────
const MY_STYLE = `
You must impersonate a real Sri Lankan person replying on WhatsApp.
STRICT rules:
1. MAX 1-2 short lines only. Never long replies.
2. Use Sinhala + English mix: "hm", "ok", "aney", "da", "ne", "machan", "thamai", "ow", "niyamai", "kohomada", "danne na"
3. Emojis rarely: 😂 😅 ❤️ 👍 🙈
4. Sound HUMAN. Never formal. Never AI-like.
5. If asked if you are AI - say "nah man thami 😂" or "neme ai ekk"
6. Small typos ok like real person.
Good examples:
"hm ok machan" / "aney danne na 😂" / "ow therenawa" / "sry late" / "hmm niyamai da"
`;

// ─── MEMORY ───────────────────────────────────────────────
const memory = {};

// ─── GEMINI WITH FALLBACK ──────────────────────────────────
async function callGemini(prompt) {
  for (const modelName of GEMINI_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim().replace(/^["']|["']$/g, '').split('\n')[0];
      console.log(`✅ Gemini [${modelName}] OK`);
      return text;
    } catch (e) {
      if (e.message.includes('429') || e.message.includes('quota')) {
        console.log(`⚠️ [${modelName}] quota exceeded, trying next...`);
        await new Promise(r => setTimeout(r, 1000));
      } else if (e.message.includes('404') || e.message.includes('not found')) {
        console.log(`⚠️ [${modelName}] not found, trying next...`);
      } else {
        console.error(`❌ [${modelName}]: ${e.message}`);
      }
    }
  }
  return null;
}

// ─── SMART FALLBACK ───────────────────────────────────────
function getSmartFallback(text) {
  const t = text.toLowerCase();
  if (t.includes('hello') || t.includes('hllo') || t.includes('haloo') || t.includes('hi') || t.includes('hlo')) return 'haloo 👋';
  if (t.includes('kohomada') || t.includes('how are')) return 'hm niyamai, oya?';
  if (t.includes('ai') || t.includes('bot')) return 'nah man thami 😂';
  if (t.includes('?')) return 'hmm danne na';
  if (t.includes('ok') || t.includes('hm')) return 'ow ok';
  const fallbacks = ['hm', 'ok da', 'ow', 'hmm', 'aney', 'hm thamai', 'ow therenawa', 'sry late'];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

async function getReply(jid, incomingText, senderName) {
  const persona = contactPersonas[jid] || {
    name: senderName,
    style: 'A friend.',
  };

  if (!memory[jid]) memory[jid] = [];
  memory[jid].push(`${persona.name}: ${incomingText}`);
  if (memory[jid].length > 10) memory[jid].shift();

  const prompt = `${MY_STYLE}

Contact: ${persona.name} (${persona.style})
Chat history:
${memory[jid].join('\n')}

Reply as phone owner to latest message. Output ONLY the reply:`;

  let reply = await callGemini(prompt);

  if (!reply) {
    reply = getSmartFallback(incomingText);
    console.log(`⚠️ Smart fallback: ${reply}`);
  }

  memory[jid].push(`Me: ${reply}`);
  return reply;
}

// ─── STICKER ──────────────────────────────────────────────
async function sendSticker(jid) {
  const dir = './stickers';
  if (!fs.existsSync(dir)) return false;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.webp'));
  if (!files.length) return false;
  const buf = fs.readFileSync(path.join(dir, files[Math.floor(Math.random() * files.length)]));
  await sock.sendMessage(jid, { sticker: buf });
  return true;
}

// ─── BOT ──────────────────────────────────────────────────
let retries = 0;
let pairingRequested = false;

async function startBot() {
  pairingRequested = false;
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    logger: pino({ level: 'silent' }),
    browser: ['Windows', 'Chrome', '10.15.7'],
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 15000,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      currentQR = qr;
      pairingCode = null;
      botStatus = 'QR Ready!';
      console.log('\n📱 QR Ready! Open: /qr\n');
      qrcode.generate(qr, { small: true });

      if (!pairingRequested && PHONE_NUMBER && PHONE_NUMBER.length > 8) {
        pairingRequested = true;
        setTimeout(async () => {
          try {
            const code = await sock.requestPairingCode(PHONE_NUMBER);
            if (code) {
              pairingCode = code.match(/.{1,4}/g)?.join('-') || code;
              currentQR = null;
              botStatus = 'Pairing Code Ready!';
              console.log(`🔑 Pairing Code: ${pairingCode}`);
            }
          } catch (e) {
            console.log('Pairing code failed:', e.message);
          }
        }, 3000);
      }
    }

    if (connection === 'close') {
      currentQR = null;
      pairingCode = null;
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log(`❌ Disconnected - Code: ${code}`);

      if (code === DisconnectReason.loggedOut) {
        botStatus = '🚫 Logged out! auth_info delete කරලා redeploy.';
        return;
      }

      retries++;
      const delay = Math.min(retries * 4000, 30000);
      botStatus = `Reconnecting... (${retries})`;
      console.log(`🔄 Reconnecting in ${delay / 1000}s...`);
      setTimeout(() => startBot(), delay);
    }

    if (connection === 'open') {
      currentQR = null;
      pairingCode = null;
      retries = 0;
      botStatus = '✅ Connected & Running!';
      console.log('✅ Bot Connected!');
    }
  });

  // ─── MESSAGE HANDLER ──────────────────────────────────────
  sock.ev.on('messages.upsert', async (upsert) => {
    try {
      const { messages, type } = upsert;
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        if (msg.key.remoteJid === 'status@broadcast') continue;
        if (!msg.message) continue;

        const jid = msg.key.remoteJid;
        const senderName = msg.pushName || msg.key.participant?.split('@')[0] || 'Friend';

        const msgType = getContentType(msg.message);
        let text = '';

        if (msgType === 'conversation') {
          text = msg.message.conversation;
        } else if (msgType === 'extendedTextMessage') {
          text = msg.message.extendedTextMessage?.text || '';
        } else if (msgType === 'imageMessage') {
          text = msg.message.imageMessage?.caption || '';
        } else if (msgType === 'videoMessage') {
          text = msg.message.videoMessage?.caption || '';
        }

        if (!text.trim()) continue;

        console.log(`📩 [${senderName}]: ${text}`);

        // 10% sticker chance
        if (Math.random() < 0.1) {
          const sent = await sendSticker(jid);
          if (sent) { console.log('🎭 Sticker'); continue; }
        }

        // Get reply
        const reply = await getReply(jid, text, senderName);
        console.log(`🤖 Reply: ${reply}`);

        // Human typing delay
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

        // ✅ Send directly - no quoted msg (more reliable)
        try {
          await sock.sendMessage(jid, { text: reply });
          console.log(`✅ Sent to ${senderName}`);
        } catch (e1) {
          console.error(`Send failed: ${e1.message}`);
          try {
            await new Promise(r => setTimeout(r, 2000));
            await sock.sendMessage(jid, { text: reply });
            console.log(`✅ Sent (retry) to ${senderName}`);
          } catch (e2) {
            console.error(`Retry failed: ${e2.message}`);
          }
        }
      }
    } catch (err) {
      console.error('Handler error:', err.message);
    }
  });
}

startBot();
