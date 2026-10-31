import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearConversationSelectionReferenceLimitReason,
  getConversationSelectionReferenceScope,
  getConversationSelectionReferenceLimitReason,
  getConversationSelectionAddEventName,
  isConversationSelectionAddEvent,
  setConversationSelectionReferenceScope,
  type ConversationSelectionLimitReason,
  type ConversationSelectionReference,
} from "@/lib/conversationSelectionReference.js";

export function useConversationSelectionReferences(options: {
  sessionId: string | null;
  workspaceKey: string;
  draftScopeKey?: string;
  /** 引用加入后回调（编辑器内 context chip 的视觉占位由调用方负责插入）。 */
  onReferenceAdded?: (reference: ConversationSelectionReference) => void;
}) {
  const [references, setReferencesState] = useState<
    readonly ConversationSelectionReference[]
  >(() =>
    getConversationSelectionReferenceScope(
      options.sessionId,
      options.workspaceKey,
      options.draftScopeKey,
    ),
  );
  const [limitReason, setLimitReason] =
    useState<ConversationSelectionLimitReason | null>(() =>
      getConversationSelectionReferenceLimitReason(
        options.sessionId,
        options.workspaceKey,
        options.draftScopeKey,
      ),
    );
  const onReferenceAddedRef = useRef(options.onReferenceAdded);
  onReferenceAddedRef.current = options.onReferenceAdded;

  useEffect(() => {
    setReferencesState(
      getConversationSelectionReferenceScope(
        options.sessionId,
        options.workspaceKey,
        options.draftScopeKey,
      ),
    );
    setLimitReason(
      getConversationSelectionReferenceLimitReason(
        options.sessionId,
        options.workspaceKey,
        options.draftScopeKey,
      ),
    );
  }, [options.sessionId, options.workspaceKey, options.draftScopeKey]);

  const setReferences = useCallback(
    (
      update:
        | readonly ConversationSelectionReference[]
        | ((
            current: readonly ConversationSelectionReference[],
          ) => readonly ConversationSelectionReference[]),
    ) => {
      setReferencesState((current) => {
        const next = typeof update === "function" ? update(current) : update;
        setConversationSelectionReferenceScope(
          options.sessionId,
          options.workspaceKey,
          next,
          options.draftScopeKey,
        );
        return next;
      });
    },
    [options.sessionId, options.workspaceKey, options.draftScopeKey],
  );

  useEffect(() => {
    const handleAdd = (event: Event) => {
      if (!isConversationSelectionAddEvent(event)) return;
      if (
        event.detail.targetSessionId !== options.sessionId ||
        event.detail.workspaceKey !== options.workspaceKey ||
        (options.sessionId === null &&
          event.detail.draftScopeKey !== options.draftScopeKey)
      ) {
        return;
      }
      setReferencesState(
        getConversationSelectionReferenceScope(
          options.sessionId,
          options.workspaceKey,
          options.draftScopeKey,
        ),
      );
      setLimitReason(
        getConversationSelectionReferenceLimitReason(
          options.sessionId,
          options.workspaceKey,
          options.draftScopeKey,
        ),
      );
      // 只对实际新增（非重复）的引用触发编辑器 chip 插入，避免重复点击同一引用时反复插入。
      if (event.detail.result?.ok && !event.detail.result.duplicate) {
        onReferenceAddedRef.current?.(event.detail.reference);
      }
    };
    window.addEventListener(getConversationSelectionAddEventName(), handleAdd);
    return () =>
      window.removeEventListener(
        getConversationSelectionAddEventName(),
        handleAdd,
      );
  }, [options.sessionId, options.workspaceKey, options.draftScopeKey]);

  const removeReference = useCallback(
    (id: string) => {
      setReferences((current) =>
        current.filter((reference) => reference.id !== id),
      );
      setLimitReason(null);
    },
    [setReferences],
  );
  const clearReferences = useCallback(() => {
    setReferences([]);
    setLimitReason(null);
  }, [setReferences]);
  const dismissLimitReason = useCallback(() => {
    clearConversationSelectionReferenceLimitReason(
      options.sessionId,
      options.workspaceKey,
      options.draftScopeKey,
    );
    setLimitReason(null);
  }, [options.sessionId, options.workspaceKey, options.draftScopeKey]);

  return {
    references,
    limitReason,
    dismissLimitReason,
    removeReference,
    clearReferences,
  };
}
