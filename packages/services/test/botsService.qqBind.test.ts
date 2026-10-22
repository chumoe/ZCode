import { describe, expect, it } from "vitest";
import * as f from "./botsService.fixtures.js";
import type { BotsConfigFile } from "@zcode/shared";

/**
 * QQ 扫码注册把机器人 AppID 写入 providerUserId，凭据格式为 "appId:appSecret"。
 * /bind 绑定用户 openid 前必须先把 AppID 迁移到 qqAppId，
 * 否则 providerUserId 被 openid 覆盖后 QQ 鉴权/WebSocket 会断连。
 */
function qqConfig(): BotsConfigFile {
  return {
    version: 3,
    bots: [
      {
        id: "qq-bot-1",
        name: "QQ Bot",
        provider: "qq",
        enabled: true,
        credentialRef: "qq-credential",
        providerUserId: "1903916680", // 机器人 AppID（扫码注册写入）
        displayName: "1903916680",
        allowedWorkspaces: ["*"],
        allowedCommands: f.defaultUserCommands,
        currentOptions: {},
        replyMode: "assistant_changes",
      },
    ],
  };
}

const qqActor = {
  provider: "qq" as const,
  botId: "qq-bot-1",
  providerUserId: "USER_OPENID_QQ_123", // 绑定用户 openid
  chatType: "private" as const,
};

describe("botsService QQ bind", () => {
  it("QQ 绑定后 AppID 迁移到 qqAppId，providerUserId 为绑定用户 openid", async () => {
    const repo = f.createMemoryRepo(qqConfig());
    const service = f.createBotsService({
      credentialService: f.createCredentialService({
        "qq-credential": "1903916680:APP_SECRET_QQ",
      }),
      legacyTaskService: f.createLegacyTaskService(),
      repo: repo as never,
    });

    const code = await service.createBindCode({ botId: "qq-bot-1" });
    const replies = await service.handleInboundMessage({
      botId: "qq-bot-1",
      text: `/bind ${code.code}`,
      actor: qqActor,
    });

    // 绑定成功（不是"绑定码无效"或"bot 缺失"）
    expect(replies[0]?.text).toContain("绑定成功");

    const config = await repo.readConfig();
    const bot = config.bots.find((b) => b.id === "qq-bot-1")!;
    // AppID 已迁移到 qqAppId，不再丢失
    expect(bot.qqAppId).toBe("1903916680");
    // providerUserId 现在是绑定用户 openid
    expect(bot.providerUserId).toBe("USER_OPENID_QQ_123");
    service.disposeAll();
  });

  it("QQ 绑定后普通私聊消息不再提示未绑定", async () => {
    const repo = f.createMemoryRepo(qqConfig());
    const service = f.createBotsService({
      credentialService: f.createCredentialService({
        "qq-credential": "1903916680:APP_SECRET_QQ",
      }),
      legacyTaskService: f.createLegacyTaskService(),
      repo: repo as never,
    });

    const code = await service.createBindCode({ botId: "qq-bot-1" });
    await service.handleInboundMessage({
      botId: "qq-bot-1",
      text: `/bind ${code.code}`,
      actor: qqActor,
    });

    const replies = await service.handleInboundMessage({
      botId: "qq-bot-1",
      text: "/状态",
      actor: qqActor,
    });
    // 不再返回"未绑定"
    expect(replies[0]?.text).not.toContain("未绑定");
    expect(replies[0]?.text).not.toContain("not bound");
    service.disposeAll();
  });

  it("QQ 绑定前普通命令不再提示未绑定（QQ 私聊首条消息即默认主人）", async () => {
    const repo = f.createMemoryRepo(qqConfig());
    const service = f.createBotsService({
      credentialService: f.createCredentialService({
        "qq-credential": "1903916680:APP_SECRET_QQ",
      }),
      legacyTaskService: f.createLegacyTaskService(),
      repo: repo as never,
    });

    const replies = await service.handleInboundMessage({
      botId: "qq-bot-1",
      text: "/状态",
      actor: qqActor,
    });
    // 新机制下 QQ 私聊不再要求先 /bind：命令正常执行，不提示未绑定
    expect(replies[0]?.text).not.toContain("未绑定");
    expect(replies[0]?.text).toContain("工作区");
    service.disposeAll();
  });

  it("QQ 首个私聊发送者默认为主人：AppID 迁移到 qqAppId，providerUserId 落成 openid", async () => {
    const repo = f.createMemoryRepo(qqConfig());
    const service = f.createBotsService({
      credentialService: f.createCredentialService({
        "qq-credential": "1903916680:APP_SECRET_QQ",
      }),
      legacyTaskService: f.createLegacyTaskService(),
      repo: repo as never,
    });

    const replies = await service.handleInboundMessage({
      botId: "qq-bot-1",
      text: "你好",
      actor: qqActor,
    });

    // 首条消息回欢迎语，不把"你好"当成任务 prompt
    expect(replies[0]?.text).toContain("QQ Bot 已激活");

    const config = await repo.readConfig();
    const bot = config.bots.find((b) => b.id === "qq-bot-1")!;
    // AppID 已迁移到 qqAppId，不再丢失
    expect(bot.qqAppId).toBe("1903916680");
    // providerUserId 现在是默认主人 openid
    expect(bot.providerUserId).toBe("USER_OPENID_QQ_123");
    service.disposeAll();
  });

  it("QQ 首个私聊发送者激活后，后续消息作为主人正常执行且不再回欢迎语", async () => {
    const repo = f.createMemoryRepo(qqConfig());
    const service = f.createBotsService({
      credentialService: f.createCredentialService({
        "qq-credential": "1903916680:APP_SECRET_QQ",
      }),
      legacyTaskService: f.createLegacyTaskService(),
      repo: repo as never,
    });

    await service.handleInboundMessage({
      botId: "qq-bot-1",
      text: "你好",
      actor: qqActor,
    });

    const replies = await service.handleInboundMessage({
      botId: "qq-bot-1",
      text: "/状态",
      actor: qqActor,
    });
    // 不再回欢迎语，也不是"未绑定"
    expect(replies[0]?.text).not.toContain("QQ Bot 已激活");
    expect(replies[0]?.text).not.toContain("未绑定");
    expect(replies[0]?.text).toContain("工作区");
    service.disposeAll();
  });

  it("QQ 手动 /bind 后，普通消息只补激活标记不覆盖主人", async () => {
    const repo = f.createMemoryRepo(qqConfig());
    const service = f.createBotsService({
      credentialService: f.createCredentialService({
        "qq-credential": "1903916680:APP_SECRET_QQ",
      }),
      legacyTaskService: f.createLegacyTaskService(),
      repo: repo as never,
    });

    const code = await service.createBindCode({ botId: "qq-bot-1" });
    await service.handleInboundMessage({
      botId: "qq-bot-1",
      text: `/bind ${code.code}`,
      actor: qqActor,
    });

    const replies = await service.handleInboundMessage({
      botId: "qq-bot-1",
      text: "你好",
      actor: qqActor,
    });
    // 已绑定用户，不覆盖主人；任务已提交（空回复由任务流推送），不回欢迎语
    expect(replies.length).toBe(0);

    const config = await repo.readConfig();
    const bot = config.bots.find((b) => b.id === "qq-bot-1")!;
    expect(bot.qqAppId).toBe("1903916680");
    expect(bot.providerUserId).toBe("USER_OPENID_QQ_123");
    service.disposeAll();
  });
});
