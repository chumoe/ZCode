import { create } from "zustand";

export type FileManagerClipboardMode = "copy" | "cut";

export interface FileManagerState {
  /** 当前选中的路径集合 */
  selectedPaths: Set<string>;
  /** 最近一次选中路径（Shift 范围选择的锚点） */
  lastSelectedPath: string | null;
  /** 剪贴板：待复制/移动的源路径 */
  clipboardPaths: string[];
  /** 剪贴板操作模式 */
  clipboardMode: FileManagerClipboardMode | null;
  /** 正在重命名的路径（inline 编辑态） */
  renamingPath: string | null;
  /** 正在新建的目录路径（inline 编辑态） */
  newItemParentPath: string | null;
  /** 新建项类型 */
  newItemType: "file" | "directory" | null;
}

export interface FileManagerActions {
  /** 单选：清除已有选中，选中指定路径 */
  selectPath: (path: string) => void;
  /** 追加选中（Ctrl/Cmd+Click） */
  addToSelection: (path: string) => void;
  /** 从选中中移除 */
  removeFromSelection: (path: string) => void;
  /** 范围选中（Shift+Click）：选中从锚点到当前路径之间的所有行 */
  selectRange: (paths: string[]) => void;
  /** 全选 */
  selectAll: (paths: string[]) => void;
  /** 清除选中 */
  clearSelection: () => void;
  /** 复制到剪贴板 */
  copyToClipboard: (paths: string[]) => void;
  /** 剪切到剪贴板 */
  cutToClipboard: (paths: string[]) => void;
  /** 清除剪贴板 */
  clearClipboard: () => void;
  /** 进入重命名态 */
  startRename: (path: string) => void;
  /** 退出重命名态 */
  finishRename: () => void;
  /** 进入新建态 */
  startNewItem: (parentPath: string, type: "file" | "directory") => void;
  /** 退出新建态 */
  finishNewItem: () => void;
}

export type FileManagerStore = FileManagerState & FileManagerActions;

const initialState: FileManagerState = {
  selectedPaths: new Set(),
  lastSelectedPath: null,
  clipboardPaths: [],
  clipboardMode: null,
  renamingPath: null,
  newItemParentPath: null,
  newItemType: null,
};

export const useFileManagerStore = create<FileManagerStore>()((set) => ({
  ...initialState,

  selectPath: (path) =>
    set({
      selectedPaths: new Set([path]),
      lastSelectedPath: path,
    }),

  addToSelection: (path) =>
    set((state) => {
      const next = new Set(state.selectedPaths);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return {
        selectedPaths: next,
        lastSelectedPath: path,
      };
    }),

  removeFromSelection: (path) =>
    set((state) => {
      const next = new Set(state.selectedPaths);
      next.delete(path);
      return { selectedPaths: next };
    }),

  selectRange: (paths) =>
    set((state) => {
      const next = new Set(state.selectedPaths);
      for (const p of paths) {
        next.add(p);
      }
      return {
        selectedPaths: next,
        lastSelectedPath: paths.length > 0 ? paths[paths.length - 1]! : state.lastSelectedPath,
      };
    }),

  selectAll: (paths) =>
    set({
      selectedPaths: new Set(paths),
    }),

  clearSelection: () =>
    set({
      selectedPaths: new Set(),
      lastSelectedPath: null,
    }),

  copyToClipboard: (paths) =>
    set({
      clipboardPaths: paths,
      clipboardMode: "copy",
    }),

  cutToClipboard: (paths) =>
    set({
      clipboardPaths: paths,
      clipboardMode: "cut",
    }),

  clearClipboard: () =>
    set({
      clipboardPaths: [],
      clipboardMode: null,
    }),

  startRename: (path) =>
    set({
      renamingPath: path,
    }),

  finishRename: () =>
    set({
      renamingPath: null,
    }),

  startNewItem: (parentPath, type) =>
    set({
      newItemParentPath: parentPath,
      newItemType: type,
    }),

  finishNewItem: () =>
    set({
      newItemParentPath: null,
      newItemType: null,
    }),
}));
