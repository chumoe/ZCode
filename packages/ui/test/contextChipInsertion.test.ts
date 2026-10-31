import { describe, expect, it } from "vitest";
import {
  buildContextChipAttachmentId,
  parseContextChipAttachmentId,
  toContextChipInsertion,
} from "@/v4/composer/contextChipInsertion.js";

describe("contextChipInsertion", () => {
  describe("toContextChipInsertion", () => {
    it("maps a web element context to an insertion with a truncated label", () => {
      const insertion = toContextChipInsertion("web-element", {
        id: "web-1",
        workspacePath: "/workspace",
        pageUrl: "https://example.com",
        pageTitle: "Example",
        tagName: "button",
        accessibleName: "Submit order",
        capturedAt: 1,
      });
      expect(insertion).toEqual({
        id: "web-1",
        label: "Submit order",
        value: "https://example.com",
        attachmentType: "web-element",
      });
    });

    it("maps a code comment context using its comment text", () => {
      const insertion = toContextChipInsertion("code-comment", {
        id: "cc-1",
        workspacePath: "/workspace",
        sourcePath: "/workspace/src/a.ts",
        sourceTitle: "a.ts",
        startLine: 3,
        endLine: 5,
        selectedText: "const x = 1",
        comment: "check this",
      });
      expect(insertion).toEqual({
        id: "cc-1",
        label: "check this",
        value: "/workspace/src/a.ts",
        attachmentType: "code-comment",
      });
    });

    it("falls back to selectedText/sourceTitle when comment is empty", () => {
      const insertion = toContextChipInsertion("code-comment", {
        id: "cc-2",
        workspacePath: "/workspace",
        sourceTitle: "b.ts",
        startLine: 1,
        endLine: 1,
        selectedText: "export function f()",
        comment: "",
      });
      expect(insertion?.label).toBe("export function f()");
    });

    it("maps a pptx reference", () => {
      const insertion = toContextChipInsertion("pptx", {
        id: "pptx-1",
        workspacePath: "/workspace",
        sourcePath: "/workspace/demo.pptx",
        sourceTitle: "demo.pptx",
        slideIndex: 2,
        nodeId: "n3",
        nodeType: "text",
        nodeName: "textbox",
        selectedText: "Revenue",
      });
      expect(insertion).toEqual({
        id: "pptx-1",
        label: "Revenue",
        value: "demo.pptx",
        attachmentType: "pptx",
      });
    });

    it("maps a conversation selection", () => {
      const insertion = toContextChipInsertion("conversation-selection", {
        id: "sel-1",
        text: "please refactor this module",
      });
      expect(insertion).toEqual({
        id: "sel-1",
        label: "please refactor this module",
        value: "",
        attachmentType: "conversation-selection",
      });
    });

    it("maps a plugin ui context", () => {
      const insertion = toContextChipInsertion("plugin-ui", {
        id: "plg-1",
        sessionId: "sess_1",
        pluginId: "my-plugin@market",
        toolCallId: "call-1",
        text: "loaded data",
      });
      expect(insertion?.id).toBe("plg-1");
      expect(insertion?.attachmentType).toBe("plugin-ui");
      expect(insertion?.value).toBe("my-plugin@market");
      expect(insertion?.label).toContain("loaded data");
    });

    it("truncates long labels", () => {
      const insertion = toContextChipInsertion("conversation-selection", {
        id: "sel-long",
        text: "x".repeat(200),
      });
      expect(insertion?.label.length).toBeLessThan(200);
      expect(insertion?.label.endsWith("…")).toBe(true);
    });
  });

  describe("attachment id round-trip", () => {
    it("prefixes kind and parses back", () => {
      const attachmentId = buildContextChipAttachmentId("web-element", "web-1");
      expect(attachmentId).toBe("web-element:web-1");
      expect(parseContextChipAttachmentId(attachmentId)).toEqual({
        kind: "web-element",
        id: "web-1",
      });
    });

    it("returns null for unknown kinds", () => {
      expect(parseContextChipAttachmentId("files:abc")).toBeNull();
    });

    it("returns null when no separator present", () => {
      expect(parseContextChipAttachmentId("abc")).toBeNull();
    });
  });
});
