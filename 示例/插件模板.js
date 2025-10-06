// ==UserScript==
// @name         
// @author       
// @version      1.0.0
// @description  
// @timestamp    
// @license      MIT
// @homepageURL  https://github.com/
// ==/UserScript==

// ###################################################
// ##### ⚠警告 : 本文件无法直接使用 , 请勿直接加载 #####
// ###################################################

let ext = seal.ext.find('');
if (!ext) {
    ext = seal.ext.new('', '', '1.0.0');
    seal.ext.register(ext);
    
    const cmdE = seal.ext.newCmdItemInfo();
    cmdE.name = '';
    cmdE.help = '';

    cmdE.solve = (ctx, msg, cmdArgs) => {
        // TODO: 指令的具体逻辑

    };

    // 将命令注册到扩展中
    ext.cmdMap[''] = cmdE;

    
}