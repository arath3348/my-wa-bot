const { Client, LocalAuth } = require('whatsapp-web.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 1. Gemini AI Setup
// Railway Variables වල GEMINI_API_KEY එක දාලා තියෙන්න ඕනේ
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// 2. WhatsApp Client Setup
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        handleSIGINT: false,
        // මෙතන executablePath එක අයින් කළා Browser error එක එන නිසා
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process',
            '--no-zygote',
            '--disable-gpu'
        ],
    }
});

// 3. Pairing Code Logic
client.on('qr', (qr) => {
    console.log('QR Received, but we are using Pairing Code...');
});

client.on('ready', () => {
    console.log('-----------------------------------');
    console.log('✅ බොට් වැඩ මචං! දැන් මැසේජ් එකක් දාලා බලන්න.');
    console.log('-----------------------------------');
});

// 4. Message & AI Handling
client.on('message', async (message) => {
    if (message.fromMe) return;

    try {
        console.log(`මැසේජ් එකක් ආවා: ${message.body}`);
        
        const result = await model.generateContent(message.body);
        const response = await result.response;
        const text = response.text();

        await message.reply(text);
    } catch (error) {
        console.error('Gemini AI Error:', error);
    }
});

// 5. Initialize Client
client.initialize();

// 6. Pairing Code Generation
const myNumber = '94751577174'; 

setTimeout(async () => {
    try {
        console.log('🚀 Pairing Code එක Request කරනවා...');
        const code = await client.requestPairingCode(myNumber);
        console.log('\n====================================');
        console.log('👉 YOUR PAIRING CODE IS:', code);
        console.log('====================================\n');
        console.log('Go to WhatsApp > Linked Devices > Link with phone number instead');
    } catch (err) {
        console.error('Failed to get pairing code:', err);
    }
}, 15000); // බ්‍රවුසරය ලෝඩ් වෙන්න තත්පර 15ක් ඉඩ දෙනවා
