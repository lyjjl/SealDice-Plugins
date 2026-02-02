/**
 * OneBot Heartbeat 事件（meta_event/heartbeat）
 */
interface OneBotHeartbeatEvent {
  time: number; // unix seconds
  self_id: number | string;
  post_type: "meta_event";
  meta_event_type: "heartbeat";
  status?: {
    online?: boolean;
    good?: boolean;
  };
  interval?: number; // ms
}

interface PersistentState {
  lastOnline?: boolean;
  lastHeartbeatAtMs?: number;
  lastNotifiedAtMs?: number;
}

/**
 * OneBot HTTP 推送目标
 */
type OneBotPushTarget =
  | { kind: "private"; userId: string }
  | { kind: "group"; groupId: string };

const EXT_NAME = "onebot-heartbeat-monitor";
const STORAGE_KEY_STATE = "state";

/**
 * 读取 JSON 存储
 * @param ext 扩展对象
 * @param key 存储 key
 */
function storageGetJson<T>(ext: seal.ExtInfo, key: string): T | null {
  const raw = ext.storageGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error(`[${EXT_NAME}] storage parse failed:`, e);
    return null;
  }
}

/**
 * 写入 JSON 存储
 * @param ext 扩展对象
 * @param key 存储 key
 * @param value 值
 */
function storageSetJson(ext: seal.ExtInfo, key: string, value: unknown): void {
  try {
    ext.storageSet(key, JSON.stringify(value));
  } catch (e) {
    console.error(`[${EXT_NAME}] storage set failed:`, e);
  }
}

/**
 * 拼接 WS URL：若 token 存在则附加 access_token 查询参数
 * @param server WS 地址
 * @param token access_token
 */
function buildWsUrl(server: string, token: string): string {
  const s = (server || "").trim();
  const t = (token || "").trim();
  if (!t) return s;

  // 不依赖 URL 类，直接拼接，兼容性更稳
  const hasQuery = s.includes("?");
  const joiner = hasQuery ? "&" : "?";
  return `${s}${joiner}access_token=${encodeURIComponent(t)}`;
}

/**
 * 解析 OneBot HTTP 推送目标：
 * - 支持 `user_id=123` / `group_id=456`
 * - 纯数字视为 user_id
 * @param raw 配置字符串
 */
function parsePushTarget(raw: string): OneBotPushTarget | null {
  const s = (raw || "").trim();
  if (!s) return null;

  const m1 = /^user_id\s*=\s*(\d+)\s*$/i.exec(s);
  if (m1) return { kind: "private", userId: m1[1] };

  const m2 = /^group_id\s*=\s*(\d+)\s*$/i.exec(s);
  if (m2) return { kind: "group", groupId: m2[1] };

  const m3 = /^(\d+)\s*$/.exec(s);
  if (m3) return { kind: "private", userId: m3[1] };

  return null;
}

/**
 * 安全 join URL（避免重复斜杠）
 * @param base base url
 * @param path path
 */
function joinUrl(base: string, path: string): string {
  const b = (base || "").trim().replace(/\/+$/, "");
  const p = (path || "").trim().replace(/^\/+/, "");
  return `${b}/${p}`;
}

/**
 * 生成告警文本
 * @param hb heartbeat payload
 */
function formatAlertText(hb: OneBotHeartbeatEvent): string {
  const ts = typeof hb.time === "number" ? hb.time : 0;
  const iso = ts > 0 ? new Date(ts * 1000).toISOString() : new Date().toISOString();
  const online = hb.status?.online === true ? "true" : "false";
  const good = hb.status?.good === true ? "true" : "false";
  const interval = typeof hb.interval === "number" ? hb.interval : -1;

  return [
    "[SealDice] OneBot Heartbeat Offline",
    `time=${iso}`,
    `self_id=${String(hb.self_id)}`,
    `status.online=${online}`,
    `status.good=${good}`,
    `interval_ms=${interval}`,
  ].join("\n");
}

/**
 * 扩展主逻辑：WS 连接 + 离线告警
 */
class OneBotHeartbeatMonitor {
  private ext: seal.ExtInfo;
  private ws: WebSocket | null = null;

  private state: PersistentState;
  private notifyChain: Promise<void> = Promise.resolve();

  private reconnectTimer: any = null;

  /**
   * @param ext 扩展对象
   */
  constructor(ext: seal.ExtInfo) {
    this.ext = ext;
    this.state = storageGetJson<PersistentState>(ext, STORAGE_KEY_STATE) || {};
  }

  /**
   * 启动监控（建立 WS 连接）
   */
  public start(): void {
    this.clearReconnectTimer();
    this.connectWs();
  }

  /**
   * 关闭连接（不卸载扩展，只是停止）
   */
  public stop(): void {
    this.clearReconnectTimer();
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        console.error(`[${EXT_NAME}] ws close failed:`, e);
      }
      this.ws = null;
    }
  }

  private debugLog(...args: any[]): void {
    const on = seal.ext.getBoolConfig(this.ext, "DEBUG_LOG");
    if (on) console.log(`[${EXT_NAME}]`, ...args);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      try {
        clearTimeout(this.reconnectTimer);
      } catch {}
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    const sec = seal.ext.getIntConfig(this.ext, "ONEBOT_WS_RECONNECT_SEC");
    const delayMs = Math.max(1, sec) * 1000;
    this.debugLog(`schedule reconnect in ${delayMs}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.connectWs();
    }, delayMs);
  }

  private saveState(): void {
    storageSetJson(this.ext, STORAGE_KEY_STATE, this.state);
  }

  private connectWs(): void {
    const server = seal.ext.getStringConfig(this.ext, "ONEBOT_WS_SERVER");
    const token = seal.ext.getStringConfig(this.ext, "ONEBOT_WS_TOKEN");
    const url = buildWsUrl(server, token);

    if (!url) {
      console.error(`[${EXT_NAME}] ONEBOT_WS_SERVER is empty, skip connect`);
      this.scheduleReconnect();
      return;
    }

    this.debugLog(`connecting ws: ${url}`);

    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.addEventListener("open", () => {
        this.debugLog("ws opened");
      });

      ws.addEventListener("message", (ev: MessageEvent) => {
        // 串行处理，避免 async 覆盖
        const data = (ev as any).data;
        const text =
          typeof data === "string"
            ? data
            : data && typeof data.toString === "function"
              ? data.toString()
              : "";

        if (!text) return;

        // 不在此处 await，改为链式串行
        this.notifyChain = this.notifyChain
          .then(() => this.onWsText(text))
          .catch((e) => {
            console.error(`[${EXT_NAME}] message handler failed:`, e);
          });
      });

      ws.addEventListener("error", (ev) => {
        console.error(`[${EXT_NAME}] ws error:`, ev);
      });

      ws.addEventListener("close", () => {
        this.debugLog("ws closed");
        this.ws = null;
        this.scheduleReconnect();
      });
    } catch (e) {
      console.error(`[${EXT_NAME}] ws connect failed:`, e);
      this.ws = null;
      this.scheduleReconnect();
    }
  }

  private async onWsText(text: string): Promise<void> {
    let obj: any;
    try {
      obj = JSON.parse(text);
    } catch {
      return;
    }

    if (!obj || obj.post_type !== "meta_event" || obj.meta_event_type !== "heartbeat") {
      return;
    }

    const hb = obj as OneBotHeartbeatEvent;
    this.state.lastHeartbeatAtMs = Date.now();
    this.saveState();

    const isOnline = hb.status?.online === true;

    // 记录状态变化
    const prev = this.state.lastOnline;
    this.state.lastOnline = isOnline;
    this.saveState();

    if (!isOnline) {
      await this.handleOffline(hb, prev);
    } else {
      this.debugLog("heartbeat online");
    }
  }

  private async handleOffline(hb: OneBotHeartbeatEvent, prevOnline?: boolean): Promise<void> {
    const now = Date.now();
    const cooldownSec = seal.ext.getIntConfig(this.ext, "ALERT_COOLDOWN_SEC");
    const cooldownMs = Math.max(0, cooldownSec) * 1000;

    const lastAt = this.state.lastNotifiedAtMs || 0;
    const inCooldown = cooldownMs > 0 && now - lastAt < cooldownMs;

    // 默认：离线时通知，但冷却期内不重复刷屏
    if (inCooldown) {
      this.debugLog("offline but in cooldown, skip notify");
      return;
    }

    const alertText = formatAlertText(hb);

    this.state.lastNotifiedAtMs = now;
    this.saveState();

    await this.sendNotifications(alertText);

    if (prevOnline === true || prevOnline === undefined) {
      this.debugLog("offline alert sent (state changed or first seen)");
    } else {
      this.debugLog("offline alert sent (still offline)");
    }
  }

  private async sendNotifications(text: string): Promise<void> {
    const useOneBot = seal.ext.getBoolConfig(this.ext, "NOTIFY_ONEBOT");
    if (!useOneBot) return;

    await this.notifyByOneBotHttp(text);
  }

  private async notifyByOneBotHttp(text: string): Promise<void> {
    const baseUrl = seal.ext.getStringConfig(this.ext, "GOBOT_URL");
    const targetRaw = seal.ext.getStringConfig(this.ext, "GOBOT_QQ");
    const token = seal.ext.getStringConfig(this.ext, "GOBOT_TOKEN");

    const target = parsePushTarget(targetRaw);
    if (!baseUrl || !target) {
      console.error(`[${EXT_NAME}] OneBot HTTP notify skipped: GOBOT_URL or GOBOT_QQ invalid`);
      return;
    }

    const apiPath = target.kind === "group" ? "send_group_msg" : "send_private_msg";
    const url = joinUrl(baseUrl, apiPath);

    const body =
      target.kind === "group"
        ? { group_id: Number(target.groupId), message: text }
        : { user_id: Number(target.userId), message: text };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const t = (token || "").trim();
    if (t) headers["Authorization"] = `Bearer ${t}`;

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        console.error(
          `[${EXT_NAME}] OneBot HTTP notify failed: ${resp.status} ${resp.statusText} ${errText}`
        );
      } else {
        this.debugLog("OneBot HTTP notify ok");
      }
    } catch (e) {
      console.error(`[${EXT_NAME}] OneBot HTTP notify exception:`, e);
    }
  }
}

// ---- 扩展注册 ----

let ext = seal.ext.find(EXT_NAME);

if (!ext) {
  ext = seal.ext.new(EXT_NAME, "clio-7", "1.0.1");
  seal.ext.register(ext);

  // OneBot WS 连接配置
  seal.ext.registerStringConfig(
    ext,
    "ONEBOT_WS_SERVER",
    "ws://127.0.0.1:6700",
    "OneBot WS 正向地址（示例：ws://127.0.0.1:6700）"
  );
  seal.ext.registerStringConfig(
    ext,
    "ONEBOT_WS_TOKEN",
    "",
    "OneBot WS access_token（可留空；非空时追加 ?access_token=...）"
  );
  seal.ext.registerIntConfig(ext, "ONEBOT_WS_RECONNECT_SEC", 10, "WS 断开后重连间隔（秒）");

  // 告警行为
  seal.ext.registerIntConfig(
    ext,
    "ALERT_COOLDOWN_SEC",
    300,
    "离线告警冷却时间（秒；0 表示每次离线 heartbeat 都通知）"
  );
  seal.ext.registerBoolConfig(ext, "DEBUG_LOG", false, "输出调试日志");

  // OneBot HTTP 通知（参考：GOBOT_*）
  seal.ext.registerBoolConfig(ext, "NOTIFY_ONEBOT", false, "启用 OneBot HTTP 通知");
  seal.ext.registerStringConfig(
    ext,
    "GOBOT_URL",
    "http://127.0.0.1:5700",
    "OneBot HTTP API 基地址（示例：http://127.0.0.1:5700）"
  );
  seal.ext.registerStringConfig(
    ext,
    "GOBOT_QQ",
    "",
    "推送目标：user_id=个人QQ 或 group_id=QQ群（也可直接填纯数字，视为 user_id）"
  );
  seal.ext.registerStringConfig(
    ext,
    "GOBOT_TOKEN",
    "",
    "OneBot HTTP access_token（可留空；非空时以 Authorization: Bearer 传递）"
  );
}

// 无论是否已存在，都绑定生命周期
const monitor = new OneBotHeartbeatMonitor(ext);
ext.onLoad = () => {
  monitor.start();
};
(ext as any).onUnload = () => {
  monitor.stop();
};
