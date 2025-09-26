// ==UserScript==
// @name         WebSocket依赖
// @author       错误
// @version      1.2.0
// @description  为插件提供WebSocket依赖管理。\nWebSocket地址请按照自己的登录方案自行配置，配置完成后在插件设置填入。\n提供指令 .ws 可以直接调用\n在其他插件中使用方法: globalThis.ws.callApi(epId, method, data=null)\nepId为骰子账号QQ:12345，method为方法，如get_login_info，data为参数。\n方法可参见https://github.com/botuniverse/onebot-11/blob/master/api/public.md#%E5%85%AC%E5%BC%80-api
// @timestamp    1755278205
// 2025-08-16 01:16:58
// @license      MIT
// @homepageURL  https://github.com/error2913/sealdice-js/
// @updateUrl    https://raw.gitmirror.com/error2913/sealdice-js/main/WebSocket%E4%BE%9D%E8%B5%96.js
// @updateUrl    https://raw.githubusercontent.com/error2913/sealdice-js/main/WebSocket%E4%BE%9D%E8%B5%96.js
// ==/UserScript==

let ext = seal.ext.find('WebSocket依赖');
if (!ext) {
    ext = seal.ext.new('WebSocket依赖', '错误', '1.2.0');
    seal.ext.register(ext);
}

seal.ext.registerTemplateConfig(ext, 'WS地址', ['ws://127.0.0.1:8084'], '修改后保存并重载js');
seal.ext.registerTemplateConfig(ext, 'WS Access Token', [''], '在这里填入你的Access Token，与上面的WS地址一一对应，如果没有则留空');
seal.ext.registerOptionConfig(ext, "日志打印方式", "简短", ["永不", "简短", "详细"], '修改后保存并重载js');

let wsMap = {};
let initDone = false;
const logLevel = seal.ext.getOptionConfig(ext, "日志打印方式");

class Logger {
    constructor(name) {
        this.name = name;
    }

    handleLog(...data) {
        if (logLevel === "永不") {
            return '';
        } else if (logLevel === "简短") {
            const s = data.map(item => `${item}`).join(" ");
            if (s.length > 1000) {
                return s.substring(0, 500) + "\n...\n" + s.substring(s.length - 500);
            } else {
                return s;
            }
        } else if (logLevel === "详细") {
            return data.map(item => `${item}`).join(" ");
        } else {
            return '';
        }
    }

    info(...data) {
        const s = this.handleLog(...data);
        if (!s) {
            return;
        }
        console.log(`【${this.name}】: ${s}`);
    }

    warning(...data) {
        const s = this.handleLog(...data);
        if (!s) {
            return;
        }
        console.warn(`【${this.name}】: ${s}`);
    }

    error(...data) {
        const s = this.handleLog(...data);
        if (!s) {
            return;
        }
        console.error(`【${this.name}】: ${s}`);
    }
}

const logger = new Logger('ws');

const pendingRequests = {};

async function init() {
    wsMap = {};

    const urls = seal.ext.getTemplateConfig(ext, 'WS地址');
    const tokens = seal.ext.getTemplateConfig(ext, 'WS Access Token');

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const token = tokens[i] || '';

        try {
            const ws = new WebSocket(url);
            ws.onopen = () => {
                logger.info(`WebSocket连接成功: ${url}`);
                if (token) {
                    ws.send(JSON.stringify({
                        "action": "set_up_token",
                        "params": {
                            "token": token
                        }
                    }));
                }
                ws.send(JSON.stringify({
                    "action": "get_login_info",
                    "echo": `get_login_info_${url}`
                }));
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.echo && pendingRequests[data.echo]) {
                    pendingRequests[data.echo].resolve(data.data);
                    delete pendingRequests[data.echo];
                }
                // 这里可以根据需要添加其他消息处理逻辑
            };

            ws.onclose = () => {
                logger.warning(`WebSocket连接已关闭: ${url}`);
                const eps = Object.keys(wsMap);
                for (const epId of eps) {
                    if (wsMap[epId].ws === ws) {
                        delete wsMap[epId];
                        logger.info(`已移除连接断开的骰子 ${epId}`);
                        break;
                    }
                }
            };

            ws.onerror = (error) => {
                logger.error(`WebSocket连接错误: ${url}`, error);
            };

            const data = await new Promise((resolve, reject) => {
                const echoId = `get_login_info_${url}`;
                pendingRequests[echoId] = { resolve, reject };
                setTimeout(() => {
                    if (pendingRequests[echoId]) {
                        reject(new Error("获取登录信息超时"));
                        delete pendingRequests[echoId];
                    }
                }, 5000);
            });
            
            if (data === null) {
                logger.error(`获取登录信息失败: ${url}`);
                continue;
            }

            const epId = `QQ:${data.user_id}`;
            const eps = seal.getEndPoints();
            for (let j = 0; j < eps.length; j++) {
                if (eps[j].userId === epId) {
                    wsMap[epId] = { ws, token };
                    logger.info(`找到 ${epId} 端口: ${url}`);
                    break;
                }
            }
        } catch (error) {
            logger.error(`连接WS地址时出错: ${url}`, error);
        }
    }

    logger.info('初始化完成，wsMap: ', JSON.stringify(Object.keys(wsMap), null, 2));
    initDone = true;
}

class Ws {
    constructor(wsMap) {
        this.wsMap = wsMap;
    }

    /**
     * 调用WebSocket接口
     * @param {string} epId 骰子的QQ号
     * @param {string} method 调用的方法名
     * @param {object} data 调用的方法的参数，默认为null
     * @returns 
     */
    async callApi(epId, method, data = null) {
        if (!initDone) {
            await init();
        }

        if (!wsMap.hasOwnProperty(epId)) {
            logger.error(`未找到端口: ${epId}，请检查配置`);
            return null;
        }

        const { ws } = wsMap[epId];
        const echoId = `${epId}_${method}_${Date.now()}`;
        
        const message = {
            "action": method,
            "params": data,
            "echo": echoId
        };

        logger.info('请求方法: ', method, '\n请求参数: ', JSON.stringify(data));
        
        return new Promise((resolve, reject) => {
            pendingRequests[echoId] = { resolve, reject };
            try {
                ws.send(JSON.stringify(message));
            } catch (e) {
                reject(e);
            }

            setTimeout(() => {
                if (pendingRequests[echoId]) {
                    reject(new Error("请求超时"));
                    delete pendingRequests[echoId];
                }
            }, 10000);
        });
    }

}

globalThis.ws = new Ws(wsMap);

const cmd = seal.ext.newCmdItemInfo();
cmd.name = 'ws';
cmd.help = `帮助:
.ws init 初始化WebSocket依赖
.ws <方法>
--<参数名>=<参数>

示例:
.ws get_login_info
.ws get_version_info
.ws send_group_msg
--group_id=123456
--message=[{"type":"text","data":{"text":"嘿嘿"}}]`;
cmd.solve = (ctx, msg, cmdArgs) => {
    if (ctx.privilegeLevel < 100) {
        seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
        return seal.ext.newCmdExecuteResult(true);
    }

    const epId = ctx.endPoint.userId;
    const ret = seal.ext.newCmdExecuteResult(true);
    const method = cmdArgs.getArgN(1);
    switch (method) {
        case 'init': {
            init().then(() => seal.replyToSender(ctx, msg, '初始化完成'));
            return ret;
        }
        case '':
        case 'help': {
            ret.showHelp = true;
            return ret;
        }
        default: {
            const data = cmdArgs.kwargs.reduce((acc, kwarg) => {
                const { name, value } = kwarg;
                try {
                    acc[name] = JSON.parse(`[${value}]`)[0];
                } catch (e) {
                    acc[name] = value;
                }
                return acc;
            }, {});

            globalThis.ws.callApi(epId, method, data).then(result => {
                seal.replyToSender(ctx, msg, JSON.stringify(result, null, 2));
            }).catch(e => {
                seal.replyToSender(ctx, msg, `请求失败: ${e.message}`);
            });

            return ret;
        }
    }
};
ext.cmdMap['ws'] = cmd;