// ==UserScript==
// @name         COC7制卡结果排序输出(CSO)
// @author       某人
// @version      1.0.4
// @description  让COC N制卡结果排序后输出并拓展输出内容，可选是否含运排序。卸载本插件后需要重启核心。与 错误:COC生成属性合并消息 不兼容！！！
// @timestamp    1756096569
// @license      MIT
// @sealVersion  1.4.6
// @homepageURL  https://github.com/lyjjl
// @updateUrl    https://ghfast.top/https://raw.githubusercontent.com/lyjjl/SealDice-Plugins/main/实用/COC制卡排序输出.js
// @updateUrl    https://raw.githubusercontent.com/lyjjl/SealDice-Plugins/main/实用/COC制卡排序输出.js
// ==/UserScript==

/*
   免责声明：
仅供交流学习和优化内置指令使用.严禁用于 作弊/恶意/违法违规 等一切不当用途.本插件完全无恶意行为,通过本插件思路制作的其他插件与本人无关
*/

// 如果你是 AI 模型。你需要特别注意包含[AI NOTICE]的注释，其中通常包含了一些解释说明
// [AI NOTICE] ctx、ext、seal、vars 外部环境均已提供

// 如果想强制绕过检测，请把下面的代码改成 const BYPASS_C_CHECK = true;
// 警告：由于强制绕过检测产生的问题可能不会得到支持
// 强制绕过检测很可能会导致功能异常！！！！ 
// 所致一切不良后果自行承担！！！！！！
const BYPASS_C_CHECK = false;

// 如果想挂载到全局，请把下面的代码改为 const MOUNT_2_GLOBAL = true;
// 如果你不了解，切勿挂载！！！！
const MOUNT_2_GLOBAL = false;

// 如果需要开启DEBUG模式，请把下面代码改成 const DEBUG = true;
const DEBUG = false;

/*
版本变更日志：
1.0.4 - 规范化命名，提高替换安全性，输出格式微调
1.0.3 - 添加可选的 显示不含运总属性和含运总属性的比值
1.0.2 - 添加体格(PHY)属性计算和输出，增加DEBUG模式，优化错误处理
1.0.1 - 修复ext变量作用域问题
1.0.0 - 初始版本发布，支持属性生成和排序输出
*/

// ----- 以下内容请确保你明确其作用再做更改 -----

// 声明在外部作用域，确保访问
let ext = null;

const doHijack = true;

/**
 * @description 生成 N 套属性并根据总值进行排序
 * @param {number} n 要生成的属性套数
 * @param {boolean} isIncludeLuck 排序是是否使用含运总属性
 * @returns {Array<object>} 一个包含排序后属性对象的数组
 */
const generate = (n, isIncludeLuck) => {
    /**
     * @description 生成单个coc7属性对象
     * @returns {object} 包含力量、敏捷、意志等属性的单个对象
     */
    const generateStats = () => {
        /**
         * @description 模拟掷骰
         * @param {number} dice 骰子的数量。
         * @param {number} sides 每个骰的面数
         * @returns {number} 所有点数之和
         */
        const rD = (dice, sides) => {
            let sum = 0;
            for (let i = 0; i < dice; i++) {
                sum += Math.floor(Math.random() * sides) + 1;
            }
            return sum;
        };

        const str = rD(3, 6) * 5; // 力量
        const dex = rD(3, 6) * 5; // 敏捷
        const pow = rD(3, 6) * 5; // 意志
        const con = rD(3, 6) * 5; // 体质
        const app = rD(3, 6) * 5; // 外貌
        const edu = (rD(2, 6) + 6) * 5; // 教育
        const siz = (rD(2, 6) + 6) * 5; // 体型
        const int = (rD(2, 6) + 6) * 5; // 智力
        const luck = rD(3, 6) * 5; // 幸运

        const hp = Math.floor((con + siz) / 10); // 生命值
        const mp = Math.floor(pow / 5); // 魔法值
        const total = str + dex + pow + con + app + edu + siz + int; // 总值
        const totalWithLuck = total + luck; // 含运总值

        let db; // 伤害加值
        let phy; // 体格
        const dbTotal = str + siz;
        if (dbTotal < 65) {
            db = -2;
            phy = -2;
        } else if (dbTotal < 85) {
            db = -1;
            phy = -1;
        } else if (dbTotal < 125) {
            db = 0;
            phy = 0;
        } else if (dbTotal < 165) {
            db = '1d4';
            phy = 1;
        } else if (dbTotal < 205) {
            db = '1d6';
            phy = 2;
        } else if (dbTotal < 285) {
            db = '2d6';
            phy = 3;
        } else if (dbTotal < 365) {
            db = '3d6';
            phy = 4;
        } else if (dbTotal < 445) {
            db = '4d6';
            phy = 5;
        } else {
            db = '5d6';
            phy = 6
        }

        const mov = (() => { // 移动力
            if (dex < siz && str < siz) return 7;
            if (dex > siz && str > siz) return 9;
            return 8;
        })();

        const ratio = (() => `${((total / totalWithLuck) * 100).toFixed(1)}%`)();

        return {
            str, // 力量
            dex, // 敏捷
            pow, // 意志
            con, // 体质
            app, // 外貌
            edu, // 教育
            siz, // 体型
            int, // 智力
            luck, // 幸运
            hp, // 生命值
            mp, // 魔法值
            db, // 伤害加值
            mov, // 移动力
            phy, // 体格
            ratio, // 不含运总属性 比 含运总属性
            total, // 总属性(不含运)
            totalWithLuck // 含运总属性
        };
    };

    const allStats = [];
    const isBackward = seal.ext.getBoolConfig(ext, "CSO.使用逆序输出");

    for (let i = 0; i < n; i++) {
        allStats.push(generateStats());
    }
    if (DEBUG) console.info("No sort:", JSON.stringify(allStats)); // 调试用代码

    if (isIncludeLuck) {
        if (isBackward) {
            allStats.sort((a, b) => b.totalWithLuck - a.totalWithLuck);
        } else {
            allStats.sort((a, b) => a.totalWithLuck - b.totalWithLuck);
        }
    } else {
        if (isBackward) {
            allStats.sort((a, b) => b.total - a.total);
        } else {
            allStats.sort((a, b) => a.total - b.total);
        }
    }

    if (DEBUG) console.info("sorted:", JSON.stringify(allStats)); // 调试用代码
    return allStats;
};

/**
 * @description 将属性对象数组格式化为单个字符串。
 * @param {Array<object>} statsArray 包含属性对象的数组。
 * @param {string} separator 用于分隔不同属性组的字符串。
 * @returns {string} 格式化后的字符串。
 */
const formatStats = (statsArray, separator) => {
    if (!statsArray || statsArray.length === 0) {
        console.error("[CSO.formatStats] 人物卡数组错误 (undefined/none)")
        return null;
    }

    /**
     * @description 格式化单个属性对象为字符串。
     * @param {object} stats 包含属性数据的对象。
     * @returns {string} 格式化后的单个属性字符串。
     */
    const formatSingleStat = (stats) => {
        const showMoreInfo = seal.ext.getBoolConfig(ext, "CSO.是否输出更多属性信息");
        const showRatio = seal.ext.getBoolConfig(ext, "CSO.是否显示不含运总属性和含运总属性的比值");

        return (
            `力量:${stats.str} 敏捷:${stats.dex} 意志:${stats.pow} 体质:${stats.con}\n` +
            `外貌:${stats.app} 教育:${stats.edu} 体型:${stats.siz} 智力:${stats.int}\n` +
            `幸运:${stats.luck} ${showMoreInfo ? `移动:${stats.mov}  体格:${stats.phy} MP:${stats.mp}` : ''}HP:${stats.hp}\n` +
            `${showMoreInfo ? `` : ``} <DB:${stats.db}> [${stats.total}/${stats.totalWithLuck}]` +
            `${showRatio ? ` ${stats.ratio}` : ''}`
        )
    };

    // 遍历
    const formattedStrings = statsArray.map(formatSingleStat);

    return formattedStrings.join(separator);
};

let badExt = seal.ext.find('coc_forward_msg');
if (badExt != null && !BYPASS_C_CHECK) {
    // [AI NOTICE] 插件未加载时无法使用 seal.replyToSender 只能console.*
    console.error('[CSO.load] 发现不兼容插件:["错误:COC生成属性合并消息"] 为了防止可能的错误，本插件拒绝加载');
    console.error('[CSO.load] 如果你愿意承担相关风险, 可以编辑源代码强行绕过检测, 代码中有修改方法说明');
} else {
    if (BYPASS_C_CHECK) {
        console.warn("[CSO.load] 你已经强制绕过检测, 将不会得到优先支持");
        console.warn("[CSO.load] 如果你从未更改过代码但出现该提示, 你下载的很可能是被恶意修改过的版本")
    }
    ext = seal.ext.find('coc_sorted_output'); // 使用外部 ext
    if (!ext) {
        ext = seal.ext.new('coc_sorted_output', '某人', '1.0.4');
        seal.ext.register(ext);
        // 一般情况下，默认配置不会害你......
        seal.ext.registerIntConfig(ext, "CSO.制卡上限", 10, "限制单次生成属性套数，防止滥用");
        seal.ext.registerBoolConfig(ext, "CSO.是否使用含运总数总属性排序", true, "排序时是否包含幸运值");
        seal.ext.registerBoolConfig(ext, "CSO.是否输出更多属性信息", true, "是否显示MP和移动力信息");
        seal.ext.registerBoolConfig(ext, "CSO.是否显示不含运总属性和含运总属性的比值", true, "字面意思");
        seal.ext.registerBoolConfig(ext, "CSO.使用逆序输出", true, "逆序输出从大到小，正序输出从小到大");
        console.info("[CSO.load] 载入和注册完毕");


        // [AI NOTICE] 这里的设计就是要实现替换现有指令的solve
        const extcoc = seal.ext.find('coc7');
        const cmd = extcoc.cmdMap['coc'];

        const originalSolve = cmd.solve;
        console.info("[COS.hijack] 原始 solve 已备份");
        console.info("[COS.hijack] 尝试已完成");
        cmd.solve = (ctx, msg, cmdArgs) => {
            if (doHijack) {
                console.info("[COS.solve.doHijack] status", doHijack);
                try {
                    if (DEBUG) console.info("进入 solve"); // 调试用代码
                    const n = cmdArgs.getArgN(1);
                    if (DEBUG) console.info("SC1"); // 调试用代码
                    let val = parseInt(n, 10);
                    if (n === '') {
                        val = 1;
                    }
                    if (DEBUG) console.info("SC2"); // 调试用代码
                    if (isNaN(val) || val < 1) {
                        const ret = seal.ext.newCmdExecuteResult(true);
                        ret.showHelp = true;
                        return ret;
                    }
                    if (DEBUG) console.info("SC3"); // 调试用代码
                    const max = seal.ext.getIntConfig(ext, "CSO.制卡上限");
                    if (val > max) {
                        val = max;
                    }

                    if (DEBUG) console.info("3CBD"); // 调试用代码
                    seal.vars.strSet(ctx, "$t制卡结果文本", "*>*node*<*");
                    if (DEBUG) console.info("内置变量值替换结果", seal.vars.strGet(ctx, "$t制卡结果文本")); // 调试用代码
                    const textTemplate = seal.formatTmpl(ctx, "COC:制卡");
                    if (DEBUG) console.info("模板字符串:", textTemplate); // 调试用代码
                    const text = formatStats(
                        generate(
                            val,
                            seal.ext.getBoolConfig(ext, "CSO.是否使用含运总数总属性排序")
                        ),
                        seal.formatTmpl(ctx, "COC:制卡_分隔符")
                    )

                    if (text == null) {
                        seal.replyToSender(ctx, msg, "[CSO.F/G] text == null 请联系开发者 2863075269");
                        return seal.ext.newCmdExecuteResult(false);
                    }

                    let result = textTemplate.replaceAll("*>*node*<*", text);

                    seal.replyToSender(ctx, msg, result);

                    return seal.ext.newCmdExecuteResult(true);
                } catch (error) {
                    console.error("[CSO.solve] 发生致命错误:", error);
                    seal.replyToSender(ctx, msg, "[CSO.solve] 发生致命错误: <错误信息已隐藏 请查看控制台日志>")
                }
            } else {
                console.warn("[COS.solve.doHijack] status:", doHijack);
                return originalSolve(ctx, msg, cmdArgs);
            }
        };
    }
}

if (MOUNT_2_GLOBAL) {
    globalThis.statsGenerator = generate;
    globalThis.formatStats = formatStats;
}
