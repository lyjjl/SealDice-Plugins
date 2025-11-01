// ==UserScript==
// @name         websocketLogger
// @author       某人
// @version      1.0.0
// @description  记录 WS 消息
// @timestamp    0
// @license      MIT
// @homepageURL  https://github.com/lyjjl
// ==/UserScript==

let ext = seal.ext.find('websocketLogger');
if (!ext) {
    ext = seal.ext.new('websocketLogger', '某人', '1.0.0');
    seal.ext.register(ext);

    seal.ext.registerStringConfig(ext, "wsUrl", "ws://127.0.0.1:13002");
    seal.ext.registerStringConfig(ext, "wsToken", "");

    let ws;

    ws = new WebSocket(seal.ext.getStringConfig(ext, "wsUrl") + "/?token=" + seal.ext.getStringConfig(ext, "wsToken"));

    ws.onopen = (event) => {
        console.log("[WSL@Connect:Info] Connected!");
        if (event.data.post_type != "meta_event" || event.data.sub_type != "connect"){
            console.warn("[WSL@Connect:Warn] May NOT connect to NapCat Websocket Server");
        }
    }

    ws.onmessage = (event) => {
        console.log("[WSL@Msg:Info] Server Message:", event.data);
    }
}