// ==UserScript==
// @name        关键词检测黑灰产群 (NCOnly)
// @author       是非分明 x 某人
// @version      1.0.0
// @description  调用 NC api 实现检测、消息预览、远程退群
// @timestamp    0
// @license      MIT
// @homepageURL   http://example.com/
// ==/UserScript==

let ext = seal.ext.find('CheckBlackGroup');
// 直译：检查黑群（来自某的吐槽（？）
let url = "http://127.0.0.1:10071/"; // NapCat API 服务器地址，测试用
// 后面可以改成每次运行时获取配置到全局变量 (修改配置后需要重载生效) 或者 每次需要的时候获取 (无需重载)

if (!ext) {
    const ext = seal.ext.new('CheckBlackGroup', '是非分明 x 某人', '1.0.0');
    seal.ext.register(ext);





    // 注册扩展并且整一个关键词匹配测试
    /**
     * 注意：
     * 命名中 C_ 开头的代表配置项有关
     * A 开头的代表 API 调用相关
     * _N 结尾的代表是适配的 NapCat
     */
    seal.ext.registerStringConfig(ext, "C_wordlist", "在这里写你要筛选的关键词，英文逗号分割");
    // C_前缀代表和配置相关的变量，这个是屏蔽词列表
    seal.ext.registerStringConfig(ext, "C_url", "在这里写你的 HTTP 服务器地址，带上/");
    seal.ext.registerTemplateConfig(ext, "C_QQ", ["这里是用于接受的 QQ 号", "", "", ""]);
    seal.ext.registerTemplateConfig(ext, "C_QQ_Group", ["这里是用于接受的 QQ 群号", "", "", ""]);
    seal.ext.registerStringConfig(ext, "dailyExpression", "07:00", "定时任务 [检查群组列表] 的 daily 表达式", "到时间检查群组列表中有无奇怪东西。格式为 hh:mm 或者 h:mm");
    // 某：corn 表达式更加可自定义。但是可能会增加学习成本，考虑加一个 bool 配置允许切换
    // 某：我又考虑了下还是 corn 好，daily 太受限了



    // 注册配置项

    // 把配置项写到全局变量里面
    let dailyExpression = seal.ext.getStringConfig(ext, "dailyExpression");

    /**
     * 检查输入内容是否包含屏蔽词
     * @param {string} Input - 用户输入的内容。
     * @param {string} WordsList - 屏蔽词列表，英文逗号分隔。
     * @returns {boolean} 如果输入内容包含任何屏蔽词，则返回 true；否则返回 false。
     */
    function checkWord(Input, WordsList) {
        // 检查是否包含屏蔽词函数（Input：用户输入内容，WordList：屏蔽词列表，英文逗号分隔）
        // 将逗号分隔的屏蔽词字符串转换为数组
        // 这里考虑以后用其他的配置类型代替，逗号分隔什么的有点呆
        const forbiddenWords = WordsList.split(',').map(word => word.trim());
        // 检查字符串是否包含屏蔽词
        return forbiddenWords.some(word => {
            // 如果屏蔽词不为空，则检查是否包含
            if (word.length > 0) {
                return Input.includes(word);
                // 返回包含状态
            }
            console.info("屏蔽词列表里面啥也没有！");
            return false;
        });
    }


    /**
     * 检查群组名称是否包含屏蔽词并发送消息
     * 调用 NC API 获取群组列表，检查群名是否包含屏蔽词，如果包含则发送消息
     * @param {Object} ctx  这俩玩意不解释了罢
     * @param {Object} msg
     */
    async function checkGroupName(ctx, msg) {
        try {
            // 调用 NC API 获取群组列表
            const response = await A_request_N(url, '/get_group_list');
            const blackword = seal.ext.getStringConfig(ext, "C_wordlist");


            if (!response || response.status !== 'ok' || !response.data) {
                console.error('获取群组列表失败：', response);
                return;
            }
            console.log("已经获取到群组列表")

            // 遍历群组列表进行检查
            for (const group of response.data) {
                const groupName = group.group_name;

                // 使用 checkWord 函数检查群名是否包含屏蔽词
                if (checkWord(groupName, blackword)) {
                    // 构造消息
                    const message = `检测到异常群组：
群名称：${groupName}
群 ID: ${group.group_id}
成员数：${group.member_count}/${group.max_member_count}
群备注：${group.group_remark || '无'}
全体禁言状态：${group.group_all_shut === -1 ? '是' : '否'}`;

                    // 发送消息，暂用，等会改成是非的 send() 函数
                    console.log("构造消息：", message);
                    send(message);
                }
            }

        } catch (error) {
            console.error('检查群组名称时发生错误：', error);
            seal.replyToSender(ctx, msg, '检查群组名称时发生错误，请稍后重试。');
        }
    }
    // 某：上面这个需要一个缩进））
    // 还没写完！
    // 计划写两种检查方式：遍历/增量 会优先写增量，遍历的性能问题不好说
    // 可能弃用（？
    // 某：增量似乎存在实现上的困难，比如部分拉群没有群系统消息提示


    /**
     * 标准化 URL 中的斜杠，将多个斜杠替换为单个斜杠，并移除换行符。
     * 同时验证 URL 格式是否正确，只允许 http 和 https 协议。
     * @param {string} str - 需要标准化的 URL 字符串。
     * @returns {string|null} 标准化后的 URL 字符串，如果格式不正确则返回 null。
     */
    function T_normalizeURL(str) {
        // 移除换行符和首尾空格
        str = str.replace(/\n/g, '').trim();

        // 检查是否为空字符串
        if (!str) {
            console.error("[url 标准化]：空地址！请检查配置并重载插件！");
            return null;
        }

        // 验证 URL 格式，只允许 http 和 https，免得有人才写个 ws://xxx 上去
        // 某：青果群有人不写 http:// 越发的觉得有必要
        const urlRegex = /^https?:\/\/[\-A-Za-z0-9+&@#\/%?=~_|!:,.;]*[\-A-Za-z0-9+&@#\/%=~_|]$/i;

        if (!urlRegex.test(str)) {
            console.error("[url 标准化]：地址异常！请检查配置并重载插件！");
            return null;
        }

        // 标准化斜杠：将多个斜杠替换为单个斜杠（但保留协议部分的://）
        str = str.replace(/([^:])(\/\/+)/g, '$1/');

        // 确保 URL 以斜杠结尾
        if (str.match(/^https?:\/\/[^\/]+$/)) {
            str += '/';
            console.info("[url 标准化]：已经自动在尾部添加'/'");
        }

        return str;
    }

    /**
     * 向 NapCat API 发起 POST 请求。
     * @param {string} baseurl - HTTP 服务器的 URL，应以斜杠结尾（虽然会自动标准化，但是这是好习惯）
     * @param {string} apipath - API 的路径。
     * @param {object} body - 请求体，将被 JSON.stringify 转换。
     * @returns {Promise<object|null>} 请求成功则返回解析后的 JSON 响应数据，失败则返回 null。
     */
    async function A_request_N(baseurl, apipath, body) { //这里的 A 代表使用 API 完成，后缀 N 代表适用于 NapCat
        let Nurl = T_normalizeURL(baseurl + apipath); // 理论上 baseurl 应该以/结尾，不过没关系，会标准化的

        try {
            let response = await fetch(Nurl, {
                method: 'POST',
                headers: {
                    "Content-type": "application/json; charset=UTF-8"
                },
                body: JSON.stringify(body),
                cache: "no-cache",
                credentials: "same-origin",
                redirect: "follow",
                referrerPolicy: "no-referrer"
            });


            let response_data;

            // 先检查响应状态，再决定如何解析响应体
            if (!response.ok) {
                // 如果 HTTP 请求失败 (状态码不是 2xx)，则尝试读取文本内容作为错误信息
                response_data = await response.text();
                console.error(`HTTP 请求失败，状态码：${response.status}`, response_data);
                return null;
            }

            // 如果 HTTP 请求成功 (状态码是 2xx)，则尝试解析 JSON
            response_data = await response.json();

            console.info("HTTP 请求成功：", apipath);
            // console.info(JSON.stringify(response_data)); // 为了控制台输出更清晰，再次序列化  这里在正式使用时要注释  log 出来一堆不太好（）
            return response_data;

        } catch (error) {
            // 捕获所有其他可能的错误，例如网络问题或 JSON 解析异常
            console.error('HTTP 请求失败', error, " API: ", apipath);
            return null;
        }
    }






    // 这个东西用不用的上待议
    // 似乎可以用于实现白名单
    class numberListManager {
        /**
         * 初始化一个 Map 来存储不同的数字 Set。
         * Map 的 key 是 Set 的名称，value 是对应的 Set 对象。
         */
        constructor() {
            this.allNumberSets = new Map();
        }

        /**
         * 内部辅助函数：将乱七八糟的输入值转换为纯数字。
         * 自动处理数字、数字字符串，并从混合字符串中提取数字。
         * @param {*} rawValue - 原始的输入值，可以是数字、字符串或混合字符串。
         * @returns {number|null} 转换后的数字，如果无法提取有效数字则返回 null。
         */
        _normalizeNumber(rawValue) {
            // 如果值已经是数字类型，直接返回。
            if (typeof rawValue === 'number') {
                return rawValue;
            }

            // 如果值是字符串类型。
            if (typeof rawValue === 'string') {
                // 使用正则表达式匹配字符串中的所有数字。
                const digitsOnly = rawValue.match(/\d+/g);

                // 如果匹配到了数字序列，则将其拼接并转换为整数。
                if (digitsOnly && digitsOnly.length > 0) {
                    const parsedNumber = parseInt(digitsOnly.join(''), 10);
                    // 检查转换后的结果是否是有效数字（非 NaN）。
                    if (!isNaN(parsedNumber)) {
                        return parsedNumber;
                    }
                }
            }

            // 如果无法转换为有效数字（例如：非字符串非数字类型，或字符串中无数字），则返回 null。
            return null;
        }
        //需要一个不拼接版的数字提取
        // 某：没想到能用在哪里，not planed

        /**
         * 对指定的数字列表执行操作（查找、添加或删除）
         * @param {string} setName - 要操作的数字 Set 的名称。如果该名称对应的 Set 不存在，将自动创建一个。
         * @param {string} method - 操作类型，接受 'find' (查找), 'add' (添加), 'rm' (删除)。
         * @param {*} value - 要操作的原始输入值，可以是数字、字符串或混合字符串。
         * @returns {boolean|void} 当 method 为 'find' 时，返回 true (存在) 或 false (不存在)；
         * 其他操作无返回值，但会在控制台输出信息或警告。
         */
        manage(setName, method, value) {
            // 确保 setName 是一个非空字符串，作为 Set 的唯一标识符。
            if (typeof setName !== 'string' || setName.trim() === '') {
                console.warn('警告：Set 名称必须是一个非空的字符串，操作被跳过');
                return;
            }

            // 获取或创建对应的 Set。
            let targetSet = this.allNumberSets.get(setName);
            if (!targetSet) {
                // 如果该名称的 Set 不存在，则创建一个新的 Set 并储存
                targetSet = new Set();
                this.allNumberSets.set(setName, targetSet);
                console.info(`提示：数字列表 "${setName}" 不存在，已为您创建新的列表。`);
            }

            // 在进行任何操作之前，先将传入的值标准化为纯数字。
            const processedValue = this._normalizeNumber(value);

            // 如果标准化后的值不是有效数字，则发出警告并终止操作。
            if (processedValue === null) {
                console.warn(`警告：输入值 "${value}" 无法转换为有效数字，你**到底传了个什么进来！`);
                return;
            }

            // 根据传入的 method 类型执行不同的操作。
            switch (method) {
                case 'find':
                    // 'find' 操作：检查目标 Set 中是否包含指定数字。
                    return targetSet.has(processedValue);

                case 'add':
                    // 'add' 操作：向目标 Set 中添加一个数字。
                    // 防止重复添加
                    if (targetSet.has(processedValue)) {
                        console.warn(`警告：数字 "${processedValue}" 已存在于列表 "${setName}" 中，无需重复添加。`);
                    } else {
                        targetSet.add(processedValue); // 如果数字不存在，则将其添加到 Set 中
                        console.info(`数字 "${processedValue}" 已成功添加到列表 "${setName}"。`);
                    }
                    break;

                case 'rm':
                    // 'rm' (remove) 操作：从目标 Set 中删除一个数字。
                    // 防止删除不存在的数字
                    if (!targetSet.has(processedValue)) {
                        console.warn(`警告：数字 "${processedValue}" 不存在于列表 "${setName}" 中，无法执行删除操作。`);
                    } else {
                        targetSet.delete(processedValue);
                        console.info(`数字 "${processedValue}" 已成功从列表 "${setName}" 删除。`); // 这些 console.info 最后都要记得注释掉
                    }
                    break;

                default:
                    console.warn(`警告：未知的操作方法 "${method}"。支持的方法有 'find', 'add', 'rm'。`);
            }
        }

        /**
         * 获取指定名称的数字列表中存储的所有数字。
         * @param {string} setName - 要获取数字的 Set 的名称。
         * @returns {Array<number>|null} 返回一个包含所有存储数字的数组。如果指定的 Set 不存在，则返回 null。
         */
        getNumbersInSet(setName) {
            const targetSet = this.allNumberSets.get(setName);
            if (targetSet) {
                return Array.from(targetSet);
            }
            // 如果指定的 Set 不存在，则返回 null
            console.warn(`警告：列表 "${setName}" 不存在，无法获取其内容。`);
            return null;
        }

        /**
         * 获取所有当前存在的数字列表的名称。
         * @returns {Array<string>} 包含所有数字列表名称的数组。
         */
        getAllSetNames() {
            return Array.from(this.allNumberSets.keys());
        }

        /**
         * 删除一个数字列表。
         * @param {string} setName - 要删除的数字列表的名称。
         * @returns {boolean} 如果列表被成功删除返回 true，如果列表不存在返回 false。
         */
        deleteSet(setName) {
            if (this.allNumberSets.has(setName)) {
                this.allNumberSets.delete(setName);
                console.info(`数字列表 "${setName}" 已被删除。`);
                return true;
            }
            console.warn(`警告：尝试删除不存在的数字列表 "${setName}"。`);
            return false;
        }
    }
    const nList = new numberListManager();
    //允许用 nList.xxx 代替 numberListManager.xxx




    async function send(sendthings) {
        //是非：英语不好，之后你看着改
        // 某：自己改！
        console.log("进入 send 函数");
        let C_qq = seal.ext.getTemplateConfig(ext, "C_QQ");
        let C_qq_Group = seal.ext.getTemplateConfig(ext, "C_QQ_Group");
        //字面意思
        //获得一下长度，方便循环
        let C_qq_length = seal.ext.getTemplateConfig(ext, "C_QQ").length;
        let C_QQ_Group_length = seal.ext.getTemplateConfig(ext, "C_QQ_Group").length;
        try {
            for (let i = 0; i < C_qq_length; i++) {
                // 某：这个缩进有点怪异，嗯
                // 某：在for循环里面调用异步API请求函数要写await关键字，不然会导致严重的性能问题和[object Promise]  （）
                await A_request_N(url, "/send_private_msg", {
                    "user_id": C_qq[i],
                    "message": [{
                        "type": "text",
                        "data": {
                            "text": sendthings
                        }
                    }]
                });
            };
        } catch (e) {
            console.error("[Send] ERROR :", e.message);
        }
        console.log("步过私聊发送消息")
        try {
            for (let i = 0; i < C_QQ_Group_length; i++) {
                await A_request_N(url, "/send_group_msg", {
                    "group_id": C_qq_Group[i],
                    "message": [{
                        "type": "text",
                        "data": {
                            "text": sendthings
                        }
                    }]
                });
            }
        } catch (e) {
            console.error("[Send] ERROR :", e.message);
        }
        console.log("步过群聊发送消息")
    }

    

    /**
     * 从NC返回的QQ群成员列表中筛选出群主和管理员的信息
     *
     * @param {object} response_data - 包含API返回的群成员信息的对象。
     * @param {Array<object>} response_data.data - 包含各个群成员详细信息的数组。
     * @param {number} response_data.data[].user_id - 成员的QQ号码。
     * @param {string} response_data.data[].nickname - 成员的昵称。
     * @param {number} response_data.data[].join_time - 成员加入群组的Unix时间戳。
     * @param {string} response_data.data[].role - 成员在群中的角色（"owner", "admin", "member"等）。
     * @returns {Promise<Array<object>>} - 一个Promise，解析为一个数组，其中每个对象都包含
     * 群主或管理员的以下信息：
     * - {number} userId: 成员的QQ号码。
     * - {string} nickname: 成员的昵称。
     * - {string} role: 成员的角色（"owner" 或 "admin"）注：函数忽略角色为"member"的成员
     * - {string} joinTime: 成员加入群组的时间
     */
    async function getGroupANO(response_data) {
        // ANO 指 Admin and Owner
        // 用于存储筛选出的群主和管理员信息，最终作为函数返回值
        const ANOList = [];
        // 分别存储群主和管理员
        const owners = [];
        const admins = [];

        let consoleOutput = "关键成员列表:\n"; // 初始化输出字符串，添加标题

        // 检查 response_data 是否有效，并且包含一个名为 'data' 的数组
        if (response_data && response_data.data && Array.isArray(response_data.data)) {
            // 遍历 response_data.data 数组中的每一个成员对象
            response_data.data.forEach(member => {
                // 检查成员的角色是否为 "owner" (群主) 或 "admin" (管理员)
                if (member.role === "owner" || member.role === "admin") {
                    // 将 Unix 时间戳（秒）转换为 JavaScript Date 对象（毫秒）
                    const joinDate = new Date(member.join_time * 1000);

                    // 创建成员信息对象
                    const memberInfo = {
                        userId: member.user_id, // QQ 号
                        nickname: member.nickname, // 昵称
                        role: member.role, // 角色
                        joinTime: joinDate.toISOString() // 入群时间
                    };

                    // 根据角色分类存储
                    if (member.role === "owner") {
                        owners.push(memberInfo);
                    } else if (member.role === "admin") {
                        admins.push(memberInfo);
                    }

                    // 添加到总列表
                    ANOList.push(memberInfo);
                }
            });

            // 按照群主优先、管理员靠后的顺序构建输出字符串
            // 先输出群主
            owners.forEach(owner => {
                consoleOutput += `[群主] ${owner.nickname} (QQ: ${owner.userId})\n`;
                consoleOutput += `    入群时间：${owner.joinTime}\n`;
            });

            // 再输出管理员
            admins.forEach(admin => {
                consoleOutput += `[管理员] ${admin.nickname} (QQ: ${admin.userId})\n`;
                consoleOutput += `    入群时间：${admin.joinTime}\n`;
            });
        }

        // 在循环结束后一次性打印所有内容到控制台，正式使用要注释掉
        // console.info(consoleOutput);

        // 返回整理的文本
        return consoleOutput;

        // 返回包含群主和管理员信息的数组
        // return ANOList;
    }

    //测试用函数。为了避免 [object Promise]，需要整一个 async 函数，然后在里面中 await A_request_N()
    /**
     * 测试
     * @returns {Promise<object|null>} 请求成功则返回解析后的 JSON 响应数据，失败则返回 null。
     */
    async function testApiCall(group_id) {
        console.info("正在发起 API 请求...");
        const result = await A_request_N(url, "/get_group_member_list", {
            "group_id": group_id
        }); // 这里可以作为示例调用，或许 apipath 可以改为从参数传入。算了，反正是测试用的
        return result;
    }

    // 下面是一坨复制粘贴的取群组各种信息的函数
    // 还没写！！！

    /*
    async function testApiCall(group_id) {
      console.info("正在发起 API 请求...");
      const result = await A_request_N(url, "/get_group_member_list", {"group_id": group_id});  // 这里可以作为示例调用，或许 apipath 可以改为从参数传入。算了，反正是测试用的
      // await getGroupANO(result);
      return result;
    }
*/
    async function testApiCall_get_group_msg_history(group_id) {
        console.info("正在发起 API 请求 [GGMH]...");
        const result = await A_request_N(url, "/get_group_msg_history", {
            "group_id": group_id,
            "message_seq": 0,
            "count": 1,
            "reverseOrder": false
        }); // 这里可以作为示例调用，或许 apipath 可以改为从参数传入。算了，反正是测试用的
        // await getGroupANO(result);
        console.info(JSON.stringify(result, null, 2));
    }
    testApiCall_get_group_msg_history(710703655);
    // 调用测试函数



    /**
     * 根据 /get_group_msg_history 返回的响应构建合并转发消息，
     * 并通过 /send_forward_msg 将其发送到指定群组。
     *
     * @param {object} historyResponse - 完整的 /get_group_msg_history API 响应对象。
     * 预期结构为 { status: "ok", retcode: 0, data: { messages: [...] } }
     * @param {number} targetGroupId - 目标群组的纯数字 ID，合并转发消息将发送到此群组。
     * 例如：123456789
     * @returns {Promise<void>}
     */
    async function sendForwardedHistory(historyResponse, targetGroupId) {
        console.info("进入 sendForwardedHistory 函数。");

        // 确保 historyResponse 是一个有效的对象，并且 API 调用成功，包含消息数据
        if (!historyResponse || typeof historyResponse !== 'object' ||
            historyResponse.status !== 'ok' || historyResponse.retcode !== 0 ||
            !historyResponse.data || !Array.isArray(historyResponse.data.messages)) {
            console.error('sendForwardedHistory 错误：传入的 historyResponse 结构无效或 API 调用未成功。');
            return;
        }

        // 确保 targetGroupId 是一个有效的正整数
        if (typeof targetGroupId !== 'number' || !Number.isInteger(targetGroupId) || targetGroupId <= 0) {
            console.error('sendForwardedHistory 错误：传入的 targetGroupId 无效，必须是一个正整数。');
            return;
        }

        const messagesToForward = [];
        const chatMessages = historyResponse.data.messages; // 提取原始聊天消息列表

        // 注意：执行指令时要限制传参为最多100条。这样直接遍历才是安全的。
        for (const msg of chatMessages) {
            // 确保消息对象结构完整，避免运行时错误
            if (!msg || !msg.sender || typeof msg.user_id === 'undefined') {
                console.warn('sendForwardedHistory 警告：跳过了一个结构不完整的消息对象。', msg);
                continue; // 跳过不完整的消息
            }

            // 根据成员身份添加前缀标记（聊天记录转发不会带身份）
            let prefix = '';
            switch (msg.sender.role) {
                case 'member':
                    prefix = ' [成员]';
                    break;
                case 'admin':
                    prefix = ' [管理]';
                    break;
                case 'owner':
                    prefix = ' [群主]';
                    break;
                default:
                    prefix = ' [未知]'; // 处理未知角色
            }

            const contentArray = []; // 用于构建消息内容数组

            // 优先处理结构化消息 (message_format === 'array')
            if (msg.message_format === 'array' && Array.isArray(msg.message) && msg.message.length > 0) {
                for (const msgSegment of msg.message) {
                    // 处理文本段落：添加身份前缀
                    if (msgSegment && msgSegment.type === 'text' && msgSegment.data && typeof msgSegment.data.text === 'string') {
                        contentArray.push({
                            type: 'text',
                            data: {
                                text: msgSegment.data.text + prefix // 文本内容后追加身份前缀
                            }
                        });
                    } else if (msgSegment) {
                        // 兼容考虑
                        contentArray.push(msgSegment);
                    }
                }
            }

            // 如果结构化消息数组为空或无效，尝试使用 raw_message 
            if (contentArray.length === 0 && typeof msg.raw_message === 'string' && msg.raw_message.length > 0) {
                contentArray.push({
                    type: 'text',
                    data: {
                        text: msg.raw_message + prefix
                    }
                });
            }

            // 如果最终没有可转发的内容，则跳过此消息节点
            if (contentArray.length === 0) {
                console.warn('sendForwardedHistory 警告：跳过一条没有可转发内容的消息。', msg);
                continue;
            }

            // 添加到待转发的合并消息列表
            messagesToForward.push({
                type: 'node', // 合并转发消息的节点类型
                data: {
                    user_id: msg.user_id, // 消息发送者的 QQ 号
                    nickname: msg.sender.nickname || `用户 ${msg.user_id}`, // 使用发送者昵称，若无则显示 QQ 号
                    content: contentArray, // 消息内容数组
                }
            });
        }

        //  检查是否有消息需要转发
        if (messagesToForward.length === 0) {
            console.info('sendForwardedHistory：没有可供转发的消息。');
            return; // 没有消息可转发，直接返回
        }

        // 构建请求体
        const requestBody = {
            group_id: targetGroupId, // 目标群组 ID
            messages: messagesToForward, // 待转发的消息节点数组
            // 可选字段：根据需求可以从配置中读取并添加
            // "news": [],
            // "prompt": "",
            // "summary": "",
            // "source": ""
        };

        // 调用 API 发送合并转发消息
        try {
            console.info(`sendForwardedHistory：正在向群组 ${targetGroupId} 发送 ${messagesToForward.length} 条合并转发消息...`);
            const response = await A_request_N(baseurl, '/send_forward_msg', requestBody);

            // 检查 API 响应
            if (response && response.status === 'ok') {
                console.info(`sendForwardedHistory：合并转发消息发送成功！已成功将 ${messagesToForward.length} 条消息转发到群 ${targetGroupId}。`);
            } else {
                const errorMessage = response ? response.message || JSON.stringify(response) : '未知错误';
                console.error(`sendForwardedHistory 错误：发送合并转发消息失败。API 响应：${errorMessage}`);
            }
        } catch (error) {
            console.error('sendForwardedHistory 错误：调用 API 时发生异常：', error);
        }
    }


    // 这个改一改可以用在通知指定群/人那里
    /**
     * 从形如 "QQ-Group:123456" 的字符串中提取纯数字。
     * 强制要求字符串以 "QQ-Group:" 开头。
     * @param {string} inputString - 包含群组信息的字符串。
     * @returns {string | null} 提取到的纯数字字符串，如果未找到则返回 null。
     */
    function extractGroupId(inputString) {
        // ^ - 匹配字符串的开始
        // QQ-Group: - 精确匹配 "QQ-Group:"
        // \s* - 匹配零个或多个空格
        // (\d+) - 捕获一个或多个数字
        // $ - 确保后面没有其他字符
        const regex = /^QQ-Group:\s*(\d+)$/;

        const match = inputString.match(regex);

        // 如果匹配成功，match[1] 将是捕获到的数字部分
        if (match && match[1]) {
            return match[1];
        } else {
            return null; // 没找到可以匹配的
        }
    }


    const cmdlogApiCall = seal.ext.newCmdItemInfo();
    cmdlogApiCall.name = 'tac'; // 指令名
    cmdlogApiCall.help = '在当前群组进行 API 调用测试。\n用法：.tac <API 名称> [JSON 格式的请求体]';
    cmdlogApiCall.solve = async (ctx, msg, cmdArgs) => {
        const apiName = cmdArgs.getArgN(1);
        if (!apiName) {
            seal.replyToSender(ctx, msg, '错误：请输入要调用的 API 名称。');
            return;
        }
        const groupId = extractGroupId(ctx.group.groupId);
        // 构造默认请求体
        let requestBody = {
            "group_id": groupId
        };
        // 检查是否有自定义请求体
        const customBodyStr = cmdArgs.getArgN(2);
        if (customBodyStr) {
            try {
                const parsedCustomBody = JSON.parse(customBodyStr);
                // 合并或替换请求体
                requestBody = parsedCustomBody;
            } catch (e) {
                seal.replyToSender(ctx, msg, `错误：自定义请求体不是有效的 JSON 格式。\n详情：${e.message}`);
                // return seal.ext.newcmdLeavexecuteResult(false);
            }
        }

        // const jsonRequestBody = JSON.stringify(requestBody);
        // 某：有点怀疑是格式化过头？
        // 某：确认了就是，已经注释掉了
        const jsonRequestBody = requestBody;


        try {
            const apiResponse = await A_request_N(url, apiName, jsonRequestBody);

            const reply = JSON.stringify(apiResponse, null, 2);
            seal.replyToSender(ctx, msg, `API 调用成功，响应：\n${reply}`);
            return seal.ext.newcmdLeavexecuteResult(true);
        } catch (error) {
            seal.replyToSender(ctx, msg, `API 调用失败：${error.message}`);
        }
    };
    ext.cmdMap['tac'] = cmdlogApiCall;
    // 这一坨 console.info() 千万别忘记注释掉啊！
    // 某：是非，代码疑似有点丑了，排版很怪，你要不用电脑找个美化工具美化下？
    //是非：唔啊，没找到美化工具
    // 某：我用手机整了，大概会好吧

    const cmdLeave = seal.ext.newCmdItemInfo();
    cmdLeave.name = 'leave';
    cmdLeave.help = '远程退群：.leave <群号>';

    cmdLeave.solve = async (ctx, msg, cmdArgs) => {
        // TODO: 指令的具体逻辑
        let group_id = cmdArgs.getArgN(1);
        await A_request_N(url, "/set_group_leave", 
            {
            "group_id": group_id,
            "is_dismiss": false
            }
        );
    };

    ext.cmdMap['leave'] = cmdLeave;

    const cmdGetGroupMsg = seal.ext.newCmdItemInfo();
    cmdGetGroupMsg.name = 'getmsg'; // 指令名
    cmdGetGroupMsg.help = '取群聊消息 <群号> [消息数 (默认 20)]';
    cmdGetGroupMsg.solve = async (ctx, msg, cmdArgs) => {
        let group_id = cmdArgs.getArgN(1);
        let count;
        if (cmdArgs.getArgN(2)) {
            count = cmdArgs.getArgN(2);
        } else {
            count = 10;
        }
        // 某：这里还没写对应的函数，先注释掉

        reply = "群号：" + cmdArgs.getArgN(1) + " 数量：" + cmdArgs.getArgN(2);

        seal.replyToSender(ctx, msg, reply);
        let result = await A_request_N(
            url,
            "/get_group_msg_history",
            {
                "group_id": group_id,
                "message_seq": 0,
                "count": count,
                "reverseOrder": false
            }
        );
        // 某：我试试高可读性写法
        console.log("运行到返回");
        seal.replyToSender(ctx, msg, "返回：");
        seal.replyToSender(ctx, msg, result);
        // 这一句调试
        sendForwardedHistory(result, ctx.group.groupId);

        return seal.ext.newcmdLeavexecuteResult(true);
    }
    ext.cmdMap['getmsg'] = cmdGetGroupMsg;

    //非指令
    // 某：这里我考虑去掉了，可能有问题
    ext.onNotCommandReceived = async (ctx, msg) => {
        let messageContent = msg.message.trim();
        // 取消息去空格
        let regex;
        let match;
        console.info("G_message:", messageContent);
        // 记得注释（
        if (messageContent == '查群表') {
            // 查群列表函数
            // 某：理论上写一起不会有问题吧....
            console.info("匹配了 查群表 ");
            await checkGroupName(ctx, msg);
            return;
        }

        // 定义正则表达式：
        // ^               - 匹配字符串的开始
        // (\d+)           - 捕获数字
        regex = /^GetMMs(\d+)$/i; // i 表示不区分大小写
        match = regex.exec(messageContent);
        if (match) {
            // 如果匹配成功，match[1] 将是捕获到的数字部分
            console.info("match:", match[1]);
            let group_id = match[1];
            console.info("group_id:", group_id);
            let result = await testApiCall(group_id);
            let reply = await getGroupANO(result);
            seal.replyToSender(ctx, msg, reply)
            return;
        }

    };

    // 注册每日任务
    seal.ext.registerTask(
        ext,
        "daily",
        // 某：我还是建议把这里改成 corn 的
        dailyExpression, // 每天早上 7:30 执行
        async (taskCtx) => {
            try {
                console.info(`[定时任务] 执行函数 checkGroupName(ctx, msg)，时间戳：${taskCtx.now}`);
                // 某：给我统一用 console log
                await checkGroupName(ctx, msg);
            } catch (e) {
                console.error(`[定时任务] 执行 checkGroupName(ctx, msg) 失败：${e.message}\n${e.stack}`);
            }
        },
        "checkGroupNameDaily", // key
        "每天定时查群列表并通知" // description
    );
    // 某：虽然是写完了，但是似乎会导致卡加载，同时现在用的还是 replyToSender，可能会导致意外情况，不知道怎么办

    /*
    cmdGetMM.solve = (ctx, msg, cmdArgs) => {
        // 取核心成员，要求在群内
        if (msg!=""){
            CheckGroupName(ctx,ctx.group.groupId);
        }
        // 没写完！有可能弃用
        // 可能会改为死循环吧....
        // 某：已经被取代，很可能删除这段代码
    }
    */


}
