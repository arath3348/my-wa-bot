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
            '--no-zygote'
        ],
    }
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
        console.error('Gemini Error:', error);
    }
});

client.initialize();

const myNumber = '94751577174'; 

// Pairing code එක ගන්න කලින් WhatsApp Web එක හරියට load වෙනකම් ඉන්න ඕනේ
client.on('qr', async (qr) => {
    console.log('QR එක ලැබුණා, දැන් Pairing Code එක Request කරනවා...');
    
    // QR එක ඇවිත් තත්පර කිහිපයකින් Code එක ඉල්ලමු
    setTimeout(async () => {
        try {
            const code = await client.requestPairingCode(myNumber);
            console.log('\n====================================');
            console.log('👉 YOUR PAIRING CODE IS:', code);
            console.log('====================================\n');
        } catch (err) {
            console.log('Pairing Code Request Error. Retrying...');
        }
    }, 5000);
});
