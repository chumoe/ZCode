/**
 * QQ 频道运行时 — WebSocket 长连接接收事件。
 *
 * QQ 开放平台 WebSocket 接入：
 * 1. Opcode 10 Hello → 获取心跳间隔
 * 2. Opcode 2 Identify 鉴权 → READY 事件
 * 3. 心跳 Op1 按间隔发送
 * 4. 事件通过 Op0 Dispatch 下发
 *
 * 参考：https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html
 */
import type {
  BotConfig,
  BotProviderCallbackResult,
  BotsConfigFile,
} from "@zcode/shared";
import type { ICredentialService } from "../credential/credential.js";
import {
  createBotConnectionFingerprint,
  createLatestRuntimeRefreshQueue,
  type BotRuntimeLogger,
  type BotRuntimeStatusSink,
  waitFor,
} from "./channelRuntime.js";

const QQ_WS_URL = "wss://api.bot.qq.com/websocket/";

/**
 * QQ Intents 位定义：
 * - PUBLIC_GUILD_MESSAGES = 1 << 0 = 1（公域频道消息）
 * - C2C_MESSAGE_CREATE    = 1 << 9 = 512（单聊消息）
 * - GROUP_AT_MESSAGE_CREATE = 1 << 25 = 33554432（群@消息）
 *
 * ZCode 需要群聊和单聊，加上公域频道消息。
 * 参考：https://bot.q.qq.com/wiki/develop/api-v2/server-inter/link/intents.html
 */
const QQ_INTENTS = (1 << 0) | (1 << 9) | (1 << 25); // 33554945

interface QQWssPayload {
  op: number;
  s?: number;
  t?: string;
  d?: unknown;
}

interface QQChannelRuntimeDeps {
  runBackgroundTasks?: boolean;
  credentialService: ICredentialService;
  logger: BotRuntimeLogger;
  statusSink: BotRuntimeStatusSink;
  ensureBotStorageMigrated(): Promise<void>;
  readConfig(): Promise<BotsConfigFile>;
  processProviderCallback(
    provider: "qq",
    payload: unknown,
  ): Promise<BotProviderCallbackResult>;
}

export function createQQChannelRuntime(deps: QQChannelRuntimeDeps) {
  interface RuntimeEntry {
    controller: AbortController;
    fingerprint: string;
    done: Promise<void>;
  }

  const runtimes = new Map<string, RuntimeEntry>();
  const refreshQueue = createLatestRuntimeRefreshQueue();

  async function getConnectionFingerprint(bot: BotConfig): Promise<string> {
    const credential = bot.credentialRef
      ? await deps.credentialService.load(bot.credentialRef)
      : null;
    return createBotConnectionFingerprint([
      bot.provider,
      bot.qqAppId ?? "",
      bot.credentialRef ?? "",
      credential ?? "",
    ]);
  }

  /**
   * 获取 QQ Access Token。
   * 参考：https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/access-token.html
   */
  async function getAccessToken(appId: string, appSecret: string, signal?: AbortSignal): Promise<string> {
    // Bugfix: fetch 默认无超时，QQ 端点不响应时 connectBot 会永远挂住。
    // 加 15s 超时防止无限等待。
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const combinedSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;

    let response: Response;
    try {
      // Bugfix: QQ 官方 API 端点是 /app/getAppAccessToken，Content-Type 为 application/json，
      // 参数名为 appId + clientSecret，不是标准 OAuth2 的 /oauth2/token + client_credentials。
      response = await fetch("https://api.bot.qq.com/app/getAppAccessToken", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appId,
          clientSecret: appSecret,
        }),
        signal: combinedSignal,
      });
    } catch (error) {
      if (controller.signal.aborted && !signal?.aborted) {
        throw new Error("QQ getAppAccessToken request timed out after 15s");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`QQ getAppAccessToken failed: HTTP ${response.status} ${body.slice(0, 200)}`);
    }
    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: string | number;
      code?: number;
      message?: string;
    };
    if (!data.access_token) {
      throw new Error(`QQ getAppAccessToken failed: code=${data.code} message=${data.message ?? "unknown"}`);
    }
    return data.access_token;
  }

  /**
   * 通过 WebSocket 连接 QQ Gateway 并监听事件。
   */
  async function connectBot(bot: BotConfig, signal: AbortSignal): Promise<void> {
    // Bugfix: 扫码绑定后 appId 存在 providerUserId，手动配置写入 qqAppId；
    // 优先 qqAppId，fallback providerUserId，与 qqProvider.ts loadAppId 保持一致。
    const appId = bot.qqAppId?.trim() || bot.providerUserId?.trim();

    // Bugfix: 扫码绑定后 credential 格式为 "appId:appSecret"，
    // 需要按 ":" 分割取后半部分，与 qqProvider.ts loadAppSecret 保持一致。
    let appSecret: string | null = null;
    if (bot.credentialRef) {
      const raw = await deps.credentialService.load(bot.credentialRef);
      if (raw) {
        const colonIndex = raw.indexOf(":");
        appSecret = colonIndex >= 0 ? raw.slice(colonIndex + 1) : raw;
      }
    }

    if (!appId || !appSecret) {
      deps.statusSink.setRuntimeStatus({
        botId: bot.id,
        provider: "qq",
        status: "error",
        messageId: "bots.runtime.qqCredentialsMissing",
        message: "QQ App ID or App Secret is missing.",
      });
      return;
    }

    let token: string;
    try {
      token = await getAccessToken(appId, appSecret, signal);
    } catch (error) {
      deps.statusSink.setRuntimeStatus({
        botId: bot.id,
        provider: "qq",
        status: "error",
        messageId: "bots.runtime.qqAuthFailed",
        message: `QQ auth failed: ${(error as Error).message}`,
      });
      return;
    }

    deps.statusSink.setRuntimeStatus({
      botId: bot.id,
      provider: "qq",
      status: "idle",
    });

    // QQ WebSocket 连接循环：断开后自动重连，指数退避。
    let reconnectDelayMs = 1_000;
    const MAX_RECONNECT_DELAY_MS = 60_000;
    let wasConnected = false;

    while (!signal.aborted) {
      try {
        await runWssConnection(bot, token, appId, signal, () => { wasConnected = true; });
      } catch (error) {
        if (signal.aborted) break;
        // 如果之前成功连接过（收到过 READY），重置退避为初始值
        // 因为断开可能是服务端重启等临时问题，快速重连即可
        if (wasConnected) {
          reconnectDelayMs = 1_000;
          wasConnected = false;
        }
        deps.logger.warn(
          undefined,
          `QQ WebSocket disconnected bot=${bot.id}: ${(error as Error).message}, reconnecting in ${reconnectDelayMs / 1000}s...`,
        );
        deps.statusSink.setRuntimeStatus({
          botId: bot.id,
          provider: "qq",
          status: "idle",
        });
        await waitFor(reconnectDelayMs, signal);
        // 指数退避
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
        // 重新获取 token（可能过期）
        try {
          token = await getAccessToken(appId, appSecret, signal);
        } catch {
          // token 刷新失败，继续退避重试
          deps.logger.warn(
            undefined,
            `QQ token refresh failed bot=${bot.id}, retrying next cycle...`,
          );
        }
      }
    }
  }

  /**
   * 单次 WebSocket 连接生命周期。
   */
  async function runWssConnection(
    bot: BotConfig,
    token: string,
    appId: string,
    signal: AbortSignal,
    onReady?: () => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(QQ_WS_URL);
      let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
      let lastSeq: number | null = null;
      // Bugfix: WebSocket 连接无超时，QQ 网关不响应时 connectBot 会永远挂住。
      let connectTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        cleanup();
        reject(new Error("QQ WebSocket connection timed out after 15s"));
      }, 15_000);

      const cleanup = () => {
        if (connectTimeout !== null) {
          clearTimeout(connectTimeout);
          connectTimeout = null;
        }
        if (heartbeatInterval !== null) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        try { ws.close(); } catch { /* ignore */ }
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const payload = JSON.parse(String(event.data)) as QQWssPayload;

          // Op 10 Hello: 服务端下发心跳间隔
          if (payload.op === 10) {
            // 连接成功，清除连接超时
            if (connectTimeout !== null) {
              clearTimeout(connectTimeout);
              connectTimeout = null;
            }
            const d = payload.d as { heartbeat_interval?: number } | null;
            const heartbeatMs = d?.heartbeat_interval ?? 41_250;
            // Bugfix: QQ 官方文档要求 token 格式为 "QQBot {AccessToken}"，
            // 不是裸 access_token。参考：https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html
            ws.send(JSON.stringify({
              op: 2,
              d: {
                token: `QQBot ${token}`,
                intents: QQ_INTENTS,
                shard: [0, 1],
              },
            }));
            // 启动心跳
            heartbeatInterval = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ op: 1, d: lastSeq }));
              }
            }, heartbeatMs);
          }

          // Op 0 Dispatch: 事件
          if (payload.op === 0) {
            if (typeof payload.s === "number") {
              lastSeq = payload.s;
            }
            if (payload.t === "READY") {
              deps.statusSink.setRuntimeStatus({
                botId: bot.id,
                provider: "qq",
                status: "connected",
              });
              onReady?.();
            } else if (
              payload.t === "C2C_MESSAGE_CREATE" ||
              payload.t === "GROUP_AT_MESSAGE_CREATE"
            ) {
              // 将事件转发给 botsService 处理
              deps.processProviderCallback("qq", {
                botId: bot.id,
                t: payload.t,
                d: payload.d,
              }).catch((error: unknown) => {
                deps.logger.warn(
                  undefined,
                  `QQ callback processing failed bot=${bot.id}: ${error instanceof Error ? error.message : String(error)}`,
                );
              });
            }
          }

          // Op 7 Reconnect / Op 9 Invalid Session
          if (payload.op === 7 || payload.op === 9) {
            cleanup();
            reject(new Error(`QQ op=${payload.op}, reconnecting`));
          }
        } catch {
          // 忽略非 JSON 消息
        }
      };

      ws.onerror = () => {
        cleanup();
        reject(new Error("QQ WebSocket error"));
      };

      ws.onclose = () => {
        cleanup();
        reject(new Error("QQ WebSocket closed"));
      };

      // 监听外部 abort
      const onAbort = () => {
        cleanup();
        resolve();
      };
      if (signal.aborted) {
        cleanup();
        resolve();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  async function reconcile(
    config: BotsConfigFile | undefined,
    isLatest: () => boolean,
  ): Promise<void> {
    const resolvedConfig = config ?? await deps.readConfig();
    // Bugfix: 与微信一致，只对有凭据的 QQ bot 启动运行时；
    // 没有凭据的 bot 处于待绑定状态，不应尝试连接或报错。
    const activeQQIds = new Set(
      resolvedConfig.bots
        .filter((b) => b.provider === "qq" && b.enabled && b.credentialRef)
        .map((b) => b.id),
    );

    // 停用不再活跃的运行时
    for (const botId of runtimes.keys()) {
      if (!activeQQIds.has(botId)) {
        const entry = runtimes.get(botId);
        if (entry) {
          entry.controller.abort();
          runtimes.delete(botId);
          await entry.done.catch(() => undefined);
          deps.statusSink.setRuntimeStatus({
            botId,
            provider: "qq",
            status: "disabled",
          });
        }
      }
    }

    // 启动/更新已启用且有凭据的 QQ bot
    for (const bot of resolvedConfig.bots) {
      if (bot.provider === "qq" && bot.enabled && bot.credentialRef) {
        const fingerprint = await getConnectionFingerprint(bot);
        if (!isLatest()) return;
        const entry = runtimes.get(bot.id);

        if (entry && entry.fingerprint !== fingerprint) {
          // 凭据变更，重启
          entry.controller.abort();
          runtimes.delete(bot.id);
          await entry.done.catch(() => undefined);
          if (!isLatest()) return;
          await startBot(bot);
        } else if (!entry) {
          if (!isLatest()) return;
          await startBot(bot);
        }
      } else if (bot.provider === "qq" && !bot.enabled) {
        deps.statusSink.setRuntimeStatus({
          botId: bot.id,
          provider: "qq",
          status: "disabled",
          messageId: "bots.runtime.botDisabled",
          message: "Bot is disabled.",
        });
      }
    }
  }

  async function startBot(bot: BotConfig): Promise<void> {
    const controller = new AbortController();
    const fingerprint = await getConnectionFingerprint(bot);
    const done = connectBot(bot, controller.signal).catch((error: unknown) => {
      deps.logger.warn(
        undefined,
        `QQ runtime exited bot=${bot.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    runtimes.set(bot.id, { controller, fingerprint, done });
  }

  function refresh(config?: BotsConfigFile): Promise<void> {
    return refreshQueue.enqueue((isLatest) => reconcile(config, isLatest));
  }

  function scheduleRefresh(config?: BotsConfigFile): void {
    if (deps.runBackgroundTasks === false) {
      return;
    }
    void refresh(config).catch((error: unknown) => {
      deps.logger.warn(
        undefined,
        `refresh QQ WebSocket failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  async function dispose(): Promise<void> {
    refreshQueue.invalidate();
    const activeRuntimes = [...runtimes.values()];
    for (const runtime of activeRuntimes) {
      runtime.controller.abort();
    }
    await Promise.allSettled(activeRuntimes.map((runtime) => runtime.done));
    for (const [botId] of runtimes) {
      runtimes.delete(botId);
      deps.statusSink.setRuntimeStatus({
        botId,
        provider: "qq",
        status: "disabled",
      });
    }
  }

  return {
    dispose,
    refresh,
    scheduleRefresh,
  };
}
