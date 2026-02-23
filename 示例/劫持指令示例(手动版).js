// ==UserScript==
// @name        指令劫持手动版
// @author     某人
// @version     1.0.0
// @description 手动在 WebUI 禁用原有指令即可使本插件注册的指令生效
// @timestamp   1752569670
// @license     MIT
// ==/UserScript==

/*
   免责声明：
仅供交流学习和优化内置指令使用.严禁用于 作弊/恶意/违法违规 等.本插件完全无恶意行为,通过本插件思路制作的其他插件与本人无关
*/

let ext = seal.ext.find("指令劫持手动版");
if (!ext) {
  ext = seal.ext.new("指令劫持手动版", "某人", "1.0.0");
  seal.ext.register(ext);
}

const cmdRCTest = seal.ext.newCmdItemInfo();
cmdRCTest.name = 'rc';
cmdRCTest.allowDelegate = false;
cmdRCTest.help = '这是一个被劫持的指令示例，原指令已被禁用';

cmdRCTest.solve = (ctx, msg) => {
  seal.replyToSender(ctx, msg, `Test`);

  const ret = seal.ext.newCmdExecuteResult(true);
  ret.showHelp = true;

  seal.replyToSender(ctx, msg, `cmdRCTest.solve 将要 return help ret: ${JSON.stringify(ret)}`);
  return ret;
};

ext.cmdMap['rc'] = cmdRCTest;

