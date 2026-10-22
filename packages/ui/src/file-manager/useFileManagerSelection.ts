import { useCallback } from "react";
import { useFileManagerStore } from "@/store/fileManagerStore.js";

/**
 * 文件管理器选择逻辑 hook。
 * 处理 Ctrl/Cmd+Click 追加选择、Shift+Click 范围选择、普通点击单选。
 */
export function useFileManagerSelection(allRowPaths: string[]) {
  const { selectedPaths, lastSelectedPath, selectPath, addToSelection, selectRange, selectAll, clearSelection } =
    useFileManagerStore();

  const handleRowClick = useCallback(
    (path: string, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
      const isModifierAdd = event.ctrlKey || event.metaKey;

      if (event.shiftKey && lastSelectedPath) {
        // Shift+Click：范围选择
        const anchorIndex = allRowPaths.indexOf(lastSelectedPath);
        const targetIndex = allRowPaths.indexOf(path);
        if (anchorIndex >= 0 && targetIndex >= 0) {
          const start = Math.min(anchorIndex, targetIndex);
          const end = Math.max(anchorIndex, targetIndex);
          const rangePaths = allRowPaths.slice(start, end + 1);
          selectRange(rangePaths);
          return;
        }
      }

      if (isModifierAdd) {
        // Ctrl/Cmd+Click：追加选择
        addToSelection(path);
        return;
      }

      // 普通点击：单选
      selectPath(path);
    },
    [allRowPaths, lastSelectedPath, selectPath, addToSelection, selectRange],
  );

  const handleSelectAll = useCallback(() => {
    selectAll(allRowPaths);
  }, [allRowPaths, selectAll]);

  return {
    selectedPaths,
    lastSelectedPath,
    handleRowClick,
    handleSelectAll,
    clearSelection,
  };
}
