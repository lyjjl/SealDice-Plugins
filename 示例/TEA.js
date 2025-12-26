/**
 * TEA 加密函数
 * @param {Uint32Array} v - 包含两个 32 位整数的数组 [v0, v1]
 * @param {Uint32Array} k - 包含四个 32 位整数的密钥 [k0, k1, k2, k3]
 * @returns {Array} 加密后的 [v0, v1]
 */
const encrypt = (v, k) => {
    let v0 = v[0] >>> 0;
    let v1 = v[1] >>> 0;
    let sum = 0;
    const delta = 0x9e3779b9 >>> 0;

    for (let i = 0; i < 32; i++) { // 改成 16 轮就是 QQTEA 了
        sum = (sum + delta) >>> 0;
        v0 = (v0 + (((v1 << 4) + k[0]) ^ (v1 + sum) ^ ((v1 >>> 5) + k[1]))) >>> 0;
        v1 = (v1 + (((v0 << 4) + k[2]) ^ (v0 + sum) ^ ((v0 >>> 5) + k[3]))) >>> 0;
    }
    return [v0, v1];
};

/**
 * TEA 解密函数
 */
const decrypt = (v, k) => {
    let v0 = v[0] >>> 0;
    let v1 = v[1] >>> 0;
    const delta = 0x9e3779b9 >>> 0;
    let sum = (delta * 32) >>> 0;

    for (let i = 0; i < 32; i++) { // 改成 16 轮就是 QQTEA 了
        v1 = (v1 - (((v0 << 4) + k[2]) ^ (v0 + sum) ^ ((v0 >>> 5) + k[3]))) >>> 0;
        v0 = (v0 - (((v1 << 4) + k[0]) ^ (v1 + sum) ^ ((v1 >>> 5) + k[1]))) >>> 0;
        sum = (sum - delta) >>> 0;
    }
    return [v0, v1];
};

// 实例
const main = () => {
    const data = [1, 2];
    const key = [2, 2, 3, 4];

    console.log("加密前数据:", data);

    const encrypted = encrypt(data, key);
    console.log("加密后的数据:", encrypted);

    const decrypted = decrypt(encrypted, key);
    console.log("解密后数据:", decrypted);
};

main();