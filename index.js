const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 1. මෙතනට ඔයාගේ Gemini API Key එක අනිවාර්යයෙන්ම දාන්න
const genAI = new GoogleGenerativeAI("AIzaSyAGJVzVTcFOmr_U00xMl9RrKTyMvo98Zo4");

const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "ඔයාගේ නම සරත් (නැත්නම් ඉසුරු). ඔයා අවුරුදු 19ක කොල්ලෙක්. ඔයා Engineering Technology (ET) stream එකෙන් A/L කරන ශිෂ්‍යයෙක්. ඔයා ගොඩක් සුහද මනුස්සයෙක් වගේ සිංහලෙන් චැට් කරන්න ඕනේ. හෙළකුරු හෝ ඉංග්‍රීසි අකුරෙන් සිංහල (Singlish) පාවිච්චි කළත් කමක් නැහැ. කෙටි වාක්‍ය පාවිච්චි කරන්න. යාළුවොත් එක්ක කතා කරනවා වගේ 'මචං', 'එළ', 'මොකද වෙන්නේ' වගේ වචන පාවිච්චි කරන්න. කවුරුහරි තමන්ව හඳුන්වා දුන්නොත් ඒක මතක තබාගෙන පස්සේ කතා කරද්දී ඒ නම පාවිච්චි කරන්න. ගොඩක් සතුටුයි නම් [STICKER] කියලා මැසේජ් එක අගට දාන්න."
});

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-extensions'
        ],
    },
    // "Could not link device" error එක නැති කිරීමට මෙය උපකාරී වේ
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    }
});

// QR Code එක පෙන්වීම
client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
    console.log('WhatsApp එකෙන් Scan කරන්න:');
});

// බොට් සූදානම් වූ පසු
client.on('ready', () => {
    console.log('බොට් දැන් වැඩ! මැසේජ් එකක් දාලා බලන්න.');
});

// මැසේජ් එකක් ලැබුණු විට ක්‍රියාත්මක වන කොටස
client.on('message', async msg => {
    try {
        // Gemini AI එකෙන් පිළිතුර ලබා ගැනීම
        const result = await model.generateContent(`පරිශීලකයා: ${msg.body}`);
        const response = await result.response;
        let replyText = response.text();

        // Sticker එකක් යැවීමට අවශ්‍ය දැයි බැලීම
        if (replyText.includes("[STICKER]")) {
            replyText = replyText.replace("[STICKER]", "");
            await msg.reply(replyText);
            // සැබෑ ස්ටිකර් එකක් යවන විදිහ අපි පස්සේ හදමු
        } else {
            await msg.reply(replyText);
        }

    } catch (error) {
        console.error("වැරැද්දක් වුණා:", error);
    }
});

client.initialize();