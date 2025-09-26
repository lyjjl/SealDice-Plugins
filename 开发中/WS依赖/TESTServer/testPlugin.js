// ==UserScript==
// @name         WS调试插件
// @author       某人
// @version      1.0.0
// @description  0
// @timestamp    0
// @license      MIT
// @homepageURL  https://github.com/
// ==/UserScript==

let ext = seal.ext.find('WS_debuger');
if (!ext) {

    let wsc;

    ext = seal.ext.new('WS_debuger', '某人', '1.0.0');
    seal.ext.register(ext);
    
    wsc = new WebSocket('ws://localhost:8765');

    wsc.onopen = () => {
        console.log(`已成功连接到服务器 time: ${Date.now()}`);
        wsc.send("hello, Server!");
        wsc.send(`connect at: ${Date.now()}`)
    };

    wsc.onmessage = (event) => {
        console.log( `收到来自服务器的消息: ${event.data}`);
    };

    wsc.onclose = (event) => {
        console.log(`连接已关闭，代码: ${event.code}, 原因: ${event.reason}`);
    };

    wsc.onerror = (error) => {
        console.error("WebSocket 连接发生错误:", error);
        reject(error);
    };

    const cmdSend = seal.ext.newCmdItemInfo();
    cmdSend.name = 'sws';

    cmdSend.solve = (ctx, msg, cmdArgs) => {

        wsc.send(JSON.stringify(cmdArgs.getArgN(1)));

    };

    // 将命令注册到扩展中
    ext.cmdMap['sws'] = cmdSend;

    
}