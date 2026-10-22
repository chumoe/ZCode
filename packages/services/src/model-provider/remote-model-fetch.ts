import { fetchBotProviderJson } from "../bots/providers/providerRequest.js";

/**
 * 远程模型拉取 —— 从 OpenAI 兼容的自定义供应商 `/models` 端点获取模型列表。
 *
 * 用于设置页「从供应商获取模型」按钮：对用户填的 baseUrl + apiKey 发起 GET，
 * 解析 OpenAI 兼容的 `{data:[{id,...},...]}` 响应，返回模型 ID 列表。
 * 走现有 `fetchBotProviderJson`（15s 超时 + 有界 AbortController + JSON 解析）。
 */

export interface RemoteProviderModel {
  readonly id: string;
}

export interface RemoteModelList {
  readonly providerName?: string;
  readonly models: readonly RemoteProviderModel[];
}

/** OpenAI 兼容 /models 响应（OpenAI/DeepSeek 等上游同构）。 */
interface OpenAiModelsResponse {
  readonly object?: string;
  readonly data?: readonly { readonly id?: string; readonly object?: string }[];
  /** 部分供应商把模型 ID 放在顶层数组，兼容处理。 */
  readonly models?: readonly { readonly id?: string }[];
}

/**
 * 根据用户填写的 baseUrl 推导 /models 端点 URL。
 * 处理常见写法差异：
 *   "https://api.x.com"           → https://api.x.com/models
 *   "https://api.x.com/v1"        → https://api.x.com/v1/models
 *   ".../v1/chat/completions"     → ".../v1/models"（去掉尾部动作路径）
 *   ".../models"（已是端点）       → 原样
 */
export function buildModelsEndpoint(baseUrl: string): string {
  let url = baseUrl.trim();
  if (!url) {
    return "";
  }
  // 去掉尾部斜杠，统一处理
  url = url.replace(/\/+$/, "");
  // 去掉以 /v1/ 或 /v1 开头的路径，保证落到 .../v1/models
  const lower = url.toLowerCase();
  // 识别尾部动作路径：/chat/completions、/responses、/completions 等
  const actionPath = /\/(chat\/completions|responses|completions|embeddings)(\/?)$/i;
  if (actionPath.test(lower)) {
    url = url.replace(actionPath, "");
    return `${url}/models`;
  }
  // 已经以 /models 结尾 → 原样
  if (lower.endsWith("/models")) {
    return url;
  }
  // 以 /v1 结尾 → + /models；否则根路径就是 API 前缀
  return `${url}/models`;
}

function extractModelIds(
  payload: OpenAiModelsResponse | readonly { readonly id?: string }[] | undefined,
): string[] {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload)) {
    return collectIds(payload);
  }
  const objectPayload = payload as OpenAiModelsResponse;
  if (Array.isArray(objectPayload.data)) {
    const ids = collectIds(objectPayload.data);
    if (ids.length > 0) {
      return ids;
    }
  }
  if (Array.isArray(objectPayload.models)) {
    return collectIds(objectPayload.models);
  }
  return [];
}

function collectIds(items: readonly { readonly id?: string }[]): string[] {
  return items
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

export interface FetchProviderModelsInput {
  readonly baseUrl: string;
  readonly apiKey: string;
}

export type FetchProviderModelsResult =
  | { readonly ok: true; readonly models: readonly RemoteProviderModel[] }
  | {
      readonly ok: false;
      readonly status?: number;
      readonly error: string;
    };

/**
 * 拉取自定义供应商的模型列表。
 * 缺 baseUrl/apiKey 直接返回失败；网络/解析错误通过 error 透出（不外抛，供 UI 展示）。
 */
export async function fetchProviderModels(
  input: FetchProviderModelsInput,
): Promise<FetchProviderModelsResult> {
  const endpoint = buildModelsEndpoint(input.baseUrl);
  if (!endpoint) {
    return { ok: false, error: "Missing provider baseUrl." };
  }
  if (!input.apiKey) {
    return { ok: false, error: "Missing provider API key." };
  }
  try {
    const response = await fetchBotProviderJson<OpenAiModelsResponse>(
      endpoint,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          Accept: "application/json",
        },
      },
    );
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status} from ${endpoint}.`,
      };
    }
    const ids = extractModelIds(response.payload);
    if (ids.length === 0) {
      return { ok: false, status: response.status, error: `No models returned from ${endpoint}.` };
    }
    return { ok: true, models: ids.map((id) => ({ id })) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}