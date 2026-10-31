import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PPTX_ELEMENT_REFERENCE_ADD_TO_CHAT_EVENT,
  addPptxElementReference,
  getPptxElementReferenceWorkspaceKey,
  isPptxElementReferenceInWorkspaceScope,
  isPptxElementReferenceAddToChatEvent,
  type PptxElementReference,
} from "@/lib/pptxElementReference.js";

export function usePptxElementReferences(options: {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  listenAddToChatEvents?: boolean;
  scopeId?: string | null;
  /** 引用加入后回调（编辑器内 context chip 的视觉占位由调用方负责插入）。 */
  onReferenceAdded?: (reference: PptxElementReference) => void;
}) {
  const {
    workspacePath,
    workspaceIdentity,
    remoteSessionId,
    listenAddToChatEvents = true,
    scopeId = null,
    onReferenceAdded,
  } = options;
  const [references, setReferences] = useState<readonly PptxElementReference[]>(
    [],
  );
  const workspaceKey = getPptxElementReferenceWorkspaceKey(
    workspacePath,
    workspaceIdentity,
  );
  const onReferenceAddedRef = useRef(onReferenceAdded);
  onReferenceAddedRef.current = onReferenceAdded;
  const referencesRef = useRef(references);
  referencesRef.current = references;

  useEffect(() => {
    setReferences([]);
  }, [remoteSessionId, scopeId, workspaceKey]);

  const removeReference = useCallback((id: string) => {
    setReferences((items) => items.filter((item) => item.id !== id));
  }, []);
  const clearReferences = useCallback(() => setReferences([]), []);

  useEffect(() => {
    if (!listenAddToChatEvents || typeof window === "undefined") {
      return;
    }
    const handleAdd = (event: Event) => {
      if (!isPptxElementReferenceAddToChatEvent(event)) {
        return;
      }
      const reference = event.detail;
      if (
        !isPptxElementReferenceInWorkspaceScope(reference, {
          workspacePath,
          workspaceIdentity,
          remoteSessionId,
        })
      ) {
        return;
      }
      event.preventDefault();
      const existing = referencesRef.current.some(
        (item) => item.id === reference.id,
      );
      setReferences((items) => addPptxElementReference(items, reference));
      // updater 保持纯函数；新增判定与回调放到 updater 外，避免 StrictMode 双执行重复插入。
      if (!existing) {
        onReferenceAddedRef.current?.(reference);
      }
    };
    window.addEventListener(
      PPTX_ELEMENT_REFERENCE_ADD_TO_CHAT_EVENT,
      handleAdd,
    );
    return () =>
      window.removeEventListener(
        PPTX_ELEMENT_REFERENCE_ADD_TO_CHAT_EVENT,
        handleAdd,
      );
  }, [
    listenAddToChatEvents,
    remoteSessionId,
    workspaceIdentity,
    workspaceKey,
    workspacePath,
  ]);

  return useMemo(
    () => ({
      references,
      hasReferences: references.length > 0,
      removeReference,
      clearReferences,
    }),
    [clearReferences, references, removeReference],
  );
}
