const { Client, LocalAuth } = require('whatsapp-web.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        handleSIGINT: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-zygote'
        ],
    }
});

client.on('qr', (qr) => {
    console.log('QR Received. Wait for Pairing Code...');
});

client.on('ready', () => {
    console.log('✅ බොට් වැඩ මචං!');
});

client.on('message', async (msg) => {
    if (msg.fromMe) return;
    try {
        const result = await model.generateContent(msg.body);
        const response = await result.response;
        await msg.reply(response.text());
    } catch (e) {
        console.error('AI Error:', e);
    }
});

client.initialize();

// Pairing Code Request
const myNumber = '94751577174';
setTimeout(async () => {
    try {
        console.log('🚀 Requesting Pairing Code...');
        const code = await client.requestPairingCode(myNumber);
        console.log('\n====================================');
        console.log('👉 YOUR PAIRING CODE IS:', code);
        console.log('====================================\n');
    } catch (err) {
        console.log('Error:', err.message);
    }
}, 20000);
