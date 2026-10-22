import type { CodeViewerSource } from "@/lib/codeViewer.js";
import { FileManagerTree } from "@/file-manager/FileManagerTree.js";
import type { FileManagerPaneProps } from "@/file-manager/types.js";

/**
 * 文件管理器面板，嵌入右侧 Side Pane 的 file-manager tab。
 */
export function FileManagerPane({
  workspacePath,
  workspaceIdentity,
  workspaceRemoteSessionId,
  activePreviewPath,
  onOpenPreview,
  onOpenBrowserUrl,
}: FileManagerPaneProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <FileManagerTree
        workspacePath={workspacePath}
        workspaceIdentity={workspaceIdentity}
        workspaceRemoteSessionId={workspaceRemoteSessionId}
        activePreviewPath={activePreviewPath}
        onOpenPreview={onOpenPreview}
        onOpenBrowserUrl={onOpenBrowserUrl}
      />
    </div>
  );
}
