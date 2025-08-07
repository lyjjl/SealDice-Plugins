/**
 * WGS84 <=> GCJ02 <=> BD09 <=> ECEF 坐标转换库
 *
 * 这是一个用于在 WGS84, GCJ02, BD09 和 ECEF 坐标系之间进行相互转换的 JavaScript 工具库。
 *
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
 * - 所有经纬度输入输出单位为角度（degrees），海拔和 ECEF 坐标单位为米。
 * - 转换仅对中国大陆境内的坐标有效，境外坐标直接返回原始值。
 * - 输入校验确保经纬度在合理范围内（纬度 [-90, 90]，经度 [-180, 180]，海拔 [-10000, 50000]）。
 * - 抛出 CoordinateError 对象以处理无效输入，调用者需使用 try-catch 捕获。
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

// 示例用法（仅供测试，建议移到单独的 test/demo 文件）
// 北京天安门 WGS84 坐标
try {
    const wgs84_point = { latitude: 39.9042, longitude: 116.4074 };
    console.log("--- 正向转换链：WGS84 -> GCJ02 -> BD09 -> WGS84 ---");
    const gcj02_point = CoordinateConverter.wgs84ToGcj02(wgs84_point.latitude, wgs84_point.longitude);
    console.log(`WGS84 -> GCJ02:`, wgs84_point, '->', gcj02_point);

    const bd09_point = CoordinateConverter.gcj02ToBd09(gcj02_point.latitude, gcj02_point.longitude);
    console.log(`GCJ02 -> BD09:`, gcj02_point, '->', bd09_point);

    const gcj02_from_bd09 = CoordinateConverter.bd09ToGcj02(bd09_point.latitude, bd09_point.longitude);
    console.log(`BD09 -> GCJ02:`, bd09_point, '->', gcj02_from_bd09);

    const wgs84_from_gcj02 = CoordinateConverter.gcj02ToWgs84(gcj02_point.latitude, gcj02_point.longitude);
    console.log(`GCJ02 -> WGS84 (迭代):`, gcj02_point, '->', wgs84_from_gcj02);

    console.log("\n--- ECEF 转换链：WGS84 -> ECEF -> WGS84 ---");
    const wgs84_alt_point = { latitude: 39.9042, longitude: 116.4074, altitude: 50 }; // 假设海拔 50 米
    console.log(`WGS84 原始坐标 (含海拔):`, wgs84_alt_point);
    const ecef_point = CoordinateConverter.wgs84ToEcef(wgs84_alt_point.latitude, wgs84_alt_point.longitude, wgs84_alt_point.altitude);
    console.log(`WGS84 -> ECEF:`, ecef_point);

    const wgs84_from_ecef = CoordinateConverter.ecefToWgs84(ecef_point.x, ecef_point.y, ecef_point.z);
    console.log(`ECEF -> WGS84:`, wgs84_from_ecef);

    console.log("\n--- 异常处理示例：传入无效数据 ---");
    CoordinateConverter.wgs84ToGcj02("不是数字", 116.4074); // 将抛出错误
} catch (error) {
    console.error(`错误：${error.message} (代码：${error.code})`);
}

// 示例：注册新坐标系（CGCS2000 占位示例，需实现具体逻辑）
// 注意：以下 CGCS2000 转换器仅为占位，没有实现具体逻辑，请勿在生产环境中直接使用！
try {
    CoordinateConverter.registerConverter('cgcs2000', {
        to: (lat, lon) => ({ latitude: lat, longitude: lon }), // 示例逻辑
        from: (lat, lon) => ({ latitude: lat, longitude: lon }) // 示例逻辑
    });
    console.log("\n--- 新坐标系转换示例 ---");
    const cgcs2000_point = CoordinateConverter.cgcs2000.to(39.9042, 116.4074);
    console.log(`WGS84 -> CGCS2000:`, cgcs2000_point);
} catch (error) {
    console.error(`错误：${error.message} (代码：${error.code})`);
}
// 同时导出命名和默认导出：
// - 命名导出（import { CoordinateConverter } ...）适用于需要多个导出的场景
// - 默认导出（import CoordinateConverter ...）适用于只需此工具的场景
// 请根据实际需求选择导入方式，避免混淆
export { CoordinateConverter };
export default CoordinateConverter;