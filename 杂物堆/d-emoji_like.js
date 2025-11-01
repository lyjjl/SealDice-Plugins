// ==UserScript==
// @name         d-emoji
// @author       某人
// @version      1.0.0
// @description  检测 emoji_like
// @timestamp    0
// @license      MIT
// @homepageURL  https://github.com/lyjjl
// ==/UserScript==

let ext = seal.ext.find('d-emoji_like.js');
if (!ext) {
    ext = seal.ext.new('d-emoji_like.js', '某人', '1.0.0');
    seal.ext.register(ext);

    seal.ext.registerStringConfig(ext, "wsUrl", "ws://127.0.0.1:13002");
    seal.ext.registerStringConfig(ext, "wsToken", "");

    let ws;
    let targetGroup;
    let cmdPrefix = [
        "pp"
    ];

    ws = new WebSocket(seal.ext.getStringConfig(ext, "wsUrl") + "/?token=" + seal.ext.getStringConfig(ext, "wsToken"));

    ws.onopen = () => {
        console.log("[DEL@Connect:Info] Connected!");
    }

    ws.onmessage = (event) => {
        let data = JSON.parse(event.data);

        if (data.echo) {
            switch (data.echo) {
                case `DEL-${targetGroup}-set`:
                    const replyMsg = {
                        action: 'set_msg_emoji_like',
                        params: {
                            message_id: data.data.message_id,
                            emoji_id: 424,
                            set: true
                        },
                        echo: `DEL-${targetGroup}-like` 
                    }
                    ws.send(JSON.stringify(replyMsg));
                    return;
            }
        } else {
            if (data.post_type === "notice" && data.notice_type === "group_msg_emoji_like" && data.group_id === targetGroup) {
                let replyMsg = {
                    action: 'send_group_msg',
                    params: {
                        group_id: data.group_id,
                        message: [
                            {
                                type: 'text',
                                data: {
                                    text: `[${Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', hour12: false})}] 用户 ${data.user_id} 对消息 ${data.message_id} 设置了 ${data.likes[0].count} 个 ID为 ${data.likes[0].emoji_id} 的表情回应`
                                }
                            }
                        ]
                    }
                }
                ws.send(JSON.stringify(replyMsg));
            }
            if (data.post_type === "message" && data.message_type === "group" && data.message[0].type === "text") {
                let prefix = cmdPrefix.find(p => data.raw_message.startsWith(p));
                let cmd;
                if (prefix) {
                    cmd = data.raw_message.slice(prefix.length);
                }

                switch (cmd) {
                    case "写【目标群组，本群】":
                        targetGroup = data.group_id;
                        const replyMsg = {
                            action: 'send_group_msg',
                            params: {
                                group_id: data.group_id,
                                message: [
                                    {
                                        type: "text",
                                        data: {
                                            text: `✅ 已设置目标群组为当前群组 (ID: ${targetGroup})`
                                        }
                                    }
                                ]
                            },
                            echo: `DEL-${targetGroup}-set`
                        };
                        ws.send(JSON.stringify(replyMsg));
                        return;
                    default:
                        console.log("[DEL@Cmd:Info] 忽略消息:", data.raw_message, "| Cmd:", cmd);
                        return;
                }
            }
        }
    }

    /*
    const cmdE = seal.ext.newCmdItemInfo();
    cmdE.name = '';
    cmdE.help = '';

    cmdE.solve = (ctx, msg, cmdArgs) => {
        // TODO: 指令的具体逻辑

    };

    // 将命令注册到扩展中
    ext.cmdMap[''] = cmdE;
    */
}