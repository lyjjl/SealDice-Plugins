// ==UserScript==
// @name        定时消息转发
// @author      MisakaEx
// @version      1.0.0
// @description  实现记录目标群组消息并根据定时任务表达式进行转发
// @timestamp    1754452757
// @license      MIT
// @homepageURL  http://github.com/lyjjl
// ==/UserScript==

const platform = "QQ"; // 目标平台

if (!seal.ext.find('forwardMsgByTime')) {
    const ext = seal.ext.new('forwardMsgByTime', 'MisakaEx', '1.0.0');
    seal.ext.register(ext);
    // 注册插件

    seal.ext.registerTemplateConfig(ext, "listenGroupList", ["QQ-Group:123456", "QQ-Group:666666"], "监听的群列表 (按照格式填写)");
    seal.ext.registerTemplateConfig(ext, "targetGroupList", ["QQ-Group:123456", "QQ-Group:666666"], "接收的群列表 (按照格式填写)");
    seal.ext.registerBoolConfig(ext, 'isCorn', true, "使用 cron 表达式进行定时任务");
    seal.ext.registerStringConfig(ext, "forwardMsgTime_cron", "0 12 * * *", "定时转发消息-cron 表达式");
    seal.ext.registerStringConfig(ext, "forwardMsgTime_daily", "12:00", "定时转发消息-daily 表达式");
    seal.ext.registerIntConfig(ext, "msgDelay_Min", 500, "发送消息最小延迟 (毫秒)");
    seal.ext.registerIntConfig(ext, "msgDelay_Max", 1500, "发送消息最大延迟 (毫秒)");

    let forwardMsgTime_cron = seal.ext.getStringConfig(ext, "forwardMsgTime_cron");
    let forwardMsgTime_daily = seal.ext.getStringConfig(ext, "forwardMsgTime_daily");

    /**
     * 一个用于管理字符串列表的工具函数。
     * @param {string} action - 操作类型，可选值为 "add", "get", "clr"。
     * @param {string} [content] - 字符串内容，仅在 action 为 "add" 时需要。
     * @returns {Array<string>|boolean} 根据不同的 action 返回列表、布尔值或 null。
     */
    function stringListManager(action, content) {
        // 使用闭包来创建一个私有的列表，外部无法直接访问
        let list = [];

        return function (action, content = null) {
            switch (action) {
                case 'add':
                    if (typeof content === 'string' && content.length > 0) {
                        list.push(content);
                        return true;
                    }
                    console.error("错误：'add'操作需要一个非空字符串作为第二个参数。");
                    return false;
                case 'get':
                    // 返回列表的一个副本，防止外部修改原始列表
                    return [...list];
                case 'clr':
                    if (list.length > 0) {
                        list = [];
                        return true;
                    }
                    return false;
                default:
                    console.error("错误：无效的操作类型。请使用 'add', 'get' 或 'clr'。");
                    return null;
            }
        };
    }

    // 初始化函数并获取一个列表操作句柄
    const StringList = stringListManager();

    /**
     * 构造记录监听群组消息
     * 
     * @param {Object} ctx - 上下文对象，包含消息和群组信息
     * @param {Object} msg - 消息对象，包含消息内容和发送者信息
     */
    function buildMsg(ctx, msg) {
        return (
            `一条来自${msg.platform}群组${msg.groupId}中` +
            `${msg.sender.nickname}(${msg.sender.userId}) 的消息` +
            `消息内容：${msg.message}\n` +
            `发送时间：${msg.time}`
        )
    }



    /**
     * 异步等待随机时间（不阻塞线程）
     * @param {number} min - 最小延迟（毫秒）
     * @param {number} max - 最大延迟（毫秒）
     * @returns {Promise<void>}
     */
    function asyncDelay(min, max) {
        const delayMs = Math.floor(Math.random() * (max - min + 1)) + min;
        return new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    /**
     * 批量发送消息到多个目标群组
     * @param {Array<string>} groupList - 要发送的目标群组 ID 列表
     * @param {object} ctx - 上下文对象
     * @param {string} platform - 目标平台名称，如 "QQ"
     */
    async function sendToTargetGroup(groupList, ctx, platform) {
        msgDelay_Min = seal.ext.getIntConfig(ext, "msgDelay_Min");
        msgDelay_Max = seal.ext.getIntConfig(ext, "msgDelay_Max");
        if (groupList.length == 0 || StringList('get').length == 0) {
            seal.ext.replyToSender(ctx, "[定时转发消息] 没有需要转发的消息或目标群组列表为空");
            console.warn("[定时转发消息] 没有需要转发的消息或目标群组列表为空");
        }
        for (const groupId of groupList) {
            await asyncDelay(msgDelay_Min, msgDelay_Max); // 随机等待，防止消息发送过快
            sendToGroup(ctx, platform, groupId, StringList('get').join('\f'));
        }
        StringList('clr');  // 清空消息列表
    }

    /**
     * 封装发送消息到指定群的功能
     * @param {object} ctx - 当前的 ctx 对象，用于获取 endPoint
     * @param {string} platform - 平台名称，如"QQ"
     * @param {string} groupId - 目标群 id（允许包含非数字字符，函数内部会过滤）
     * @param {string} message - 要发送的消息内容
     * @returns {boolean} 是否成功发送（仅代表调用成功，不代表消息实际送达）
     */
    function sendToGroup(currentCtx, platform, groupId, message) {
        const formattedGroupId = String(groupId).replace(/\D/g, ''); // 确保群号是纯数字
        if (!formattedGroupId) {
            console.error("无效的群号，无法发送消息：", groupId);
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

    ext.onNotCommandReceived = (ctx, msg) => {
        // 通过非指令消息获取群聊消息
        if (seal.ext.getTemplateConfig(ext, "listenGroupList").includes(msg.groupId)) {
            StringList('add', buildMsg(ctx, msg));
            console.info(buildMsg(ctx, msg));
        }
    }

    if (seal.ext.getBoolConfig(ext, 'isCorn')) {
        seal.ext.registerTask(
            ext,
            "cron",
            forwardMsgTime_cron,
            () => sendToTargetGroup(
                seal.ext.getTemplateConfig(ext, 'targetGroupList'),
                ctx,
                platform
            ),
            "sendForwardMsg_cron",
            "定时转发消息-cron 表达式"
        );
    } else {
        seal.ext.registerTask(
            ext,
            "daily",
            forwardMsgTime_daily,
            () => sendToTargetGroup(
                seal.ext.getTemplateConfig(ext, 'targetGroupList'),
                ctx,
                platform
            ),
            "sendForwardMsg_daily",
            "定时转发消息-daily 表达式"
        );
    }
}
