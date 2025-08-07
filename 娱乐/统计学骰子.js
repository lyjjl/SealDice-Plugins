// ==UserScript==
// @name        统计学骰子
// @author       某人
// @version      1.1.0
// @description  纯娱乐的统计学骰子，笨蛋某人不要忘了指令是 .dtbt | .dtbt help 查看帮助
// @timestamp    1752512052
// @license      MIT
// @homepageURL   https://github.com/lyjjl
// ==/UserScript==

// 写了图一乐呵，大佬轻喷，我是菜鸡哇

/**
 * 生成器类 - 使用自定义 Xoroshiro128+ PRNG
 */
class DistributionGenerator {

    /**
     * Xoroshiro128+ PRNG
     * @type {Array<number>}
     */
    static #s0; // 初始种子值 1
    static #s1; // 初始种子值 2

    /**
     * Box-Muller 变换的缓存变量
     * @type {number|null}
     */
    static #nextNormal = null;

    // 静态初始化块：在类首次加载时执行一次，用于自动播种
    static {
        const timestamp = Date.now();
        // 派生两个种子
        const seed0 = timestamp;
        const seed1 = (timestamp ^ 0x9E3779B9) + (timestamp >>> 17); 
        // 别问我为什么是 0x9E3779B（）我也不明白原理
        
        // 调用 setSeed 方法来设置初始状态
        DistributionGenerator.setSeed(seed0 || 1, seed1 || 1); // 确保种子非零
    }

    /**
     * Xoroshiro128+ PRNG 的核心函数。
     * 生成一个介于 0（包含）和 1（不包含）之间的伪随机浮点数。
     * @returns {number} 0 <= x < 1
     */
    static #customRandom() {
        // 实现 Xoroshiro128+ 算法
        // 好吧，这里我不会，抄作业快乐
        
        let s0 = DistributionGenerator.#s0;
        let s1 = DistributionGenerator.#s1;

        const result = s0 + s1; // 简单的加法

        s1 ^= s0; // s1 = s1 XOR s0;

        // 位移操作 (left/right shifts)
        // rotl(x, k) = (x << k) | (x >>> (32 - k)) for 32-bit
        s0 = ((s0 << 27) | (s0 >>> 5)) ^ s1 ^ ((s1 << 17) | (s1 >>> 15));
        s1 = ((s1 << 13) | (s1 >>> 19));
        
        // 确保状态值在可接受的范围内，避免精度问题
        DistributionGenerator.#s0 = s0;
        DistributionGenerator.#s1 = s1;

        // 将结果转换为 [0, 1) 的浮点数
        // `>>> 0` 确保结果是无符号 32 位整数，然后除以 2^32 来得到 [0, 1) 的浮点数。
        return (result >>> 0) / (0xFFFFFFFF + 1);
    }

    /**
     * 设置 Xoroshiro128+ PRNG 的种子。
     * @param {number} seed0 - 第一个种子值。
     * @param {number} seed1 - 第二个种子值。
     */
    static setSeed(seed0, seed1) {
        // 确保种子非零，否则 PRNG 会卡在零状态
        DistributionGenerator.#s0 = seed0 || 1; 
        DistributionGenerator.#s1 = seed1 || 1;
        DistributionGenerator.#nextNormal = null; // 清除 Box-Muller 缓存
    }

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
            // 使用自定义的随机数源
            u = this.#customRandom() * 2 - 1; 
            v = this.#customRandom() * 2 - 1;
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
            p *= this.#customRandom(); // 使用自定义的随机数源
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
            throw new Error("正态分布需要 mean 和 stdDev 参数。");

        case 'poisson':
            if (typeof params.lambda === 'number') {
                return DistributionGenerator.randPoisson(params.lambda);
            }
            throw new Error("泊松分布需要 lambda 参数。");

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
            console.error(`不支持的类型：${type}`);
            return null;
    }
};

if (!seal.ext.find('统计学骰子')){
const ext = seal.ext.new('统计学骰子', '某人', '1.1.0');
seal.ext.register(ext);

// seal.vars.intSet(ctx, `$groundCount`, 1);
// 没用明白上面这个，呜呜呜
let roundCount = 1;
// 生成次数

let cmdDistributionDice = seal.ext.newCmdItemInfo();
cmdDistributionDice.name = '统计学骰子'; // 命令名称
cmdDistributionDice.help = '>>生成正态分布、泊松分布、卡方分布和 t 分布的随机数\n→正态分布由均值 (μ) 和标准差 (σ) 决定\nUSE: dtbt normal <均值> <标准差>\n→泊松分布由速率参数 (λ) 决定，表示在给定时间段内的平均事件发生次数\nUSE: dtbt poisson <速率>\nt 分布由自由度 (df) 决定\nUSE: dtbt t <自由度>\n→卡方分布同样由自由度 (df) 决定\nUSE: dtbt chi_squared <自由度>\n>>使用 dtbt cset [轮数] 即可配置批量生成，如果没有填写轮数将会恢复到生成 1 次 (最多 30 轮 所有群同步 重载恢复)';

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
            // 指令格式：dtbt normal <mean> <stdDev>
            params.mean = parseFloat(cmdArgs.getArgN(2));
            params.stdDev = parseFloat(cmdArgs.getArgN(3));
            if (isNaN(params.mean) || isNaN(params.stdDev)) {
                throw new Error("正态分布参数无效。需要均值和标准差");
            }
            isHelp = 0;
            break;

        case 'poisson':
            // 指令格式：dtbt poisson <lambda>
            params.lambda = parseFloat(cmdArgs.getArgN(2));
            if (isNaN(params.lambda)) {
                throw new Error("泊松分布参数无效。需要速率参数 lambda");
            }
            isHelp = 0;
            break;

        case 't':
        case 'chi_squared':
            // 指令格式：dtbt t <df> 或 dtbt chi_squared <df>
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
                seal.replyToSender(ctx, msg, `非法参数 ${cmdArgs.getArgN(2)} ,已经设置为默认值 1`);
                console.warn(`非法参数 ${cmdArgs.getArgN(2)} ,已经设置为默认值 1`);
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
            let help = '>>生成正态分布、泊松分布、卡方分布和 t 分布的随机数\n→正态分布由均值 (μ) 和标准差 (σ) 决定\nUSE: dtbt normal <均值> <标准差>\n→泊松分布由速率参数 (λ) 决定，表示在给定时间段内的平均事件发生次数\nUSE: dtbt poisson <速率>\nt 分布由自由度 (df) 决定\nUSE: dtbt t <自由度>\n→卡方分布同样由自由度 (df) 决定\nUSE: dtbt chi_squared <自由度>\n>>使用 dtbt cset [轮数] 即可配置批量生成，如果没有填写轮数将会恢复到生成 1 次 (最多 30 轮 所有群同步 重载恢复)'
            seal.replyToSender(ctx, msg, help);
            isHelp = 1;
            break;

        default:
            isHelp = 0;
            throw new Error(`不支持的类型：${distributionType}`);
    }

    // 调用生成器并输出结果
    result = '' ;
    // 置空 result
    
    // console.log('当前 seal 方法 roundCount = ', seal.vars.intGet(ctx, `$groundCount`)[0]);
    // 我也不知道我在干什么了，就这样吧
    if (isHelp == 0){
        // let roundCount = seal.vars.intGet(ctx, `$groundCount`)[0];
        // console.log('当前 roundCount = ', roundCount);
        for (let i = 0; i < roundCount; i++) {
            // console.log('当前 i = ', i);
        
            result = result + generateDistribution(distributionType, params) + `\n`;
        }
        // 笨蛋某人偷偷打个补丁
        seal.replyToSender(ctx, msg, `成功生成\n类型：${distributionType}\n值：\n${result}`);
        
    }


    } catch (error) {
    // 捕获错误
    seal.replyToSender(ctx, msg, `指令处理失败：${error.message}`)
    console.error(`指令处理失败：${error.message}`);
    }
    
    return seal.ext.newCmdExecuteResult(true); 
    // 命令执行成功
};

ext.cmdMap["dtbt"] = cmdDistributionDice ;

}