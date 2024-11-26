const {
    quote
} = require("@mengkodingan/ckptw");

module.exports = {
    name: "donate",
    aliases: ["donasi"],
    category: "information",
    handler: {},
    code: async (ctx) => {
        const status = await handler(ctx, module.exports.handler);
        if (status) return;

        return await ctx.reply(
            `${quote("085876902820 (DANA)")}\n` +
            `${quote("─────")}\n` +
            `${quote("https://saweria.co/Fahrilgg (Saweria)")}\n` +
            "\n" +
            config.msg.footer
        );
    }
};
