import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { useI18n } from "../features/preferences/PreferencesProvider";

interface DdlScriptEditorProps {
  value: string;
  onDirty: () => void;
  onStats: (lineCount: number, charCount: number) => void;
  editorViewRef: MutableRefObject<EditorView | null>;
}

const ddlEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--cb-text)",
    backgroundColor: "var(--cb-surface)",
    fontFamily: '"JetBrains Mono", "Noto Sans SC Variable", monospace',
    fontSize: "10.5px",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "inherit",
    lineHeight: "1.62",
    scrollbarColor: "var(--cb-scroll-thumb) var(--cb-scroll-track)",
    scrollbarWidth: "thin",
  },
  ".cm-content": {
    minHeight: "100%",
    padding: "14px 16px 28px",
    caretColor: "var(--blue)",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--blue)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--cb-selected)",
  },
  ".cm-gutters": {
    display: "none",
  },
  "&.cm-focused": {
    outline: "none",
    boxShadow: "inset 0 0 0 2px rgba(52, 126, 232, 0.16)",
  },
});

export function DdlScriptEditor({
  value,
  onDirty,
  onStats,
  editorViewRef,
}: DdlScriptEditorProps) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const dirtyCallbackRef = useRef(onDirty);
  const statsCallbackRef = useRef(onStats);

  dirtyCallbackRef.current = onDirty;
  statsCallbackRef.current = onStats;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    dirtyRef.current = false;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            "aria-label": t("ddl.scriptEditor"),
            spellcheck: "false",
          }),
          ddlEditorTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !dirtyRef.current) {
              dirtyRef.current = true;
              dirtyCallbackRef.current();
            }
            if (
              update.focusChanged &&
              !update.view.hasFocus &&
              dirtyRef.current
            ) {
              statsCallbackRef.current(
                update.state.doc.lines,
                update.state.doc.length,
              );
            }
          }),
        ],
      }),
    });
    editorViewRef.current = view;
    return () => {
      if (editorViewRef.current === view) editorViewRef.current = null;
      view.destroy();
    };
  }, [editorViewRef, value]);

  return <div ref={hostRef} className="ddl-script-editor" />;
}
