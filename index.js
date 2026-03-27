const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const http = require('http');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// =====================================
// QR HTTP SERVER - Railway ගා QR view කරන්න
// =====================================
let currentQR = null;
let botStatus = 'Waiting for QR...';

const server = http.createServer(async (req, res) => {
  if (req.url === '/qr') {
    if (!currentQR) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="background:#000;color:#0f0;font-family:monospace;text-align:center;padding:50px">
        <h2>${botStatus}</h2>
        <p>QR not ready yet. <a href="/qr" style="color:lime">Refresh</a></p>
        <meta http-equiv="refresh" content="3">
      </body></html>`);
      return;
    }
    try {
      const qrImageUrl = await QRCode.toDataURL(currentQR);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="background:#000;color:#0f0;font-family:monospace;text-align:center;padding:30px">
        <h2>WhatsApp Bot - QR Scan කරන්න</h2>
        <p>WhatsApp → Linked Devices → Link a Device</p>
        <img src="${qrImageUrl}" style="width:300px;height:300px;border:4px solid lime"/>
        <p>Status: ${botStatus}</p>
        <p><a href="/qr" style="color:lime">🔄 Refresh QR</a></p>
        <meta http-equiv="refresh" content="20">
      </body></html>`);
    } catch (e) {
      res.writeHead(500);
      res.end('QR generate error');
    }
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<html><body style="background:#000;color:#0f0;font-family:monospace;text-align:center;padding:50px">
      <h1>WhatsApp AI Bot</h1>
      <p>Status: ${botStatus}</p>
      <a href="/qr" style="color:lime;font-size:20px">📱 QR Code Scan කරන්න</a>
    </body></html>`);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📱 QR view: https://your-app.up.railway.app/qr`);
});

// =====================================
// CONTACT PERSONAS
// =====================================
const contactPersonas = {
  // '94771234567@s.whatsapp.net': {
  //   name: 'Kamal',
  //   style: 'Kamal is my best friend. Talks casually in Sinhala-English mix. Uses machan, malli.',
  //   memory: []
  // },
};

const defaultPersona = {
  name: 'Friend',
  style: 'Reply naturally and friendly like a normal Sri Lankan person. Use Singlish (Sinhala + English mix).',
  memory: []
};

// =====================================
// ඔයාගේ Chat Style
// =====================================
const MY_CHAT_STYLE = `
You are impersonating the phone owner. Strictly follow their messaging style:
- Uses Sinhala and English mixed (Singlish)
- Very short messages, 1-2 lines max
- Common words: "hm", "ok", "aney", "ahh", "machan", "thamai", "ne", "da"
- Sometimes uses emojis: 😂 🙈 ❤️ 👍
- Casual tone, never formal
- Late replies are normal, sometimes just "sry late"
Example messages:
"hm ok machan"
"aney danne na 😂"
"ahh ok thamai"
"sry late reply una"
"hmm niyamai"
`;

// =====================================
// GEMINI REPLY
// =====================================
async function getAIReply(contactJid, incomingMessage, contactName) {
  const persona = contactPersonas[contactJid] || { ...defaultPersona, memory: [] };

  if (!contactPersonas[contactJid]) {
    if (!global.tempMemory) global.tempMemory = {};
    if (!global.tempMemory[contactJid]) global.tempMemory[contactJid] = [];
    persona.memory = global.tempMemory[contactJid];
    global.tempMemory[contactJid] = persona.memory;
  }

  persona.memory.push({ role: 'user', content: incomingMessage });
  if (persona.memory.length > 10) persona.memory.shift();

  const memoryContext = persona.memory
    .map(m => `${m.role === 'user' ? contactName : 'Me'}: ${m.content}`)
    .join('\n');

  const prompt = `
${MY_CHAT_STYLE}

You are talking to: ${contactName}
Contact persona: ${persona.style}

Recent conversation:
${memoryContext}

Latest message from ${contactName}: "${incomingMessage}"

Reply as the phone owner. Keep it short and natural. Match their language style.
ONLY output the reply message, nothing else. No explanations.
`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const reply = result.response.text().trim();
    persona.memory.push({ role: 'bot', content: reply });
    return reply;
  } catch (err) {
    console.error('Gemini error:', err.message);
    return 'hm 👍';
  }
}

// =====================================
// STICKER SEND
// =====================================
async function sendRandomSticker(sock, jid) {
  const stickerDir = './stickers';
  if (!fs.existsSync(stickerDir)) return false;
  const files = fs.readdirSync(stickerDir).filter(f => f.endsWith('.webp'));
  if (files.length === 0) return false;
  const randomFile = files[Math.floor(Math.random() * files.length)];
  const stickerBuffer = fs.readFileSync(path.join(stickerDir, randomFile));
  await sock.sendMessage(jid, { sticker: stickerBuffer });
  return true;
}

// =====================================
// MAIN BOT
// =====================================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }), // logs නෑ - clean output
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    // QR handle
    if (qr) {
      currentQR = qr;
      botStatus = 'Waiting for QR scan...';
      console.log('\n📱 QR Ready! Open your Railway URL + /qr to scan');
      console.log('   Example: https://your-app.up.railway.app/qr\n');
      // Terminal ගාත් print කරනවා backup ලෙස
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      currentQR = null;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      botStatus = `Disconnected (${statusCode}). Reconnecting: ${shouldReconnect}`;
      console.log('Connection closed. Code:', statusCode, '| Reconnect:', shouldReconnect);
      if (shouldReconnect) {
        setTimeout(() => startBot(), 3000);
      }
    }

    if (connection === 'open') {
      currentQR = null;
      botStatus = '✅ Connected & Running!';
      console.log('✅ WhatsApp Bot Connected Successfully!');
    }
  });

  // =====================================
  // MESSAGE HANDLER
  // =====================================
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid === 'status@broadcast') continue;

      const jid = msg.key.remoteJid;
      const senderName = msg.pushName || 'Friend';

      const text = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || '';

      if (!text) continue;

      console.log(`📩 [${senderName}]: ${text}`);

      // 10% chance sticker
      const shouldSendSticker = Math.random() < 0.1;
      if (shouldSendSticker) {
        const sent = await sendRandomSticker(sock, jid);
        if (sent) { console.log('🎭 Sent sticker'); continue; }
      }

      const reply = await getAIReply(jid, text, senderName);
      console.log(`🤖 Reply: ${reply}`);
      await sock.sendMessage(jid, { text: reply }, { quoted: msg });
    }
  });
}

startBot();
