// ==UserScript==
// @name         COC7制卡结果排序输出(CSO)
// @author       某人
// @version      1.0.0
// @description  让COC N制卡结果排序后输出，可选是否含运排序。与 错误:COC生成属性合并消息 不兼容！！！！！
// @timestamp    1756044088
// @license      MIT
// @homepageURL  https://github.com/lyjjl
// ==/UserScript==

/*
   免责声明：
仅供交流学习和优化内置指令使用.严禁用于 作弊/恶意/违法违规 等一切不当用途.本插件完全无恶意行为,通过本插件思路制作的其他插件与本人无关
*/

// 如果想强制绕过检测，把下面的代码改成 const bypassCCheck = true; 即可
// 警告：由于强制绕过检测产生的问题可能不会得到支持
// 强制绕过检测很可能会导致功能异常！！！！
// 所致一切不良后果自行承担！！！！！！
const bypassCCheck = false;

// 如果想挂载到全局，把下面的代码改为 const mount2global = true;
// 如果你不了解，切勿挂载！！！！
const mount2global = false;

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

        const str = rD(3, 6) * 5;       // 力量
        const dex = rD(3, 6) * 5;       // 敏捷
        const pow = rD(3, 6) * 5;       // 意志
        const con = rD(3, 6) * 5;       // 体质
        const app = rD(3, 6) * 5;       // 外貌
        const edu = (rD(2, 6) + 6) * 5; // 教育
        const siz = (rD(2, 6) + 6) * 5; // 体型
        const int = (rD(2, 6) + 6) * 5; // 智力
        const luck = rD(3, 6) * 5;      // 幸运

        const hp = Math.floor((con + siz) / 10);
        const total = str + dex + pow + con + app + edu + siz + int;
        const totalWithLuck = total + luck;

        let db;
        const dbTotal = str + siz;
        if (dbTotal < 65) {
            db = -2;
        } else if (dbTotal < 85) {
            db = -1;
        } else if (dbTotal < 125) {
            db = 0;
        } else if (dbTotal < 165) {
            db = '1d4';
        } else if (dbTotal < 205) {
            db = '1d6';
        }

        return {
            str,            // 力量
            dex,            // 敏捷
            pow,            // 意志
            con,            // 体质
            app,            // 外貌
            edu,            // 教育
            siz,            // 体型
            int,            // 智力
            luck,           // 幸运
            hp,             // 生命值
            db,             // 伤害加值
            total,          // 总属性(不含运)
            totalWithLuck   // 含运总属性
        };
    };

    const allStats = [];

    for (let i = 0; i < n; i++) {
        allStats.push(generateStats());
    }

    if (isIncludeLuck) {
        allStats.sort((a, b) => b.totalWithLuck - a.totalWithLuck);
    } else {
        allStats.sort((a, b) => b.total - a.total);
    }

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
        return (
            `力量:${stats.str} 敏捷:${stats.dex} 意志:${stats.pow}\n` +
            `体质:${stats.con} 外貌:${stats.app} 教育:${stats.edu}\n` +
            `体型:${stats.siz} 智力:${stats.int} 幸运:${stats.luck}\n` +
            `HP:${stats.hp} <DB:${stats.db}> [${stats.total}/${stats.totalWithLuck}]`
        );
    };

    // 遍历
    const formattedStrings = statsArray.map(formatSingleStat);

    return formattedStrings.join(separator);
};

let badExt = seal.ext.find('coc_forward_msg');
if (badExt != null && !bypassCCheck) {
    console.error('[CSO.load] 发现不兼容插件:["错误:COC生成属性合并消息"] 为了防止可能的错误，本插件拒绝加载')
    console.error('[CSO.load] 如果你愿意承担相关风险, 可以编辑源代码强行绕过检测, 代码中有修改方法说明')
} else {
    if (bypassCCheck) {
        console.warn("[CSO.load] 你已经强制绕过检测, 将不会得到优先支持");
        console.warn("[CSO.load] 如果你从未更改过代码但出现该提示, 你下载的很可能是被恶意修改过的版本")
    }
    let ext = seal.ext.find('coc_sorted_output');
    if (!ext) {
        ext = seal.ext.new('coc_sorted_output', '某人', '1.0.0');
        seal.ext.register(ext);
        // 一般情况下，默认配置不会害你......
        seal.ext.registerIntConfig(ext, "制卡上限", 10);
        seal.ext.registerBoolConfig(ext, "是否使用含运总数总属性排序", true);
    }
}

const extcoc = seal.ext.find('coc7');
const cmd = extcoc.cmdMap['coc'];
cmd.solve = (ctx, msg, cmdArgs) => {
    const n = cmdArgs.getArgN(1);
    let val = parseInt(n, 10);
    if (n === '') {
        val = 1;
    }
    if (isNaN(val) || val < 1) {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
    }

    const max = seal.ext.getIntConfig(ext, "制卡上限");
    if (val > max) {
        val = max;
    }

    seal.vars.strSet(ctx, "$t制卡结果文本", "*>*node*<*");
    const textTemplate = seal.formatTmpl(ctx, "COC:制卡");
    const text = formatStats(
        generate(
            val,
            seal.getBoolConfig(ext, "是否使用含运总数总属性排序")
        ),
        seal.formatTmpl(ctx, "COC:制卡_分隔符")
    )
    text.replaceAll("*>*node*<*", text);

    seal.seal.replyToSender(ctx, msg, text);

    return seal.ext.newCmdExecuteResult(true);
};

if (mount2global) {
    globalThis.statsGenerator = generate(n, isIncludeLuck);
    globalThis.formatStats = formatStats(statsArray, separator);
}
