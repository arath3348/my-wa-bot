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

// Pairing Code එක ගන්න අලුත් ක්‍රමය
async function getPairingCode() {
    try {
        console.log('🚀 Pairing Code එක Request කරනවා...');
        
        // බ්‍රවුසරය සහ WhatsApp Web පිටුව ලෝඩ් වෙනකම් පොඩ්ඩක් ඉවසමු
        if (!client.pupPage) {
            console.log('Waiting for browser page...');
            setTimeout(getPairingCode, 5000); // තත්පර 5කින් ආයේ බලමු
            return;
        }

        const code = await client.requestPairingCode(myNumber);
        console.log('\n====================================');
        console.log('👉 YOUR PAIRING CODE IS:', code);
        console.log('====================================\n');
    } catch (err) {
        console.log('Retrying Pairing Code...');
        setTimeout(getPairingCode, 10000); // Error එකක් ආවොත් තව තත්පර 10කින් ආයේ try කරමු
    }
}

// බොට් පටන් අරන් තත්පර 30කින් Code එක ඉල්ලමු
setTimeout(getPairingCode, 30000);
