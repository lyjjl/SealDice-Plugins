// ==UserScript==
// @name        拍卖系统
// @author      MisakaEx
// @version     1.0.2
// @description 一个简单的拍卖系统，支持多拍卖品和权限控制，发送 .拍卖 查看使用帮助
// @timestamp   1752935617
// @license     MIT
// @homepageURL https://github.com/lyjjl
// ==/UserScript==

/*
   免责声明：
仅供交流学习和娱乐使用.严禁用于 违法违规 用途.通过本插件思路制作的其他插件与本人无关
*/

// 查找或创建并注册插件实例
let ext = seal.ext.find('AuctionSystem');
if (!ext) {
    ext = seal.ext.new('AuctionSystem', 'MisakaEx', '1.0.2');
    seal.ext.register(ext);
}

// 定义存储拍卖品数据的键名
const AUCTION_DATA_KEY = 'auction_products';

/**
 * 异步函数：从插件存储中获取所有拍卖品数据
 * @returns {Promise<Object>} 拍卖品数据对象，如果不存在则返回空对象
 */
async function getAuctionData() {
    let data = await ext.storageGet(AUCTION_DATA_KEY);
    return data ? JSON.parse(data) : {};
}

/**
 * 异步函数：将拍卖品数据保存到插件存储中
 * @param {Object} data - 要保存的拍卖品数据对象
 * @returns {Promise<void>}
 */
async function saveAuctionData(data) {
    await ext.storageSet(AUCTION_DATA_KEY, JSON.stringify(data));
}

// 注册拍卖命令
let cmdAuction = seal.ext.newCmdItemInfo();
cmdAuction.name = "拍卖";
cmdAuction.help = "拍卖系统指令:\n" +
    ".拍卖 上架 <产品名称> <起始价格> - 创建新拍卖品\n" +
    ".拍卖 出价 <产品名称> <出价金额> - 为产品出价\n" +
    ".拍卖 加价 <产品名称> <加价金额> - 为产品加价\n" +
    ".拍卖 查看 [产品名称] - 查询拍卖状态\n" +
    ".拍卖 结束 <产品名称> - 结束指定拍卖 (权限等级 >= 50)";
cmdAuction.solve = async (ctx, msg, cmdArgs) => {
    let subCommand = cmdArgs.getArgN(1); // 获取子命令
    let auctionProducts = await getAuctionData(); // 获取所有拍卖品数据

    switch (subCommand) {
        case '上架': {
            let productName = cmdArgs.getArgN(2); // 产品名称
            let startingPriceStr = cmdArgs.getArgN(3); // 起始价格字符串
            let startingPrice = parseInt(startingPriceStr); // 转换为整数

            // 参数校验
            if (!productName || isNaN(startingPrice) || startingPrice <= 0) {
                seal.replyToSender(ctx, msg, `格式错误: .拍卖 上架 <产品名称> <起始价格> (价格必须为正整数)`);
                return seal.ext.newCmdExecuteResult(true);
            }
            // 检查产品是否已存在
            if (auctionProducts[productName]) {
                seal.replyToSender(ctx, msg, `产品“${productName}”已存在，请勿重复创建。`);
                return seal.ext.newCmdExecuteResult(true);
            }

            // 创建新的拍卖品对象
            auctionProducts[productName] = {
                currentPrice: startingPrice,
                highestBidder: '无', // 初始最高出价人
                highestBidderId: '' // 初始最高出价人ID
            };
            await saveAuctionData(auctionProducts); // 保存数据
            seal.replyToSender(ctx, msg, ` 拍卖品“${productName}”已创建，起始价格为 ${startingPrice} 元。`);
            break;
        }

        case '出价': {
            let productName = cmdArgs.getArgN(2); // 产品名称
            let bidAmountStr = cmdArgs.getArgN(3); // 出价金额字符串
            let bidAmount = parseInt(bidAmountStr); // 转换为整数

            // 参数校验
            if (!productName || isNaN(bidAmount) || bidAmount <= 0) {
                seal.replyToSender(ctx, msg, `格式错误: .拍卖 出价 <产品名称> <出价金额> (金额必须为正整数)`);
                return seal.ext.newCmdExecuteResult(true);
            }
            // 检查拍卖品是否存在
            if (!auctionProducts[productName]) {
                seal.replyToSender(ctx, msg, `未找到拍卖品“${productName}”。`);
                return seal.ext.newCmdExecuteResult(true);
            }

            let product = auctionProducts[productName];
            // 检查出价是否高于当前价格
            if (bidAmount <= product.currentPrice) {
                seal.replyToSender(ctx, msg, `您的出价 ${bidAmount} 元低于或等于当前价格 ${product.currentPrice} 元，请出更高的价格。`);
                return seal.ext.newCmdExecuteResult(true);
            }

            // 更新拍卖品信息
            product.currentPrice = bidAmount;
            product.highestBidder = msg.sender.nickname;
            product.highestBidderId = msg.sender.userId;
            await saveAuctionData(auctionProducts); // 保存数据
            seal.replyToSender(ctx, msg, `恭喜！ ${msg.sender.nickname} 为“${productName}”出价 ${bidAmount} 元，目前最高价！`);
            seal.replyToSender(ctx, msg, `“${productName}”现价 ${product.currentPrice} 元。`);
            break;
        }

        case '加价': {
            let productName = cmdArgs.getArgN(2); // 产品名称
            let increaseAmountStr = cmdArgs.getArgN(3); // 加价金额字符串
            let increaseAmount = parseInt(increaseAmountStr); // 转换为整数

            // 参数校验
            if (!productName || isNaN(increaseAmount) || increaseAmount <= 0) {
                seal.replyToSender(ctx, msg, `格式错误: .拍卖 加价 <产品名称> <加价金额> (金额必须为正整数)`);
                return seal.ext.newCmdExecuteResult(true);
            }
            // 检查拍卖品是否存在
            if (!auctionProducts[productName]) {
                seal.replyToSender(ctx, msg, `未找到拍卖品“${productName}”。`);
                return seal.ext.newCmdExecuteResult(true);
            }

            let product = auctionProducts[productName];
            let newPrice = product.currentPrice + increaseAmount; // 计算新价格

            // 更新拍卖品信息
            product.currentPrice = newPrice;
            product.highestBidder = msg.sender.nickname;
            product.highestBidderId = msg.sender.userId;
            await saveAuctionData(auctionProducts); // 保存数据
            seal.replyToSender(ctx, msg, ` ${msg.sender.nickname} 为“${productName}”加价 ${increaseAmount} 元，现价 ${product.currentPrice} 元，目前最高价！`);
            break;
        }

        case '查看': {
            let productName = cmdArgs.getArgN(2); // 产品名称 (可选)
            let response = "";

            if (productName) {
                // 查询指定拍卖品状态
                let product = auctionProducts[productName];
                if (product) {
                    response = `“${productName}”现价 ${product.currentPrice} 元，目前由 ${product.highestBidder} 领先出价。`;
                } else {
                    response = `未找到拍卖品“${productName}”。`;
                }
            } else {
                // 查询所有拍卖品状态
                let activeProducts = Object.keys(auctionProducts);
                if (activeProducts.length === 0) {
                    response = "目前没有活跃的拍卖品。";
                } else {
                    response = "当前活跃拍卖品列表:\n";
                    for (let pName of activeProducts) {
                        let product = auctionProducts[pName];
                        response += `  - “${pName}”：现价 ${product.currentPrice} 元，由 ${product.highestBidder} 领先。\n`;
                    }
                }
            }
            seal.replyToSender(ctx, msg, response);
            break;
        }

        case '结束': { // 结束拍卖命令
            let productName = cmdArgs.getArgN(2); // 要结束的拍卖品名称

            if (ctx.privilegeLevel < 50) {
                seal.replyToSender(ctx, msg, `您没有权限结束拍卖。只有权限等级大于等于50的用户才能执行此操作。`);
                return seal.ext.newCmdExecuteResult(true);
            }

            // 参数校验
            if (!productName) {
                seal.replyToSender(ctx, msg, `格式错误: .拍卖 结束 <产品名称>`);
                return seal.ext.newCmdExecuteResult(true);
            }
            // 检查拍卖品是否存在
            if (!auctionProducts[productName]) {
                seal.replyToSender(ctx, msg, `未找到拍卖品“${productName}”。`);
                return seal.ext.newCmdExecuteResult(true);
            }

            let product = auctionProducts[productName];
            let winnerMessage = product.highestBidder === '无' ?
                `拍卖品“${productName}”无人出价，拍卖结束。` :
                ` 拍卖品“${productName}”以 ${product.currentPrice} 元的价格，由 ${product.highestBidder} 拍得！恭喜！`;
            delete auctionProducts[productName]; // 从数据中删除已结束的拍卖品
            await saveAuctionData(auctionProducts); // 保存更新后的数据
            seal.replyToSender(ctx, msg, winnerMessage);
            break;
        }

        default: {
            seal.replyToSender(ctx, msg, `未知命令或格式错误。请使用：\n ${cmdAuction.help}`);
            break;
        }
    }

    return seal.ext.newCmdExecuteResult(true);
};

// 将命令注册到插件的命令映射中
ext.cmdMap[cmdAuction.name] = cmdAuction;