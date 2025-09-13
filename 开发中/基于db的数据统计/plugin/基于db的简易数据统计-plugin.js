// ==UserScript==
// @name         基于db的简易数据统计(CBDB)
// @author       某人
// @version      1.0.0
// @description  .dbcount ale - 获取数据库统计信息; .dbcount cr - 获取角色总数
// @timestamp    0
// @license      MIT
// @homepageURL  https://github.com/
// ==/UserScript==

async function fetchDbStats(apiUrl, dbName) {
    const requestBody = {
        "path": "./data/default",
        "filename": dbName
    };

    try {
        const response = await fetch(`${apiUrl}/get_db_stats`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorData.message}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching DB stats:', error);
        throw error;
    }
}

async function fetchAndFormatDbStats(apiUrl) {
    try {

        const dataDbResponse = await fetchDbStats(apiUrl, 'data.db');

        const logsDbResponse = await fetchDbStats(apiUrl, 'data-logs.db');

        let formattedText = '';

        // 格式化
        formattedText += '=== 数据库统计信息 (data.db) ===\n';
        if (dataDbResponse.status === 'success' && dataDbResponse.data) {
            const data = dataDbResponse.data;
            formattedText += `文件路径: ${data.file_path}\n`;
            formattedText += `文件大小: ${data.file_size_mb.toFixed(2)} MB\n`;
            formattedText += `总表数量: ${data.total_tables}\n`;
            formattedText += `总索引数量: ${data.total_indexes}\n`;
            formattedText += `总行数: ${data.total_rows}\n`;
            formattedText += '表行数详情:\n';
            for (const [table, rows] of Object.entries(data.table_stats)) {
                formattedText += `  - ${table}: ${rows} 行\n`;
            }
        } else {
            formattedText += `错误: ${dataDbResponse.message || '未知错误'}\n`;
        }

        formattedText += '\n';

        formattedText += '=== 数据库统计信息 (data-logs.db) ===\n';
        if (logsDbResponse.status === 'success' && logsDbResponse.data) {
            const logsData = logsDbResponse.data;
            formattedText += `文件路径: ${logsData.file_path}\n`;
            formattedText += `文件大小: ${logsData.file_size_mb.toFixed(2)} MB\n`;
            formattedText += `总表数量: ${logsData.total_tables}\n`;
            formattedText += `总索引数量: ${logsData.total_indexes}\n`;
            formattedText += `总行数: ${logsData.total_rows}\n`;
            formattedText += '表行数详情:\n';
            for (const [table, rows] of Object.entries(logsData.table_stats)) {
                formattedText += `  - ${table}: ${rows} 行\n`;
            }
        } else {
            formattedText += `错误: ${logsDbResponse.message || '未知错误'}\n`;
        }

        return formattedText;
    } catch (error) {
        console.error('Error in fetchAndFormatDbStats:', error);
        return `An error occurred: ${error.message}`;
    }
}

async function fetchAndFormatCount(apiUrl) {
  try {
    const response = await fetch(`${apiUrl}/count`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorData.message}`);
    }

    const data = await response.json();
    
    if (data.character !== undefined) {
      return `总角色数量: ${data.character} 个`;
    } else {
      return `响应中未找到 'character' 字段。`;
    }
  } catch (error) {
    console.error('Error fetching character count:', error);
    return `获取角色数量时发生错误: ${error.message}`;
  }
}

let ext = seal.ext.find('CBDB');
if (!ext) {
    ext = seal.ext.new('CBDB', '某人', '1.0.0');
    seal.ext.register(ext);

    seal.ext.registerStringConfig(ext, "api_url", "http://127.0.0.1:5000", "API地址");

    const cmdDBCount = seal.ext.newCmdItemInfo();
    cmdDBCount.name = 'dbcount';
    cmdDBCount.help = '进行基于db的数据统计';

    cmdDBCount.solve = async (ctx, msg, cmdArgs) => {

        const API_URL = seal.ext.getStringConfig(ext, "api_url");

        switch (cmdArgs.getArgN(1)) {
            case "ale":

                try {
                    const statsText = await fetchAndFormatDbStats(API_URL);
                    seal.replyToSender(ctx, msg, statsText);
                } catch (err) {
                    console.error('An error occurred during execution:', err);
                }

                break;

            case "cr":

                try {
                    const countText = await fetchAndFormatCount(API_URL);
                    seal.replyToSender(ctx, msg, countText);
                } catch (err) {
                    console.error('An error occurred during execution:', err);
                }

                break;

            default:
                seal.replyToSender(ctx, msg, "未知子指令，请使用 'ale' 或 'cr'.");
                
                break;

        }

    };

    // 将命令注册到扩展中
    ext.cmdMap['dbcount'] = cmdDBCount;


}