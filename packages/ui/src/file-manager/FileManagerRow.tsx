import type { EditorInfo, OpenInEditorRemoteTarget } from "@zcode/shared";
import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import { useState } from "react";
import { ChevronRight, LoaderCircle, AlertCircle } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import {
  ContextMenu,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.js";
import { Input } from "@/components/ui/input.js";
import { useFileContextActions } from "@/hooks/useFileContextActions.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { FileDisplayIcon, resolveFileDisplayDescriptor } from "@/lib/fileDisplay.js";
import { logger } from "@/logger.js";
import { resolveWorkspaceFileManagerEditor } from "@/lib/workspaceEditorSelection.js";
import { getContainingDirectoryPath } from "@/lib/path.js";
import { toast } from "@/components/ui/toast.js";
import { useFileManagerStore } from "@/store/fileManagerStore.js";
import { useFileManagerClipboard } from "@/file-manager/useFileManagerClipboard.js";
import { FileManagerContextMenuContent } from "@/file-manager/FileManagerContextMenu.js";
import type { FileManagerContextMenuLabels } from "@/file-manager/types.js";
import type { WorkspaceFileGitStatus, WorkspaceFileTreeRow } from "@/workspace-file-tree/model.js";
import {
  getWorkspaceFileGitStatus,
  isWorkspaceFileTreeDeletedFile,
  getWorkspaceFileRelativePath,
  createCodeViewerSourceForWorkspaceFile,
} from "@/workspace-file-tree/model.js";
import {
  getWorkspaceFileTreeRowDisplayGitStatus,
  getWorkspaceFileGitStatusIndicator,
  getWorkspaceFileGitStatusIndicatorClassName,
  getWorkspaceFileGitStatusTextClassName,
} from "@/workspace-file-tree/statusStyles.js";
import { WorkspaceFileTreeRowName } from "@/workspace-file-tree/WorkspaceFileTreeRowName.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";

interface FileManagerRowProps {
  row: WorkspaceFileTreeRow;
  layout: "absolute" | "relative";
  rowStyle: CSSProperties;
  workspacePath: string;
  workspaceIdentity?: string;
  selected: boolean;
  isRemoteWorkspaceFileTree: boolean;
  remoteTarget?: OpenInEditorRemoteTarget;
  installedEditors: EditorInfo[];
  gitStatus: WorkspaceFileGitStatus | null;
  directoryGitStatuses: WorkspaceFileGitStatus[];
  gitStatusLabel: string | null;
  gitStatusLabelByStatus: Record<WorkspaceFileGitStatus, string>;
  contextMenuLabels: FileManagerContextMenuLabels;
  onSelect: (path: string, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  onToggleDirectory: (row: WorkspaceFileTreeRow) => void;
  onOpenPreview: (row: WorkspaceFileTreeRow) => void;
  onDelete: (paths: string[]) => void;
  onRename: (path: string, newName: string) => Promise<boolean>;
  onPaste: (targetDir: string) => Promise<boolean>;
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  hierarchyGuideStyle?: CSSProperties;
}

export function FileManagerRow({
  row,
  layout,
  rowStyle,
  workspacePath,
  workspaceIdentity,
  selected,
  isRemoteWorkspaceFileTree,
  remoteTarget,
  installedEditors,
  gitStatus,
  directoryGitStatuses,
  gitStatusLabel,
  gitStatusLabelByStatus,
  contextMenuLabels,
  onSelect,
  onToggleDirectory,
  onOpenPreview,
  onDelete,
  onRename,
  onPaste,
  onNewFile,
  onNewFolder,
  hierarchyGuideStyle,
}: FileManagerRowProps) {
  const platform = usePlatform();
  const fileActions = useFileContextActions();
  const { renamingPath, startRename, finishRename } = useFileManagerStore();
  const { hasClipboard } = useFileManagerClipboard();
  const [renameValue, setRenameValue] = useState(row.name);

  const isDirectory = row.type === "directory";
  const isDeletedFile = isWorkspaceFileTreeDeletedFile(row, gitStatus);
  const relativePath = getWorkspaceFileRelativePath(workspacePath, row.path);
  const descriptor = resolveFileDisplayDescriptor(row.path, { kind: row.type });
  const wslFileManagerEditor = resolveWorkspaceFileManagerEditor(installedEditors, remoteTarget);

  const gitStatusText = gitStatus ? getWorkspaceFileGitStatusIndicator(gitStatus) : null;
  const gitStatusIndicatorClassName = gitStatus
    ? getWorkspaceFileGitStatusIndicatorClassName(gitStatus)
    : null;
  const rowDisplayStatus = getWorkspaceFileTreeRowDisplayGitStatus({
    gitStatus,
    directoryGitStatuses,
  });
  const rowStatusTextClassName = getWorkspaceFileGitStatusTextClassName(rowDisplayStatus);
  const shouldShowDirectoryGitDots = !row.loading && directoryGitStatuses.length > 0;

  const canRevealInFileManager =
    (!isDeletedFile && Boolean(wslFileManagerEditor)) ||
    fileActions.canRevealInFileManager({
      path: row.path,
      deleted: isDeletedFile,
    });

  const handleRowClick = (event: MouseEvent<HTMLDivElement>) => {
    onSelect(row.path, {
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    });
    if (event.detail > 1) return;
    if (isDirectory) {
      onToggleDirectory(row);
      return;
    }
    if (isDeletedFile) return;
    onOpenPreview(row);
  };

  const handleOpenPrimary = () => {
    if (isDeletedFile) return;
    if (isDirectory) {
      onToggleDirectory(row);
      return;
    }
    onOpenPreview(row);
  };

  const handleOpenInEditor = async (editor: EditorInfo) => {
    if (isDeletedFile) return;
    const result = await platform.openInEditor(editor.id, row.path, {
      pathKind: isDirectory ? "directory" : "file",
      remoteTarget,
      workspaceIdentity,
    });
    if (!result.success) {
      logger.warn("[FileManager] 打开文件条目失败", {
        editorId: editor.id,
        path: row.path,
        error: result.error ?? "unknown-error",
      });
      toast(contextMenuLabels.openFailed);
    }
  };

  const handleRevealInFileManager = async () => {
    if (wslFileManagerEditor) {
      await handleOpenInEditor(wslFileManagerEditor);
      return;
    }
    await fileActions.revealInFileManager({
      path: row.path,
      deleted: isDeletedFile,
      kind: isDirectory ? "directory" : "file",
    });
  };

  const handleCopyAbsolutePath = async () => {
    await fileActions.copyAbsolutePath({ path: row.path });
  };

  const handleCopyRelativePath = async () => {
    await fileActions.copyRelativePath({ path: row.path, relativePath });
  };

  const handleRenameSubmit = async () => {
    if (renameValue.trim() && renameValue !== row.name) {
      await onRename(row.path, renameValue.trim());
    }
    finishRename();
  };

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleRenameSubmit();
    } else if (event.key === "Escape") {
      finishRename();
    }
  };

  const isRenaming = renamingPath === row.path;
  const parentDir = isDirectory ? row.path : (getContainingDirectoryPath(row.path) ?? workspacePath);

  const rowElement = (
    <div
      role="treeitem"
      aria-expanded={isDirectory ? row.expanded : undefined}
      tabIndex={0}
      draggable={!isDeletedFile}
      className={cn(
        "group/file-manager-row relative flex h-7 w-full min-w-0 items-center gap-1.5 rounded-lg border pr-2 py-1 text-left text-ui-base text-foreground outline-none transition-[background-color,border-color,box-shadow]",
        isDeletedFile ? "cursor-default" : "cursor-pointer",
        "pl-[calc(var(--workspace-file-tree-depth)*0.75rem+0.5rem)]",
        selected
          ? "border-input-border-focused bg-selected hover:bg-surface-hover"
          : "border-transparent hover:bg-surface-hover",
        "focus-visible:border-border-hover",
      )}
      title={relativePath}
      onClick={handleRowClick}
      onContextMenu={() => {
        if (!selected) {
          onSelect(row.path, {
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
          });
        }
      }}
      onKeyDown={(event) => {
        if (isDeletedFile && event.key === "Enter") {
          event.preventDefault();
          return;
        }
        if (event.key === "F2" && !isDeletedFile && !isRenaming) {
          event.preventDefault();
          setRenameValue(row.name);
          startRename(row.path);
          return;
        }
        if (event.key === "Delete" && !isDeletedFile) {
          event.preventDefault();
          onDelete([row.path]);
          return;
        }
      }}
    >
      {hierarchyGuideStyle ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-y-px left-2.5"
          data-workspace-file-tree-hierarchy-guides={row.depth}
          style={hierarchyGuideStyle}
        />
      ) : null}
      {isDirectory ? (
        <span className="flex size-4 shrink-0 items-center justify-center text-foreground-subtle">
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "size-3 text-foreground-subtlest transition-transform",
              row.expanded && "rotate-90",
            )}
          />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <FileDisplayIcon src={descriptor.fileIconSrc} className="shrink-0 size-4" />
        {isRenaming ? (
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => void handleRenameSubmit()}
            onKeyDown={handleRenameKeyDown}
            className="h-5 min-w-0 flex-1 border-input-border-focused bg-transparent px-1 text-ui-base"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <WorkspaceFileTreeRowName
            name={row.name}
            className={cn("min-w-0 flex-1 truncate", rowStatusTextClassName)}
            slashClassName="mx-1 text-foreground-subtlest"
          />
        )}
      </span>
      {gitStatusText && gitStatusLabel ? (
        <ControlHintTooltip
          title={gitStatusLabel}
          side="right"
          align="center"
          sideOffset={4}
          triggerClassName="ml-auto"
        >
          <span
            className={cn(
              "inline-flex shrink-0 justify-center font-mono text-ui-base font-bold leading-none",
              gitStatusIndicatorClassName,
            )}
            aria-label={gitStatusLabel}
          >
            {gitStatusText}
          </span>
        </ControlHintTooltip>
      ) : null}
      {shouldShowDirectoryGitDots ? (
        <ControlHintTooltip
          title={directoryGitStatuses.map((status) => gitStatusLabelByStatus[status]).join(", ")}
          side="right"
          align="center"
          sideOffset={4}
          triggerClassName="ml-1"
        >
          <span className="flex shrink-0 items-center" aria-label="●">
            <span
              className={cn(
                "size-1.5 rounded-full",
                getWorkspaceFileGitStatusIndicatorClassName(directoryGitStatuses[0]!),
              )}
            />
          </span>
        </ControlHintTooltip>
      ) : null}
      {row.loading ? (
        <LoaderCircle className="ml-2 size-3 shrink-0 animate-spin text-foreground-subtlest" />
      ) : row.error ? (
        <AlertCircle className="ml-2 size-3 shrink-0 text-warning" />
      ) : null}
    </div>
  );

  return (
    <div
      className={cn(layout === "absolute" ? "absolute left-0 top-0 w-full px-1" : "w-full")}
      style={{ ...rowStyle, "--workspace-file-tree-depth": row.depth } as CSSProperties}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>{rowElement}</ContextMenuTrigger>
        <FileManagerContextMenuContent
          labels={contextMenuLabels}
          isDirectory={isDirectory}
          isDeletedFile={isDeletedFile}
          isRemoteWorkspace={isRemoteWorkspaceFileTree}
          path={row.path}
          installedEditors={installedEditors}
          canRevealInFileManager={canRevealInFileManager}
          canPaste={hasClipboard}
          onOpen={handleOpenPrimary}
          onOpenInEditor={handleOpenInEditor}
          onRevealInFileManager={() => void handleRevealInFileManager()}
          onCopyAbsolutePath={() => void handleCopyAbsolutePath()}
          onCopyRelativePath={() => void handleCopyRelativePath()}
          onDelete={() => onDelete([row.path])}
          onRename={() => {
            setRenameValue(row.name);
            startRename(row.path);
          }}
          onPaste={() => void onPaste(parentDir)}
          onNewFile={() => onNewFile(parentDir)}
          onNewFolder={() => onNewFolder(parentDir)}
        />
      </ContextMenu>
    </div>
  );
}
