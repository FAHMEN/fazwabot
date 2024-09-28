// Modul dan dependensi yang diperlukan.
const {
    Client,
    CommandHandler,
    monospace,
    quote
} = require("@mengkodingan/ckptw");
const {
    Events,
    MessageType
} = require("@mengkodingan/ckptw/lib/Constant");
const {
    S_WHATSAPP_NET
} = require("@whiskeysockets/baileys");
const {
    exec
} = require("child_process");
const didyoumean = require("didyoumean");
const path = require("path");
const {
    inspect
} = require("util");

// Pesan koneksi.
console.log(`[${global.config.pkg.name}] Connecting...`);

// Buat instance bot baru.
const bot = new Client({
    WAVersion: [2, 3000, 1015901307],
    phoneNumber: global.config.bot.phoneNumber,
    prefix: global.config.bot.prefix,
    readIncommingMsg: global.config.system.autoRead,
    printQRInTerminal: !global.config.system.usePairingCode,
    selfReply: global.config.system.selfReply,
    usePairingCode: global.config.system.usePairingCode
});

// Penanganan acara saat bot siap.
bot.ev.once(Events.ClientReady, async (m, ctx) => {
    console.log(`[${global.config.pkg.name}] Ready at ${m.user.id}`);

    // Tetapkan global.config pada bot.
    global.config.bot.number = m.user.id.replace(/@.*|:.*/g, "");
    global.config.bot.id = m.user.id.replace(/@.*|:.*/g, "") + S_WHATSAPP_NET;
    global.config.bot.readyAt = bot.readyAt;

    // Memulai manajemen energi ketika bot siap.
    startEnergyManagement(ctx);
});

// Buat penangan perintah dan muat perintah.
const cmd = new CommandHandler(bot, path.resolve(__dirname, "commands"));
cmd.load();

// Apakah manajemen energi sudah dimulai? (Belum)
let energyManagementStarted = false;

// Penanganan event ketika pesan muncul.
bot.ev.on(Events.MessagesUpsert, async (m, ctx) => {
    const isGroup = ctx.isGroup();
    const isPrivate = !isGroup;
    const senderJid = ctx.sender.jid;
    const senderNumber = senderJid.replace(/@.*|:.*/g, "");
    const groupJid = isGroup ? m.key.remoteJid : null;
    const groupNumber = isGroup ? groupJid.split("@")[0] : null;

    // Mulai manajemen energi hanya sekali, saat pesan pertama muncul.
    if (!energyManagementStarted) {
        startEnergyManagement(ctx);
        energyManagementStarted = true; // Apakah manajemen energi sudah dimulai? (Sudah)
    }

    // Log pesan masuk.
    if (isGroup) {
        console.log(`[${global.config.pkg.name}] Incoming message from group: ${groupNumber}, by: ${senderNumber}`);
    } else {
        console.log(`[${global.config.pkg.name}] Incoming message from: ${senderNumber}`);
    }

    // Basis data untuk pengguna.
    const userDb = await global.db.get(`user.${senderNumber}`);
    if (!userDb) {
        await global.db.set(`user.${senderNumber}`, {
            energy: 100
        });
    }

    // Simulasi pengetikan otomatis untuk perintah.
    if (global.tools.general.isCmd(m, ctx)) ctx.simulateTyping();

    // "Did you mean?" untuk perintah salah ketik.
    const prefixRegex = new RegExp(ctx._config.prefix, "i");
    const content = m.content && m.content.trim();
    if (prefixRegex.test(content)) {
        const prefix = content.charAt(0);

        const [cmdName] = content.slice(1).trim().toLowerCase().split(/\s+/);
        const cmd = ctx._config.cmd;
        const listCmd = Array.from(cmd.values()).flatMap(command => {
            const aliases = Array.isArray(command.aliases) ? command.aliases : [];
            return [command.name, ...aliases];
        });

        const mean = didyoumean(cmdName, listCmd);

        if (mean && mean !== cmdName) await ctx.reply(quote(`❓ Apakah maksud Anda ${monospace(prefix + mean)}?`));
    }

    // Penanganan AFK: Pengguna yang disebutkan.
    const mentionJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (mentionJids && mentionJids.length > 0) {
        for (const mentionJid of mentionJids) {
            const getAFKMention = global.db.get(`user.${mentionJid.split("@")[0]}.afk`);
            if (getAFKMention) {
                const [reason, timeStamp] = await Promise.all([
                    global.db.get(`user.${mentionJid.split("@")[0]}.afk.reason`),
                    global.db.get(`user.${mentionJid.split("@")[0]}.afk.timeStamp`)
                ]);
                const timeAgo = global.tools.general.convertMsToDuration(Date.now() - timeStamp);

                await ctx.reply(quote(`📴 Dia AFK dengan alasan ${reason} selama ${timeAgo || "kurang dari satu detik."}.`));
            }
        }
    }

    // Penanganan AFK : Berangkat dari AFK.
    const getAFKMessage = await global.db.get(`user.${senderNumber}.afk`);
    if (getAFKMessage) {
        const [reason, timeStamp] = await Promise.all([
            global.db.get(`user.${senderNumber}.afk.reason`),
            global.db.get(`user.${senderNumber}.afk.timeStamp`)
        ]);
        const timeAgo = global.tools.general.convertMsToDuration(Date.now() - timeStamp);
        await global.db.delete(`user.${senderNumber}.afk`);

        await ctx.reply(quote(`📴 Anda mengakhiri AFK dengan alasan ${reason} selama ${timeAgo || "kurang dari satu detik."}.`));
    }

    // Perintah khusus pemilik.
    if (global.tools.general.isOwner(ctx, senderNumber, true)) {
        // Perintah eval: Jalankan kode JavaScript.
        if (m.content && m.content.startsWith && (m.content.startsWith("=>> ") || m.content.startsWith("=> "))) {
            const code = m.content.startsWith("=>> ") ? m.content.slice(4) : m.content.slice(3);

            try {
                const result = await eval(m.content.startsWith("=>> ") ? `(async () => { ${code} })()` : code);

                await ctx.reply(inspect(result));
            } catch (error) {
                console.error(`[${global.config.pkg.name}] Error:`, error);
                await ctx.reply(quote(`❎ Terjadi kesalahan: ${error.message}`));
            }
        }

        // Perintah Exec: Jalankan perintah shell.
        if (m.content && m.content.startsWith && m.content.startsWith("$ ")) {
            const command = m.content.slice(2);

            try {
                const output = await new Promise((resolve, reject) => {
                    exec(command, (error, stdout, stderr) => {
                        if (error) {
                            reject(new Error(`Error: ${error.message}`));
                        } else if (stderr) {
                            reject(new Error(stderr));
                        } else {
                            resolve(stdout);
                        }
                    });
                });

                await ctx.reply(output);
            } catch (error) {
                console.error(`[${global.config.pkg.name}] Error:`, error);
                await ctx.reply(quote(`❎ Terjadi kesalahan: ${error.message}`));
            }
        }
    }

    // Grup.
    if (isGroup) {
        // Penanganan antilink.
        const getAntilink = await global.db.get(`group.${groupNumber}.antilink`);
        const urlRegex = /[(http(s)?):\/\/(www\.)?a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/i;
        if (getAntilink) {
            if (m.content && urlRegex.test(m.content)) {
                if (await global.tools.general.isAdmin(ctx, senderNumber)) return;

                await ctx.reply(quote(`❎ Jangan kirim tautan!`));
                if (!global.config.system.restrict) await ctx.deleteMessage(m.key);
            }
        }
    }

    // Pribadi.
    if (isPrivate) {
        // Penanganan menfess.
        const getMessageDataMenfess = await global.db.get(`menfess.${senderNumber}`);
        if (getMessageDataMenfess) {
            const [from, text] = await Promise.all([
                global.db.get(`menfess.${senderNumber}.from`),
                global.db.get(`menfess.${senderNumber}.text`)
            ]);

            if (ctx.quoted?.extendedTextMessage?.text === text) {
                try {
                    await sendMenfess(ctx, m, senderNumber, from);

                    await ctx.reply(quote(`✅ Pesan berhasil terkirim!`));
                } catch (error) {
                    console.error(`[${global.config.pkg.name}] Error:`, error);
                    await ctx.reply(quote(`❎ Terjadi kesalahan: ${error.message}`));
                }
            }
        }
    }
});

// Penanganan peristiwa ketika pengguna bergabung atau keluar dari grup.
bot.ev.on(Events.UserJoin, (m) => {
    m.eventsType = "UserJoin";
    handleUserEvent(m);
});

bot.ev.on(Events.UserLeave, (m) => {
    m.eventsType = "UserLeave";
    handleUserEvent(m);
});

// Luncurkan bot.
bot.launch().catch((error) => console.error(`[${global.config.pkg.name}] Error:`, error));

// Fungsi utilitas.
async function sendMenfess(ctx, m, senderNumber, from) {
    const fakeText = {
        key: {
            fromMe: false,
            participant: senderNumber + S_WHATSAPP_NET,
            ...({
                remoteJid: "status@broadcast"
            })
        },
        message: {
            extendedTextMessage: {
                text: `${senderNumber} telah merespons pesan menfess Anda.`,
                title: global.config.bot.name,
                thumbnailUrl: global.config.bot.picture.thumbnail

            }
        }
    }

    await ctx.sendMessage(
        from + S_WHATSAPP_NET, {
            text: `${m.content}\n` +
                `${global.config.msg.readmore}\n` +
                "Jika ingin membalas, Anda harus mengirimkan perintah lagi.",
            contextInfo: {
                mentionedJid: [senderNumber + S_WHATSAPP_NET],
                externalAdReply: {
                    mediaType: 1,
                    previewType: 0,
                    mediaUrl: global.config.bot.groupChat,
                    title: global.config.msg.watermark,
                    body: null,
                    renderLargerThumbnail: true,
                    thumbnailUrl: global.config.bot.picture.thumbnail,
                    sourceUrl: global.config.bot.groupChat
                },
                forwardingScore: 9999,
                isForwarded: true
            },
            mentions: [senderNumber + S_WHATSAPP_NET]
        }, {
            quoted: fakeText
        }
    );
}

async function handleUserEvent(m) {
    const {
        id,
        participants
    } = m;

    try {
        const getWelcome = await global.db.get(`group.${id.split("@")[0]}.welcome`);
        if (getWelcome) {
            const metadata = await bot.core.groupMetadata(id);

            for (const jid of participants) {
                let profilePictureUrl;
                try {
                    profilePictureUrl = await bot.core.profilePictureUrl(jid, "image");
                } catch (error) {
                    profilePictureUrl = global.config.bot.picture.profile;
                }

                const message = m.eventsType === "UserJoin" ?
                    quote(`👋 Selamat datang @${jid.split("@")[0]} di grup ${metadata.subject}!`) :
                    quote(`👋 @${jid.split("@")[0]} keluar dari grup ${metadata.subject}.`);
                const card = global.tools.api.createUrl("aggelos_007", "/welcomecard", {
                    text1: jid.split("@")[0],
                    text2: m.eventsType === "UserJoin" ? "Selamat datang" : "Selamat tinggal!",
                    text3: metadata.subject,
                    avatar: profilePictureUrl,
                    background: global.config.bot.picture.thumbnail
                });

                await bot.core.sendMessage(id, {
                    text: message,
                    contextInfo: {
                        mentionedJid: [jid],
                        externalAdReply: {
                            mediaType: 1,
                            previewType: 0,
                            mediaUrl: global.config.bot.groupChat,
                            title: m.eventsType === "UserJoin" ? "JOIN" : "LEAVE",
                            body: null,
                            renderLargerThumbnail: true,
                            thumbnailUrl: card || profilePictureUrl || global.config.bot.picture.thumbnail,
                            sourceUrl: global.config.bot.groupChat
                        }
                    }
                });
            }
        }
    } catch (error) {
        console.error(`[${global.config.pkg.name}] Error:`, error);
        await bot.core.sendMessage(id, {
            text: quote(`❎ Terjadi kesalahan: ${error.message}`)
        });
    }
}

async function manageEnergy(ctx) {
    const users = await global.db.get("user") || {};
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    let validUsersCount = 0;
    let index = 0;

    for (const userNumber of Object.keys(users)) {
        const userPath = `user.${userNumber}`;

        const [isOwner, isPremium] = await Promise.all([
            global.tools.general.isOwner(ctx, userNumber, true),
            global.db.get(`${userPath}.isPremium`) || false
        ]);

        const energyStored = await global.db.get(`${userPath}.energy`) || 0;

        if ((isOwner || isPremium) && energyStored < 100) {
            validUsersCount++;
        } else if (!isOwner && !isPremium) {
            const onCharger = await global.db.get(`${userPath}.onCharger`) || false;
            if (onCharger || energyStored < 15) {
                validUsersCount++;
            }
        }
    }

    const calculateDelay = (index) => {
        const minDelay = 1000; // 1 detik.
        const maxDelay = 10000; // 10 detik.

        // Semakin banyak user, semakin panjang delay secara proporsional.
        const delayRange = maxDelay - minDelay;
        return minDelay + Math.floor((index / validUsersCount) * delayRange);
    };

    for (const userNumber of Object.keys(users)) {
        try {
            const userPath = `user.${userNumber}`;

            const [isOwner, isPremium] = await Promise.all([
                global.tools.general.isOwner(ctx, userNumber, true),
                global.db.get(`${userPath}.isPremium`) || false
            ]);

            let energy = await global.db.get(`${userPath}.energy`) || 0;

            if ((isOwner || isPremium) && energy < 100) {
                energy = 100;
                await global.db.set(`${userPath}.energy`, 100);
                continue;
            }

            const [onCharger] = await Promise.all([
                global.db.get(`${userPath}.onCharger`) || false,
            ]);

            if (onCharger) {
                energy = Math.min(energy + 25, 100);

                if (energy === 100) {
                    const fullEnergyDelay = calculateDelay(index++);
                    await delay(fullEnergyDelay);

                    await bot.core.sendMessage(userNumber + S_WHATSAPP_NET, {
                        text: quote(`⚡ Energi kamu sudah penuh!`)
                    });

                    await global.db.set(`${userPath}.onCharger`, false);
                }
            }

            if (energy < 15) {
                const lowEnergyDelay = calculateDelay(index++);
                await delay(lowEnergyDelay);

                await bot.core.sendMessage(userNumber + S_WHATSAPP_NET, {
                    text: quote(`⚡ Energimu rendah! Silakan isi daya dengan mengetik ${monospace("/charger")}.`)
                });
            }

            if (energy !== (await global.db.get(`${userPath}.energy`))) {
                await global.db.set(`${userPath}.energy`, energy);
            }

        } catch (error) {
            console.error(`[${global.config.pkg.name}] Error:`, error);
        }
    }
}

function startEnergyManagement(ctx) {
    setInterval(() => manageEnergy(ctx), 900000); // 15 menit.
}