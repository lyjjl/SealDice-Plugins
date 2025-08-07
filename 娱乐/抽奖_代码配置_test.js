// ==UserScript==
// @name         代币抽奖插件
// @description  代币系统：.我的代币 .设置代币 [数量] [QQ 号] .抽奖 [次数] .代币统计 群管理以上权限可设置他人代币。
// @author       MisakaEx
// @version      1.7.1
// @timestamp    1752837367
// @license      MIT
// @homepageURL  https://github.com/lyjjl
// ==/UserScript==

/**
 * 插件全局配置项说明：
 *
 * 抽奖权重说明：
 * - 每次抽奖仅抽中一个奖项（非多奖并列）
 * - 每种奖项的被抽中概率按 weight 权重占比计算：
 * 例如：
 * A.weight = 10
 * B.weight = 20
 * C.weight = 30
 * D.weight = 40
 * 总权重 = 10 + 20 + 30 + 40 = 100
 * A 的概率 = 10 / 100 = 10%
 * B 的概率 = 20%
 * C 的概率 = 30%
 * D 的概率 = 40%
 * - 每类奖项可以配置 guaranteeDraws 表示保底次数：
 * 每进行指定次数（如 15 次）必定中该类奖项一次
 * 抽中后该类计数清零
 *
 * 权限等级说明：
 * Master = 100
 * Trust = 70
 * 群主 = 60
 * 管理员 = 50
 * 邀请者 = 40
 * 普通用户 = 0
 * 黑名单 = -30 (大概不需要考虑这个罢)
 */

/**
 * 代码修改说明：
 *
 * 代码中所有用 " " 、' ' 、` ` 包裹的部分都是字符串，可以随意修改
 * 但是注意不要修改其中的 ${...} 部分，这一部分是字面量插入
 * 在字符串中 \n 表示换行
 */

/**
 * 注意事项：
 *
 * 海豹 API 限制，当设置他人代币数量时无法获取 群昵称、QQ 昵称
 * 所以会出现 "未知用户"
 */
const pluginConfig = {
    /**
     * 每次抽奖消耗的代币数量
     */
    tokenCostPerDraw: 15,

    /**
     * 奖励配置（每类奖项）
     */
    rewards: {
        /**
         * A 类奖项（稀有）：
         * - names: 奖项名称列表
         * - weight: 抽奖权重
         * - guaranteeDraws: 保底次数（例：每 15 次必中 1 次）
         */
        A: {
            names: ["A 奖 - 稀有 1", "A 奖 - 稀有 2"],
            weight: 10,
            guaranteeDraws: 15
        },
        /**
         * B 类奖项（普通）：
         * - weight 较高，保底更频繁
         */
        B: {
            names: ["B 奖 - 普通 1", "B 奖 - 普通 2"],
            weight: 20,
            guaranteeDraws: 10
        },
        /**
         * C 类奖项（常见）：
         * - 更高概率、较快保底
         */
        C: {
            names: ["C 奖 - 常见 1", "C 奖 - 常见 2"],
            weight: 30,
            guaranteeDraws: 5
        },
        /**
         * D 类奖项（兜底）：
         * - 不设保底，概率最高
         */
        D: {
            names: ["D 奖 - 普通 1", "D 奖 - 普通 2", "D 奖 - 普通 3"],
            weight: 40
        }
        /**
         * 奖项设置注意事项：
         * 错误示范：names: [A 奖 - 稀有 1, A 奖 - 稀有 2] (缺少引号)
         * 错误示范：names: ["A 奖 - 稀有 1" "A 奖 - 稀有 2"] (缺少逗号)
         * 错误示范：names: [] (空数组，可能导致插件返回异常)
         */
    },

    /**
     * 新用户初始代币数量（首次互动自动初始化）
     */
    initialToken: 100,

    /**
     * 设置他人代币所需的最低权限（推荐使用：群管理 50）
     */
    minPrivilegeForSetToken: 50,

    /**
     * 查看所有人代币统计所需最低权限（推荐使用：群管理 50）
     */
    minPrivilegeForStats: 50
};

/**
 * 下面是具体的实现
 * 看到这里就可以了
 * 其实还有一些可以修改的地方在后面
 * 你可以搜索关键字 "可修改" 来跳转到对应的说明
 */

function normalizeUserId(userId) {
    return userId.replace(/^QQ:/, '');
}

// 修改为 let，以便在加载数据时重新赋值
let pluginData = new Map();
let nicknameMap = new Map();

// 持久化存储的 key
const STORAGE_KEY_PLUGIN_DATA = 'tokenLotteryPluginData';
const STORAGE_KEY_NICKNAME_MAP = 'tokenLotteryNicknameMap';

function getTodayDateString() {
    const today = new Date();
    return `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
}

function initPlayerData(userId) {
    const uid = normalizeUserId(userId);
    if (!pluginData.has(uid)) {
        pluginData.set(uid, {
            tokens: pluginConfig.initialToken,
            drawCountA: 0,
            drawCountB: 0,
            drawCountC: 0,
            lastWorkDate: '',
            dailyWorkCount: 0
        });
        savePluginData(); // 数据初始化或更新时保存
    }
    const data = pluginData.get(uid);
    const todayStr = getTodayDateString();
    if (data.lastWorkDate !== todayStr) {
        data.lastWorkDate = todayStr;
        data.dailyWorkCount = 0;
        pluginData.set(uid, data);
        savePluginData(); // 数据初始化或更新时保存
    }
}

function getTokens(userId) {
    const uid = normalizeUserId(userId);
    initPlayerData(uid);
    return pluginData.get(uid).tokens;
}

function setTokens(userId, amount) {
    const uid = normalizeUserId(userId);
    initPlayerData(uid);
    const data = pluginData.get(uid);
    data.tokens = amount;
    pluginData.set(uid, data);
    savePluginData(); // 数据更新时保存
}

function deductTokens(userId, amount) {
    const uid = normalizeUserId(userId);
    initPlayerData(uid);
    const data = pluginData.get(uid);
    if (data.tokens >= amount) {
        data.tokens -= amount;
        pluginData.set(uid, data);
        savePluginData(); // 数据更新时保存
        return true;
    }
    return false;
}

function getRandomReward(list) {
    return list.length > 0 ? list[Math.floor(Math.random() * list.length)] : "MisakaEx 留下的 BUG(彩蛋)";
    // 抽出来这个你才是真正的欧皇！
}

function performSingleLottery(userId) {
    const uid = normalizeUserId(userId);
    const data = pluginData.get(uid);
    const {
        A,
        B,
        C,
        D
    } = pluginConfig.rewards;

    data.drawCountA++;
    data.drawCountB++;
    data.drawCountC++;

    let result = "";

    if (A.guaranteeDraws && data.drawCountA >= A.guaranteeDraws) {
        result = getRandomReward(A.names);
        data.drawCountA = 0;
    } else if (B.guaranteeDraws && data.drawCountB >= B.guaranteeDraws) {
        result = getRandomReward(B.names);
        data.drawCountB = 0;
    } else if (C.guaranteeDraws && data.drawCountC >= C.guaranteeDraws) {
        result = getRandomReward(C.names);
        data.drawCountC = 0;
    }

    if (!result) {
        const pool = [A, B, C, D];
        const weights = pool.map(r => r.weight);
        const total = weights.reduce((a, b) => a + b, 0);
        let rand = Math.random() * total;
        for (const reward of pool) {
            rand -= reward.weight;
            if (rand <= 0) {
                result = getRandomReward(reward.names);
                break;
            }
        }
    }

    if (!result) result = getRandomReward(D.names);
    // 最后的兜底

    // 额外的健壮性
    if (typeof result !== 'string' || result === '') {
        // 输出更多调试信息
        console.error(
            `[抽奖错误] performSingleLottery 函数返回了无效结果。` +
            `当前返回的 result 类型为: ${typeof result}，值为: "${result}"。\n` +
            `可能原因：所有保底条件未满足，且权重抽奖未命中，或最终D奖兜底也未成功。\n` +
            `关联数据快照：\n` +
            `  用户ID: ${uid}\n` +
            `  用户抽奖计数 (A/B/C): ${data.drawCountA}/${data.drawCountB}/${data.drawCountC}\n` +
            `  插件配置奖项权重 (A/B/C/D): ${A.weight}/${B.weight}/${C.weight}/${D.weight}\n` +
            `  插件配置奖项名称数量 (A/B/C/D): ${A.names.length}/${B.names.length}/${C.names.length}/${D.names.length}\n` +
            `请检查 pluginConfig.rewards 配置是否正确，特别是奖项的 'names' 数组是否为空，以及 'weight' 是否合理。`
        );
        return "未知奖品(请联系管理员)";
    }

    pluginData.set(uid, data);
    savePluginData(); // 数据更新时保存
    return result;
}

function getLotteryResult(userId, times) {
    const uid = normalizeUserId(userId);
    initPlayerData(uid);
    const cost = times * pluginConfig.tokenCostPerDraw;
    // 在循环开始前一次性检查并扣除代币
    if (!deductTokens(uid, cost)) {
        return `你的代币不足！当前代币: ${getTokens(uid)}，${times}次抽奖需要${cost}代币。`;
    }

    const results = [];
    for (let i = 0; i < times; i++) {
        let result;
        do {
            result = performSingleLottery(uid);
            // 如果抽到的是错误或未定义的结果，且不是真实的奖品名，则重新抽奖
        } while (result === "MisakaEx留下的BUG(彩蛋)" || typeof result === 'undefined' || result === '');
        results.push(result);
    }
    const summary = results.reduce((a, b) => ((a[b] = (a[b] || 0) + 1), a), {});
    let msg = `你进行了${times}次抽奖，消耗了${cost}代币。\n你获得了：\n`;
    for (const key in summary) msg += `- ${key} x ${summary[key]}\n`;
    msg += `\n当前代币剩余：${getTokens(uid)}。`;
    return msg;
}

function savePluginData() {
    const dataToStore = Array.from(pluginData.entries());
    seal.ext.find('tokenLotteryPlugin').storageSet(STORAGE_KEY_PLUGIN_DATA, JSON.stringify(dataToStore));
}

function loadPluginData() {
    const storedData = seal.ext.find('tokenLotteryPlugin').storageGet(STORAGE_KEY_PLUGIN_DATA);
    if (storedData) {
        pluginData = new Map(JSON.parse(storedData));
    }
}

function saveNicknameMap() {
    const mapToStore = Array.from(nicknameMap.entries());
    seal.ext.find('tokenLotteryPlugin').storageSet(STORAGE_KEY_NICKNAME_MAP, JSON.stringify(mapToStore));
}

function loadNicknameMap() {
    const storedMap = seal.ext.find('tokenLotteryPlugin').storageGet(STORAGE_KEY_NICKNAME_MAP);
    if (storedMap) {
        nicknameMap = new Map(JSON.parse(storedMap));
    }
}

// ==============================
// 注册插件与指令
// ==============================

let ext = seal.ext.find('tokenLotteryPlugin');
if (!ext) {
    ext = seal.ext.new('tokenLotteryPlugin', 'MisakaEx', '1.7.0');
    seal.ext.register(ext);

    // 在插件注册后立即加载数据
    loadPluginData();
    loadNicknameMap();

    const cmdSet = seal.ext.newCmdItemInfo();
    cmdSet.name = '设置代币';
    cmdSet.help = '.设置代币 [数量] [QQ 号]';
    cmdSet.solve = (ctx, msg, cmdArgs) => {
        const amount = parseInt(cmdArgs.getArgN(1));
        const qqRaw = cmdArgs.getArgN(2);
        if (isNaN(amount) || amount < 0) {
            seal.replyToSender(ctx, msg, '请输入有效的数量(MisakaEx：欠债了是吧)');
            return seal.ext.newCmdExecuteResult(true);
        }

        let targetId, nickname;
        if (qqRaw) {
            if (ctx.privilegeLevel < pluginConfig.minPrivilegeForSetToken) {
                seal.replyToSender(ctx, msg, '你没有权限设置他人代币');
                return seal.ext.newCmdExecuteResult(true);
            }
            targetId = normalizeUserId(qqRaw);
            nickname = nicknameMap.get(targetId) || "未知昵称";
        } else {
            targetId = normalizeUserId(msg.sender.userId);
            nickname = msg.sender.nickname || targetId;
            nicknameMap.set(targetId, nickname);
            saveNicknameMap(); // 昵称更新时保存
        }

        setTokens(targetId, amount);
        seal.replyToSender(ctx, msg, `${nickname}(${targetId}) 的代币已设置为 ${amount}。`);
        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['设置代币'] = cmdSet;

    const cmdMy = seal.ext.newCmdItemInfo();
    cmdMy.name = '我的代币';
    cmdMy.help = '看看你还有多少代币';
    cmdMy.solve = (ctx, msg, cmdArgs) => {
        const uid = normalizeUserId(msg.sender.userId);
        nicknameMap.set(uid, msg.sender.nickname || uid);
        saveNicknameMap(); // 昵称更新时保存
        seal.replyToSender(ctx, msg, `你当前拥有 ${getTokens(uid)} 代币`);
        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['我的代币'] = cmdMy;

    const cmdLottery = seal.ext.newCmdItemInfo();
    cmdLottery.name = '抽奖';
    cmdLottery.help = '.抽奖 [次数] (次数不能大于 10)';
    cmdLottery.solve = (ctx, msg, cmdArgs) => {
        let times = 1;
        const t = parseInt(cmdArgs.getArgN(1));
        if (!isNaN(t) && t >= 1 && t <= 10) times = t;
        /**
         * 可修改：
         * 上一行中的数字10表示最大连抽10次
         * 你可以改成你想要的数字来修改最大连抽限制
         */
        const uid = normalizeUserId(msg.sender.userId);
        nicknameMap.set(uid, msg.sender.nickname || uid);
        saveNicknameMap(); // 昵称更新时保存
        const result = getLotteryResult(uid, times);
        seal.replyToSender(ctx, msg, result);
        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['抽奖'] = cmdLottery;

    const cmdStats = seal.ext.newCmdItemInfo();
    cmdStats.name = '代币统计';
    cmdStats.help = '.代币统计';
    cmdStats.solve = (ctx, msg, cmdArgs) => {
        if (ctx.privilegeLevel < pluginConfig.minPrivilegeForStats) {
            seal.replyToSender(ctx, msg, "你没有权限使用此指令。");
            return seal.ext.newCmdExecuteResult(true);
        }

        const entries = Array.from(pluginData.entries())
            .filter(([_, data]) => data.tokens !== pluginConfig.initialToken)
            .sort((a, b) => b[1].tokens - a[1].tokens);

        if (entries.length === 0) {
            seal.replyToSender(ctx, msg, "目前没有用户的代币数据。");
            return seal.ext.newCmdExecuteResult(true);
        }

        let msgStr = "=== 代币统计 ===\n";
        entries.forEach(([uid, data], i) => {
            const name = nicknameMap.get(uid) || "未知昵称";
            msgStr += `${i + 1}. ${name}(${uid}): ${data.tokens} 代币\n`;
        });
        msgStr += `\n总计：${entries.length} 位用户`;
        seal.replyToSender(ctx, msg, msgStr);
        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['代币统计'] = cmdStats;

    // ==============================
    // 新增指令：加代币
    // ==============================
    const cmdAdd = seal.ext.newCmdItemInfo();
    cmdAdd.name = '加代币';
    cmdAdd.help = '.加代币 [数量]';
    cmdAdd.solve = (ctx, msg, cmdArgs) => {
        const amount = parseInt(cmdArgs.getArgN(1));
        if (isNaN(amount) || amount <= 0) {
            seal.replyToSender(ctx, msg, '请输入有效的数量(MisakaEx：😨，原来是资本家)');
            return seal.ext.newCmdExecuteResult(true);
        }
        const uid = normalizeUserId(msg.sender.userId);
        // 无需手动更新昵称，getTokens会自动初始化玩家数据
        const currentTokens = getTokens(uid);
        setTokens(uid, currentTokens + amount);
        seal.replyToSender(ctx, msg, `成功增加 ${amount} 代币，你当前拥有 ${getTokens(uid)} 代币。`);
        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['加代币'] = cmdAdd;


    // ==============================
    // 新增指令：扣代币
    // ==============================
    const cmdDeduct = seal.ext.newCmdItemInfo();
    cmdDeduct.name = '扣代币';
    cmdDeduct.help = '.扣代币 [数量]';
    cmdDeduct.solve = (ctx, msg, cmdArgs) => {
        const amount = parseInt(cmdArgs.getArgN(1));
        if (isNaN(amount) || amount <= 0) {
            seal.replyToSender(ctx, msg, '请输入有效的数量(MisakaEx：这不河里)');
            return seal.ext.newCmdExecuteResult(true);
        }
        const uid = normalizeUserId(msg.sender.userId);
        const currentTokens = getTokens(uid);
        if (currentTokens < amount) {
            seal.replyToSender(ctx, msg, `你的代币不足！当前仅有 ${currentTokens} 代币。`);
            return seal.ext.newCmdExecuteResult(true);
        }
        setTokens(uid, currentTokens - amount);
        seal.replyToSender(ctx, msg, `成功扣除 ${amount} 代币，你当前剩余 ${getTokens(uid)} 代币。`);
        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['扣代币'] = cmdDeduct;
    
    

    const cmdOneStep = seal.ext.newCmdItemInfo();
    cmdOneStep.name = '前进一步';
    cmdOneStep.help = '.前进一步';
    cmdOneStep.solve = (ctx, msg, cmdArgs) => {
        const amount = 15;
        const uid = normalizeUserId(msg.sender.userId);
        const currentTokens = getTokens(uid);
        if (currentTokens < amount) {
            seal.replyToSender(ctx, msg, `你的代币不足！当前仅有 ${currentTokens} 代币。`);
            return seal.ext.newCmdExecuteResult(true);
        }
        setTokens(uid, currentTokens - amount);
        seal.replyToSender(ctx, msg, `你前进了一步，扣除 ${amount} 代币，你当前剩余 ${getTokens(uid)} 代币。`);
        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['前进一步'] = cmdOneStep;
}