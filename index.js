const { Client, LocalAuth } = require('whatsapp-web.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 1. Gemini AI Setup
// Railway එකේ Variables වල GEMINI_API_KEY කියලා Key එකක් හදලා ඇති නේද?
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// 2. WhatsApp Client Setup
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        handleSIGINT: false,
        executablePath: '/usr/bin/google-chrome-stable', // Linux/Railway පරිසරයට ගැලපෙන ලෙස
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

// 3. Status Logs
client.on('qr', (qr) => {
    console.log('QR එක ආවා, හැබැයි අපි Pairing Code එකයි පාවිච්චි කරන්නේ...');
});

client.on('ready', () => {
    console.log('-----------------------------------');
    console.log('✅ බොට් වැඩ මචං! දැන් මැසේජ් එකක් දාලා බලන්න.');
    console.log('-----------------------------------');
});

// 4. Message & AI Logic
client.on('message', async (message) => {
    if (message.fromMe) return;

    try {
        console.log(`මැසේජ් එකක් ආවා: ${message.body}`);
        
        // Gemini හරහා පිළිතුරක් ගැනීම
        const result = await model.generateContent(message.body);
        const response = await result.response;
        const text = response.text();

        await message.reply(text);
    } catch (error) {
        console.error('Gemini Error:', error);
    }
});

// 5. Client Initialize
client.initialize();

// 6. Pairing Code එක මෙතනින් ලැබෙයි
const myNumber = '94751577174'; 

setTimeout(async () => {
    try {
        console.log('🚀 Pairing Code එක Request කරනවා...');
        const code = await client.requestPairingCode(myNumber);
        console.log('\n====================================');
        console.log('👉 YOUR PAIRING CODE IS:', code);
        console.log('====================================\n');
    } catch (err) {
        console.error('Pairing Code Error:', err);
    }
}, 10000); // තත්පර 10ක් පරක්කු කරනවා ඔක්කොම Load වෙනකම්
