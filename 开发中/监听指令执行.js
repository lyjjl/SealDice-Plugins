// ==UserScript==
// @name         监听指令执行事件示例
// @author       某人
// @version      1.0.0
// @description  使用
// @timestamp    
// @license      MIT
// @homepageURL  https://github.com/
// ==/UserScript==

// Warning: TEST VER. 请勿在非测试环境加载该插件

let ext = seal.ext.find('');

let count;

if (!ext) {
    ext = seal.ext.new('监听指令执行事件示例', '某人', '1.0.0');

    const cmdCHShow = seal.ext.newCmdItemInfo();
    cmdCHShow.name = 'chshow';
    cmdCHShow.help = 'chshow: 显示上次 chshow 至今的指令执行次数和简要信息';

    cmdCHShow.solve = (ctx, msg, cmdArgs) => {
        seal.replyToSender(ctx, msg, count);
        count = 0;
    };

    ext.onCommandReceived = (ctx, msg) => {
        let message = msg.message;
        let time = new Date;
        seal.replyToSender(ctx, msg, `Time:${time}\nMessage:${message}`);
        count + 1;
    }

    // 将命令注册到扩展中
    ext.cmdMap['chshow'] = cmdCHShow;

    seal.ext.register(ext);
}