// ==UserScript==
// @name         QzoneAPI
// @author       某人
// @version      1.0.0
// @description  QQ 空间 API
// @timestamp    0
// @license      MIT
// @homepageURL  https://github.com/
// ==/UserScript==

let ext = seal.ext.find('QzoneAPI');
if (!ext) {
    ext = seal.ext.new('QzoneAPI', '某人', '1.0.0');
    seal.ext.register(ext);
    // 别看了，占位的

}