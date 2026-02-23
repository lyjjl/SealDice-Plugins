// ==UserScript==
// @name        OnCommandOverride示例
// @author     某人
// @version     1.0.0
// @description 用 OnCommandOverride 覆盖官方指令示例
// @timestamp   1752569670
// @license     MIT
// ==/UserScript==

/*
   免责声明：
仅供交流学习和优化内置指令使用.严禁用于 作弊/恶意/违法违规 等.本插件完全无恶意行为,通过本插件思路制作的其他插件与本人无关
*/
/*
本插件暂时无法使用，如果想要使用，可以自行修改源代码：
  dice/dice.go 
    96 -        OnCommandOverride    func(ctx *MsgContext, msg *Message, cmdArgs *CmdArgs) bool `json:"-" yaml:"-"` // 覆盖指令行为
    96 +        OnCommandOverride    func(ctx *MsgContext, msg *Message, cmdArgs *CmdArgs) bool `jsbind:"onCommandOverride" json:"-" yaml:"-"` // 覆盖指令行为
*/

let ext = seal.ext.find("OnCommandOverride示例");
if (!ext) {
  ext = seal.ext.new("OnCommandOverride示例", "某人", "1.0.0");
  seal.ext.register(ext);
}

// 通过 OnCommandOverride 拦截指令
ext.OnCommandOverride = (ctx, msg, cmdArgs) => {
  // 拦截 rc
  if (cmdArgs.Command !== "rc") return false;

  // 自定义逻辑
  seal.replyToSender(ctx, msg, `指令[rc]被覆盖 | 你的传参是[${cmdArgs.getArgN(1)}]`);

  // 返回 true 表示已处理，不再进入官方指令流程
  return true;
};

