// ==UserScript==
// @name         autoQLike
// @author       某人
// @version      1.0.0
// @description  个人资料点赞！
// @timestamp    0
// @license      MIT
// @homepageURL  https://github.com/
// ==/UserScript==

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

async function sendQLike(baseUrl = "", targetUin = 2863075269, times = 50) {
    let body = {
        "user_id": targetUin,
        "times": times
    }
    await apiRequest(baseUrl, "send_like", body, seal.ext.getStringConfig(ext, "httpToken"));
}

async function isFriend(baseUrl = "", targetUin = 0) {
    let {data} = await apiRequest(baseUrl, "get_friend_list", {"no_cache": true}, seal.ext.getStringConfig(ext, "httpToken"));
    return data.some(obj => obj.user_id === targetUin);
}

// 辅助函数：检查发送条件
async function canSendQLike(ctx, baseUrl, targetUin) {
    // 管理员直接通过
    if (ctx.privilegeLevel >= 70) {
        return true;
    }

    // 检查是否需要好友关系
    const requireFriend = seal.ext.getBoolConfig(ext, "reqFriend");
    return !requireFriend || await isFriend(baseUrl, targetUin);
}

// 辅助函数：回复消息
async function reply(ctx, msg, configKey) {
    const message = seal.format(ctx, seal.ext.getStringConfig(ext, configKey));
    return seal.replyToSender(ctx, msg, message);
}

// 自动点赞任务 遍历qLikeData并检查follow状态
async function autoFollowQLike() {
    try {
        const baseUrl = seal.ext.getStringConfig(ext, "onebotServerUrl");
        let successCount = 0;
        let totalCount = 0;

        // 遍历所有用户数据
        for (const [uin, userData] of Object.entries(qLikeData)) {
            // 检查是否订阅且今天未点赞
            if (userData.follow && !userData.liked_today) {
                totalCount++;
                const targetUin = parseInt(uin);

                try {
                        await sendQLike(baseUrl, targetUin);
                        userData.liked_today = true;
                        successCount++;

                        await new Promise(resolve => setTimeout(resolve, 800));
                } catch (error) {
                    console.error(`✗ 为用户 ${targetUin} 点赞失败:`, error.message);
                }
            }
        }
        // 保存更新后的数据
        if (successCount > 0) {
            ext.storageSet("qLikeData", JSON.stringify(qLikeData));
        }
        //console.log(`自动点赞任务完成！成功点赞: ${successCount}/${totalCount} 个用户`);

    } catch (error) {
        console.error('自动点赞任务执行失败:', error);
    }
}

function resetDailyLikes() {
    for (const userData of Object.values(qLikeData)) {
        userData.liked_today = false;
    }
    ext.storageSet("qLikeData", JSON.stringify(qLikeData));
}

let ext = seal.ext.find('autoQLike');
let qLikeData;
if (!ext) {
    ext = seal.ext.new('autoQLike', '某人', '1.0.0');
    seal.ext.register(ext);

    try {
        const dbData = ext.storageGet("qLikeData");
        qLikeData = dbData ? JSON.parse(dbData) : {};
    } catch {
        qLikeData = {};
        ext.storageSet("qLikeData", qLikeData);
    }

    seal.ext.registerTask(
        ext,
        "daily",
        "0:00",
        async () => {
            await autoFollowQLike();
            resetDailyLikes();
        },
        "dailyQLikeAndReset",
        "每天为订阅者点赞并重置日点赞记录"
    );


    // seal.ext.registerBoolConfig(ext "wsMode", false);
    seal.ext.registerStringConfig(ext, "onebotServerUrl", "http://127.0.0.1:3001", "onebot API 地址");
    seal.ext.registerStringConfig(ext, "httpToken", "", "HTTP Token");
    // seal.ext.registerOptionConfig(ext, "onebotClient", "NapCat", ["NapCat"], "分离端类型");
    seal.ext.registerBoolConfig(ext, "reqFriend", true, "是否需要加骰好友才能用，Master和Trust不受限制");
    seal.ext.registerStringConfig(ext, "reqFriendMsg", "本功能需要先加我为好友", "要求好友但是操作者不是好友时发送的提示语");
    seal.ext.registerStringConfig(ext, "finishMsg", "已经给你点赞了", "点完赞的提示语");
    seal.ext.registerStringConfig(ext, "followedMsg", "订阅点赞成功！", "订阅成功提示词");
    seal.ext.registerStringConfig(ext, "alreadyFollow", "你已经订阅过了！", "订阅失败-已经订阅了")
    seal.ext.registerStringConfig(ext, "unFollowedMsg", "TD成功！", "退订提示词");
    seal.ext.registerStringConfig(ext, "likedMsg", "今天已经给你点过赞了，不要太贪心", "已经点过赞的操作者再次执行指令的提示语");
    seal.ext.registerBoolConfig(ext, "likeDev", true, "给作者点赞，支持插件的开发工作。当然，你也可以关掉");

    const qLikeMe = seal.ext.newCmdItemInfo();
    qLikeMe.name = '赞我';
    qLikeMe.help = '执行后会给你点赞~';

    qLikeMe.solve = async (ctx, msg) => {
        const baseUrl = seal.ext.getStringConfig(ext, "onebotServerUrl");
        const targetUin = parseInt(ctx.player.userId.replace(/\D+/g, ""));

        if (!qLikeData[targetUin]) {
            qLikeData[targetUin] = {liked_today: false, follow: false};
        }

        const userData = qLikeData[targetUin];

        if (userData.liked_today) {
            return await reply(ctx, msg, "likedMsg");
        }

        if (!await canSendQLike(ctx, baseUrl, targetUin)) {
            return await reply(ctx, msg, "reqFriendMsg");
        }

        await sendQLike(baseUrl, targetUin);
        userData.liked_today = true;
        ext.storageSet("qLikeData", JSON.stringify(qLikeData));
        await reply(ctx, msg, "finishMsg");
    };


    const followQLikeMe = seal.ext.newCmdItemInfo();
    followQLikeMe.name = '订阅点赞';
    followQLikeMe.help = '执行后会每天给你点赞~';

    followQLikeMe.solve = async (ctx, msg, cmdArgs) => {
        const baseUrl = seal.ext.getStringConfig(ext, "onebotServerUrl");
        const targetUin = parseInt(ctx.player.userId.replace(/\D+/g, ""));

        // 初始化用户数据
        if (!qLikeData[targetUin]) {
            qLikeData[targetUin] = {liked_today: false, follow: false};
        }

        const userData = qLikeData[targetUin];

        if (cmdArgs.getArgN(1) === "取消" || cmdArgs.getArgN(1).toUpperCase() === "TD") {
            // 取消订阅
            userData.follow = false;
            await reply(ctx, msg, "unFollowedMsg");
        } else {
            if (ctx.privilegeLevel >= 70 ||
                !seal.ext.getBoolConfig(ext, "reqFriend") ||
                await isFriend(baseUrl, targetUin)) {

                if (userData.follow) {
                    await reply(ctx, msg, "alreadyFollow")
                } else {
                    await sendQLike(baseUrl, targetUin);
                    userData.liked_today = true;
                    userData.follow = true;
                    await reply(ctx, msg, "followedMsg");
                }
            } else {
                await reply(ctx, msg, "reqFriendNsg");
            }
        }

        // 保存数据
        ext.storageSet("qLikeData", JSON.stringify(qLikeData));
    };

    ext.cmdMap['赞我'] = qLikeMe;
    ext.cmdMap['订阅点赞'] = followQLikeMe;
}