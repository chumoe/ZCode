import { useCallback } from "react";
import { useFileManagerStore } from "@/store/fileManagerStore.js";

/**
 * 文件管理器剪贴板 hook：读写 fileManagerStore 的剪贴板状态。
 */
export function useFileManagerClipboard() {
  const { clipboardPaths, clipboardMode, copyToClipboard, cutToClipboard, clearClipboard } =
    useFileManagerStore();

  const handleCopy = useCallback(
    (paths: string[]) => {
      if (paths.length > 0) {
        copyToClipboard(paths);
      }
    },
    [copyToClipboard],
  );

  const handleCut = useCallback(
    (paths: string[]) => {
      if (paths.length > 0) {
        cutToClipboard(paths);
      }
    },
    [cutToClipboard],
  );

  return {
    clipboardPaths,
    clipboardMode,
    handleCopy,
    handleCut,
    clearClipboard,
    hasClipboard: clipboardPaths.length > 0,
  };
}
