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
            '--disable-dev-shm-usage'
        ],
    }
});

client.on('ready', () => {
    console.log('✅ බොට් වැඩ මචං! දැන් මැසේජ් එකක් දාලා බලන්න.');
});

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

// Pairing Code Request
const myNumber = '94751577174'; 

client.on('qr', async () => {
    console.log('🚀 Requesting Pairing Code...');
    try {
        // අලුත් ලයිබ්‍රරි එකේ මේක සාර්ථකව වැඩ කරනවා
        const code = await client.requestPairingCode(myNumber);
        console.log('\n====================================');
        console.log('👉 YOUR PAIRING CODE IS:', code);
        console.log('====================================\n');
    } catch (err) {
        console.log('Pairing Code එක ගන්න බැරි වුණා. ආයෙත් Deploy කරන්න.');
    }
});
