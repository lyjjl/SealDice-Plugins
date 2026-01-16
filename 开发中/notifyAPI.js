// ==UserScript==
// @name         notifyAPI
// @author       某人
// @version      1.0.0
// @description  Notify channels (fetch-only) for SealDice. Exposes globalThis.SealNotify.send(...)
// @timestamp    0
// @license      MIT
// ==/UserScript==

(() => {
    const EXT_NAME = 'notify';
    const EXT_AUTHOR = 'converted';
    const EXT_VERSION = '1.0.0';

    /** @type {seal.ExtInfo} */
    let ext = seal.ext.find(EXT_NAME);
    if (!ext) {
        ext = seal.ext.new(EXT_NAME, EXT_AUTHOR, EXT_VERSION);
        seal.ext.register(ext);
    }

    /**
     * Add a config item to list.
     * @param {Array} list
     * @param {string} key
     * @param {any} def
     * @param {string} desc
     */
    function addCfg(list, key, def, desc) {
        list.push(seal.ext.newConfigItem(ext, key, def, desc || ''));
    }

    // ----------------------------
    // Config registration
    // ----------------------------
    const cfgItems = [];

    // General
    addCfg(cfgItems, 'ENABLE_NOTIFY', true, '总开关：是否启用通知');
    addCfg(cfgItems, 'TIMEOUT_MS', 15000, '单次HTTP超时(ms)。若运行时无AbortController则不生效');
    addCfg(cfgItems, 'RETRY_TIMES', 0, '失败重试次数(每通道)。默认0不重试');
    addCfg(cfgItems, 'SKIP_TITLES', [], '跳过推送标题列表(精确匹配)。template: string[]');
    addCfg(cfgItems, 'ERROR_TO_CHAT', false, '若提供ctx/msg，是否把通道错误回显到聊天');

    // Channel enables
    addCfg(cfgItems, 'ENABLE_SERVERCHAN', false, '启用：Server酱');
    addCfg(cfgItems, 'ENABLE_PUSHPLUS', false, '启用：PushPlus');
    addCfg(cfgItems, 'ENABLE_WEPLUS', false, '启用：微加机器人');
    addCfg(cfgItems, 'ENABLE_BARK', false, '启用：Bark');
    addCfg(cfgItems, 'ENABLE_TELEGRAM', false, '启用：Telegram Bot(无代理)');
    addCfg(cfgItems, 'ENABLE_DINGTALK', false, '启用：钉钉机器人(仅token模式，不支持secret签名)');
    addCfg(cfgItems, 'ENABLE_QYWX_BOT', false, '启用：企业微信机器人');
    addCfg(cfgItems, 'ENABLE_QYWX_AM', false, '启用：企业微信应用消息');
    addCfg(cfgItems, 'ENABLE_IGOT', false, '启用：iGot');
    addCfg(cfgItems, 'ENABLE_GOBOT', false, '启用：go-cqhttp');
    addCfg(cfgItems, 'ENABLE_GOTIFY', false, '启用：Gotify');
    addCfg(cfgItems, 'ENABLE_SYNOLOGY_CHAT', false, '启用：Synology Chat');
    addCfg(cfgItems, 'ENABLE_PUSHDEER', false, '启用：PushDeer');
    addCfg(cfgItems, 'ENABLE_AIBOTK', false, '启用：智能微秘书');
    addCfg(cfgItems, 'ENABLE_FEISHU', false, '启用：飞书机器人(仅无签名模式，不支持FSSECRET)');
    addCfg(cfgItems, 'ENABLE_PUSHME', false, '启用：PushMe');
    addCfg(cfgItems, 'ENABLE_CHRONOCAT', false, '启用：Chronocat');
    addCfg(cfgItems, 'ENABLE_WEBHOOK', false, '启用：自定义Webhook');
    addCfg(cfgItems, 'ENABLE_QMSG', false, '启用：Qmsg');
    addCfg(cfgItems, 'ENABLE_NTFY', false, '启用：Ntfy');
    addCfg(cfgItems, 'ENABLE_WXPUSHER', false, '启用：WxPusher');

    // Server酱
    addCfg(cfgItems, 'PUSH_KEY', '', 'Server酱PUSH_KEY');

    // PushPlus
    addCfg(cfgItems, 'PUSH_PLUS_TOKEN', '', 'pushplus token(必填)');
    addCfg(cfgItems, 'PUSH_PLUS_USER', '', 'pushplus topic(群组编码)，可空');
    addCfg(cfgItems, 'PUSH_PLUS_TEMPLATE', 'html', 'pushplus template: html/txt/json/markdown等');
    addCfg(cfgItems, 'PUSH_PLUS_CHANNEL', 'wechat', 'pushplus channel: wechat/webhook/cp/mail/sms');
    addCfg(cfgItems, 'PUSH_PLUS_WEBHOOK', '', 'pushplus webhook编码，可空');
    addCfg(cfgItems, 'PUSH_PLUS_CALLBACKURL', '', 'pushplus callbackUrl，可空');
    addCfg(cfgItems, 'PUSH_PLUS_TO', '', 'pushplus 好友令牌/企业微信用户id，可空');

    // 微加机器人
    addCfg(cfgItems, 'WE_PLUS_BOT_TOKEN', '', '微加机器人 token(必填)');
    addCfg(cfgItems, 'WE_PLUS_BOT_RECEIVER', '', '微加机器人 receiver，可空');
    addCfg(cfgItems, 'WE_PLUS_BOT_VERSION', 'pro', '微加机器人版本：pro/personal');

    // Bark
    addCfg(cfgItems, 'BARK_PUSH', '', 'Bark 设备码或完整URL。仅填设备码将自动补全');
    addCfg(cfgItems, 'BARK_ARCHIVE', '', 'Bark isArchive，可空');
    addCfg(cfgItems, 'BARK_GROUP', '', 'Bark group，可空');
    addCfg(cfgItems, 'BARK_SOUND', '', 'Bark sound，可空');
    addCfg(cfgItems, 'BARK_ICON', '', 'Bark icon，可空');
    addCfg(cfgItems, 'BARK_LEVEL', '', 'Bark level，可空');
    addCfg(cfgItems, 'BARK_URL', '', 'Bark url(跳转链接)，可空');

    // Telegram
    addCfg(cfgItems, 'TG_BOT_TOKEN', '', 'Telegram bot token');
    addCfg(cfgItems, 'TG_USER_ID', '', 'Telegram chat_id(用户/群)');
    addCfg(cfgItems, 'TG_API_HOST', 'https://api.telegram.org', 'Telegram API Host');

    // 钉钉
    addCfg(cfgItems, 'DD_BOT_TOKEN', '', '钉钉机器人 access_token');
    addCfg(cfgItems, 'DD_BOT_SECRET', '', '钉钉签名secret：本运行时无HMAC，填了将跳过并提示');

    // 企业微信
    addCfg(cfgItems, 'QYWX_ORIGIN', 'https://qyapi.weixin.qq.com', '企业微信API Origin');
    addCfg(cfgItems, 'QYWX_KEY', '', '企业微信机器人 webhook key');

    // 企业微信应用消息
    addCfg(
        cfgItems,
        'QYWX_AM',
        '',
        '企业微信应用消息：corpid,corpsecret,touser(|分隔),agentid,消息类型(0/1/或thumb_media_id)'
    );
    addCfg(cfgItems, 'QYWXAM_MAXLEN', 900, '企业微信应用消息分段长度(默认900)');

    // iGot
    addCfg(cfgItems, 'IGOT_PUSH_KEY', '', 'iGot key(24位字母数字)');

    // go-cqhttp
    addCfg(cfgItems, 'GOBOT_URL', '', 'go-cqhttp URL，例如 http://127.0.0.1/send_group_msg');
    addCfg(cfgItems, 'GOBOT_QQ', '', 'go-cqhttp 推送目标，例如 group_id=123 或 user_id=456');
    addCfg(cfgItems, 'GOBOT_TOKEN', '', 'go-cqhttp access_token，可空');

    // Gotify
    addCfg(cfgItems, 'GOTIFY_URL', '', 'Gotify base url，例如 https://push.example.de:8080');
    addCfg(cfgItems, 'GOTIFY_TOKEN', '', 'Gotify app token');
    addCfg(cfgItems, 'GOTIFY_PRIORITY', 0, 'Gotify priority(整数)');

    // Synology Chat
    addCfg(cfgItems, 'CHAT_URL', '', 'Synology Chat URL(含路径前缀)，例如 https://host/webapi/entry.cgi?api=SYNO.Chat.External&method=incoming&version=2&token=');
    addCfg(cfgItems, 'CHAT_TOKEN', '', 'Synology Chat token(拼接到CHAT_URL后)');

    // PushDeer
    addCfg(cfgItems, 'DEER_KEY', '', 'PushDeer key');
    addCfg(cfgItems, 'DEER_URL', '', 'PushDeer URL，可空(默认 https://api2.pushdeer.com/message/push)');

    // 智能微秘书
    addCfg(cfgItems, 'AIBOTK_KEY', '', '智能微秘书 apiKey');
    addCfg(cfgItems, 'AIBOTK_TYPE', '', '智能微秘书 type: room/contact');
    addCfg(cfgItems, 'AIBOTK_NAME', '', '智能微秘书 roomName 或 contact name');

    // 飞书
    addCfg(cfgItems, 'FSKEY', '', '飞书机器人 hook key');
    addCfg(cfgItems, 'FSSECRET', '', '飞书签名secret：本运行时无HMAC，填了将跳过并提示');

    // PushMe
    addCfg(cfgItems, 'PUSHME_KEY', '', 'PushMe push_key');
    addCfg(cfgItems, 'PUSHME_URL', '', 'PushMe URL，可空(默认 https://push.i-i.me)');

    // Chronocat
    addCfg(cfgItems, 'CHRONOCAT_QQ', '', 'Chronocat 目标：user_id=xxx;group_id=yyy (英文;分隔可多条)');
    addCfg(cfgItems, 'CHRONOCAT_TOKEN', '', 'Chronocat Bearer token');
    addCfg(cfgItems, 'CHRONOCAT_URL', '', 'Chronocat base url，例如 http://127.0.0.1:16530');

    // Webhook
    addCfg(cfgItems, 'WEBHOOK_URL', '', 'Webhook URL，支持 $title $content 占位符');
    addCfg(cfgItems, 'WEBHOOK_BODY', '', 'Webhook Body，支持 $title $content 占位符');
    addCfg(cfgItems, 'WEBHOOK_HEADERS', '', 'Webhook Headers：每行 k: v');
    addCfg(cfgItems, 'WEBHOOK_METHOD', '', 'Webhook Method：GET/POST/PUT/PATCH/DELETE');
    addCfg(cfgItems, 'WEBHOOK_CONTENT_TYPE', '', 'Webhook content-type：application/json / x-www-form-urlencoded / multipart/form-data / text/plain');

    // Qmsg
    addCfg(cfgItems, 'QMSG_KEY', '', 'Qmsg key');
    addCfg(cfgItems, 'QMSG_TYPE', '', 'Qmsg type，例如 send');

    // Ntfy
    addCfg(cfgItems, 'NTFY_URL', 'https://ntfy.sh', 'Ntfy URL');
    addCfg(cfgItems, 'NTFY_TOPIC', '', 'Ntfy topic(必填)');
    addCfg(cfgItems, 'NTFY_PRIORITY', '3', 'Ntfy priority(默认3)');
    addCfg(cfgItems, 'NTFY_TOKEN', '', 'Ntfy token(Bearer)，可空');
    addCfg(cfgItems, 'NTFY_USERNAME', '', 'Ntfy username(Basic)，可空');
    addCfg(cfgItems, 'NTFY_PASSWORD', '', 'Ntfy password(Basic)，可空');
    addCfg(cfgItems, 'NTFY_ACTIONS', '', 'Ntfy actions，可空(将RFC2047编码)');
    addCfg(cfgItems, 'NTFY_ICON', '', 'Ntfy Icon URL，可空');

    // WxPusher
    addCfg(cfgItems, 'WXPUSHER_APP_TOKEN', '', 'wxpusher appToken');
    addCfg(cfgItems, 'WXPUSHER_TOPIC_IDS', '', 'wxpusher topicIds，英文分号;分隔，至少与uids配置一个');
    addCfg(cfgItems, 'WXPUSHER_UIDS', '', 'wxpusher uids，英文分号;分隔，至少与topicIds配置一个');

    // Register all configs
    seal.ext.registerConfig(ext, ...cfgItems);

    // ----------------------------
    // Helpers
    // ----------------------------

    /**
     * Safe replaceAll for older runtimes (ES6).
     * @param {string} s
     * @param {string} find
     * @param {string} repl
     * @returns {string}
     */
    function replaceAllSafe(s, find, repl) {
        if (s == null) return '';
        return String(s).split(find).join(repl);
    }

    /**
     * Truncate long text for logs (avoid leaking tokens).
     * @param {string} s
     * @param {number} n
     * @returns {string}
     */
    function trunc(s, n) {
        const str = String(s == null ? '' : s);
        if (str.length <= n) return str;
        return str.slice(0, n) + '...';
    }

    /**
     * Parse header text ("k: v" per line) into object.
     * @param {string} headersText
     * @returns {Object.<string,string>}
     */
    function parseHeaders(headersText) {
        if (!headersText) return {};
        const parsed = {};
        const lines = String(headersText).split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const idx = line.indexOf(':');
            if (idx <= 0) continue;
            const key = line.substring(0, idx).trim().toLowerCase();
            const val = line.substring(idx + 1).trim();
            if (!key) continue;
            parsed[key] = parsed[key] ? parsed[key] + ', ' + val : val;
        }
        return parsed;
    }

    /**
     * Parse "key: value" blocks (used by webhook body parser).
     * @param {string} input
     * @param {(v:string)=>string} valueFormatFn
     * @returns {Object.<string, any>}
     */
    function parseString(input, valueFormatFn) {
        const regex = /(\w+):\s*((?:(?!\n\w+:).)*)/g;
        const matches = {};
        let match;
        while ((match = regex.exec(String(input))) !== null) {
            const key = (match[1] || '').trim();
            if (!key || matches[key] !== undefined) continue;
            let value = (match[2] || '').trim();
            try {
                value = valueFormatFn ? valueFormatFn(value) : value;
                matches[key] = JSON.parse(value);
            } catch (e) {
                matches[key] = value;
            }
        }
        return matches;
    }

    /**
     * Parse webhook body into supported structures.
     * @param {string} body
     * @param {string} contentType
     * @param {(v:string)=>string} valueFormatFn
     * @returns {any}
     */
    function parseBody(body, contentType, valueFormatFn) {
        if (!body) return '';
        const ct = String(contentType || '').trim();

        if (!ct || ct === 'text/plain') {
            const raw = String(body);
            return valueFormatFn ? valueFormatFn(raw) : raw;
        }

        const parsed = parseString(String(body), valueFormatFn);

        if (ct === 'multipart/form-data') {
            if (typeof globalThis.FormData !== 'function') {
                return { __unsupported: true, reason: 'FormData not available' };
            }
            const fd = new FormData();
            const keys = Object.keys(parsed);
            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                fd.append(k, parsed[k]);
            }
            return fd;
        }

        if (ct === 'application/x-www-form-urlencoded') {
            if (typeof globalThis.URLSearchParams === 'function') {
                const usp = new URLSearchParams();
                const keys = Object.keys(parsed);
                for (let i = 0; i < keys.length; i++) {
                    const k = keys[i];
                    usp.append(k, String(parsed[k]));
                }
                return usp.toString();
            }
            // fallback
            const keys = Object.keys(parsed);
            let s = '';
            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                const v = encodeURIComponent(String(parsed[k]));
                s += (s ? '&' : '') + encodeURIComponent(k) + '=' + v;
            }
            return s;
        }

        // application/json or others: return object
        return parsed;
    }

    /**
     * Map parsed body to request options.
     * @param {string} contentType
     * @param {any} body
     * @returns {{json?: any, body?: any, form?: any}}
     */
    function formatBodyFun(contentType, body) {
        if (body == null) return {};
        const ct = String(contentType || '').trim();
        if (ct === 'application/json') return { json: body };
        if (ct === 'multipart/form-data') return { form: body };
        if (ct === 'application/x-www-form-urlencoded') return { body: body };
        if (ct === 'text/plain') return { body: body };
        // default: try json
        return { json: body };
    }

    /**
     * Convert UTF-8 string to base64 using btoa.
     * @param {string} str
     * @returns {string}
     */
    function utf8ToBase64(str) {
        const s = String(str == null ? '' : str);

        // Prefer TextEncoder when available
        if (typeof globalThis.TextEncoder === 'function') {
            try {
                const bytes = new TextEncoder().encode(s);
                let bin = '';
                for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
                return btoa(bin);
            } catch (e) {
                // fall through
            }
        }

        // Fallback (works in many JS environments)
        try {
            return btoa(unescape(encodeURIComponent(s)));
        } catch (e) {
            // As last resort, best-effort Latin1
            return btoa(s);
        }
    }

    /**
     * RFC2047 Base64 encoding (for headers).
     * @param {string} s
     * @returns {string}
     */
    function encodeRFC2047Base64(s) {
        return '=?utf-8?B?' + utf8ToBase64(String(s == null ? '' : s)) + '?=';
    }

    // ----------------------------
    // SealNotify class
    // ----------------------------

    class SealNotify {
        /**
         * @param {seal.ExtInfo} extInfo
         */
        constructor(extInfo) {
            /** @type {seal.ExtInfo} */
            this.ext = extInfo;
            /** @type {Object.<string, boolean>} */
            this._warned = {};
        }

        /**
         * One-time warning.
         * @param {string} key
         * @param {string} text
         */
        _warnOnce(key, text) {
            if (this._warned[key]) return;
            this._warned[key] = true;
            console.warn(text);
        }

        /**
         * Read config item safely.
         * @param {string} key
         * @param {any} fallback
         * @returns {any}
         */
        _getConfigValue(key, fallback) {
            try {
                const item = seal.ext.getConfig(this.ext, key);
                if (item && item.value !== undefined) return item.value;
            } catch (e) {
                // ignore
            }
            return fallback;
        }

        /**
         * Normalize boolean.
         * @param {any} v
         * @param {boolean} fallback
         * @returns {boolean}
         */
        _asBool(v, fallback) {
            if (typeof v === 'boolean') return v;
            if (typeof v === 'number') return v !== 0;
            if (typeof v === 'string') {
                const s = v.trim().toLowerCase();
                return !(s === '' || s === '0' || s === 'false' || s === 'no' || s === 'off');

            }
            return fallback;
        }

        /**
         * Normalize int.
         * @param {any} v
         * @param {number} fallback
         * @returns {number}
         */
        _asInt(v, fallback) {
            if (typeof v === 'number' && isFinite(v)) return Math.floor(v);
            if (typeof v === 'string') {
                const n = parseInt(v, 10);
                return isNaN(n) ? fallback : n;
            }
            return fallback;
        }

        /**
         * Normalize string.
         * @param {any} v
         * @param {string} fallback
         * @returns {string}
         */
        _asStr(v, fallback) {
            if (v == null) return fallback;
            return String(v);
        }

        /**
         * Normalize string array.
         * @param {any} v
         * @returns {string[]}
         */
        _asStrArr(v) {
            if (!v) return [];
            if (Array.isArray(v)) return v.map((x) => String(x));
            // Allow multi-line string as a fallback
            if (typeof v === 'string') {
                return v.split('\n').map((x) => x.trim()).filter((x) => x);
            }
            return [];
        }

        /**
         * Build a config snapshot for atomic send().
         * @returns {Object}
         */
        _snapshotConfig() {
            const cfg = {};

            cfg.ENABLE_NOTIFY = this._asBool(this._getConfigValue('ENABLE_NOTIFY', true), true);
            cfg.TIMEOUT_MS = this._asInt(this._getConfigValue('TIMEOUT_MS', 15000), 15000);
            cfg.RETRY_TIMES = this._asInt(this._getConfigValue('RETRY_TIMES', 0), 0);
            cfg.ERROR_TO_CHAT = this._asBool(this._getConfigValue('ERROR_TO_CHAT', false), false);
            cfg.SKIP_TITLES = this._asStrArr(this._getConfigValue('SKIP_TITLES', []));

            // Enables
            const enableKeys = [
                'ENABLE_SERVERCHAN',
                'ENABLE_PUSHPLUS',
                'ENABLE_WEPLUS',
                'ENABLE_BARK',
                'ENABLE_TELEGRAM',
                'ENABLE_DINGTALK',
                'ENABLE_QYWX_BOT',
                'ENABLE_QYWX_AM',
                'ENABLE_IGOT',
                'ENABLE_GOBOT',
                'ENABLE_GOTIFY',
                'ENABLE_SYNOLOGY_CHAT',
                'ENABLE_PUSHDEER',
                'ENABLE_AIBOTK',
                'ENABLE_FEISHU',
                'ENABLE_PUSHME',
                'ENABLE_CHRONOCAT',
                'ENABLE_WEBHOOK',
                'ENABLE_QMSG',
                'ENABLE_NTFY',
                'ENABLE_WXPUSHER',
            ];
            for (let i = 0; i < enableKeys.length; i++) {
                const k = enableKeys[i];
                cfg[k] = this._asBool(this._getConfigValue(k, false), false);
            }

            // Values (strings/ints)
            const strKeys = [
                'PUSH_KEY',
                'PUSH_PLUS_TOKEN',
                'PUSH_PLUS_USER',
                'PUSH_PLUS_TEMPLATE',
                'PUSH_PLUS_CHANNEL',
                'PUSH_PLUS_WEBHOOK',
                'PUSH_PLUS_CALLBACKURL',
                'PUSH_PLUS_TO',
                'WE_PLUS_BOT_TOKEN',
                'WE_PLUS_BOT_RECEIVER',
                'WE_PLUS_BOT_VERSION',
                'BARK_PUSH',
                'BARK_ARCHIVE',
                'BARK_GROUP',
                'BARK_SOUND',
                'BARK_ICON',
                'BARK_LEVEL',
                'BARK_URL',
                'TG_BOT_TOKEN',
                'TG_USER_ID',
                'TG_API_HOST',
                'DD_BOT_TOKEN',
                'DD_BOT_SECRET',
                'QYWX_ORIGIN',
                'QYWX_KEY',
                'QYWX_AM',
                'IGOT_PUSH_KEY',
                'GOBOT_URL',
                'GOBOT_QQ',
                'GOBOT_TOKEN',
                'GOTIFY_URL',
                'GOTIFY_TOKEN',
                'CHAT_URL',
                'CHAT_TOKEN',
                'DEER_KEY',
                'DEER_URL',
                'AIBOTK_KEY',
                'AIBOTK_TYPE',
                'AIBOTK_NAME',
                'FSKEY',
                'FSSECRET',
                'PUSHME_KEY',
                'PUSHME_URL',
                'CHRONOCAT_QQ',
                'CHRONOCAT_TOKEN',
                'CHRONOCAT_URL',
                'WEBHOOK_URL',
                'WEBHOOK_BODY',
                'WEBHOOK_HEADERS',
                'WEBHOOK_METHOD',
                'WEBHOOK_CONTENT_TYPE',
                'QMSG_KEY',
                'QMSG_TYPE',
                'NTFY_URL',
                'NTFY_TOPIC',
                'NTFY_PRIORITY',
                'NTFY_TOKEN',
                'NTFY_USERNAME',
                'NTFY_PASSWORD',
                'NTFY_ACTIONS',
                'NTFY_ICON',
                'WXPUSHER_APP_TOKEN',
                'WXPUSHER_TOPIC_IDS',
                'WXPUSHER_UIDS',
            ];
            for (let i = 0; i < strKeys.length; i++) {
                const k = strKeys[i];
                cfg[k] = this._asStr(this._getConfigValue(k, ''), '');
            }

            cfg.GOTIFY_PRIORITY = this._asInt(this._getConfigValue('GOTIFY_PRIORITY', 0), 0);
            cfg.QYWXAM_MAXLEN = this._asInt(this._getConfigValue('QYWXAM_MAXLEN', 900), 900);

            return cfg;
        }

        /**
         * Reply an error to chat (if enabled).
         * @param {Object} cfg
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         * @param {string} text
         */
        _replyMaybe(cfg, ctx, msg, text) {
            if (!cfg.ERROR_TO_CHAT) return;
            if (!ctx || !msg) return;
            try {
                seal.replyToSender(ctx, msg, text);
            } catch (e) {
                // ignore
            }
        }

        /**
         * Fetch wrapper with timeout + retry.
         * @param {Object} cfg
         * @param {string} url
         * @param {Object} opt
         * @returns {Promise<{ok:boolean,status:number,text:string,json:any}>}
         */
        async _request(cfg, url, opt) {
            const self = this;
            const retry = Math.max(0, cfg.RETRY_TIMES || 0);
            let lastErr = null;

            for (let attempt = 0; attempt <= retry; attempt++) {
                try {
                    const res = await self._requestOnce(cfg, url, opt);
                    if (res && res.ok) return res;
                    lastErr = res;
                } catch (e) {
                    lastErr = { ok: false, status: 0, text: String(e), json: null };
                }
            }
            return lastErr || { ok: false, status: 0, text: 'unknown error', json: null };
        }

        /**
         * Single attempt request.
         * @param {Object} cfg
         * @param {string} url
         * @param {Object} opt
         * @returns {Promise<{ok:boolean,status:number,text:string,json:any}>}
         */
        async _requestOnce(cfg, url, opt) {
            const method = (opt.method || 'GET').toUpperCase();
            const headers = Object.assign({}, opt.headers || {});
            let body = opt.body;

            if (opt.json !== undefined) {
                if (!headers['content-type'] && !headers['Content-Type']) {
                    headers['content-type'] = 'application/json';
                }
                body = JSON.stringify(opt.json);
            } else if (opt.form !== undefined) {
                body = opt.form;
                // do not force content-type for FormData
                if (headers['content-type']) delete headers['content-type'];
                if (headers['Content-Type']) delete headers['Content-Type'];
            }

            // GET/HEAD should not carry body in fetch
            if ((method === 'GET' || method === 'HEAD') && body) {
                body = undefined;
            }

            let controller = null;
            let timer = null;
            const hasAbort = typeof globalThis.AbortController === 'function';
            if (!hasAbort) {
                this._warnOnce('NO_ABORT', 'notify: 运行时无AbortController，TIMEOUT_MS不生效');
            } else {
                controller = new AbortController();
                timer = setTimeout(() => {
                    try {
                        controller.abort();
                    } catch (e) {
                        // ignore
                    }
                }, Math.max(0, cfg.TIMEOUT_MS || 0));
            }

            let resp;
            try {
                resp = await fetch(url, {
                    method,
                    headers,
                    body,
                    signal: controller ? controller.signal : undefined,
                });
            } finally {
                if (timer) clearTimeout(timer);
            }

            const status = resp ? resp.status : 0;
            let text;
            try {
                text = await resp.text();
            } catch (e) {
                text = '';
            }

            let json;
            try {
                json = JSON.parse(text);
            } catch (e) {
                json = null;
            }

            return {
                ok: !!(resp && resp.ok),
                status: status,
                text: text,
                json: json,
            };
        }

        /**
         * Public API: send notification.
         * @param {string} title
         * @param {string} content
         * @param {{url?:string}=} params
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         * @returns {Promise<{title:string,skipped:boolean,results:Array}>}
         */
        async send(title, content, params, ctx, msg) {
            const cfg = this._snapshotConfig();
            const t = String(title == null ? '' : title);
            const c = String(content == null ? '' : content);
            const p = params || {};

            const summary = { title: t, skipped: false, results: [] };

            if (!cfg.ENABLE_NOTIFY) {
                summary.skipped = true;
                return summary;
            }

            // Skip titles (exact match)
            const skipList = cfg.SKIP_TITLES || [];
            for (let i = 0; i < skipList.length; i++) {
                if (skipList[i] === t) {
                    summary.skipped = true;
                    return summary;
                }
            }

            const tasks = [];

            // Server酱
            if (cfg.ENABLE_SERVERCHAN) tasks.push(this._serverChan(cfg, t, c, ctx, msg));
            // PushPlus
            if (cfg.ENABLE_PUSHPLUS) tasks.push(this._pushPlus(cfg, t, c, ctx, msg));
            // 微加
            if (cfg.ENABLE_WEPLUS) tasks.push(this._wePlus(cfg, t, c, ctx, msg));
            // Bark
            if (cfg.ENABLE_BARK) tasks.push(this._bark(cfg, t, c, p, ctx, msg));
            // Telegram
            if (cfg.ENABLE_TELEGRAM) tasks.push(this._telegram(cfg, t, c, ctx, msg));
            // 钉钉
            if (cfg.ENABLE_DINGTALK) tasks.push(this._dingTalk(cfg, t, c, ctx, msg));
            // 企微机器人
            if (cfg.ENABLE_QYWX_BOT) tasks.push(this._qywxBot(cfg, t, c, ctx, msg));
            // 企微应用
            if (cfg.ENABLE_QYWX_AM) tasks.push(this._qywxAm(cfg, t, c, ctx, msg));
            // iGot
            if (cfg.ENABLE_IGOT) tasks.push(this._iGot(cfg, t, c, p, ctx, msg));
            // go-cqhttp
            if (cfg.ENABLE_GOBOT) tasks.push(this._goBot(cfg, t, c, ctx, msg));
            // gotify
            if (cfg.ENABLE_GOTIFY) tasks.push(this._gotify(cfg, t, c, ctx, msg));
            // synology chat
            if (cfg.ENABLE_SYNOLOGY_CHAT) tasks.push(this._synologyChat(cfg, t, c, ctx, msg));
            // pushdeer
            if (cfg.ENABLE_PUSHDEER) tasks.push(this._pushDeer(cfg, t, c, ctx, msg));
            // aibotk
            if (cfg.ENABLE_AIBOTK) tasks.push(this._aibotk(cfg, t, c, ctx, msg));
            // feishu
            if (cfg.ENABLE_FEISHU) tasks.push(this._feishu(cfg, t, c, ctx, msg));
            // pushme
            if (cfg.ENABLE_PUSHME) tasks.push(this._pushMe(cfg, t, c, p, ctx, msg));
            // chronocat
            if (cfg.ENABLE_CHRONOCAT) tasks.push(this._chronocat(cfg, t, c, ctx, msg));
            // webhook
            if (cfg.ENABLE_WEBHOOK) tasks.push(this._webhook(cfg, t, c, ctx, msg));
            // qmsg
            if (cfg.ENABLE_QMSG) tasks.push(this._qmsg(cfg, t, c, ctx, msg));
            // ntfy
            if (cfg.ENABLE_NTFY) tasks.push(this._ntfy(cfg, t, c, ctx, msg));
            // wxpusher
            if (cfg.ENABLE_WXPUSHER) tasks.push(this._wxpusher(cfg, t, c, ctx, msg));

            const wrapped = tasks.map((pr) =>
                Promise.resolve(pr).catch((e) => {
                    return { channel: 'unknown', ok: false, detail: String(e) };
                })
            );

            summary.results = await Promise.all(wrapped);
            return summary;
        }

        // ----------------------------
        // Channels
        // ----------------------------

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         * @returns {Promise<{channel:string,ok:boolean,skipped?:boolean,status?:number,detail?:string}>}
         */
        async _serverChan(cfg, title, desp, ctx, msg) {
            const channel = 'serverchan';
            const key = cfg.PUSH_KEY;
            if (!key) {
                return { channel, ok: false, skipped: true, detail: 'PUSH_KEY未配置' };
            }

            // server酱换行兼容
            const d = String(desp).replace(/[\n\r]/g, '\n\n');

            const m = String(key).match(/^sctp(\d+)t/i);
            const url = m && m[1] ? 'https://' + m[1] + '.push.ft07.com/send/' + key + '.send' : 'https://sctapi.ftqq.com/' + key + '.send';

            const body = typeof globalThis.URLSearchParams === 'function'
                ? new URLSearchParams({ text: title, desp: d }).toString()
                : 'text=' + encodeURIComponent(title) + '&desp=' + encodeURIComponent(d);

            const res = await this._request(cfg, url, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: body,
            });

            const data = res.json || null;
            const ok = !!(data && (data.errno === 0 || (data.data && data.data.errno === 0)));
            if (!ok) {
                const detail = data ? (data.errmsg || (data.message ? data.message : trunc(res.text, 200))) : trunc(res.text, 200);
                console.warn('serverchan failed:', res.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(Server酱)：' + String(detail));
            }
            return { channel, ok, status: res.status, detail: ok ? '' : 'failed' };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _pushPlus(cfg, title, desp, ctx, msg) {
            const channel = 'pushplus';
            if (!cfg.PUSH_PLUS_TOKEN) {
                return { channel, ok: false, skipped: true, detail: 'PUSH_PLUS_TOKEN未配置' };
            }

            const content = String(desp).replace(/[\n\r]/g, '<br>');
            const body = {
                token: String(cfg.PUSH_PLUS_TOKEN),
                title: String(title),
                content: String(content),
                topic: String(cfg.PUSH_PLUS_USER || ''),
                template: String(cfg.PUSH_PLUS_TEMPLATE || 'html'),
                channel: String(cfg.PUSH_PLUS_CHANNEL || 'wechat'),
                webhook: String(cfg.PUSH_PLUS_WEBHOOK || ''),
                callbackUrl: String(cfg.PUSH_PLUS_CALLBACKURL || ''),
                to: String(cfg.PUSH_PLUS_TO || ''),
            };

            const res = await this._request(cfg, 'https://www.pushplus.plus/send', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = res.json || null;
            const ok = !!(data && data.code === 200);
            if (!ok) {
                const detail = data ? (data.msg || trunc(res.text, 200)) : trunc(res.text, 200);
                console.warn('pushplus failed:', res.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(PushPlus)：' + String(detail));
            }
            return { channel, ok, status: res.status };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _wePlus(cfg, title, desp, ctx, msg) {
            const channel = 'weplus';
            if (!cfg.WE_PLUS_BOT_TOKEN) {
                return { channel, ok: false, skipped: true, detail: 'WE_PLUS_BOT_TOKEN未配置' };
            }

            let template = 'txt';
            let content = String(desp);
            if (content.length > 800) {
                content = content.replace(/[\n\r]/g, '<br>');
                template = 'html';
            }

            const body = {
                token: String(cfg.WE_PLUS_BOT_TOKEN),
                title: String(title),
                content: String(content),
                template: String(template),
                receiver: String(cfg.WE_PLUS_BOT_RECEIVER || ''),
                version: String(cfg.WE_PLUS_BOT_VERSION || 'pro'),
            };

            const res = await this._request(cfg, 'https://www.weplusbot.com/send', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = res.json || null;
            const ok = !!(data && data.code === 200);
            if (!ok) {
                const detail = data ? (data.msg || trunc(res.text, 200)) : trunc(res.text, 200);
                console.warn('weplus failed:', res.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(微加)：' + String(detail));
            }
            return { channel, ok, status: res.status };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {{url?:string}} params
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _bark(cfg, title, desp, params, ctx, msg) {
            const channel = 'bark';
            let barkPush = cfg.BARK_PUSH;
            if (!barkPush) return { channel, ok: false, skipped: true, detail: 'BARK_PUSH未配置' };

            if (String(barkPush).indexOf('http') !== 0) {
                barkPush = 'https://api.day.app/' + String(barkPush);
            }

            const payload = {
                title: String(title),
                body: String(desp),
                icon: String(cfg.BARK_ICON || ''),
                sound: String(cfg.BARK_SOUND || ''),
                group: String(cfg.BARK_GROUP || ''),
                isArchive: cfg.BARK_ARCHIVE,
                level: String(cfg.BARK_LEVEL || ''),
                url: String(cfg.BARK_URL || ''),
            };

            // merge params (only plain keys)
            if (params && typeof params === 'object') {
                const keys = Object.keys(params);
                for (let i = 0; i < keys.length; i++) {
                    const k = keys[i];
                    payload[k] = params[k];
                }
            }

            const res = await this._request(cfg, String(barkPush), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = res.json || null;
            const ok = !!(data && data.code === 200);
            if (!ok) {
                const detail = data ? (data.message || trunc(res.text, 200)) : trunc(res.text, 200);
                console.warn('bark failed:', res.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(Bark)：' + String(detail));
            }
            return { channel, ok, status: res.status };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _telegram(cfg, title, desp, ctx, msg) {
            const channel = 'telegram';
            if (!cfg.TG_BOT_TOKEN || !cfg.TG_USER_ID) {
                return { channel, ok: false, skipped: true, detail: 'TG_BOT_TOKEN/TG_USER_ID未配置' };
            }
            const host = cfg.TG_API_HOST || 'https://api.telegram.org';
            const url = String(host) + '/bot' + String(cfg.TG_BOT_TOKEN) + '/sendMessage';

            const payload = {
                chat_id: String(cfg.TG_USER_ID),
                text: String(title) + '\n\n' + String(desp),
                disable_web_page_preview: true,
            };

            const res = await this._request(cfg, url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = res.json || null;
            const ok = !!(data && data.ok === true);
            if (!ok) {
                const detail = data ? (data.description || trunc(res.text, 200)) : trunc(res.text, 200);
                console.warn('telegram failed:', res.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(Telegram)：' + String(detail));
            }
            return { channel, ok, status: res.status };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _dingTalk(cfg, title, desp, ctx, msg) {
            const channel = 'dingtalk';
            if (!cfg.DD_BOT_TOKEN) return { channel, ok: false, skipped: true, detail: 'DD_BOT_TOKEN未配置' };

            if (cfg.DD_BOT_SECRET) {
                const detail = '运行时无HMAC-SHA256，不支持DD_BOT_SECRET签名模式';
                console.warn('dingtalk skipped:', detail);
                this._replyMaybe(cfg, ctx, msg, '通知跳过(钉钉)：' + detail);
                return { channel, ok: false, skipped: true, detail };
            }

            const url = 'https://oapi.dingtalk.com/robot/send?access_token=' + encodeURIComponent(String(cfg.DD_BOT_TOKEN));
            const payload = {
                msgtype: 'text',
                text: { content: String(title) + '\n\n' + String(desp) },
            };

            const res = await this._request(cfg, url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = res.json || null;
            const ok = !!(data && data.errcode === 0);
            if (!ok) {
                const detail = data ? (data.errmsg || trunc(res.text, 200)) : trunc(res.text, 200);
                console.warn('dingtalk failed:', res.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(钉钉)：' + String(detail));
            }
            return { channel, ok, status: res.status };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _qywxBot(cfg, title, desp, ctx, msg) {
            const channel = 'qywx_bot';
            if (!cfg.QYWX_KEY) return { channel, ok: false, skipped: true, detail: 'QYWX_KEY未配置' };

            const origin = cfg.QYWX_ORIGIN || 'https://qyapi.weixin.qq.com';
            const url = String(origin) + '/cgi-bin/webhook/send?key=' + encodeURIComponent(String(cfg.QYWX_KEY));
            const payload = {
                msgtype: 'text',
                text: { content: String(title) + '\n\n' + String(desp) },
            };

            const res = await this._request(cfg, url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = res.json || null;
            const ok = !!(data && data.errcode === 0);
            if (!ok) {
                const detail = data ? (data.errmsg || trunc(res.text, 200)) : trunc(res.text, 200);
                console.warn('qywx bot failed:', res.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(企业微信机器人)：' + String(detail));
            }
            return { channel, ok, status: res.status };
        }

        /**
         * Determine touser for QYWX_AM based on content (keeps original semantics).
         * @param {Object} cfg
         * @param {string} desp
         * @returns {string}
         */
        _qywxAmChangeUserId(cfg, desp) {
            const am = String(cfg.QYWX_AM || '');
            const parts = am.split(',');
            const touserField = parts[2];
            if (touserField) {
                const userIdTmp = touserField.split('|');
                let userId = '';
                for (let i = 0; i < userIdTmp.length; i++) {
                    const needle = '签到号 ' + (i + 1);
                    if (String(desp).indexOf(needle) >= 0) {
                        userId = userIdTmp[i];
                        break;
                    }
                }
                if (!userId) userId = touserField;
                return userId;
            }
            return '@all';
        }

        /**
         * Send QYWX_AM message in one piece.
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         * @returns {Promise<{channel:string,ok:boolean,status?:number,detail?:string}>}
         */
        async _qywxAmOnce(cfg, title, desp, ctx, msg) {
            const channel = 'qywx_am';

            const am = String(cfg.QYWX_AM || '');
            if (!am) return { channel, ok: false, skipped: true, detail: 'QYWX_AM未配置' };

            const origin = cfg.QYWX_ORIGIN || 'https://qyapi.weixin.qq.com';
            const parts = am.split(',');
            if (parts.length < 4) {
                return { channel, ok: false, skipped: true, detail: 'QYWX_AM格式不足4段' };
            }

            // 1) gettoken
            const tokenRes = await this._request(cfg, String(origin) + '/cgi-bin/gettoken', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ corpid: String(parts[0]), corpsecret: String(parts[1]) }),
            });

            const tokenJson = tokenRes.json || null;
            const accessToken = tokenJson && tokenJson.access_token ? String(tokenJson.access_token) : '';
            if (!accessToken) {
                const detail = tokenJson ? (tokenJson.errmsg || trunc(tokenRes.text, 200)) : trunc(tokenRes.text, 200);
                console.warn('qywx am gettoken failed:', tokenRes.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(企微应用获取token)：' + String(detail));
                return { channel, ok: false, status: tokenRes.status, detail: 'gettoken failed' };
            }

            // 2) build message type
            const type = parts[4] ? String(parts[4]) : '';
            let msgPayload;

            if (type === '0') {
                msgPayload = {
                    msgtype: 'textcard',
                    textcard: {
                        title: String(title),
                        description: String(desp),
                        url: 'https://github.com/whyour/qinglong',
                        btntxt: '更多',
                    },
                };
            } else if (type === '1' || !type) {
                msgPayload = {
                    msgtype: 'text',
                    text: { content: String(title) + '\n\n' + String(desp) },
                };
            } else {
                const html = String(desp).replace(/\n/g, '<br/>');
                msgPayload = {
                    msgtype: 'mpnews',
                    mpnews: {
                        articles: [
                            {
                                title: String(title),
                                thumb_media_id: String(type),
                                author: 'notify',
                                content_source_url: '',
                                content: html,
                                digest: String(desp),
                            },
                        ],
                    },
                };
            }

            const sendUrl = String(origin) + '/cgi-bin/message/send?access_token=' + encodeURIComponent(accessToken);
            const sendBody = Object.assign(
                {
                    touser: this._qywxAmChangeUserId(cfg, desp),
                    agentid: String(parts[3]),
                    safe: '0',
                },
                msgPayload
            );

            const sendRes = await this._request(cfg, sendUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(sendBody),
            });

            const data = sendRes.json || null;
            const ok = !!(data && data.errcode === 0);
            if (!ok) {
                const detail = data ? (data.errmsg || trunc(sendRes.text, 200)) : trunc(sendRes.text, 200);
                console.warn('qywx am send failed:', sendRes.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(企业微信应用消息)：' + String(detail));
            }
            return { channel, ok, status: sendRes.status };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _qywxAm(cfg, title, desp, ctx, msg) {
            const channel = 'qywx_am';
            const maxLen = Math.max(100, cfg.QYWXAM_MAXLEN || 900);
            const text = String(desp);

            // split long message
            if (text.length <= maxLen) {
                return await this._qywxAmOnce(cfg, title, text, ctx, msg);
            }

            // send in chunks
            let okAll = true;
            let statusLast = 0;
            for (let offset = 0; offset < text.length; offset += maxLen) {
                const chunk = text.slice(offset, offset + maxLen);
                const sendText = offset + maxLen < text.length ? chunk + '\n==More==' : chunk;
                const r = await this._qywxAmOnce(cfg, title, sendText, ctx, msg);
                statusLast = r.status || statusLast;
                if (!r.ok) okAll = false;
            }
            return { channel, ok: okAll, status: statusLast, detail: okAll ? '' : 'partial failed' };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {{url?:string}} params
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _iGot(cfg, title, desp, params, ctx, msg) {
            const channel = 'igot';
            const key = String(cfg.IGOT_PUSH_KEY || '');
            if (!key) return { channel, ok: false, skipped: true, detail: 'IGOT_PUSH_KEY未配置' };

            const reg = /^[a-zA-Z0-9]{24}$/;
            if (!reg.test(key)) {
                const detail = 'IGOT_PUSH_KEY无效(需24位字母数字)';
                console.warn('igot skipped:', detail);
                this._replyMaybe(cfg, ctx, msg, '通知跳过(iGot)：' + detail);
                return { channel, ok: false, skipped: true, detail };
            }

            const url = 'https://push.hellyw.com/' + key.toLowerCase();

            let body;
            if (typeof globalThis.URLSearchParams === 'function') {
                const usp = new URLSearchParams();
                usp.append('title', String(title));
                usp.append('content', String(desp));
                if (params && typeof params === 'object') {
                    const keys = Object.keys(params);
                    for (let i = 0; i < keys.length; i++) {
                        usp.append(keys[i], String(params[keys[i]]));
                    }
                }
                body = usp.toString();
            } else {
                body = 'title=' + encodeURIComponent(title) + '&content=' + encodeURIComponent(desp);
            }

            const res = await this._request(cfg, url, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: body,
            });

            const data = res.json || null;
            const ok = !!(data && data.ret === 0);
            if (!ok) {
                const detail = data ? (data.errMsg || trunc(res.text, 200)) : trunc(res.text, 200);
                console.warn('igot failed:', res.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(iGot)：' + String(detail));
            }
            return { channel, ok, status: res.status };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _goBot(cfg, title, desp, ctx, msg) {
            const channel = 'gobot';
            if (!cfg.GOBOT_URL) return { channel, ok: false, skipped: true, detail: 'GOBOT_URL未配置' };

            const url = String(cfg.GOBOT_URL) + '?access_token=' + encodeURIComponent(String(cfg.GOBOT_TOKEN || '')) + '&' + String(cfg.GOBOT_QQ || '');
            const payload = { message: String(title) + '\n' + String(desp) };

            const res = await this._request(cfg, url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = res.json || null;
            const ok = !!(data && data.retcode === 0);
            if (!ok) {
                const detail = data ? (data.errmsg || trunc(res.text, 200)) : trunc(res.text, 200);
                console.warn('gobot failed:', res.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(go-cqhttp)：' + String(detail));
            }
            return { channel, ok, status: res.status };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _gotify(cfg, title, desp, ctx, msg) {
            const channel = 'gotify';
            if (!cfg.GOTIFY_URL || !cfg.GOTIFY_TOKEN) {
                return { channel, ok: false, skipped: true, detail: 'GOTIFY_URL/GOTIFY_TOKEN未配置' };
            }

            const url = String(cfg.GOTIFY_URL) + '/message?token=' + encodeURIComponent(String(cfg.GOTIFY_TOKEN));
            const bodyObj = {
                title: String(title),
                message: String(desp),
                priority: String(cfg.GOTIFY_PRIORITY || 0),
            };

            const body = typeof globalThis.URLSearchParams === 'function'
                ? new URLSearchParams(bodyObj).toString()
                : 'title=' + encodeURIComponent(bodyObj.title) + '&message=' + encodeURIComponent(bodyObj.message) + '&priority=' + encodeURIComponent(bodyObj.priority);

            const res = await this._request(cfg, url, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: body,
            });

            const data = res.json || null;
            const ok = !!(data && data.id);
            if (!ok) {
                const detail = data ? (data.message || trunc(res.text, 200)) : trunc(res.text, 200);
                console.warn('gotify failed:', res.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(Gotify)：' + String(detail));
            }
            return { channel, ok, status: res.status };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _synologyChat(cfg, title, desp, ctx, msg) {
            const channel = 'synology_chat';
            if (!cfg.CHAT_URL || !cfg.CHAT_TOKEN) {
                return { channel, ok: false, skipped: true, detail: 'CHAT_URL/CHAT_TOKEN未配置' };
            }

            const url = String(cfg.CHAT_URL) + String(cfg.CHAT_TOKEN);
            const payloadObj = { text: String(title) + '\n' + String(desp) };
            const body = typeof globalThis.URLSearchParams === 'function'
                ? new URLSearchParams({ payload: JSON.stringify(payloadObj) }).toString()
                : 'payload=' + encodeURIComponent(JSON.stringify(payloadObj));

            const res = await this._request(cfg, url, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: body,
            });

            const data = res.json || null;
            const ok = !!(data && data.success === true);
            if (!ok) {
                const detail = data ? trunc(JSON.stringify(data), 200) : trunc(res.text, 200);
                console.warn('synology chat failed:', res.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(Synology Chat)：' + String(detail));
            }
            return { channel, ok, status: res.status };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _pushDeer(cfg, title, desp, ctx, msg) {
            const channel = 'pushdeer';
            if (!cfg.DEER_KEY) return { channel, ok: false, skipped: true, detail: 'DEER_KEY未配置' };

            const url = cfg.DEER_URL ? String(cfg.DEER_URL) : 'https://api2.pushdeer.com/message/push';
            const d = encodeURI(String(desp));
            const body = typeof globalThis.URLSearchParams === 'function'
                ? new URLSearchParams({ pushkey: String(cfg.DEER_KEY), text: String(title), desp: String(d), type: 'markdown' }).toString()
                : 'pushkey=' + encodeURIComponent(cfg.DEER_KEY) + '&text=' + encodeURIComponent(title) + '&desp=' + encodeURIComponent(d) + '&type=markdown';

            const res = await this._request(cfg, url, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: body,
            });

            const data = res.json || null;
            const ok = !!(data && data.content && data.content.result && data.content.result.length !== undefined && data.content.result.length > 0);
            if (!ok) {
                const detail = data ? trunc(JSON.stringify(data), 200) : trunc(res.text, 200);
                console.warn('pushdeer failed:', res.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(PushDeer)：' + String(detail));
            }
            return { channel, ok, status: res.status };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _aibotk(cfg, title, desp, ctx, msg) {
            const channel = 'aibotk';
            if (!cfg.AIBOTK_KEY || !cfg.AIBOTK_TYPE || !cfg.AIBOTK_NAME) {
                return { channel, ok: false, skipped: true, detail: 'AIBOTK_KEY/AIBOTK_TYPE/AIBOTK_NAME未配置' };
            }

            let url = '';
            let payload = {};
            if (cfg.AIBOTK_TYPE === 'room') {
                url = 'https://api-bot.aibotk.com/openapi/v1/chat/room';
                payload = {
                    apiKey: String(cfg.AIBOTK_KEY),
                    roomName: String(cfg.AIBOTK_NAME),
                    message: { type: 1, content: '【青龙快讯】\n\n' + String(title) + '\n' + String(desp) },
                };
            } else if (cfg.AIBOTK_TYPE === 'contact') {
                url = 'https://api-bot.aibotk.com/openapi/v1/chat/contact';
                payload = {
                    apiKey: String(cfg.AIBOTK_KEY),
                    name: String(cfg.AIBOTK_NAME),
                    message: { type: 1, content: '【青龙快讯】\n\n' + String(title) + '\n' + String(desp) },
                };
            } else {
                return { channel, ok: false, skipped: true, detail: 'AIBOTK_TYPE仅支持room/contact' };
            }

            const res = await this._request(cfg, url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = res.json || null;
            const ok = !!(data && data.code === 0);
            if (!ok) {
                const detail = data ? (data.error || trunc(res.text, 200)) : trunc(res.text, 200);
                console.warn('aibotk failed:', res.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(智能微秘书)：' + String(detail));
            }
            return { channel, ok, status: res.status };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _feishu(cfg, title, desp, ctx, msg) {
            const channel = 'feishu';
            if (!cfg.FSKEY) return { channel, ok: false, skipped: true, detail: 'FSKEY未配置' };

            if (cfg.FSSECRET) {
                const detail = '运行时无HMAC-SHA256，不支持FSSECRET签名模式';
                console.warn('feishu skipped:', detail);
                this._replyMaybe(cfg, ctx, msg, '通知跳过(飞书)：' + detail);
                return { channel, ok: false, skipped: true, detail };
            }

            const url = 'https://open.feishu.cn/open-apis/bot/v2/hook/' + String(cfg.FSKEY);
            const body = {
                msg_type: 'text',
                content: { text: String(title) + '\n\n' + String(desp) },
            };

            const res = await this._request(cfg, url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = res.json || null;
            const ok = !!(data && (data.StatusCode === 0 || data.code === 0));
            if (!ok) {
                const detail = data ? (data.msg || trunc(res.text, 200)) : trunc(res.text, 200);
                console.warn('feishu failed:', res.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(飞书)：' + String(detail));
            }
            return { channel, ok, status: res.status };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {{url?:string}} params
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _pushMe(cfg, title, desp, params, ctx, msg) {
            const channel = 'pushme';
            if (!cfg.PUSHME_KEY) return { channel, ok: false, skipped: true, detail: 'PUSHME_KEY未配置' };

            const url = cfg.PUSHME_URL ? String(cfg.PUSHME_URL) : 'https://push.i-i.me';
            const body = Object.assign({ push_key: String(cfg.PUSHME_KEY), title: String(title), content: String(desp) }, params || {});

            const res = await this._request(cfg, url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });

            const ok = res.text === 'success' || (res.json && res.json === 'success');
            if (!ok) {
                const detail = trunc(res.text, 200);
                console.warn('pushme failed:', res.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(PushMe)：' + String(detail));
            }
            return { channel, ok, status: res.status };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _chronocat(cfg, title, desp, ctx, msg) {
            const channel = 'chronocat';
            if (!cfg.CHRONOCAT_TOKEN || !cfg.CHRONOCAT_QQ || !cfg.CHRONOCAT_URL) {
                return { channel, ok: false, skipped: true, detail: 'CHRONOCAT_TOKEN/CHRONOCAT_QQ/CHRONOCAT_URL未配置' };
            }

            const raw = String(cfg.CHRONOCAT_QQ);
            const userMatches = raw.match(/user_id=(\d+)/g);
            const groupMatches = raw.match(/group_id=(\d+)/g);

            const userIds = userMatches ? userMatches.map((m) => m.split('=')[1]) : [];
            const groupIds = groupMatches ? groupMatches.map((m) => m.split('=')[1]) : [];

            const baseUrl = String(cfg.CHRONOCAT_URL) + '/api/message/send';
            const headers = {
                'content-type': 'application/json',
                Authorization: 'Bearer ' + String(cfg.CHRONOCAT_TOKEN),
            };

            const targets = [];
            for (let i = 0; i < userIds.length; i++) targets.push({ chatType: 1, peerUin: userIds[i] });
            for (let i = 0; i < groupIds.length; i++) targets.push({ chatType: 2, peerUin: groupIds[i] });

            if (!targets.length) {
                return { channel, ok: false, skipped: true, detail: 'CHRONOCAT_QQ未解析到user_id/group_id' };
            }

            let okAll = true;
            let statusLast = 0;
            for (let i = 0; i < targets.length; i++) {
                const peer = targets[i];
                const data = {
                    peer: peer,
                    elements: [
                        {
                            elementType: 1,
                            textElement: { content: String(title) + '\n\n' + String(desp) },
                        },
                    ],
                };

                const res = await this._request(cfg, baseUrl, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(data),
                });

                statusLast = res.status || statusLast;
                if (!res.ok) {
                    okAll = false;
                    console.warn('chronocat failed:', res.status, trunc(res.text, 200));
                }
            }

            if (!okAll) {
                this._replyMaybe(cfg, ctx, msg, '通知失败(Chronocat)：部分目标推送失败');
            }
            return { channel, ok: okAll, status: statusLast, detail: okAll ? '' : 'partial failed' };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _webhook(cfg, title, desp, ctx, msg) {
            const channel = 'webhook';

            const method = String(cfg.WEBHOOK_METHOD || '').trim().toUpperCase();
            const urlTpl = String(cfg.WEBHOOK_URL || '').trim();
            const bodyTpl = String(cfg.WEBHOOK_BODY || '').trim();

            if (!method || !urlTpl || (urlTpl.indexOf('$title') < 0 && bodyTpl.indexOf('$title') < 0)) {
                return { channel, ok: false, skipped: true, detail: 'WEBHOOK_METHOD/WEBHOOK_URL未配置或未包含$title' };
            }

            const headers = parseHeaders(cfg.WEBHOOK_HEADERS || '');
            const ct = String(cfg.WEBHOOK_CONTENT_TYPE || '').trim();

            const valueFormatFn = (v) => {
                const t = replaceAllSafe(String(title), '\n', '\\n');
                const c = replaceAllSafe(String(desp), '\n', '\\n');
                let out = String(v);
                out = replaceAllSafe(out, '$title', t);
                out = replaceAllSafe(out, '$content', c);
                return out;
            };

            const parsedBody = parseBody(bodyTpl, ct, valueFormatFn);
            if (parsedBody && parsedBody.__unsupported) {
                const detail = '不支持的WEBHOOK_CONTENT_TYPE：' + String(ct) + '（' + String(parsedBody.reason || '') + '）';
                console.warn('webhook skipped:', detail);
                this._replyMaybe(cfg, ctx, msg, '通知跳过(Webhook)：' + detail);
                return { channel, ok: false, skipped: true, detail };
            }

            const bodyParam = formatBodyFun(ct, parsedBody);

            let finalUrl = urlTpl;
            finalUrl = replaceAllSafe(finalUrl, '$title', encodeURIComponent(String(title)));
            finalUrl = replaceAllSafe(finalUrl, '$content', encodeURIComponent(String(desp)));

            const opt = Object.assign({ method: method, headers: headers }, bodyParam);

            // fetch GET/HEAD no body
            if ((method === 'GET' || method === 'HEAD') && (opt.body || opt.json || opt.form)) {
                console.warn('webhook: GET/HEAD不允许body，已忽略body');
                delete opt.body;
                delete opt.json;
                delete opt.form;
            }

            // ensure content-type for non-FormData bodies
            if (ct && ct !== 'multipart/form-data') {
                if (!opt.headers['content-type'] && !opt.headers['Content-Type']) {
                    opt.headers['content-type'] = ct;
                }
            }

            const res = await this._request(cfg, finalUrl, opt);

            const ok = res.status === 200 || res.ok;
            if (!ok) {
                const detail = trunc(res.text, 200);
                console.warn('webhook failed:', res.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(Webhook)：HTTP ' + String(res.status));
            }
            return { channel, ok, status: res.status, detail: ok ? '' : 'http ' + String(res.status) };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _qmsg(cfg, title, desp, ctx, msg) {
            const channel = 'qmsg';
            if (!cfg.QMSG_KEY || !cfg.QMSG_TYPE) {
                return { channel, ok: false, skipped: true, detail: 'QMSG_KEY/QMSG_TYPE未配置' };
            }

            const url = 'https://qmsg.zendee.cn/' + String(cfg.QMSG_TYPE) + '/' + String(cfg.QMSG_KEY);
            const msgText = String(title) + '\n\n' + replaceAllSafe(String(desp), '----', '-');

            const body = typeof globalThis.URLSearchParams === 'function'
                ? new URLSearchParams({ msg: msgText }).toString()
                : 'msg=' + encodeURIComponent(msgText);

            const res = await this._request(cfg, url, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: body,
            });

            const data = res.json || null;
            const ok = !!(data && data.code === 0);
            if (!ok) {
                const detail = data ? trunc(JSON.stringify(data), 200) : trunc(res.text, 200);
                console.warn('qmsg failed:', res.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(Qmsg)：' + String(detail));
            }
            return { channel, ok, status: res.status };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _ntfy(cfg, title, desp, ctx, msg) {
            const channel = 'ntfy';
            if (!cfg.NTFY_TOPIC) return { channel, ok: false, skipped: true, detail: 'NTFY_TOPIC未配置' };

            const base = cfg.NTFY_URL || 'https://ntfy.sh';
            const url = String(base).replace(/\/+$/g, '') + '/' + encodeURIComponent(String(cfg.NTFY_TOPIC));

            const headers = {
                Title: encodeRFC2047Base64(String(title)),
                Priority: String(cfg.NTFY_PRIORITY || '3'),
            };

            if (cfg.NTFY_ICON) headers.Icon = String(cfg.NTFY_ICON);

            // Auth
            if (cfg.NTFY_TOKEN) {
                headers.Authorization = 'Bearer ' + String(cfg.NTFY_TOKEN);
            } else if (cfg.NTFY_USERNAME && cfg.NTFY_PASSWORD) {
                const basic = utf8ToBase64(String(cfg.NTFY_USERNAME) + ':' + String(cfg.NTFY_PASSWORD));
                headers.Authorization = 'Basic ' + basic;
            }

            if (cfg.NTFY_ACTIONS) {
                headers.Actions = encodeRFC2047Base64(String(cfg.NTFY_ACTIONS));
            }

            const res = await this._request(cfg, url, {
                method: 'POST',
                headers: headers,
                body: String(desp),
            });

            const data = res.json || null;
            const ok = !!(data && data.id) || (res.ok && res.status >= 200 && res.status < 300);
            if (!ok) {
                const detail = trunc(res.text, 200);
                console.warn('ntfy failed:', res.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(Ntfy)：HTTP ' + String(res.status));
            }
            return { channel, ok, status: res.status };
        }

        /**
         * @param {Object} cfg
         * @param {string} title
         * @param {string} desp
         * @param {seal.MsgContext=} ctx
         * @param {seal.Message=} msg
         */
        async _wxpusher(cfg, title, desp, ctx, msg) {
            const channel = 'wxpusher';
            if (!cfg.WXPUSHER_APP_TOKEN) return { channel, ok: false, skipped: true, detail: 'WXPUSHER_APP_TOKEN未配置' };

            const topicIds = [];
            if (cfg.WXPUSHER_TOPIC_IDS) {
                const arr = String(cfg.WXPUSHER_TOPIC_IDS).split(';').map((x) => x.trim()).filter((x) => x);
                for (let i = 0; i < arr.length; i++) {
                    const n = parseInt(arr[i], 10);
                    if (!isNaN(n)) topicIds.push(n);
                }
            }

            const uids = [];
            if (cfg.WXPUSHER_UIDS) {
                const arr = String(cfg.WXPUSHER_UIDS).split(';').map((x) => x.trim()).filter((x) => x);
                for (let i = 0; i < arr.length; i++) uids.push(arr[i]);
            }

            if (!topicIds.length && !uids.length) {
                return { channel, ok: false, skipped: true, detail: 'WXPUSHER_TOPIC_IDS 与 WXPUSHER_UIDS 至少配置一个' };
            }

            const body = {
                appToken: String(cfg.WXPUSHER_APP_TOKEN),
                content: '<h1>' + String(title) + '</h1><br/><div style="white-space: pre-wrap;">' + String(desp) + '</div>',
                summary: String(title),
                contentType: 2,
                topicIds: topicIds,
                uids: uids,
                verifyPayType: 0,
            };

            const res = await this._request(cfg, 'https://wxpusher.zjiecode.com/api/send/message', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = res.json || null;
            const ok = !!(data && data.code === 1000);
            if (!ok) {
                const detail = data ? (data.msg || trunc(res.text, 200)) : trunc(res.text, 200);
                console.warn('wxpusher failed:', res.status, detail);
                this._replyMaybe(cfg, ctx, msg, '通知失败(WxPusher)：' + String(detail));
            }
            return { channel, ok, status: res.status };
        }
    }

    // Expose instance globally
    globalThis.SealNotify = new SealNotify(ext);
})();
