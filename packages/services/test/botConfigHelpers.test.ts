import { describe, expect, it } from "vitest";
import { findAuthorizedBot } from "../src/bots/botConfigHelpers.js";
import type { BotActor, BotsConfigFile } from "@zcode/shared";

/**
 * QQ 机器人的 providerUserId 是机器人 AppID（扫码注册写入），
 * 而消息 actor.providerUserId 是用户 openid —— 两者语义不同，
 * 授权匹配必须按 bot.id === actor.botId，不能按 providerUserId 相等。
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
        credentialRef: "bot:qq-bot-1:credential",
        providerUserId: "1903916680", // 机器人 AppID
        displayName: "1903916680",
        allowedWorkspaces: ["*"],
        allowedCommands: {},
        currentOptions: {},
      },
    ],
  };
}

describe("findAuthorizedBot - QQ", () => {
  it("私聊消息按 botId 匹配到启用的 QQ bot", () => {
    const config = qqConfig();
    const actor: BotActor = {
      provider: "qq",
      botId: "qq-bot-1",
      providerUserId: "USER_OPENID_123", // 用户 openid，与 AppID 不同
      chatType: "private",
    };
    const bot = findAuthorizedBot(config, actor);
    expect(bot?.id).toBe("qq-bot-1");
  });

  it("群聊消息按 botId 匹配到启用的 QQ bot", () => {
    const config = qqConfig();
    const actor: BotActor = {
      provider: "qq",
      botId: "qq-bot-1",
      providerUserId: "MEMBER_OPENID_456",
      chatType: "group",
      chatId: "GROUP_OPENID_789",
    };
    const bot = findAuthorizedBot(config, actor);
    expect(bot?.id).toBe("qq-bot-1");
  });

  it("未启用的 QQ bot 不匹配", () => {
    const config = qqConfig();
    config.bots[0]!.enabled = false;
    const actor: BotActor = {
      provider: "qq",
      botId: "qq-bot-1",
      providerUserId: "USER_OPENID_123",
      chatType: "private",
    };
    expect(findAuthorizedBot(config, actor)).toBeNull();
  });

  it("不存在的 botId 不匹配", () => {
    const config = qqConfig();
    const actor: BotActor = {
      provider: "qq",
      botId: "qq-bot-999",
      providerUserId: "USER_OPENID_123",
      chatType: "private",
    };
    expect(findAuthorizedBot(config, actor)).toBeNull();
  });

  it("不同 provider 的 botId 不匹配", () => {
    const config = qqConfig();
    const actor: BotActor = {
      provider: "weixin",
      botId: "qq-bot-1",
      providerUserId: "USER_OPENID_123",
      chatType: "private",
    };
    expect(findAuthorizedBot(config, actor)).toBeNull();
  });
});

describe("findAuthorizedBot - 其他 provider 回归", () => {
  it("webhook/通用 provider 仍按 providerUserId 匹配", () => {
    const config: BotsConfigFile = {
      version: 3,
      bots: [
        {
          id: "webhook-1",
          name: "Webhook",
          provider: "webhook",
          enabled: true,
          providerUserId: "user-1",
          allowedWorkspaces: ["*"],
          allowedCommands: {},
          currentOptions: {},
        },
      ],
    };
    const actor: BotActor = {
      provider: "webhook",
      botId: "webhook-1",
      providerUserId: "user-1",
      chatType: "private",
    };
    expect(findAuthorizedBot(config, actor)?.id).toBe("webhook-1");
  });

  it("weixin 仍按 botId 匹配", () => {
    const config: BotsConfigFile = {
      version: 3,
      bots: [
        {
          id: "weixin-1",
          name: "Weixin",
          provider: "weixin",
          enabled: true,
          providerUserId: "wxid@im.bot",
          allowedWorkspaces: ["*"],
          allowedCommands: {},
          currentOptions: {},
        },
      ],
    };
    const actor: BotActor = {
      provider: "weixin",
      botId: "weixin-1",
      providerUserId: "user-openid",
      chatType: "private",
    };
    expect(findAuthorizedBot(config, actor)?.id).toBe("weixin-1");
  });
});
