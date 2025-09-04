// ==UserScript==
// @name         消息自动贴表情(MAEL)
// @author       某人
// @version      1.0.0
// @description  一个自动对指定用户的消息贴表情的差距，支持指定表情id，请勿滥用！！！
// @timestamp    
// @sealVersion  1.4.6
// @license      MIT
// @homepageURL  https://github.com/
// ==/UserScript==

let ext = seal.ext.find("消息自动贴表情");
if (!ext) {

    /**
     * 向 HTTP Server 发起 POST 请求
     * @param {string} baseurl - HTTP 服务器的 URL（会自动标准化）
     * @param {string} apipath - API 的路径
     * @param {object} body - 请求体，将被 JSON.stringify 转换
     * @returns {Promise<object|null>} 请求成功则返回解析后的 JSON 响应数据，失败则返回 null
     */
    async function apiRequest(baseurl, apipath, body) {
        function T_normalizeURL(url) {
            // 移除重复的斜杠，但保留 :// 部分
            return url.replace(/([^:]\/)\/+/g, "$1");
        }
        let Nurl = T_normalizeURL(baseurl + apipath); // 理论上 baseurl 应该以/结尾，不过没关系，会标准化的

        try {
            let response = await fetch(
                Nurl,
                {
                    method: "POST",
                    headers: {
                        "Content-type": "application/json; charset=UTF-8"
                    },
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

            // 如果状态码是 2xx，尝试解析 JSON
            response_data = await response.json();

            console.info("[MAEL.request] HTTP 请求成功：", apipath);
            // console.info(JSON.stringify(response_data)); // 为了控制台输出更清晰，再次序列化  这里在正式使用时要注释  log 出来一堆不太好（）
            return response_data;

        } catch (error) {
            // 捕获所有其他可能的错误
            console.error("[MAEL.request] HTTP 请求失败", error, " API: ", apipath);
            return null;
        }
    }

    ext = seal.ext.new("消息自动贴表情", "某人", "1.0.0");
    seal.ext.register(ext);
    seal.ext.registerOptionConfig(ext, "MAEL.分离端类型", "NapCat", ["NapCat", "LLOnebot/LLTwobot", "Lagrange", "Milky"]);
    seal.ext.registerTemplateConfig(ext, "MAEL.表情ID列表", [128046, 127866, 76]);
    seal.ext.registerTemplateConfig(ext, "MAEL.目标用户列表", ["123456"]);
    seal.ext.registerStringConfig(ext, "MAEL.HTTP服务器url", "http://127.0.0.1:3001", "Milky 用户请不要附加 /api 尾缀");
    

    ext.onNotCommandReceived = async (ctx, msg) => {

        try {

            let targetList = seal.ext.getTemplateConfig(ext, "MAEL.目标用户列表");
            if (targetList.includes(msg.sender.userId.replace(/\D/g, ''))) {
                let QLtype = seal.ext.getOptionConfig(ext, "MAEL.分离端类型");
                let baseurl = seal.ext.getStringConfig(ext, "MAEL.HTTP服务器url");
                let emojList = seal.ext.getTemplateConfig(ext, "MAEL.表情ID列表");


                for (let face_id of emojList) {
                    let api_path, requestBody;
                    switch (QLtype) {
                        case "NapCat":
                            api_path = "/set_msg_emoji_like";
                            requestBody = {
                                "message_id": msg.rawId,
                                "emoji_id": face_id,
                                "set": true
                            }
                            break;

                        case "Lagrange":
                            api_path = "/set_group_reaction";
                            requestBody = {
                                "group_id": msg.groupId.replace(/\D/g, ''),
                                "message_id": msg.rawId,
                                "code": face_id,
                                "is_add": true
                            }
                            break;

                        case "LLOnebot/LLTwobot":
                            api_path = "/set_msg_emoji_like";
                            requestBody = {
                                "message_id": msg.rawId,
                                "emoji_id": face_id
                            }
                            break;

                        case "Milky":
                            api_path = "/api/send_group_message_reaction"
                            requestBody = {
                                "group_id": msg.groupId.replace(/\D/g, ''),
                                "message_seq": msg.rawId,
                                "reaction": face_id,
                                "is_add": true
                            }
                        default:
                            console.error("[MAEL] 未知的客户端类型:", QLtype);
                            return;
                    }

                    let response = await apiRequest(
                        baseurl,
                        api_path,
                        requestBody
                    )
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