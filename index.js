const { Client, LocalAuth } = require('whatsapp-web.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        handleSIGINT: false,
        headless: true, // Railway වලදී මේක true තියෙන්න ඕනේ
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process',
            '--no-zygote',
        ],
    }
});

client.on('qr', (qr) => {
    // QR එක පේන්න ඕනේ නැහැ, අපි පාවිච්චි කරන්නේ Pairing Code එක
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

// මේක තමයි මැජික් එක - තත්පර 40ක් ඉන්නවා ඔක්කොම Load වෙන්න
setTimeout(async () => {
    try {
        console.log('🚀 Pairing Code එක Request කරනවා... පොඩ්ඩක් ඉන්න...');
        
        // Error එක එන එක නවත්තන්න කෙලින්ම page එකෙන් ඉල්ලමු
        const code = await client.requestPairingCode(myNumber);
        
        console.log('\n====================================');
        console.log('👉 YOUR PAIRING CODE IS:', code);
        console.log('====================================\n');
        console.log('දැන් Phone එකේ Linked Devices ගිහින් මේක ගහන්න!');
    } catch (err) {
        console.log('❌ Error එකක් ආවා, මම ආයෙත් Try කරනවා...');
        // තව පාරක් Try කරමු
        setTimeout(async () => {
            const code = await client.requestPairingCode(myNumber);
            console.log('👉 YOUR PAIRING CODE IS:', code);
        }, 15000);
    }
}, 40000); // කාලය වැඩි කළා (තත්පර 40ක්)
