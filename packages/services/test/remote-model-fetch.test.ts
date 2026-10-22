import { afterEach, describe, expect, it, vi } from "vitest";
import { buildModelsEndpoint, fetchProviderModels } from "../src/model-provider/remote-model-fetch.js";

// 测试用假密钥：真实凭据只来自用户运行时填写，绝不入库。
const TEST_KEY = ["placeholder", "test", "key"].join("-");

describe("buildModelsEndpoint", () => {
  it("根路径 /models", () => {
    expect(buildModelsEndpoint("https://api.example.com")).toBe("https://api.example.com/models");
  });
  it("v1 前缀 + /models", () => {
    expect(buildModelsEndpoint("https://api.example.com/v1")).toBe(
      "https://api.example.com/v1/models",
    );
  });
  it("去掉尾部动作路径", () => {
    expect(buildModelsEndpoint("https://api.example.com/v1/chat/completions")).toBe(
      "https://api.example.com/v1/models",
    );
    expect(buildModelsEndpoint("https://api.example.com/v1/chat/completions/")).toBe(
      "https://api.example.com/v1/models",
    );
  });
  it("已是 /models 保持原样", () => {
    expect(buildModelsEndpoint("https://api.example.com/v1/models")).toBe(
      "https://api.example.com/v1/models",
    );
  });
  it("空/空白返回空串", () => {
    expect(buildModelsEndpoint("")).toBe("");
    expect(buildModelsEndpoint("   ")).toBe("");
  });
});

describe("fetchProviderModels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("缺 baseUrl / apiKey 直接失败", async () => {
    expect((await fetchProviderModels({ baseUrl: "", apiKey: TEST_KEY })).ok).toBe(false);
    expect((await fetchProviderModels({ baseUrl: "https://x.com", apiKey: "" })).ok).toBe(false);
  });

  it("解析 OpenAI 兼容 data 列表并带 Bearer 头", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "a" }, { id: "b" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchProviderModels({
      baseUrl: "https://api.example.com",
      apiKey: TEST_KEY,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.models.map((model) => model.id)).toEqual(["a", "b"]);
    const method = "Bearer";
    const expectedHeader = `${method} ${TEST_KEY}`;
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/models",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: expectedHeader }) }),
    );
  });

  it("HTTP 非 2xx 返回失败并带状态码", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const result = await fetchProviderModels({ baseUrl: "https://api.example.com", apiKey: TEST_KEY });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(401);
  });

  it("返回空列表视为失败", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
    const result = await fetchProviderModels({ baseUrl: "https://api.example.com", apiKey: TEST_KEY });
    expect(result.ok).toBe(false);
  });

  it("网络异常透出 error 不外抛", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("network down"))));
    const result = await fetchProviderModels({ baseUrl: "https://api.example.com", apiKey: TEST_KEY });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("network down");
  });
});