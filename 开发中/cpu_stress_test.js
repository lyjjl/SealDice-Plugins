// ==UserScript==
// @name         CPU Stress Test for SealDice (Async & Ramp)
// @author       某人
// @version      1.1.0
// @description  CPU 压力测试插件：通过异步忙循环持续占用 CPU，可配置逐步提升强度，仅在配置开启且重载后自动运行
// @license      MIT
// ==/UserScript==

/**
 * CPU 压力测试扩展名称
 * @type {string}
 */
const CPU_STRESS_EXT_NAME = 'cpu_stress_test';

/**
 * @typedef {Object} CpuStressConfig
 * @property {boolean} enabled 是否启用 CPU 压力测试
 * @property {number} busyMs 每一步中目标忙循环时间(毫秒，初始值)
 * @property {number} intervalMs 每步之间的间隔时间(毫秒，>=0)
 * @property {number} maxSteps 最大执行步骤数(<=0 表示不限制步数)
 * @property {number} maxDurationSec 最大持续时间(秒，<=0 表示不限制时间)
 * @property {number} logEveryNSteps 每多少步输出一次进度日志(<=0 表示不输出周期性进度日志)
 * @property {number} sliceMs 忙循环中每片段的时间上限(毫秒)，到达后尝试await以让出事件循环(>=0，0表示只在busyMs结束时yield)
 * @property {number} intensity 每次内层数学运算的强度系数(正整数，越大耗CPU越多)
 * @property {number} busyMsIncrement 每次提升的busyMs增量(毫秒，>=0，0表示不提升)
 * @property {number} rampEveryNSteps 每执行多少步提升一次busyMs(>0时生效，<=0表示不自动提升)
 * @property {number} busyMsMax busyMs自动提升的上限(毫秒，<=0表示不限制)
 */

/**
 * @typedef {Object} CpuStressState
 * @property {boolean} running 当前是否在执行 CPU 压力测试
 * @property {any|null} timerId 当前 setTimeout 的句柄
 * @property {number} executedSteps 已执行的步骤数
 * @property {number} startTimeMs 测试开始时间戳(毫秒)
 * @property {CpuStressConfig} config 本次测试使用的配置快照
 * @property {string|null} finishedReason 结束原因标记
 * @property {number} currentBusyMs 当前实际使用的 busyMs，会随着 ramp 逐步增长
 */

/**
 * CPU 压力测试的全局状态单例
 * @type {CpuStressState|null}
 */
let cpuStressState = null;

/**
 * 防止 JIT/解释器优化掉运算的垃圾桶变量
 * @type {number}
 */
let cpuStressDummy = 0;

/**
 * 获取或创建 CPU 压力测试扩展对象
 * @returns {seal.ExtInfo}
 */
function getOrCreateCpuExt() {
    /** @type {seal.ExtInfo} */
    let ext = seal.ext.find(CPU_STRESS_EXT_NAME);
    if (!ext) {
        ext = seal.ext.new(CPU_STRESS_EXT_NAME, '某人', '1.1.0');
        seal.ext.register(ext);
    }
    return ext;
}

/**
 * 为 CPU 压力测试扩展注册配置项
 * @param {seal.ExtInfo} ext 扩展对象
 * @returns {void}
 */
function registerCpuStressConfigs(ext) {
    // 危险开关：是否启用 CPU 压力测试
    seal.ext.registerBoolConfig(
        ext,
        'cpuStressEnabled',
        false,
        '【危险】启用后会持续占用大量 CPU，可能导致 SealDice 进程严重卡顿、响应极慢甚至崩溃。仅在可随时重启的测试环境中启用，并在充分理解风险后手动设为 true。'
    );

    // 每步目标忙循环时间(毫秒)，初始值
    seal.ext.registerIntConfig(
        ext,
        'cpuStressBusyMs',
        50,
        '每一步中用于忙循环占用 CPU 的目标时间(毫秒，初始值)。数值越大，每步 CPU 压力越高。'
    );

    // 步骤间隔(毫秒)
    seal.ext.registerIntConfig(
        ext,
        'cpuStressIntervalMs',
        50,
        '每一步之间的间隔时间(毫秒)。0 表示尽可能紧密地调度下一步，仅通过 setTimeout 调度，整体 CPU 占用更高。'
    );

    // 最大步骤数
    seal.ext.registerIntConfig(
        ext,
        'cpuStressMaxSteps',
        0,
        '最大执行步骤数。>0 时达到该步数后自动停止；<=0 表示不限制步数(需配合最大持续时间限制，否则配置视为非法)。'
    );

    // 最大持续时间(秒)
    seal.ext.registerIntConfig(
        ext,
        'cpuStressMaxDurationSec',
        600,
        '最大持续时间(秒)。>0 时达到该时间后自动停止；<=0 表示不限制时间(需配合最大步骤数限制，否则配置视为非法)。'
    );

    // 日志输出频率
    seal.ext.registerIntConfig(
        ext,
        'cpuStressLogEveryNSteps',
        10,
        '每执行多少步输出一次进度日志到控制台。>0 时生效；<=0 时仅输出启动与结束日志，不输出周期性进度日志。'
    );

    // 忙循环切片时长(毫秒)：控制多久yield一次
    seal.ext.registerIntConfig(
        ext,
        'cpuStressSliceMs',
        10,
        '忙循环内部每片段最大执行时间(毫秒)。到达时尝试通过await让出事件循环，避免长时间完全阻塞。0 表示不切片，只在每步结束时yield。'
    );

    // 每轮运算强度
    seal.ext.registerIntConfig(
        ext,
        'cpuStressIntensity',
        1000,
        '每次内层数学运算的强度系数(正整数)，数值越大，同样busyMs下消耗的CPU越多。'
    );

    // busyMs 递增量
    seal.ext.registerIntConfig(
        ext,
        'cpuStressBusyMsIncrement',
        0,
        '每次提升的 busyMs 增量(毫秒)。>0 且 cpuStressRampEveryNSteps>0 时生效，用于让CPU占用随时间逐步升高；0 表示不自动提升。'
    );

    // 每多少步提升一次 busyMs
    seal.ext.registerIntConfig(
        ext,
        'cpuStressRampEveryNSteps',
        0,
        '每执行多少步提升一次 busyMs。>0 且 cpuStressBusyMsIncrement>0 时生效；<=0 表示不自动提升。'
    );

    // busyMs 最大上限
    seal.ext.registerIntConfig(
        ext,
        'cpuStressBusyMsMax',
        0,
        'busyMs 自动提升的上限(毫秒)。>0 时 busyMs 不会超过该值；<=0 表示不限制上限。'
    );
}

/**
 * 从扩展配置中构建 CPU 压力测试配置对象
 * 若配置非法，在控制台输出错误并返回 null
 * @param {seal.ExtInfo} ext 扩展对象
 * @returns {CpuStressConfig|null}
 */
function buildCpuStressConfig(ext) {
    const enabled = seal.ext.getBoolConfig(ext, 'cpuStressEnabled');
    const busyMs = seal.ext.getIntConfig(ext, 'cpuStressBusyMs');
    const intervalMs = seal.ext.getIntConfig(ext, 'cpuStressIntervalMs');
    const maxSteps = seal.ext.getIntConfig(ext, 'cpuStressMaxSteps');
    const maxDurationSec = seal.ext.getIntConfig(ext, 'cpuStressMaxDurationSec');
    const logEveryNSteps = seal.ext.getIntConfig(ext, 'cpuStressLogEveryNSteps');
    const sliceMs = seal.ext.getIntConfig(ext, 'cpuStressSliceMs');
    const intensity = seal.ext.getIntConfig(ext, 'cpuStressIntensity');
    const busyMsIncrement = seal.ext.getIntConfig(ext, 'cpuStressBusyMsIncrement');
    const rampEveryNSteps = seal.ext.getIntConfig(ext, 'cpuStressRampEveryNSteps');
    const busyMsMax = seal.ext.getIntConfig(ext, 'cpuStressBusyMsMax');

    /** @type {CpuStressConfig} */
    const config = {
        enabled,
        busyMs,
        intervalMs,
        maxSteps,
        maxDurationSec,
        logEveryNSteps,
        sliceMs,
        intensity,
        busyMsIncrement,
        rampEveryNSteps,
        busyMsMax
    };

    // 未启用时直接返回配置，由调用方决定不启动
    if (!enabled) {
        return config;
    }

    // 启用状态下的合法性校验
    if (busyMs <= 0) {
        console.error('[CpuStress] 配置错误：cpuStressBusyMs 必须为正整数。当前值=', busyMs);
        return null;
    }

    if (intervalMs < 0) {
        console.error('[CpuStress] 配置错误：cpuStressIntervalMs 不能为负值。当前值=', intervalMs);
        return null;
    }

    if (maxSteps <= 0 && maxDurationSec <= 0) {
        console.error(
            '[CpuStress] 配置错误：cpuStressMaxSteps 与 cpuStressMaxDurationSec 不能同时为非正值，否则无法自动停止测试。'
        );
        return null;
    }

    if (sliceMs < 0) {
        console.error('[CpuStress] 配置错误：cpuStressSliceMs 不能为负值。当前值=', sliceMs);
        return null;
    }

    if (intensity <= 0) {
        console.error('[CpuStress] 配置错误：cpuStressIntensity 必须为正整数。当前值=', intensity);
        return null;
    }

    // 递增相关参数允许为0或正数；负数直接视为0(不启用递增)，这里做个温和修正
    if (config.busyMsIncrement < 0) {
        console.log('[CpuStress] 提示：cpuStressBusyMsIncrement 为负值，视为0(不自动提升)。当前值=', config.busyMsIncrement);
        config.busyMsIncrement = 0;
    }

    if (config.rampEveryNSteps < 0) {
        console.log('[CpuStress] 提示：cpuStressRampEveryNSteps 为负值，视为0(不自动提升)。当前值=', config.rampEveryNSteps);
        config.rampEveryNSteps = 0;
    }

    if (config.busyMsMax < 0) {
        console.log('[CpuStress] 提示：cpuStressBusyMsMax 为负值，视为0(不限制上限)。当前值=', config.busyMsMax);
        config.busyMsMax = 0;
    }

    return config;
}

/**
 * 初始化 CPU 压力测试：
 * - 构建配置
 * - 根据配置决定是否启动压力测试
 * @param {seal.ExtInfo} ext 扩展对象
 * @returns {void}
 */
function initCpuStress(ext) {
    const config = buildCpuStressConfig(ext);

    if (!config) {
        console.log('[CpuStress] 配置非法，CPU 压力测试未启动。');
        return;
    }

    if (!config.enabled) {
        console.log('[CpuStress] 危险开关未启用(cpuStressEnabled=false)，CPU 压力测试处于保护状态，不会执行。');
        return;
    }

    /** @type {CpuStressState} */
    cpuStressState = {
        running: false,
        timerId: null,
        executedSteps: 0,
        startTimeMs: 0,
        config: config,
        finishedReason: null,
        currentBusyMs: config.busyMs
    };

    startCpuStressLoop();
}

/**
 * 启动 CPU 压力测试循环：
 * - 初始化状态
 * - 输出启动日志
 * - 调度第一步
 * @returns {void}
 */
function startCpuStressLoop() {
    if (!cpuStressState) {
        console.error('[CpuStress] 内部错误：cpuStressState 未初始化，无法启动 CPU 压力测试。');
        return;
    }

    const state = cpuStressState;
    state.running = true;
    state.executedSteps = 0;
    state.startTimeMs = Date.now();
    state.finishedReason = null;
    state.timerId = null;

    logCpuStressProgress('start');
    scheduleNextCpuStep();
}

/**
 * 根据配置调度下一次 CPU 压力测试步骤
 * @returns {void}
 */
function scheduleNextCpuStep() {
    if (!cpuStressState || !cpuStressState.running) {
        return;
    }

    const state = cpuStressState;
    const cfg = state.config;

    const interval = cfg.intervalMs >= 0 ? cfg.intervalMs : 0;
    // 忽略返回的 Promise，仅利用异步函数本身
    state.timerId = setTimeout(runCpuStressStep, interval);
}

/**
 * 执行一次 CPU 压力测试步骤(异步)：
 * - 检查停止条件
 * - 异步忙循环占用 CPU
 * - 自动ramp提升busyMs
 * - 输出进度日志
 * - 调度下一次执行
 * @returns {Promise<void>}
 */
async function runCpuStressStep() {
    if (!cpuStressState || !cpuStressState.running) {
        return;
    }

    const state = cpuStressState;
    const cfg = state.config;
    const now = Date.now();
    const elapsedSec = (now - state.startTimeMs) / 1000;

    // 时间终止条件
    if (cfg.maxDurationSec > 0 && elapsedSec >= cfg.maxDurationSec) {
        finishCpuStress('maxDuration');
        return;
    }

    // 步数终止条件
    if (cfg.maxSteps > 0 && state.executedSteps >= cfg.maxSteps) {
        finishCpuStress('maxSteps');
        return;
    }

    // 执行异步忙循环
    try {
        await busyWorkAsync(state.currentBusyMs, cfg.sliceMs, cfg.intensity);
    } catch (e) {
        console.error('[CpuStress] 执行忙循环时出现异常，将结束测试。异常信息：', e);
        finishCpuStress('exception');
        return;
    }

    state.executedSteps += 1;

    // 自动提升 busyMs，让 CPU 占用随步数逐渐升高
    if (cfg.busyMsIncrement > 0 && cfg.rampEveryNSteps > 0) {
        if (state.executedSteps % cfg.rampEveryNSteps === 0) {
            let nextBusy = state.currentBusyMs + cfg.busyMsIncrement;
            if (cfg.busyMsMax > 0 && nextBusy > cfg.busyMsMax) {
                nextBusy = cfg.busyMsMax;
            }
            if (nextBusy !== state.currentBusyMs) {
                state.currentBusyMs = nextBusy;
                console.log(
                    '[CpuStress] ramp：currentBusyMs 提升至 ' +
                    state.currentBusyMs + ' ms'
                );
            }
        }
    }

    // 周期性进度日志
    if (cfg.logEveryNSteps > 0 && (state.executedSteps % cfg.logEveryNSteps === 0)) {
        logCpuStressProgress('step');
    }

    // 调度下一次步骤
    scheduleNextCpuStep();
}

/**
 * 在指定时间内进行异步忙循环，占用 CPU：
 * - 使用 Date.now 控制总时长
 * - 切片执行数学运算，超过 sliceMs 就await一次，让出事件循环
 * @param {number} busyMs 目标忙循环时间(毫秒)
 * @param {number} sliceMs 切片时长(毫秒，>=0)
 * @param {number} intensity 每片段运算强度(正整数)
 * @returns {Promise<void>}
 */
async function busyWorkAsync(busyMs, sliceMs, intensity) {
    if (busyMs <= 0 || intensity <= 0) {
        return;
    }

    const targetEnd = Date.now() + busyMs;
    const slice = sliceMs > 0 ? sliceMs : busyMs; // sliceMs=0时，整个busyMs视为单一片段
    let lastSliceStart = Date.now();

    while (Date.now() < targetEnd) {
        // 在一个切片内做大量数学运算
        const now = Date.now();
        if (now - lastSliceStart >= slice) {
            // 片段结束，yield 一下，让出事件循环
            lastSliceStart = Date.now();
            await Promise.resolve();
            continue;
        }

        // 运算强度：intensity 越大，CPU越忙
        for (let i = 0; i < intensity; i += 1) {
            // 线性同余伪随机 + 简单位运算，避免被优化掉
            cpuStressDummy = (cpuStressDummy * 1664525 + 1013904223) | 0;
            const v = cpuStressDummy & 0xffff;
            cpuStressDummy ^= (v * v) | 0;
        }
    }
}

/**
 * 结束 CPU 压力测试：
 * - 停止后续调度
 * - 输出结束日志
 * @param {string} reason 结束原因标记，如 "maxSteps" / "maxDuration" / "exception"
 * @returns {void}
 */
function finishCpuStress(reason) {
    if (!cpuStressState) {
        return;
    }

    const state = cpuStressState;
    state.running = false;
    state.finishedReason = reason;

    if (state.timerId !== null && state.timerId !== undefined) {
        clearTimeout(state.timerId);
        state.timerId = null;
    }

    logCpuStressProgress(reason);
}

/**
 * 输出 CPU 压力测试的进度或结束信息到控制台
 * @param {string} tag 日志标签：start/step/maxSteps/maxDuration/exception等
 * @returns {void}
 */
function logCpuStressProgress(tag) {
    if (!cpuStressState) {
        console.log('[CpuStress] 状态为空，无法输出日志。tag=', tag);
        return;
    }

    const state = cpuStressState;
    const cfg = state.config;
    const now = Date.now();
    const elapsedSec = (now - state.startTimeMs) / 1000;

    if (tag === 'start') {
        console.log(
            '[CpuStress] 启动 CPU 压力测试：' +
            'enabled=' + cfg.enabled +
            ', busyMs=' + cfg.busyMs +
            ', intervalMs=' + cfg.intervalMs +
            ', maxSteps=' + cfg.maxSteps +
            ', maxDurationSec=' + cfg.maxDurationSec +
            ', logEveryNSteps=' + cfg.logEveryNSteps +
            ', sliceMs=' + cfg.sliceMs +
            ', intensity=' + cfg.intensity +
            ', busyMsIncrement=' + cfg.busyMsIncrement +
            ', rampEveryNSteps=' + cfg.rampEveryNSteps +
            ', busyMsMax=' + cfg.busyMsMax
        );
        return;
    }

    if (tag === 'step') {
        console.log(
            '[CpuStress] 进度：steps=' + state.executedSteps +
            ', elapsedSec=' + elapsedSec.toFixed(2) +
            ', currentBusyMs=' + state.currentBusyMs +
            ', intervalMs=' + cfg.intervalMs +
            ', intensity=' + cfg.intensity
        );
        return;
    }

    // 结束日志
    console.log(
        '[CpuStress] 结束 CPU 压力测试：reason=' + tag +
        ', steps=' + state.executedSteps +
        ', elapsedSec=' + elapsedSec.toFixed(2) +
        ', lastBusyMs=' + state.currentBusyMs
    );
}

/**
 * 脚本入口：
 * - 获取/创建扩展
 * - 注册配置项
 * - 根据配置尝试初始化并启动 CPU 压力测试
 */
(function main() {
    /** @type {seal.ExtInfo} */
    const ext = getOrCreateCpuExt();
    registerCpuStressConfigs(ext);
    initCpuStress(ext);
})();
