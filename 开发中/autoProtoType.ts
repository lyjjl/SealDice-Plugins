type Json = Record<string, any>;
type ProtoNames = string[];

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function safeTrimSlash(u: string): string {
  return u.endsWith("/") ? u.slice(0, -1) : u;
}

function mapScheme(u: URL, to: "http" | "ws"): URL {
  const out = new URL(u.toString());
  if (to === "http") out.protocol = (u.protocol === "wss:" ? "https:" : "http:");
  else out.protocol = (u.protocol === "https:" ? "wss:" : "ws:");
  return out;
}

function deriveHttpFromWs(wsUrl: string): string {
  if (!wsUrl) return "";
  const u = new URL(wsUrl);
  return safeTrimSlash(mapScheme(u, "http").toString());
}

function deriveWsFromHttp(httpUrl: string): string {
  if (!httpUrl) return "";
  const u = new URL(httpUrl);
  return safeTrimSlash(mapScheme(u, "ws").toString());
}

function joinUrl(base: string, path: string): string {
  const b = base.endsWith("/") ? base : base + "/";
  return new URL(path.replace(/^\//, ""), b).toString();
}

function withSearchParam(url: string, k: string, v: string): string {
  const u = new URL(url);
  u.searchParams.set(k, v);
  return u.toString();
}

function maskToken(t: string): string {
  if (!t) return "";
  if (t.length <= 6) return "***";
  return `${t.slice(0, 2)}***${t.slice(-2)}`;
}

function maskUrl(u: string): string {
  try {
    const url = new URL(u);
    for (const k of ["access_token", "token", "debug"]) {
      if (url.searchParams.has(k)) url.searchParams.set(k, "***");
    }
    return url.toString();
  } catch {
    return u.replace(/(access_token|token|debug)=([^&]+)/g, "$1=***");
  }
}

function briefJson(x: any, maxLen = 1200): string {
  try {
    const s = JSON.stringify(x);
    return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
  } catch {
    return String(x);
  }
}

function parseBool(v: string | null): boolean | null {
  if (v == null) return null;
  const s = v.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return null;
}

function normalizeInputUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) return s;
  return `http://${s}`;
}

// Milky：把 /api 或 /event 之后裁掉
function stripAfterMilkyAnchors(input: string): string {
  const u = new URL(input);
  let p = u.pathname.replace(/\/+$/, "");

  const idxApi = p.indexOf("/api");
  const idxEvent = p.indexOf("/event");
  let cut = p.length;
  if (idxApi !== -1) cut = Math.min(cut, idxApi);
  if (idxEvent !== -1) cut = Math.min(cut, idxEvent);

  p = p.slice(0, cut).replace(/\/+$/, "");
  u.pathname = p || "/";
  u.search = "";
  u.hash = "";
  return safeTrimSlash(u.toString());
}

// OneBot：裁掉末尾 /api 或 /event（但不清 search，由上层统一清）
function stripTailOneBotAnchors(input: string): string {
  const u = new URL(input);
  let p = u.pathname.replace(/\/+$/, "");
  if (p.endsWith("/api")) p = p.slice(0, -4);
  if (p.endsWith("/event")) p = p.slice(0, -6);
  p = p.replace(/\/+$/, "");
  u.pathname = p || "/";
  u.hash = "";
  return safeTrimSlash(u.toString());
}

function stripKnownParamsKeepBase(input: string): string {
  const u = new URL(input);
  for (const k of ["token", "access_token", "debug"]) {
    u.searchParams.delete(k);
  }
  u.search = u.searchParams.toString() ? `?${u.searchParams.toString()}` : "";
  return safeTrimSlash(u.toString());
}

function buildReturnNames(kind: "milky" | "llbot" | "napcat" | "lagrange" | "unknown"): ProtoNames {
  switch (kind) {
    case "milky":
      return ["Milky", "Milky协议", "MilkyProtocol"];
    case "llbot":
      return ["LLBot", "LuckyLilliaBot", "Lucky Lillia Bot", "幸运莉莉娅"];
    case "napcat":
      return ["NapCat", "NapCatQQ", "NapCat.OneBot"];
    case "lagrange":
      return ["Lagrange", "Lagrange.OneBot", "LagrangeOneBot"];
    default:
      return ["Unknown", "OneBot", "Milky"];
  }
}

function isApiLikeResponse(j?: Json | null): boolean {
  if (!j || typeof j !== "object") return false;
  return typeof (j as any)["status"] === "string" && typeof (j as any)["retcode"] === "number";
}

function isOkResponse(j?: Json | null): boolean {
  if (!isApiLikeResponse(j)) return false;
  return (j as any).status === "ok" && (j as any).retcode === 0;
}

function looksLikeMilkyImplInfo(j?: Json | null): boolean {
  if (!isOkResponse(j)) return false;
  const d = (j as any).data;
  if (!d || typeof d !== "object") return false;
  return (
    typeof d.milky_version === "string" ||
    typeof d.impl_name === "string" ||
    typeof d.qq_protocol_type === "string"
  );
}

function looksLikeLagrangeVersionInfo(j?: Json | null): boolean {
  if (!isOkResponse(j)) return false;
  const d = (j as any).data;
  return !!d && typeof d === "object" && typeof d.nt_protocol === "string";
}

function looksLikeNapCatVersionInfo(j?: Json | null): boolean {
  if (!isOkResponse(j)) return false;
  const d = (j as any).data;
  const app = typeof d?.app_name === "string" ? d.app_name.toLowerCase() : "";
  return app.includes("napcat");
}

function isHttpUpgradeRequired(r: { status: number; text?: string }): boolean {
  if (r.status !== 426) return false;
  const t = (r.text || "").toLowerCase();
  return t.includes("upgrade required");
}

async function httpPostJson(
  url: string,
  body: any,
  token: string,
  mode: "milky" | "onebot",
  debug: boolean,
  dbg: (...args: any[]) => void,
  timeoutMs = 1800
): Promise<{ ok: boolean; status: number; json?: Json; text?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const finalUrl =
      mode === "onebot" && token ? withSearchParam(url, "access_token", token) : url;

    if (debug) {
      dbg("HTTP SEND", {
        mode,
        url: maskUrl(finalUrl),
        body,
        auth: token ? `Bearer ${maskToken(token)}` : "(none)",
      });
    }

    const res = await fetch(finalUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });

    const status = res.status;
    const ct = res.headers.get("content-type") || "";

    if (ct.includes("application/json")) {
      const j = (await res.json()) as Json;
      if (debug) dbg("HTTP RECV", { status, ok: res.ok, json: j });
      return { ok: res.ok, status, json: j };
    }

    const text = await res.text();
    try {
      const j = JSON.parse(text);
      if (debug) dbg("HTTP RECV", { status, ok: res.ok, json: j });
      return { ok: res.ok, status, json: j };
    } catch {
      if (debug) dbg("HTTP RECV", { status, ok: res.ok, text: text.slice(0, 1200) + (text.length > 1200 ? "…" : "") });
      return { ok: res.ok, status, text };
    }
  } catch (e) {
    if (debug) dbg("HTTP ERR", { url: maskUrl(url), err: String(e) });
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(t);
  }
}

function expandWsCandidates(rawWs: string): string[] {
  const root = stripTailOneBotAnchors(rawWs);
  const base = safeTrimSlash(root);

  const out = [
    base,
    safeTrimSlash(joinUrl(base, "/ws")),
    safeTrimSlash(joinUrl(base, "/api")),
    safeTrimSlash(joinUrl(base, "/event")),
    safeTrimSlash(joinUrl(base, "/onebot/ws")),
    safeTrimSlash(joinUrl(base, "/onebot/v11/ws")),
  ];
  return uniq(out);
}

function isOneBotLifecycleConnect(j: Json): boolean {
  return (
    j &&
    j.post_type === "meta_event" &&
    j.meta_event_type === "lifecycle" &&
    j.sub_type === "connect"
  );
}

function isMilkyEvent(j: Json): boolean {
  return typeof (j as any).event_type === "string" && (j as any).self_id != null;
}

function isOneBotEvent(j: Json): boolean {
  return typeof (j as any).post_type === "string" && (j as any).self_id != null;
}

function makeEchoMatcher(expectedEcho: string) {
  return (j: Json) => {
    if (isOneBotLifecycleConnect(j)) return false;
    if (j && typeof j === "object" && "echo" in j && (j as any).echo === expectedEcho) return true;
    // 只当作“可用回包”继续判断，但不在这里直接命中
    if (isApiLikeResponse(j)) return true;
    return false;
  };
}

async function wsWaitFor(
  wsUrl: string,
  token: string,
  sendPayload: any | null,
  predicate: (j: Json) => boolean,
  debug: boolean,
  dbg: (...args: any[]) => void,
  timeoutMs = 1800
): Promise<Json | null> {
  const baseCandidates = expandWsCandidates(wsUrl);

  const candidates: string[] = [];
  for (const base of baseCandidates) {
    candidates.push(base);
    if (token) {
      candidates.push(withSearchParam(base, "access_token", token));
      candidates.push(withSearchParam(base, "token", token));
    }
  }

  for (const u of uniq(candidates)) {
    if (debug) dbg("WS TRY", { url: maskUrl(u), send: sendPayload ?? "(none)" });

    const r = await new Promise<Json | null>((resolve) => {
      let done = false;
      const finish = (v: Json | null) => {
        if (done) return;
        done = true;
        resolve(v);
      };

      let ws: WebSocket;
      try {
        ws = new WebSocket(u);
      } catch (e) {
        if (debug) dbg("WS ERR", { url: maskUrl(u), err: String(e) });
        finish(null);
        return;
      }

      const timer = setTimeout(() => {
        try { ws.close(); } catch {}
        if (debug) dbg("WS TIMEOUT", { url: maskUrl(u) });
        finish(null);
      }, timeoutMs);

      ws.onopen = () => {
        if (sendPayload == null) return;
        try {
          ws.send(JSON.stringify(sendPayload));
          if (debug) dbg("WS SENT", { url: maskUrl(u), payload: sendPayload });
        } catch (e) {
          clearTimeout(timer);
          try { ws.close(); } catch {}
          if (debug) dbg("WS SEND ERR", { url: maskUrl(u), err: String(e) });
          finish(null);
        }
      };

      ws.onmessage = (ev: any) => {
        const raw = typeof ev.data === "string" ? ev.data : ev.data?.toString?.();
        if (!raw) return;

        let j: Json;
        try {
          j = JSON.parse(raw);
        } catch {
          return;
        }

        if (debug) dbg("WS RECV", { url: maskUrl(u), json: j });

        if (predicate(j)) {
          clearTimeout(timer);
          try { ws.close(); } catch {}
          finish(j);
        } else {
          if (debug) dbg("WS IGNORE", { url: maskUrl(u), reason: "predicate=false", json: j });
        }
      };

      ws.onerror = () => {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        if (debug) dbg("WS ERROR", { url: maskUrl(u) });
        finish(null);
      };

      ws.onclose = () => {
        clearTimeout(timer);
        finish(null);
      };
    });

    if (r) return r;
  }

  return null;
}

/**
 * 签名：url, ?token, ?debug
 * - url 支持 http/https/ws/wss，也可不带 scheme（默认按 http://）
 * - token/debug 若不显式传，会从 url query 读取：token/access_token/debug（显式参数优先）
 * - 关键改动：若输入是 http(s)，先 HTTP；只有 HTTP=426 或不可达才 fallback WS
 */
export async function autoProtoType(
  url: string = "",
  token: string = "",
  debug?: boolean
): Promise<string[]> {
  const raw = normalizeInputUrl(url);
  if (!raw) return buildReturnNames("unknown");

  let tokenFromUrl = "";
  let debugFromUrl: boolean | null = null;

  try {
    const u = new URL(raw);
    tokenFromUrl = u.searchParams.get("token") || u.searchParams.get("access_token") || "";
    debugFromUrl = parseBool(u.searchParams.get("debug"));
  } catch {
    // ignore
  }

  const finalToken = token?.trim() || tokenFromUrl.trim();
  const finalDebug = (debug ?? debugFromUrl ?? false) === true;

  const dbg = (...args: any[]) => {
    if (!finalDebug) return;
    console.log("[autoProtoType]", ...args);
  };

  const cleanUrl = stripKnownParamsKeepBase(raw);
  const u0 = new URL(cleanUrl);
  const inputProto = u0.protocol.toLowerCase();
  const inputTransport: "http" | "ws" =
    inputProto === "ws:" || inputProto === "wss:" ? "ws" : "http";

  let wsSeed = "";
  let httpSeed = "";

  if (inputTransport === "ws") {
    wsSeed = cleanUrl;
    httpSeed = deriveHttpFromWs(wsSeed);
  } else {
    httpSeed = cleanUrl;
    wsSeed = deriveWsFromHttp(httpSeed);
  }

  const httpCandidates = uniq([httpSeed].filter(Boolean).map((u) => safeTrimSlash(u)));
  const wsCandidates = uniq([wsSeed].filter(Boolean).map((u) => safeTrimSlash(u)));

  dbg("INPUT", {
    url: maskUrl(cleanUrl),
    inputTransport,
    derived: { ws: maskUrl(wsSeed), http: maskUrl(httpSeed) },
    token: finalToken ? maskToken(finalToken) : "(empty)",
    debug: finalDebug,
  });

  dbg("CANDIDATES", {
    httpCandidates: httpCandidates.map(maskUrl),
    wsCandidates: wsCandidates.map(maskUrl),
  });

  // ===== 1) 如果输入是 HTTP：先 HTTP 探测（不玩 WS） =====
  if (inputTransport === "http") {
    // 1.1 先试 OneBot：/get_version_info（一次就能识别 NapCat / Lagrange）
    const base = stripTailOneBotAnchors(httpCandidates[0]);
    const vApi = joinUrl(base, "/get_version_info");
    const v = await httpPostJson(vApi, {}, finalToken, "onebot", finalDebug, dbg, 1800);

    if (isHttpUpgradeRequired(v)) {
      dbg("HIT", { rule: "HTTP=426 => ws-only, fallback to WS", url: maskUrl(vApi) });
      // 走到 WS 分支
    } else if (isOkResponse(v.json)) {
      if (looksLikeNapCatVersionInfo(v.json)) {
        dbg("HIT", { rule: "NapCat HTTP: get_version_info data.app_name contains napcat", data: (v.json as any)?.data });
        return buildReturnNames("napcat");
      }
      if (looksLikeLagrangeVersionInfo(v.json)) {
        dbg("HIT", { rule: "Lagrange HTTP: get_version_info has nt_protocol", data: (v.json as any)?.data });
        return buildReturnNames("lagrange");
      }

      // 不是 NapCat/Lagrange，再试 LLBot 独有 API（必须成功才命中）
      const llApi = joinUrl(base, "/get_profile_like_me");
      const ll = await httpPostJson(llApi, { start: 0, count: 1 }, finalToken, "onebot", finalDebug, dbg, 1800);

      if (isOkResponse(ll.json)) {
        dbg("HIT", { rule: "LLBot HTTP: get_profile_like_me OK", data: (ll.json as any)?.data });
        return buildReturnNames("llbot");
      }

      dbg("MISS", {
        stage: "HTTP OneBot known but not matched",
        versionInfo: v.json ? briefJson(v.json) : "(none)",
        llbotProbe: ll.json ? briefJson(ll.json) : "(none)",
      });

      // 这里可以返回 generic OneBot，而不是 Unknown
      return ["OneBot11", "OneBot", "UnknownOneBot"];
    } else {
      dbg("MISS", { stage: "HTTP get_version_info not ok", status: v.status, json: v.json ? briefJson(v.json) : v.text ?? "(none)" });

      // 1.2 再试 Milky（有些用户给的是 /api 或者 Milky 的 http）
      const root = stripAfterMilkyAnchors(httpCandidates[0]);
      const mApi = joinUrl(root + "/api", "get_impl_info");
      const m = await httpPostJson(mApi, {}, finalToken, "milky", finalDebug, dbg, 1800);

      if (m.status === 401) {
        dbg("HIT", { rule: "Milky HTTP: status===401", url: maskUrl(mApi) });
        return buildReturnNames("milky");
      }
      if (looksLikeMilkyImplInfo(m.json)) {
        dbg("HIT", { rule: "Milky HTTP: looksLikeMilkyImplInfo", data: (m.json as any)?.data });
        return buildReturnNames("milky");
      }

      dbg("MISS", { stage: "HTTP Milky", status: m.status, json: m.json ? briefJson(m.json) : m.text ?? "(none)" });
      return buildReturnNames("unknown");
    }
  }

  // ===== 2) 输入是 WS，或 HTTP 判定 ws-only：走 WS 探测 =====
  // 2.1 WS peek：判 OneBot/Milky
  let wsFlavor: "milky" | "onebot" | "unknown" = "unknown";
  if (wsCandidates.length > 0) {
    const peek = await wsWaitFor(
      wsCandidates[0],
      finalToken,
      null,
      (j) => isMilkyEvent(j) || isOneBotEvent(j),
      finalDebug,
      dbg,
      1200
    );

    if (peek) {
      if (isMilkyEvent(peek)) {
        wsFlavor = "milky";
        dbg("HIT", { rule: "WS Peek => Milky event_type", sample: peek });
      } else if (isOneBotEvent(peek)) {
        wsFlavor = "onebot";
        dbg("HIT", { rule: "WS Peek => OneBot post_type", sample: peek });
      }
    } else {
      dbg("MISS", { stage: "WS Peek", reason: "no event within timeout" });
    }
  }

  // 2.2 Milky：优先回落到 HTTP /api/get_impl_info（更稳）
  if (wsFlavor === "milky") {
    const httpFromWs = deriveHttpFromWs(wsCandidates[0]);
    const root = stripAfterMilkyAnchors(httpFromWs);
    const mApi = joinUrl(root + "/api", "get_impl_info");
    const m = await httpPostJson(mApi, {}, finalToken, "milky", finalDebug, dbg, 1800);

    if (m.status === 401) {
      dbg("HIT", { rule: "Milky: status===401", url: maskUrl(mApi) });
      return buildReturnNames("milky");
    }
    if (looksLikeMilkyImplInfo(m.json)) {
      dbg("HIT", { rule: "Milky: looksLikeMilkyImplInfo", data: (m.json as any)?.data });
      return buildReturnNames("milky");
    }

    dbg("HIT", { rule: "Milky fallback: WS said Milky but HTTP no impl_info" });
    return buildReturnNames("milky");
  }

  // 2.3 OneBot WS：仍按“成功回包才命中”
  if (wsCandidates.length > 0) {
    // LLBot
    {
      const echo = "autoProto_llbot";
      const payload = { action: "get_profile_like_me", params: { start: 0, count: 1 }, echo };
      const j = await wsWaitFor(wsCandidates[0], finalToken, payload, makeEchoMatcher(echo), finalDebug, dbg, 1800);

      if (isOkResponse(j)) {
        dbg("HIT", { rule: "LLBot WS: get_profile_like_me OK", data: (j as any)?.data });
        return buildReturnNames("llbot");
      }
      dbg("MISS", { stage: "WS LLBot", json: j ? briefJson(j) : "(none)" });
    }

    // NapCat
    {
      const echo = "autoProto_napcat";
      const payload = { action: "nc_get_packet_status", params: {}, echo };
      const j = await wsWaitFor(wsCandidates[0], finalToken, payload, makeEchoMatcher(echo), finalDebug, dbg, 1800);

      if (isOkResponse(j)) {
        dbg("HIT", { rule: "NapCat WS: nc_get_packet_status OK", data: (j as any)?.data });
        return buildReturnNames("napcat");
      }
      dbg("MISS", { stage: "WS NapCat", json: j ? briefJson(j) : "(none)" });
    }

    // Lagrange / generic OneBot
    {
      const echo = "autoProto_lagrange";
      const payload = { action: "get_version_info", params: {}, echo };
      const j = await wsWaitFor(wsCandidates[0], finalToken, payload, makeEchoMatcher(echo), finalDebug, dbg, 1800);

      if (looksLikeLagrangeVersionInfo(j)) {
        dbg("HIT", { rule: "Lagrange WS: get_version_info has nt_protocol", data: (j as any)?.data });
        return buildReturnNames("lagrange");
      }
      if (isOkResponse(j)) {
        // 看得到 OK 的版本信息，但不是 Lagrange：尝试从 app_name 判 NapCat
        if (looksLikeNapCatVersionInfo(j)) {
          dbg("HIT", { rule: "NapCat WS: get_version_info app_name contains napcat", data: (j as any)?.data });
          return buildReturnNames("napcat");
        }
        dbg("HIT", { rule: "Generic OneBot WS: get_version_info OK but unknown impl", data: (j as any)?.data });
        return ["OneBot11", "OneBot", "UnknownOneBot"];
      }

      dbg("MISS", { stage: "WS get_version_info", json: j ? briefJson(j) : "(none)" });
    }
  }

  dbg("HIT", { rule: "Fallback: unknown" });
  return buildReturnNames("unknown");
}

/*

import { autoProtoType } from "./autoProtoType";

async function test() {
  console.log(
    JSON.stringify(
      await autoProtoType(
        "ws://127.0.0.1:3001", // "http://127.0.0.1:3010", // "ws://127.0.0.1:3001", // "http://192.168.1.81:10072",
        "7a792f1ba2614dce024cf7993770fb01",
        true
      ),
      null,
      2
    )
  );
}

test();

*/

