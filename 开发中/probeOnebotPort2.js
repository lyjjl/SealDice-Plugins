/**
 * Bot 框架服务发现工具
 * @param {string[]} possibleTokens 预设的 token 列表
 * @param {number} concurrency 并发数
 */
async function discoverBotServices(possibleTokens = [""], concurrency = 150) {
    const results = {};
    const tokens = ["", ...possibleTokens]; // 包含空 token 尝试

    // 辅助函数：记录结果到聚合对象
    const addResult = (uid, nickname, type, url, token) => {
        if (!results[uid]) {
            results[uid] = {
                user_id: uid,
                nickname: nickname,
                url: { http: [], ws: [] }
            };
        }
        results[uid].url[type].push([url, token]);
    };

    // 探测单个端口
    async function probe(port) {
        // 1. 探测 HTTP
        await probeHttp(port);
        // 2. 探测 WS (独立探测)
        await probeWs(port);
    }

    async function probeHttp(port) {
        const baseUrl = `http://127.0.0.1:${port}`;
        const apiUrl = `${baseUrl}/get_login_info`;

        for (const token of tokens) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 150); // 本地 150ms 超时

                const res = await fetch(apiUrl, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (res.status === 200) {
                    const json = await res.json();
                    if (json.status === "ok" || json.retcode === 0) {
                        console.log(`[HTTP] 发现服务: 端口 ${port}, 用户: ${json.data.user_id}`);
                        addResult(json.data.user_id, json.data.nickname, 'http', baseUrl, token || null);
                        return; // 成功后跳出 token 循环
                    }
                } else if (res.status === 403) {
                    console.warn(`[HTTP] 端口 ${port} 返回 403 (Forbidden)，尝试下一个 token...`);
                }
            } catch (e) {
                // 拒绝连接或超时，直接跳出 token 循环
                break;
            }
        }
    }

    async function probeWs(port) {
        const wsUrl = `ws://127.0.0.1:${port}`;
        for (const token of tokens) {
            try {
                const wsResult = await new Promise((resolve) => {
                    const ws = new WebSocket(wsUrl);
                    setTimeout(() => {
                        ws.close();
                        resolve(null);
                    }, 200);

                    ws.onopen = () => {
                        ws.send(JSON.stringify({
                            action: "get_login_info",
                            params: {},
                            echo: "probe",
                            token: token
                        }));
                    };

                    ws.onmessage = (msg) => {
                        try {
                            const data = JSON.parse(msg.data);
                            // 检查是否是预期的登录信息回复
                            if ((data.data && data.data.user_id) || data.retcode === 0) {
                                resolve(data);
                            }
                        } catch (e) { resolve(null); }
                        ws.close();
                    };

                    ws.onerror = () => {
                        ws.close();
                        resolve(null);
                    };
                });

                if (wsResult && wsResult.data) {
                    console.log(`[WS] 发现服务: 端口 ${port}, 用户: ${wsResult.data.user_id}`);
                    addResult(wsResult.data.user_id, wsResult.data.nickname, 'ws', wsUrl, token || null);
                    return;
                }
            } catch (e) { break; }
        }
    }

    // 分批执行扫描
    console.log("开始全异步端口扫描...");
    for (let i = 1; i <= 65535; i += concurrency) {
        const promises = [];
        for (let j = 0; j < concurrency && (i + j) <= 65535; j++) {
            promises.push(probe(i + j));
        }
        await Promise.all(promises);

        if (i % 1000 < concurrency) {
            console.log(`已扫描至端口: ${i}...`);
        }
    }

    return results;
}

// 使用示例
discoverBotServices(["my_secret_token_1", "admin123"]).then(data => {
    console.log("扫描完成，最终结果:", JSON.stringify(data, null, 2));
});