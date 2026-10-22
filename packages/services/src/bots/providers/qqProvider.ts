/**
 * QQ 开放平台 Bot Provider。
 *
 * 接入方式：WebSocket (wss://api.bot.qq.com/websocket/) 或 Webhook。
 * 鉴权：AppID + AppSecret → Access Token。
 * API 文档：https://bot.q.qq.com/wiki/develop/api-v2/
 */
import type {
  BotConfig,
  BotInboundMessage,
  BotOutboundMessage,
} from "@zcode/shared";
import type { BotProviderAdapter } from "./types.js";
import {
  fetchBotProvider,
  fetchBotProviderJson,
} from "#src/bots/providers/providerRequest.js";

interface QQProviderDeps {
  loadCredential(key: string): Promise<string | null>;
}

const QQ_API_BASE = "https://api.bot.qq.com";
// 参考：https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/access-token.html
const QQ_TOKEN_URL = `${QQ_API_BASE}/app/getAppAccessToken`;

/** QQ Access Token 缓存（AppID → {token, expiresAt}） */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

interface QQTokenResponse {
  access_token?: string;
  expires_in?: string | number;
  code?: number;
  message?: string;
}

interface QQMessageResponse {
  id?: string;
  error?: string;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function splitQQText(text: string): string[] {
  // QQ 单条消息限制约 4500 字符
  const limit = 4000;
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += limit) {
    chunks.push(text.slice(index, index + limit));
  }
  return chunks.length > 0 ? chunks : [text];
}

async function loadAppId(bot: BotConfig): Promise<string | null> {
  // 扫码注册写入 providerUserId，手动配置写入 qqAppId；优先 qqAppId，fallback providerUserId
  return bot.qqAppId?.trim() || bot.providerUserId?.trim() || null;
}

async function loadAppSecret(
  bot: BotConfig,
  deps: QQProviderDeps,
): Promise<string | null> {
  if (bot.credentialRef) {
    const raw = await deps.loadCredential(bot.credentialRef);
    if (!raw) return null;
    // 扫码注册存入格式为 "appId:appSecret"，OAuth2 只需要 appSecret 部分
    const colonIndex = raw.indexOf(":");
    return colonIndex >= 0 ? raw.slice(colonIndex + 1) : raw;
  }
  return null;
}

/**
 * 获取 QQ Access Token，带缓存。
 * Bugfix: QQ 官方 API 是 POST /app/getAppAccessToken，Content-Type: application/json，
 * 参数为 appId + clientSecret，不是标准 OAuth2 的 /oauth2/token + client_credentials。
 * 参考：https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/access-token.html
 */
async function getAccessToken(
  appId: string,
  appSecret: string,
): Promise<string> {
  const cached = tokenCache.get(appId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const response = await fetchBotProviderJson<QQTokenResponse>(QQ_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      appId,
      clientSecret: appSecret,
    }),
  });

  const payload = response.payload;
  if (!payload?.access_token) {
    throw new Error(
      `QQ getAppAccessToken failed: code=${payload?.code} message=${payload?.message ?? "unknown"}`,
    );
  }

  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 7200;
  const token = payload.access_token;
  tokenCache.set(appId, { token, expiresAt: Date.now() + expiresIn * 1000 - 60_000 });
  return token;
}

/**
 * 解析 QQ WebSocket/Webhook 入站事件为 BotInboundMessage。
 *
 * QQ 事件格式（GROUP_AT_MESSAGE_CREATE / C2C_MESSAGE_CREATE）：
 * { d: { author: { member_openid / user_openid }, content, id, ... }, t: "..." }
 */
function readQQInboundMessage(
  botId: string,
  payload: Record<string, unknown>,
): BotInboundMessage | null {
  const data = isRecord(payload.d) ? payload.d : null;
  if (!data) {
    return null;
  }

  const eventType = typeof payload.t === "string" ? payload.t : "";
  const isGroup = eventType === "GROUP_AT_MESSAGE_CREATE";
  const isC2C = eventType === "C2C_MESSAGE_CREATE";

  if (!isGroup && !isC2C) {
    return null;
  }

  const author = isRecord(data.author) ? data.author : null;
  const content =
    typeof data.content === "string"
      ? data.content
          // QQ 群消息 @机器人 的 content 含 `<@!appid>` 前缀，需去除
          .replace(/^<@!\d+>\s*/u, "")
      : "";

  const userId = isGroup
    ? typeof author?.member_openid === "string"
      ? author.member_openid
      : ""
    : typeof author?.user_openid === "string"
      ? author.user_openid
      : "";

  const msgId = typeof data.id === "string" ? data.id : "";

  if (!content || !userId) {
    return null;
  }

  return {
    botId,
    text: content,
    actor: {
      provider: "qq",
      botId,
      providerUserId: userId,
      chatType: isGroup ? "group" : "private",
      // GROUP_AT_MESSAGE_CREATE 本身就是 @ 机器人事件，置位以便群聊过滤放行。
      mentionedBot: isGroup,
      chatId:
        isGroup && typeof data.group_openid === "string"
          ? data.group_openid
          : undefined,
      providerMessageId: msgId || undefined,
    },
  };
}

export function createQQBotProvider(deps: QQProviderDeps): BotProviderAdapter {
  return {
    async test(bot: BotConfig) {
      const appId = await loadAppId(bot);
      const appSecret = await loadAppSecret(bot, deps);
      if (!appId) {
        return { ok: false, message: "QQ App ID is required." };
      }
      if (!appSecret) {
        return { ok: false, message: "QQ App Secret is required." };
      }
      try {
        await getAccessToken(appId, appSecret);
        return { ok: true, message: "QQ bot connected." };
      } catch (error) {
        return {
          ok: false,
          message: `QQ auth failed: ${(error as Error).message}`,
        };
      }
    },

    async send(bot: BotConfig, message: BotOutboundMessage) {
      const appId = await loadAppId(bot);
      const appSecret = await loadAppSecret(bot, deps);
      if (!appId || !appSecret) {
        return;
      }
      const token = await getAccessToken(appId, appSecret);

      const text = message.text.trim();
      if (!text) {
        return;
      }

      const chunks = splitQQText(text);
      for (const chunk of chunks) {
        // QQ 发消息 API：群聊 POST /v2/groups/{group_openid}/messages，
        // 私聊 POST /v2/users/{openid}/messages。
        // providerUserId 由 createOutbound 透传：群聊时为 group_openid（chatId），私聊时为 user_openid。
        const isGroup = message.chatType === "group";
        const url = isGroup
          ? `${QQ_API_BASE}/v2/groups/${message.providerUserId}/messages`
          : `${QQ_API_BASE}/v2/users/${message.providerUserId}/messages`;

        await fetchBotProvider(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `QQBot ${token}`,
          },
          body: JSON.stringify({
            content: chunk,
            msg_type: 0, // 0 = 文本
            msg_id: message.providerContextToken ?? undefined,
          }),
        });
      }
    },

    parseCallback(payload): BotInboundMessage[] {
      if (!isRecord(payload)) {
        return [];
      }
      const botId = typeof payload.botId === "string" ? payload.botId : "";
      if (!botId) {
        return [];
      }
      const message = readQQInboundMessage(botId, payload);
      return message ? [message] : [];
    },
  };
}
