import type { ContextChipType } from "@/mentions/mentionTypes.js";
import type { CodeCommentComposerAttachment } from "@/lib/codeCommentContext.js";
import type { WebElementContextComposerAttachment } from "@/lib/webElementContext.js";
import type { PptxElementReference } from "@/lib/pptxElementReference.js";
import type { ConversationSelectionDisplayReference } from "@/lib/conversationSelectionReference.js";
import type { PluginUiModelContext } from "@/plugin-ui/index.js";
import { formatPluginUiContextLabel } from "@/plugin-ui/domain/pluginUiModelContext.js";

/**
 * 「添加到聊天」的上下文统一转成编辑器内 context chip 的展示参数。
 * 编辑器内 chip 只承担视觉占位与删除映射（data.attachmentId）；
 * markdown 恒为空字符串，避免污染 getMarkdown() 返回的发送正文 ——
 * 上下文内容由各 hook 的 state 持有，发送时仍由 serializeComposerPromptContexts
 * 按尾块契约拼接。这也保证消息行 parseComposerPromptContexts 能无损还原。
 */
export interface ContextChipInsertion {
  id: string;
  label: string;
  value: string;
  attachmentType: ContextChipType;
}

export type ContextChipInsertionContext =
  | CodeCommentComposerAttachment
  | WebElementContextComposerAttachment
  | PptxElementReference
  | ConversationSelectionDisplayReference
  | PluginUiModelContext;

/**
 * 编辑器内 context chip 的 data.attachmentId 前缀了类型，删除事件据此分发到
 * 对应 context state 的 remove 函数；裸 id 在 5 类 context 间可能重复。
 */
export function buildContextChipAttachmentId(
  kind: ContextChipType,
  id: string,
): string {
  return `${kind}:${id}`;
}

export function parseContextChipAttachmentId(
  attachmentId: string,
): { kind: ContextChipType; id: string } | null {
  const separatorIndex = attachmentId.indexOf(":");
  if (separatorIndex < 0) return null;
  const kind = attachmentId.slice(0, separatorIndex);
  const id = attachmentId.slice(separatorIndex + 1);
  switch (kind) {
    case "code-comment":
    case "pptx":
    case "conversation-selection":
    case "web-element":
    case "plugin-ui":
      return { kind, id };
    default:
      return null;
  }
}

function truncateLabel(text: string, maxLength = 48): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}…`
    : normalized;
}

export function toContextChipInsertion(
  kind: ContextChipType,
  context:
    | CodeCommentComposerAttachment
    | WebElementContextComposerAttachment
    | PptxElementReference
    | ConversationSelectionDisplayReference
    | PluginUiModelContext,
): ContextChipInsertion | null {
  switch (kind) {
    case "code-comment": {
      const comment = context as CodeCommentComposerAttachment;
      return {
        id: comment.id,
        label: truncateLabel(
          comment.comment.trim() || comment.selectedText || comment.sourceTitle,
        ),
        value: comment.sourcePath ?? comment.sourceTitle,
        attachmentType: "code-comment",
      };
    }
    case "web-element": {
      const element = context as WebElementContextComposerAttachment;
      const label =
        element.accessibleName ||
        element.text ||
        element.selector ||
        element.tagName.toLowerCase();
      return {
        id: element.id,
        label: truncateLabel(label),
        value: element.pageUrl,
        attachmentType: "web-element",
      };
    }
    case "pptx": {
      const reference = context as PptxElementReference;
      const label =
        reference.selectedText ||
        reference.text ||
        reference.nodeName ||
        reference.nodeType;
      return {
        id: reference.id,
        label: truncateLabel(label),
        value: reference.sourceTitle,
        attachmentType: "pptx",
      };
    }
    case "conversation-selection": {
      const selection = context as ConversationSelectionDisplayReference;
      const id =
        "id" in selection
          ? selection.id
          : `selection:${selection.text.slice(0, 16)}`;
      return {
        id,
        label: truncateLabel(selection.text),
        value: selection.path ?? "",
        attachmentType: "conversation-selection",
      };
    }
    case "plugin-ui": {
      const pluginContext = context as PluginUiModelContext;
      return {
        id: pluginContext.id,
        label: truncateLabel(
          `${formatPluginUiContextLabel(pluginContext)} · ${pluginContext.text}`,
        ),
        value: pluginContext.pluginId,
        attachmentType: "plugin-ui",
      };
    }
    default: {
      const exhaustive: never = kind;
      return exhaustive as unknown as ContextChipInsertion | null;
    }
  }
}
