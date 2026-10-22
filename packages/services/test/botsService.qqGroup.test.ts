import { afterEach, describe, expect, it, vi } from "vitest";
import type { BotOutboundMessage } from "@zcode/shared";
import * as f from "./botsService.fixtures.js";

/** 捕获 QQ provider.send 的出站消息，验证群聊/私聊 API 路由正确。 */
const qqSendMock = vi.hoisted(() => vi.fn(async () => ({})));
const qqGetGroupInfoMock = vi.hoisted(() =>
  vi.fn(async () => ({ name: "QQ 测试群", chatMode: "group" })),
);

vi.mock("../src/bots/providers/qqProvider.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/bots/providers/qqProvider.js")>();
  return {
    ...actual,
    createQQBotProvider: (...args: Parameters<typeof actual.createQQBotProvider>) => ({
      ...actual.createQQBotProvider(...args),
      send: qqSendMock,
      getGroupInfo: qqGetGroupInfoMock,
    }),
  };
});

const services: Array<ReturnType<typeof f.createBotsService>> = [];
afterEach(async () => {
  qqSendMock.mockClear();
  qqGetGroupInfoMock.mockClear();
  for (const service of services.splice(0)) await service.disposeAllAndWait();
});

function qqConfig(): import("@zcode/shared").BotsConfigFile {
  return {
    version: 3,
    bots: [
      {
        id: "qq-bot-1",
        name: "QQ Bot",
        provider: "qq",
        enabled: true,
        credentialRef: "qq-credential",
        providerUserId: "1903916680", // AppID（绑定前）
        displayName: "1903916680",
        allowedWorkspaces: ["*"],
        allowedCommands: f.defaultUserCommands,
        currentOptions: {},
        replyMode: "assistant_changes",
      },
    ],
  };
}

/** 绑定 QQ 私聊：AppID 迁到 qqAppId，providerUserId 变成绑定用户 openid。 */
async function bindQQ(service: ReturnType<typeof f.createBotsService>, openid: string) {
  const code = await service.createBindCode({ botId: "qq-bot-1" });
  await service.handleInboundMessage({
    botId: "qq-bot-1",
    text: `/bind ${code.code}`,
    actor: {
      provider: "qq",
      botId: "qq-bot-1",
      providerUserId: openid,
      chatType: "private",
    },
  });
}

describe("QQ 群聊", () => {
  it("绑定用户在群内 /enable 后，群消息能正常回复且走群 API", async () => {
    const repo = f.createMemoryRepo(qqConfig());
    const service = f.createBotsService({
      credentialService: f.createCredentialService({ "qq-credential": "1903916680:APP_SECRET" }),
      legacyTaskService: f.createLegacyTaskService(),
      repo: repo as never,
    });
    services.push(service);

    const ownerOpenid = "OWNER_OPENID_QQ";
    await bindQQ(service, ownerOpenid);

    // 绑定用户在群里 @ 机器人发 /enable
    const enableReplies = await service.handleInboundMessage({
      botId: "qq-bot-1",
      text: "/enable",
      actor: {
        provider: "qq",
        botId: "qq-bot-1",
        providerUserId: ownerOpenid,
        chatType: "group",
        chatId: "GROUP_OPENID_QQ",
        mentionedBot: true,
      },
    });
    expect(enableReplies[0]?.text).toContain("群聊已启用");

    // 绑定用户在群里 @ 机器人发 /状态
    const statusReplies = await service.handleInboundMessage({
      botId: "qq-bot-1",
      text: "/状态",
      actor: {
        provider: "qq",
        botId: "qq-bot-1",
        providerUserId: ownerOpenid,
        chatType: "group",
        chatId: "GROUP_OPENID_QQ",
        mentionedBot: true,
      },
    });
    expect(statusReplies[0]?.text).not.toContain("未绑定");
    expect(statusReplies[0]?.text).not.toContain("仅支持私聊");

    // 出站消息应带 chatType=group 且 providerUserId=group_openid（供 qqProvider.send 选择群 API）
    const groupReplies = statusReplies.filter((r) => r.chatType === "group");
    expect(groupReplies.length).toBeGreaterThan(0);
    for (const r of groupReplies) {
      expect(r.providerUserId).toBe("GROUP_OPENID_QQ");
    }
  });

  it("群未启用时回复“此群尚未启用”", async () => {
    const repo = f.createMemoryRepo(qqConfig());
    const service = f.createBotsService({
      credentialService: f.createCredentialService({ "qq-credential": "1903916680:APP_SECRET" }),
      legacyTaskService: f.createLegacyTaskService(),
      repo: repo as never,
    });
    services.push(service);

    const ownerOpenid = "OWNER_OPENID_QQ";
    await bindQQ(service, ownerOpenid);

    const replies = await service.handleInboundMessage({
      botId: "qq-bot-1",
      text: "/状态",
      actor: {
        provider: "qq",
        botId: "qq-bot-1",
        providerUserId: ownerOpenid,
        chatType: "group",
        chatId: "GROUP_OPENID_QQ",
        mentionedBot: true,
      },
    });
    expect(replies[0]?.text).toContain("此群尚未启用");
  });

  it("非绑定用户在群内无法启用群", async () => {
    const repo = f.createMemoryRepo(qqConfig());
    const service = f.createBotsService({
      credentialService: f.createCredentialService({ "qq-credential": "1903916680:APP_SECRET" }),
      legacyTaskService: f.createLegacyTaskService(),
      repo: repo as never,
    });
    services.push(service);

    await bindQQ(service, "OWNER_OPENID_QQ");

    const replies = await service.handleInboundMessage({
      botId: "qq-bot-1",
      text: "/enable",
      actor: {
        provider: "qq",
        botId: "qq-bot-1",
        providerUserId: "OTHER_MEMBER_OPENID",
        chatType: "group",
        chatId: "GROUP_OPENID_QQ",
        mentionedBot: true,
      },
    });
    expect(replies[0]?.text).toContain("仅绑定机器人的用户");
  });
});
