const {
    bold,
    monospace
} = require("@mengkodingan/ckptw");
const axios = require("axios");
const mime = require("mime-types");

module.exports = {
    name: "fetch",
    aliases: ["get"],
    category: "tools",
    code: async (ctx) => {
        const handlerObj = await global.handler(ctx, {
            banned: true,
            coin: 3
        });

        if (handlerObj.status) return ctx.reply(handlerObj.message);

        const url = ctx._args[0];

        if (!url) {
            return ctx.reply(
                `${global.msg.argument}\n` +
                `Contoh: ${monospace(`${ctx._used.prefix + ctx._used.command} https://example.com/`)}`
            );
        }

        try {
            new URL(url);
        } catch {
            return ctx.reply(global.msg.urlInvalid);
        }

        try {
            const response = await fetchWithTimeout(url);
            const contentType = response.headers["content-type"];
            const status = response.status;
            const data = response.data;

            if (contentType) {
                if (contentType.startsWith("image/")) {
                    return ctx.reply({
                        image: {
                            url
                        },
                        mimetype: mime.contentType(contentType),
                        caption: null
                    });
                } else if (contentType === "image/gif") {
                    return ctx.reply({
                        video: {
                            url
                        },
                        mimetype: mime.contentType("gif"),
                        caption: null,
                        gifPlayback: true
                    });
                } else if (contentType.startsWith("video/")) {
                    return ctx.reply({
                        video: {
                            url
                        },
                        mimetype: mime.contentType("mp4"),
                        caption: null,
                        gifPlayback: false
                    });
                } else {
                    return ctx.reply({
                        document: {
                            url
                        },
                        mimetype: mime.contentType(contentType)
                    });
                }
            } else {
                if (isJSON(data)) {
                    return ctx.reply(walkJSON(data));
                } else {
                    return ctx.reply(
                        `➲ Status: ${status}\n` +
                        "➲ Respon:\n" +
                        `${typeof data === "object" ? JSON.stringify(data, null, 2) : data}`
                    );
                }
            }
        } catch (error) {
            return ctx.reply(`${bold("[ ! ]")} Terjadi kesalahan: ${error.message}`);
        }
    }
};

async function fetchWithTimeout(url, options = {
    timeout: 10000
}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout);

    try {
        const response = await axios.get(url, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

function isJSON(data) {
    try {
        JSON.parse(data);
        return true;
    } catch {
        return false;
    }
}

function walkJSON(json, depth = 0, array = []) {
    if (typeof json === 'string') {
        json = JSON.parse(json);
    }

    for (const key in json) {
        array.push("┊".repeat(depth) + (depth > 0 ? " " : "") + `*${key}:*`);
        if (typeof json[key] === "object" && json[key] !== null) {
            walkJSON(json[key], depth + 1, array);
        } else {
            array[array.length - 1] += " " + json[key];
        }
    }
    return array.join("\n");
}