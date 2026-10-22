import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { RefreshCw, Search, X } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useWorkspaceFileTreeData } from "@/workspace-file-tree/useWorkspaceFileTreeData.js";
import { useInstalledFileTreeEditors } from "@/workspace-file-tree/useInstalledFileTreeEditors.js";
import { useWorkspaceOpenInEditorTarget } from "@/hooks/useWorkspaceOpenInEditorTarget.js";
import { resolveWorkspaceEditorSelection } from "@/lib/workspaceEditorSelection.js";
import {
  createCodeViewerSourceForWorkspaceFile,
  getWorkspaceFileGitStatus,
  filterWorkspaceFileTreeRows,
  getWorkspaceFileDirectoryChildDepth,
  type WorkspaceFileGitStatus,
  type WorkspaceFileTreeRow,
} from "@/workspace-file-tree/model.js";
import { WORKSPACE_FILE_TREE_VIRTUAL_ROW_HEIGHT_PX } from "@/workspace-file-tree/constants.js";
import { getFileManagerLabel } from "@/workspace-file-tree/helpers.js";
import { useFileManagerStore } from "@/store/fileManagerStore.js";
import { useFileManagerSelection } from "@/file-manager/useFileManagerSelection.js";
import { useFileManagerActions } from "@/file-manager/useFileManagerActions.js";
import { useFileManagerClipboard } from "@/file-manager/useFileManagerClipboard.js";
import { FileManagerRow } from "@/file-manager/FileManagerRow.js";
import { getWorkspaceFileTreeHierarchyGuideStyle } from "@/workspace-file-tree/hierarchyGuides.js";
import type { FileManagerContextMenuLabels } from "@/file-manager/types.js";
import type { CodeViewerSource } from "@/lib/codeViewer.js";

interface FileManagerTreeProps {
  workspacePath: string;
  workspaceIdentity?: string;
  workspaceRemoteSessionId?: string;
  activePreviewPath?: string | null;
  onOpenPreview?: (source: CodeViewerSource) => void;
  onOpenBrowserUrl?: (url: string) => void;
}

export function FileManagerTree({
  workspacePath,
  workspaceIdentity,
  workspaceRemoteSessionId,
  activePreviewPath,
  onOpenPreview,
  onOpenBrowserUrl,
}: FileManagerTreeProps) {
  const { intl } = useZCodeIntl();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [showChangedOnly, setShowChangedOnly] = useState(false);
  const [deleteConfirmPaths, setDeleteConfirmPaths] = useState<string[]>([]);
  const { selectedPaths, newItemParentPath, newItemType, finishNewItem, startRename } =
    useFileManagerStore();

  // 数据层：复用 workspace-file-tree 的数据 hook
  const treeData = useWorkspaceFileTreeData({
    workspacePath,
    workspaceIdentity,
    workspaceRemoteSessionId,
  });

  const { installedEditors } = useInstalledFileTreeEditors();
  const isRemoteWorkspaceFileTree = Boolean(workspaceRemoteSessionId || workspaceIdentity);
  const { remoteTarget } = useWorkspaceOpenInEditorTarget({
    workspacePath,
    workspaceIdentity,
    workspaceRemoteSessionId,
  });

  const availableEditors = useMemo(
    () =>
      isRemoteWorkspaceFileTree && !remoteTarget
        ? []
        : resolveWorkspaceEditorSelection({
            installedEditors,
            selectedEditorId: null,
            remoteTarget,
          }).availableEditors,
    [installedEditors, isRemoteWorkspaceFileTree, remoteTarget],
  );

  // 可见行
  const visibleRows = useMemo(
    () =>
      filterWorkspaceFileTreeRows({
        rows: treeData.rows,
        searchQuery: fileSearchQuery,
        changedOnly: showChangedOnly,
        statusByPath: treeData.gitStatusByPath,
      }),
    [fileSearchQuery, showChangedOnly, treeData.gitStatusByPath, treeData.rows],
  );

  const allRowPaths = useMemo(() => visibleRows.map((row) => row.path), [visibleRows]);

  // 选择逻辑
  const { handleRowClick, handleSelectAll } = useFileManagerSelection(allRowPaths);

  // 文件操作
  const { deleteItems, renameItem, createNewFile, createNewFolder, pasteItems } =
    useFileManagerActions({
      workspacePath,
      workspaceIdentity,
      workspaceRemoteSessionId,
    });

  // 剪贴板
  const { handleCopy, handleCut } = useFileManagerClipboard();

  // 虚拟滚动
  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => WORKSPACE_FILE_TREE_VIRTUAL_ROW_HEIGHT_PX,
    overscan: 12,
  });

  // Git 状态标签
  const gitStatusLabelByStatus = useMemo<Record<WorkspaceFileGitStatus, string>>(
    () => ({
      added: intl.formatMessage({ id: "git.kind.added" }),
      deleted: intl.formatMessage({ id: "git.kind.deleted" }),
      ignored: intl.formatMessage({ id: "workspaceFileTree.gitStatus.ignored" }),
      modified: intl.formatMessage({ id: "git.kind.modified" }),
      renamed: intl.formatMessage({ id: "git.kind.renamed" }),
      untracked: intl.formatMessage({ id: "git.section.untracked" }),
    }),
    [intl],
  );

  const fileManagerLabel = getFileManagerLabel(intl);

  const contextMenuLabels = useMemo<FileManagerContextMenuLabels>(
    () => ({
      open: intl.formatMessage({ id: "common.open" }),
      openWith: intl.formatMessage({ id: "workspaceFileTree.openWith" }),
      openInBrowser: intl.formatMessage({ id: "workspaceFileTree.openInBrowser" }),
      openFailed: intl.formatMessage({ id: "workspaceFileTree.openFailed" }),
      reveal: fileManagerLabel,
      copyAbsolutePath: intl.formatMessage({ id: "fileActions.copyAbsolutePath" }),
      copyRelativePath: intl.formatMessage({ id: "fileActions.copyRelativePath" }),
      addToChat: intl.formatMessage({ id: "workspaceFileTree.addToChat" }),
      copy: intl.formatMessage({ id: "fileManager.copy" }),
      cut: intl.formatMessage({ id: "fileManager.cut" }),
      paste: intl.formatMessage({ id: "fileManager.paste" }),
      deleteItem: intl.formatMessage({ id: "fileManager.delete" }),
      rename: intl.formatMessage({ id: "fileManager.rename" }),
      newFile: intl.formatMessage({ id: "fileManager.newFile" }),
      newFolder: intl.formatMessage({ id: "fileManager.newFolder" }),
    }),
    [fileManagerLabel, intl],
  );

  // 目录展开/收起
  const handleToggleDirectory = useCallback(
    (row: WorkspaceFileTreeRow) => {
      if (row.type !== "directory") return;
      treeData.setExpandedPaths((current) => {
        const next = new Set(current);
        if (next.has(row.path)) {
          // 收起：移除该路径及所有自动折叠的中间路径
          for (const path of row.compactedPaths ?? [row.path]) {
            next.delete(path);
          }
          return next;
        }
        // 展开：添加路径并加载子目录
        next.add(row.path);
        return next;
      });
      if (!row.expanded) {
        const childDepth = getWorkspaceFileDirectoryChildDepth(workspacePath, row.path);
        void treeData.loadDirectory(row.path, childDepth);
      }
    },
    [treeData, workspacePath],
  );

  // 打开预览
  const handleOpenPreview = useCallback(
    (row: WorkspaceFileTreeRow) => {
      if (row.type === "directory") return;
      const source = createCodeViewerSourceForWorkspaceFile(row.path);
      onOpenPreview?.(source);
    },
    [onOpenPreview],
  );

  // 删除确认
  const handleDeleteRequest = useCallback((paths: string[]) => {
    setDeleteConfirmPaths(paths);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteConfirmPaths.length > 0) {
      await deleteItems(deleteConfirmPaths);
    }
    setDeleteConfirmPaths([]);
  }, [deleteConfirmPaths, deleteItems]);

  // 新建文件/文件夹
  const handleNewFile = useCallback(
    (parentPath: string) => {
      useFileManagerStore.getState().startNewItem(parentPath, "file");
    },
    [],
  );

  const handleNewFolder = useCallback(
    (parentPath: string) => {
      useFileManagerStore.getState().startNewItem(parentPath, "directory");
    },
    [],
  );

  // 键盘快捷键
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const isPrimary = event.metaKey || event.ctrlKey;

      if (isPrimary && event.key === "a") {
        event.preventDefault();
        handleSelectAll();
        return;
      }

      if (isPrimary && event.key === "c") {
        event.preventDefault();
        handleCopy(Array.from(selectedPaths));
        return;
      }

      if (isPrimary && event.key === "x") {
        event.preventDefault();
        handleCut(Array.from(selectedPaths));
        return;
      }

      if (isPrimary && event.key === "v") {
        event.preventDefault();
        if (selectedPaths.size === 1) {
          const targetPath = Array.from(selectedPaths)[0]!;
          void pasteItems(targetPath);
        }
        return;
      }

      if (event.key === "Delete") {
        event.preventDefault();
        if (selectedPaths.size > 0) {
          handleDeleteRequest(Array.from(selectedPaths));
        }
        return;
      }

      if (event.key === "F2") {
        event.preventDefault();
        if (selectedPaths.size === 1) {
          startRename(Array.from(selectedPaths)[0]!);
        }
        return;
      }
    },
    [handleSelectAll, handleCopy, handleCut, pasteItems, selectedPaths, handleDeleteRequest, startRename],
  );

  return (
    <div className="flex h-full flex-col" onKeyDown={handleKeyDown}>
      {/* 搜索栏 */}
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-foreground-subtlest" />
          <Input
            value={fileSearchQuery}
            onChange={(e) => setFileSearchQuery(e.target.value)}
            placeholder={intl.formatMessage({ id: "workspaceFileTree.searchPlaceholder" })}
            className="h-6 pl-7 pr-7 text-ui-sm"
          />
          {fileSearchQuery ? (
            <button
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-foreground-subtlest hover:text-foreground-subtle"
              onClick={() => setFileSearchQuery("")}
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          onClick={() => treeData.refreshLoadedDirectories()}
          title={intl.formatMessage({ id: "common.refresh" })}
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      {/* 文件列表 */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto overflow-x-hidden"
        role="tree"
        aria-label={intl.formatMessage({ id: "fileManager.title" })}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = visibleRows[virtualRow.index];
            if (!row) return null;

            const rowGitStatus = getWorkspaceFileGitStatus(treeData.gitStatusByPath, row.path);
            const isSelected = selectedPaths.has(row.path);
            const guideStyle = getWorkspaceFileTreeHierarchyGuideStyle(row.depth);

            return (
              <FileManagerRow
                key={row.path}
                row={row}
                layout="absolute"
                rowStyle={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                workspacePath={workspacePath}
                workspaceIdentity={workspaceIdentity}
                selected={isSelected}
                isRemoteWorkspaceFileTree={isRemoteWorkspaceFileTree}
                remoteTarget={remoteTarget}
                installedEditors={availableEditors}
                gitStatus={rowGitStatus}
                directoryGitStatuses={[]}
                gitStatusLabel={
                  rowGitStatus ? gitStatusLabelByStatus[rowGitStatus] : null
                }
                gitStatusLabelByStatus={gitStatusLabelByStatus}
                contextMenuLabels={contextMenuLabels}
                onSelect={handleRowClick}
                onToggleDirectory={handleToggleDirectory}
                onOpenPreview={handleOpenPreview}
                onDelete={handleDeleteRequest}
                onRename={renameItem}
                onPaste={pasteItems}
                onNewFile={handleNewFile}
                onNewFolder={handleNewFolder}
                hierarchyGuideStyle={guideStyle ?? undefined}
              />
            );
          })}
        </div>
      </div>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteConfirmPaths.length > 0} onOpenChange={(open) => { if (!open) setDeleteConfirmPaths([]); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {intl.formatMessage({ id: "fileManager.deleteConfirmTitle" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {intl.formatMessage(
                { id: "fileManager.deleteConfirmDescription" },
                { count: String(deleteConfirmPaths.length) },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {intl.formatMessage({ id: "common.cancel" })}
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void handleDeleteConfirm()}>
              {intl.formatMessage({ id: "fileManager.delete" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
