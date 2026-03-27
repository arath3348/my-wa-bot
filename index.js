const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// =====================================
// CONTACT PERSONAS - ඔයාගේ contacts
// =====================================
const contactPersonas = {
  // Phone number: persona description
  '94771234567@s.whatsapp.net': {
    name: 'Kamal',
    style: 'Kamal is my best friend. He talks casually in Sinhala-English mix. Uses "malli", "machan" often. Short replies.',
    memory: []
  },
  '94701234567@s.whatsapp.net': {
    name: 'Boss',
    style: 'This is my boss at work. Reply formally and professionally. Always in English.',
    memory: []
  }
  // ✅ Add more contacts here
};

// Default persona (unknown contacts)
const defaultPersona = {
  name: 'Unknown',
  style: 'Reply naturally and friendly like a normal person would.',
  memory: []
};

// =====================================
// CHAT HISTORY (ඔයා කලින් chat කළ style)
// =====================================
// ✅ ඔයාගේ past messages enter කරන්න ↓
const MY_CHAT_STYLE = `
You are impersonating the phone owner. Here is how they typically message:
- Uses Sinhala and English mixed (Singlish)
- Short messages, rarely more than 2 lines
- Uses "hm", "ok", "aney", "ahh", "machan"
- Sometimes uses emojis like 😂 🙈 ❤️
- Casual and friendly tone
- Never overly formal
Example messages they send:
"hm ok machan"
"aney danne na 😂"  
"ahh ok thamai"
"api ynna one koheda?"
"sry late reply una"
`;

// =====================================
// GEMINI AI RESPONSE
// =====================================
async function getAIReply(contactJid, incomingMessage, contactName) {
  const persona = contactPersonas[contactJid] || defaultPersona;
  
  // Add to memory (last 10 messages)
  persona.memory.push({ role: 'user', content: incomingMessage });
  if (persona.memory.length > 10) persona.memory.shift();

  const memoryContext = persona.memory
    .map(m => `${m.role === 'user' ? contactName : 'Me'}: ${m.content}`)
    .join('\n');

  const prompt = `
${MY_CHAT_STYLE}

Contact Info: You are talking to ${persona.name}.
Contact Style Guide: ${persona.style}

Recent conversation:
${memoryContext}

The latest message from ${persona.name}: "${incomingMessage}"

Reply as the phone owner would. Keep it short and natural. Match the language (Sinhala/English/mixed) that ${persona.name} uses.
Only reply with the message text, nothing else.
`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const reply = result.response.text().trim();
    
    // Save bot reply to memory
    persona.memory.push({ role: 'bot', content: reply });
    
    return reply;
  } catch (err) {
    console.error('Gemini error:', err);
    return 'hm 👍';
  }
}

// =====================================
// STICKER SEND
// =====================================
async function sendRandomSticker(sock, jid) {
  const stickerDir = './stickers';
  if (!fs.existsSync(stickerDir)) return;
  
  const files = fs.readdirSync(stickerDir).filter(f => f.endsWith('.webp'));
  if (files.length === 0) return;
  
  const randomFile = files[Math.floor(Math.random() * files.length)];
  const stickerBuffer = fs.readFileSync(path.join(stickerDir, randomFile));
  
  await sock.sendMessage(jid, {
    sticker: stickerBuffer
  });
}

// =====================================
// MAIN BOT
// =====================================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'warn' }),
    browser: ['Chrome (Linux)', '', '']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n✅ QR Code below - Scan with WhatsApp:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed. Reconnecting:', shouldReconnect);
      if (shouldReconnect) startBot();
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp Bot Connected!');
    }
  });

  // =====================================
  // MESSAGE HANDLER
  // =====================================
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Skip own messages and status updates
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid === 'status@broadcast') continue;

      const jid = msg.key.remoteJid;
      const senderName = msg.pushName || 'Friend';
      
      // Extract message text
      const text = msg.message?.conversation 
        || msg.message?.extendedTextMessage?.text 
        || '';

      if (!text) continue;

      console.log(`📩 From ${senderName} (${jid}): ${text}`);

      // ✅ Decide: reply with sticker or text?
      const shouldSendSticker = Math.random() < 0.1; // 10% chance sticker

      if (shouldSendSticker) {
        await sendRandomSticker(sock, jid);
      } else {
        const reply = await getAIReply(jid, text, senderName);
        console.log(`🤖 Replying: ${reply}`);
        
        await sock.sendMessage(jid, { text: reply }, { quoted: msg });
      }
    }
  });
}

startBot();
