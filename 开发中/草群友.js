// ==UserScript==
// @name         草群友
// @author       暮星、米线、某人
// @version      1.2.0
// @Stage        impact，启动！一！Usage：草群友@xxx | .草群友 help
// @timestamp    0
// @license      MIT
// @homepageURL  https://github.com/
// @updateurl    https://ghfast.top/https://github.com/lyjjl/SealDice-Plugins/blob/main/%E5%BC%80%E5%8F%91%E4%B8%AD/%E8%8D%89%E7%BE%A4%E5%8F%8B.js
// ==/UserScript==

// FAQ:
// - Q: 为什么使用 JavaScript 而不使用更加优雅的 TypeScript
// - A: TypeScript 需要编译才能使用，考虑到不是所有人都有电脑且知道如何操作，同时目前插件大量采用硬编码配置，为了让手机用户也可以方便的修改配置，使用 JavaScript 编写

// 配置项
const fuckLimit = {
    minLength: 0, // 最小牛牛长度 (cm)
    maxLength: 50, // 最大牛牛长度 (cm)
    maxFuckCount_today: 10, // 每日最大草群友次数
    beComa: 7, // 被草多少次进入昏迷状态
    cooldown: 30000, // 草群友冷却时间 (ms)
    wakeUpChance: 0.3 // 清醒指令成功概率
};

// 牛牛长度描述
const lengthStage = {
    Grand: [45, "宏伟的"],
    Thick: [33, "粗壮的"],
    Ordinary: [25, "普通的"],
    Slightly_small: [18, "偏小的"],
    Compact: [11, "小巧的"],
    Tiny: [5, "迷你的"],
    Null: [0, "几乎不可见的"]
};

// 小腹状态描述
const abdomenStage = {
    Full: [2000, "严重鼓起"],
    Prominent: [1000, "鼓起"],
    Rised: [500, "隆起"],
    Slightly_rised: [300, "微隆"],
    Flat: [0, "平坦"]
};

// 回复词
const fuckNotice = {
    cooldown: "现在是贤者时间，你还没有充能完毕，不能草群友。",
    noSelf_cross: "你不是孟德尔花园里面的豌豆，你不能《自交》！",
    comaFuck: {
        1: (targetUserId) => `虽然 [CQ:at,qq=${targetUserId}] 今天已经被草晕了过去，但你已经兽性大发，抱着此人的娇躯一次又一次地注入浓郁的生命精华，顺着白嫩的大腿流了一地。空气中满是淫靡的气息`,
        2: (targetUserId) => `[CQ:at,qq=${targetUserId}] 在你持之以恒的操弄下已经失去了意识，可你仍然对那不断抽搐的娇躯发泄着欲望，不断地冲击着群友的底线`,
        3: (targetUserId) => `[CQ:at,qq=${targetUserId}] 在你毫无克制的纵欲下露出了被玩坏的表情，却也无法阻止你一次又一次把浓郁的生命精华注入到体内，只能无力的喘息`
    },
    comaWakeUp: {
        success: (userId) => `[CQ:at,qq=${userId}] 挣扎着从昏迷中清醒过来，大腿间还残留着黏糊糊的精液`,
        fail: (userId) => `[CQ:at,qq=${userId}] 试图睁开眼睛，但下体传来的酸痛感又让你陷入了昏迷`,
        notComa: (userId) => `[CQ:at,qq=${userId}] 你现在很清醒，不需要醒过来`
    },
    comaAction: "你已经被草晕了，先醒过来再说吧"
};

// 插件注册
let ext = seal.ext.find('草群友');
if (!ext) {
    /**
     * 初始化或更新用户数据
     * @param {object} fuckStorage - 存储对象
     * @param {string} userId - 用户 ID (纯数字)
     * @param {object} defaultData - 初始数据对象
     */
    function mergeUserData(fuckStorage, ctx, defaultData) {
        const userId = ctx.player.userId.replace(/\D/g, '');
        let userData = fuckStorage[userId];

        if (!userData) {
            defaultData.name = ctx.player.name;
            fuckStorage[userId] = defaultData;
            return;
        }

        if (!userData.name) {
            userData.name = ctx.player.name;
        }

        for (const key in defaultData) {
            if (!(key in userData)) {
                userData[key] = defaultData[key];
            } else if (key === 'fuckTime_first' && userData[key] === 0) {
                userData[key] = defaultData[key];
            }
        }

        fuckStorage[userId] = userData;
    }

    /**
     * 根据数值获取对应的描述文本
     * @param {object} obj - 描述对象，键为阶段名，值为 [阈值, 描述文本] 的数组
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
        return obj[Object.keys(obj)[Object.keys(obj).length - 1]][1]; // 返回最低级别描述
    }

    /**
     * 生成随机数
     * @param {number} min - 最小值
     * @param {number} max - 最大值
     * @returns {number} 保留两位小数的随机数
     */
    function doRandom(min, max) {
        return Number((Math.random() * (max - min) + min).toFixed(2));
    }

    /**
     * 每日重置数据
     * @param {object} fuckStorage - 存储对象
     */
    function dailyReset(fuckStorage) {
        for (const user in fuckStorage) {
            const tmpUser = fuckStorage[user];
            tmpUser.fuckTime_last_today = 0;
            tmpUser.fuckCount_today = 0;
            tmpUser.fuckDuration_today = 0;
            tmpUser.ejaculateVolume_today = 0;
            tmpUser.beFuckedTime_last_today = 0;
            tmpUser.beFuckedCount_today = 0;
            tmpUser.beFuckedDuration_today = 0;
            tmpUser.semenIn_today = 0;
            tmpUser.comaTimer = 0;
            tmpUser.isComa = false;
        }
    }

    /**
     * 生成排行榜文本
     * @param {object} storage - 存储对象
     * @param {string} field - 排序字段
     * @param {string} title - 排行榜标题
     * @param {string} unit - 单位描述
     * @returns {string} 排行榜文本
     */
    function generateRanking(storage, field, title, unit, ctx) {
        const validUsers = Object.entries(storage)
            .filter(([userId, data]) => data[field] !== undefined && data[field] > 0)
            .map(([userId, data]) => ({
                userId,
                value: data[field],
                name: data.name || `[CQ:at,qq=${userId}]`
            }));

        if (validUsers.length === 0) {
            return `${title}\n暂无数据，大家都很纯洁呢~`;
        }

        validUsers.sort((a, b) => b.value - a.value);
        const topUsers = validUsers.slice(0, 10);

        let text = `===== ${title} =====\n`;
        text += `🏆 排名 | 用户 | ${unit}\n`;
        text += '----------------------------\n';

        topUsers.forEach((user, index) => {
            const rank = index + 1;
            const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
            text += `${rankEmoji} ${user.name} - ${user.value.toFixed(2)}${unit.includes('次') ? '' : unit.includes('长度') ? 'cm' : 'ml'}\n`;
        });

        const currentUser = validUsers.find(u => u.userId === ctx.player.userId.replace(/\D/g, ''));
        if (currentUser && !topUsers.includes(currentUser)) {
            const userRank = validUsers.findIndex(u => u.userId === ctx.player.userId.replace(/\D/g, '')) + 1;
            text += `\n你的排名：${userRank}/${validUsers.length}`;
        }

        return text;
    }

    // 注册扩展
    ext = seal.ext.new('草群友', '暮星、某人', '1.2.0');
    seal.ext.register(ext);
    seal.ext.registerIntConfig(ext, "每天草群友次数上限", 25);
    seal.ext.registerIntConfig(ext, "草群友冷却时间(毫秒)", 30000);
    seal.ext.registerIntConfig(ext,"草晕需要次数",7);
    seal.ext.registerIntConfig(ext,"最短长度",0);
    seal.ext.registerIntConfig(ext,"最长长度",50);
    seal.ext.registerFloatConfig(ext, "清醒概率", 0.3);

    // 每日重置任务
    seal.ext.registerTask(
        ext,
        "daily",
        "0:00",
        () => dailyReset(fuckStorage),
        "FGM.每日重置",
        "每天零点将 today 记录设为初始值"
    );

    // 用插件设置覆盖默认值
    fuckLimit.cooldown = seal.ext.getIntConfig(ext, "草群友冷却时间(毫秒)");
    fuckLimit.maxFuckCount_today = seal.ext.getIntConfig(ext, "每天草群友次数上限");
    fuckLimit.minLength = seal.ext.getIntConfig(ext,"最短长度");
    fuckLimit.maxLength = seal.ext.getIntConfig(ext,"最长长度");
    fuckLimit.beComa = seal.ext.getIntConfig(ext,"草晕需要次数");
    fuckLimit.wakeUpChance = seal.ext.getFloatConfig(ext, "清醒概率");


    // 初始化存储
    let fuckStorage = {};
    ext.storageGet("fuckStorage", (val) => {
        if (val) {
            fuckStorage = val;
        } else {
            fuckStorage = {};
            ext.storageSet("fuckStorage", fuckStorage);
        }
    });

    // 主命令：草群友
    const cmdCao = seal.ext.newCmdItemInfo();
    cmdCao.name = 'cao';
    cmdCao.help = `使用指令：.草群友@某人\n查看帮助：.草群友 help`;
    cmdCao.allowDelegate = true;
    cmdCao.solve = (ctx, msg, cmdArgs) => {
        ctx.delegateText = "";
        try {
            // 处理help命令
            if (cmdArgs.getArgN(1) === 'help') {
                const helpText = `🍆 草群友插件 v1.2.0\n` +
                    `主要命令：\n` +
                    `.草群友 @某人 - 草指定的群友\n` +
                    `.草 @某人 - 同上\n` +
                    `.fgm 手冲 - 随机改变牛牛长度\n` +
                    `.fgm 清醒 - 尝试从昏迷状态中醒来\n` +
                    `.fgm 排行榜 [类型] - 查看各种排行榜\n` +
                    `\n排行榜类型：\n` +
                    `- 今日被草：今日被草次数排行榜\n` +
                    `- 今日射精：今日射精量排行榜\n` +
                    `- 今日牛牛长度：今日牛牛长度排行榜\n` +
                    `- 总被草：总被草次数排行榜\n` +
                    `- 总射精：总射精量排行榜\n` +
                    `- 总牛牛长度：总牛牛长度排行榜\n` +
                    `\n牛牛系统：\n` +
                    `- 牛牛长度通过手冲随机变化\n` +
                    `- 牛牛长度影响输出描述\n` +
                    `\n昏迷系统：\n` +
                    `- 被草超过${fuckLimit.beComa}次会进入昏迷状态\n` +
                    `- 昏迷状态下无法使用草群友指令\n` +
                    `- 使用 .fgm 清醒 尝试醒来`;
                seal.replyToSender(ctx, msg, helpText);
                return;
            }

            const mctx = seal.getCtxProxyFirst(ctx, cmdArgs);
            const userId = ctx.player.userId.replace(/\D/g, '');
            const targetUserId = mctx.player.userId.replace(/\D/g, '');

            // 检查当前用户是否昏迷
            if (fuckStorage[userId] && fuckStorage[userId].isComa) {
                seal.replyToSender(ctx, msg, fuckNotice.comaAction);
                return;
            }

            // 禁止自交
            if (targetUserId === userId) {
                seal.replyToSender(ctx, msg, fuckNotice.noSelf_cross);
                return;
            }

            // 初始化 攻
            let tmpUser = fuckStorage[userId];
            if (!tmpUser || !tmpUser.fuckTime_first) {
                const defaultFuckStorage = {
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
                mergeUserData(fuckStorage, ctx, defaultFuckStorage);
                tmpUser = fuckStorage[userId];
            }

            // 初始化 受
            let tmpTargetUser = fuckStorage[targetUserId];
            if (!tmpTargetUser || !tmpTargetUser.beFuckedTime_first) {
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
                    comaTimer: 0, // 草晕计数器
                    isComa: false // 是否被草昏
                };
                if (!tmpTargetUser.comaTimer) {
                    // 临时处理措施，在下个大版本移除
                    tmpTargetUser.comaTimer = 0;
                };
                mergeUserData(fuckStorage, mctx, defaultBeFuckedStorage);
                tmpTargetUser = fuckStorage[targetUserId];
            }

            // 检查冷却时间
            if (Date.now() - tmpUser.fuckTime_last_total < fuckLimit.cooldown) {
                seal.replyToSender(ctx, msg, fuckNotice.cooldown);
                return;
            }

            // 检查今日草群友次数
            if (tmpUser.fuckCount_today >= fuckLimit.maxFuckCount_today) {
                seal.replyToSender(ctx, msg, `你今天已经草群友 ${tmpUser.fuckCount_today} 次了，不要再草了。`);
                return;
            }

            // 计算时长和精华量
            const fuckDuration = doRandom(5, 600);
            let semenVolume = doRandom(1, 95);
            const lengthMultiplier = 1 + (tmpUser.dick_length / 100); // 牛牛长度加成
            semenVolume = Number((semenVolume * lengthMultiplier).toFixed(2));

            // 更新数据
            tmpUser.fuckTime_last_total = Date.now();
            tmpUser.fuckTime_last_today = Date.now();
            tmpUser.fuckCount_total += 1;
            tmpUser.fuckCount_today += 1;
            tmpUser.fuckDuration_total += fuckDuration;
            tmpUser.fuckDuration_today += fuckDuration;
            tmpUser.ejaculateVolume_total += semenVolume;
            tmpUser.ejaculateVolume_today += semenVolume;

            tmpTargetUser.beFuckedTime_last_total = Date.now();
            tmpTargetUser.beFuckedTime_last_today = Date.now();
            tmpTargetUser.beFuckedCount_total += 1;
            tmpTargetUser.beFuckedCount_today += 1;
            tmpTargetUser.beFuckedDuration_total += fuckDuration;
            tmpTargetUser.beFuckedDuration_today += fuckDuration;
            tmpTargetUser.semenIn_total += semenVolume;
            tmpTargetUser.semenIn_today += semenVolume;
            tmpTargetUser.comaTimer += 1;
            tmpTargetUser.isComa = tmpTargetUser.comaTimer >= fuckLimit.beComa;

            let reply = "";
            if (tmpTargetUser.isComa) {
                const comaKeys = Object.keys(fuckNotice.comaFuck);
                const randomKey = comaKeys[Math.floor(Math.random() * comaKeys.length)];
                const extraEjaculateVolume = doRandom(100, 500); // 昏迷状态额外精华量，话说为啥兽性大发会转变成动漫量plus啊喂！？
                reply += fuckNotice.comaFuck[randomKey](targetUserId);
                tmpUser.ejaculateVolume_total += extraEjaculateVolume;
                tmpUser.ejaculateVolume_today += extraEjaculateVolume;
                tmpTargetUser.semenIn_total += extraEjaculateVolume;
                tmpTargetUser.semenIn_today += extraEjaculateVolume;
            } else {
                reply += `你用你 ${getDescription(lengthStage, tmpUser.dick_length)} 牛子草了 [CQ:at,qq=${targetUserId}] ${fuckDuration}分钟，注入了 ${semenVolume.toFixed(2)}ml 浓郁的生命精华`;
                if (tmpTargetUser.beFuckedCount_today === 1) {
                    reply += `\n😋你拿下了 [CQ:at,qq=${targetUserId}] 今日一血！`;
                }
            }

            reply += `\n[CQ:image,url=http://q.qlogo.cn/headimg_dl?dst_uin=${targetUserId}&spec=640&img_type=jpg,c=3]`;
            reply += `\n她的体内充盈着 ${tmpTargetUser.semenIn_today.toFixed(2)}ml 浓郁的生命精华，小腹${getDescription(abdomenStage, tmpTargetUser.semenIn_today)}！`;
            reply += `\n今天你已经草了 ${tmpUser.fuckCount_today} 次群友啦！`;
            if (tmpTargetUser.isComa) {
                reply += `\n由于群友的过度操弄，[CQ:at,qq=${targetUserId}] 已经被草昏了！面对被草昏的群友，你的选择是......`;
            }

            ext.storageSet("fuckStorage", fuckStorage);
            seal.replyToSender(ctx, msg, reply);
        } catch (e) {
            console.error("[FGM] 错误:", e.message);
        }
    };

    // 扩展命令：fgm
    const cmdFGM = seal.ext.newCmdItemInfo();
    cmdFGM.name = 'fgm';
    cmdFGM.help = `=== 草群友 (拓展) ===\n此处为草群友的拓展命令\n`;
    cmdFGM.solve = (ctx, msg, cmdArgs) => {
        try {
            const userId = ctx.player.userId.replace(/\D/g, '');

            // 初始化用户数据
            if (!fuckStorage[userId] || !fuckStorage[userId].fuckTime_first) {
                const defaultFuckStorage = {
                    fuckTime_first: Date.now(),
                    fuckTime_last_total: 0,
                    fuckTime_last_today: 0,
                    fuckCount_total: 0,
                    fuckCount_today: 0,
                    fuckDuration_total: 0,
                    fuckDuration_today: 0,
                    dick_length: 5,
                    ejaculateVolume_total: 0,
                    ejaculateVolume_today: 0
                };
                mergeUserData(fuckStorage, ctx, defaultFuckStorage);
            }

            switch (cmdArgs.getArgN(1)) {
                case '手冲':
                    const grow = doRandom(-1, 1.5);
                    fuckStorage[userId].dick_length = Math.max(fuckLimit.minLength, Math.min(fuckLimit.maxLength, fuckStorage[userId].dick_length + grow));
                    seal.replyToSender(ctx, msg, `🦌!🦌!!🦌!!!\n牛子精灵眷顾了你\n你的牛子生长了 ${grow.toFixed(2)}cm!\n可喜可贺 (?)`);
                    ext.storageSet("fuckStorage", fuckStorage);
                    return;

                case '清醒':
                    // 检查是否处于昏迷状态
                    if (!fuckStorage[userId].isComa) {
                        seal.replyToSender(ctx, msg, fuckNotice.comaWakeUp.notComa(userId));
                        return;
                    }
                    
                    // 概率清醒
                    if (Math.random() < fuckLimit.wakeUpChance) {
                        fuckStorage[userId].comaTimer = 0;
                        fuckStorage[userId].isComa = false;
                        seal.replyToSender(ctx, msg, fuckNotice.comaWakeUp.success(userId));
                    } else {
                        seal.replyToSender(ctx, msg, fuckNotice.comaWakeUp.fail(userId));
                    }
                    ext.storageSet("fuckStorage", fuckStorage);
                    return;

                case '排行榜':
                    switch (cmdArgs.getArgN(2)) {
                        case '今日被草':
                            const todayBeFuckedRank = generateRanking(fuckStorage, 'beFuckedCount_today', '今日被草排行榜', '被草次数', ctx);
                            seal.replyToSender(ctx, msg, todayBeFuckedRank);
                            return;
                        case '今日射精':
                            const todayEjaculateRank = generateRanking(fuckStorage, 'ejaculateVolume_today', '今日射精排行榜', '射精量(ml)', ctx);
                            seal.replyToSender(ctx, msg, todayEjaculateRank);
                            return;
                        case '今日牛牛长度':
                            const todayDickLengthRank = generateRanking(fuckStorage, 'dick_length', '今日牛牛长度排行榜', '牛牛长度(cm)', ctx);
                            seal.replyToSender(ctx, msg, todayDickLengthRank);
                            return;
                        case '总被草':
                            const totalBeFuckedRank = generateRanking(fuckStorage, 'beFuckedCount_total', '总被草排行榜', '被草次数', ctx);
                            seal.replyToSender(ctx, msg, totalBeFuckedRank);
                            return;
                        case '总射精':
                            const totalEjaculateRank = generateRanking(fuckStorage, 'ejaculateVolume_total', '总射精排行榜', '射精量(ml)', ctx);
                            seal.replyToSender(ctx, msg, totalEjaculateRank);
                            return;
                        case '总牛牛长度':
                            const totalDickLengthRank = generateRanking(fuckStorage, 'dick_length', '总牛牛长度排行榜', '牛牛长度(cm)', ctx);
                            seal.replyToSender(ctx, msg, totalDickLengthRank);
                            return;
                        default:
                            const helpText = `请指定排行榜类型：\n` +
                                `- 今日被草：今日被草次数排行榜\n` +
                                `- 今日射精：今日射精量排行榜\n` +
                                `- 今日牛牛长度：今日牛牛长度排行榜\n` +
                                `- 总被草：总被草次数排行榜\n` +
                                `- 总射精：总射精量排行榜\n` +
                                `- 总牛牛长度：总牛牛长度排行榜\n` +
                                `用法：.fgm 排行榜 [类型]`;
                            seal.replyToSender(ctx, msg, helpText);
                            return;
                    }

                default:
                    const defaultHelp = `🍆 草群友拓展命令\n` +
                        `可用命令：\n` +
                        `.fgm 手冲 - 随机改变牛牛长度\n` +
                        `.fgm 清醒 - 尝试从昏迷状态中醒来\n` +
                        `.fgm 排行榜 [类型] - 查看各种排行榜\n` +
                        `输入 .草群友 help 查看完整帮助`;
                    seal.replyToSender(ctx, msg, defaultHelp);
                    return;
            }
        } catch (e) {
            console.error("[FGM] 错误:", e.message);
        }
    };

    // 注册命令
    ext.cmdMap['草群友'] = cmdCao;
    ext.cmdMap['草'] = cmdCao;
    ext.cmdMap['艹'] = cmdCao;
    ext.cmdMap['fgm'] = cmdFGM;
}
