// ==UserScript==
// @name         少女灵装规则(GSD)
// @author       某人
// @version      1.0.0
// @description  少女灵装TRPG规则插件，包含属性管理、核心检定、侵蚀系统、羁绊与高潮阶段机制。
// @license      MIT
// ==/UserScript==

/**
 * 核心逻辑实现
 */
function main() {
    let ext = seal.ext.find('gsd');
    if (!ext) {
        ext = seal.ext.new('gsd', '某人', '1.0.0');
        seal.ext.register(ext);
    }

    // 1. 注册角色卡模板
    const template = {
        "name": "gsd",
        "fullName": "少女灵装(GSD)",
        "authors": ["某人"],
        "version": "1.0.0",
        "setConfig": {
            "diceSides": 12,
            "enableTip": "已切换至少女灵装规则，核心骰为D12",
            "keys": ["gsd"],
            "relatedExt": ["gsd", "coc7"]
        },
        "nameTemplate": {
            "gsd": {
                "template": "{$t玩家_RAW} [{爱+怒+惧+寂+责}/{情感值上限}] Eo{侵蚀点数}(Lv.{侵蚀等级})",
                "helpText": "自动设置测试名片"
            }
        },
        "attrConfig": {
            "top": ["爱", "怒", "惧", "寂", "责", "侵蚀点数", "情感值上限"],
            "sortBy": "name",
            "showAs": {
                "侵蚀点数": "{侵蚀点数} (Lv.{侵蚀等级})"
            }
        },
        "defaults": {
            "爱": 0,
            "怒": 0,
            "惧": 0,
            "寂": 0,
            "责": 0,
            "情感值上限": 6,
            "侵蚀点数": 0,
            "侵蚀等级": 0
        },
        "defaultsComputed": {
            "侵蚀等级": "0 || (侵蚀点数 / 情感值上限)"
        },
        "alias": {
            "情感值上限": ["limit"],
            "侵蚀点数": ["ero"],
            "爱": ["love"],
            "怒": ["anger"],
            "惧": ["fear"],
            "寂": ["silence"],
            "责": ["blame"]
        }
    };

    try {
        seal.gameSystem.newTemplate(JSON.stringify(template));
    } catch (e) {
        console.error("GSD Template Error:", e);
    }

    // 2. 常量定义
    const ATTRS = ["爱", "怒", "惧", "寂", "责"];
    const ATTR_SET = new Set(ATTRS);

    // 3. 辅助函数

    /**
     * 增加侵蚀点数并处理等级变化
     * @param {seal.MsgContext} ctx
     * @param {number} points 增加的点数
     * @returns {string} 变更描述文本
     */
    function addErosion(ctx, points) {
        let [curEro] = seal.vars.intGet(ctx, "侵蚀点数");
        let [limit] = seal.vars.intGet(ctx, "情感值上限");
        if (limit <= 0) limit = 6; // 默认防呆

        const oldLevel = Math.ceil(curEro / limit);
        curEro += points;
        seal.vars.intSet(ctx, "侵蚀点数", curEro);

        // 重新获取 limit (防止之前逻辑有变) 并计算新等级
        // 注意：规则中 "2级侵蚀时，上限永久-1"。这意味着这是一个状态触发器。
        // 为避免复杂的状态追踪，我们在每次等级跃升时检查。
        // 这里简化处理：如果计算出的新等级 > 旧等级，且达到了阈值，扣除上限。

        let newLevel = Math.ceil(curEro / limit);
        let msgs = [`侵蚀点数 +${points} (当前: ${curEro}, Lv.${newLevel})`];

        // 处理等级阈值惩罚
        // 假设：从 Lv1 -> Lv2, 触发 -1。从 Lv2 -> Lv3, 触发 -1。
        // 如果一次性跳多级，循环处理
        let tempLevel = oldLevel;
        let tempLimit = limit;

        // 简单的阈值检查（仅当升级时）
        if (newLevel > oldLevel) {
            if (oldLevel < 2 && newLevel >= 2) {
                tempLimit -= 1;
                msgs.push("侵蚀等级达到2，情感值上限 -1");
            }
            if (oldLevel < 3 && newLevel >= 3) {
                tempLimit -= 1;
                msgs.push("侵蚀等级达到3，情感值上限 -1");
            }

            if (tempLimit !== limit) {
                seal.vars.intSet(ctx, "情感值上限", tempLimit);
                // 上限变了，等级可能又要变，但通常只在下一次计算时生效，避免无限递归
                // 这里我们只更新 limit 值
                if (getTotalAttr(ctx) > tempLimit) {
                    msgs.push("⚠️ 警告：由于侵蚀，情感值上限小于当前情感值总和，请手动处理！");
                }
            }

            if (newLevel >= 4) {
                msgs.push("⚠️ 警告：侵蚀等级达到4！发生空洞化！请GM立即处理！");
            }
        }

        seal.vars.intSet(ctx, "侵蚀等级", Math.ceil(curEro / (tempLimit > 0 ? tempLimit : 1)));
        return msgs.join("\n");
    }

    /**
     * 获取群组合作检定骰子池
     * Key: gsd_climax_{groupId}
     */
    function getClimaxPool(ctx) {
        const key = `gsd_climax_${ctx.group.groupId}`;
        let data = ext.storageGet(key);
        try {
            return data ? JSON.parse(data) : { hope: [], fear: [] };
        } catch (e) {
            return { hope: [], fear: [] };
        }
    }

    function saveClimaxPool(ctx, pool) {
        const key = `gsd_climax_${ctx.group.groupId}`;
        ext.storageSet(key, JSON.stringify(pool));
    }

    /**
     * 获取个人羁绊列表
     * Key: gsd_bond_{userId} (跨群通用，还是群内？根据需求，这里设为群内独立更安全，或者跟随角色卡)
     * 考虑到 .st 切换，这里暂用 userId + groupId 组合，或者仅 userId。
     * Prompt 建议 "对于object的记录... {name: ...}"，且"UID 是 ctx.player.userId"。
     * 为了简单，我们让羁绊跟随用户在当前群的角色。
     */
    function getBonds(ctx) {
        const key = `gsd_bond_${ctx.group.groupId}_${ctx.player.userId}`;
        let data = ext.storageGet(key);
        try {
            return data ? JSON.parse(data) : {};
        } catch (e) {
            return {};
        }
    }

    function saveBonds(ctx, bonds) {
        const key = `gsd_bond_${ctx.group.groupId}_${ctx.player.userId}`;
        ext.storageSet(key, JSON.stringify(bonds));
    }

    function getTotalAttr(ctx) {
        return seal.vars.intGet(ctx, '爱') +
            seal.vars.intGet(ctx, '怒') +
            seal.vars.intGet(ctx, '惧') +
            seal.vars.intGet(ctx, '寂') +
            seal.vars.intGet(ctx, '责');
    }

    /**
     * 核心检定结算函数
     */
    function resolveCheck(ctx, attrName, attrVal, dc, cost, hVal, fVal, isReRoll = false) {
        const finalVal = Math.max(hVal, fVal) + cost;
        const isHope = hVal >= fVal; // 若相等，优先视为希望（数值上），但在文本中触发共鸣
        const isResonance = hVal === fVal;
        const isSuccess = finalVal >= dc;

        let resultTitle = "";
        let effectText = "";

        // 记录结果类型用于文案
        if (isResonance) {
            resultTitle = "【深度共鸣】";
            effectText += "灵装因情感互斥而暴走\n";
            // if (isSuccess) resultTitle += " (判定成功)";
            // else resultTitle += " (判定失败)";
        } else if (isHope && isSuccess) {
            resultTitle = "【希望成功】";
            effectText += "目的非常理想的达成，留下希望余韵。\n";
            if (!isReRoll) {
                // 恢复 1 点情感值 // 恢复的是刚才投入的<属性名>，但是不论投入多少，都只恢复1点"
                let [cur] = seal.vars.intGet(ctx, attrName);
                if (getTotalAttr(ctx) < seal.vars.intGet(ctx, '情感值上限')) {
                    seal.vars.intSet(ctx, attrName, cur + 1);
                } else {
                    effectText += `由于情感值总和大于或等于当前情感值上限，本次未恢复情感值\n`
                }
                effectText += `机制结算：恢复 1 点${attrName}。`;
            } else {
                effectText += `机制结算：应恢复 1 点${attrName} (重骰请手动处理)。`;
            }
        } else if (!isHope && isSuccess) {
            resultTitle = "【恐惧成功】";
            effectText += "目的达成，但方式扭曲，留下祸根。\n";
            if (!isReRoll) {
                let [gp] = seal.vars.intGet(ctx, "$g寂静点");
                seal.vars.intSet(ctx, "$g寂静点", gp + 1);
                effectText += `机制结算：GM获得 1 点寂静点。`;
            }
        } else if (isHope && !isSuccess) {
            resultTitle = "【希望失败】";
            effectText += "行动未果，但揭示了新的可能。\n";
            if (!isReRoll) {
                let [hp] = seal.vars.intGet(ctx, "$g希望点");
                seal.vars.intSet(ctx, "$g希望点", hp + 1);
                effectText += `机制结算：团队获得 1 点希望点。`;
            }
        } else { // !isHope && !isSuccess
            resultTitle = "【恐惧失败】";
            effectText += "彻底失败，引发灾难后果。\n";
            if (!isReRoll) {
                const eroMsg = addErosion(ctx, 1);
                let [gp] = seal.vars.intGet(ctx, "$g寂静点");
                seal.vars.intSet(ctx, "$g寂静点", gp + 1);
                effectText += `机制结算：受 1 点侵蚀，GM获得 1 点寂静点。\n${eroMsg}`;
            }
        }

        return `检定${attrName}(${attrVal}) DC${dc} 投入${cost}\n` +
            `希望骰[${hVal}] 恐惧骰[${fVal}] -> 最终值 ${finalVal}\n` +
            `${resultTitle}\n${effectText}`;
    }

    // 4. 指令定义
    const cmdGsd = seal.ext.newCmdItemInfo();
    cmdGsd.name = 'gsd';
    cmdGsd.help = `少女灵装规则指令：
.gsd <属性> <DC> [投入]  // 进行属性检定
.gsd uhp  // 使用1点希望点
.gsd usp [数量]  // 使用寂静点
.gsd ss <数值>  // 设定场景压力值
.gsd se <公式>  // 增加场景压力值
.gsd bon <名字> <@目标>  // 建立羁绊
.gsd bon upgrade <名字>  // 升级羁绊
.gsd cr  // 合作检定阶段：投掷希望/恐惧骰存入池中
.gsd cc <DC>  // 合作检定阶段：结算
.gsd rr <h|f> // 重骰上次检定的希望(h)或恐惧(f)骰`;

    cmdGsd.solve = (ctx, msg, cmdArgs) => {
        const subCmd = cmdArgs.getArgN(1);

        // === 分支：特殊指令 ===

        // 使用希望点
        if (subCmd === 'uhp') {
            let [hp] = seal.vars.intGet(ctx, "$g希望点");
            if (hp > 0) {
                seal.vars.intSet(ctx, "$g希望点", hp - 1);
                seal.replyToSender(ctx, msg, `已使用 1 点希望点，当前剩余: ${hp - 1}`);
            } else {
                seal.replyToSender(ctx, msg, `使用失败：当前没有希望点。`);
            }
            return seal.ext.newCmdExecuteResult(true);
        }

        // 使用寂静点
        if (subCmd === 'usp') {
            let val = parseInt(cmdArgs.getArgN(2));
            if (isNaN(val)) val = 1;
            let [sp] = seal.vars.intGet(ctx, "$g寂静点");
            if (sp >= val) {
                seal.vars.intSet(ctx, "$g寂静点", sp - val);
                seal.replyToSender(ctx, msg, `已使用 ${val} 点寂静点，当前剩余: ${sp - val}`);
            } else {
                seal.replyToSender(ctx, msg, `使用失败：寂静点不足 (当前: ${sp})。`);
            }
            return seal.ext.newCmdExecuteResult(true);
        }

        // 场景压力
        if (subCmd === 'ss') {
            const val = parseInt(cmdArgs.getArgN(2));
            if (!isNaN(val)) {
                seal.vars.intSet(ctx, "$g场景压力值", val);
                seal.replyToSender(ctx, msg, `场景压力值已设定为: ${val}`);
            } else {
                seal.replyToSender(ctx, msg, `格式错误: .gsd ss <数值>`);
            }
            return seal.ext.newCmdExecuteResult(true);
        }

        if (subCmd === 'se') {
            const expr = cmdArgs.getRestArgsFrom(2);
            const change = parseInt(seal.format(ctx, `{${expr}}`)); // 利用 format 计算算式
            if (!isNaN(change)) {
                let [stress] = seal.vars.intGet(ctx, "$g场景压力值");
                stress += change;
                seal.vars.intSet(ctx, "$g场景压力值", stress);
                seal.replyToSender(ctx, msg, `场景压力值变更 ${change > 0 ? '+'+change : change} -> 当前: ${stress}`);
            } else {
                seal.replyToSender(ctx, msg, `计算错误: ${expr}`);
            }
            return seal.ext.newCmdExecuteResult(true);
        }

        // 羁绊系统
        if (subCmd === 'bon') {
            const op = cmdArgs.getArgN(2);
            const bonds = getBonds(ctx);

            if (op === 'upgrade') {
                const name = cmdArgs.getArgN(3);
                if (bonds[name]) {
                    bonds[name].level += 1;
                    saveBonds(ctx, bonds);
                    seal.replyToSender(ctx, msg, `羁绊[${name}]等级提升 -> ${bonds[name].level}`);
                } else {
                    seal.replyToSender(ctx, msg, `未找到羁绊: ${name}`);
                }
            } else {
                // .gsd bon <name> <@target>
                // op is name here
                const name = op;
                // 检查 at
                if (cmdArgs.at.length > 0) {
                    const targetUid = cmdArgs.at[0].userId;
                    if (bonds[name]) {
                        seal.replyToSender(ctx, msg, `羁绊[${name}]已存在。`);
                    } else {
                        bonds[name] = { name: name, level: 0, UID: targetUid };
                        saveBonds(ctx, bonds);
                        // 获取对方名字（尝试）
                        // const targetName = seal.format(ctx, `{$t${targetUid}_RAW}`); // 尝试获取对方名字
                        seal.replyToSender(ctx, msg, `与 [CQ:at,qq=${targetUid.replace(/\D/g, '')}] 建立了羁绊[${name}] (Lv.0)`);
                    }
                } else {
                    seal.replyToSender(ctx, msg, `格式错误: .gsd bon <名字> @对象 或 .gsd bon upgrade <名字>\n缺失 @对象`);
                }
            }
            return seal.ext.newCmdExecuteResult(true);
        }

        // 合作检定阶段 - 投掷
        if (subCmd === 'cr') {
            const h = Math.floor(Math.random() * 12) + 1;
            const f = Math.floor(Math.random() * 12) + 1;
            const pool = getClimaxPool(ctx);
            pool.hope.push(h);
            pool.fear.push(f);
            saveClimaxPool(ctx, pool);
            seal.replyToSender(ctx, msg, `合作检定阶段投掷：\n希望骰加入: ${h} (共${pool.hope.length}颗)\n恐惧骰加入: ${f} (共${pool.fear.length}颗)`);
            return seal.ext.newCmdExecuteResult(true);
        }

        // 合作检定阶段 - 结算
        if (subCmd === 'cc') {
            const dc = parseInt(cmdArgs.getArgN(2));
            if (isNaN(dc)) {
                seal.replyToSender(ctx, msg, `请指定DC: .gsd cc <DC>`);
                return seal.ext.newCmdExecuteResult(true);
            }

            const pool = getClimaxPool(ctx);
            if (pool.hope.length === 0 || pool.fear.length === 0) {
                seal.replyToSender(ctx, msg, `合作检定骰子池为空，请先进行 .gsd cr`);
                return seal.ext.newCmdExecuteResult(true);
            }

            const maxH = Math.max(...pool.hope);
            const maxF = Math.max(...pool.fear);
            
            // 希望成功: maxH > maxF && maxH >= DC
            // 恐惧成功: maxF > maxH && maxF >= DC
            // 失败: max < DC

            let resultText = `【合作检定】\n希望D: ${maxH} | 恐惧D: ${maxF} | DC: ${dc}\n`;
            const finalVal = Math.max(maxH, maxF);

            if (finalVal < dc) {
                resultText += "【共鸣失败】\n能量反冲，所有人承受情感值与侵蚀的双重打击。但即便失败，其场景也必然无比壮烈。";
            } else if (maxH >= maxF) {
                resultText += "【希望成功】\n奇迹降临，完美达成目标，且所有人恢复大量情感值。";
            } else {
                resultText += "【恐惧成功】\n力量狂暴释放，目标达成但可能伴有不可预知的空间撕裂或情感洪流反噬。";
            }

            seal.replyToSender(ctx, msg, resultText);
            return seal.ext.newCmdExecuteResult(true);
        }

        // 重骰
        if (subCmd === 'rr') {
            const type = cmdArgs.getArgN(2).toLowerCase(); // h or f
            // 读取记忆
            const [lastAttr, exists] = seal.vars.strGet(ctx, "$mLastCheck_Attr");
            if (!exists) {
                seal.replyToSender(ctx, msg, "没有可重骰的记录。");
                return seal.ext.newCmdExecuteResult(true);
            }

            const [lastDC] = seal.vars.intGet(ctx, "$mLastCheck_DC");
            const [lastCost] = seal.vars.intGet(ctx, "$mLastCheck_Cost");
            const [lastH] = seal.vars.intGet(ctx, "$mLastCheck_Hope");
            const [lastF] = seal.vars.intGet(ctx, "$mLastCheck_Fear");
            const [attrVal] = seal.vars.intGet(ctx, lastAttr);

            let newH = lastH;
            let newF = lastF;
            const newRoll = Math.floor(Math.random() * 12) + 1;

            if (type === 'h') {
                newH = newRoll;
            } else if (type === 'f') {
                newF = newRoll;
            } else {
                seal.replyToSender(ctx, msg, "请指定重骰对象: .gsd rr h (希望) 或 .gsd rr f (恐惧)");
                return seal.ext.newCmdExecuteResult(true);
            }

            // 更新记录
            seal.vars.intSet(ctx, "$mLastCheck_Hope", newH);
            seal.vars.intSet(ctx, "$mLastCheck_Fear", newF);

            const text = `重骰${type === 'h' ? '希望' : '恐惧'}骰 -> ${newRoll}\n` +
                resolveCheck(ctx, lastAttr, attrVal, lastDC, lastCost, newH, newF, true);
            seal.replyToSender(ctx, msg, text);
            return seal.ext.newCmdExecuteResult(true);
        }

        // === 默认分支：属性检定 ===
        // 格式: .gsd <属性> <DC> [投入]
        let attrName = subCmd;
        if (!ATTR_SET.has(attrName)) {
            // 尝试检查是不是 .gsd help
            if (attrName === 'help' || attrName === '') {
                const ret = seal.ext.newCmdExecuteResult(true);
                ret.showHelp = true;
                return ret;
            }
            seal.replyToSender(ctx, msg, `未知属性或指令: ${attrName}。可用属性: ${ATTRS.join(', ')}`);
            return seal.ext.newCmdExecuteResult(true);
        }

        const dc = parseInt(cmdArgs.getArgN(2));
        if (isNaN(dc)) {
            seal.replyToSender(ctx, msg, `请输入有效的DC值。`);
            return seal.ext.newCmdExecuteResult(true);
        }

        let cost = parseInt(cmdArgs.getArgN(3));
        if (isNaN(cost)) cost = 0;

        // 1. 检查属性
        const [attrVal, attrExists] = seal.vars.intGet(ctx, attrName);
        if (!attrExists) {
            // 提示未录卡，默认为 0?
            seal.replyToSender(ctx, msg, `未找到该属性数据，请先录入喵`);
            return seal.ext.newCmdExecuteResult(true);
        }

        if (attrVal < cost) {
            seal.replyToSender(ctx, msg, `属性[${attrName}]不足支付投入 (当前${attrVal} < 投入${cost})`);
            return seal.ext.newCmdExecuteResult(true);
        }

        // 2. 扣除属性
        if (cost > 0) {
            seal.vars.intSet(ctx, attrName, attrVal - cost);
            seal.vars.intSet(ctx, `$m阶段扣除-${attrName}`, cost); // 记录扣除量
        }

        // 3. 投掷
        const h = Math.floor(Math.random() * 12) + 1;
        const f = Math.floor(Math.random() * 12) + 1;

        // 4. 记忆 (用于 rr)
        seal.vars.strSet(ctx, "$mLastCheck_Attr", attrName);
        seal.vars.intSet(ctx, "$mLastCheck_DC", dc);
        seal.vars.intSet(ctx, "$mLastCheck_Cost", cost);
        seal.vars.intSet(ctx, "$mLastCheck_Hope", h);
        seal.vars.intSet(ctx, "$mLastCheck_Fear", f);

        // 5. 结算
        // 注意：resolveCheck 中会读取当前属性值用于显示，但判定是用 max(h,f) + cost。
        // 属性值的显示可能用于剧情描述，但核心机制只看骰子和投入。
        // 为了显示一致性，传入扣除后的 attrVal? 还是扣除前的？
        // 通常 Log 显示当前值。
        const text = resolveCheck(ctx, attrName, attrVal - cost, dc, cost, h, f, false);
        seal.replyToSender(ctx, msg, text);

        return seal.ext.newCmdExecuteResult(true);
    };

    ext.cmdMap['gsd'] = cmdGsd;
}

main();