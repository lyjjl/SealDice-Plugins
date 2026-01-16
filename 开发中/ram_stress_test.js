// ==UserScript==
// @name         Ram Stress Test for SealDice
// @author       某人
// @version      1.0.0
// @description  内存压力测试插件：通过持续分配大数组占用RAM，仅在配置开启且重载后自动运行
// @license      MIT
// ==/UserScript==

/**
 * 扩展名称常量
 * @type {string}
 */
const RAM_STRESS_EXT_NAME = 'ram_stress_test';

/**
 * @typedef {Object} RamStressConfig
 * @property {boolean} enabled 是否启用内存压力测试
 * @property {number} chunkSizeMB 每块预计分配大小(MB)
 * @property {number} maxChunks 最大块数(<=0 表示不限制块数)
 * @property {number} intervalMs 每次分配之间的间隔(毫秒，>=0)
 * @property {number} logEveryNChunks 每多少块输出一次进度日志(<=0 表示不输出周期性进度日志)
 * @property {number} maxDurationSec 最大持续时间(秒，<=0 表示不限制时间)
 */

/**
 * @typedef {Object} RamStressState
 * @property {boolean} running 当前是否在执行压力测试
 * @property {any|null} timerId 当前setTimeout的句柄
 * @property {any[]} chunks 已分配的块引用数组，用于保持内存占用
 * @property {number} allocatedChunks 已成功分配的块计数
 * @property {number} startTimeMs 测试开始时间戳(毫秒)
 * @property {RamStressConfig} config 本次测试使用的配置快照
 * @property {string|null} finishedReason 结束原因标记
 */

/**
 * 内存压力测试的全局状态单例
 * @type {RamStressState|null}
 */
let ramStressState = null;

/**
 * 获取或创建扩展对象
 * @returns {seal.ExtInfo}
 */
function getOrCreateExt() {
    /** @type {seal.ExtInfo} */
    let ext = seal.ext.find(RAM_STRESS_EXT_NAME);
    if (!ext) {
        ext = seal.ext.new(RAM_STRESS_EXT_NAME, '某人', '1.0.0');
        seal.ext.register(ext);
    }
    return ext;
}

/**
 * 为扩展注册内存压力测试相关配置项
 * @param {seal.ExtInfo} ext 扩展对象
 * @returns {void}
 */
function registerRamStressConfigs(ext) {
    // 危险开关：是否启用内存压力测试
    seal.ext.registerBoolConfig(
        ext,
        'ramStressEnabled',
        false,
        '【危险】启用后会持续尝试占用大量内存，可能导致 SealDice 进程严重卡顿、崩溃，甚至影响宿主系统。仅在可随时重启的测试环境中启用，并在明确理解风险后手动设为 true。'
    );

    // 每块预估大小(MB)
    seal.ext.registerIntConfig(
        ext,
        'ramStressChunkSizeMB',
        100,
        '每次分配的大数组预估占用大小(MB)。数值越大，单次分配的内存压力越高。'
    );

    // 最大块数
    seal.ext.registerIntConfig(
        ext,
        'ramStressMaxChunks',
        1024,
        '最大分配块数。>0 时达到该块数后自动停止；<=0 表示不限制块数(需配合最大持续时间限制，否则配置视为非法)。'
    );

    // 分配间隔(毫秒)
    seal.ext.registerIntConfig(
        ext,
        'ramStressIntervalMs',
        500,
        '每次分配之间的间隔时间(毫秒)。0 表示尽可能快地连续分配，仅通过setTimeout调度。间隔越小，内存增长越快、卡顿风险越高。'
    );

    // 日志输出频率
    seal.ext.registerIntConfig(
        ext,
        'ramStressLogEveryNChunks',
        10,
        '每分配多少块输出一次进度日志到控制台。>0 时生效；<=0 时仅输出启动与结束日志，不输出周期性进度日志。'
    );

    // 最大持续时间(秒)
    seal.ext.registerIntConfig(
        ext,
        'ramStressMaxDurationSec',
        600,
        '最大持续时间(秒)。>0 时达到该时间后自动停止；<=0 表示不限制时间(需配合最大块数限制，否则配置视为非法)。'
    );
}

/**
 * 从扩展配置中构建内存压力测试配置对象
 * 若配置非法，返回 null 并在控制台输出错误
 * @param {seal.ExtInfo} ext 扩展对象
 * @returns {RamStressConfig|null}
 */
function buildRamStressConfig(ext) {
    const enabled = seal.ext.getBoolConfig(ext, 'ramStressEnabled');
    const chunkSizeMB = seal.ext.getIntConfig(ext, 'ramStressChunkSizeMB');
    const maxChunks = seal.ext.getIntConfig(ext, 'ramStressMaxChunks');
    const intervalMs = seal.ext.getIntConfig(ext, 'ramStressIntervalMs');
    const logEveryNChunks = seal.ext.getIntConfig(ext, 'ramStressLogEveryNChunks');
    const maxDurationSec = seal.ext.getIntConfig(ext, 'ramStressMaxDurationSec');

    /** @type {RamStressConfig} */
    const config = {
        enabled,
        chunkSizeMB,
        maxChunks,
        intervalMs,
        logEveryNChunks,
        maxDurationSec
    };

    // 若未启用，直接返回配置，由调用方决定不启动
    if (!enabled) {
        return config;
    }

    // 以下为启用状态下的合法性校验
    if (chunkSizeMB <= 0) {
        console.error('[RamStress] 配置错误：ramStressChunkSizeMB 必须为正整数。当前值=', chunkSizeMB);
        return null;
    }

    if (intervalMs < 0) {
        console.error('[RamStress] 配置错误：ramStressIntervalMs 不能为负值。当前值=', intervalMs);
        return null;
    }

    if (maxChunks <= 0 && maxDurationSec <= 0) {
        console.error(
            '[RamStress] 配置错误：ramStressMaxChunks 与 ramStressMaxDurationSec 不能同时为非正值，否则无法自动停止测试。'
        );
        return null;
    }

    return config;
}

/**
 * 初始化内存压力测试
 * 脚本加载时调用：构建配置并决定是否启动测试
 * @param {seal.ExtInfo} ext 扩展对象
 * @returns {void}
 */
function initRamStress(ext) {
    const config = buildRamStressConfig(ext);

    if (!config) {
        console.log('[RamStress] 配置非法，内存压力测试未启动。');
        return;
    }

    if (!config.enabled) {
        console.log('[RamStress] 危险开关未启用(ramStressEnabled=false)，内存压力测试处于保护状态，不会执行。');
        return;
    }

    /** @type {RamStressState} */
    ramStressState = {
        running: false,
        timerId: null,
        chunks: [],
        allocatedChunks: 0,
        startTimeMs: 0,
        config: config,
        finishedReason: null
    };

    startRamStressLoop();
}

/**
 * 启动内存压力测试循环
 * 设置初始状态并发出启动日志，然后调度第一步
 * @returns {void}
 */
function startRamStressLoop() {
    if (!ramStressState) {
        console.error('[RamStress] 内部错误：ramStressState 未初始化，无法启动压力测试。');
        return;
    }

    const state = ramStressState;
    state.running = true;
    state.startTimeMs = Date.now();
    state.allocatedChunks = 0;
    state.chunks = [];
    state.finishedReason = null;

    logRamStressProgress('start');
    scheduleNextStep();
}

/**
 * 根据配置调度下一次内存分配步骤
 * @returns {void}
 */
function scheduleNextStep() {
    if (!ramStressState || !ramStressState.running) {
        return;
    }

    const state = ramStressState;
    const cfg = state.config;
    const interval = cfg.intervalMs >= 0 ? cfg.intervalMs : 0;

    state.timerId = setTimeout(runRamStressStep, interval);
}

/**
 * 执行一次内存压力测试步骤：
 * - 检查停止条件
 * - 分配新的内存块
 * - 输出进度日志
 * - 调度下一次执行
 * @returns {void}
 */
function runRamStressStep() {
    if (!ramStressState || !ramStressState.running) {
        return;
    }

    const state = ramStressState;
    const cfg = state.config;
    const now = Date.now();
    const elapsedSec = (now - state.startTimeMs) / 1000;

    // 时间终止条件
    if (cfg.maxDurationSec > 0 && elapsedSec >= cfg.maxDurationSec) {
        finishRamStress('maxDuration');
        return;
    }

    // 块数终止条件
    if (cfg.maxChunks > 0 && state.allocatedChunks >= cfg.maxChunks) {
        finishRamStress('maxChunks');
        return;
    }

    // 分配新块
    try {
        const chunk = allocateChunk(cfg.chunkSizeMB);
        state.chunks.push(chunk);
        state.allocatedChunks += 1;
    } catch (e) {
        console.error('[RamStress] 分配内存块时出现异常，将结束测试。异常信息：', e);
        finishRamStress('exception');
        return;
    }

    // 周期性进度日志
    if (cfg.logEveryNChunks > 0 && (state.allocatedChunks % cfg.logEveryNChunks === 0)) {
        logRamStressProgress('step');
    }

    // 调度下一次
    scheduleNextStep();
}

/**
 * 按预估大小(MB)分配一个数组块，并填充使其实际占用内存
 * @param {number} chunkSizeMB 目标块大小，单位MB
 * @returns {any[]} 填充后的数组块
 */
function allocateChunk(chunkSizeMB) {
    // 估算每个数组元素大约占8字节，仅用于计算元素数量
    const BYTES_PER_ELEMENT = 8;
    const targetBytes = chunkSizeMB * 1024 * 1024;
    let elementCount = Math.floor(targetBytes / BYTES_PER_ELEMENT);

    if (elementCount <= 0) {
        elementCount = 1;
    }

    const arr = new Array(elementCount);
    for (let i = 0; i < elementCount; i += 1) {
        // 使用固定数字填充，确保数组为密集结构而非稀疏数组
        arr[i] = 0;
    }

    return arr;
}

/**
 * 结束内存压力测试：
 * - 停止后续调度
 * - 保留已分配的块以维持内存占用
 * - 输出结束日志
 * @param {string} reason 结束原因标记，如 "maxChunks" / "maxDuration" / "exception"
 * @returns {void}
 */
function finishRamStress(reason) {
    if (!ramStressState) {
        return;
    }

    const state = ramStressState;
    state.running = false;
    state.finishedReason = reason;

    if (state.timerId !== null && state.timerId !== undefined) {
        clearTimeout(state.timerId);
        state.timerId = null;
    }

    // 不清空 chunks，保留已占用内存
    logRamStressProgress(reason);
}

/**
 * 输出内存压力测试的进度或结束信息到控制台
 * @param {string} tag 日志标签：start/step/maxChunks/maxDuration/exception等
 * @returns {void}
 */
function logRamStressProgress(tag) {
    if (!ramStressState) {
        console.log('[RamStress] 状态为空，无法输出日志。tag=', tag);
        return;
    }

    const state = ramStressState;
    const cfg = state.config;
    const now = Date.now();
    const elapsedSec = (now - state.startTimeMs) / 1000;
    const approxTotalMB = state.allocatedChunks * cfg.chunkSizeMB;

    if (tag === 'start') {
        console.log(
            '[RamStress] 启动内存压力测试：' +
            'enabled=' + cfg.enabled +
            ', chunkSizeMB=' + cfg.chunkSizeMB +
            ', maxChunks=' + cfg.maxChunks +
            ', intervalMs=' + cfg.intervalMs +
            ', logEveryNChunks=' + cfg.logEveryNChunks +
            ', maxDurationSec=' + cfg.maxDurationSec
        );
        return;
    }

    if (tag === 'step') {
        console.log(
            '[RamStress] 进度：chunks=' + state.allocatedChunks +
            ', approxTotalMB=' + approxTotalMB +
            ', elapsedSec=' + elapsedSec.toFixed(2)
        );
        return;
    }

    // 结束类型日志
    console.log(
        '[RamStress] 结束内存压力测试：reason=' + tag +
        ', chunks=' + state.allocatedChunks +
        ', approxTotalMB=' + approxTotalMB +
        ', elapsedSec=' + elapsedSec.toFixed(2)
    );
}

// 扩展初始化：创建/获取扩展 -> 注册配置项 -> 尝试初始化并启动内存压力测试
(function main() {
    /** @type {seal.ExtInfo} */
    const ext = getOrCreateExt();
    registerRamStressConfigs(ext);
    initRamStress(ext);
})();
