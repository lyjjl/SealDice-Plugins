// ==UserScript==
// @name         关键词监听转发
// @author       SealDice Plugin Developer 某人
// @version      1.0.2
// @description  监听特定关键词或正则并转发到指定群组，支持白名单过滤。若触发群组在接收列表中，则不捕获。
// @timestamp    1713456002
// @license      MIT
// ==/UserScript==

let ext = seal.ext.find('keywordMonitor')
if (!ext) {
    ext = seal.ext.new('keywordMonitor', '某人', '1.0.2');
    seal.ext.register(ext);
    console.log('registered');

    // 注册配置项
    seal.ext.registerTemplateConfig(ext, "关键词列表", ["敏感词1", "收号"], "触发转发的纯文本关键词");
    seal.ext.registerTemplateConfig(ext, "正则列表", ["\\d{11}", "代打"], "触发转发的正则表达式");
    seal.ext.registerTemplateConfig(ext, "目标群组列表", ["QQ-Group:123456789"], "消息将转发至这些群组 (格式: 平台-Group:群号)");
    seal.ext.registerTemplateConfig(ext, "白名单列表", ["QQ:10001", "QQ-Group:987654321"], "白名单内的用户或群组消息不会被捕获");


    /**
     * 向指定群组发送消息
     * @param {seal.MsgContext} currentCtx - 当前消息上下文
     * @param {string} rawTargetId - 目标群组完整ID (如 QQ-Group:123)
     * @param {string} message - 要发送的内容
     */
    const sendToGroup = (currentCtx, rawTargetId, message) => {
        const newMsg = seal.newMessage();
        newMsg.messageType = "group";
        newMsg.groupId = rawTargetId;
        // 直接使用当前上下文的平台标识
        newMsg.platform = currentCtx.endPoint.platform;

        const newCtx = seal.createTempCtx(currentCtx.endPoint, newMsg);
        seal.replyToSender(newCtx, newMsg, message);
    };

    /**
     * 核心监听逻辑
     */
    ext.onMessageReceived = (ctx, msg) => {
        const rawMessage = msg.message.trim();
        //console.warn('get in', rawMessage);

        // 不捕获一切是 [CQ:*] 的消息（精确匹配全文）
        if (/^\[CQ:[^\]]+\]$/.test(rawMessage.trim())) return;

        // 获取配置
        const keywords = seal.ext.getTemplateConfig(ext, "关键词列表");
        const regexStrings = seal.ext.getTemplateConfig(ext, "正则列表");
        const targetGroups = seal.ext.getTemplateConfig(ext, "目标群组列表");
        const whitelist = seal.ext.getTemplateConfig(ext, "白名单列表");

        // 1. 白名单检查
        if (whitelist.includes(ctx.player.userId) || whitelist.includes(ctx.group.groupId)) {
            //console.log("break in s1");
            //console.log(JSON.stringify(whitelist, null, 2));
            return;
        }

        // 2. 目标群组豁免检查
        // 如果当前消息来自“接收报警的群组”，则不进行任何转发捕获
        if (targetGroups.includes(ctx.group.groupId)) {
            //console.log("break in s2", ctx.group.groupId);
            //console.log(JSON.stringify(targetGroups, null, 2));
            return;
        }

        let matchedRule = "";

        // 3. 关键词匹配
        for (const kw of keywords) {
            if (kw && rawMessage.includes(kw)) {
                matchedRule = `关键词: ${kw}`;
                //console.log(matchedRule);
                break;
            }
        }

        // 4. 正则匹配 (仅当关键词未匹配时)
        if (!matchedRule) {
            for (const reStr of regexStrings) {
                if (!reStr) continue;
                try {
                    const re = new RegExp(reStr, 'i');
                    if (re.test(rawMessage)) {
                        matchedRule = `正则: ${reStr}`;
                        console.log(matchedRule);
                        break;
                    }
                } catch (e) {
                    console.error(`[KeywordMonitor] 无效的正则表达式: ${reStr}`, e);
                }
            }
        }

        // 5. 执行转发
        if (matchedRule) {
            const timeStr = new Date().toLocaleString();
            const senderName = ctx.player.name || "未知用户";
            const groupName = ctx.group.groupName || null;

            const reportMsg = [
                `关键词监控报警`,
                `${matchedRule}`,
                `群组: ${groupName} (${ctx.group.groupId})`,
                `触发者: ${senderName} (${ctx.player.userId})`,
                `时间: ${timeStr}`,
                `内容: <${msg.rawId}>\n${rawMessage}`
            ].join('\n');


            targetGroups.forEach(groupId => {
                // 再次确保不发回原群（虽然已有上方豁免，但此处作为双重保险）
                if (groupId && groupId !== ctx.group.groupId) {
                    try {
                        console.log('f tried');
                        sendToGroup(ctx, groupId, reportMsg);
                    } catch (err) {
                        console.error(`[KeywordMonitor] 转发至 ${groupId} 失败:`, err);
                    }
                }
            });
        }
    };

} else {
    console.warn('already registered');
}