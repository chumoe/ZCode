import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ZCodeIntlProvider } from "@/i18n/IntlProvider.js";
import { DEFAULT_CODE_PREVIEW_SETTINGS } from "@/lib/codePreviewSettings.js";
import { PreviewPaneContent } from "@/previewPaneContent.js";

vi.mock("@pierre/diffs/react", () => ({
  File: ({ file }: { file?: { contents?: string } }) =>
    createElement("diffs-container", { "data-code": file?.contents }),
  MultiFileDiff: () => createElement("diffs-multi-file"),
  PatchDiff: () => createElement("diffs-patch"),
}));

function baseProps() {
  return {
    source: { type: "file", title: "a.ts", path: "/workspace/a.ts" },
    filePreview: {
      path: "/workspace/a.ts",
      content: "const a = 1",
      offset: 0,
      bytesRead: 11,
      totalBytes: 11,
      truncated: false,
      isBinary: false,
    },
    fileTooLarge: false,
    loadingInitial: false,
    loadingImagePreview: false,
    imagePreview: null,
    loadingPdfPreview: false,
    pdfViewerSource: null,
    pdfViewerLabels: {
      loading: "",
      loadError: "",
      noData: "",
      previousPage: "",
      nextPage: "",
      pageInput: "",
      zoomIn: "",
      zoomOut: "",
    },
    loadingOfficePreview: false,
    officePreview: null,
    officePreviewKind: null,
    loadingPptxPreview: false,
    pptxPreviewData: null,
    pptxReferenceSource: null,
    pptxViewerLabels: {
      loading: "",
      loadError: "",
      noSlides: "",
      previousPage: "",
      nextPage: "",
      pageInput: "",
      zoomIn: "",
      zoomOut: "",
      thumbnails: "",
      thumbnail: () => "",
      selectElement: "",
      exitElementSelection: "",
      aiEdit: "",
      commentPlaceholder: "",
      cancelAiEdit: "",
      addToConversation: "",
    },
    error: null,
    codePreviewSettings: DEFAULT_CODE_PREVIEW_SETTINGS,
    codeTheme: "github-light",
    resolvedTheme: "light",
    theme: "light",
    workspacePath: "/workspace",
    markdownViewMode: "code",
    svgViewMode: "code",
    wrapLongLines: false,
    codeComments: [],
    codeCommentLabels: {
      addComment: "",
      addCommentTooltip: "",
      commentPlaceholder: "",
      submitComment: "",
      cancelComment: "",
      deleteComment: "",
      commentLine: "",
      commentRange: "",
    },
  };
}

describe("PreviewPaneContent editable mode", () => {
  it("renders a CodeMirror editor when editable is enabled", () => {
    const html = renderToStaticMarkup(
      createElement(
        ZCodeIntlProvider,
        { initialLocale: "en-US" },
        createElement(PreviewPaneContent, { ...baseProps(), editable: true }),
      ),
    );
    expect(html).toContain("cm-theme");
  });

  it("renders the read-only code view when editable is disabled", () => {
    const html = renderToStaticMarkup(
      createElement(
        ZCodeIntlProvider,
        { initialLocale: "en-US" },
        createElement(PreviewPaneContent, { ...baseProps(), editable: false }),
      ),
    );
    expect(html).toContain("diffs-container");
    expect(html).not.toContain("cm-theme");
  });

  it("forwards onSave and onCodeChange through to the editor shell", () => {
    const onSave = vi.fn();
    const onCodeChange = vi.fn();
    const html = renderToStaticMarkup(
      createElement(
        ZCodeIntlProvider,
        { initialLocale: "en-US" },
        createElement(PreviewPaneContent, {
          ...baseProps(),
          editable: true,
          onSave,
          onCodeChange,
        }),
      ),
    );
    expect(html).toContain("cm-theme");
  });
});
