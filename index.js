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
            '--single-process',
            '--no-zygote',
            '--disable-gpu'
        ],
    }
});

client.on('qr', (qr) => {
    console.log('QR Received, but we are using Pairing Code...');
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

const myNumber = '94751577174'; 

// මේ කොටස තමයි අර Error එක fix කරන්නේ
setTimeout(async () => {
    try {
        console.log('🚀 Pairing Code එක Request කරනවා...');
        
        // Window Error එක මඟහරවා ගන්නා ක්‍රමය
        const code = await client.pupPage.evaluate(async (phoneNumber) => {
            return await window.WWebJS.requestPairingCode(phoneNumber);
        }, myNumber);

        console.log('\n====================================');
        console.log('👉 YOUR PAIRING CODE IS:', code);
        console.log('====================================\n');
    } catch (err) {
        // සමහර වෙලාවට පළවෙනි පාර වැරදුනොත් සාමාන්‍ය ක්‍රමය ට්‍රයි කරන්න
        try {
            const code = await client.requestPairingCode(myNumber);
            console.log('👉 YOUR PAIRING CODE IS:', code);
        } catch (finalErr) {
            console.error('Pairing Code එක ගන්න බැරි වුණා. ආයෙත් Deploy කරන්න.');
        }
    }
}, 20000); // තත්පර 20ක් ඉන්න (ලෝඩ් වෙන්න වෙලාව දෙන්න)
