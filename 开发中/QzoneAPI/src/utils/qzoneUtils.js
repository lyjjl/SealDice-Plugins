const cheerio = require('cheerio');
const JSON5 = require('json5');

/**
 * 根据 p_skey 生成 QQ 空间的 g_tk 值。
 * * @param {string} skey - 用户的 p_skey。
 * @returns {string} 计算出的 g_tk 值。
 */
function generateGtk(skey) {
    let hashVal = 5381;

    // 遍历 skey 字符串的每个字符
    for (let i = 0; i < skey.length; i++) {
        hashVal = hashVal + (hashVal << 5) + skey.charCodeAt(i);
    }

    const gtk = hashVal & 0x7fffffff; // 0x7fffffff 是 2147483647 的十六进制
    return String(gtk); // 返回字符串形式
}

/**
 * 从图片上传结果中提取图片的 picbo 和 richval 值，用于发表图片说说。
 *
 * @param {object} uploadResult - 图片上传成功后返回的 JSON 对象。
 * @returns {{picbo: string, richval: string}} 包含 picbo 和 richval 的对象。
 * @throws {Error} 如果上传失败或数据格式不正确。
 */
function getPicboAndRichval(uploadResult) {
    const json_data = uploadResult;

    if (!json_data || json_data.ret === undefined) {
        throw new Error("获取图片picbo和richval失败：上传结果无效");
    }
    if (json_data.ret !== 0) {
        throw new Error(`上传图片失败，错误码: ${json_data.ret}`);
    }

    const data = json_data.data;
    if (!data || !data.url) {
        throw new Error("上传图片失败：缺少 URL 数据");
    }

    // 从 URL 中提取 picbo 值
    const picbo_spt = data.url.split('&bo=');
    if (picbo_spt.length < 2) {
        throw new Error("上传图片失败：无法从 URL 中提取 picbo");
    }
    const picbo = picbo_spt[1];

    // 构建 richval 字符串c
    const richval = `,${data.albumid},${data.lloc},${data.sloc},${data.type},${data.height},${data.width},,${data.height},${data.width}`;

    return { picbo, richval };
}

/**
 * 从 QQ 空间响应的 JSON 内容中提取 code 值，如果不存在则返回 null。
 *
 * @param {string | object} jsonResponse - QQ 空间 API 返回的 JSON 字符串或解析后的对象。
 * @returns {any | null} 状态码 code 的值 ，如果不存在则返回 null。
 */
function extractCodeJson(jsonResponse) {
    try {
        let data;

        if (typeof jsonResponse === 'string') {
            data = JSON5.parse(jsonResponse);
        } else if (typeof jsonResponse === 'object' && jsonResponse !== null) {
            data = jsonResponse;
        } else {
            return null; // 输入格式不正确
        }

        // 尝试获取 'code' 属性的值，如果不存在则返回 null。
        return data.code !== undefined ? data.code : null;

    } catch (error) {
        console.error(`[QzoneAPI] Error extracting code from JSON: ${error.message}`);
        return null;
    }
}

/**
 * 从 QQ 空间响应的 HTML 内容中提取响应码 code 的值。
 *
 * @param {string} htmlContent - QQ 空间 API 返回的 HTML 字符串。
 * @returns {any | null} 状态码 code 的值，如果找不到则返回 null。
 */
function extractCodeHtml(htmlContent) {
    try {
        const $ = cheerio.load(htmlContent); // 使用 cheerio 加载 HTML

        // 查找所有 <script> 标签
        const scriptTags = $('script');

        for (let i = 0; i < scriptTags.length; i++) {
            const script = scriptTags[i];
            const scriptContent = $(script).html(); // 获取脚本内容

            // 检查脚本内容是否存在且包含特定的回调字符串 'frameElement.callback'
            if (scriptContent && scriptContent.includes('frameElement.callback')) {
                const searchString = 'frameElement.callback(';
                const startIndex = scriptContent.indexOf(searchString) + searchString.length;
                const endIndex = scriptContent.lastIndexOf(');');

                if (startIndex > searchString.length && endIndex > startIndex) {
                    let jsonStr = scriptContent.substring(startIndex, endIndex).trim();

                    // 末尾分号的情况
                    if (jsonStr.endsWith(';')) {
                        jsonStr = jsonStr.slice(0, -1);
                    }

                    const data = JSON5.parse(jsonStr);

                    return data.code !== undefined ? data.code : null;
                }
            }
        }

        return null;
    } catch (error) {
        console.error(`[QzoneAPI] Error extracting code from HTML: ${error.message}`);
        return null;
    }
}

/**
 * 将图片二进制数据 (Buffer) 转换为 Base64 字符串。
 *
 * @param {Buffer} image - 图片的二进制数据。
 * @returns {string} 图片的 Base64 编码字符串。
 * @throws {Error} 如果输入不是 Buffer 类型。
 */
function imageToBase64(image) {
    if (!Buffer.isBuffer(image)) {
        throw new Error("[QzoneAPI] Input must be a Buffer (image bytes).");
    }

    return image.toString('base64');
}

module.exports = {
    generateGtk,
    getPicboAndRichval,
    extractCodeJson,
    extractCodeHtml,
    imageToBase64,
};