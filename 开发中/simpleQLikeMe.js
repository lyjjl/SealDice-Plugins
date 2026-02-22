// ==UserScript==
// @name         simpleQLikeMe
// @author       某人
// @version      1.0.1
// @description  个人资料点赞的
// @timestamp    1770915722
// @license      MIT
// @homepageURL  https://github.com/lyjjl
// ==/UserScript==

let ext = seal.ext.find('simpleQLikeMe');
if (!ext) {
    ext = seal.ext.new('simpleQLikeMe', '某人', '1.0.1');
    seal.ext.register(ext);

    seal.ext.registerTemplateConfig(ext, 'cmdW', ['!:赞我'], '触发指令 ');
    seal.ext.registerBoolConfig(ext, 'useWs', false, '使用websocket');
    seal.ext.registerStringConfig(ext, 'baseUrl', 'http://127.0.0.1:3000', 'onebot服务器地址');
    seal.ext.registerStringConfig(ext, 'token', '', '服务器token，没有留空');
    seal.ext.registerIntConfig(ext, 'times', 10, '默认点赞次数');

    function buildCon(ext) {
        let baseUrl = seal.ext.getStringConfig(ext, 'baseUrl');
        let useWs = seal.ext.getBoolConfig(ext, 'useWs');
        let token = seal.ext.getStringConfig(ext, 'token');

        let url = baseUrl.replace(/\/$/, "");

        if (useWs) {
            url = url.replace(/^http/, "ws");
            if (token) {
                url += `?access_token=${token}`;
            }
        }

        if (url.endsWith('/')) {
            url = url.slice(0, -1);
        }

        return [url, token];
    }

    async function apiRequest(baseUrl = "", action = "", body = {}, token = "") {
        if (baseUrl.startsWith("ws")) {
            return new Promise((resolve) => {
                const ws = new WebSocket(baseUrl);
                ws.onopen = () => {
                    ws.send(JSON.stringify({
                        action: action,
                        params: body,
                        echo: "seal_echo"
                    }));
                };
                ws.onmessage = (e) => {
                    let data = JSON.parse(e.data);
                    ws.close();
                    resolve(data);
                };
                ws.onerror = (err) => {
                    console.error("WS错误:", err);
                    resolve(null);
                };
            });
        }

        let nUrl = baseUrl + "/" + action;
        let headers = {
            "Content-type": "application/json; charset=UTF-8"
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            let response = await fetch(nUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                let response_data = await response.text();
                console.error(`HTTP 请求失败，状态码：${response.status}`, response_data);
                return null;
            } else {
                return await response.json();
            }
        } catch (error) {
            console.error('HTTP 请求失败', error, " API: ", action);
            return null;
        }
    }

    ext.onNotCommandReceived = (ctx, msg) => {
        if (seal.ext.getTemplateConfig(ext, 'cmdW').includes(msg.message)) {
            let targetUID = msg.sender.userId.replace(/\D/g, "");
            let setTimes = seal.ext.getIntConfig(ext, 'times');

            (async (targetUID, ext, ctx, msg) => {
                try {
                    console.log("正在处理用户 ID:", targetUID);

                    let action = 'send_like';
                    let body = {
                        user_id: targetUID,
                        times: setTimes
                    }

                    let [url, token] = buildCon(ext);

                    let res = await apiRequest(url, action, body, token);

                    if (res && res.status === "failed") {
                        let reason = res.wording || res.message || "未知原因";
                        seal.replyToSender(ctx, msg, `点赞失败：${reason}`);
                    } else if (res && res.status === "ok") {
                        seal.replyToSender(ctx, msg, `已成功为 ${targetUID} 点了 ${setTimes} 个赞！`);
                    } else {
                        seal.replyToSender(ctx, msg, `点赞请求发送失败，请检查后端连接`);
                    }

                } catch (err) {
                    console.error("异步处理中出错:", err);
                    seal.replyToSender(ctx, msg, "点赞插件运行出错，请查看日志");
                }
            })(targetUID, ext, ctx, msg);
        }
    }
}