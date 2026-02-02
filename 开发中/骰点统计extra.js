const reset = {
    user: (suid) => {
        globalData.user[suid]
    }
}

const saveData = () => {
    const storedData = ext.storageGet("globalData");
    if (storedData) {
        try {
            globalData = JSON.parse(storedData);
        } catch (e) {
            console.error("[DiceStat] 加载 globalData 失败:", e);
        }
    }
}

const loadData = () => {
    ext.storageSet("globalData", JSON.stringify(globalData));
}

const getGameRule = (ctx, seal) => {
    const mode = seal.vars.strGet(ctx, '$t游戏模式');
    switch (mode) {
        case "coc7":   return "coc7";
        case "dnd5e":  return "dnd5e";
        default:       return "other";
    }
};

const init = (sgid, suid, logName) => {
    if (!globalData.user || !globalData.group) {
        globalData.user = {};
        globalData.group = {
            logName: null,
        };
    }

    if (!globalData.user[suid]) {
        globalData.user[suid] = {
            coc: {
                crucial_fail: 0,
                fail: 0,
                success: 0,
                hard_success: 0,
                ex_hard_success: 0,
                crucial_success: 0
            },
            dnd: {
                crucial_fail: 0,
                fail: 0,
                success: 0,
                hard_success: 0,
                ex_hard_success: 0,
                crucial_success: 0
            },
            other: {
                crucial_fail: 0,
                fail: 0,
                success: 0,
                hard_success: 0,
                ex_hard_success: 0,
                crucial_success: 0
            }
        };
    }

    if (!globalData.group[sgid]) {
        globalData.group[sgid] = {};
    }

    if (!globalData.group[sgid][suid]) {
        globalData.group[sgid][suid] = {}
    }

        if (!globalData.group[sgid][logName][suid]) {
            globalData.group[sgid][logName][suid] = {
                unlogged: {
                    coc: {
                        crucial_fail: 0,
                        fail: 0,
                        success: 0,
                        hard_success: 0,
                        ex_hard_success: 0,
                        crucial_success: 0
                    },
                    dnd: {
                        crucial_fail: 0,
                        fail: 0,
                        success: 0,
                        hard_success: 0,
                        ex_hard_success: 0,
                        crucial_success: 0
                    },
                    other: {
                        crucial_fail: 0,
                        fail: 0,
                        success: 0,
                        hard_success: 0,
                        ex_hard_success: 0,
                        crucial_success: 0
                    }
                },
                coc: {
                    crucial_fail: 0,
                    fail: 0,
                    success: 0,
                    hard_success: 0,
                    ex_hard_success: 0,
                    crucial_success: 0
                },
                dnd: {
                    crucial_fail: 0,
                    fail: 0,
                    success: 0,
                    hard_success: 0,
                    ex_hard_success: 0,
                    crucial_success: 0
                },
                other: {
                    crucial_fail: 0,
                    fail: 0,
                    success: 0,
                    hard_success: 0,
                    ex_hard_success: 0,
                    crucial_success: 0
                }
            }
        }
}

const wMgr = {
    // 写入记录用的
    w2private: (ctx, msg) => {

    },
    w2group: (ctx, msg) => {

    }
}

const getDiceType = {
    fromStr: (str) => {

    }
}

const statusMge = {
    isPLoging: (ctx) => {
        return !!globalData[ctx.group.groupId][ctx.group.logCurName].active;

    }
}

let ext = seal.ext.find('diceStat');
if (!ext) {
    ext = seal.ext.new('diceStat', '某人', '1.0.0');
    seal.ext.register(ext);


    ext.onCommandReceived = (ctx, msg, cmdArgs) => {
        if (!groupId || msg.messageType !== 'group') return;
        const groupId = msg.groupId;

        const cmd = cmdArgs.command;

        // --- 逻辑分支1：拦截 .log 指令 ---
        if (cmd === 'log') {
            const action = cmdArgs.getArgN(1).toLowerCase();
            const stats = getGroupStats(groupId);

            // 使用 setTimeout 稍作延迟，确保 Bot 原生的 log 提示先发送（可选优化）
            setTimeout(() => {
                let needSave = false;
                switch (action) {
                    case 'new':
                        // 重置并开始
                        init(ctx.group.groupId, ctx.player.userId, ctx.group.logCurName);

                        seal.replyGroup(ctx, msg, `【骰点统计】骰点记录已自动重置，开始记录。`);
                        globalData[ctx.group.groupId].active = true;
                        break;

                    case 'end':
                        if () {
                            seal.replyGroup(ctx, msg, "【骰点统计】骰点统计已自动终止，可发送指令查询本次故事的骰点统计。");
                        }
                        break;
                    case 'on':
                        // 恢复记录（不重置）
                        if (!stats.isActive) {
                            stats.isActive = true;
                            seal.replyGroup(ctx, msg, "【骰点统计】骰点统计重新开始记录。");
                            needSave = true;
                        }
                        break;
                    case 'off':
                        // 暂停记录
                        if (stats.isActive) {
                            stats.isActive = false;
                            seal.replyGroup(ctx, msg, "【骰点统计】骰点统计已经暂停记录。");
                            needSave = true;
                        }
                        break;
                }
                if (needSave) saveData();
            }, 100);
        }
    }
}