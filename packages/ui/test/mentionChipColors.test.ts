import { describe, expect, it } from "vitest";
import { getPromptMentionVariantClassName } from "@/mentions/mentionChip.js";
import type { MentionItemData } from "@/mentions/mentionTypes.js";

const contextTypes: MentionItemData["attachmentType"][] = [
  "web-element",
  "code-comment",
  "conversation-selection",
  "pptx",
  "plugin-ui",
];

describe("getPromptMentionVariantClassName", () => {
  it("keeps existing category colors unchanged", () => {
    expect(getPromptMentionVariantClassName("files")).toBe(
      "text-file-node-foreground",
    );
    expect(getPromptMentionVariantClassName("skills")).toBe(
      "text-skill-node-foreground",
    );
    expect(getPromptMentionVariantClassName("sessions")).toBe(
      "text-session-node-foreground",
    );
    expect(getPromptMentionVariantClassName("plugins")).toBe(
      "text-plugin-node-foreground",
    );
  });

  it("returns a distinct color class per context subtype", () => {
    const colors = contextTypes.map((type) =>
      getPromptMentionVariantClassName("contexts", type),
    );
    // 5 类 context 两两颜色不同
    expect(new Set(colors).size).toBe(5);
    expect(colors).toContain("text-web-element-node-foreground");
    expect(colors).toContain("text-code-comment-node-foreground");
    expect(colors).toContain("text-conversation-selection-node-foreground");
    expect(colors).toContain("text-pptx-node-foreground");
    expect(colors).toContain("text-plugin-ui-node-foreground");
  });

  it("falls back to the shared context color when subtype is unknown", () => {
    expect(getPromptMentionVariantClassName("contexts", undefined)).toBe(
      "text-context-node-foreground",
    );
  });

  it("ignores attachmentType for non-context categories", () => {
    expect(getPromptMentionVariantClassName("attachments", "web-element")).toBe(
      "text-attachment-node-foreground",
    );
  });
});
