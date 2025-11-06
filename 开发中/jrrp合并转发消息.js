// ==UserScript==
// @name        jrrp合并转发消息(jrrp-FM)
// @author       某人
// @version      1.0.0
// @description  字面意思
// @timestamp   0
// @license      MIT
// @homepageURL   https://github.com/lyjjl
// ==/UserScript==

function buildForwardMsgMessages(ctx, senderUid = "", senderNickname = "", msgArray = []) {
    return msgArray
        .map((sMsg) => {
            return {
                "type": "node",
                "data": {
                    "user_id": senderUid.replace(/\D+/g, ""),
                    "nickname": seal.format(ctx, senderNickname),
                    "content": {
                        "type": "text",
                        "data": {
                            "text": seal.format(ctx, sMsg)
                        }
                    }
                }
            }
        });
}

function buildForwardMsgNews(ctx, newsArray = []) {
    return newsArray
        .slice(0, 4)
        .map((sNews) => {
        return {
            "text": sNews
        }
    });
}

function buildForwardMsg (ctx, messages = [], news = [], prompt = "", summary = "", source = ""){
    return {
        "messages": messages,
        "news": news,
        "prompt": prompt,
        "summary": summary,
        "source": source
    }
}

function normalizeUrl(str) {
    const url = (str || '').replace(/\s+/g, '');
    if (!url) {
        console.error("[normalizeUrl] 空地址！请检查配置并重载插件！");
        return null;
    }

    if (!/^https?:\/\/\S+$/i.test(url)) {
        console.error("[normalizeUrl] 地址异常！请检查配置并重载插件！");
        return null;
    }

    let result = url.replace(/([^:])\/\/+/g, '$1/');
    const pathOnly = result.split(/[?#]/)[0];

    if (/^https?:\/\/[^\/]+$/.test(pathOnly)) {
        result += '/';
    }

    return result;
}

async function apiRequest(baseUrl = "", apiPath = "", body = {}, token = "") {
    let nUrl = normalizeUrl(baseUrl + apiPath);
    if (!nUrl) return null;

    let headers = {
        "Content-type": "application/json; charset=UTF-8"
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        let response = await fetch(nUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            let response_data = await response.text();
            console.error(`HTTP 请求失败，状态码：${response.status}`, response_data);
            return null;
        } else {
            return await response.json();
        }
    } catch (error) {
        console.error('HTTP 请求失败', error, " API: ", apiPath);
        return null;
    }
}

let ext = seal.ext.find('jrrp-forwardMsg');

if (!ext) {
    // 检查版本兼容性
    if (seal.getVersion().versionDetail.prerelease !== "dev" || seal.getVersion().versionCode >= 1005001) {
        console.error("不支持的版本:", seal.getVersion().version, "| 插件拒绝加载");
    } else {
        ext = seal.ext.new('jrrp-forwardMsg', '某人', '1.0.0');
        seal.ext.register(ext);

        // --- 插件配置 ---
        seal.ext.registerStringConfig(ext, "httpServerUrl", "http://127.0.0.1:3001", "HTTP Server 地址");
        seal.ext.registerStringConfig(ext, "httpToken", "", "HTTP Token");
        seal.ext.registerStringConfig(ext, "jrrp_help", ".jrrp 抽取你的今日人品，一天之内不会变化。\n人品从 1 到 100 越高越好哦~", "jrrp.help 内容，修改后保存重载插件");
        seal.ext.registerTemplateConfig(ext, "FM_news", ["咕", "咕", "嘎", "嘎"], "群内聊天记录预览，最多4条（空置news，多个随机一）");
        seal.ext.registerTemplateConfig(ext, "FM_prompt", ["{核心:骰子名字}为{$t玩家}占卜了今天的人品值！"], "群外合并消息预览（空置prompt，多个随机一）");
        seal.ext.registerTemplateConfig(ext, "FM_summary", [""], "空置时为点击查看xxx条转发消息（空置summary，多个随机一）");
        seal.ext.registerTemplateConfig(ext, "FM_source", ["{核心:骰子名字}与{$t玩家_RAW}的心语"], "合并消息来源（空置source，多个随机一）");
        seal.ext.registerTemplateConfig(ext, "FM_Sender_Uin", [""], "聊天记录中消息发送人QQ号（决定头像什么的，空置取骰自身的，多个随机一）");
        seal.ext.registerTemplateConfig(ext, "FM_Sender_Nickname", ["{核心:骰子名字}"], "聊天记录中消息发送人名字（空置取骰QQ昵称，多个随机一）");
        seal.ext.registerTemplateConfig(ext, "jrrp_data", ["{娱乐:今日人品}", "祝你顺利！"]);
        // --- 配置结束 ---

        const extFun = seal.ext.find('fun');
        const cmdJrrp = extFun.cmdMap['jrrp'];

        cmdJrrp.name = "jrrp";
        cmdJrrp.help = seal.ext.getStringConfig(ext, "jrrp_help");

        cmdJrrp.solve = async (ctx, msg, cmdArgs) => {
            if (cmdArgs.getArgN(1) === "help") {
                seal.replyToSender(
                    ctx,
                    msg,
                    seal.format(
                        ctx,
                        seal.ext.getStringConfig(
                            ext,
                            "jrrp_help"
                        )
                    )
                )

                return seal.ext.newCmdExecuteResult(true);
            }

            let reqData = buildForwardMsg(
                ctx,
                buildForwardMsgMessages(
                    ctx,
                    // FM_Sender_Uin (IIFE 1)
                    (() => {
                        let FM_SenderUinTmp = seal.ext.getTemplateConfig(ext, "FM_Sender_Uin");
                        let formattedResult = seal.format(ctx, FM_SenderUinTmp[Math.floor(Math.random() * FM_SenderUinTmp.length)]);
                        return (formattedResult && formattedResult.trim()) ? formattedResult : ctx.endPoint.userId;
                    })(),
                    // FM_Sender_Nickname (IIFE 2)
                    (() => {
                        let FM_SenderNicknameTmp = seal.ext.getTemplateConfig(ext, "FM_Sender_Nickname");
                        let formattedResult = seal.format(ctx, FM_SenderNicknameTmp[Math.floor(Math.random() * FM_SenderNicknameTmp.length)]);
                        return (formattedResult && formattedResult.trim()) ? formattedResult : ctx.endPoint.nickname;
                    })(),
                    seal.ext.getTemplateConfig(ext, "jrrp_data")
                ),
                buildForwardMsgNews(
                    ctx,
                    seal.ext.getTemplateConfig(ext, "FM_news") || ["news"]
                ),
                // FM_Prompt (IIFE 3)
                (() => {
                    let promptTmp = seal.ext.getTemplateConfig(ext, "FM_Prompt");
                    let formattedResult = seal.format(ctx, promptTmp[Math.floor(Math.random() * promptTmp.length)]);
                    return (formattedResult && formattedResult.trim()) ? formattedResult : "prompt";
                })(),
                // FM_summary (IIFE 4)
                (() => {
                    let summaryTmp = seal.ext.getTemplateConfig(ext, "FM_summary");
                    let formattedResult = seal.format(ctx, summaryTmp[Math.floor(Math.random() * summaryTmp.length)]);
                    const defaultSummary = `查看${seal.ext.getTemplateConfig(ext, "jrrp_data").length}条转发消息`;
                    return (formattedResult && formattedResult.trim()) ? formattedResult : defaultSummary;
                })(),
                // FM_source (IIFE 5)
                (() => {
                    let sourceTmp = seal.ext.getTemplateConfig(ext, "FM_source");
                    let formattedResult = seal.format(ctx, sourceTmp[Math.floor(Math.random() * sourceTmp.length)]);
                    return (formattedResult && formattedResult.trim()) ? formattedResult : "source";
                })()
            )

            if (ctx.isPrivate) {
                reqData.user_id = ctx.player.userId.replace(/\D+/g, "");
            } else {
                reqData.group_id = ctx.group.groupId.replace(/\D+/g, "");
            }

            await apiRequest(
                seal.ext.getStringConfig(ext, "httpServerUrl"),
                "send_forward_msg",
                reqData,
                seal.ext.getStringConfig(ext, "httpToken")
            );
            return seal.ext.newCmdExecuteResult(true);
        };
    }
}
