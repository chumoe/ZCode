import { useCallback } from "react";
import { useWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useFileManagerStore } from "@/store/fileManagerStore.js";
import { joinFilePath, getContainingDirectoryPath, getPathLeaf } from "@/lib/path.js";
import { toast } from "@/components/ui/toast.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

interface UseFileManagerActionsOptions {
  workspacePath: string;
  workspaceIdentity?: string;
  workspaceRemoteSessionId?: string;
}

/**
 * 文件管理器操作 hook：复制/移动/删除/重命名/新建，调用 IFileService。
 */
export function useFileManagerActions({
  workspacePath,
  workspaceIdentity,
  workspaceRemoteSessionId,
}: UseFileManagerActionsOptions) {
  const { intl } = useZCodeIntl();
  const { fileService } = useWorkspaceServices(
    workspacePath,
    workspaceRemoteSessionId ?? null,
    workspaceIdentity,
  );
  const { clipboardPaths, clipboardMode, clearClipboard, selectedPaths, clearSelection } =
    useFileManagerStore();

  const t = useCallback(
    (id: string) => intl.formatMessage({ id }),
    [intl],
  );

  const deleteItems = useCallback(
    async (paths: string[]): Promise<boolean> => {
      try {
        await Promise.all(paths.map((path) => fileService.deleteItem({ path })));
        toast(t("fileManager.deleteSuccess"));
        clearSelection();
        return true;
      } catch (error) {
        toast(
          `${t("fileManager.deleteFailed")}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return false;
      }
    },
    [fileService, clearSelection, t],
  );

  const renameItem = useCallback(
    async (oldPath: string, newName: string): Promise<boolean> => {
      try {
        const parentDir = getContainingDirectoryPath(oldPath);
        if (!parentDir) return false;
        const newPath = joinFilePath(parentDir, newName);
        if (newPath === oldPath) return true;
        await fileService.moveItem({ sourcePath: oldPath, targetPath: newPath });
        clearSelection();
        return true;
      } catch (error) {
        toast(
          `${t("fileManager.renameFailed")}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return false;
      }
    },
    [fileService, clearSelection, t],
  );

  const createNewFile = useCallback(
    async (parentPath: string, name: string): Promise<boolean> => {
      try {
        const filePath = joinFilePath(parentPath, name);
        await fileService.writeTextFile({ path: filePath, content: "" });
        return true;
      } catch (error) {
        toast(
          `${t("fileManager.newFileFailed")}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return false;
      }
    },
    [fileService, t],
  );

  const createNewFolder = useCallback(
    async (parentPath: string, name: string): Promise<boolean> => {
      try {
        const folderPath = joinFilePath(parentPath, name);
        await fileService.createDirectory({ path: folderPath });
        return true;
      } catch (error) {
        toast(
          `${t("fileManager.newFolderFailed")}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return false;
      }
    },
    [fileService, t],
  );

  const pasteItems = useCallback(
    async (targetDir: string): Promise<boolean> => {
      if (clipboardPaths.length === 0 || !clipboardMode) return false;
      try {
        await Promise.all(
          clipboardPaths.map(async (sourcePath, index) => {
            const name = getPathLeaf(sourcePath);
            // 同名冲突：追加 " (副本 N)" 后缀
            const dotIndex = name.lastIndexOf(".");
            const baseName = dotIndex > 0 ? name.slice(0, dotIndex) : name;
            const ext = dotIndex > 0 ? name.slice(dotIndex) : "";
            const suffix = index > 0 ? ` (${index + 1})` : " (副本)";
            const targetName = `${baseName}${suffix}${ext}`;
            const targetPath = joinFilePath(targetDir, targetName);

            if (clipboardMode === "copy") {
              await fileService.copyItem({ sourcePath, targetPath });
            } else {
              await fileService.moveItem({ sourcePath, targetPath });
            }
          }),
        );
        toast(t("fileManager.pasteSuccess"));
        if (clipboardMode === "cut") {
          clearClipboard();
        }
        clearSelection();
        return true;
      } catch (error) {
        toast(
          `${t("fileManager.pasteFailed")}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return false;
      }
    },
    [fileService, clipboardPaths, clipboardMode, clearClipboard, clearSelection, t],
  );

  return {
    deleteItems,
    renameItem,
    createNewFile,
    createNewFolder,
    pasteItems,
    clipboardPaths,
    clipboardMode,
  };
}
