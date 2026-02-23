// ==UserScript==
// @name        劫持指令示例
// @author       某人
// @version      1.0.0
// @description  通过改写 solve 用插件代码替代内置代码执行指令
// @timestamp   1752569670
// @license      MIT
// @homepageURL   https://github.com/lyjjl
// ==/UserScript==

/*
   免责声明：
仅供交流学习和优化内置指令使用.严禁用于 作弊/恶意/违法违规 等.本插件完全无恶意行为,通过本插件思路制作的其他插件与本人无关
*/
// 重要：本插件所述方法似乎在 1.5.1 正式版更新后对官方扩展失效，请等待官方修改方案或使用旧版本海豹核心

let ext = seal.ext.find('commandHijack-example');

if (!ext) {
  ext = seal.ext.new('commandHijack-example', '某人', '1.0.0');
  seal.ext.register(ext);
}
// 上面是注册这个插件的地方

// 下面是劫持
const extcoc = seal.ext.find('coc7');
// 你要劫持的指令所在的扩展
const cmdrc = extcoc.cmdMap['rc'];
// 你要劫持的指令
// 理论上,你可以劫持其他插件和内置插件的指令......
cmdrc.solve = (ctx, msg, cmdArgs) => {
    // 自定义 solve
    
    seal.replyToSender(ctx, msg, `指令[rc]劫持成功 | 你的传参是[${cmdArgs.getArgN(1)}]`);
    // 这里发送消息告诉你劫持成功,你可以替换为更加有益的代码
    
    // 很简单对吧
    
    return seal.ext.newCmdExecuteResult(true);
    // 指令执行成功
};

// 因为原有插件已经帮你挂 cmdMap 了，所以你改 solve 就行，不用再自己挂 cmdMap
