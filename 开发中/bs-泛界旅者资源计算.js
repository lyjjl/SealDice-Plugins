// ==UserScript==
// @name         bs-泛界旅者资源计算(PRTC)
// @author       冰殇凌衡(bs 2160544788)、某人
// @version      1.0.0
// @description  一个用于计算泛界旅者资源的插件，Usage：.资源计算 <help|set|资源计算式>
// @timestamp    0
// @license      MIT
// @homepageURL  https://github.com/
// ==/UserScript==

let ext = seal.ext.find('泛界旅者资源计算');
if (!ext) {

    /**
     * 计算特征价值 V
     * 公式：V = (α * E + F) + (β * S) - (γ * C + δ * D)
     * 
     * @param {number} E - 效果强度（骰池期望值变化/数值增量）
     * @param {number} F - 触发频率（每场战斗平均触发次数）
     * @param {number} S - 协同潜力（与其他特征/技能的联动增益）
     * @param {number} C - 资源消耗（EP/AP/格等折算值）
     * @param {number} D - 负面代价（对角色能力的限制强度）
     * @param {Object} [weights] - 可选的权重配置对象
     * @param {number} [weights.alpha=0.7] - E 的权重
     * @param {number} [weights.beta=0.3] - S 的权重
     * @param {number} [weights.gamma=1.0] - C 的权重
     * @param {number} [weights.delta=1.2] - D 的权重
     * @returns {number} 计算得到的特征价值 V
     * @throws {Error} 当必需参数缺失或不是数字时抛出错误
     */
    const calculateValue = (
        E,
        F,
        S,
        C,
        D,
        weights = {}
    ) => {
        const requiredParams = { E, F, S, C, D };
        for (const [key, value] of Object.entries(requiredParams)) {
            if (typeof value !== 'number' || isNaN(value)) {
                throw new Error(`参数 ${key} 必须是有效数字，收到: ${value}`);
            }
        }

        const {
            alpha = 0.7,
            beta = 0.3,
            gamma = 1.0,
            delta = 1.2
        } = weights;

        return (alpha * E + F) + (beta * S) - (gamma * C + delta * D);
    };

    /**
     * 解析特征价值参数字符串
     * 将类似"e1s23f2c7d6"的字符串解析为对象格式
     * @param {string} inputString - 输入字符串，包含 e、f、s、c、d 参数
     * @returns {Object} 解析后的参数对象 {E, F, S, C, D}
     * @throws {Error} 当字符串格式无效或缺少必需参数时抛出错误
     */
    const formatString2Object = (inputString) => {
        if (typeof inputString !== 'string') {
            throw new Error('输入必须是字符串');
        }

        const clrStr = inputString
            .toLowerCase()
            .replace(/[\s\n\r]/g, '')
            .trim();

        if (clrStr.length === 0) {
            throw new Error('输入字符串不能为空');
        }

        const pattern = /([efscd])(-?\d+(?:\.\d+)?)/g;
        const matches = [...clrStr.matchAll(pattern)];

        if (matches.length === 0) {
            throw new Error('未找到有效的参数格式。请使用类似 "e1s23f2c7d6" 的格式');
        }

        const result = {
            E: null,
            F: null,
            S: null,
            C: null,
            D: null
        };

        const paramMap = {
            e: 'E',
            f: 'F',
            s: 'S',
            c: 'C',
            d: 'D'
        };

        let foundParams = new Set();

        for (const match of matches) {
            const [_, letter, value] = match;
            const paramName = paramMap[letter];

            if (paramName && !foundParams.has(letter)) {
                const numericValue = parseFloat(value);
                if (isNaN(numericValue)) {
                    throw new Error(`参数 ${letter} 的值 "${value}" 不是有效数字`);
                }

                result[paramName] = numericValue;
                foundParams.add(letter);
            }
        }

        const missingParams = Object.keys(paramMap)
            .filter(letter => !foundParams.has(letter))
            .map(letter => paramMap[letter]);

        if (missingParams.length > 0) {
            throw new Error(`缺少必需参数: ${missingParams.join(', ')}`);
        }
        return result;
    };

    /**
     * 从字符串计算特征价值的便捷函数
     * @param {string} iString 特征参数
     * @param {Object} [weights] 权重
     * @returns {number} V
     */
    const easyCalculate = (iString, weights = {}) => {
        try {
            const params = formatString2Object(iString);
            return calculateValue(
                params.E,
                params.F,
                params.S,
                params.C,
                params.D,
                weights
            );
        } catch (error) {
            throw new Error(`解析失败: ${error.message}`);
        }
    };

    /**
     * 清理对象中的无效值（0、null、NaN、undefined）
     * @param {Object} obj
     * @returns {Object}
     */
    const clrObj = (obj) => {
        return Object.entries(obj).reduce((acc, [key, value]) => {
            if (/*value !== 0 && */value !== null && !Number.isNaN(value) && value !== undefined) {
                acc[key] = value;
            }
            return acc;
        }, {});
    };

    ext = seal.ext.new('泛界旅者资源计算', '某人', '1.0.0');
    seal.ext.register(ext);

    const cmdPRTC = seal.ext.newCmdItemInfo();
    cmdPRTC.name = '资源计算';
    cmdPRTC.help = '用于计算泛界旅者资源\nUsage: .资源计算 <help|set|资源计算式>\n-help 显示本帮助信息\n-set 设置权重\n-资源计算式 直接进行计算\n======\n设置权重时，请使用 .资源计算 set <权重名> <值>的格式进行设置\n目前支持的权重名有：a(α) b(β) g(γ) d(δ)\n======\n资源计算式的写法请参考：示例：.资源计算 e1.5f2s0.8c3d1';

    cmdPRTC.solve = (ctx, msg, cmdArgs) => {

        try {
            switch (cmdArgs.getArgN(1)) {
                case 'help':
                    // seal.replyToSender(ctx, msg, ``);
                    const res = seal.ext.newCmdExecuteResult(true);
                    res.showHelp = true;
                    return res;

                case 'set':
                    switch (cmdArgs.getArgN(2)) {
                        case 'a':
                            seal.vars.strSet(ctx, '$g泛界旅者资源a', parseFloat(cmdArgs.getArgN(3)));
                            seal.replyToSender(ctx, msg, `已将α权重设置为${cmdArgs.getArgN(3)}`);
                            return seal.ext.newCmdExecuteResult(true);
                        case 'b':
                            seal.vars.strSet(ctx, '$g泛界旅者资源b', parseFloat(cmdArgs.getArgN(3)));
                            seal.replyToSender(ctx, msg, `已将β权重设置为${cmdArgs.getArgN(3)}`);
                            return seal.ext.newCmdExecuteResult(true);
                        case 'g':
                            seal.vars.strSet(ctx, '$g泛界旅者资源g', parseFloat(cmdArgs.getArgN(3)));
                            seal.replyToSender(ctx, msg, `已将γ权重设置为${cmdArgs.getArgN(3)}`);
                            return seal.ext.newCmdExecuteResult(true);
                        case 'd':
                            seal.vars.strSet(ctx, '$g泛界旅者资源d', parseFloat(cmdArgs.getArgN(3)));
                            seal.replyToSender(ctx, msg, `已将δ权重设置为${cmdArgs.getArgN(3)}`);
                            return seal.ext.newCmdExecuteResult(true);
                        default:
                            seal.replyToSender(ctx, msg, `未知的权重名，请使用 .资源计算 help 查看帮助`);
                            return seal.ext.newCmdExecuteResult(false);
                    }

                default:
                    const iString = cmdArgs.getRestArgsFrom(1);
                    const weights = clrObj({
                        alpha: parseInt(seal.vars.strGet(ctx, '$g泛界旅者资源a')) || undefined,
                        beta: parseInt(seal.vars.strGet(ctx, '$g泛界旅者资源b')) || undefined,
                        gamma: parseInt(seal.vars.strGet(ctx, '$g泛界旅者资源g')) || undefined,
                        delta: parseInt(seal.vars.strGet(ctx, '$g泛界旅者资源d')) || undefined
                    });

                    const value = easyCalculate(iString, weights);
                    seal.replyToSender(ctx, msg, `计算结果：特征价值 V = ${value.toFixed(2)}`);
                    return seal.ext.newCmdExecuteResult(true);
            }
        } catch (e) {
            seal.replyToSender(ctx, msg, `[PRTC] 计算失败，错误信息：${e.message}`);
            console.error(`[PRTC] 计算失败，错误信息：${e.message}`);
            return seal.ext.newCmdExecuteResult(true);
        }
    };
    ext.cmdMap['资源计算'] = cmdPRTC;
}
