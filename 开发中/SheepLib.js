// ==UserScript==
// @name         SheepLib
// @author       lyjjl
// @version      1.1.0
// @description  一个包含了一些便利的功能和私货的 JavaScript 库，主要用于 SealDice 插件开发 (海豹似乎不支持 require())
// @timestamp    
// @license      MIT
// @homepageURL  https://github.com/lyjjl
// ==/UserScript==

// #############################################################
// #####         由于本人懒得写注释，大量注释由 AI 生成          #####
// ##### 如果出现胡言乱语或者 AI 私自"优化"代码的情况请立即 issue #####
// #############################################################

/*
 * changelog:
 * - 1.0.0: 初始版本
 * - 1.1.0: 添加随机数生成器，支持 Xoshiro256++ 和 MT19937 算法
*/

// === 下方堆放各种工具函数 ===


/**
 * @classdesc 高性能随机数生成器，基于 xoshiro256++ 算法
 */
class _Xoshiro256PlusPlus {
    /**
     * @private
     * 存储 4 个 64 位整数的状态，使用 BigInt 来处理
     */
    #s0;
    #s1;
    #s2;
    #s3;

    /**
     * 构造函数，用一个可选的种子初始化生成器
     * xoshiro256++ 算法要求四个独立的 64 位种子
     * 我们使用 SplitMix64 算法从一个 32 位或 64 位种子生成这四个种子
     * @param {number|bigint} [seed=Date.now()] - 用于初始化生成器的种子
     */
    constructor(seed = Date.now()) {
        // 确保种子为 BigInt
        const initialSeed = typeof seed === 'number' ? BigInt(Math.floor(seed)) : BigInt(seed);

        // 使用 SplitMix64 算法来初始化四个状态变量
        const state = this.#splitmix64(initialSeed);
        this.#s0 = state[0];
        this.#s1 = state[1];
        this.#s2 = state[2];
        this.#s3 = state[3];
    }

    /**
     * @private
     * 64 位旋转操作
     * @param {bigint} x - 要旋转的数
     * @param {number} k - 旋转位数
     * @returns {bigint} 旋转后的数
     */
    #rotl(x, k) {
        // 使用 & 0xffffffffffffffffn 确保结果在 64 位以内
        return ((x << BigInt(k)) | (x >> (64n - BigInt(k)))) & 0xffffffffffffffffn;
    }

    /**
     * @private
     * 使用 SplitMix64 算法从一个种子生成多个高质量的 64 位整数
     * @param {bigint} seed - 单个 64 位种子
     * @returns {bigint[]} - 包含四个 64 位整数的数组
     */
    #splitmix64(seed) {
        let x = seed;
        const results = [];
        for (let i = 0; i < 4; i++) {
            x = x + 0x9e3779b97f4a7c15n;
            let z = x;
            z = (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n;
            z = (z ^ (z >> 27n)) * 0x94d049bb133111ebn;
            z = z ^ (z >> 31n);
            results.push(z);
        }
        return results;
    }

    /**
     * @private
     * 生成一个 64 位无符号整数
     * @returns {bigint} - 64 位无符号整数
     */
    #nextUInt64() {
        const result = this.#rotl(this.#s0 + this.#s3, 23);

        const t = this.#s1 << 17n;

        this.#s2 = this.#s2 ^ this.#s0;
        this.#s3 = this.#s3 ^ this.#s1;
        this.#s1 = this.#s1 ^ this.#s2;
        this.#s0 = this.#s0 ^ this.#s3;

        this.#s2 = this.#s2 ^ t;
        this.#s3 = this.#rotl(this.#s3, 45);

        return result;
    }

    /**
     * @private
     * 生成一个在 [0, 1) 范围内的浮点数
     * @returns {number} - 浮点数
     */
    #nextFloat() {
        const c = 0x1fffffffffffffn;
        const d = 0x20000000000000n;
        // 强制将其中一个操作数转换为 Number，以执行浮点数除法
        return Number(this.#nextUInt64() & c) / Number(d);
    }

    /**
     * 生成一个或多个指定范围内的随机数
     * @param {number} [min=0] - 随机数的下限
     * @param {number} [max=1] - 随机数的上限
     * @param {number} [count=1] - 要生成的随机数数量
     * @returns {number | number[]} - 如果count为1，返回单个随机数；否则返回一个随机数数组
     */
    generate(min = 0, max = 1, count = 1) {
        if (count < 1) {
            return [];
        }

        // 确保min小于max
        if (min > max) {
            [min, max] = [max, min];
        }

        if (count === 1) {
            return this.#generateSingle(min, max);
        }

        const results = [];
        for (let i = 0; i < count; i++) {
            results.push(this.#generateSingle(min, max));
        }
        return results;
    }

    /**
     * @private
     * 生成一个指定范围内的随机数
     * @param {number} min - 随机数的下限
     * @param {number} max - 随机数的上限
     * @returns {number} - 一个在[min, max)范围内的随机数
     */
    #generateSingle(min, max) {
        const randomFloat = this.#nextFloat();

        // 映射到指定的 [min, max) 范围
        return min + randomFloat * (max - min);
    }
}

/**
 * @classdesc Mersenne Twister (MT19937) 伪随机数生成器
 * 这是一个使用 32 位整数状态的经典算法
 * 它能够生成高质量的伪随机数，周期长达 2^19937 - 1
 */
class _MT19937 {
    #state = new Array(624);
    #index = 0;

    /**
     * 构造函数，用一个可选的种子初始化生成器
     * @param {number} [seed=Date.now()] - 用于初始化生成器的 32 位整数种子
     */
    constructor(seed = Date.now()) {
        this.seed(seed);
    }

    /**
     * 使用新的种子重新初始化生成器
     * @param {number} seed - 新的种子
     */
    seed(seed) {
        this.#state[0] = Number(seed) >>> 0;
        for (let i = 1; i < 624; i++) {
            const s = this.#state[i - 1] ^ (this.#state[i - 1] >>> 30);
            this.#state[i] = (((((s & 0xffff0000) >>> 16) * 1812433253) << 16) + (s & 0x0000ffff) * 1812433253 + i) >>> 0;
        }
        this.#index = 624;
    }

    _twist() {
        for (let i = 0; i < 624; i++) {
            const y = (this.#state[i] & 0x80000000) | (this.#state[(i + 1) % 624] & 0x7fffffff);
            this.#state[i] = this.#state[(i + 397) % 624] ^ (y >>> 1);
            if (y % 2 !== 0) {
                this.#state[i] = this.#state[i] ^ 0x9908b0df;
            }
        }
    }

    _nextUInt32() {
        if (this.#index >= 624) {
            this._twist();
            this.#index = 0;
        }
        let y = this.#state[this.#index++];
        y ^= (y >>> 11);
        y ^= ((y << 7) & 0x9d2c5680);
        y ^= ((y << 15) & 0xefc60000);
        y ^= (y >>> 18);
        return y >>> 0;
    }

    /**
     * 生成一个在 [0, 1) 范围内的浮点数
     * @returns {number} 浮点数
     */
    nextFloat() {
        return (this._nextUInt32() / 0xffffffff);
    }

    /**
     * 生成一个或多个指定范围内的随机数
     * @param {number} [min=0] - 随机数的下限（包含）
     * @param {number} [max=1] - 随机数的上限（不包含）
     * @param {number} [count=1] - 要生成的随机数数量
     * @returns {number | number[]} 单个随机数或一个随机数数组
     */
    generate(min = 0, max = 1, count = 1) {
        if (count < 1) return [];
        if (min > max) [min, max] = [max, min];

        if (count === 1) {
            return this.#generateSingle(min, max);
        }

        const results = [];
        for (let i = 0; i < count; i++) {
            results.push(this.#generateSingle(min, max));
        }
        return results;
    }

    #generateSingle(min, max) {
        return min + this.nextFloat() * (max - min);
    }
}

const HRGenerator = {
    MT19937: _MT19937,
    Xoshiro256PlusPlus: _Xoshiro256PlusPlus,
};
/* 示例
 * 使用 HRGenerator.Xoshiro256PlusPlus 创建一个实例
console.log('--- Xoshiro256PlusPlus 示例 ---');
const xoshiroRng = new HRGenerator.Xoshiro256PlusPlus(Date.now());
console.log('使用 Xoshiro256++ 生成:', xoshiroRng.generate(1, 100, 5));
console.log('再次生成:', xoshiroRng.generate(1, 100, 5));

 * 使用 HRGenerator.MT19937 创建另一个实例
console.log('\n--- MT19937 示例 ---');
const mtRng = new HRGenerator.MT19937(Date.now());
console.log('使用 MT19937 生成:', mtRng.generate(1, 100, 5));
console.log('再次生成:', mtRng.generate(1, 100, 5));
*/


/**
 * @classdesc WGS84 <=> GCJ02 <=> BD09 <=> ECEF 坐标转换
 * @version 1.1.0
 * @changelog
 * - 1.1.0: 更新 WGS84 长半轴为 6378137.0，优化迭代逼近和异常处理，添加缓存机制
 * - 1.0.0: 初始版本
 *
 * 主要常量：
 * - constants.pi: 圆周率，Math.PI 的别名
 * - constants.x_pi: BD09 转换中使用的常量
 * - constants.a: WGS84 椭球体长半轴（米）
 * - constants.ee: WGS84 扁率第一偏心率平方
 *
 * 主要功能：
 * - wgs84ToGcj02(lat, lon): WGS84 转 GCJ02
 * - gcj02ToWgs84(lat, lon): GCJ02 转 WGS84（迭代逼近法，精度约 1e-6 度）
 * - gcj02ToBd09(lat, lon): GCJ02 转 BD09
 * - bd09ToGcj02(lat, lon): BD09 转 GCJ02
 * - wgs84ToEcef(lat, lon, alt): WGS84 转 ECEF（默认海拔 0 米）
 * - ecefToWgs84(x, y, z): ECEF 转 WGS84
 * - registerConverter(systemName, { to, from }): 注册新坐标系转换方法
 *
 * 注意事项：
 * - 所有经纬度输入输出单位为角度（degrees），海拔和 ECEF 坐标单位为米
 * - 转换仅对中国大陆境内的坐标有效，境外坐标直接返回原始值
 * - 输入校验确保经纬度在合理范围内（纬度 [-90, 90]，经度 [-180, 180]，海拔 [-10000, 50000]）
 * - 抛出 CoordinateError 对象以处理无效输入，调用者需使用 try-catch 捕获
 *
 * @module CoordinateConverter
 */
class CoordinateError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'CoordinateError';
        this.code = code;
    }
}

const CoordinateConverter = {
    constants: {
        pi: Math.PI,
        x_pi: Math.PI * 3000.0 / 180.0,
        a: 6378137.0, // WGS84 椭球体长半轴（米）
        ee: 0.00669342162296594323, // WGS84 扁率第一偏心率平方
        degToRad: Math.PI / 180.0, // 角度转弧度
        radToDeg: 180.0 / Math.PI // 弧度转角度
    },

    // 缓存 _transformBase 的计算结果
    _transformCache: new Map(),

    /**
     * 判断坐标是否在中国大陆外
     * @private
     * @param {number} latitude - 纬度（角度）
     * @param {number} longitude - 经度（角度）
     * @returns {boolean} - true 如果在中国大陆外，false 如果在中国大陆内
     */
    _isOutsideChina(latitude, longitude) {
        return longitude < 72.004 || longitude > 137.8347 ||
            latitude < 8.8293 || latitude > 55.8271;
    },

    /**
     * 校验输入的经纬度和海拔是否有效
     * @private
     * @param {number} latitude - 纬度（角度）
     * @param {number} longitude - 经度（角度）
     * @param {number} [altitude=0] - 海拔（米）
     * @throws {CoordinateError} - 如果输入无效，抛出错误
     */
    _validateInput(latitude, longitude, altitude = 0) {
        if (typeof latitude !== 'number' || isNaN(latitude) || typeof longitude !== 'number' || isNaN(longitude)) {
            throw new CoordinateError('经纬度必须是有效的数值', 'INVALID_LAT_LON');
        }
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            throw new CoordinateError('经纬度超出有效范围：纬度 [-90, 90]，经度 [-180, 180]', 'OUT_OF_RANGE');
        }
        if (typeof altitude !== 'number' || isNaN(altitude)) {
            throw new CoordinateError('海拔必须是有效的数值', 'INVALID_ALTITUDE');
        }
        if (altitude < -10000 || altitude > 50000) {
            throw new CoordinateError('海拔超出有效范围：[-10000, 50000] 米', 'ALTITUDE_OUT_OF_RANGE');
        }
        if (Math.abs(latitude) > Number.MAX_SAFE_INTEGER || Math.abs(longitude) > Number.MAX_SAFE_INTEGER || Math.abs(altitude) > Number.MAX_SAFE_INTEGER) {
            throw new CoordinateError('输入值过大，可能导致计算溢出', 'VALUE_TOO_LARGE');
        }
    },

    /**
     * 校验 ECEF 坐标是否有效
     * @private
     * @param {number} x - ECEF X 坐标（米）
     * @param {number} y - ECEF Y 坐标（米）
     * @param {number} z - ECEF Z 坐标（米）
     * @throws {CoordinateError} - 如果输入无效，抛出错误
     */
    _validateEcefInput(x, y, z) {
        if (typeof x !== 'number' || isNaN(x) || typeof y !== 'number' || isNaN(y) || typeof z !== 'number' || isNaN(z)) {
            throw new CoordinateError('ECEF 坐标必须是有效的数值', 'INVALID_ECEF');
        }
        if (Math.abs(x) > Number.MAX_SAFE_INTEGER || Math.abs(y) > Number.MAX_SAFE_INTEGER || Math.abs(z) > Number.MAX_SAFE_INTEGER) {
            throw new CoordinateError('ECEF 坐标值过大，可能导致计算溢出', 'ECEF_VALUE_TOO_LARGE');
        }
    },

    /**
     * 计算 WGS84 到 GCJ02 的经纬度偏移量（公共逻辑）
     * @private
     * @param {number} lonOffset - 经度偏移量
     * @param {number} latOffset - 纬度偏移量
     * @param {boolean} isLat - 是否计算纬度偏移
     * @returns {number} - 偏移量
     */
    _transformBase(lonOffset, latOffset, isLat) {
        const cacheKey = `${lonOffset}:${latOffset}:${isLat}`;
        if (this._transformCache.has(cacheKey)) {
            return this._transformCache.get(cacheKey);
        }
        const { pi } = this.constants;
        const terms = [
            { factor: 20.0, arg: 6.0 * lonOffset * pi },
            { factor: 20.0, arg: 2.0 * lonOffset * pi },
            { factor: isLat ? 20.0 : 40.0, arg: (isLat ? latOffset : lonOffset / 3.0) * pi },
            { factor: isLat ? 160.0 : 150.0, arg: lonOffset / 12.0 * pi },
            { factor: isLat ? 320.0 : 300.0, arg: (isLat ? latOffset : lonOffset) * pi / 30.0 }
        ];
        let ret = isLat
            ? -100.0 + 2.0 * lonOffset + 3.0 * latOffset + 0.2 * latOffset * latOffset + 0.1 * lonOffset * latOffset + 0.2 * Math.sqrt(Math.abs(lonOffset))
            : 300.0 + lonOffset + 2.0 * latOffset + 0.1 * lonOffset * lonOffset + 0.1 * lonOffset * latOffset + 0.1 * Math.sqrt(Math.abs(lonOffset));
        ret += terms.reduce((sum, term) => sum + term.factor * Math.sin(term.arg), 0) * 2.0 / 3.0;
        this._transformCache.set(cacheKey, ret);
        // 限制缓存大小，防止内存占用过大
        if (this._transformCache.size > 10000) {
            this._transformCache.clear();
        }
        return ret;
    },

    /**
     * 计算 WGS84 到 GCJ02 的经纬度偏移量
     * @private
     * @param {number} wgsLat - WGS84 纬度（角度）
     * @param {number} wgsLon - WGS84 经度（角度）
     * @returns {{latitude: number, longitude: number}} - 偏移量对象
     */
    _delta(wgsLat, wgsLon) {
        const { a, ee, degToRad, radToDeg } = this.constants;
        const radLat = wgsLat * degToRad;
        const magic = 1 - ee * Math.sin(radLat) ** 2;
        const sqrtMagic = Math.sqrt(magic);

        const dLat = (this._transformBase(wgsLon - 105.0, wgsLat - 35.0, true) * 180.0) /
            ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
        const dLon = (this._transformBase(wgsLon - 105.0, wgsLat - 35.0, false) * 180.0) /
            (a / sqrtMagic * Math.cos(radLat) * Math.PI);

        return { latitude: dLat, longitude: dLon };
    },

    /**
     * WGS84 坐标转 GCJ02 坐标（火星坐标系）
     * @param {number} wgsLat - WGS84 纬度（角度）
     * @param {number} wgsLon - WGS84 经度（角度）
     * @returns {{latitude: number, longitude: number}} - 转换后的 GCJ02 坐标
     * @throws {CoordinateError} - 如果输入无效
     */
    wgs84ToGcj02(wgsLat, wgsLon) {
        this._validateInput(wgsLat, wgsLon);
        if (this._isOutsideChina(wgsLat, wgsLon)) {
            return { latitude: wgsLat, longitude: wgsLon };
        }
        const d = this._delta(wgsLat, wgsLon);
        return {
            latitude: wgsLat + d.latitude,
            longitude: wgsLon + d.longitude
        };
    },

    /**
     * GCJ02 坐标转 WGS84 坐标（迭代逼近法）
     * @param {number} gcjLat - GCJ02 纬度（角度）
     * @param {number} gcjLon - GCJ02 经度（角度）
     * @returns {{latitude: number, longitude: number, iterations: number}} - 转换后的 WGS84 坐标及迭代次数
     * @throws {CoordinateError} - 如果输入无效
     */
    gcj02ToWgs84(gcjLat, gcjLon) {
        this._validateInput(gcjLat, gcjLon);
        if (this._isOutsideChina(gcjLat, gcjLon)) {
            return { latitude: gcjLat, longitude: gcjLon, iterations: 0 };
        }

        let wgsLat = gcjLat, wgsLon = gcjLon;
        const threshold = 1e-6; // 收敛阈值（度）
        const maxIterations = 10;
        let iterations = 0;
        for (let i = 0; i < maxIterations; i++) {
            const d = this._delta(wgsLat, wgsLon);
            const newLat = gcjLat - d.latitude;
            const newLon = gcjLon - d.longitude;
            iterations++;
            if (Math.abs(newLat - wgsLat) < threshold && Math.abs(newLon - wgsLon) < threshold) {
                break;
            }
            if (i === maxIterations - 1) {
                console.warn(`未完全收敛，迭代次数：${iterations}, 最终误差：${Math.abs(newLat - wgsLat).toFixed(8)}°, ${Math.abs(newLon - wgsLon).toFixed(8)}°`);
            }
            wgsLat = newLat;
            wgsLon = newLon;
        }

        return { latitude: wgsLat, longitude: wgsLon, iterations };
    },

    /**
     * GCJ02 坐标转 BD09 坐标（百度坐标系）
     * @param {number} gcjLat - GCJ02 纬度（角度）
     * @param {number} gcjLon - GCJ02 经度（角度）
     * @returns {{latitude: number, longitude: number}} - 转换后的 BD09 坐标
     * @throws {CoordinateError} - 如果输入无效
     */
    gcj02ToBd09(gcjLat, gcjLon) {
        this._validateInput(gcjLat, gcjLon);
        const { x_pi } = this.constants;
        const z = Math.sqrt(gcjLon * gcjLon + gcjLat * gcjLat) + 0.00002 * Math.sin(gcjLat * x_pi);
        const theta = Math.atan2(gcjLat, gcjLon) + 0.000003 * Math.cos(gcjLon * x_pi);
        return {
            latitude: z * Math.sin(theta) + 0.006,
            longitude: z * Math.cos(theta) + 0.0065
        };
    },

    /**
     * BD09 坐标（百度坐标系）转 GCJ02 坐标
     * @param {number} bdLat - BD09 纬度（角度）
     * @param {number} bdLon - BD09 经度（角度）
     * @returns {{latitude: number, longitude: number}} - 转换后的 GCJ02 坐标
     * @throws {CoordinateError} - 如果输入无效
     */
    bd09ToGcj02(bdLat, bdLon) {
        this._validateInput(bdLat, bdLon);
        const { x_pi } = this.constants;
        const x = bdLon - 0.0065;
        const y = bdLat - 0.006;
        const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * x_pi);
        const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * x_pi);
        return {
            latitude: z * Math.sin(theta),
            longitude: z * Math.cos(theta)
        };
    },

    /**
     * WGS84 坐标转 ECEF 空间直角坐标系
     * @param {number} latitude - WGS84 纬度（角度）
     * @param {number} longitude - WGS84 经度（角度）
     * @param {number} [altitude=0] - WGS84 海拔高度（米）
     * @returns {{x: number, y: number, z: number}} - ECEF 坐标（米）
     * @throws {CoordinateError} - 如果输入无效
     */
    wgs84ToEcef(latitude, longitude, altitude = 0) {
        this._validateInput(latitude, longitude, altitude);
        const { a, ee, degToRad } = this.constants;
        const radLat = latitude * degToRad;
        const radLon = longitude * degToRad;
        const sinLat = Math.sin(radLat);
        const cosLat = Math.cos(radLat);
        const sinLon = Math.sin(radLon);
        const cosLon = Math.cos(radLon);
        const N = a / Math.sqrt(1 - ee * sinLat * sinLat);

        return {
            x: (N + altitude) * cosLat * cosLon,
            y: (N + altitude) * cosLat * sinLon,
            z: (N * (1 - ee) + altitude) * sinLat
        };
    },

    /**
     * ECEF 空间直角坐标系转 WGS84 坐标
     * @param {number} x - ECEF X 坐标（米）
     * @param {number} y - ECEF Y 坐标（米）
     * @param {number} z - ECEF Z 坐标（米）
     * @returns {{latitude: number, longitude: number, altitude: number}} - WGS84 坐标（角度，米）
     * @throws {CoordinateError} - 如果输入无效
     */
    ecefToWgs84(x, y, z) {
        this._validateEcefInput(x, y, z);
        const { a, ee, radToDeg } = this.constants;
        const b = a * Math.sqrt(1 - ee);
        const e_prime_square = ee / (1 - ee);
        const p = Math.sqrt(x * x + y * y);

        if (p < 1e-6) { // 接近极点
            const sign = z > 0 ? 1 : -1;
            const altitude = Math.abs(z) - b;
            return {
                latitude: sign * 90,
                longitude: 0, // 经度在极点无意义
                altitude
            };
        }

        const theta = Math.atan2(z * a, p * b);
        const radLon = Math.atan2(y, x);
        const radLat = Math.atan2(
            z + e_prime_square * b * Math.sin(theta) ** 3,
            p - ee * a * Math.cos(theta) ** 3
        );
        const N = a / Math.sqrt(1 - ee * Math.sin(radLat) ** 2);
        const altitude = p / Math.cos(radLat) - N;

        return {
            latitude: radLat * radToDeg,
            longitude: radLon * radToDeg,
            altitude
        };
    },

    /**
     * 注册新的坐标系转换方法
     * @param {string} systemName - 新坐标系名称
     * @param {{to: Function, from: Function}} converter - 转换方法对象，包含 to 和 from 方法
     * @throws {CoordinateError} - 如果注册参数无效
     */
    registerConverter(systemName, converter) {
        if (typeof systemName !== 'string' || !systemName) {
            throw new CoordinateError('坐标系名称必须是非空字符串', 'INVALID_SYSTEM_NAME');
        }
        if (!converter || typeof converter.to !== 'function' || typeof converter.from !== 'function') {
            throw new CoordinateError('转换器必须包含有效的 to 和 from 方法', 'INVALID_CONVERTER');
        }
        this[systemName] = converter;
    }
};

// === 下方挂载到全局 ===

globalThis.HRGenerator = HRGenerator;
globalThis.CoordinateConverter = CoordinateConverter;

// === 下方注册扩展 ===

let ext = seal.ext.find('SheepLib');
if (!ext) {
    ext = seal.ext.new('SheepLib', 'lyjjl', '1.0.0');
    /*
    const cmdE = seal.ext.newCmdItemInfo();
    cmdE.name = '';
    cmdE.help = '';
    cmdE.solve = (ctx, msg, cmdArgs) => {
    };
    ext.cmdMap[''] = cmdE;
  
    由于本插件是一个库文件，暂时不计划添加指令
    */
    seal.ext.register(ext);
    // 仅注册插件，表示加载成功
}