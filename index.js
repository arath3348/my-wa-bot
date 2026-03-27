const { Client, LocalAuth } = require('whatsapp-web.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// 1. Gemini AI Setup
// Railway Variables වල GEMINI_API_KEY එක දාන්න ඕනේ
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// 2. WhatsApp Client Setup
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        handleSIGINT: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
    }
});

// 3. Pairing Code Request
client.on('qr', (qr) => {
    console.log('QR Received, but we are using Pairing Code...');
});

client.on('ready', () => {
    console.log('✅ WhatsApp Bot is Ready and Connected!');
});

// 4. Message Handling (Gemini AI)
client.on('message', async (message) => {
    if (message.fromMe) return; // තමන්ගේම මැසේජ් වලට රිප්ලයි කරන්නේ නැහැ

    try {
        console.log(`Message from ${message.from}: ${message.body}`);
        
        // Gemini AI එකෙන් පිළිතුරක් ඉල්ලීම
        const result = await model.generateContent(message.body);
        const response = await result.response;
        const text = response.text();

        // පිළිතුර WhatsApp හරහා යැවීම
        await message.reply(text);
    } catch (error) {
        console.error('Error with Gemini AI:', error);
        // await message.reply('සමාවෙන්න, මට මේ වෙලාවේ පිළිතුරක් දෙන්න බැහැ.');
    }
});

// 5. Initialize & Pairing Code Generation
client.initialize();

// මෙතන 947XXXXXXXXX වෙනුවට ඔයාගේ අංකය දාන්න
const myNumber = '94751577174'; 

setTimeout(async () => {
    try {
        const code = await client.requestPairingCode(myNumber);
        console.log('-----------------------------------');
        console.log('🚀 YOUR PAIRING CODE IS:', code);
        console.log('-----------------------------------');
        console.log('Go to WhatsApp > Linked Devices > Link with phone number instead');
    } catch (err) {
        console.error('Failed to get pairing code:', err);
    }
}, 10000); // තත්පර 10ක් ඉන්නවා බ්‍රවුසරය ලෝඩ් වෙනකම්
