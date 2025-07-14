// ==UserScript==
// @name        统计学骰子
// @author       某人
// @version      1.0.2
// @description  纯娱乐的统计学骰子，笨蛋某人不要忘了指令是 .dtbt | .dtbt help查看帮助
// @timestamp    1752512052
// @license      MIT
// @homepageURL   https://github.com/lyjjl
// ==/UserScript==

// 写了图一乐呵，大佬轻喷，我是菜鸡哇

/**
 * 生成器类
 */
class DistributionGenerator {

    /**
     * 用于 Box-Muller 变换的缓存变量，以生成正态值
     * @type {number|null}
     */
    static #nextNormal = null;

    /**
     * 生成正态分布（Normal Distribution）随机数。
     * 使用 Box-Muller 算法
     * @param {number} mean - 均值 (μ)
     * @param {number} stdDev - 标准差 (σ)
     * @returns {number} 
     */
    static randNormal(mean, stdDev) {
        // 如果有缓存的随机数，直接使用并清空缓存
        if (this.#nextNormal !== null) {
            const result = this.#nextNormal;
            this.#nextNormal = null;
            return result * stdDev + mean;
        }

        // 使用 Box-Muller 算法生成一对正态随机数
        let u, v, s;
        do {
            u = Math.random() * 2 - 1; 
            v = Math.random() * 2 - 1;
            s = u * u + v * v;
        } while (s >= 1 || s === 0);

        const multiplier = Math.sqrt(-2 * Math.log(s) / s);
        this.#nextNormal = v * multiplier; // 缓存第二个随机数
        
        return (u * multiplier) * stdDev + mean; // 返回第一个随机数
    }

    /**
     * 生成泊松分布（Poisson Distribution）随机数。
     * 使用 Knuth's 算法
     * @param {number} lambda - 速率参数（平均发生次数）
     * @returns {number} 
     */
    static randPoisson(lambda) {
        if (lambda <= 0) return 0;
        
        // 基于指数函数 L = e^-lambda，通过随机数乘积来模拟泊松过程
        const L = Math.exp(-lambda);
        let k = 0; // 事件发生次数
        let p = 1; // 累积概率乘积

        do {
            k++;
            p *= Math.random(); 
        } while (p > L);

        return k - 1;
    }

    /**
     * 生成卡方分布（Chi-squared Distribution）随机数
     * 卡方分布是 k 个独立标准正态随机变量的平方和。
     * @param {number} df - 自由度 (k).
     * @returns {number} 
     */
    static randChiSquared(df) {
        let sum = 0;
        // 累加 df 个标准正态变量 (μ=0, σ=1) 的平方
        for (let i = 0; i < df; i++) {
            const z = this.randNormal(0, 1);
            sum += z * z;
        }
        return sum;
    }

    /**
     * 生成 t分布（t-distribution）随机数。
     * t = Z / sqrt(ChiSq / df)
     * @param {number} df - 自由度 (k).
     * @returns {number} 
     */
    static randT(df) {
        if (df <= 0) throw new Error("自由度 (df) 必须为正数.");
        
        const Z = this.randNormal(0, 1);       // 标准正态变量
        const ChiSq = this.randChiSquared(df); // 自由度为 df 的卡方变量
        
        return Z / Math.sqrt(ChiSq / df);
    }
}


/**
 * @param {string} type - 类型: 'normal', 'poisson', 't', 'chi_squared'。
 * @param {object} params - 分布参数对象。
 * @returns {number|null} 生成的随机数。
 */
const generateDistribution = (type, params) => {
    switch (type) {
        case 'normal':
            if (typeof params.mean === 'number' && typeof params.stdDev === 'number') {
                return DistributionGenerator.randNormal(params.mean, params.stdDev);
            }
            throw new Error("正态分布需要 mean 和 stdDev 参数.");

        case 'poisson':
            if (typeof params.lambda === 'number') {
                return DistributionGenerator.randPoisson(params.lambda);
            }
            throw new Error("泊松分布需要 lambda 参数.");

        case 't':
        case 'chi_squared':
            if (typeof params.df === 'number') {
                // 根据类型调用相应的生成器
                return type === 't' 
                    ? DistributionGenerator.randT(params.df) 
                    : DistributionGenerator.randChiSquared(params.df);
            }
            throw new Error(`${type} 分布需要 df (自由度) 参数.`);

        default:
            console.error(`不支持的类型: ${type}`);
            return null;
    }
};

if (!seal.ext.find('统计学骰子')){
const ext = seal.ext.new('统计学骰子', '某人', '1.0.2');
seal.ext.register(ext);

// seal.vars.intSet(ctx, `$groundCount`, 1);
// 没用明白上面这个，呜呜呜
let roundCount = 1;
// 生成次数

let cmdDistributionDice = seal.ext.newCmdItemInfo();
cmdDistributionDice.name = '统计学骰子'; // 命令名称
cmdDistributionDice.help = '>>生成正态分布、泊松分布、卡方分布和 t 分布的随机数\n→正态分布由均值 (μ) 和标准差 (σ) 决定\nUSE: dtbt normal <均值> <标准差>\n→泊松分布由速率参数 (λ) 决定，表示在给定时间段内的平均事件发生次数\nUSE: dtbt poisson <速率>\nt 分布由自由度 (df) 决定\nUSE: dtbt t <自由度>\n→卡方分布同样由自由度 (df) 决定\nUSE: dtbt chi_squared <自由度>\n>>使用 dtbt cset [轮数]即可配置批量生成,如果没有填写轮数将会恢复到生成1次(最多30轮 所有群同步 重载恢复)';

let isHelp = 0;

cmdDistributionDice.solve = async (ctx, msg, cmdArgs) => { // 标记为 async 函数
    
    // seal.vars.intSet(ctx, `$groundCount`, 1);
    // 转移到这里处理了
    
    try {
    // 获取第一个参数作为类型
    const distributionType = cmdArgs.getArgN(1);
    
    if (!distributionType) {
        throw new Error("缺少类型参数");
    }

    // 根据类型解析后续参数
    let params = {};
    let result;

    switch (distributionType) {
        case 'normal':
            // 指令格式: dtbt normal <mean> <stdDev>
            params.mean = parseFloat(cmdArgs.getArgN(2));
            params.stdDev = parseFloat(cmdArgs.getArgN(3));
            if (isNaN(params.mean) || isNaN(params.stdDev)) {
                throw new Error("正态分布参数无效。需要均值和标准差");
            }
            isHelp = 0;
            break;

        case 'poisson':
            // 指令格式: dtbt poisson <lambda>
            params.lambda = parseFloat(cmdArgs.getArgN(2));
            if (isNaN(params.lambda)) {
                throw new Error("泊松分布参数无效。需要速率参数 lambda");
            }
            isHelp = 0;
            break;

        case 't':
        case 'chi_squared':
            // 指令格式: dtbt t <df> 或 dtbt chi_squared <df>
            params.df = parseFloat(cmdArgs.getArgN(2));
            if (isNaN(params.df)) {
                throw new Error(`${distributionType} 分布参数无效。需要自由度 df`);
            }
            isHelp = 0;
            break;

        case 'cset':
            // 配置生成次数
            if (ctx.privilegeLevel < 70){
            isHelp = 1;
            seal.replyToSender(ctx, msg, `用户不在 Trust / Master 列表上,无权操作`);
            break;
            }
            if (!cmdArgs.getArgN(2) || cmdArgs.getArgN(2) > 30){
                // seal.vars.intSet(ctx, `$groundCount`, 1);
                roundCount = 1;
                seal.replyToSender(ctx, msg, `非法参数 ${cmdArgs.getArgN(2)} ,已经设置为默认值1`);
                console.warn(`非法参数 ${cmdArgs.getArgN(2)} ,已经设置为默认值1`);
                isHelp = 1;
                break;
            }
            // seal.vars.intSet(ctx, `$groundCount`, cmdArgs.getArgN(2));
            // let roundCount = seal.vars.intGet(ctx, `$groundCount`)[0];
            // ✗防止嵌套问题
            // ✓我也不知道这是啥了
            // console.log('当前 roundCount = ', roundCount);
            roundCount = cmdArgs.getArgN(2);
            seal.replyToSender(ctx, msg, `已经设置为生成 ${roundCount} 轮`);
            isHelp = 1;
            // 避免无意义输出哈
            // 懒得改了，打补丁万岁（）
            break;

        case 'help':
            // 帮助命令
            let help = '>>生成正态分布、泊松分布、卡方分布和 t 分布的随机数\n→正态分布由均值 (μ) 和标准差 (σ) 决定\nUSE: dtbt normal <均值> <标准差>\n→泊松分布由速率参数 (λ) 决定，表示在给定时间段内的平均事件发生次数\nUSE: dtbt poisson <速率>\nt 分布由自由度 (df) 决定\nUSE: dtbt t <自由度>\n→卡方分布同样由自由度 (df) 决定\nUSE: dtbt chi_squared <自由度>\n>>使用 dtbt cset [轮数]即可配置批量生成,如果没有填写轮数将会恢复到生成1次(最多30轮 所有群同步 重载恢复)'
            seal.replyToSender(ctx, msg, help);
            isHelp = 1;
            break;

        default:
            isHelp = 0;
            throw new Error(`不支持的类型: ${distributionType}`);
    }

    // 调用生成器并输出结果
    result = '' ;
    // 置空 result
    
    // console.log('当前 seal方法roundCount = ', seal.vars.intGet(ctx, `$groundCount`)[0]);
    // 我也不知道我在干什么了，就这样吧
    if (isHelp == 0){
        // let roundCount = seal.vars.intGet(ctx, `$groundCount`)[0];
        // console.log('当前 roundCount = ', roundCount);
        for (let i = 0; i < roundCount; i++) {
            // console.log('当前 i = ', i);
        
            result = result + generateDistribution(distributionType, params) + `\n`;
        }
        // 笨蛋某人偷偷打个补丁
        seal.replyToSender(ctx, msg, `成功生成\n类型: ${distributionType}\n值: \n${result}`);
        
    }


    } catch (error) {
    // 捕获错误
    seal.replyToSender(ctx, msg, `指令处理失败: ${error.message}`)
    console.error(`指令处理失败: ${error.message}`);
    }
    
    return seal.ext.newCmdExecuteResult(true); 
    // 命令执行成功
};

ext.cmdMap["dtbt"] = cmdDistributionDice ;

}