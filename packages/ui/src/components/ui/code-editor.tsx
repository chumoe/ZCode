"use client";

import type { CSSProperties, HTMLAttributes, KeyboardEvent as ReactKeyboardEvent, Ref } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror, { type Extension, type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { yaml } from "@codemirror/lang-yaml";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { rust } from "@codemirror/lang-rust";
import { go } from "@codemirror/lang-go";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { php } from "@codemirror/lang-php";
import { ruby as rubyParser } from "@codemirror/legacy-modes/mode/ruby";
import { toml as tomlParser } from "@codemirror/legacy-modes/mode/toml";
import { shell as shellParser } from "@codemirror/legacy-modes/mode/shell";
import { StreamLanguage } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap, type KeyBinding, EditorView } from "@codemirror/view";
import { type BundledTheme } from "shiki";

import { cn } from "@/components/lib/utils.js";
import { isDarkCodePreviewTheme } from "@/lib/codePreviewPreferences.js";

/**
 * 将 shiki BundledTheme 映射到 CodeMirror 主题。
 * 目前只区分 light/dark，后续可扩展精细映射。
 */
function resolveCodeMirrorTheme(theme?: BundledTheme): "light" | "dark" {
  if (!theme) {
    if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
      return "dark";
    }
    return "light";
  }
  return isDarkCodePreviewTheme(theme) ? "dark" : "light";
}

/**
 * 将 shiki BundledLanguage 映射到 CodeMirror 语言扩展。
 * 未映射的语言返回 undefined（纯文本模式）。
 */
function resolveCodeMirrorLanguage(language: string) {
  switch (language) {
    case "javascript":
    case "jsx":
    case "typescript":
    case "tsx":
    case "mjs":
    case "cjs":
      return javascript({ jsx: language === "jsx" || language === "tsx", typescript: language === "typescript" || language === "tsx" });
    case "python":
      return python();
    case "json":
      return json();
    case "markdown":
    case "md":
      return markdown();
    case "html":
    case "htm":
      return html();
    case "css":
    case "scss":
    case "less":
      return css();
    case "yaml":
    case "yml":
      return yaml();
    case "java":
      return java();
    case "c":
    case "h":
    case "cpp":
    case "hpp":
    case "cxx":
    case "cc":
    case "c++":
      return cpp();
    case "rust":
    case "rs":
      return rust();
    case "go":
      return go();
    case "sql":
    case "mysql":
    case "postgresql":
    case "pgsql":
    case "plsql":
      return sql();
    case "xml":
    case "svg":
    case "xsl":
    case "xsd":
    case "xhtml":
    case "plist":
      return xml();
    case "php":
    case "phtml":
    case "php3":
    case "php4":
    case "php5":
      return php();
    case "ruby":
    case "rb":
    case "gemfile":
    case "rakefile":
      return StreamLanguage.define(rubyParser);
    case "toml":
      return StreamLanguage.define(tomlParser);
    case "shell":
    case "bash":
    case "sh":
    case "zsh":
    case "fish":
      return StreamLanguage.define(shellParser);
    default:
      return undefined;
  }
}

export interface CodeEditorProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** 初始代码内容 */
  code: string;
  /** shiki 语言标识（与 CodeViewer 兼容） */
  language: string;
  /** shiki 主题（用于映射 CM6 light/dark） */
  theme?: BundledTheme;
  /** 是否显示行号 */
  showLineNumbers?: boolean;
  /** 是否自动换行 */
  wrapLongLines?: boolean;
  /** 字体大小（px） */
  fontSizePx?: number;
  /** 是否只读 */
  readOnly?: boolean;
  /** 内容变更回调 */
  onChange?: (value: string) => void;
  /** Ctrl+S / Cmd+S 保存回调 */
  onSave?: () => void;
  /** 滚动容器 ref */
  scrollContainerRef?: Ref<HTMLDivElement>;
}

export function CodeEditor({
  code,
  language,
  theme,
  showLineNumbers = true,
  wrapLongLines = false,
  fontSizePx = 14,
  readOnly = false,
  onChange,
  onSave,
  scrollContainerRef,
  className,
  ...htmlProps
}: CodeEditorProps) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const cmTheme = resolveCodeMirrorTheme(theme);
  const langExtension = useMemo(() => resolveCodeMirrorLanguage(language), [language]);

  // 保存快捷键
  const saveKeymap = useMemo<KeyBinding[]>(() => {
    if (!onSave) return [];
    return [
      {
        key: "Mod-s",
        run: () => {
          onSave();
          return true;
        },
      },
    ];
  }, [onSave]);

  const extensions = useMemo<Extension[]>(() => {
    const exts: Extension[] = [];
    if (langExtension) {
      exts.push(langExtension);
    }
    if (saveKeymap.length > 0) {
      exts.push(keymap.of(saveKeymap));
    }
    if (wrapLongLines) {
      exts.push(EditorView.lineWrapping);
    }
    return exts;
  }, [langExtension, saveKeymap, wrapLongLines]);

  const cmStyle = useMemo<CSSProperties>(
    () => ({
      fontSize: `${fontSizePx}px`,
      height: "100%",
    }),
    [fontSizePx],
  );

  return (
    <div
      ref={scrollContainerRef}
      className={cn("h-full w-full overflow-auto", className)}
      {...htmlProps}
    >
      <CodeMirror
        ref={cmRef}
        value={code}
        height="100%"
        theme={cmTheme === "dark" ? oneDark : "light"}
        extensions={extensions}
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: showLineNumbers,
          foldGutter: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          bracketMatching: true,
          closeBrackets: true,
          indentOnInput: true,
          autocompletion: false,
          searchKeymap: true,
        }}
        style={cmStyle}
        onChange={onChange}
      />
    </div>
  );
}
