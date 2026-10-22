import type { EditorInfo, OpenInEditorRemoteTarget } from "@zcode/shared";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu.js";
import { useFileManagerStore } from "@/store/fileManagerStore.js";
import { useFileManagerClipboard } from "@/file-manager/useFileManagerClipboard.js";
import type { FileManagerContextMenuLabels } from "@/file-manager/types.js";

interface FileManagerContextMenuContentProps {
  labels: FileManagerContextMenuLabels;
  isDirectory: boolean;
  isDeletedFile: boolean;
  isRemoteWorkspace: boolean;
  path: string;
  installedEditors: EditorInfo[];
  canRevealInFileManager: boolean;
  canPaste: boolean;
  onOpen: () => void;
  onOpenInEditor: (editor: EditorInfo) => void;
  onRevealInFileManager: () => void;
  onCopyAbsolutePath: () => void;
  onCopyRelativePath: () => void;
  onDelete: () => void;
  onRename: () => void;
  onPaste: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
}

export function FileManagerContextMenuContent({
  labels,
  isDeletedFile,
  isRemoteWorkspace,
  installedEditors,
  canRevealInFileManager,
  canPaste,
  onOpen,
  onOpenInEditor,
  onRevealInFileManager,
  onCopyAbsolutePath,
  onCopyRelativePath,
  onDelete,
  onRename,
  onPaste,
  onNewFile,
  onNewFolder,
}: FileManagerContextMenuContentProps) {
  const { selectedPaths } = useFileManagerStore();
  const { handleCopy, handleCut } = useFileManagerClipboard();
  const selectedPathsArray = Array.from(selectedPaths);
  const canModify = !isDeletedFile && !isRemoteWorkspace;

  return (
    <ContextMenuContent className="w-52">
      <ContextMenuItem disabled={isDeletedFile} onSelect={onOpen}>
        {labels.open}
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={isDeletedFile || installedEditors.length === 0}>
          {labels.openWith}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-44">
          {installedEditors.map((editor) => (
            <ContextMenuItem key={editor.id} onSelect={() => onOpenInEditor(editor)}>
              {editor.name}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem disabled={!canRevealInFileManager} onSelect={onRevealInFileManager}>
        {labels.reveal}
      </ContextMenuItem>
      <ContextMenuItem onSelect={onCopyAbsolutePath}>
        {labels.copyAbsolutePath}
      </ContextMenuItem>
      <ContextMenuItem onSelect={onCopyRelativePath}>
        {labels.copyRelativePath}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        disabled={!canModify || selectedPathsArray.length === 0}
        onSelect={() => handleCopy(selectedPathsArray)}
      >
        {labels.copy}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={!canModify || selectedPathsArray.length === 0}
        onSelect={() => handleCut(selectedPathsArray)}
      >
        {labels.cut}
      </ContextMenuItem>
      <ContextMenuItem disabled={!canModify || !canPaste} onSelect={onPaste}>
        {labels.paste}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        disabled={!canModify || selectedPathsArray.length === 0}
        variant="destructive"
        onSelect={onDelete}
      >
        {labels.deleteItem}
      </ContextMenuItem>
      <ContextMenuItem disabled={!canModify || selectedPathsArray.length !== 1} onSelect={onRename}>
        {labels.rename}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem disabled={!canModify} onSelect={onNewFile}>
        {labels.newFile}
      </ContextMenuItem>
      <ContextMenuItem disabled={!canModify} onSelect={onNewFolder}>
        {labels.newFolder}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
