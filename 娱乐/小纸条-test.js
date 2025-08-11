// ==UserScript==
// @name         小纸条
// @author       MisakaEx
// @version      1.2.0
// @description  允许用户绑定一个角色名，并通过角色名向其他用户发送“小纸条”和“礼物”消息。绑定个人群 <角色名> [群号] / 。个人群列表 / 。移除个人群 <个人群名> (限骰主) / 。小纸条 <对方角色名> <署名> <内容> / 。礼物 <对方角色名> <内容> <附言> <署名> / 。我的纸条数。可配置通知群。新增日志记录和管理功能。
// @timestamp    1753403198
// @license      MIT
// ==/UserScript==

/*
################################
## 警告 : Development Version ##
###############################
*/


let ext = seal.ext.find("small_note")
if (!ext) {
    ext = seal.ext.new("small_note", "MisakaEx", "1.2.0");
    seal.ext.register(ext);
}

// 定义持久化存储的 key
const NOTE_COUNT_KEY = 'sent_note_counts';
const LAST_QUERY_COUNT_KEY = 'last_query_note_counts';
// 新增：通知群号配置的 key
const NOTIFICATION_GROUP_IDS_KEY = 'notification_group_ids';
// 新增：日志记录的 key
const NOTE_LOG_KEY = 'note_logs';

// 注册 Template 类型的配置项
// 默认值为空数组
seal.ext.registerTemplateConfig(ext, NOTIFICATION_GROUP_IDS_KEY, []);

/**
 * 封装发送消息到指定群的功能
 * @param {object} currentCtx 当前的 ctx 对象，用于获取 endPoint
 * @param {string} platform 平台名称，如"QQ"
 * @param {string} groupId 目标群号 (纯数字)
 * @param {string} message 要发送的消息内容
 * @returns {boolean} 是否成功发送（仅代表调用成功，不代表消息实际送达）
 */
function sendToGroup(currentCtx, platform, groupId, message) {
    const formattedGroupId = String(groupId).replace(/\D/g, ''); // 确保群号是纯数字
    if (!formattedGroupId) {
        console.warn("无效的群号，无法发送消息：", groupId);
        return false;
    }

    let newMsg = seal.newMessage();
    newMsg.messageType = "group";
    newMsg.sender = {};
    newMsg.groupId = `${platform}-Group:${formattedGroupId}`;

    let newCtx = seal.createTempCtx(currentCtx.endPoint, newMsg);
    seal.replyToSender(newCtx, newMsg, message);
    return true;
}


let cmd_bind_private_group = seal.ext.newCmdItemInfo();
cmd_bind_private_group.name = "绑定个人群";
cmd_bind_private_group.help = "。绑定个人群 角色名 群号";
cmd_bind_private_group.solve = (ctx, msg, cmdArgs) => {
    let name = cmdArgs.getArgN(1);
    let gid = cmdArgs.getArgN(2);
    if (name == "help") {
        if (msg.guildId) {
            seal.replyToSender(ctx, msg, `频道类平台无需指定群号，请直接在需要绑定的频道发送。绑定个人群 角色名`);
            return seal.ext.newCmdExecuteResult(true);
        }
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
    }
    if (!name) {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
    }
    if (!gid) {
        if (msg.guildId) {
            gid = `${msg.groupId}`;
        } else {
            const ret = seal.ext.newCmdExecuteResult(true);
            // ret.showHelp = true;
            // 似乎过度，删
            return ret;
        }
    } else {
        if (msg.guildId) {
            seal.replyToSender(ctx, msg, `频道类平台无需指定群号，请直接在需要绑定的频道发送。绑定个人群 角色名`);
            return seal.ext.newCmdExecuteResult(true);
        }
        if (!gid.match(/^\d+$/)) {
            seal.replyToSender(ctx, msg, `群号必须为纯数字，请重新录入`);
            return seal.ext.newCmdExecuteResult(true);
        }
    }
    let private_group = JSON.parse(ext.storageGet("private_group") || "{}");
    let platform = msg.platform
    if (!private_group[platform]) {
        private_group[platform] = {};
    }
    let uid = msg.sender.userId.replace(`${platform}:`, "");
    if (private_group[platform][name]) {
        if (private_group[platform][name][0] != uid) {
            seal.replyToSender(ctx, msg, `该角色名已被其他用户占用，请重新录入`);
            return seal.ext.newCmdExecuteResult(true);
        }
    }
    let oldname = ""
    for (let key in private_group[platform]) {
        if (private_group[platform][key][0] == uid) {
            oldname = key;
        }
    }
    if (oldname) {
        delete private_group[platform][oldname];
    }
    private_group[platform][name] = [uid, gid];
    ext.storageSet("private_group", JSON.stringify(private_group));
    seal.replyToSender(ctx, msg, `绑定个人群成功，如后续需修改重新录入即可`);
    return seal.ext.newCmdExecuteResult(true);
}
ext.cmdMap["绑定个人群"] = cmd_bind_private_group;
ext.cmdMap["个人群绑定"] = cmd_bind_private_group;

let cmd_private_group_list = seal.ext.newCmdItemInfo();
cmd_private_group_list.name = "个人群列表";
cmd_private_group_list.help = "。个人群列表";
cmd_private_group_list.solve = (ctx, msg) => {
    let private_group = JSON.parse(ext.storageGet("private_group") || "{}");
    let platform = msg.platform
    if (!private_group[platform]) {
        private_group[platform] = {};
    }

    let uid = msg.sender.userId.replace(`${platform}:`, "");
    let userIsBound = false;
    for (let key in private_group[platform]) {
        if (private_group[platform][key][0] == uid) {
            userIsBound = true;
            break;
        }
    }

    if (!userIsBound && ctx.privilegeLevel !== 100) {
        seal.replyToSender(ctx, msg, `该指令仅限已绑定个人群的用户或骰主使用`);
        return seal.ext.newCmdExecuteResult(true);
    }

    if (Object.keys(private_group[platform]).length == 0) {
        seal.replyToSender(ctx, msg, `当前平台暂无已绑定的个人群`);
        return seal.ext.newCmdExecuteResult(true);
    }
    let rep = `当前已绑定的个人群列表如下：\n`
    for (let key in private_group[platform]) {
        rep += `姓名：${key}\nID：${private_group[platform][key][0]}\n群号：${private_group[platform][key][1]}\n\n`
    }
    rep = rep.replace(/群号：0\n/g, "群号：未录入\n")
    seal.replyToSender(ctx, msg, rep.trim());
    return seal.ext.newCmdExecuteResult(true);
}
ext.cmdMap["个人群列表"] = cmd_private_group_list;

let cmd_del_private_group = seal.ext.newCmdItemInfo();
cmd_del_private_group.name = "移除个人群";
cmd_del_private_group.help = "。移除个人群 个人群名";
cmd_del_private_group.solve = (ctx, msg, cmdArgs) => {
    if (ctx.privilegeLevel != 100) {
        seal.replyToSender(ctx, msg, `该指令仅限骰主使用`);
        return seal.ext.newCmdExecuteResult(true);
    }
    let private_group = JSON.parse(ext.storageGet("private_group") || "{}");
    let platform = msg.platform
    if (!private_group[platform]) {
        private_group[platform] = {};
    }
    let delname = cmdArgs.getArgN(1);
    if (!delname) {
        seal.replyToSender(ctx, msg, `请输入要移除的个人群名`);
        return seal.ext.newCmdExecuteResult(true);
    }
    if (!private_group[platform][delname]) {
        seal.replyToSender(ctx, msg, `未找到该个人群，请检查输入`);
        return seal.ext.newCmdExecuteResult(true);
    }
    delete private_group[platform][delname];
    ext.storageSet("private_group", JSON.stringify(private_group));
    seal.replyToSender(ctx, msg, `移除个人群成功`);
    return seal.ext.newCmdExecuteResult(true);
}
ext.cmdMap["移除个人群"] = cmd_del_private_group;


let cmd_small_note = seal.ext.newCmdItemInfo();
cmd_small_note.name = "小纸条";
cmd_small_note.help = "。小纸条 对方角色名 署名 内容";
cmd_small_note.solve = (ctx, msg, cmdArgs) => {
    let toname = cmdArgs.getArgN(1);
    let signname = cmdArgs.getArgN(2);
    let content = cmdArgs.GetRest(3).trim(); // 使用 GetRest 获取剩余所有内容

    if (!toname || !signname || !content) {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
    }
    let private_group = JSON.parse(ext.storageGet("private_group") || "{}");
    let platform = msg.platform
    if (!private_group[platform]) {
        private_group[platform] = {};
    }
    let uid = msg.sender.userId.replace(`${platform}:`, "");
    let sendname = "";
    for (let key in private_group[platform]) {
        if (private_group[platform][key][0] == uid) {
            sendname = key;
            break;
        }
    }
    if (!sendname) {
        seal.replyToSender(ctx, msg, `请先绑定角色再使用该指令`);
        return seal.ext.newCmdExecuteResult(true);
    }
    if (toname == sendname) {
        seal.replyToSender(ctx, msg, `不能向自己传小纸条哦~`);
        return seal.ext.newCmdExecuteResult(true);
    }
    if (!private_group[platform][toname]) {
        seal.replyToSender(ctx, msg, `未找到该角色名，请检查输入或联系对方录入`);
        return seal.ext.newCmdExecuteResult(true);
    }

    // 发送小纸条给接收者
    sendToGroup(ctx, platform, private_group[platform][toname][1], `你收到一个来自${signname}的小纸条，上面写着：${content}`);
    seal.replyToSender(ctx, msg, `收到，已传给${toname}`);


    // 增加发送纸条计数
    const sentNoteCounts = JSON.parse(ext.storageGet(NOTE_COUNT_KEY) || "{}");
    if (!sentNoteCounts[uid]) {
        sentNoteCounts[uid] = 0;
    }
    sentNoteCounts[uid] += 1;
    ext.storageSet(NOTE_COUNT_KEY, JSON.stringify(sentNoteCounts));

    // 记录日志
    const noteLogs = JSON.parse(ext.storageGet(NOTE_LOG_KEY) || "[]");
    const newLog = {
        type: "note",
        senderId: uid,
        senderName: sendname,
        recipientName: toname,
        signName: signname,
        content: content,
        timestamp: Date.now()
    };
    noteLogs.push(newLog);
    ext.storageSet(NOTE_LOG_KEY, JSON.stringify(noteLogs));

    // 获取通知群号配置
    const notificationGroupIds = seal.ext.getTemplateConfig(ext, NOTIFICATION_GROUP_IDS_KEY);

    // 如果配置不为空且包含有效的群号，则发送通知
    if (notificationGroupIds && notificationGroupIds.length > 0) {
        const notificationMessage = `[小纸条通知]\n发送者：${sendname}\n接收者：${toname}\n内容：${content}`;
        for (const groupId of notificationGroupIds) {
            sendToGroup(ctx, platform, groupId, notificationMessage);
        }
    }

    return seal.ext.newCmdExecuteResult(true);
}
ext.cmdMap["小纸条"] = cmd_small_note;


// 新增命令：我的纸条数
let cmd_my_note_count = seal.ext.newCmdItemInfo();
cmd_my_note_count.name = "我的纸条数";
cmd_my_note_count.help = "。我的纸条数 // 查询你发送的小纸条数量";
cmd_my_note_count.solve = (ctx, msg) => {
    let uid = msg.sender.userId.replace(`${msg.platform}:`, "");

    const sentNoteCounts = JSON.parse(ext.storageGet(NOTE_COUNT_KEY) || "{}");
    const currentCount = sentNoteCounts[uid] || 0;

    const lastQueryCounts = JSON.parse(ext.storageGet(LAST_QUERY_COUNT_KEY) || "{}");
    const lastCount = lastQueryCounts[uid] || 0;

    let replyMessage = `你已经发送了 ${currentCount} 张小纸条。`;
    if (currentCount > lastCount) {
        replyMessage += `自上次查询以来，你发送了 ${currentCount - lastCount} 张新的小纸条。`;
    } else if (currentCount < lastCount) {
        replyMessage += `警告：纸条数出现异常，本次查询比上次查询少了 ${lastCount - currentCount} 张。`;
    } else {
        replyMessage += `自上次查询以来，你的纸条数没有变化。`;
    }

    lastQueryCounts[uid] = currentCount;
    ext.storageSet(LAST_QUERY_COUNT_KEY, JSON.stringify(lastQueryCounts));

    seal.replyToSender(ctx, msg, replyMessage);
    return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap["我的纸条数"] = cmd_my_note_count;


// 新增命令：礼物
let cmd_gift = seal.ext.newCmdItemInfo();
cmd_gift.name = "礼物";
cmd_gift.help = "。礼物 <对方角色名> <内容> <附言> <署名>";
cmd_gift.solve = (ctx, msg, cmdArgs) => {
    let toname = cmdArgs.getArgN(1);
    let giftContent = cmdArgs.getArgN(2); // 礼物内容
    let postscript = cmdArgs.getArgN(3); // 附言
    let signname = cmdArgs.getArgN(4); // 署名

    if (!toname || !giftContent || !postscript || !signname) {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
    }

    let private_group = JSON.parse(ext.storageGet("private_group") || "{}");
    let platform = msg.platform;
    if (!private_group[platform]) {
        private_group[platform] = {};
    }
    let uid = msg.sender.userId.replace(`${platform}:`, "");
    let sendname = "";
    for (let key in private_group[platform]) {
        if (private_group[platform][key][0] == uid) {
            sendname = key;
            break;
        }
    }

    if (!sendname) {
        seal.replyToSender(ctx, msg, `请先绑定角色再使用该指令`);
        return seal.ext.newCmdExecuteResult(true);
    }
    if (toname == sendname) {
        seal.replyToSender(ctx, msg, `不能送礼物给自己哦~`);
        return seal.ext.newCmdExecuteResult(true);
    }
    if (!private_group[platform][toname]) {
        seal.replyToSender(ctx, msg, `未找到该角色名，请检查输入或联系对方录入`);
        return seal.ext.newCmdExecuteResult(true);
    }

    const giftMessageToRecipient = `你收到一个来自${signname}的礼物，里面是：${giftContent}\n附言：${postscript}`;
    const targetGroupId = private_group[platform][toname][1];

    // 使用封装函数发送礼物消息
    sendToGroup(ctx, platform, targetGroupId, giftMessageToRecipient);
    seal.replyToSender(ctx, msg, `收到，已将礼物送给${toname}`);

    // 增加发送纸条（礼物）计数
    const sentNoteCounts = JSON.parse(ext.storageGet(NOTE_COUNT_KEY) || "{}");
    if (!sentNoteCounts[uid]) {
        sentNoteCounts[uid] = 0;
    }
    sentNoteCounts[uid] += 1; // 礼物也算作发送小纸条的一种，如果不想计算进去，那么在这一行前面加两个斜杠
    ext.storageSet(NOTE_COUNT_KEY, JSON.stringify(sentNoteCounts));

    // 记录日志
    const noteLogs = JSON.parse(ext.storageGet(NOTE_LOG_KEY) || "[]");
    const newLog = {
        type: "gift",
        senderId: uid,
        senderName: sendname,
        recipientName: toname,
        signName: signname,
        content: giftContent,
        postscript: postscript,
        timestamp: Date.now()
    };
    noteLogs.push(newLog);
    ext.storageSet(NOTE_LOG_KEY, JSON.stringify(noteLogs));

    // 获取通知群号配置
    const notificationGroupIds = seal.ext.getTemplateConfig(ext, NOTIFICATION_GROUP_IDS_KEY);

    // 如果配置不为空且包含有效的群号，则发送通知
    if (notificationGroupIds && notificationGroupIds.length > 0) {
        const notificationMessage = `[礼物通知]\n发送者：${sendname}\n接收者：${toname}\n礼物内容：${giftContent}\n附言：${postscript}`;
        for (const groupId of notificationGroupIds) {
            sendToGroup(ctx, platform, groupId, notificationMessage);
        }
    }

    return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap["礼物"] = cmd_gift;
ext.cmdMap["送礼"] = cmd_gift;

let cmd_snlog = seal.ext.newCmdItemInfo();
cmd_snlog.name = "snlog";
cmd_snlog.help = "。snlog get <qq 号|all> // 获取指定用户或全体用户的纸条记录\n。snlog rm <qq 号|all> // 删除指定用户或全体用户的纸条记录";
cmd_snlog.solve = (ctx, msg, cmdArgs) => {
    // 权限校验，需要白名单用户（权限 >= 70）
    if (ctx.privilegeLevel < 70) {
        seal.replyToSender(ctx, msg, `该指令仅限白名单用户及以上权限使用`);
        return seal.ext.newCmdExecuteResult(true);
    }

    const action = cmdArgs.getArgN(1); // get 或 rm
    const target = cmdArgs.getArgN(2); // qq号 或 all

    if (!action || !target) {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
    }

    let noteLogs = JSON.parse(ext.storageGet(NOTE_LOG_KEY) || "[]");

    if (action === 'get') {
        let logMessage = "";
        let filteredLogs = [];

        if (target === 'all') {
            filteredLogs = noteLogs;
        } else if (target.match(/^\d+$/)) {
            const targetQQ = String(target);
            filteredLogs = noteLogs.filter(log => log.senderId === targetQQ || log.recipientName === targetQQ);
        } else {
            seal.replyToSender(ctx, msg, `无效的目标，请输入 QQ 号 或 all`);
            return seal.ext.newCmdExecuteResult(true);
        }

        if (filteredLogs.length === 0) {
            seal.replyToSender(ctx, msg, `未找到相关日志记录`);
            return seal.ext.newCmdExecuteResult(true);
        }

        logMessage = `--- 小纸条/礼物记录 (${filteredLogs.length} 条) ---\n`;
        filteredLogs.forEach(log => {
            const date = new Date(log.timestamp).toLocaleString();
            logMessage += `类型：${log.type === 'note' ? '小纸条' : '礼物'}\n`;
            logMessage += `时间：${date}\n`;
            logMessage += `发送者 ID: ${log.senderId}\n`;
            logMessage += `发送者角色名：${log.senderName}\n`;
            logMessage += `接收者角色名：${log.recipientName}\n`;
            logMessage += `署名：${log.signName}\n`;
            logMessage += `内容：${log.content}\n`;
            if (log.postscript) {
                logMessage += `附言：${log.postscript}\n`;
            }
            logMessage += `------------------\n`;
        });
        seal.replyToSender(ctx, msg, logMessage);
    } else if (action === 'rm') {
        if (target === 'all') {
            // 清空所有日志
            ext.storageSet(NOTE_LOG_KEY, "[]");
            seal.replyToSender(ctx, msg, `已删除所有纸条记录`);
        } else if (target.match(/^\d+$/)) {
            const targetQQ = String(target);
            const newLogs = noteLogs.filter(log => log.senderId !== targetQQ && log.recipientName !== targetQQ);
            ext.storageSet(NOTE_LOG_KEY, JSON.stringify(newLogs));
            seal.replyToSender(ctx, msg, `已删除与用户 ${targetQQ} 相关的所有纸条记录`);
        } else {
            seal.replyToSender(ctx, msg, `无效的目标，请输入 QQ 号 或 all`);
            return seal.ext.newCmdExecuteResult(true);
        }
    } else {
        seal.replyToSender(ctx, msg, `无效的子指令，请使用 get 或 rm`);
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
    }

    return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap["snlog"] = cmd_snlog;