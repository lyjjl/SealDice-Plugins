const { generateGtk } = require ('./qzoneUtils');

const configApi = {
    // get_globalconfig => get_uid
    get_uid: (uin) => {
        return uin.replace(/\D/g, '');
    }
};

const logger = console;

class QzoneAPI {
    // QQ空间cgi常量
    static UPLOAD_IMAGE_URL = "https://up.qzone.qq.com/cgi-bin/upload/cgi_upload_image"
    static EMOTION_PUBLISH_URL = "https://user.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_publish_v6"
    static DOLIKE_URL = "https://user.qzone.qq.com/proxy/domain/w.qzone.qq.com/cgi-bin/likes/internal_dolike_app"
    static COMMENT_URL = "https://user.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_re_feeds"
    static REPLY_URL = "https://h5.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_re_feeds"
    static LIST_URL = "https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6"
    static ZONE_LIST_URL = "https://user.qzone.qq.com/proxy/domain/ic2.qzone.qq.com/cgi-bin/feeds/feeds3_html_more"

    /**
     * @param {Object} cookiesDict - 包含 QQ 空间登录信息的 Cookie 字典
     * @param uin - Bot QQ号
     */
    constructor(cookiesDict = {}, uin) {
        this.cookies = cookiesDict; // 存储 Cookie
        this.gtk2 = ''; // g_tk
        const uinStr = configApi.get_uid(uin);
        this.uin = parseInt(uinStr); // uin
        this.qqNickname = ""; // 昵称

        // 如果存在 p_skey，计算 gtk2
        if (this.cookies.p_skey) {
            this.gtk2 = generateGtk(this.cookies.p_skey);
        }
    }

    /**
     * 发送带 cookies 的异步请求，使用 Fetch API。
     * * @param {string} method - HTTP 方法 (GET, POST)。
     * @param {string} url - 请求 URL。
     * @param {Object} [params={}] - URL 查询参数。
     * @param {Object} [data={}] - POST 表单数据 (作为 URLSearchParams 或 FormData)。
     * @param {Object} [headers={}] - 请求头。
     * @param {Object} [cookies=this.cookies] - 用于本次请求的 cookies。
     * @param {number} [timeout=10] - 超时时间 (秒)。Fetch API 通常需要 AbortController 实现超时。
     * @returns {Promise<Response>} Fetch Response 对象。
     */
    async do(method, url, params = {}, data = {}, headers = {}, cookies = null, timeout = 10) {
        // Cookies
        const finalCookies = cookies || this.cookies;

        // 将 cookies 对象转换为 Cookie 字符串格式
        const cookieString = Object.entries(finalCookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');

        // params
        const urlObj = new URL(url);
        Object.entries(params).forEach(([key, value]) => {
            urlObj.searchParams.append(key, value);
        });

        // 默认为 application/x-www-form-urlencoded
        let body = undefined;
        let contentType = headers['Content-Type'] || '';

        if (method.toUpperCase() === 'POST' && Object.keys(data).length > 0) {
            if (contentType.includes('application/json')) {
                body = JSON.stringify(data);
            } else {
                // 构造 x-www-form-urlencoded
                const formData = new URLSearchParams();
                Object.entries(data).forEach(([key, value]) => {
                    formData.append(key, String(value));
                });
                body = formData;
                contentType = 'application/x-www-form-urlencoded';
            }
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);

        const fetchOptions = {
            method: method.toUpperCase(),
            headers: {
                // 合并自定义 Header
                ...headers,
                // 添加 Cookie Header
                'Cookie': cookieString,
            },
            body: body,
            redirect: 'follow',
            signal: controller.signal,
        };

        // 如果手动设置了 Content-Type，需要在这里覆盖
        if (contentType) {
            fetchOptions.headers['Content-Type'] = contentType;
        } else if (fetchOptions.body instanceof URLSearchParams) {
            // 如果 body 是 URLSearchParams，Fetch 会自动设置 Content-Type
        }

        try {
            // 发送请求
            return await fetch(urlObj.toString(), fetchOptions);
        } catch (error) {
            if (error.name === 'AbortError') {
                logger.error(`请求超时: ${url}`);
                throw new Error(`[QzoneAPI] Request timed out after ${timeout} seconds.`);
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }
}

