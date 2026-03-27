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
      a{color:#0f0}
      img{border:4px solid #0f0;border-radius:8px;margin:10px}
      .code{font-size:36px;letter-spacing:8px;color:#ff0;background:#222;padding:20px;border-radius:8px;display:inline-block;margin:15px}
      .status{color:#888;font-size:13px}
      .btn{background:#0f0;color:#000;padding:12px 25px;text-decoration:none;border-radius:6px;font-size:16px;display:inline-block;margin:10px}
    </style></head>
    <body>${body}</body></html>`);
  };

  if (req.url === '/qr') {
    if (pairingCode) {
      html(`<h2>📱 Pairing Code Enter කරන්න</h2>
        <p>WhatsApp → ⋮ → Linked Devices → Link a Device → <b>Link with phone number instead</b></p>
        <p>Number: <b>+${PHONE_NUMBER}</b></p>
        <div class="code">${pairingCode}</div>
        <p class="status">Status: ${botStatus} | Auto refresh 5s</p>`);
    } else if (currentQR) {
      try {
        const img = await QRCode.toDataURL(currentQR, { width: 280 });
        html(`<h2>📱 QR Scan කරන්න</h2>
          <p>WhatsApp → ⋮ → Linked Devices → Link a Device</p>
          <img src="${img}"/><br>
          <p class="status">Status: ${botStatus} | Auto refresh 5s</p>`);
      } catch (e) {
        html(`<h2>QR Error: ${e.message}</h2>`);
      }
    } else {
      html(`<h2>⏳ ${botStatus}</h2><p>Wait කරන්න, QR generate වෙනවා...</p>`);
    }
  } else {
    html(`<h1>🤖 WhatsApp AI Bot</h1>
      <p>Status: <b>${botStatus}</b></p><br>
      <a class="btn" href="/qr">📱 QR / Pairing Code</a>`);
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`✅ HTTP Server on port ${PORT}`));

// ─── CONTACT PERSONAS ─────────────────────────────────────
// ✅ ඔයාගේ contacts add කරන්න:
// contactPersonas['94771234567@s.whatsapp.net'] = {
//   name: 'Kamal',
//   style: 'My best friend since school. Talks casual Sinhala-English. Calls me machan.'
// };
const contactPersonas = {};

// ─── MY CHAT STYLE ────────────────────────────────────────
// ✅ ඔයාගේ style customize කරන්න:
const MY_STYLE = `
You must impersonate a real Sri Lankan person replying on WhatsApp.
STRICT rules:
1. MAX 1-2 short lines. Never long paragraphs.
2. Use Sinhala + English mix (Singlish): "hm", "ok", "aney", "da", "ne", "machan", "thamai", "ow", "niyamai", "api", "kohomada", "hadanne", "yamu", "bala"
3. Use emojis rarely: 😂 😅 ❤️ 👍 🙈
4. Sound HUMAN and CASUAL. Never formal. Never AI-like.
5. Match the conversation topic naturally.
6. If asked something you don't know, say "danne na" or "hmm idea nane"
7. Sometimes reply with just "hm" or "ow ok" for simple messages.
8. If someone asks if you are AI or bot - DENY IT. Say "nah meka ai ekk neme" or "hm man thami" 
9. Never use perfect grammar - make small typos sometimes like a real person

Good examples:
"hm ok machan 👍"
"aney danne na 😂"
"ow ow therenawa"
"sry late reply una"
"hmm niyamai da?"
"ahh ok thamai ne"
"api ynna one koheda?"
"nah meka ai ekk nemei 😂 man thami"
`;

// ─── MEMORY ───────────────────────────────────────────────
const memory = {};

async function getReply(jid, incomingText, senderName) {
  const persona = contactPersonas[jid] || {
    name: senderName,
    style: 'A friend. Reply naturally like a Sri Lankan person.',
  };

  if (!memory[jid]) memory[jid] = [];
  memory[jid].push(`${persona.name}: ${incomingText}`);
  if (memory[jid].length > 14) memory[jid].shift();

  const chatHistory = memory[jid].join('\n');

  const prompt = `${MY_STYLE}

You are replying as the phone owner.
Contact name: ${persona.name}
Contact style: ${persona.style}

Recent conversation:
${chatHistory}

Reply to the latest message from ${persona.name}.
Output ONLY your reply text. No quotes. No explanations. Just the message.`;

  try {
    // ✅ gemini-2.0-flash - latest & free
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(prompt);
    const reply = result.response.text().trim().replace(/^["']|["']$/g, '').split('\n')[0];
    memory[jid].push(`Me: ${reply}`);
    return reply;
  } catch (e) {
    console.error('Gemini error:', e.message);
    return 'hm';
  }
}

// ─── STICKER ──────────────────────────────────────────────
async function sendSticker(jid, quotedMsg) {
  const dir = './stickers';
  if (!fs.existsSync(dir)) return false;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.webp'));
  if (!files.length) return false;
  const buf = fs.readFileSync(path.join(dir, files[Math.floor(Math.random() * files.length)]));
  await sock.sendMessage(jid, { sticker: buf }, { quoted: quotedMsg });
  return true;
}

// ─── BOT MAIN ─────────────────────────────────────────────
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

      // Request pairing code as alternative
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
        botStatus = '🚫 Logged out! auth_info folder delete කරලා redeploy කරන්න.';
        console.log('Logged out. Will not reconnect.');
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

  // ─── MESSAGE HANDLER ────────────────────────────────────
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

        // Extract text from all message types
        const msgType = getContentType(msg.message);
        let text = '';

        if (msgType === 'conversation') {
          text = msg.message.conversation;
        } else if (msgType === 'extendedTextMessage') {
          text = msg.message.extendedTextMessage?.text;
        } else if (msgType === 'imageMessage') {
          text = msg.message.imageMessage?.caption || '';
        } else if (msgType === 'videoMessage') {
          text = msg.message.videoMessage?.caption || '';
        }

        if (!text || text.trim() === '') continue;

        console.log(`📩 [${senderName}]: ${text}`);

        // 10% sticker chance
        if (Math.random() < 0.1) {
          const sent = await sendSticker(jid, msg);
          if (sent) { console.log('🎭 Sticker sent'); continue; }
        }

        // Generate AI reply
        const reply = await getReply(jid, text, senderName);
        console.log(`🤖 Sending: ${reply}`);

        // Human-like typing delay (1.5s - 4s)
        const delay = 1500 + Math.random() * 2500;
        await new Promise(r => setTimeout(r, delay));

        // Send with retry
        try {
          await sock.sendMessage(jid, { text: reply }, { quoted: msg });
          console.log(`✅ Sent to ${senderName}`);
        } catch (sendError) {
          console.error(`❌ Send failed: ${sendError.message}`);
          try {
            await sock.sendMessage(jid, { text: reply });
            console.log(`✅ Sent (no quote) to ${senderName}`);
          } catch (retryError) {
            console.error(`❌ Retry failed: ${retryError.message}`);
          }
        }
      }
    } catch (err) {
      console.error('Message handler error:', err.message);
    }
  });
}

startBot();
