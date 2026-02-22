import CryptoJS from "crypto-js";
import pako from "pako";

type JsonObject = Record<string, unknown>;

export type SendParams = {
  uin: string;
  version: string;
  appid?: string;
  targetApp?: "QQ" | "TIM" | string;
};

export type SendResult = {
  status: boolean;
  data: JsonObject;
};

export type SendConfig = {
  shiplyDefaultSdkVersion: string;
  shiplyAppidQq: string;
  shiplyAppidTim: string;
  shiplySignIdQq: string;
  shiplySignIdTim: string;
  androidQqPackageName: string;
  androidTimPackageName: string;
  shiplyPublicKeyBase64: string;
  shiplyEndpoint: string;
  defaultCustomAppid: string;
  fixedContext: string;
};

export type SendTrace = (message: string) => void;

export type GetInfoOptions = {
  trace?: SendTrace;
};

function isValidParam(value: string | undefined): boolean {
  return value !== undefined && value !== "" && value !== "0";
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function generateUuidV4(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  const cryptoObj = (globalThis as any).crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    cryptoObj.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < length; i += 1) {
    out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

function uint8ToWordArray(data: Uint8Array): any {
  const words: number[] = [];
  for (let i = 0; i < data.length; i += 1) {
    words[i >>> 2] = (words[i >>> 2] || 0) | (data[i] << (24 - (i % 4) * 8));
  }
  return CryptoJS.lib.WordArray.create(words, data.length);
}

function wordArrayToUint8(wordArray: any): Uint8Array {
  const sigBytes = wordArray.sigBytes;
  const words = wordArray.words;
  const out = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i += 1) {
    out[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return out;
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;

    out += BASE64_ALPHABET[(n >>> 18) & 0x3f];
    out += BASE64_ALPHABET[(n >>> 12) & 0x3f];
    out += hasB1 ? BASE64_ALPHABET[(n >>> 6) & 0x3f] : "=";
    out += hasB2 ? BASE64_ALPHABET[n & 0x3f] : "=";
  }
  return out;
}

function base64ToBytes(base64Text: string): Uint8Array {
  const text = String(base64Text || "")
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  if (text.length === 0) {
    return new Uint8Array(0);
  }
  if (text.length % 4 !== 0) {
    throw new Error("invalid base64 length");
  }

  const map = new Int16Array(256);
  for (let i = 0; i < map.length; i += 1) {
    map[i] = -1;
  }
  for (let i = 0; i < BASE64_ALPHABET.length; i += 1) {
    map[BASE64_ALPHABET.charCodeAt(i)] = i;
  }

  let pad = 0;
  if (text.endsWith("==")) {
    pad = 2;
  } else if (text.endsWith("=")) {
    pad = 1;
  }
  const out = new Uint8Array((text.length / 4) * 3 - pad);

  let outPos = 0;
  for (let i = 0; i < text.length; i += 4) {
    const c0 = text.charCodeAt(i);
    const c1 = text.charCodeAt(i + 1);
    const c2 = text.charCodeAt(i + 2);
    const c3 = text.charCodeAt(i + 3);

    const v0 = map[c0];
    const v1 = map[c1];
    const v2 = c2 === 61 ? 0 : map[c2];
    const v3 = c3 === 61 ? 0 : map[c3];

    if (v0 < 0 || v1 < 0 || (c2 !== 61 && v2 < 0) || (c3 !== 61 && v3 < 0)) {
      throw new Error("invalid base64 character");
    }

    const n = (v0 << 18) | (v1 << 12) | (v2 << 6) | v3;
    out[outPos++] = (n >>> 16) & 0xff;
    if (c2 !== 61) {
      out[outPos++] = (n >>> 8) & 0xff;
    }
    if (c3 !== 61) {
      out[outPos++] = n & 0xff;
    }
  }

  return out;
}

function md5Hex(text: string): string {
  return CryptoJS.MD5(text).toString(CryptoJS.enc.Hex);
}

function aesCtrEncryptToBase64(plainText: string, keyBytes: Uint8Array): string {
  const key = uint8ToWordArray(keyBytes);
  const iv = CryptoJS.lib.WordArray.create([0, 0, 0, 0], 16);
  const plaintext = CryptoJS.enc.Utf8.parse(plainText);
  const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
    iv,
    mode: CryptoJS.mode.CTR,
    padding: CryptoJS.pad.NoPadding,
  });
  return encrypted.ciphertext.toString(CryptoJS.enc.Base64);
}

function aesCtrDecrypt(cipherBytes: Uint8Array, keyBytes: Uint8Array): Uint8Array {
  const key = uint8ToWordArray(keyBytes);
  const iv = CryptoJS.lib.WordArray.create([0, 0, 0, 0], 16);
  const ciphertext = uint8ToWordArray(cipherBytes);
  const decrypted = CryptoJS.AES.decrypt({ ciphertext }, key, {
    iv,
    mode: CryptoJS.mode.CTR,
    padding: CryptoJS.pad.NoPadding,
  });
  return wordArrayToUint8(decrypted);
}

function getCipherText(responseText: string): string | null {
  const parsed = parseMaybeJson(responseText);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const rspList = (parsed as JsonObject).rsp_list;
  const items = Array.isArray(rspList)
    ? rspList
    : rspList && typeof rspList === "object"
      ? Object.values(rspList as JsonObject)
      : [];

  for (const rawItem of items) {
    const item = parseMaybeJson(rawItem);
    if (!item || typeof item !== "object") {
      continue;
    }
    const cipherText = (item as JsonObject).cipher_text;
    if (typeof cipherText === "string" && cipherText.length > 0) {
      return cipherText;
    }
  }
  return null;
}

function bytesPreviewHex(data: Uint8Array, start: number, length: number): string {
  const s = Math.max(0, start);
  const e = Math.min(data.length, s + length);
  const out: string[] = [];
  for (let i = s; i < e; i += 1) {
    out.push(data[i].toString(16).padStart(2, "0"));
  }
  return out.join(" ");
}

function readDerLength(
  data: Uint8Array,
  pos: number,
  label: string,
  trace?: SendTrace,
): { length: number; nextPos: number } {
  if (pos < 0 || pos >= data.length) {
    throw new Error(`invalid DER length out-of-range: label=${label}, pos=${pos}, dataLen=${data.length}`);
  }
  const first = data[pos];
  if (trace) {
    trace(`DER length: label=${label}, pos=${pos}, first=0x${first.toString(16)}`);
  }
  if ((first & 0x80) === 0) {
    return { length: first, nextPos: pos + 1 };
  }
  const count = first & 0x7f;
  if (count < 1 || count > 4) {
    throw new Error(
      `invalid DER length: label=${label}, pos=${pos}, first=0x${first.toString(16)}, count=${count}, dataLen=${data.length}, preview=${bytesPreviewHex(data, pos - 4, 12)}`,
    );
  }
  if (pos + count >= data.length) {
    throw new Error(
      `invalid DER length truncated: label=${label}, pos=${pos}, count=${count}, dataLen=${data.length}, preview=${bytesPreviewHex(data, pos - 4, 12)}`,
    );
  }
  let length = 0;
  for (let i = 0; i < count; i += 1) {
    length = (length << 8) | data[pos + 1 + i];
  }
  if (trace) {
    trace(`DER length parsed: label=${label}, length=${length}, nextPos=${pos + 1 + count}`);
  }
  return { length, nextPos: pos + 1 + count };
}

function bytesToBigInt(bytes: Uint8Array): any {
  const bi = (globalThis as any).BigInt;
  if (typeof bi !== "function") {
    throw new Error("BigInt unavailable");
  }
  let out = bi(0);
  const bi256 = bi(256);
  for (let i = 0; i < bytes.length; i += 1) {
    out = out * bi256 + bi(bytes[i]);
  }
  return out;
}

function bigIntToBytes(value: any, length: number): Uint8Array {
  const bi = (globalThis as any).BigInt;
  const bi256 = bi(256);
  const out = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i >= 0; i -= 1) {
    out[i] = Number(v % bi256);
    v = v / bi256;
  }
  return out;
}

function modPow(base: any, exp: any, mod: any): any {
  const bi = (globalThis as any).BigInt;
  let result = bi(1);
  let b = base % mod;
  let e = exp;
  const zero = bi(0);
  const one = bi(1);
  const two = bi(2);
  while (e > zero) {
    if (e % two === one) {
      result = (result * b) % mod;
    }
    e = e / two;
    b = (b * b) % mod;
  }
  return result;
}

function normalizePublicKeyBase64(input: string): string {
  let normalized = String(input || "")
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");

  const parts = (normalized.match(/[A-Za-z0-9+/=_-]+/g) || []).filter((p) => p !== "+");
  normalized = parts.join("").replace(/-/g, "+").replace(/_/g, "/");

  const mod = normalized.length % 4;
  if (mod === 2) {
    normalized += "==";
  } else if (mod === 3) {
    normalized += "=";
  }
  return normalized;
}

function parseRsaPublicKeyFromSpki(publicKeyBase64: string, trace?: SendTrace): { n: any; e: any; keySize: number } {
  const normalized = normalizePublicKeyBase64(publicKeyBase64);
  if (!normalized || normalized.length < 32) {
    throw new Error("invalid public key content");
  }
  if (trace) {
    trace(`public key normalized prefix=${normalized.slice(0, 24)}...`);
  }
  const spki = base64ToBytes(normalized);
  if (trace) {
    trace(
      `public key decoded bytes len=${spki.length}, head=${bytesPreviewHex(spki, 0, 12)}`,
    );
  }
  let pos = 0;

  if (spki[pos] !== 0x30) {
    throw new Error("invalid SPKI: expected SEQUENCE");
  }
  let rootLenInfo = readDerLength(spki, pos + 1, "SPKI.SEQUENCE", trace);
  pos = rootLenInfo.nextPos;
  const rootEnd = pos + rootLenInfo.length;
  if (trace) {
    trace(`SPKI root: pos=${pos}, rootEnd=${rootEnd}`);
  }

  if (spki[pos] !== 0x30) {
    throw new Error("invalid SPKI: expected AlgorithmIdentifier");
  }
  const algLenInfo = readDerLength(spki, pos + 1, "SPKI.AlgorithmIdentifier", trace);
  pos = algLenInfo.nextPos + algLenInfo.length;
  if (trace) {
    trace(`AlgorithmIdentifier end pos=${pos}`);
  }

  if (spki[pos] !== 0x03) {
    throw new Error("invalid SPKI: expected BIT STRING");
  }
  const bitLenInfo = readDerLength(spki, pos + 1, "SPKI.subjectPublicKey(BIT STRING)", trace);
  pos = bitLenInfo.nextPos;
  const bitEnd = pos + bitLenInfo.length;
  if (spki[pos] !== 0x00) {
    throw new Error("invalid SPKI: non-zero unused bits");
  }
  pos += 1;
  if (trace) {
    trace(`BIT STRING payload: pos=${pos}, bitEnd=${bitEnd}`);
  }

  if (spki[pos] !== 0x30) {
    throw new Error("invalid RSAPublicKey: expected SEQUENCE");
  }
  const rsaLenInfo = readDerLength(spki, pos + 1, "RSAPublicKey.SEQUENCE", trace);
  pos = rsaLenInfo.nextPos;
  const rsaEnd = pos + rsaLenInfo.length;
  if (trace) {
    trace(`RSAPublicKey sequence: pos=${pos}, rsaEnd=${rsaEnd}`);
  }

  if (spki[pos] !== 0x02) {
    throw new Error("invalid RSAPublicKey: expected modulus INTEGER");
  }
  const nLenInfo = readDerLength(spki, pos + 1, "RSAPublicKey.modulus(INTEGER)", trace);
  pos = nLenInfo.nextPos;
  let nBytes = spki.slice(pos, pos + nLenInfo.length);
  pos += nLenInfo.length;
  if (nBytes.length > 0 && nBytes[0] === 0x00) {
    nBytes = nBytes.slice(1);
  }
  if (trace) {
    trace(`modulus bytes len=${nBytes.length}, pos=${pos}`);
  }

  if (spki[pos] !== 0x02) {
    throw new Error("invalid RSAPublicKey: expected exponent INTEGER");
  }
  const eLenInfo = readDerLength(spki, pos + 1, "RSAPublicKey.exponent(INTEGER)", trace);
  pos = eLenInfo.nextPos;
  let eBytes = spki.slice(pos, pos + eLenInfo.length);
  pos += eLenInfo.length;
  if (eBytes.length > 0 && eBytes[0] === 0x00) {
    eBytes = eBytes.slice(1);
  }
  if (trace) {
    trace(`exponent bytes len=${eBytes.length}, pos=${pos}, value=${bytesPreviewHex(eBytes, 0, eBytes.length)}`);
  }
  if (pos !== rsaEnd || bitEnd !== rootEnd) {
    throw new Error("invalid SPKI structure");
  }

  const n = bytesToBigInt(nBytes);
  const e = bytesToBigInt(eBytes);
  return { n, e, keySize: nBytes.length };
}

function rsaEncryptPkcs1v15ToBase64(data: Uint8Array, publicKeyBase64: string, trace?: SendTrace): string {
  const bi = (globalThis as any).BigInt;
  if (typeof bi !== "function") {
    throw new Error("BigInt unavailable");
  }
  const { n, e, keySize } = parseRsaPublicKeyFromSpki(publicKeyBase64, trace);
  if (data.length > keySize - 11) {
    throw new Error("RSA message too long");
  }

  const psLength = keySize - data.length - 3;
  const em = new Uint8Array(keySize);
  em[0] = 0x00;
  em[1] = 0x02;
  for (let i = 0; i < psLength; i += 1) {
    let b = 0;
    while (b === 0) {
      b = randomBytes(1)[0];
    }
    em[2 + i] = b;
  }
  em[2 + psLength] = 0x00;
  em.set(data, 3 + psLength);

  const m = bytesToBigInt(em);
  const c = modPow(m, e, n);
  const out = bigIntToBytes(c, keySize);
  return bytesToBase64(out);
}

function getNormalizedPublicKeyLength(publicKeyBase64: string): number {
  return normalizePublicKeyBase64(publicKeyBase64).length;
}

function buildPayload(params: SendParams, config: SendConfig): JsonObject {
  const timestamp = Math.floor(Date.now() / 1000);
  const isTim = String(params.targetApp || "QQ").toUpperCase() === "TIM";
  const appID = isTim ? config.shiplyAppidTim : config.shiplyAppidQq;
  const signID = isTim ? config.shiplySignIdTim : config.shiplySignIdQq;
  const bundleId = isTim ? config.androidTimPackageName : config.androidQqPackageName;
  const signRaw = `10016$${appID}$4$$${timestamp}$${params.uin}$rdelivery${signID}`;

  return {
    systemID: "10016",
    appID,
    sign: md5Hex(signRaw),
    timestamp,
    pullType: 4,
    target: 1,
    pullParams: {
      properties: {
        platform: 2,
        language: "zh",
        sdkVersion: config.shiplyDefaultSdkVersion,
        guid: params.uin,
        appVersion: params.version,
        osVersion: "35",
        is64Bit: true,
        bundleId,
        uniqueId: generateUuidV4(),
        model: "2304FPN6DC",
      },
      isDebugPackage: false,
      customProperties: {
        appid: params.appid || config.defaultCustomAppid,
      },
    },
    taskChecksum: "0",
    context: config.fixedContext,
  };
}

export async function getInfo(
  params: SendParams,
  config: SendConfig,
  options?: GetInfoOptions,
): Promise<SendResult> {
  const trace = options && options.trace ? options.trace : () => {};
  if (typeof fetch !== "function") {
    trace("runtime check failed: fetch not ready");
    return { status: false, data: {} };
  }

  if (!isValidParam(params.uin) || !isValidParam(params.version)) {
    trace(`param check failed: uin="${params.uin}", version="${params.version}"`);
    return { status: false, data: {} };
  }

  try {
    trace("build payload started");
    trace(`public key raw length=${String(config.shiplyPublicKeyBase64 || "").length}`);
    trace(`public key raw prefix=${String(config.shiplyPublicKeyBase64 || "").slice(0, 24)}...`);
    trace(`public key normalized length=${getNormalizedPublicKeyLength(config.shiplyPublicKeyBase64)}`);
    const aesKey = randomBytes(16);
    const payload = buildPayload(params, config);
    const payloadText = JSON.stringify(payload, null, 4);
    const encryptedPayload = aesCtrEncryptToBase64(payloadText, aesKey);
    const encryptedKey = rsaEncryptPkcs1v15ToBase64(aesKey, config.shiplyPublicKeyBase64, trace);
    trace(`payload encrypted: payloadLength=${payloadText.length}`);

    const postData = {
      req_list: [
        {
          cipher_text: encryptedPayload,
          public_key_version: 1,
          pull_key: encryptedKey,
        },
      ],
    };

    const response = await fetch(config.shiplyEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip",
      },
      body: JSON.stringify(postData),
    });
    trace(`http response: status=${response.status}`);

    if (!response.ok) {
      trace("http response not ok");
      return { status: false, data: {} };
    }

    const responseText = await response.text();
    trace(`response text length=${responseText.length}`);
    const encryptedResponseBase64 = getCipherText(responseText);
    if (!encryptedResponseBase64) {
      trace("cipher_text not found in response");
      return { status: false, data: {} };
    }

    const encryptedResponse = base64ToBytes(encryptedResponseBase64);
    const decrypted = aesCtrDecrypt(encryptedResponse, aesKey);
    const unzippedText = pako.ungzip(decrypted, { to: "string" }) as string;
    trace(`ungzip success: length=${unzippedText.length}`);
    const shiplyDataRaw = parseMaybeJson(unzippedText);

    if (!shiplyDataRaw || typeof shiplyDataRaw !== "object") {
      trace("shiplyData parse failed");
      return { status: false, data: {} };
    }

    const shiplyData = shiplyDataRaw as JsonObject;
    if (shiplyData.msg === "request illegal") {
      trace('shiply response rejected: "request illegal"');
      return { status: false, data: {} };
    }

    const configs = shiplyData.configs;
    if (!Array.isArray(configs) || configs.length < 1) {
      trace("shiply configs missing or empty");
      return { status: false, data: {} };
    }

    const first = configs[0];
    if (!first || typeof first !== "object") {
      trace("shiply first config item invalid");
      return { status: false, data: {} };
    }

    const valueContent = parseMaybeJson((first as JsonObject).value);
    if (!valueContent || typeof valueContent !== "object") {
      trace("value field parse failed");
      return { status: false, data: {} };
    }

    const configValue = parseMaybeJson((valueContent as JsonObject).config_value);
    if (!configValue || typeof configValue !== "object") {
      trace("config_value parse failed");
      return { status: false, data: {} };
    }

    trace("getInfo completed");
    return { status: true, data: configValue as JsonObject };
  } catch (error) {
    trace(`exception: ${error instanceof Error ? error.message : String(error)}`);
    return { status: false, data: {} };
  }
}
