// ==UserScript==
// @name         js
// @author       请尊重原作者SzzRain 某人只是略微修改
// @version      1.0.4
// @description  使用.js <code>执行代码 ; 使用.jsvar <set|get|has|delete|clear> <key> [value] 处理插件变量，仅master可用。不传入value会删除传入的key。允许code中通过globalThis._jsvar.<Method>([ <key> [, value] ])调用。
// @timestamp    1752847455
// @license      MIT
// @homepageURL  https://github.com/Szzrain
// ==/UserScript==

if (!seal.ext.find('js')) {
    const ext = seal.ext.new('js', 'SzzRain', '1.0.4');

    // 用于存储插件内部变量的Map
    const pluginVars = new Map();

    const _jsvar = {
        /**
         * 设置一个变量。如果 value 为 undefined 或 null，则删除 key 
         * @param {string} key 变量名
         * @param {*} value 变量值
         * @returns {boolean} 操作是否成功
         */
        set: (key, value) => {
            if (value === undefined || value === null) {
                return pluginVars.rm(key); // 删除成功返回 true，否则 false
            } else {
                pluginVars.set(key, value);
                return true; // 设置成功
            }
        },
        /**
         * 获取一个变量的值。
         * @param {string} key 变量名
         * @returns {*} 变量值，如果不存在则为 undefined
         */
        get: (key) => {
            return pluginVars.get(key);
        },
        /**
         * 检查变量是否存在。
         * @param {string} key 变量名
         * @returns {boolean} 变量是否存在
         */
        has: (key) => {
            return pluginVars.has(key);
        },
        /**
         * 删除一个变量。
         * @param {string} key 变量名
         * @returns {boolean} 删除是否成功
         */
        delete: (key) => {
            return pluginVars.rm(key);
        },
        /**
         * 清空所有变量。
         */
        clear: () => {
            pluginVars.clr();
        }
    };

    // 将 _jsvar 挂载到 globalThis，供 eval 执行的代码访问
    if (typeof globalThis._jsvar === 'undefined') {
        globalThis._jsvar = _jsvar;
    }

    const jsCommand = seal.ext.newCmdItemInfo();
    jsCommand.name = 'js';
    jsCommand.help = '使用.js <code> 来执行js代码，仅master可用';
    jsCommand.allowDelegate = true;
    jsCommand.solve = async (ctx, msg, cmdArgs) => {
        const firstArg = cmdArgs.getArgN(1);

        if (firstArg === 'help') {
            const ret = seal.ext.newCmdExecuteResult(true);
            ret.showHelp = true;
            return ret;
        }

        if (ctx.privilegeLevel === 100) {
            const codeToExecute = cmdArgs.eatPrefixWith("")[0];
            try {
                const result = eval(codeToExecute);
                seal.replyToSender(ctx, msg, result);
            } catch (error) {
                seal.replyToSender(ctx, msg, `执行错误: ${error.name}: ${error.message}`);
            }
        } else {
            seal.replyToSender(ctx, msg, seal.format(ctx, "{核心:提示_无权限}"));
        }
        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['js'] = jsCommand;

    const jsVarCommand = seal.ext.newCmdItemInfo();
    jsVarCommand.name = 'jsvar';
    jsVarCommand.help = '使用.jsvar <set|get|has|delete|clear> <key> [value] 来设置或获取插件变量，仅master可用。设置时无value会删除key';
    jsVarCommand.allowDelegate = true;
    jsVarCommand.solve = async (ctx, msg, cmdArgs) => {
        const subCommand = cmdArgs.getArgN(1);
        const key = cmdArgs.getArgN(2);
        const value = cmdArgs.getArgN(3);

        if (ctx.privilegeLevel !== 100) {
            seal.replyToSender(ctx, msg, seal.format(ctx, "{核心:提示_无权限}"));
            return seal.ext.newCmdExecuteResult(true);
        }

        if (!subCommand) {
            seal.replyToSender(ctx, msg, '格式错误。请使用 .jsvar <set|get|has|rm|clr> <key> [value]');
            return seal.ext.newCmdExecuteResult(true);
        }

        switch (subCommand.toLowerCase()) {
            case 'set':
                if (key === undefined) {
                    seal.replyToSender(ctx, msg, 'set 命令需要提供 key');
                    break;
                }
                if (value === undefined) {
                    pluginVars.rm(key);
                    seal.replyToSender(ctx, msg, `变量 ${key} 已删除`);
                } else {
                    pluginVars.set(key, value);
                    seal.replyToSender(ctx, msg, `变量 ${key} 已设置为: ${value}`);
                }
                break;
            case 'get':
                if (key === undefined) {
                    seal.replyToSender(ctx, msg, 'get 命令需要提供 key');
                    break;
                }
                if (pluginVars.has(key)) {
                    seal.replyToSender(ctx, msg, `变量 ${key} 的值为: ${pluginVars.get(key)}`);
                } else {
                    seal.replyToSender(ctx, msg, `变量 ${key} 不存在`);
                }
                break;
            case 'has':
                if (key === undefined) {
                    seal.replyToSender(ctx, msg, 'has 命令需要提供 key');
                    break;
                }
                seal.replyToSender(ctx, msg, `变量 ${key} ${pluginVars.has(key) ? '存在' : '不存在'}。`);
                break;
            case 'rm':
                if (key === undefined) {
                    seal.replyToSender(ctx, msg, 'rm 命令需要提供 key');
                    break;
                }
                if (pluginVars.rm(key)) {
                    seal.replyToSender(ctx, msg, `变量 ${key} 已删除。`);
                } else {
                    seal.replyToSender(ctx, msg, `变量 ${key} 不存在，无需删除。`);
                }
                break;
            case 'clr':
                pluginVars.clr();
                seal.replyToSender(ctx, msg, '所有变量已清空。');
                break;
            default:
                seal.replyToSender(ctx, msg, '未知子命令。请使用 set, get, has, rm 或 clr');
                break;
        }
        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['jsvar'] = jsVarCommand;

    seal.ext.register(ext);

    // 非指令消息处理
    ext.onNotCommandReceived = (ctx, msg) => {
        const message = msg.message;

        // 处理 $bdjs <code>
        let bdjsMatch = message.match(/^\$bdjs\s*(.+)$/);
        if (bdjsMatch) {
            const jsCode = bdjsMatch[1];
            try {
                const result = eval(jsCode);
                seal.replyToSender(ctx, msg, result);
            } catch (error) {
                seal.replyToSender(ctx, msg, `执行错误: ${error.message}`);
            }
            return;
        }

        // 处理 $bdjsvar <set|get|has|delete|clear> <key> [value]
        let bdjsVarMatch = message.match(/^\$bdjsvar\s+(set|get|has|delete|clear)\s+(\S+)(?:\s+(.*))?$/i);
        if (bdjsVarMatch) {
            const subCommand = bdjsVarMatch[1];
            const key = bdjsVarMatch[2];
            const value = bdjsVarMatch[3]; // value可能是undefined

            switch (subCommand.toLowerCase()) {
                case 'set':
                    if (key === undefined) {
                        seal.replyToSender(ctx, msg, 'set 命令需要提供 key (Method B)');
                        break;
                    }
                    if (value === undefined) {
                        pluginVars.rm(key);
                        seal.replyToSender(ctx, msg, `变量 ${key} 已删除 (Method B)`);
                    } else {
                        pluginVars.set(key, value);
                        seal.replyToSender(ctx, msg, `变量 ${key} 已设置为: ${value} (Method B)`);
                    }
                    break;
                case 'get':
                    if (key === undefined) {
                        seal.replyToSender(ctx, msg, 'get 命令需要提供 key (Method B)');
                        break;
                    }
                    if (pluginVars.has(key)) {
                        seal.replyToSender(ctx, msg, `变量 ${key} 的值为: ${pluginVars.get(key)} (Method B)`);
                    } else {
                        seal.replyToSender(ctx, msg, `变量 ${key} 不存在。(Method B)`);
                    }
                    break;
                case 'has':
                    if (key === undefined) {
                        seal.replyToSender(ctx, msg, 'has 命令需要提供 key (Method B)');
                        break;
                    }
                    seal.replyToSender(ctx, msg, `变量 ${key} ${pluginVars.has(key) ? '存在' : '不存在'}。(Method B)`);
                    break;
                case 'rm':
                    if (key === undefined) {
                        seal.replyToSender(ctx, msg, 'rm 命令需要提供 key (Method B)');
                        break;
                    }
                    if (pluginVars.rm(key)) {
                        seal.replyToSender(ctx, msg, `变量 ${key} 已删除。(Method B)`);
                    } else {
                        seal.replyToSender(ctx, msg, `变量 ${key} 不存在，无需删除。(Method B)`);
                    }
                    break;
                case 'clr':
                    pluginVars.clr();
                    seal.replyToSender(ctx, msg, '所有变量已清空。(Method B)');
                    break;
                default:
                    seal.replyToSender(ctx, msg, '未知子命令。请使用 set, get, has, rm 或 clr (Method B)');
                    break;
            }
            return; // 处理完后退出
        }
    };
}