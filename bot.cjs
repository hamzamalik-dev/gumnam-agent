const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('./lib/index.js');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const userWarnings = {};

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        auth: state
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('Scan this QR code:');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log('Connection closed, reconnecting...', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('WhatsApp Connected Successfully!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text;
        const senderID = msg.key.remoteJid;
        const participantID = msg.key.participant || senderID;
        const fromMe = msg.key.fromMe;
        const pushName = msg.pushName || "User";

        if (!messageContent) return;
        const text = messageContent.toLowerCase();

        let replyText = "";
        let isGroup = senderID.endsWith('@g.us');

        // Owner / Boss Commands & Manual Remove Feature
        if (fromMe || senderID.includes('923039354643') || senderID.includes('lid')) {
            if (text.startsWith('/remove')) {
                const mentionedJids = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                const quotedParticipant = msg.message.extendedTextMessage?.contextInfo?.participant;
                
                let targetUser = mentionedJids[0] || quotedParticipant;
                
                if (targetUser && isGroup) {
                    try {
                        await sock.groupParticipantsUpdate(senderID, [targetUser], "remove");
                        replyText = `🚫 Boss ke hukum par user ko group se remove kar diya gaya hai!`;
                    } catch (err) {
                        replyText = `⚠️ Error: Bot ke pas admin rights hone chahiye remove karne ke liye!`;
                    }
                } else {
                    replyText = `⚠️ Jis user ko remove karna hai usay tag karein (e.g., /remove @user) ya uske message par reply karein.`;
                }
            } 
            else if (text === '/rules') {
                replyText = `📜 *GUMNAM AGENT RULES*\n\n1. Gaali mana hai\n2. Link/Spam mana hai\n3. Girls ki izzat laazmi\n4. Hate speech mana hai\n5. Admin final hai`;
            } 
            else if (text === '/help' || text === 'help') {
                replyText = `🛠️ *Gumnam Agent Master Menu:*\n- /rules : Rules check karne ke liye\n- /help : Commands list\n- /remove @user : Kisi user ko kick karne ke liye`;
            }
        }

        // Group Moderation for Members
        if (!replyText && !fromMe) {
            if (text.includes('http') || text.includes('www') || text.includes('.com') || text.includes('t.me')) {
                if (!userWarnings[participantID]) {
                    userWarnings[participantID] = 1;
                } else {
                    userWarnings[participantID] += 1;
                }

                let currentWarnings = userWarnings[participantID];

                if (currentWarnings === 1) {
                    replyText = `⚠️ @${pushName} Bhai group mein Link/Spam allow nahi hai! Yeh aapki **1st Warning** hai.`;
                } 
                else if (currentWarnings >= 2) {
                    replyText = `🚫 @${pushName} Rule todne par aapko group se remove kiya ja raha hai.`;
                    if (isGroup) {
                        try {
                            await sock.groupParticipantsUpdate(senderID, [participantID], "remove");
                        } catch (err) {
                            console.error("Admin error:", err);
                        }
                    }
                    userWarnings[participantID] = 0;
                }
            }
            else if (text === '/rules' || text === '/rule') {
                replyText = `📜 *GUMNAM AGENT RULES*\n\n1. Gaali mana hai\n2. Link/Spam mana hai\n3. Girls ki izzat laazmi\n4. Hate speech mana hai\n5. Admin final hai`;
            }
            else if (text === '/help' || text === 'help') {
                replyText = `🛠️ *Gumnam Agent Commands:*\n- /rules : Rules check karne ke liye\n- /help : Commands list`;
            }
            else if (text.includes('sanga ye') || text.includes('kha ye') || text.jenis?.includes('rora') || text.includes('salaam') || text.includes('manana') || text.includes('kha yam')) {
                replyText = `Kha yam rora! Gumnam hazir de 😎 waya sa khidmat de?`;
            }
        }

        if (replyText) {
            await sock.sendMessage(senderID, { 
                text: replyText, 
                mentions: [participantID] 
            });
        }
    });
}

connectToWhatsApp();