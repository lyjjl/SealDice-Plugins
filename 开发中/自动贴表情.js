// ==UserScript==
// @name         消息自动贴表情(MAEL)
// @author       某人
// @version      1.0.0
// @description  一个自动对指定用户的消息贴表情的差距，支持指定表情id，请勿滥用！！！
// @timestamp    0
// @sealVersion  1.5.0
// @license      MIT
// @homepageURL  https://github.com/lyjjl
// ==/UserScript==

let ext = seal.ext.find("消息自动贴表情");
if (!ext) {

    /**
     * 向 Server 发起请求
     * @param {string} baseurl - 服务器的 URL（会自动标准化）
     * @param {string} apipath - API 的路径
     * @param {object} body - 请求体，将被 JSON.stringify 转换
     * @returns {Promise<object|null>} 请求成功则返回解析后的 JSON 响应数据，失败则返回 null
     */
    async function apiRequest(baseurl, apipath, body, token = null) {

        let Nurl = (baseurl + apipath).replace(/([^:]\/)\/+/g, "$1"); // 理论上 baseurl 应该以/结尾

        try {
            let headers = {
                "Content-type": "application/json; charset=UTF-8"
            }
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            let response = await fetch(
                Nurl,
                {
                    method: "POST",
                    headers: headers,
                    body: JSON.stringify(body),
                    cache: "no-cache",
                    credentials: "same-origin",
                    redirect: "follow",
                    referrerPolicy: "no-referrer"
                }
            );


            let response_data;
            if (!response.ok) {
                response_data = await response.text();
                console.error(`[MAEL.request] HTTP 请求失败，状态码：${response.status}`, response_data);
                return null;
            }

            response_data = await response.json();

            return response_data;

        } catch (error) {
            console.error("[MAEL.request] HTTP 请求失败", error, " API: ", apipath);
            return null;
        }
    }

    ext = seal.ext.new("消息自动贴表情", "某人", "1.0.0");
    seal.ext.register(ext);
    seal.ext.registerOptionConfig(ext, "MAEL.分离端类型", "NapCat", ["NapCat", "LLOnebot/LLTwobot", "Lagrange.Onebot", "Milky"]);
    seal.ext.registerTemplateConfig(ext, "MAEL.表情ID列表", [128046, 127866, 76]);
    seal.ext.registerTemplateConfig(ext, "MAEL.目标用户列表", ["123456"]);
    seal.ext.registerStringConfig(ext, "MAEL.HTTP/WS服务器url", "http://127.0.0.1:3001", "Milky 用户要附加 /api 尾缀");
    seal.ext.registerStringConfig(ext, "MAEL.HTTP/WS服务器token", "", "如果你配置了 Token ，请在这里填写");
    seal.ext.registerBoolConfig(ext, "MAEL.使用WebSocket方式连接", false, "如果你的海豹版本支持插件使用 WebSocket 方式，可以开启此选项");

    let ws, wsIsConnected = false;

    if (seal.ext.getBoolConfig(ext, "MAEL.使用WebSocket方式连接")) {
        ws = new WebSocket(seal.ext.getStringConfig(ext, "MAEL.HTTP/WS服务器url").replace(/([^:]\/)\/+/g, "$1"));
    }

    ws.onopen = () => {
        console.log('[MAEL.WS] 与服务器连接成功');

        const requestBody = JSON.stringify({
            action: 'get_login_info'
        });

        console.log('[MAEL.WS] 正在请求登录信息...');
        ws.send(requestBody);
    }

    ws.onmessage = (event) => {
        const response = JSON.parse(event.data);

        if (!wsIsConnected) {
            console.log(`[MAEL.WS] 登录信息: <${response.data.user_id}>(${response.data.nickname})`);
            wsIsConnected = true;
            console.log('[MAEL.WS] WebSocket 连接已准备好');
        }

        if (response.retcode !== 0) {
            console.error(`[MAEL.WS] 请求失败，错误码：${response.retcode}，信息：${response.msg}`);
            return;
        }

    }

    ext.onNotCommandReceived = async (ctx, msg) => {

        try {

            let targetList = seal.ext.getTemplateConfig(ext, "MAEL.目标用户列表");
            if (targetList.includes(msg.sender.userId.replace(/\D/g, ''))) {
                let QLtype = seal.ext.getOptionConfig(ext, "MAEL.分离端类型");
                let baseurl = seal.ext.getStringConfig(ext, "MAEL.HTTP/WS服务器url");
                let emojList = seal.ext.getTemplateConfig(ext, "MAEL.表情ID列表");
                let token = seal.ext.getStringConfig(ext, "MAEL.HTTP/WS服务器token");

                for (let face_id of emojList) {
                    let api_path, requestBody;
                    switch (QLtype) {
                        case "NapCat":
                            api_path = "/set_msg_emoji_like";
                            requestBody = {
                                "action": "set_msg_emoji_like",
                                "message_id": msg.rawId,
                                "emoji_id": face_id,
                                "set": true
                            }
                            break;

                        case "Lagrange.Onebot":
                            api_path = "/set_group_reaction";
                            requestBody = {
                                "action": "set_group_reaction",
                                "group_id": msg.groupId.replace(/\D/g, ''),
                                "message_id": msg.rawId,
                                "code": face_id,
                                "is_add": true
                            }
                            break;

                        case "LLOnebot/LLTwobot":
                            api_path = "/set_msg_emoji_like";
                            requestBody = {
                                "action": "set_msg_emoji_like",
                                "message_id": msg.rawId,
                                "emoji_id": face_id
                            }
                            break;

                        case "Milky":
                            api_path = "/send_group_message_reaction"
                            requestBody = {
                                "action": "send_group_message_reaction",
                                "group_id": msg.groupId.replace(/\D/g, ''),
                                "message_seq": msg.rawId,
                                "reaction": face_id,
                                "is_add": true
                            }
                            break;

                        default:
                            console.error("[MAEL] 未知的客户端类型:", QLtype);
                            return;
                    }

                    if (seal.ext.getBoolConfig(ext, "MAEL.使用WebSocket方式连接")) {
                        // 使用 WebSocket 方式
                        if (wsIsConnected) {
                            ws.send(JSON.stringify(requestBody));
                        } else {
                            console.error("[MAEL.WS] WebSocket 未连接，无法发送请求");
                        }

                    } else {
                        let response = await apiRequest(
                            baseurl,
                            api_path,
                            requestBody,
                            token
                        )
                    }
                    if (!response) {
                        console.warn(`[MAEL] 表情 ${face_id} 设置失败`);
                    }
                }
            }

        } catch (error) {
            console.error("[MAEL] 处理消息时出错:", error);
        }
    }
}