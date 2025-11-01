// ==UserScript==
// @name         fGetMsg
// @author       某人
// @version      1.0.0
// @description  模仿 Lagrange 群里面的取消息 Bot 但是鄙人不会 只能写丐版了
// @timestamp    0
// @license      MIT
// @homepageURL  https://github.com/
// ==/UserScript==

/**
 * 标准化 URL 中的斜杠，将多个斜杠替换为单个斜杠，并移除换行符
 * 同时验证 URL 格式是否正确，只允许 http 和 https 协议
 * @param {string} str - 需要标准化的 URL 字符串
 * @returns {string|null} 标准化后的 URL 字符串，如果格式不正确则返回 null
 */
function normalizeUR(str) {
    str = str.replace(/\n/g, '').trim();

    if (!str) {
        console.error("[url 标准化]：空地址！请检查配置并重载插件！");
        return null;
    }

    const urlRegex = /^https?:\/\/[\-A-Za-z0-9+&@#\/%?=~_|!:,.;]*[\-A-Za-z0-9+&@#\/%=~_|]$/i;
    if (!urlRegex.test(str)) {
        console.error("[url 标准化]：地址异常！请检查配置并重载插件！");
        return null;
    }

    str = str.replace(/([^:])(\/\/+)/g, '$1/');
    // 确保 URL 以斜杠结尾
    if (str.match(/^https?:\/\/[^\/]+$/)) {
        str += '/';
        console.info("[url 标准化]：已经自动在尾部添加'/'");
    }

    return str;
}

/**
 * 向 NapCat API 发起 POST 请求
 * @param {string} baseurl - HTTP 服务器的 URL
 * @param {string} apipath - API 的路径
 * @param {object} body - 请求体，将被 JSON.stringify 转换
 * @returns {Promise<object|null>} 请求成功则返回解析后的 JSON 响应数据，失败则返回 null
 */
async function apiRequest(baseurl, apipath, body) {
    let Nurl = normalizeUR(baseurl + apipath);

    try {
        if (!Nurl) return null;

        let response = await fetch(Nurl, {
            method: 'POST',
            headers: {
                "Content-type": "application/json; charset=UTF-8"
            },
            body: JSON.stringify(body),
            cache: "no-cache",
            credentials: "same-origin",
            redirect: "follow",
            referrerPolicy: "no-referrer"
        });

        if (!response.ok) {
            let response_data = await response.text();
            console.error(`HTTP 请求失败，状态码：${response.status}`, response_data);
            return null;
        }

        let response_data = await response.json();
        console.info("HTTP 请求成功：", apipath);
        return response_data;

    } catch (error) {
        console.error('HTTP 请求失败', error, " API: ", apipath);
        return null;
    }
}

/**
 * 从消息中匹配并提取回复 ID 和关键词
 * @param {string} message - 待匹配的完整消息字符串
 * @param {Array<string>} keywords - 包含关键词的数组
 * @returns {string|null} 匹配到的 ID 字符串，如果没有匹配则返回 null
 */
function getReplyIdAndCheckKeyword(message, keywords) {
    let debug = seal.ext.getBoolConfig(ext, "debug");
    if (debug) console.log("[匹配] 开始匹配待匹配消息：", message);
    if (debug) console.log("[匹配] 关键词列表：", keywords);

    const keywordRegex = keywords.map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    if (debug) console.log("[匹配] 生成的关键词正则片段：", keywordRegex);

    const regex = new RegExp(`\[CQ:reply,id=(\d+)](?:${keywordRegex})`, 'i');
    if (debug) console.log("[匹配] 最终的正则表达式：", regex);

    const match = message.match(regex);
    if (debug) console.log("[匹配] `message.match()` 结果：", match);

    if (match) {
        if (debug) console.log("[匹配] 匹配成功，提取的 ID 是：", match[1]);
        return match[1];
    } else {
        if (debug) console.log("[匹配] 未匹配到任何内容");
    }

    return null;
}

/**
 * 发送请求获取被回复的消息，并回复给用户
 * @param {number} msgId_this - 被回复消息的ID
 * @returns {Promise<object|null>} 返回API响应数据，失败则返回null
 */
async function getQuoteMsgId(msgId_this) {
    let apiUrl = seal.ext.getStringConfig(ext, "apiUrl");
    let token = seal.ext.getStringConfig(ext, "token");

    console.log("发送请求....");
    const response = await apiRequest(
        apiUrl,
        "/get_msg",
        {
            "token": token,
            "message_id": msgId_this
        }
    );

    if (!response || response.status !== 'ok') {
        console.error("API 请求失败或返回错误状态");
        return null;
    }
    
    console.log("请求返回：", JSON.stringify(response));
    return response;
}

let ext = seal.ext.find('fGetMsg');
if (!ext) {
    ext = seal.ext.new('fGetMsg', '某人', '1.0.0');
    seal.ext.register(ext);
    seal.ext.registerStringConfig(ext, "apiUrl", "http://127.0.0.1:10421", "Http Server Url");
    seal.ext.registerStringConfig(ext, "token", "", "连接 Http Server 使用的 Token");
    seal.ext.registerTemplateConfig(ext, "keyWord", ["#f取msg"], "包含关键词列表中的关键词时会触发取消息");
    seal.ext.registerBoolConfig(ext, "debug", false, "调试模式");

    ext.onNotCommandReceived = async (ctx, msg) => {
        const message = msg.message;
        const keywords = seal.ext.getTemplateConfig(ext, "keyWord");

        const extractedId = getReplyIdAndCheckKeyword(message, keywords);

        if (extractedId) {
            console.log(`[f取msg] 触发，原始消息 ID：${msg.rawId}，被引用消息ID：${extractedId}`);
            const responseData = await getQuoteMsgId(extractedId);

            if (responseData && responseData.data && responseData.data.message) {
                seal.replyToSender(ctx, msg, JSON.stringify(responseData.data, null, 2));
            } else {
                seal.replyToSender(ctx, msg, "API 返回数据有误，无法获取消息");
            }
        }
    }
}