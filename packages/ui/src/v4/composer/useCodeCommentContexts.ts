import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CODE_COMMENT_ADD_TO_CHAT_EVENT,
  CODE_COMMENT_REMOVE_FROM_CHAT_EVENT,
  getCodeCommentWorkspaceKey,
  isCodeCommentAddToChatEvent,
  isCodeCommentPayload,
  isCodeCommentRemoveFromChatEvent,
  isCodeCommentRemovePayload,
  type CodeCommentComposerAttachment,
} from "@/lib/codeCommentContext.js";

export interface UseCodeCommentContextsOptions {
  listenAddToChatEvents?: boolean;
  onContextRemoved?: (context: CodeCommentComposerAttachment) => void;
  requestFocus?: () => void;
  scopeKey: string;
  /** 上下文加入后回调（编辑器内 context chip 的视觉占位由调用方负责插入）。 */
  onContextAdded?: (context: CodeCommentComposerAttachment) => void;
}

export interface UseCodeCommentContextsResult {
  contexts: readonly CodeCommentComposerAttachment[];
  hasContexts: boolean;
  removeContext: (
    context: Pick<
      CodeCommentComposerAttachment,
      "id" | "workspaceIdentity" | "workspacePath"
    >,
  ) => void;
  clearContexts: () => void;
  getContexts: () => readonly CodeCommentComposerAttachment[];
}

function createCodeCommentAttachmentId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `code-comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function contextKey(
  context: Pick<
    CodeCommentComposerAttachment,
    "id" | "workspaceIdentity" | "workspacePath"
  >,
) {
  return `${getCodeCommentWorkspaceKey(context.workspacePath, context.workspaceIdentity)}\0${context.id}`;
}

export function useCodeCommentContexts({
  listenAddToChatEvents = true,
  onContextRemoved,
  requestFocus,
  scopeKey,
  onContextAdded,
}: UseCodeCommentContextsOptions): UseCodeCommentContextsResult {
  const [contexts, setContexts] = useState<
    readonly CodeCommentComposerAttachment[]
  >([]);
  const contextsRef = useRef(contexts);
  const callbacksRef = useRef({
    onContextRemoved,
    requestFocus,
    onContextAdded,
  });
  const scopeKeyRef = useRef(scopeKey);
  callbacksRef.current = { onContextRemoved, requestFocus, onContextAdded };

  const commitContexts = useCallback(
    (next: readonly CodeCommentComposerAttachment[]) => {
      const nextKeys = new Set(next.map(contextKey));
      for (const context of contextsRef.current) {
        if (!nextKeys.has(contextKey(context))) {
          callbacksRef.current.onContextRemoved?.(context);
        }
      }
      contextsRef.current = next;
      setContexts(next);
    },
    [],
  );

  const removeContext = useCallback(
    (
      target: Pick<
        CodeCommentComposerAttachment,
        "id" | "workspaceIdentity" | "workspacePath"
      >,
    ) => {
      const targetKey = contextKey(target);
      const next = contextsRef.current.filter(
        (context) => contextKey(context) !== targetKey,
      );
      if (next.length !== contextsRef.current.length) {
        commitContexts(next);
      }
    },
    [commitContexts],
  );

  const clearContexts = useCallback(() => {
    if (contextsRef.current.length > 0) {
      commitContexts([]);
    }
  }, [commitContexts]);

  const getContexts = useCallback(() => contextsRef.current, []);

  useEffect(() => {
    if (scopeKeyRef.current === scopeKey) return;
    scopeKeyRef.current = scopeKey;
    clearContexts();
  }, [clearContexts, scopeKey]);

  useEffect(() => {
    if (!listenAddToChatEvents || typeof window === "undefined") return;

    const handleAdd = (event: Event) => {
      if (
        !isCodeCommentAddToChatEvent(event) ||
        !isCodeCommentPayload(event.detail) ||
        event.defaultPrevented ||
        !event.cancelable
      ) {
        return;
      }
      // V4 迁移只保留了 PreviewPane 的事件发送端，没有任何 composer
      // 消费端；claim 后由唯一 primary pane 接管，避免分屏时重复写入多个输入区。
      event.preventDefault();
      if (!event.defaultPrevented) return;
      const attachment: CodeCommentComposerAttachment = {
        ...event.detail,
        id: event.detail.id ?? createCodeCommentAttachmentId(),
      };
      const key = contextKey(attachment);
      const existingIndex = contextsRef.current.findIndex(
        (context) => contextKey(context) === key,
      );
      const next =
        existingIndex < 0
          ? [...contextsRef.current, attachment]
          : contextsRef.current.map((context, index) =>
              index === existingIndex ? attachment : context,
            );
      commitContexts(next);
      // 只对新增（非替换）触发编辑器 chip 插入，避免重复添加同一 context 时反复插入。
      if (existingIndex < 0) {
        callbacksRef.current.onContextAdded?.(attachment);
      }
      callbacksRef.current.requestFocus?.();
    };

    const handleRemove = (event: Event) => {
      if (
        !isCodeCommentRemoveFromChatEvent(event) ||
        !isCodeCommentRemovePayload(event.detail)
      ) {
        return;
      }
      removeContext(event.detail);
    };

    window.addEventListener(CODE_COMMENT_ADD_TO_CHAT_EVENT, handleAdd);
    window.addEventListener(CODE_COMMENT_REMOVE_FROM_CHAT_EVENT, handleRemove);
    return () => {
      window.removeEventListener(CODE_COMMENT_ADD_TO_CHAT_EVENT, handleAdd);
      window.removeEventListener(
        CODE_COMMENT_REMOVE_FROM_CHAT_EVENT,
        handleRemove,
      );
    };
  }, [commitContexts, listenAddToChatEvents, removeContext]);

  return useMemo(
    () => ({
      contexts,
      hasContexts: contexts.length > 0,
      removeContext,
      clearContexts,
      getContexts,
    }),
    [clearContexts, contexts, getContexts, removeContext],
  );
}
