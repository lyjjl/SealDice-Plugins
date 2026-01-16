// ==UserScript==
// @name         cfg_stress_test
// @author       某人
// @version      1.0.0
// @description  Register大量配置项用于压力测试（仅日志进度，无其他功能）
// @timestamp    0
// @license      MIT
// ==/UserScript==

(() => {
    const EXT_NAME = 'cfg_stress_test';
    const AUTHOR = '某人';
    const VERSION = '1.0.0';

    const PER_TYPE = 10000;
    const TYPES = ['BOOL', 'STR', 'INT', 'FLOAT', 'TPL', 'OPT'];
    const TOTAL = PER_TYPE * TYPES.length;

    /** @type {seal.ExtInfo} */
    let ext = seal.ext.find(EXT_NAME);
    if (!ext) {
        ext = seal.ext.new(EXT_NAME, AUTHOR, VERSION);
        seal.ext.register(ext);
    }

    /**
     * @param {number} n
     * @returns {string}
     */
    function pad3(n) {
        const s = String(n);
        if (s.length >= 3) return s;
        if (s.length === 2) return `0${s}`;
        return `00${s}`;
    }

    /**
     * @param {string} type
     * @param {number} doneType
     * @param {number} doneAll
     */
    function logProgress(type, doneType, doneAll) {
        const pctType = Math.floor((doneType / PER_TYPE) * 100);
        const pctAll = Math.floor((doneAll / TOTAL) * 100);
        console.log(
            `[${EXT_NAME}] ${type} ${doneType}/${PER_TYPE} (${pctType}%) | total ${doneAll}/${TOTAL} (${pctAll}%)`,
        );
    }

    console.log(`[${EXT_NAME}] START register configs: ${TOTAL} items (${PER_TYPE} per type)`);

    let doneAll = 0;

    // ----------------------------
    // BOOL x50
    // ----------------------------
    console.log(`[${EXT_NAME}] START BOOL`);
    for (let i = 1; i <= PER_TYPE; i++) {
        const key = `TST_BOOL_${pad3(i)}`;
        const def = i % 2 === 0; // even true, odd false
        const desc = `压力测试 BOOL #${i}`;
        seal.ext.registerBoolConfig(ext, key, def, desc);

        doneAll++;
        if (i % 10 === 0) logProgress('BOOL', i, doneAll);
    }
    console.log(`[${EXT_NAME}] DONE BOOL 50/50`);

    // ----------------------------
    // STRING x50
    // ----------------------------
    console.log(`[${EXT_NAME}] START STR`);
    for (let i = 1; i <= PER_TYPE; i++) {
        const key = `TST_STR_${pad3(i)}`;
        const def = `value_${i}`;
        const desc = `压力测试 STRING #${i}`;
        seal.ext.registerStringConfig(ext, key, def, desc);

        doneAll++;
        if (i % 10 === 0) logProgress('STR', i, doneAll);
    }
    console.log(`[${EXT_NAME}] DONE STR 50/50`);

    // ----------------------------
    // INT x50
    // ----------------------------
    console.log(`[${EXT_NAME}] START INT`);
    for (let i = 1; i <= PER_TYPE; i++) {
        const key = `TST_INT_${pad3(i)}`;
        const def = i * 10;
        const desc = `压力测试 INT #${i}`;
        seal.ext.registerIntConfig(ext, key, def, desc);

        doneAll++;
        if (i % 10 === 0) logProgress('INT', i, doneAll);
    }
    console.log(`[${EXT_NAME}] DONE INT 50/50`);

    // ----------------------------
    // FLOAT x50
    // ----------------------------
    console.log(`[${EXT_NAME}] START FLOAT`);
    for (let i = 1; i <= PER_TYPE; i++) {
        const key = `TST_FLOAT_${pad3(i)}`;
        const def = i + 0.5;
        const desc = `压力测试 FLOAT #${i}`;
        seal.ext.registerFloatConfig(ext, key, def, desc);

        doneAll++;
        if (i % 10 === 0) logProgress('FLOAT', i, doneAll);
    }
    console.log(`[${EXT_NAME}] DONE FLOAT 50/50`);

    // ----------------------------
    // TEMPLATE (string[]) x50
    // ----------------------------
    console.log(`[${EXT_NAME}] START TPL`);
    for (let i = 1; i <= PER_TYPE; i++) {
        const key = `TST_TPL_${pad3(i)}`;
        const def = [`a_${i}`, `b_${i}`, `c_${i}`];
        const desc = `压力测试 TEMPLATE(string[]) #${i}`;
        seal.ext.registerTemplateConfig(ext, key, def, desc);

        doneAll++;
        if (i % 10 === 0) logProgress('TPL', i, doneAll);
    }
    console.log(`[${EXT_NAME}] DONE TPL 50/50`);

    // ----------------------------
    // OPTION x50
    // ----------------------------
    console.log(`[${EXT_NAME}] START OPT`);
    const optList = ['A', 'B', 'C', 'D'];
    for (let i = 1; i <= PER_TYPE; i++) {
        const key = `TST_OPT_${pad3(i)}`;
        const def = optList[(i - 1) % optList.length];
        const desc = `压力测试 OPTION #${i}`;
        seal.ext.registerOptionConfig(ext, key, def, optList, desc);

        doneAll++;
        if (i % 10 === 0) logProgress('OPT', i, doneAll);
    }
    console.log(`[${EXT_NAME}] DONE OPT 50/50`);

    console.log(`[${EXT_NAME}] ALL DONE total ${doneAll}/${TOTAL}`);
})();
