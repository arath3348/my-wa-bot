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

client.on('qr', (qr) => {
    console.log('QR Received. Waiting for pairing code...');
});

client.on('ready', () => {
    console.log('✅ බොට් වැඩ මචං! දැන් මැසේජ් එකක් දාලා බලන්න.');
});

// 3. AI Message Logic
client.on('message', async (message) => {
    if (message.fromMe) return;
    try {
        const result = await model.generateContent(message.body);
        const response = await result.response;
        await message.reply(response.text());
    } catch (error) {
        console.error('Gemini Error:', error);
    }
});

client.initialize();

// 4. Pairing Code එක මෙතනින් ගමු
const myNumber = '94751577174'; 

setTimeout(async () => {
    try {
        console.log('🚀 Pairing Code එක Request කරනවා...');
        const code = await client.requestPairingCode(myNumber);
        console.log('\n====================================');
        console.log('👉 YOUR PAIRING CODE IS:', code);
        console.log('====================================\n');
    } catch (err) {
        console.log('Error getting code: ', err.message);
    }
}, 20000); // තත්පර 20ක් ඉන්න
