const {
    createAPIUrl
} = require("../tools/api.js");
const {
    monospace,
    quote
} = require("@mengkodingan/ckptw");
const axios = require("axios");
const mime = require("mime-types");

module.exports = {
    name: "aiimg",
    aliases: ["diff", "diffusion", "sxdl", "stablediffusion"],
    category: "ai",
    code: async (ctx) => {
        const {
            status,
            message
        } = await global.handler(ctx, {
            banned: true,
            coin: 3
        });
        if (status) return ctx.reply(message);

        const input = ctx.args.join(" ") || null;

        if (!input) return ctx.reply(
            `${quote(global.msg.argument)}\n` +
            quote(`Contoh: ${monospace(`${ctx._used.prefix + ctx._used.command} cat`)}`)
        );

        try {
            const apiUrl = createAPIUrl("sanzy", `/api/stablediffusion-sxdl`, {
                prompt: input
            });
            const response = await axios.get(apiUrl, {
                headers: {
                    "User-Agent": global.system.userAgent
                }
            });
            const {
                data
            } = response.data;

            return await ctx.reply({
                image: {
                    url: data.url
                },
                mimetype: mime.contentType("png"),
                caption: `${quote(`Prompt: ${input}`)}\n` +
                    "\n" +
                    global.msg.footer
            });
        } catch (error) {
            console.error("Error:", error);
            if (error.status !== 200) return ctx.reply(global.msg.notFound);
            return ctx.reply(quote(`⚠ Terjadi kesalahan: ${error.message}`));
        }
    }
};