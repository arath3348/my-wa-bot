const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const QRCode = require('qrcode');
const qrcode = require('qrcode-terminal');
const http = require('http');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// ─── CONFIG ───────────────────────────────────────────────
// ✅ ඔයාගේ WhatsApp number දාන්න (country code සමඟ, + නැතිව)
// Example: Sri Lanka 077xxxxxxx → '94771234567'
const PHONE_NUMBER = process.env.PHONE_NUMBER || '94771234567';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const PORT = process.env.PORT || 8080;
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
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>WA Bot</title>
    <style>body{background:#111;color:#0f0;font-family:monospace;text-align:center;padding:30px}
    a{color:#0f0} img{border:4px solid #0f0;border-radius:8px;margin:10px}
    .code{font-size:40px;letter-spacing:8px;color:#ff0;background:#222;padding:20px;border-radius:8px;display:inline-block;margin:15px}
    .status{color:#888;font-size:14px}</style></head>
    <body>${body}</body></html>`);
  };

  if (req.url === '/qr') {
    if (currentQR) {
      try {
        const img = await QRCode.toDataURL(currentQR, { width: 280 });
        html(`<h2>📱 QR Scan කරන්න</h2>
          <p>WhatsApp → ⋮ → Linked Devices → Link a Device</p>
          <img src="${img}"/><br>
          <p class="status">Status: ${botStatus} | Auto refresh 5s</p>`);
      } catch { html(`<h2>QR Error</h2>`); }
    } else if (pairingCode) {
      html(`<h2>📱 Pairing Code</h2>
        <p>WhatsApp → ⋮ → Linked Devices → Link a Device → <b>Link with phone number</b></p>
        <p>Number: <b>${PHONE_NUMBER}</b></p>
        <div class="code">${pairingCode}</div>
        <p class="status">Status: ${botStatus} | Code expires in ~60s | Auto refresh 5s</p>`);
    } else {
      html(`<h2>⏳ ${botStatus}</h2><p>QR / Pairing code generate වෙනකන් wait කරන්න...</p>`);
    }
  } else {
    html(`<h1>🤖 WhatsApp AI Bot</h1>
      <p>Status: <b>${botStatus}</b></p><br>
      <a href="/qr" style="background:#0f0;color:#000;padding:12px 25px;text-decoration:none;border-radius:6px;font-size:16px">
        📱 QR / Pairing Code බලන්න
      </a>`);
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`✅ HTTP Server on port ${PORT}`));

// ─── CONTACT PERSONAS ─────────────────────────────────────
const contactPersonas = {};
// contactPersonas['94771234567@s.whatsapp.net'] = {
//   name: 'Kamal', style: 'Best friend, talks casual Sinhala-English mix'
// };

const MY_STYLE = `
You are impersonating a Sri Lankan person's WhatsApp.
Style rules:
- Short replies (1-2 lines max)
- Sinhala + English mix (Singlish)
- Words: hm, ok, aney, ahh, machan, thamai, ne, da, ow, niyamai
- Emojis: 😂 🙈 ❤️ 👍 😅 (use sparingly)
- Casual, never formal
Examples: "hm ok machan" / "aney danne na 😂" / "ow ow therenawa" / "sry late"
`;

const memory = {};

async function getReply(jid, text, name) {
  const persona = contactPersonas[jid] || { name, style: 'Friendly Sri Lankan person' };
  if (!memory[jid]) memory[jid] = [];
  memory[jid].push(`${name}: ${text}`);
  if (memory[jid].length > 10) memory[jid].shift();

  const prompt = `${MY_STYLE}\nContact: ${persona.name} (${persona.style})\nChat:\n${memory[jid].join('\n')}\nReply as phone owner (output ONLY the reply):`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const res = await model.generateContent(prompt);
    const reply = res.response.text().trim().replace(/^["']|["']$/g, '');
    memory[jid].push(`Me: ${reply}`);
    return reply;
  } catch (e) {
    console.error('Gemini:', e.message);
    return 'hm 👍';
  }
}

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
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    logger: pino({ level: 'silent' }),
    // ✅ Use desktop browser fingerprint - more stable
    browser: ['Windows', 'Chrome', '10.15.7'],
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    // QR received
    if (qr) {
      currentQR = qr;
      pairingCode = null;
      botStatus = 'QR Ready - Scan Now!';
      console.log('\n📱 QR Ready! Open /qr page\n');
      qrcode.generate(qr, { small: true });

      // ✅ Also request pairing code as backup
      if (!pairingRequested && PHONE_NUMBER !== '94771234567') {
        pairingRequested = true;
        setTimeout(async () => {
          try {
            const code = await sock.requestPairingCode(PHONE_NUMBER);
            pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
            currentQR = null;
            botStatus = 'Pairing Code Ready!';
            console.log(`🔑 Pairing Code: ${pairingCode}`);
          } catch (e) {
            console.log('Pairing code request failed:', e.message);
          }
        }, 3000);
      }
    }

    if (connection === 'close') {
      currentQR = null;
      pairingCode = null;
      pairingRequested = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log(`❌ Disconnected - Code: ${code}`);

      if (code === DisconnectReason.loggedOut) {
        botStatus = '🚫 Logged out! auth_info delete කරලා redeploy කරන්න.';
        return;
      }

      retries++;
      const delay = Math.min(retries * 4000, 30000);
      botStatus = `Reconnecting... (${retries})`;
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

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') continue;
      const jid = msg.key.remoteJid;
      const name = msg.pushName || 'Friend';
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      if (!text) continue;

      console.log(`📩 [${name}]: ${text}`);

      if (Math.random() < 0.1) {
        if (await sendSticker(jid)) { console.log('🎭 Sticker'); continue; }
      }

      const reply = await getReply(jid, text, name);
      console.log(`🤖 Reply: ${reply}`);
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
      await sock.sendMessage(jid, { text: reply }, { quoted: msg });
    }
  });
}

startBot();
