// ==UserScript==
// @name         草群友
// @author       某人
// @version      1.0.0
// @Stage        让我们开启草群友的 Impact 之路吧！Usage：草群友@xxx | .草群友 help
// @timestamp    0
// @license      MIT
// @homepageURL  https://github.com/
// ==/UserScript==

// FAQ:
// - Q: 为什么使用 JavaScript 而不使用更加优雅的 TypeScript
// - A: TypeScript 需要编译才能使用，考虑到不是所有人都有电脑且知道如何操作，同时目前插件大量采用硬编码配置，为了让手机用户也可以方便的修改配置，使用 JavaScript 编写


let fuckLimit = { // 草群友限制
    'minLength': 0, // 最小牛牛长度
    'maxLength': 50, // 最大牛牛长度
    'maxFuckCount_today': 25, // 每日最大草群友次数
    'beComa': 7, // 被草多少次进入昏迷
    'cooldown': 30000 // 草群友冷却时间 (ms)
}

let lengthStage = { // 牛牛长度描述
    'Grand': [45, "宏伟的"],
    'Thick': [33, "粗大的"],
    'Ordinary': [25, "普通的"],
    'Slightly_small': [18, "偏小的"],
    'Compact': [11, "小巧的"],
    'Tiny': [5, "迷你的"],
    'Null': [0, "几乎不可见的"]
}

let abdomenStage = { // 小腹状态描述
    'full': [2000, "严重鼓起"],
    'Prominent': [1000, "鼓起"],
    'Rised': [500, "隆起"],
    'Slightly_rised': [300, "微隆"],
    'Flat': [0, "平坦"]
}

let fuckNotice = { // 部分回复词
    'cooldown': "现在是贤者时间，你还没有充能完毕，不能草群友。",
    'noSelf_cross': "你不是孟德尔花园里面的豌豆，你不能《自交》！",
    'comaFuck': {
        '1': (targetUserId) => `虽然 [CQ:at,qq=${targetUserId}] 今天已经被草晕了过去，但你已经兽性大发，抱着此人的娇躯一次又一次地注入浓郁的生命精华，顺着白嫩的大腿流了一地。空气中满是淫靡的气息`,
        '2': (targetUserId) => `[CQ:at,qq=${targetUserId}] 在你持之以恒的操弄下已经失去了意识，可你仍然对那不断抽搐的娇躯发泄着欲望，不断地冲击着群友的底线`,
        '3': (targetUserId) => `[CQ:at,qq=${targetUserId}] 在你毫无克制的纵欲下露出了被玩坏的表情，却也无法阻止你一次又一次把浓郁的生命精华注入到体内，只能无力的喘息`
    }
}

let ext = seal.ext.find('草群友');
if (!ext) {

    /**
     * 如果对象不存在，则创建并赋值初始数据、
     * 如果对象存在，则只添加初始数据中缺少的属性，不覆盖现有值
     * @param {object} fuckStorage - 存储对象
     * @param {string} userId - 用户 ID (纯数字)
     * @param {object} defaultData - 初始数据对象，包含 fuckTime_first 或 beFuckedTime_first 字段
     */
    function mergeUserData(fuckStorage, userId, defaultData) {

        let userData = fuckStorage[userId];

        if (!userData) {
            fuckStorage[userId] = defaultData;
            return;
        }

        for (const key in defaultData) {
            if (!(key in userData)) {
                userData[key] = defaultData[key];
            } else if (key === 'caoTime_first' && userData[key] === 0) {
                userData[key] = defaultData[key];
            }
        }

        fuckStorage[userId] = userData;
    }
    /**
     * 根据数值获取对应的描述文本
     * @param {Object} obj - 描述对象，键为阶段名，值为 [阈值 ,描述文本] 的数组
     * @param {number} value - 用于判断的数值
     * @returns {string} 匹配到的描述文本
     */
    function getDescription(obj, value) {
        const entries = Object.entries(obj).sort((a, b) => b[1][0] - a[1][0]);
        for (const [key, val] of entries) {
            if (value >= val[0]) {
                return val[1];
            }
        }
    }

    function doRandom(min, max) {
        return +(Math.random() * (max - min) + min).toFixed(2);
    }

    function dailyReset(fuckStorage) {
        for (const user in fuckStorage) {
            let tmpUser = fuckStorage[user];

            tmpUser.fuckTime_last_today = 0;
            tmpUser.fuckCount_today = 0;
            tmpUser.fuckDuration_today = 0;
            tmpUser.ejaculateVolume_today = 0;

            tmpUser.beFuckedTime_last_today = 0;
            tmpUser.beFuckedCount_today = 0;
            tmpUser.beFuckedDuration_today = 0;
            tmpUser.semenIn_today = 0;
        }
    }

    ext = seal.ext.new('草群友', '某人', '1.0.0');
    seal.ext.register(ext);
    seal.ext.registerIntConfig(ext, "每天草群友次数上限", 5);
    seal.ext.registerIntConfig(ext, "草群友冷却时间(毫秒)", 30000);

    seal.ext.registerTask(
        ext,
        "daily",
        "0:00",
        () => dailyReset(fuckStorage),
        "FGM.每日重置",
        "每天零点将 today 记录设为初始值"
    )
    // 用插件设置覆盖默认值
    fuckLimit.cooldown = seal.ext.getIntConfig(ext, "草群友冷却时间(毫秒)");
    fuckLimit.maxFuckCount_today = seal.ext.getIntConfig(ext, "每天草群友次数上限");

    let fuckStorage = {};
    ext.storageGet("fuckStorage", (val) => {
        if (val) {
            fuckStorage = val;
        } else {
            ext.storageSet("fuckStorage", {});
        }
    });


    ext.onNotCommandReceived = (ctx, msg) => {
        try {
        if (msg.message.replace(/\s/g, '').match(/^草群友\[CQ:at,qq=(\d+)\]$/)) {

            const userId = msg.sender.userId.replace(/\D/g, '');
            const targetUserId = msg.message.replace(/\s/g, '').match(/^草群友\[CQ:at,qq=(\d+)\]$/)[1];

            if (targetUserId === msg.sender.userId.replace(/\D/g, '')) {
                seal.replyToSender(ctx, msg, fuckNotice.noSelf_cross);
            };

            // 减少查询次数
            let tmpUser = fuckStorage[userId];
            let tmpTargetUser = fuckStorage[targetUserId];

            if (!tmpUser || !tmpUser.fuckTime_first) { // fuck init
                const defaultFuckStorage = {
                    // (计量单位 ,[保留小数位数] )
                    fuckTime_first: Date.now(), // 第一次草群友时间 <TimeStamp>
                    fuckTime_last_total: 0, // 上一次草群友时间 <TimeStamp>
                    fuckTime_last_today: 0, // 今天上一次草群友时间 <TimeStamp>
                    fuckCount_total: 0, // 总共草群友次数 (次)
                    fuckCount_today: 0, // 今日草群友次数 (次)
                    fuckDuration_total: 0, // 总共草群友时长 (Min, 2)
                    fuckDuration_today: 0, // 今日草群友时长 (Min, 2)
                    dick_length: 5, // 牛牛长度 (cm, 2)
                    ejaculateVolume_total: 0, // 总共射出的精华量 (ml, 2)
                    ejaculateVolume_today: 0 // 今日射出的精华量 (ml, 2)
                };
                mergeUserData(fuckStorage, userId, defaultFuckStorage);
            };

            if (!tmpTargetUser || !tmpTargetUser.beFuckedTime_first) { // beFuck init
                const defaultBeFuckedStorage = {
                    beFuckedTime_first: Date.now(), // 第一次被草时间 <TimeStamp>
                    beFuckedTime_last_total: 0, // 上一次被草时间 <TimeStamp>
                    beFuckedTime_last_today: 0, // 今天上一次被草时间 <TimeStamp>
                    beFuckedCount_total: 0, // 总共被草次数 (次)
                    beFuckedCount_today: 0, // 今日被草次数 (次)
                    beFuckedDuration_total: 0, // 总共被草时长 (Min, 2)
                    beFuckedDuration_today: 0, // 今日被草时长 (Min, 2)
                    semenIn_total: 0, // 总共被灌注精华量 (ml, 2)
                    semenIn_today: 0, // 今日被灌注精华量 (ml, 2)
                    isComa: false // 是否被草昏
                };
                mergeUserData(fuckStorage, targetUserId, defaultBeFuckedStorage);
            };

            if (Date.now() - fuckStorage[userId].fuckTime_last_total < fuckLimit.cooldown) { // 贤者时间检查
                seal.replyToSender(ctx, msg, fuckNotice.cooldown);
            } else {
                if (fuckStorage[userId].fuckCount_today >= fuckLimit.maxFuckCount_today) { // 今日草群友次数检查
                    seal.replyToSender(ctx, msg, `你今天已经草群友 ${fuckStorage[userId].fuckCount_today} 次了，不要再草了。`);
                } else {
                    // roll 时长&精华量
                    let fuckDuration = doRandom(5, 600);
                    let semenVolume = doRandom(1, 95);

                    // 数值记录
                    // - 攻
                    tmpUser.fuckTime_last_today = Date.now();
                    tmpUser.fuckCount_total += 1;
                    tmpUser.fuckCount_today += 1;
                    tmpUser.fuckDuration_total += fuckDuration;
                    tmpUser.fuckDuration_today += fuckDuration;
                    tmpUser.ejaculateVolume_total += semenVolume;
                    tmpUser.ejaculateVolume_today += semenVolume;
                    // - 受
                    tmpTargetUser.beFuckedTime_last = Date.now();
                    tmpTargetUser.beFuckedCount_total += 1;
                    tmpTargetUser.beFuckedCount_today += 1;
                    tmpTargetUser.beFuckedDuration_total += fuckDuration;
                    tmpTargetUser.beFuckedDuration_today += fuckDuration;
                    tmpTargetUser.semenIn_total += semenVolume;
                    tmpTargetUser.semenIn_today += semenVolume;
                    tmpTargetUser.isComa = (tmpTargetUser.beFuckedCount_today >= fuckLimit.beComa);

                    let reply = "";
                    if (tmpTargetUser.isComa) {
                        const comaKeys = Object.keys(fuckNotice.comaFuck);
                        const randomKey = comaKeys[Math.floor(Math.random() * comaKeys.length)];
                        let extraEjaculateVolume = (doRandom(0, 3) * doRandom(100, 500))
                        reply += fuckNotice.comaFuck[randomKey];
                        extraEjaculateVolume = (doRandom(0, 3) * doRandom(100, 500))
                        extraEjaculateVolume = (doRandom(0, 3) * doRandom(100, 500))

                        // 兽性大发了量比较大 (确信)
                        tmpUser.ejaculateVolume_total += extraEjaculateVolume;
                        tmpUser.ejaculateVolume_today += extraEjaculateVolume;
                        
                        tmpTargetUser.semenIn_total += extraEjaculateVolume;
                        tmpTargetUser.semenIn_today += extraEjaculateVolume;
                    } else {
                        reply += `你用你 ${getDescription(lengthStage, tmpUser.dick_length)}的牛子草了 [CQ:at,qq=${targetUserId}] ${fuckDuration}分钟，注入了 ${semenVolume}ml 浓郁的生命精华`;
                        if (tmpTargetUser.beFuckedCount_today === 1) reply += `\n😋你拿下了 [CQ:at,qq=${targetUserId}] 今日一血！`;
                        // 这里可能觉得有些矛盾。解释：刚刚 数值记录 的时候把 beFuckedCount_today +1 了，所以此时 ==1 表明今日是第一次被草
                    }
                    reply += `\n[CQ:image,url=http://q.qlogo.cn/headimg_dl?dst_uin=${targetUserId}&spec=640&img_type=jpg,c=3]`;
                    reply += `\n她的体内充盈着 ${tmpTargetUser.semenIn_today}ml 浓郁的生命精华，小腹${getDescription(abdomenStage, tmpTargetUser.semenIn_today)}!`
                    reply += `\n今天你已经草了 ${tmpUser.fuckCount_today} 次群友啦！`
                    if (tmpTargetUser.isComa) reply += `\n由于群友的过度操弄，[CQ:at,qq=${targetUserId}] 已经被草昏了！面对被草昏的群友，你的选择是......`

                    seal.replyToSender(ctx, msg, reply);
                }
            }
        }
        } catch(e) {
            console.error("[FGM]", e.message);
        }
    }

    const cmdFGM = seal.ext.newCmdItemInfo();
    cmdFGM.name = 'fgm';
    cmdFGM.help = `=== 草群友 (拓展) ===\n此处为草群友的拓展命令\n`;

    cmdFGM.solve = (ctx, msg, cmdArgs) => {
        // TODO: 指令的具体逻辑
    };

    // 将命令注册到扩展中
    ext.cmdMap['fgm'] = cmdFGM;

}
