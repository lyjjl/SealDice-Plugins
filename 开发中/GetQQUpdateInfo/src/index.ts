import { getInfo, SendConfig } from "./send";

const DEFAULT_SHIPLY_PUBLIC_KEY_BASE64 =
  "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC/rT6ULqXC32dgz4t/Vv4WS9pTks5Z2fPmbTHIXEVeiOEnjOpPBHOi1AUz+Ykqjk11ZyjidUwDyIaC/VtaC5Z7Bt/W+CFluDer7LiiDa6j77if5dbcvWUrJbgvhKqaEhWnMDXT1pAG2KxL/pNFAYguSLpOh9pK97G8umUMkkwWkwIDAQAB";
const DEFAULT_OUTPUT_TEMPLATE =
  "标题: {{title}}\\n" +
  "发布时间: {{publishTime}}\\n" +
  "更新时间: {{updateTime}}\\n" +
  "状态: {{status}}\\n" +
  "提醒类型: {{remindType}}\\n" +
  "弹窗次数: {{popTimes}}\\n" +
  "弹窗间隔(ms): {{popInterval}}\\n" +
  "\\f" +
  "版本: {{apkBasicInfos[0].version}}\\n" +
  "版本号: {{apkBasicInfos[0].versionCode}}\\n" +
  "安装包: {{apkBasicInfos[0].pkgName}}\\n" +
  "包大小: {{apkBasicInfos[0].pkgSize}}\\n" +
  "下载地址: {{apkBasicInfos[0].downloadUrl}}\\n" +
  "MD5: {{apkBasicInfos[0].md5}}\\n" +
  "\\f" +
  "提示标题: {{clientInfo.title}}\\n" +
  "提示文案: {{clientInfo.description}}";

function getConfig(ext: seal.ExtInfo): SendConfig {
  const publicKey = seal.ext.getStringConfig(ext, "shiply_public_key_base64");
  return {
    shiplyDefaultSdkVersion: seal.ext.getStringConfig(ext, "shiply_default_sdk_version"),
    shiplyAppidQq: seal.ext.getStringConfig(ext, "shiply_appid_qq"),
    shiplyAppidTim: seal.ext.getStringConfig(ext, "shiply_appid_tim"),
    shiplySignIdQq: seal.ext.getStringConfig(ext, "shiply_sign_id_qq"),
    shiplySignIdTim: seal.ext.getStringConfig(ext, "shiply_sign_id_tim"),
    androidQqPackageName: seal.ext.getStringConfig(ext, "android_qq_package_name"),
    androidTimPackageName: seal.ext.getStringConfig(ext, "android_tim_package_name"),
    shiplyPublicKeyBase64:
      typeof publicKey === "string" && publicKey.trim().length > 32
        ? publicKey
        : DEFAULT_SHIPLY_PUBLIC_KEY_BASE64,
    shiplyEndpoint: seal.ext.getStringConfig(ext, "shiply_endpoint"),
    defaultCustomAppid: seal.ext.getStringConfig(ext, "default_custom_appid"),
    fixedContext: seal.ext.getStringConfig(ext, "fixed_context"),
  };
}

function normalizeUin(raw: string): string {
  const s = String(raw || "").trim();
  const matched = s.match(/(\d{4,})$/);
  return matched ? matched[1] : s;
}

function getByPath(data: unknown, path: string): unknown {
  const tokens: Array<string | number> = [];
  const re = /([^[.\]]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(path)) !== null) {
    if (m[1]) {
      tokens.push(m[1]);
    } else if (m[2]) {
      tokens.push(Number(m[2]));
    }
  }

  let cur: unknown = data;
  for (const token of tokens) {
    if (cur === null || cur === undefined) {
      return "";
    }
    if (typeof token === "number") {
      if (!Array.isArray(cur)) {
        return "";
      }
      cur = cur[token];
      continue;
    }
    if (typeof cur !== "object") {
      return "";
    }
    cur = (cur as Record<string, unknown>)[token];
  }
  return cur;
}

function renderTemplate(tpl: string, data: unknown): string {
  return String(tpl || "").replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, rawPath: string) => {
    const v = getByPath(data, rawPath.trim());
    if (v === null || v === undefined) {
      return "";
    }
    if (typeof v === "object") {
      return JSON.stringify(v);
    }
    return String(v);
  });
}

function normalizeFormatMarkers(text: string): string {
  return String(text || "")
    .replace(/%n/g, "\\n")
    .replace(/%f/g, "\\f");
}

function registerAllConfigs(ext: seal.ExtInfo): void {
  seal.ext.registerStringConfig(ext, "shiply_default_sdk_version", "1.3.36-RC03", "Shiply 默认 sdkVersion");
  seal.ext.registerStringConfig(ext, "shiply_appid_qq", "4cd6974be1", "QQ appID");
  seal.ext.registerStringConfig(ext, "shiply_appid_tim", "ad6b501b0e", "TIM appID");
  seal.ext.registerStringConfig(ext, "shiply_sign_id_qq", "0ccc46ca-154c-4c6b-8b0b-4d8537ffcbcc", "QQ signID");
  seal.ext.registerStringConfig(ext, "shiply_sign_id_tim", "33641818-aee7-445a-82d4-b7d0bce3a85a", "TIM signID");
  seal.ext.registerStringConfig(ext, "android_qq_package_name", "com.tencent.mobileqq", "QQ 包名");
  seal.ext.registerStringConfig(ext, "android_tim_package_name", "com.tencent.tim", "TIM 包名");
  seal.ext.registerStringConfig(ext, "shiply_public_key_base64", DEFAULT_SHIPLY_PUBLIC_KEY_BASE64, "Shiply RSA 公钥（Base64）");
  seal.ext.registerStringConfig(ext, "shiply_endpoint", "https://rdelivery.qq.com/v3/config/batchpull", "Shiply 接口地址");
  seal.ext.registerStringConfig(ext, "default_custom_appid", "537230561", "默认 customProperties.appid");
  seal.ext.registerStringConfig(
    ext,
    "output_template",
    DEFAULT_OUTPUT_TEMPLATE,
    "输出模板，支持 {{a.b[0].c}} 占位符；渲染后会再经过 seal.format",
  );
  seal.ext.registerStringConfig(
    ext,
    "fixed_context",
    "H4sIAAAAAAAA/+Li5ni5T1WIVaBT1INRS8HS0MwyMdnCwMzQMCklxdQ81cTC1MzIIDnV0DIxydLYGAAAAP//AQAA//+OoFcLLwAAAA==",
    "固定 context",
  );
  seal.ext.registerBoolConfig(ext, "debug", false, "开启后输出跟踪级日志");
}

function main() {
  // 注册扩展
  let ext = seal.ext.find("GetQQUpdateInfo");
  if (!ext) {
    ext = seal.ext.new("GetQQUpdateInfo", "某人", "1.0.0");
    seal.ext.register(ext);
  }
  registerAllConfigs(ext);

  // 编写指令
  const cmdSeal = seal.ext.newCmdItemInfo();
  cmdSeal.name = "取QQ更新信息";
  cmdSeal.help = "获取QQ更新信息 .取QQ更新信息 help // 获取帮助";

  cmdSeal.solve = (ctx, msg, cmdArgs) => {
    let val = cmdArgs.getArgN(1);
    switch (val) {
      case "help": {
        let helpMsg =
          `USAGE:\n` +
          `  .取QQ更新信息 <当前QQ版本> [options]\n` +
          `OPTIONS:\n` +
          `  --tim // 获取TIM更新信息\n` +
          `  --appid=<数字> // 自定义请求 appid\n` +
          `  --uin=<QQ号> // 指定请求用 UIN（默认取发送者ID）\n` +
          `  --raw // 不格式化，直接输出原始JSON`;
        seal.replyToSender(ctx, msg, helpMsg);
        return seal.ext.newCmdExecuteResult(true);
      }
      default: {
        const version = String(val || "").trim();
        if (!version) {
          seal.replyToSender(ctx, msg, "参数错误：请提供 QQ 版本号。示例：.取QQ更新信息 9.1.65");
          return seal.ext.newCmdExecuteResult(true);
        }

        const appidKwarg = cmdArgs.getKwarg("appid");
        const uinKwarg = cmdArgs.getKwarg("uin");
        const timKwarg = cmdArgs.getKwarg("tim");
        const rawKwarg = cmdArgs.getKwarg("raw");
        const fallbackUserId = msg.sender?.userId || ctx.player?.userId || "";
        const uinRaw =
          uinKwarg && uinKwarg.valueExists && uinKwarg.value
            ? uinKwarg.value
            : fallbackUserId;
        const uin = normalizeUin(uinRaw);

        const params = {
          uin,
          version,
          targetApp: timKwarg && timKwarg.asBool ? "TIM" : "QQ",
        } as {
          uin: string;
          version: string;
          targetApp: "QQ" | "TIM";
          appid?: string;
        };

        if (appidKwarg && appidKwarg.valueExists && appidKwarg.value) {
          params.appid = appidKwarg.value;
        }

        const config = getConfig(ext);
        const debug = seal.ext.getBoolConfig(ext, "debug");
        const traces: string[] = [];
        const trace = (message: string) => {
          traces.push(message);
        };
        void (async () => {
          if (debug) {
            trace(
              `start: version=${params.version}, target=${params.targetApp}, uin=${params.uin}, endpoint=${config.shiplyEndpoint}`,
            );
          }
          const result = await getInfo(params, config, debug ? { trace } : undefined);
          if (debug) {
            console.log(`[GetQQUpdateInfo][trace]\n${traces.map((v) => `- ${v}`).join("\n")}`);
          }
          if (!result.status) {
            seal.replyToSender(ctx, msg, "获取失败：接口返回失败或数据结构异常。");
            return;
          }
          if (rawKwarg && rawKwarg.asBool) {
            seal.replyToSender(ctx, msg, JSON.stringify(result.data, null, 2));
            return;
          }
          const tpl = seal.ext.getStringConfig(ext, "output_template") || DEFAULT_OUTPUT_TEMPLATE;
          const rendered = renderTemplate(tpl, result.data);
          const formatted = seal.format(ctx, normalizeFormatMarkers(rendered));
          seal.replyToSender(ctx, msg, formatted);
        })();

        return seal.ext.newCmdExecuteResult(true);
      }
    }
  };

  // 注册命令
  ext.cmdMap["取QQ更新信息"] = cmdSeal;
}

main();
