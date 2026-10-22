import type { CodeViewerSource } from "@/lib/codeViewer.js";

export interface FileManagerPaneProps {
  workspacePath: string;
  workspaceIdentity?: string;
  workspaceRemoteSessionId?: string;
  activePreviewPath?: string | null;
  onOpenPreview?: (source: CodeViewerSource) => void;
  onOpenBrowserUrl?: (url: string) => void;
}

export interface FileManagerContextMenuLabels {
  open: string;
  openWith: string;
  openInBrowser: string;
  openFailed: string;
  reveal: string;
  copyAbsolutePath: string;
  copyRelativePath: string;
  addToChat: string;
  copy: string;
  cut: string;
  paste: string;
  deleteItem: string;
  rename: string;
  newFile: string;
  newFolder: string;
}
