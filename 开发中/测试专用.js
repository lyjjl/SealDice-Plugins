// ==UserScript==
// @name         测试专用插件
// @author       lyjjl
// @version      1.0.0
// @description  一个专门用来做测试的插件，插件应当尽量使用 try-catch 包裹，确保可以捕获错误
// @timestamp    0
// @license      MIT
// @homepageURL  https://github.com/lyjjl
// ==/UserScript==

// ################################################
// ##### ⚠警告 : 测试文件 , 切勿下载 , 没有好处 #####
// ################################################

let ext = seal.ext.find('TEST');
if (!ext) {
    ext = seal.ext.new('TEST', 'lyjjl', '1.0.0');

    const cmdTEST = seal.ext.newCmdItemInfo();
    cmdTEST.name = 'test';
    cmdTEST.help = '执行测试指令';

    cmdTEST.solve = (ctx, msg, cmdArgs) => {
        // TODO: 指令的具体逻辑
        try {
            let result;
            let method = cmdArgs.getArgN(1);
            let lat = cmdArgs.getArgN(2);
            let lon = cmdArgs.getArgN(3);
            let alt = cmdArgs.getArgN(4);
            switch (method) {
                /*
                 * - wgs84ToGcj02(lat, lon): WGS84 转 GCJ02
                 * - gcj02ToWgs84(lat, lon): GCJ02 转 WGS84（迭代逼近法，精度约 1e-6 度）
                 * - gcj02ToBd09(lat, lon): GCJ02 转 BD09
                 * - bd09ToGcj02(lat, lon): BD09 转 GCJ02
                 * - wgs84ToEcef(lat, lon, alt): WGS84 转 ECEF（默认海拔 0 米）
                 * - ecefToWgs84(x, y, z): ECEF 转 WGS84
                */
                case 'wgs84togcj02':
                    result = CoordinateConverter.wgs84ToGcj02(lat, lon);
                case 'gcj02towgs84':
                    result = CoordinateConverter.gcj02ToWgs84(lat, lon);
                case 'gcj02tobd09':
                    result = CoordinateConverter.gcj02ToBd09(lat, lon);
                case 'bd09togcj02':
                    result = CoordinateConverter.bd09ToGcj02(lat, lon);
                case 'wgs84toecef':
                    result = CoordinateConverter.wgs84ToEcef(lat, lon, alt || 0);
                case 'eceftowgs84':
                    result = CoordinateConverter.ecefToWgs84(lat, lon, alt);
                    // 这里 lat, lon, alt 是 ECEF 坐标的 x, y, z
            }
        } catch (e) {
            console.error('[测试插件] 错误：', e);
        }
        seal.ctx.seal.replyToSender(ctx, msg, result);
    };

    // 将命令注册到扩展中
    ext.cmdMap['test'] = cmdTEST;

    seal.ext.register(ext);
}

