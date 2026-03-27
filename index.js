const { Client, LocalAuth } = require('whatsapp-web.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 1. Gemini AI Setup
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
            '--disable-dev-shm-usage'
        ],
    }
});

// 3. Pairing Code Logic
client.on('qr', async (qr) => {
    console.log('QR Received. Requesting Pairing Code...');
    
    // බ්‍රවුසරය ලෝඩ් වෙන්න පොඩ්ඩක් ඉන්න
    setTimeout(async () => {
        try {
            const myNumber = '94751577174'; 
            const code = await client.requestPairingCode(myNumber);
            console.log('\n====================================');
            console.log('👉 YOUR PAIRING CODE IS:', code);
            console.log('====================================\n');
        } catch (err) {
            console.log('Error requesting pairing code:', err.message);
        }
    }, 10000);
});

client.on('ready', () => {
    console.log('✅ බොට් සාර්ථකව සම්බන්ධ වුණා!');
});

client.on('message', async (message) => {
    if (message.fromMe) return;
    try {
        const result = await model.generateContent(message.body);
        const response = await result.response;
        await message.reply(response.text());
    } catch (error) {
        console.error('Gemini AI Error:', error);
    }
});

client.initialize();
