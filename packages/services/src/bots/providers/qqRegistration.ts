/**
 * QQ 扫码绑定 — 使用 @tencent-connect/qqbot-connector 官方 SDK。
 *
 * 使用 startQrConnect 回调风格：
 * - onQrDisplayed: 获取二维码 URL 供 UI 渲染
 * - onSuccess: 扫码成功，获取 appId + appSecret
 * - onFailure: 流程失败或取消
 * - onQrExpired: 二维码过期，SDK 自动刷新
 *
 * 适配项目的 begin+poll 两步式注册模式：
 * - beginQQRegistration: 启动 SDK 扫码流程，返回二维码 URL
 * - pollQQRegistration: 检查内部状态机返回结果
 * - cancelQQRegistration: 调用 SDK stop 函数取消流程
 *
 * 参考：https://bot.q.qq.com/wiki/agent-qqbot/
 * SDK：https://www.npmjs.com/package/@tencent-connect/qqbot-connector
 */
import {
  startQrConnect,
  type QrConnectCredentials,
} from "@tencent-connect/qqbot-connector";

// ─── 内部状态机 ───────────────────────────────────────────────

type QQRegistrationState =
  | { phase: "idle" }
  | { phase: "pending"; qrUrl: string; stop: () => void }
  | { phase: "success"; appId: string; appSecret: string }
  | { phase: "expired" }
  | { phase: "error"; message: string };

let registrationState: QQRegistrationState = { phase: "idle" };

// ─── 公共类型 ────────────────────────────────────────────────

export interface BotQQRegistrationBeginResult {
  qrUrl: string;
  /** 轮询间隔（秒），QQ SDK 内部自动轮询，此处仅保持接口一致 */
  interval: number;
  /** 过期时间戳，SDK 自动刷新二维码，设为较长值 */
  expiresAt: number;
}

export interface BotQQRegistrationPollParams {
  /** 保留参数以匹配 begin+poll 接口模式，QQ 不需要 */
  qrUrl?: string;
}

export type BotQQRegistrationPollResult =
  | {
      status: "pending" | "scanned";
      interval: number;
    }
  | {
      status: "success";
      appId: string;
      appSecret: string;
    }
  | {
      status: "expired" | "error";
      message?: string;
    };

// ─── 实现 ────────────────────────────────────────────────────

const QQ_POLL_INTERVAL_SECONDS = 3;
const QQ_EXPIRE_SECONDS = 300; // SDK 自动刷新，设 5 分钟

/**
 * 启动 QQ 扫码绑定流程。
 *
 * 调用 SDK startQrConnect，
 * onQrDisplayed 回调返回二维码 URL 供 UI 渲染，
 * onSuccess/onFailure 驱动内部状态机。
 */
export async function beginQQRegistration(): Promise<BotQQRegistrationBeginResult> {
  // 如果已有进行中的流程，先取消
  cancelQQRegistration();

  // 重置状态
  registrationState = { phase: "idle" };

  // 用 Promise 等待 onQrDisplayed 回调返回二维码 URL
  let qrUrlResolved!: (url: string) => void;
  const qrUrlPromise = new Promise<string>((resolve) => {
    qrUrlResolved = resolve;
  });

  const stop = startQrConnect(
    {
      onSuccess(credentials: QrConnectCredentials[]) {
        const cred = credentials[0];
        if (credentials.length > 0 && cred?.appId && cred?.appSecret) {
          registrationState = {
            phase: "success",
            appId: cred.appId,
            appSecret: cred.appSecret,
          };
        } else {
          registrationState = {
            phase: "error",
            message: "QQ binding succeeded but did not return credentials.",
          };
        }
      },
      onFailure(error: Error) {
        const msg = error.message || "QQ binding failed.";
        if (msg.includes("expired") || msg.includes("timeout")) {
          registrationState = { phase: "expired" };
        } else {
          registrationState = { phase: "error", message: msg };
        }
      },
      onQrDisplayed(url: string) {
        qrUrlResolved(url);
      },
      onQrExpired() {
        // SDK 自动刷新二维码，无需额外处理
      },
    },
    {
      displayQrCodeToConsole: false,
      source: "ZCode",
    },
  );

  const qrUrl = await qrUrlPromise;

  // 将 stop 函数保存到状态中，以便 cancelQQRegistration 可以调用
  registrationState = { phase: "pending", qrUrl, stop };

  return {
    qrUrl,
    interval: QQ_POLL_INTERVAL_SECONDS,
    expiresAt: Date.now() + QQ_EXPIRE_SECONDS * 1000,
  };
}

/**
 * 轮询 QQ 扫码状态。
 *
 * SDK 使用回调驱动状态机，poll 仅检查内部状态：
 * - pending: SDK 内部轮询中，外部继续等待
 * - success: 扫码成功，返回凭据
 * - expired/error: 流程终止
 */
export async function pollQQRegistration(
  _params: BotQQRegistrationPollParams,
): Promise<BotQQRegistrationPollResult> {
  switch (registrationState.phase) {
    case "success":
      return {
        status: "success",
        appId: registrationState.appId,
        appSecret: registrationState.appSecret,
      };
    case "expired":
      return { status: "expired" };
    case "error":
      return { status: "error", message: registrationState.message };
    case "pending":
      // SDK 内部轮询中，外部继续等待
      return { status: "pending", interval: QQ_POLL_INTERVAL_SECONDS };
    case "idle":
    default:
      return { status: "pending", interval: QQ_POLL_INTERVAL_SECONDS };
  }
}

/**
 * 取消进行中的 QQ 扫码流程。
 *
 * 调用 SDK 返回的 stop 函数中止轮询。
 */
export function cancelQQRegistration(): void {
  if (registrationState.phase === "pending") {
    registrationState.stop();
  }
  registrationState = { phase: "idle" };
}
