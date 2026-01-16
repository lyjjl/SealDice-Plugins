// ==UserScript==
// @name         notifyAPI
// @author       某人
// @version      1.0.0
// @description  Notify channels (fetch-only) for SealDice. Exposes globalThis.SealNotify.send(...)
// @timestamp    0
// @license      MIT
// ==/UserScript==

/*
【已知问题】
1) Telegram 代理相关配置项未注册/未支持：TG_PROXY_HOST/TG_PROXY_PORT/TG_PROXY_AUTH 等在本插件不存在，仅支持直连 TG_API_HOST。
2) send() 内部使用 Promise.all + 单个 catch 包装，行为接近 allSettled，但返回的失败归因与“严格 allSettled”不完全一致。
3) Webhook 使用 GET/HEAD 且配置了 body 时，运行时会忽略 body（fetch 规范限制）；目前仅 console.warn，不会把“忽略原因”写进结果 detail。
4) 企业微信应用消息(QYWX_AM) 的 touser 分流规则：目前只识别“签到号 N”，未覆盖“账号N”的分支，可能导致接收人选择变窄。

【运行时限制与不支持项】
- 无 crypto/WebCrypto：不支持钉钉 DD_BOT_SECRET 签名模式；不支持飞书 FSSECRET 签名模式（填写 secret 会跳过并提示）。
- 所有参数必须通过 SealDice WebUI 配置项设置。
- AbortController 若不存在：TIMEOUT_MS 仅作为配置保留，不会真正中断请求（会在 console 给出一次性提示）。
- FormData 若不存在：WEBHOOK_CONTENT_TYPE= multipart/form-data 将判定不支持并跳过该通道。
- Basic/RFC2047/Base64：使用 btoa + UTF-8 转换实现，理论上支持中文标题/用户名密码。

【配置方法（WebUI）】
1) 打开插件配置，找到扩展名：notify。
2) 先开总开关：ENABLE_NOTIFY = true。
3) 可选：SKIP_TITLES 填入要跳过推送的标题列表（精确匹配）。
4) 对每个通道：
   - 打开通道开关 ENABLE_xxx = true
   - 填写该通道必填字段（token/url/key 等）
5) 通用网络行为：
   - TIMEOUT_MS：单次请求超时（不确定支不支持 AbortController 最好别开）
   - RETRY_TIMES：失败重试次数（默认 0）
6) 错误回显：
   - ERROR_TO_CHAT=true 且调用 send() 时传入 ctx/msg，才会把通道失败信息回复到聊天；否则只写 console。

【调用方法】
- 插件会挂载：globalThis.SealNotify
- 调用签名：
  await globalThis.SealNotify.send(title, content, params?, ctx?, msg?)
  - title: string 通知标题
  - content: string 通知正文
  - params: 可选对象（主要给 Bark/iGot 等通道透传 url 等字段）例如 { url: "https://example.com" }
  - ctx/msg: 可选（用于把错误发回当前会话；需要 ERROR_TO_CHAT=true）

【返回值】
{
  title: string,
  skipped: boolean, // 总开关关闭或标题命中 SKIP_TITLES 时为 true
  results: [
    { channel: string, ok: boolean, skipped?: boolean, status?: number, detail?: string }
  ]
}

【实例】
cmd.solve = async (ctx, msg, cmdArgs) => {
  const title = "测试通知";
  const content = "这里是正文\\n第二行";
  const params = { url: "https://example.com" };

  const ret = await globalThis.SealNotify.send(title, content, params, ctx, msg);

  // 可选：把汇总回给用户（注意别泄露任何 token）
  const okCnt = ret.results.filter(r => r.ok).length;
  const failCnt = ret.results.filter(r => !r.ok && !r.skipped).length;
  seal.replyToSender(ctx, msg, `推送完成：成功${okCnt}，失败${failCnt}`);
  return seal.ext.newCmdExecuteResult(true);
};

【实例】
seal.ext.registerTask(ext, "daily", "08:00", async () => {
  // taskCtx 里没有 msg；不传 ctx/msg 时错误只会写 console
  await globalThis.SealNotify.send("日报", "内容...", { url: "" });
}, "notify_daily", "每日通知示例");

【注意事项】
- 不要在聊天里回显任何 token/secret；ERROR_TO_CHAT 建议默认 false，仅在调试时开启。
- Webhook 若用 GET/HEAD：请把动态内容写进 WEBHOOK_URL（用 $title/$content 占位符），不要依赖 body。
- QYWX_AM 格式严格：corpid,corpsecret,touser(|分隔),agentid,类型(0/1/或thumb_media_id)。
- WxPusher 的 topicIds/uids 用英文分号 ; 分隔，且两者至少填一个。
- Chronocat 目标字符串支持 user_id=xxx 与 group_id=yyy，多条用英文分号 ; 分隔。
- Telegram 仅支持直连 TG_API_HOST；如需代理需在外部网络层解决或等待后续补齐代理配置项。
*/

(() => {
    /** @type {seal.ExtInfo} */
    let ext = seal.ext.find('notifyAPI');
    if (!ext) {
        ext = seal.ext.new('notifyAPI', '某人', '1.0.0');
        seal.ext.register(ext);

        // ----------------------------
        // Config registration
        // ----------------------------

        // General
        seal.ext.registerBoolConfig(ext, 'ENABLE_NOTIFY', true, '总开关：是否启用通知');
        seal.ext.registerIntConfig(
            ext,
            'TIMEOUT_MS',
            15000,
            '单次HTTP超时(ms)。若运行时无AbortController则不生效',
        );
        seal.ext.registerIntConfig(ext, 'RETRY_TIMES', 0, '失败重试次数(每通道)。默认0不重试');
        seal.ext.registerTemplateConfig(
            ext,
            'SKIP_TITLES',
            [],
            '跳过推送标题列表(精确匹配)。template: string[]',
        );
        seal.ext.registerBoolConfig(
            ext,
            'ERROR_TO_CHAT',
            false,
            '若提供ctx/msg，是否把通道错误回显到聊天',
        );

        // Channel enables
        seal.ext.registerBoolConfig(ext, 'ENABLE_SERVERCHAN', false, '启用：Server酱');
        seal.ext.registerBoolConfig(ext, 'ENABLE_PUSHPLUS', false, '启用：PushPlus');
        seal.ext.registerBoolConfig(ext, 'ENABLE_WEPLUS', false, '启用：微加机器人');
        seal.ext.registerBoolConfig(ext, 'ENABLE_BARK', false, '启用：Bark');
        seal.ext.registerBoolConfig(ext, 'ENABLE_TELEGRAM', false, '启用：Telegram Bot(无代理)');
        seal.ext.registerBoolConfig(
            ext,
            'ENABLE_DINGTALK',
            false,
            '启用：钉钉机器人(仅token模式，不支持secret签名)',
        );
        seal.ext.registerBoolConfig(ext, 'ENABLE_QYWX_BOT', false, '启用：企业微信机器人');
        seal.ext.registerBoolConfig(ext, 'ENABLE_QYWX_AM', false, '启用：企业微信应用消息');
        seal.ext.registerBoolConfig(ext, 'ENABLE_IGOT', false, '启用：iGot');
        seal.ext.registerBoolConfig(ext, 'ENABLE_GOBOT', false, '启用：go-cqhttp');
        seal.ext.registerBoolConfig(ext, 'ENABLE_GOTIFY', false, '启用：Gotify');
        seal.ext.registerBoolConfig(ext, 'ENABLE_SYNOLOGY_CHAT', false, '启用：Synology Chat');
        seal.ext.registerBoolConfig(ext, 'ENABLE_PUSHDEER', false, '启用：PushDeer');
        seal.ext.registerBoolConfig(ext, 'ENABLE_AIBOTK', false, '启用：智能微秘书');
        seal.ext.registerBoolConfig(
            ext,
            'ENABLE_FEISHU',
            false,
            '启用：飞书机器人(仅无签名模式，不支持FSSECRET)',
        );
        seal.ext.registerBoolConfig(ext, 'ENABLE_PUSHME', false, '启用：PushMe');
        seal.ext.registerBoolConfig(ext, 'ENABLE_CHRONOCAT', false, '启用：Chronocat');
        seal.ext.registerBoolConfig(ext, 'ENABLE_WEBHOOK', false, '启用：自定义Webhook');
        seal.ext.registerBoolConfig(ext, 'ENABLE_QMSG', false, '启用：Qmsg');
        seal.ext.registerBoolConfig(ext, 'ENABLE_NTFY', false, '启用：Ntfy');
        seal.ext.registerBoolConfig(ext, 'ENABLE_WXPUSHER', false, '启用：WxPusher');

        // Server酱
        seal.ext.registerStringConfig(ext, 'PUSH_KEY', '', 'Server酱PUSH_KEY');

        // PushPlus
        seal.ext.registerStringConfig(ext, 'PUSH_PLUS_TOKEN', '', 'pushplus token(必填)');
        seal.ext.registerStringConfig(ext, 'PUSH_PLUS_USER', '', 'pushplus topic(群组编码)，可空');
        seal.ext.registerStringConfig(
            ext,
            'PUSH_PLUS_TEMPLATE',
            'html',
            'pushplus template: html/txt/json/markdown等',
        );
        seal.ext.registerStringConfig(
            ext,
            'PUSH_PLUS_CHANNEL',
            'wechat',
            'pushplus channel: wechat/webhook/cp/mail/sms',
        );
        seal.ext.registerStringConfig(ext, 'PUSH_PLUS_WEBHOOK', '', 'pushplus webhook编码，可空');
        seal.ext.registerStringConfig(ext, 'PUSH_PLUS_CALLBACKURL', '', 'pushplus callbackUrl，可空');
        seal.ext.registerStringConfig(ext, 'PUSH_PLUS_TO', '', 'pushplus 好友令牌/企业微信用户id，可空');

        // 微加机器人
        seal.ext.registerStringConfig(ext, 'WE_PLUS_BOT_TOKEN', '', '微加机器人 token(必填)');
        seal.ext.registerStringConfig(ext, 'WE_PLUS_BOT_RECEIVER', '', '微加机器人 receiver，可空');
        seal.ext.registerStringConfig(ext, 'WE_PLUS_BOT_VERSION', 'pro', '微加机器人版本：pro/personal');

        // Bark
        seal.ext.registerStringConfig(
            ext,
            'BARK_PUSH',
            '',
            'Bark 设备码或完整URL。仅填设备码将自动补全',
        );
        seal.ext.registerBoolConfig(ext, 'BARK_ARCHIVE', false, 'Bark isArchive');
        seal.ext.registerStringConfig(ext, 'BARK_GROUP', '', 'Bark group，可空');
        seal.ext.registerStringConfig(ext, 'BARK_SOUND', '', 'Bark sound，可空');
        seal.ext.registerStringConfig(ext, 'BARK_ICON', '', 'Bark icon，可空');
        seal.ext.registerStringConfig(ext, 'BARK_LEVEL', '', 'Bark level，可空');
        seal.ext.registerStringConfig(ext, 'BARK_URL', '', 'Bark url(跳转链接)，可空');

        // Telegram
        seal.ext.registerStringConfig(ext, 'TG_BOT_TOKEN', '', 'Telegram bot token');
        seal.ext.registerStringConfig(ext, 'TG_USER_ID', '', 'Telegram chat_id(用户/群)');
        seal.ext.registerStringConfig(ext, 'TG_API_HOST', 'https://api.telegram.org', 'Telegram API Host');

        // 钉钉
        seal.ext.registerStringConfig(ext, 'DD_BOT_TOKEN', '', '钉钉机器人 access_token');
        seal.ext.registerStringConfig(
            ext,
            'DD_BOT_SECRET',
            '',
            '钉钉签名secret：本运行时无HMAC，填了将跳过并提示',
        );

        // 企业微信
        seal.ext.registerStringConfig(
            ext,
            'QYWX_ORIGIN',
            'https://qyapi.weixin.qq.com',
            '企业微信API Origin',
        );
        seal.ext.registerStringConfig(ext, 'QYWX_KEY', '', '企业微信机器人 webhook key');

        // 企业微信应用消息
        seal.ext.registerStringConfig(
            ext,
            'QYWX_AM',
            '',
            '企业微信应用消息：corpid,corpsecret,touser(|分隔),agentid,消息类型(0/1/或thumb_media_id)',
        );
        seal.ext.registerIntConfig(ext, 'QYWXAM_MAXLEN', 900, '企业微信应用消息分段长度(默认900)');

        // iGot
        seal.ext.registerStringConfig(ext, 'IGOT_PUSH_KEY', '', 'iGot key(24位字母数字)');

        // go-cqhttp
        seal.ext.registerStringConfig(
            ext,
            'GOBOT_URL',
            '',
            'go-cqhttp URL，例如 http://127.0.0.1/send_group_msg',
        );
        seal.ext.registerStringConfig(
            ext,
            'GOBOT_QQ',
            '',
            'go-cqhttp 推送目标，例如 group_id=123 或 user_id=456',
        );
        seal.ext.registerStringConfig(ext, 'GOBOT_TOKEN', '', 'go-cqhttp access_token，可空');

        // Gotify
        seal.ext.registerStringConfig(
            ext,
            'GOTIFY_URL',
            '',
            'Gotify base url，例如 https://push.example.de:8080',
        );
        seal.ext.registerStringConfig(ext, 'GOTIFY_TOKEN', '', 'Gotify app token');
        seal.ext.registerIntConfig(ext, 'GOTIFY_PRIORITY', 0, 'Gotify priority(整数)');

        // Synology Chat
        seal.ext.registerStringConfig(
            ext,
            'CHAT_URL',
            '',
            'Synology Chat URL(含路径前缀)，例如 https://host/webapi/entry.cgi?api=SYNO.Chat.External&method=incoming&version=2&token=',
        );
        seal.ext.registerStringConfig(ext, 'CHAT_TOKEN', '', 'Synology Chat token(拼接到CHAT_URL后)');

        // PushDeer
        seal.ext.registerStringConfig(ext, 'DEER_KEY', '', 'PushDeer key');
        seal.ext.registerStringConfig(
            ext,
            'DEER_URL',
            '',
            'PushDeer URL，可空(默认 https://api2.pushdeer.com/message/push)',
        );

        // 智能微秘书
        seal.ext.registerStringConfig(ext, 'AIBOTK_KEY', '', '智能微秘书 apiKey');
        seal.ext.registerStringConfig(ext, 'AIBOTK_TYPE', '', '智能微秘书 type: room/contact');
        seal.ext.registerStringConfig(ext, 'AIBOTK_NAME', '', '智能微秘书 roomName 或 contact name');

        // 飞书
        seal.ext.registerStringConfig(ext, 'FSKEY', '', '飞书机器人 hook key');
        seal.ext.registerStringConfig(
            ext,
            'FSSECRET',
            '',
            '飞书签名secret：本运行时无HMAC，填了将跳过并提示',
        );

        // PushMe
        seal.ext.registerStringConfig(ext, 'PUSHME_KEY', '', 'PushMe push_key');
        seal.ext.registerStringConfig(ext, 'PUSHME_URL', '', 'PushMe URL，可空(默认 https://push.i-i.me)');

        // Chronocat
        seal.ext.registerStringConfig(
            ext,
            'CHRONOCAT_QQ',
            '',
            'Chronocat 目标：user_id=xxx;group_id=yyy (英文;分隔可多条)',
        );
        seal.ext.registerStringConfig(ext, 'CHRONOCAT_TOKEN', '', 'Chronocat Bearer token');
        seal.ext.registerStringConfig(ext, 'CHRONOCAT_URL', '', 'Chronocat base url，例如 http://127.0.0.1:16530');

        // Webhook (option)
        seal.ext.registerStringConfig(ext, 'WEBHOOK_URL', '', 'Webhook URL，支持 $title $content 占位符');
        seal.ext.registerStringConfig(ext, 'WEBHOOK_BODY', '', 'Webhook Body，支持 $title $content 占位符');
        seal.ext.registerStringConfig(ext, 'WEBHOOK_HEADERS', '', 'Webhook Headers：每行 k: v');
        seal.ext.registerOptionConfig(
            ext,
            'WEBHOOK_METHOD',
            '',
            ['', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            'Webhook Method：GET/POST/PUT/PATCH/DELETE',
        );
        seal.ext.registerOptionConfig(
            ext,
            'WEBHOOK_CONTENT_TYPE',
            '',
            ['', 'application/json', 'application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'],
            'Webhook content-type：application/json / x-www-form-urlencoded / multipart/form-data / text/plain',
        );

        // Qmsg
        seal.ext.registerStringConfig(ext, 'QMSG_KEY', '', 'Qmsg key');
        seal.ext.registerStringConfig(ext, 'QMSG_TYPE', '', 'Qmsg type，例如 send');

        // Ntfy
        seal.ext.registerStringConfig(ext, 'NTFY_URL', 'https://ntfy.sh', 'Ntfy URL');
        seal.ext.registerStringConfig(ext, 'NTFY_TOPIC', '', 'Ntfy topic(必填)');
        seal.ext.registerIntConfig(ext, 'NTFY_PRIORITY', 3, 'Ntfy priority(默认3)');
        seal.ext.registerStringConfig(ext, 'NTFY_TOKEN', '', 'Ntfy token(Bearer)，可空');
        seal.ext.registerStringConfig(ext, 'NTFY_USERNAME', '', 'Ntfy username(Basic)，可空');
        seal.ext.registerStringConfig(ext, 'NTFY_PASSWORD', '', 'Ntfy password(Basic)，可空');
        seal.ext.registerStringConfig(ext, 'NTFY_ACTIONS', '', 'Ntfy actions，可空(将RFC2047编码)');
        seal.ext.registerStringConfig(ext, 'NTFY_ICON', '', 'Ntfy Icon URL，可空');

        // WxPusher
        seal.ext.registerStringConfig(ext, 'WXPUSHER_APP_TOKEN', '', 'wxpusher appToken');
        seal.ext.registerStringConfig(
            ext,
            'WXPUSHER_TOPIC_IDS',
            '',
            'wxpusher topicIds，英文分号;分隔，至少与uids配置一个',
        );
        seal.ext.registerStringConfig(
            ext,
            'WXPUSHER_UIDS',
            '',
            'wxpusher uids，英文分号;分隔，至少与topicIds配置一个',
        );
    }

    // ----------------------------
    // Utilities
    // ----------------------------

    const _onceWarned = new Set();

    /**
     * @param {string} key
     * @param {string} msg
     */
    function warnOnce(key, msg) {
        if (_onceWarned.has(key)) return;
        _onceWarned.add(key);
        console.warn(msg);
    }

    /**
     * Replace all occurrences without relying on String.prototype.replaceAll.
     * @param {string} s
     * @param {string} search
     * @param {string} repl
     * @returns {string}
     */
    function replaceAllCompat(s, search, repl) {
        if (typeof s !== 'string' || !search) return s;
        if (typeof s.replaceAll === 'function') return s.replaceAll(search, repl);
        return s.split(search).join(repl);
    }

    /**
     * @param {any} v
     * @param {boolean} def
     * @returns {boolean}
     */
    function asBool(v, def) {
        if (typeof v === 'boolean') return v;
        if (typeof v === 'number') return v !== 0;
        if (typeof v === 'string') {
            const s = v.trim().toLowerCase();
            return !(s === '' || s === '0' || s === 'false' || s === 'no' || s === 'off');

        }
        return def;
    }

    /**
     * @param {any} v
     * @param {number} def
     * @returns {number}
     */
    function asInt(v, def) {
        if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
        if (typeof v === 'string') {
            const n = parseInt(v.trim(), 10);
            return Number.isFinite(n) ? n : def;
        }
        return def;
    }

    /**
     * @param {any} v
     * @param {string} def
     * @returns {string}
     */
    function asStr(v, def) {
        if (typeof v === 'string') return v;
        if (v == null) return def;
        return String(v);
    }

    /**
     * @param {any} v
     * @param {string[]} def
     * @returns {string[]}
     */
    function asStrArr(v, def) {
        if (Array.isArray(v)) return v.map((x) => asStr(x, '')).filter((x) => x !== '');
        if (typeof v === 'string') {
            const s = v.trim();
            if (!s) return def;
            return s.split('\n').map((x) => x.trim()).filter(Boolean);
        }
        return def;
    }

    /**
     * typed-getter first; fallback to getConfig().value and coercion.
     * @param {string} key
     * @param {boolean} def
     * @returns {boolean}
     */
    function safeGetBool(key, def) {
        try {
            return seal.ext.getBoolConfig(ext, key);
        } catch (e) {
            try {
                const it = seal.ext.getConfig(ext, key);
                return it ? asBool(it.value, def) : def;
            } catch (e2) {
                return def;
            }
        }
    }

    /**
     * @param {string} key
     * @param {number} def
     * @returns {number}
     */
    function safeGetInt(key, def) {
        try {
            return seal.ext.getIntConfig(ext, key);
        } catch (e) {
            try {
                const it = seal.ext.getConfig(ext, key);
                return it ? asInt(it.value, def) : def;
            } catch (e2) {
                return def;
            }
        }
    }

    /**
     * @param {string} key
     * @param {string} def
     * @returns {string}
     */
    function safeGetString(key, def) {
        try {
            return seal.ext.getStringConfig(ext, key);
        } catch (e) {
            try {
                const it = seal.ext.getConfig(ext, key);
                return it ? asStr(it.value, def) : def;
            } catch (e2) {
                return def;
            }
        }
    }

    /**
     * @param {string} key
     * @param {string[]} def
     * @returns {string[]}
     */
    function safeGetTemplate(key, def) {
        try {
            return seal.ext.getTemplateConfig(ext, key);
        } catch (e) {
            try {
                const it = seal.ext.getConfig(ext, key);
                return it ? asStrArr(it.value, def) : def;
            } catch (e2) {
                return def;
            }
        }
    }

    /**
     * @param {string} key
     * @param {string} def
     * @returns {string}
     */
    function safeGetOption(key, def) {
        try {
            return seal.ext.getOptionConfig(ext, key);
        } catch (e) {
            return safeGetString(key, def);
        }
    }

    /**
     * Convert UTF-8 string to base64 using btoa.
     * @param {string} s
     * @returns {string}
     */
    function b64Utf8(s) {
        try {
            if (typeof TextEncoder !== 'undefined') {
                const bytes = new TextEncoder().encode(s);
                let bin = '';
                for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
                return btoa(bin);
            }
        } catch (e) {
            // ignore and fallback
        }
        // Fallback: encodeURIComponent -> binary string
        // eslint-disable-next-line no-undef
        return btoa(unescape(encodeURIComponent(s)));
    }

    /**
     * RFC2047 (encoded-word) for headers
     * @param {string} s
     * @returns {string}
     */
    function encodeRFC2047(s) {
        return `=?utf-8?B?${b64Utf8(s)}?=`;
    }

    /**
     * @param {string} method
     * @param {string} url
     * @param {object} headers
     * @param {any} body
     * @param {number} timeoutMs
     * @returns {Promise<{ ok: boolean, status: number, text: string, json: any }>}
     */
    async function http(method, url, headers, body, timeoutMs) {
        const hasAbort = typeof AbortController !== 'undefined';
        if (!hasAbort) warnOnce('no_abort', '[notify] AbortController 不存在：TIMEOUT_MS 不会真正中断请求');

        /** @type {AbortController|null} */
        const ac = hasAbort ? new AbortController() : null;
        /** @type {any} */
        let timer = null;
        if (ac && timeoutMs > 0) {
            timer = setTimeout(() => {
                try {
                    ac.abort();
                } catch (e) {}
            }, timeoutMs);
        }

        try {
            const resp = await fetch(url, {
                method,
                headers,
                body,
                signal: ac ? ac.signal : undefined,
            });
            const text = await resp.text();
            let json = null;
            try {
                json = JSON.parse(text);
            } catch (e) {}
            return { ok: resp.ok, status: resp.status, text, json };
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    /**
     * @param {string} headersText
     * @returns {Record<string,string>}
     */
    function parseHeaders(headersText) {
        if (!headersText) return {};
        const parsed = {};
        const lines = headersText.split('\n');
        for (const line of lines) {
            const i = line.indexOf(':');
            if (i <= 0) continue;
            const key = line.slice(0, i).trim();
            const val = line.slice(i + 1).trim();
            if (!key) continue;
            parsed[key] = parsed[key] ? `${parsed[key]}, ${val}` : val;
        }
        return parsed;
    }

    /**
     * Parse "k: v" blocks; allow JSON value.
     * @param {string} input
     * @param {(v: string) => string} [valueFormatFn]
     * @returns {Record<string, any>}
     */
    function parseStringMap(input, valueFormatFn) {
        const regex = /(\w+):\s*((?:(?!\n\w+:).)*)/g;
        const matches = {};
        let match;
        while ((match = regex.exec(input)) !== null) {
            const key = (match[1] || '').trim();
            if (!key || Object.prototype.hasOwnProperty.call(matches, key)) continue;

            let v = (match[2] || '').trim();
            try {
                v = valueFormatFn ? valueFormatFn(v) : v;
                matches[key] = JSON.parse(v);
            } catch (e) {
                matches[key] = v;
            }
        }
        return matches;
    }

    /**
     * @param {string} bodyText
     * @param {string} contentType
     * @param {(v: string) => string} [valueFormatFn]
     * @returns {any}
     */
    function parseBody(bodyText, contentType, valueFormatFn) {
        if (!bodyText) return null;

        if (contentType === 'text/plain') {
            return valueFormatFn ? valueFormatFn(bodyText) : bodyText;
        }

        const parsed = parseStringMap(bodyText, valueFormatFn);

        if (contentType === 'multipart/form-data') {
            if (typeof FormData === 'undefined') {
                warnOnce('no_formdata', '[notify] FormData 不存在：multipart/form-data Webhook 会跳过');
                return null;
            }
            const fd = new FormData();
            for (const k of Object.keys(parsed)) fd.append(k, parsed[k]);
            return fd;
        }

        if (contentType === 'application/x-www-form-urlencoded') {
            if (typeof URLSearchParams !== 'undefined') {
                const usp = new URLSearchParams();
                for (const k of Object.keys(parsed)) usp.append(k, String(parsed[k]));
                return usp.toString();
            }
            // fallback
            const parts = [];
            for (const k of Object.keys(parsed)) {
                parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(parsed[k]))}`);
            }
            return parts.join('&');
        }

        // application/json or other: return object
        return parsed;
    }

    /**
     * @param {string} contentType
     * @param {any} body
     * @returns {{ headers: Record<string,string>, body: any }}
     */
    function formatBody(contentType, body) {
        /** @type {Record<string,string>} */
        const headers = {};
        if (body == null) return { headers, body: null };

        switch (contentType) {
            case 'application/json':
                headers['Content-Type'] = 'application/json';
                return { headers, body: JSON.stringify(body) };
            case 'multipart/form-data':
                // fetch will set boundary automatically if body is FormData
                return { headers, body };
            case 'application/x-www-form-urlencoded':
                headers['Content-Type'] = 'application/x-www-form-urlencoded';
                return { headers, body: typeof body === 'string' ? body : String(body) };
            case 'text/plain':
                headers['Content-Type'] = 'text/plain';
                return { headers, body: typeof body === 'string' ? body : String(body) };
            default:
                return { headers, body };
        }
    }

    /**
     * @typedef {Object} NotifySendResult
     * @property {string} title
     * @property {boolean} skipped
     * @property {Array<{channel:string, ok:boolean, skipped?:boolean, status?:number, detail?:string}>} results
     */

    /**
     * Notification core.
     */
    class SealNotify {
        /**
         * @param {seal.ExtInfo} extRef
         */
        constructor(extRef) {
            /** @private */
            this._ext = extRef;
        }

        /**
         * Snapshot configs for atomic send.
         * typed getter first; fallback to getConfig().value and coercion.
         * @returns {Record<string, any>}
         * @private
         */
        _snapshotConfig() {
            return {
                // General
                ENABLE_NOTIFY: safeGetBool('ENABLE_NOTIFY', true),
                TIMEOUT_MS: safeGetInt('TIMEOUT_MS', 15000),
                RETRY_TIMES: safeGetInt('RETRY_TIMES', 0),
                SKIP_TITLES: safeGetTemplate('SKIP_TITLES', []),
                ERROR_TO_CHAT: safeGetBool('ERROR_TO_CHAT', false),

                // Enables
                ENABLE_SERVERCHAN: safeGetBool('ENABLE_SERVERCHAN', false),
                ENABLE_PUSHPLUS: safeGetBool('ENABLE_PUSHPLUS', false),
                ENABLE_WEPLUS: safeGetBool('ENABLE_WEPLUS', false),
                ENABLE_BARK: safeGetBool('ENABLE_BARK', false),
                ENABLE_TELEGRAM: safeGetBool('ENABLE_TELEGRAM', false),
                ENABLE_DINGTALK: safeGetBool('ENABLE_DINGTALK', false),
                ENABLE_QYWX_BOT: safeGetBool('ENABLE_QYWX_BOT', false),
                ENABLE_QYWX_AM: safeGetBool('ENABLE_QYWX_AM', false),
                ENABLE_IGOT: safeGetBool('ENABLE_IGOT', false),
                ENABLE_GOBOT: safeGetBool('ENABLE_GOBOT', false),
                ENABLE_GOTIFY: safeGetBool('ENABLE_GOTIFY', false),
                ENABLE_SYNOLOGY_CHAT: safeGetBool('ENABLE_SYNOLOGY_CHAT', false),
                ENABLE_PUSHDEER: safeGetBool('ENABLE_PUSHDEER', false),
                ENABLE_AIBOTK: safeGetBool('ENABLE_AIBOTK', false),
                ENABLE_FEISHU: safeGetBool('ENABLE_FEISHU', false),
                ENABLE_PUSHME: safeGetBool('ENABLE_PUSHME', false),
                ENABLE_CHRONOCAT: safeGetBool('ENABLE_CHRONOCAT', false),
                ENABLE_WEBHOOK: safeGetBool('ENABLE_WEBHOOK', false),
                ENABLE_QMSG: safeGetBool('ENABLE_QMSG', false),
                ENABLE_NTFY: safeGetBool('ENABLE_NTFY', false),
                ENABLE_WXPUSHER: safeGetBool('ENABLE_WXPUSHER', false),

                // ServerChan
                PUSH_KEY: safeGetString('PUSH_KEY', ''),

                // PushPlus
                PUSH_PLUS_TOKEN: safeGetString('PUSH_PLUS_TOKEN', ''),
                PUSH_PLUS_USER: safeGetString('PUSH_PLUS_USER', ''),
                PUSH_PLUS_TEMPLATE: safeGetString('PUSH_PLUS_TEMPLATE', 'html'),
                PUSH_PLUS_CHANNEL: safeGetString('PUSH_PLUS_CHANNEL', 'wechat'),
                PUSH_PLUS_WEBHOOK: safeGetString('PUSH_PLUS_WEBHOOK', ''),
                PUSH_PLUS_CALLBACKURL: safeGetString('PUSH_PLUS_CALLBACKURL', ''),
                PUSH_PLUS_TO: safeGetString('PUSH_PLUS_TO', ''),

                // WePlus
                WE_PLUS_BOT_TOKEN: safeGetString('WE_PLUS_BOT_TOKEN', ''),
                WE_PLUS_BOT_RECEIVER: safeGetString('WE_PLUS_BOT_RECEIVER', ''),
                WE_PLUS_BOT_VERSION: safeGetString('WE_PLUS_BOT_VERSION', 'pro'),

                // Bark
                BARK_PUSH: safeGetString('BARK_PUSH', ''),
                BARK_ARCHIVE: safeGetBool('BARK_ARCHIVE', false),
                BARK_GROUP: safeGetString('BARK_GROUP', ''),
                BARK_SOUND: safeGetString('BARK_SOUND', ''),
                BARK_ICON: safeGetString('BARK_ICON', ''),
                BARK_LEVEL: safeGetString('BARK_LEVEL', ''),
                BARK_URL: safeGetString('BARK_URL', ''),

                // Telegram
                TG_BOT_TOKEN: safeGetString('TG_BOT_TOKEN', ''),
                TG_USER_ID: safeGetString('TG_USER_ID', ''),
                TG_API_HOST: safeGetString('TG_API_HOST', 'https://api.telegram.org'),

                // DingTalk
                DD_BOT_TOKEN: safeGetString('DD_BOT_TOKEN', ''),
                DD_BOT_SECRET: safeGetString('DD_BOT_SECRET', ''),

                // QYWX bot
                QYWX_ORIGIN: safeGetString('QYWX_ORIGIN', 'https://qyapi.weixin.qq.com'),
                QYWX_KEY: safeGetString('QYWX_KEY', ''),

                // QYWX AM
                QYWX_AM: safeGetString('QYWX_AM', ''),
                QYWXAM_MAXLEN: safeGetInt('QYWXAM_MAXLEN', 900),

                // iGot
                IGOT_PUSH_KEY: safeGetString('IGOT_PUSH_KEY', ''),

                // go-cqhttp
                GOBOT_URL: safeGetString('GOBOT_URL', ''),
                GOBOT_QQ: safeGetString('GOBOT_QQ', ''),
                GOBOT_TOKEN: safeGetString('GOBOT_TOKEN', ''),

                // Gotify
                GOTIFY_URL: safeGetString('GOTIFY_URL', ''),
                GOTIFY_TOKEN: safeGetString('GOTIFY_TOKEN', ''),
                GOTIFY_PRIORITY: safeGetInt('GOTIFY_PRIORITY', 0),

                // Synology Chat
                CHAT_URL: safeGetString('CHAT_URL', ''),
                CHAT_TOKEN: safeGetString('CHAT_TOKEN', ''),

                // PushDeer
                DEER_KEY: safeGetString('DEER_KEY', ''),
                DEER_URL: safeGetString('DEER_URL', ''),

                // AIBOTK
                AIBOTK_KEY: safeGetString('AIBOTK_KEY', ''),
                AIBOTK_TYPE: safeGetString('AIBOTK_TYPE', ''),
                AIBOTK_NAME: safeGetString('AIBOTK_NAME', ''),

                // Feishu
                FSKEY: safeGetString('FSKEY', ''),
                FSSECRET: safeGetString('FSSECRET', ''),

                // PushMe
                PUSHME_KEY: safeGetString('PUSHME_KEY', ''),
                PUSHME_URL: safeGetString('PUSHME_URL', ''),

                // Chronocat
                CHRONOCAT_QQ: safeGetString('CHRONOCAT_QQ', ''),
                CHRONOCAT_TOKEN: safeGetString('CHRONOCAT_TOKEN', ''),
                CHRONOCAT_URL: safeGetString('CHRONOCAT_URL', ''),

                // Webhook
                WEBHOOK_URL: safeGetString('WEBHOOK_URL', ''),
                WEBHOOK_BODY: safeGetString('WEBHOOK_BODY', ''),
                WEBHOOK_HEADERS: safeGetString('WEBHOOK_HEADERS', ''),
                WEBHOOK_METHOD: safeGetOption('WEBHOOK_METHOD', ''),
                WEBHOOK_CONTENT_TYPE: safeGetOption('WEBHOOK_CONTENT_TYPE', ''),

                // Qmsg
                QMSG_KEY: safeGetString('QMSG_KEY', ''),
                QMSG_TYPE: safeGetString('QMSG_TYPE', ''),

                // Ntfy
                NTFY_URL: safeGetString('NTFY_URL', 'https://ntfy.sh'),
                NTFY_TOPIC: safeGetString('NTFY_TOPIC', ''),
                NTFY_PRIORITY: safeGetInt('NTFY_PRIORITY', 3),
                NTFY_TOKEN: safeGetString('NTFY_TOKEN', ''),
                NTFY_USERNAME: safeGetString('NTFY_USERNAME', ''),
                NTFY_PASSWORD: safeGetString('NTFY_PASSWORD', ''),
                NTFY_ACTIONS: safeGetString('NTFY_ACTIONS', ''),
                NTFY_ICON: safeGetString('NTFY_ICON', ''),

                // WxPusher
                WXPUSHER_APP_TOKEN: safeGetString('WXPUSHER_APP_TOKEN', ''),
                WXPUSHER_TOPIC_IDS: safeGetString('WXPUSHER_TOPIC_IDS', ''),
                WXPUSHER_UIDS: safeGetString('WXPUSHER_UIDS', ''),
            };
        }

        /**
         * Send notification to enabled channels.
         * @param {string} title
         * @param {string} content
         * @param {Record<string, any>} [params]
         * @param {seal.MsgContext} [ctx]
         * @param {seal.Message} [msg]
         * @returns {Promise<NotifySendResult>}
         */
        async send(title, content, params = {}, ctx, msg) {
            const cfg = this._snapshotConfig();

            if (!cfg.ENABLE_NOTIFY) {
                return { title, skipped: true, results: [] };
            }

            const skip = Array.isArray(cfg.SKIP_TITLES) && cfg.SKIP_TITLES.includes(title);
            if (skip) {
                return { title, skipped: true, results: [] };
            }

            /** @type {Array<Promise<{channel:string, ok:boolean, skipped?:boolean, status?:number, detail?:string}>>} */
            const tasks = [];

            tasks.push(this._wrapChannel('serverchan', cfg, () => this._serverChan(cfg, title, content), ctx, msg));
            tasks.push(this._wrapChannel('pushplus', cfg, () => this._pushPlus(cfg, title, content), ctx, msg));
            tasks.push(this._wrapChannel('weplus', cfg, () => this._wePlus(cfg, title, content), ctx, msg));
            tasks.push(this._wrapChannel('bark', cfg, () => this._bark(cfg, title, content, params), ctx, msg));
            tasks.push(this._wrapChannel('telegram', cfg, () => this._telegram(cfg, title, content), ctx, msg));
            tasks.push(this._wrapChannel('dingtalk', cfg, () => this._dingTalk(cfg, title, content), ctx, msg));
            tasks.push(this._wrapChannel('qywx_bot', cfg, () => this._qywxBot(cfg, title, content), ctx, msg));
            tasks.push(this._wrapChannel('qywx_am', cfg, () => this._qywxAm(cfg, title, content), ctx, msg));
            tasks.push(this._wrapChannel('igot', cfg, () => this._igot(cfg, title, content, params), ctx, msg));
            tasks.push(this._wrapChannel('gobot', cfg, () => this._gobot(cfg, title, content), ctx, msg));
            tasks.push(this._wrapChannel('gotify', cfg, () => this._gotify(cfg, title, content), ctx, msg));
            tasks.push(this._wrapChannel('synology_chat', cfg, () => this._synologyChat(cfg, title, content), ctx, msg));
            tasks.push(this._wrapChannel('pushdeer', cfg, () => this._pushDeer(cfg, title, content), ctx, msg));
            tasks.push(this._wrapChannel('aibotk', cfg, () => this._aibotk(cfg, title, content), ctx, msg));
            tasks.push(this._wrapChannel('feishu', cfg, () => this._feishu(cfg, title, content), ctx, msg));
            tasks.push(this._wrapChannel('pushme', cfg, () => this._pushMe(cfg, title, content, params), ctx, msg));
            tasks.push(this._wrapChannel('chronocat', cfg, () => this._chronocat(cfg, title, content), ctx, msg));
            tasks.push(this._wrapChannel('webhook', cfg, () => this._webhook(cfg, title, content), ctx, msg));
            tasks.push(this._wrapChannel('qmsg', cfg, () => this._qmsg(cfg, title, content), ctx, msg));
            tasks.push(this._wrapChannel('ntfy', cfg, () => this._ntfy(cfg, title, content), ctx, msg));
            tasks.push(this._wrapChannel('wxpusher', cfg, () => this._wxpusher(cfg, title, content), ctx, msg));

            const results = await Promise.all(tasks);
            return { title, skipped: false, results };
        }

        /**
         * Wrap a channel execution with retry + error handling.
         * @param {string} channel
         * @param {Record<string,any>} cfg
         * @param {() => Promise<{ok:boolean, skipped?:boolean, status?:number, detail?:string}>} fn
         * @param {seal.MsgContext} [ctx]
         * @param {seal.Message} [msg]
         * @returns {Promise<{channel:string, ok:boolean, skipped?:boolean, status?:number, detail?:string}>}
         * @private
         */
        async _wrapChannel(channel, cfg, fn, ctx, msg) {
            const maxRetry = Math.max(0, cfg.RETRY_TIMES | 0);

            for (let attempt = 0; attempt <= maxRetry; attempt++) {
                try {
                    const r = await fn();
                    return { channel, ...r };
                } catch (e) {
                    const detail = e && e.message ? String(e.message) : String(e);
                    const last = attempt >= maxRetry;
                    if (last) {
                        if (cfg.ERROR_TO_CHAT && ctx && msg) {
                            try {
                                seal.replyToSender(ctx, msg, `[notify:${channel}] 发送失败：${detail}`);
                            } catch (e2) {}
                        } else {
                            console.error(`[notify:${channel}] failed`, e);
                        }
                        return { channel, ok: false, status: 0, detail };
                    }
                }
            }
            return { channel, ok: false, status: 0, detail: 'unknown' };
        }

        // ----------------------------
        // Channels
        // ----------------------------

        /**
         * Server酱
         * @private
         */
        async _serverChan(cfg, title, content) {
            if (!cfg.ENABLE_SERVERCHAN) return { ok: true, skipped: true };
            if (!cfg.PUSH_KEY) return { ok: true, skipped: true };

            const desp = String(content || '').replace(/[\n\r]/g, '\n\n');
            const match = String(cfg.PUSH_KEY).match(/^sctp(\d+)t/i);
            const url = match && match[1]
                ? `https://${match[1]}.push.ft07.com/send/${cfg.PUSH_KEY}.send`
                : `https://sctapi.ftqq.com/${cfg.PUSH_KEY}.send`;

            const body = `text=${encodeURIComponent(title)}&desp=${encodeURIComponent(desp)}`;
            const resp = await http('POST', url, { 'Content-Type': 'application/x-www-form-urlencoded' }, body, cfg.TIMEOUT_MS);
            const ok = resp.ok && resp.json && (resp.json.errno === 0 || (resp.json.data && resp.json.data.errno === 0));
            return { ok, status: resp.status, detail: ok ? '' : resp.text };
        }

        /**
         * PushPlus
         * @private
         */
        async _pushPlus(cfg, title, content) {
            if (!cfg.ENABLE_PUSHPLUS) return { ok: true, skipped: true };
            if (!cfg.PUSH_PLUS_TOKEN) return { ok: true, skipped: true };

            const desp = String(content || '').replace(/[\n\r]/g, '<br>');
            const body = {
                token: String(cfg.PUSH_PLUS_TOKEN),
                title: String(title),
                content: String(desp),
                topic: String(cfg.PUSH_PLUS_USER || ''),
                template: String(cfg.PUSH_PLUS_TEMPLATE || 'html'),
                channel: String(cfg.PUSH_PLUS_CHANNEL || 'wechat'),
                webhook: String(cfg.PUSH_PLUS_WEBHOOK || ''),
                callbackUrl: String(cfg.PUSH_PLUS_CALLBACKURL || ''),
                to: String(cfg.PUSH_PLUS_TO || ''),
            };

            const resp = await http(
                'POST',
                'https://www.pushplus.plus/send',
                { 'Content-Type': 'application/json' },
                JSON.stringify(body),
                cfg.TIMEOUT_MS,
            );
            const ok = resp.ok && resp.json && resp.json.code === 200;
            return { ok, status: resp.status, detail: ok ? '' : resp.text };
        }

        /**
         * 微加机器人
         * @private
         */
        async _wePlus(cfg, title, content) {
            if (!cfg.ENABLE_WEPLUS) return { ok: true, skipped: true };
            if (!cfg.WE_PLUS_BOT_TOKEN) return { ok: true, skipped: true };

            let template = 'txt';
            let desp = String(content || '');
            if (desp.length > 800) {
                desp = desp.replace(/[\n\r]/g, '<br>');
                template = 'html';
            }

            const body = {
                token: String(cfg.WE_PLUS_BOT_TOKEN),
                title: String(title),
                content: String(desp),
                template: template,
                receiver: String(cfg.WE_PLUS_BOT_RECEIVER || ''),
                version: String(cfg.WE_PLUS_BOT_VERSION || 'pro'),
            };

            const resp = await http(
                'POST',
                'https://www.weplusbot.com/send',
                { 'Content-Type': 'application/json' },
                JSON.stringify(body),
                cfg.TIMEOUT_MS,
            );
            const ok = resp.ok && resp.json && resp.json.code === 200;
            return { ok, status: resp.status, detail: ok ? '' : resp.text };
        }

        /**
         * Bark
         * @private
         */
        async _bark(cfg, title, content, params) {
            if (!cfg.ENABLE_BARK) return { ok: true, skipped: true };
            if (!cfg.BARK_PUSH) return { ok: true, skipped: true };

            let barkPush = String(cfg.BARK_PUSH);
            if (!/^https?:\/\//i.test(barkPush)) {
                barkPush = `https://api.day.app/${barkPush}`;
            }

            const body = {
                title: String(title),
                body: String(content || ''),
                icon: String(cfg.BARK_ICON || ''),
                sound: String(cfg.BARK_SOUND || ''),
                group: String(cfg.BARK_GROUP || ''),
                isArchive: !!cfg.BARK_ARCHIVE,
                level: String(cfg.BARK_LEVEL || ''),
                url: String(cfg.BARK_URL || ''),
                ...(params || {}),
            };

            const resp = await http(
                'POST',
                barkPush,
                { 'Content-Type': 'application/json' },
                JSON.stringify(body),
                cfg.TIMEOUT_MS,
            );
            const ok = resp.ok && resp.json && resp.json.code === 200;
            return { ok, status: resp.status, detail: ok ? '' : resp.text };
        }

        /**
         * Telegram Bot
         * @private
         */
        async _telegram(cfg, title, content) {
            if (!cfg.ENABLE_TELEGRAM) return { ok: true, skipped: true };
            if (!cfg.TG_BOT_TOKEN || !cfg.TG_USER_ID) return { ok: true, skipped: true };

            const url = `${cfg.TG_API_HOST}/bot${cfg.TG_BOT_TOKEN}/sendMessage`;
            const body = {
                chat_id: String(cfg.TG_USER_ID),
                text: `${title}\n\n${content || ''}`,
                disable_web_page_preview: true,
            };

            const resp = await http(
                'POST',
                url,
                { 'Content-Type': 'application/json' },
                JSON.stringify(body),
                cfg.TIMEOUT_MS,
            );
            const ok = resp.ok && resp.json && resp.json.ok === true;
            return { ok, status: resp.status, detail: ok ? '' : resp.text };
        }

        /**
         * 钉钉（仅 token 模式；如填写 secret 则跳过并提示）
         * @private
         */
        async _dingTalk(cfg, title, content) {
            if (!cfg.ENABLE_DINGTALK) return { ok: true, skipped: true };
            if (!cfg.DD_BOT_TOKEN) return { ok: true, skipped: true };
            if (cfg.DD_BOT_SECRET) {
                warnOnce('dd_secret', '[notify] DD_BOT_SECRET 已填写，但运行时无HMAC支持：已跳过钉钉签名模式');
                return { ok: true, skipped: true, detail: 'secret unsupported' };
            }

            const url = `https://oapi.dingtalk.com/robot/send?access_token=${encodeURIComponent(cfg.DD_BOT_TOKEN)}`;
            const body = {
                msgtype: 'text',
                text: { content: `${title}\n\n${content || ''}` },
            };

            const resp = await http(
                'POST',
                url,
                { 'Content-Type': 'application/json' },
                JSON.stringify(body),
                cfg.TIMEOUT_MS,
            );
            const ok = resp.ok && resp.json && resp.json.errcode === 0;
            return { ok, status: resp.status, detail: ok ? '' : resp.text };
        }

        /**
         * 企业微信机器人
         * @private
         */
        async _qywxBot(cfg, title, content) {
            if (!cfg.ENABLE_QYWX_BOT) return { ok: true, skipped: true };
            if (!cfg.QYWX_KEY) return { ok: true, skipped: true };

            const url = `${cfg.QYWX_ORIGIN}/cgi-bin/webhook/send?key=${encodeURIComponent(cfg.QYWX_KEY)}`;
            const body = {
                msgtype: 'text',
                text: { content: `${title}\n\n${content || ''}` },
            };

            const resp = await http(
                'POST',
                url,
                { 'Content-Type': 'application/json' },
                JSON.stringify(body),
                cfg.TIMEOUT_MS,
            );
            const ok = resp.ok && resp.json && resp.json.errcode === 0;
            return { ok, status: resp.status, detail: ok ? '' : resp.text };
        }

        /**
         * 企业微信应用消息（分段发送）
         * @private
         */
        async _qywxAm(cfg, title, content) {
            if (!cfg.ENABLE_QYWX_AM) return { ok: true, skipped: true };
            if (!cfg.QYWX_AM) return { ok: true, skipped: true };

            const maxLen = Math.max(100, cfg.QYWXAM_MAXLEN | 0);
            const full = String(content || '');
            if (full.length > maxLen) {
                // split sequentially; any failure returns failure
                let offset = 0;
                while (offset < full.length) {
                    const part = full.slice(offset, offset + maxLen);
                    const r = await this._qywxAmOnce(cfg, title, part);
                    if (!r.ok) return r;
                    offset += maxLen;
                }
                return { ok: true, status: 200, detail: '' };
            }
            return await this._qywxAmOnce(cfg, title, full);
        }

        /**
         * @private
         */
        async _qywxAmOnce(cfg, title, contentPart) {
            const arr = String(cfg.QYWX_AM).split(',');
            const corpid = (arr[0] || '').trim();
            const corpsecret = (arr[1] || '').trim();
            const touserRaw = (arr[2] || '').trim();
            const agentid = (arr[3] || '').trim();
            const type = (arr[4] || '').trim(); // 0/1/thumb_media_id or empty

            if (!corpid || !corpsecret || !agentid) return { ok: false, status: 0, detail: 'QYWX_AM 缺少必要字段' };

            // get token
            const tokenResp = await http(
                'POST',
                `${cfg.QYWX_ORIGIN}/cgi-bin/gettoken`,
                { 'Content-Type': 'application/json' },
                JSON.stringify({ corpid, corpsecret }),
                cfg.TIMEOUT_MS,
            );
            if (!tokenResp.ok || !tokenResp.json || !tokenResp.json.access_token) {
                return { ok: false, status: tokenResp.status, detail: tokenResp.text || 'gettoken failed' };
            }
            const accessToken = tokenResp.json.access_token;

            const touser = touserRaw || '@all';
            let msgPayload;

            if (type === '0') {
                msgPayload = {
                    msgtype: 'textcard',
                    textcard: {
                        title: String(title),
                        description: String(contentPart),
                        url: 'https://github.com/whyour/qinglong',
                        btntxt: '更多',
                    },
                };
            } else if (type === '1' || !type) {
                msgPayload = {
                    msgtype: 'text',
                    text: { content: `${title}\n\n${contentPart}` },
                };
            } else {
                const html = String(contentPart).replace(/\n/g, '<br/>');
                msgPayload = {
                    msgtype: 'mpnews',
                    mpnews: {
                        articles: [
                            {
                                title: String(title),
                                thumb_media_id: String(type),
                                author: 'notify',
                                content_source_url: '',
                                content: String(html),
                                digest: String(contentPart),
                            },
                        ],
                    },
                };
            }

            const sendResp = await http(
                'POST',
                `${cfg.QYWX_ORIGIN}/cgi-bin/message/send?access_token=${encodeURIComponent(accessToken)}`,
                { 'Content-Type': 'application/json' },
                JSON.stringify({
                    touser,
                    agentid,
                    safe: '0',
                    ...msgPayload,
                }),
                cfg.TIMEOUT_MS,
            );

            const ok = sendResp.ok && sendResp.json && sendResp.json.errcode === 0;
            return { ok, status: sendResp.status, detail: ok ? '' : sendResp.text };
        }

        /**
         * iGot
         * @private
         */
        async _igot(cfg, title, content, params) {
            if (!cfg.ENABLE_IGOT) return { ok: true, skipped: true };
            if (!cfg.IGOT_PUSH_KEY) return { ok: true, skipped: true };

            const key = String(cfg.IGOT_PUSH_KEY).trim();
            const reg = /^[a-zA-Z0-9]{24}$/;
            if (!reg.test(key)) return { ok: false, status: 0, detail: 'IGOT_PUSH_KEY 无效' };

            const url = `https://push.hellyw.com/${key.toLowerCase()}`;
            const qp = params || {};
            let extra = '';
            for (const k of Object.keys(qp)) {
                extra += `&${encodeURIComponent(k)}=${encodeURIComponent(String(qp[k]))}`;
            }

            const body = `title=${encodeURIComponent(title)}&content=${encodeURIComponent(content || '')}${extra}`;
            const resp = await http(
                'POST',
                url,
                { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
                cfg.TIMEOUT_MS,
            );
            const ok = resp.ok && resp.json && resp.json.ret === 0;
            return { ok, status: resp.status, detail: ok ? '' : resp.text };
        }

        /**
         * go-cqhttp
         * @private
         */
        async _gobot(cfg, title, content) {
            if (!cfg.ENABLE_GOBOT) return { ok: true, skipped: true };
            if (!cfg.GOBOT_URL) return { ok: true, skipped: true };

            const token = cfg.GOBOT_TOKEN ? `access_token=${encodeURIComponent(cfg.GOBOT_TOKEN)}&` : '';
            const target = String(cfg.GOBOT_QQ || '');
            const url = `${cfg.GOBOT_URL}?${token}${target}`;
            const body = { message: `${title}\n${content || ''}` };

            const resp = await http(
                'POST',
                url,
                { 'Content-Type': 'application/json' },
                JSON.stringify(body),
                cfg.TIMEOUT_MS,
            );
            const ok = resp.ok && resp.json && resp.json.retcode === 0;
            return { ok, status: resp.status, detail: ok ? '' : resp.text };
        }

        /**
         * Gotify
         * @private
         */
        async _gotify(cfg, title, content) {
            if (!cfg.ENABLE_GOTIFY) return { ok: true, skipped: true };
            if (!cfg.GOTIFY_URL || !cfg.GOTIFY_TOKEN) return { ok: true, skipped: true };

            const url = `${cfg.GOTIFY_URL}/message?token=${encodeURIComponent(cfg.GOTIFY_TOKEN)}`;
            const body =
                `title=${encodeURIComponent(title)}` +
                `&message=${encodeURIComponent(content || '')}` +
                `&priority=${encodeURIComponent(String(cfg.GOTIFY_PRIORITY | 0))}`;

            const resp = await http(
                'POST',
                url,
                { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
                cfg.TIMEOUT_MS,
            );
            const ok = resp.ok && resp.json && resp.json.id != null;
            return { ok, status: resp.status, detail: ok ? '' : resp.text };
        }

        /**
         * Synology Chat
         * @private
         */
        async _synologyChat(cfg, title, content) {
            if (!cfg.ENABLE_SYNOLOGY_CHAT) return { ok: true, skipped: true };
            if (!cfg.CHAT_URL || !cfg.CHAT_TOKEN) return { ok: true, skipped: true };

            const url = `${cfg.CHAT_URL}${cfg.CHAT_TOKEN}`;
            const desp = encodeURIComponent(String(content || ''));
            const body = `payload=${encodeURIComponent(JSON.stringify({ text: `${title}\n${decodeURIComponent(desp)}` }))}`;

            const resp = await http(
                'POST',
                url,
                { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
                cfg.TIMEOUT_MS,
            );
            const ok = resp.ok && resp.json && resp.json.success === true;
            return { ok, status: resp.status, detail: ok ? '' : resp.text };
        }

        /**
         * PushDeer
         * @private
         */
        async _pushDeer(cfg, title, content) {
            if (!cfg.ENABLE_PUSHDEER) return { ok: true, skipped: true };
            if (!cfg.DEER_KEY) return { ok: true, skipped: true };

            const url = cfg.DEER_URL ? String(cfg.DEER_URL) : 'https://api2.pushdeer.com/message/push';
            const desp = encodeURI(String(content || ''));
            const body =
                `pushkey=${encodeURIComponent(cfg.DEER_KEY)}` +
                `&text=${encodeURIComponent(title)}` +
                `&desp=${encodeURIComponent(desp)}` +
                `&type=markdown`;

            const resp = await http(
                'POST',
                url,
                { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
                cfg.TIMEOUT_MS,
            );

            // PushDeer returns various shapes; accept ok if HTTP ok and response has content/result array-ish
            const ok = resp.ok && resp.json && resp.json.content && resp.json.content.result && resp.json.content.result.length >= 0;
            return { ok, status: resp.status, detail: ok ? '' : resp.text };
        }

        /**
         * 智能微秘书
         * @private
         */
        async _aibotk(cfg, title, content) {
            if (!cfg.ENABLE_AIBOTK) return { ok: true, skipped: true };
            if (!cfg.AIBOTK_KEY || !cfg.AIBOTK_TYPE || !cfg.AIBOTK_NAME) return { ok: true, skipped: true };

            let url = '';
            /** @type {any} */
            let body = null;
            if (cfg.AIBOTK_TYPE === 'room') {
                url = 'https://api-bot.aibotk.com/openapi/v1/chat/room';
                body = {
                    apiKey: String(cfg.AIBOTK_KEY),
                    roomName: String(cfg.AIBOTK_NAME),
                    message: { type: 1, content: `【通知】\n\n${title}\n${content || ''}` },
                };
            } else if (cfg.AIBOTK_TYPE === 'contact') {
                url = 'https://api-bot.aibotk.com/openapi/v1/chat/contact';
                body = {
                    apiKey: String(cfg.AIBOTK_KEY),
                    name: String(cfg.AIBOTK_NAME),
                    message: { type: 1, content: `【通知】\n\n${title}\n${content || ''}` },
                };
            } else {
                return { ok: false, status: 0, detail: 'AIBOTK_TYPE 必须为 room/contact' };
            }

            const resp = await http(
                'POST',
                url,
                { 'Content-Type': 'application/json' },
                JSON.stringify(body),
                cfg.TIMEOUT_MS,
            );
            const ok = resp.ok && resp.json && resp.json.code === 0;
            return { ok, status: resp.status, detail: ok ? '' : resp.text };
        }

        /**
         * 飞书机器人（不支持签名 secret）
         * @private
         */
        async _feishu(cfg, title, content) {
            if (!cfg.ENABLE_FEISHU) return { ok: true, skipped: true };
            if (!cfg.FSKEY) return { ok: true, skipped: true };
            if (cfg.FSSECRET) {
                warnOnce('fs_secret', '[notify] FSSECRET 已填写，但运行时无HMAC支持：已跳过飞书签名模式');
                return { ok: true, skipped: true, detail: 'secret unsupported' };
            }

            const body = {
                msg_type: 'text',
                content: { text: `${title}\n\n${content || ''}` },
            };

            const resp = await http(
                'POST',
                `https://open.feishu.cn/open-apis/bot/v2/hook/${encodeURIComponent(cfg.FSKEY)}`,
                { 'Content-Type': 'application/json' },
                JSON.stringify(body),
                cfg.TIMEOUT_MS,
            );
            // Feishu: code=0 indicates success
            const ok = resp.ok && resp.json && (resp.json.StatusCode === 0 || resp.json.code === 0);
            return { ok, status: resp.status, detail: ok ? '' : resp.text };
        }

        /**
         * PushMe
         * @private
         */
        async _pushMe(cfg, title, content, params) {
            if (!cfg.ENABLE_PUSHME) return { ok: true, skipped: true };
            if (!cfg.PUSHME_KEY) return { ok: true, skipped: true };

            const url = cfg.PUSHME_URL ? String(cfg.PUSHME_URL) : 'https://push.i-i.me';
            const body = {
                push_key: String(cfg.PUSHME_KEY),
                title: String(title),
                content: String(content || ''),
                ...(params || {}),
            };

            const resp = await http(
                'POST',
                url,
                { 'Content-Type': 'application/json' },
                JSON.stringify(body),
                cfg.TIMEOUT_MS,
            );
            const ok = resp.ok && resp.text && resp.text.trim() === 'success';
            return { ok, status: resp.status, detail: ok ? '' : resp.text };
        }

        /**
         * Chronocat
         * @private
         */
        async _chronocat(cfg, title, content) {
            if (!cfg.ENABLE_CHRONOCAT) return { ok: true, skipped: true };
            if (!cfg.CHRONOCAT_TOKEN || !cfg.CHRONOCAT_QQ || !cfg.CHRONOCAT_URL) return { ok: true, skipped: true };

            const target = String(cfg.CHRONOCAT_QQ);
            const userIds = (target.match(/user_id=(\d+)/g) || []).map((m) => m.split('=')[1]);
            const groupIds = (target.match(/group_id=(\d+)/g) || []).map((m) => m.split('=')[1]);

            const url = `${cfg.CHRONOCAT_URL}/api/message/send`;
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${cfg.CHRONOCAT_TOKEN}`,
            };

            /** send one */
            const sendOne = async (chatType, peerUin) => {
                const body = {
                    peer: { chatType, peerUin },
                    elements: [
                        {
                            elementType: 1,
                            textElement: { content: `${title}\n\n${content || ''}` },
                        },
                    ],
                };
                return await http('POST', url, headers, JSON.stringify(body), cfg.TIMEOUT_MS);
            };

            const resps = [];
            for (const id of userIds) resps.push(sendOne(1, id));
            for (const id of groupIds) resps.push(sendOne(2, id));

            if (!resps.length) return { ok: true, skipped: true };

            const outs = await Promise.all(resps);
            const ok = outs.every((r) => r.ok);
            return { ok, status: ok ? 200 : 0, detail: ok ? '' : outs.map((r) => r.text).join('\n') };
        }

        /**
         * Webhook（支持 $title $content 占位符）
         * @private
         */
        async _webhook(cfg, title, content) {
            if (!cfg.ENABLE_WEBHOOK) return { ok: true, skipped: true };
            const method = String(cfg.WEBHOOK_METHOD || '').toUpperCase();
            const urlTmpl = String(cfg.WEBHOOK_URL || '');
            const bodyTmpl = String(cfg.WEBHOOK_BODY || '');
            if (!method || !urlTmpl) return { ok: true, skipped: true };

            // minimal gate: must reference $title in URL or Body (matching original semantics)
            const hasTitle = urlTmpl.includes('$title') || bodyTmpl.includes('$title');
            if (!hasTitle) return { ok: true, skipped: true };

            const headers = parseHeaders(String(cfg.WEBHOOK_HEADERS || ''));

            const vf = (v) =>
                replaceAllCompat(
                    replaceAllCompat(v, '$title', replaceAllCompat(String(title), '\n', '\\n')),
                    '$content',
                    replaceAllCompat(String(content || ''), '\n', '\\n'),
                );

            const contentType = String(cfg.WEBHOOK_CONTENT_TYPE || '');
            const parsedBody = parseBody(bodyTmpl, contentType, vf);
            const fb = formatBody(contentType, parsedBody);

            // Note: GET/HEAD with body is not reliably supported; keep behavior: allowGetBody is not available -> ignore body
            const formatUrl = replaceAllCompat(
                replaceAllCompat(urlTmpl, '$title', encodeURIComponent(String(title))),
                '$content',
                encodeURIComponent(String(content || '')),
            );

            const mergedHeaders = { ...headers, ...fb.headers };

            let sendBody = fb.body;
            if (method === 'GET' || method === 'HEAD') {
                if (sendBody != null && sendBody !== '') {
                    console.warn('[notify] Webhook GET/HEAD：已忽略 body（fetch 规范限制）');
                }
                sendBody = undefined;
            }

            const resp = await http(method, formatUrl, mergedHeaders, sendBody, cfg.TIMEOUT_MS);
            const ok = resp.status === 200;
            return { ok, status: resp.status, detail: ok ? '' : resp.text };
        }

        /**
         * Qmsg
         * @private
         */
        async _qmsg(cfg, title, content) {
            if (!cfg.ENABLE_QMSG) return { ok: true, skipped: true };
            if (!cfg.QMSG_KEY || !cfg.QMSG_TYPE) return { ok: true, skipped: true };

            const url = `https://qmsg.zendee.cn/${encodeURIComponent(cfg.QMSG_TYPE)}/${encodeURIComponent(cfg.QMSG_KEY)}`;
            const body = `msg=${encodeURIComponent(`${title}\n\n${String(content || '').replace('----', '-')}`)}`;

            const resp = await http(
                'POST',
                url,
                { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
                cfg.TIMEOUT_MS,
            );
            const ok = resp.ok && resp.json && resp.json.code === 0;
            return { ok, status: resp.status, detail: ok ? '' : resp.text };
        }

        /**
         * Ntfy
         * @private
         */
        async _ntfy(cfg, title, content) {
            if (!cfg.ENABLE_NTFY) return { ok: true, skipped: true };
            if (!cfg.NTFY_TOPIC) return { ok: true, skipped: true };

            const base = cfg.NTFY_URL || 'https://ntfy.sh';
            const url = `${base.replace(/\/+$/g, '')}/${encodeURIComponent(cfg.NTFY_TOPIC)}`;

            /** @type {Record<string,string>} */
            const headers = {
                Title: encodeRFC2047(String(title)),
                Priority: String(cfg.NTFY_PRIORITY), // int -> string
            };
            if (cfg.NTFY_ICON) headers.Icon = String(cfg.NTFY_ICON);

            if (cfg.NTFY_TOKEN) {
                headers.Authorization = `Bearer ${cfg.NTFY_TOKEN}`;
            } else if (cfg.NTFY_USERNAME && cfg.NTFY_PASSWORD) {
                headers.Authorization = `Basic ${b64Utf8(`${cfg.NTFY_USERNAME}:${cfg.NTFY_PASSWORD}`)}`;
            }
            if (cfg.NTFY_ACTIONS) {
                headers.Actions = encodeRFC2047(String(cfg.NTFY_ACTIONS));
            }

            const resp = await http('POST', url, headers, String(content || ''), cfg.TIMEOUT_MS);
            // ntfy success could be 200 with json containing id; tolerate any 2xx as ok
            const ok = resp.status >= 200 && resp.status < 300;
            return { ok, status: resp.status, detail: ok ? '' : resp.text };
        }

        /**
         * WxPusher
         * @private
         */
        async _wxpusher(cfg, title, content) {
            if (!cfg.ENABLE_WXPUSHER) return { ok: true, skipped: true };
            if (!cfg.WXPUSHER_APP_TOKEN) return { ok: true, skipped: true };

            const topicIds = String(cfg.WXPUSHER_TOPIC_IDS || '')
                .split(';')
                .map((x) => x.trim())
                .filter(Boolean)
                .map((x) => parseInt(x, 10))
                .filter((x) => Number.isFinite(x));

            const uids = String(cfg.WXPUSHER_UIDS || '')
                .split(';')
                .map((x) => x.trim())
                .filter(Boolean);

            if (!topicIds.length && !uids.length) {
                return { ok: false, status: 0, detail: 'WXPUSHER_TOPIC_IDS 和 WXPUSHER_UIDS 至少设置一个' };
            }

            const body = {
                appToken: String(cfg.WXPUSHER_APP_TOKEN),
                content: `<h1>${String(title)}</h1><br/><div style='white-space: pre-wrap;'>${String(content || '')}</div>`,
                summary: String(title),
                contentType: 2,
                topicIds: topicIds,
                uids: uids,
                verifyPayType: 0,
            };

            const resp = await http(
                'POST',
                'https://wxpusher.zjiecode.com/api/send/message',
                { 'Content-Type': 'application/json' },
                JSON.stringify(body),
                cfg.TIMEOUT_MS,
            );
            const ok = resp.ok && resp.json && resp.json.code === 1000;
            return { ok, status: resp.status, detail: ok ? '' : resp.text };
        }
    }

    // attach for external calls
    globalThis.SealNotify = new SealNotify(ext);
})();
