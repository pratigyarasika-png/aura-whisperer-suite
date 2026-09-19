import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bold,
  BookOpenText,
  CheckCircle2,
  ChevronLeft,
  CircleStop,
  Copy,
  Download,
  Heading2,
  Italic,
  List,
  Loader2,
  MessageSquareText,
  Quote,
  Search,
  Sigma,
  Sparkles,
  Trash2,
  Underline,
  WandSparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DiagramStudio } from "@/components/DiagramStudio";
import { FileDropPanel } from "@/components/FileDropPanel";
import { ImageStudio } from "@/components/ImageStudio";
import { PosterStudio } from "@/components/PosterStudio";
import { VoiceInput } from "@/components/VoiceInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { streamAssist, toSource } from "@/lib/assist-client";
import {
  ENGINE_EVENT,
  assistActions,
  engineIds,
  engineLabels,
  inlineActions,
  loadEngine,
  saveEngine,
  writingPresets,
  type EngineMode,
} from "@/lib/engine";
import { exportBibtex, exportDocx, exportPdf, exportRis, readBlocks } from "@/lib/exporters";
import { renderMathToHtml } from "@/lib/latex";
import {
  LIBRARY_EVENT,
  citationStyles,
  formatInline,
  formatReference,
  loadLibrary,
  removeFromLibrary,
  type CitationStyle,
  type SavedPaper,
} from "@/lib/library";
import { applySavedAppearance } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/write")({
  head: () => ({
    meta: [
      { title: "Writing Workspace — Orbis Research" },
      {
        name: "description",
        content:
          "Draft academic writing with Gemini assistance, grounded in your saved papers, with inline citations, LaTeX equations, and Word, PDF, BibTeX and RIS export.",
      },
      { property: "og:title", content: "Writing Workspace — Orbis Research" },
      {
        property: "og:description",
        content:
          "An AI writing workspace with a source library, citation engine, inline rewriting toolbar and document export.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WritingWorkspace,
});

const DOC_KEY = "orbis-document";
const STYLE_KEY = "orbis-citation-style";

function WritingWorkspace() {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [library, setLibrary] = useState<SavedPaper[]>([]);
  const [style, setStyle] = useState<CitationStyle>("apa");
  const [citedIds, setCitedIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  const [engine, setEngine] = useState<EngineMode>("flash");
  const [groundIds, setGroundIds] = useState<string[]>([]);
  const [output, setOutput] = useState("");
  const [outputLabel, setOutputLabel] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatPaperId, setChatPaperId] = useState<string>("");
  const [chatQuestion, setChatQuestion] = useState("");
  const [toolbar, setToolbar] = useState<{ top: number; left: number } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "unsaved">("saved");
  const [studio, setStudio] = useState<"diagram" | "poster" | "image" | "analyze">("diagram");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    applySavedAppearance();
    setLibrary(loadLibrary());
    setEngine(loadEngine());
    const saved = window.localStorage.getItem(STYLE_KEY) as CitationStyle | null;
    if (saved && citationStyles.some((item) => item.id === saved)) setStyle(saved);
    const html = window.localStorage.getItem(DOC_KEY);
    if (html && editorRef.current) editorRef.current.innerHTML = html;
    setReady(true);
    const syncLibrary = () => setLibrary(loadLibrary());
    const syncEngine = () => setEngine(loadEngine());
    window.addEventListener(LIBRARY_EVENT, syncLibrary);
    window.addEventListener("storage", syncLibrary);
    window.addEventListener(ENGINE_EVENT, syncEngine);
    return () => {
      window.removeEventListener(LIBRARY_EVENT, syncLibrary);
      window.removeEventListener("storage", syncLibrary);
      window.removeEventListener(ENGINE_EVENT, syncEngine);
    };
  }, []);

  /** Read citation markers out of the document, in reading order. */
  const syncCitations = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const markers = Array.from(editor.querySelectorAll<HTMLElement>("[data-cite]"));
    const order: string[] = [];
    for (const marker of markers) {
      const id = marker.dataset["cite"]!;
      if (!order.includes(id)) order.push(id);
    }
    for (const marker of markers) {
      const id = marker.dataset["cite"]!;
      const paper = library.find((item) => item.id === id);
      if (paper) marker.textContent = formatInline(paper, style, order.indexOf(id) + 1);
    }
    setCitedIds(order);

    setSaveState("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      window.localStorage.setItem(DOC_KEY, editor.innerHTML);
      setSaveState("saved");
    }, 600);
  }, [library, style]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  useEffect(() => {
    if (ready) syncCitations();
  }, [ready, syncCitations]);

  useEffect(() => {
    if (ready) window.localStorage.setItem(STYLE_KEY, style);
  }, [ready, style]);

  const bibliography = useMemo(
    () =>
      citedIds
        .map((id) => library.find((item) => item.id === id))
        .filter((paper): paper is SavedPaper => Boolean(paper)),
    [citedIds, library],
  );

  const styleLabel = citationStyles.find((item) => item.id === style)?.label ?? "APA 7th";

  /* ------------------------------ editing ------------------------------ */

  const focusEditor = () => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!editor.contains(document.getSelection()?.anchorNode ?? null)) {
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    } else {
      editor.focus();
    }
  };

  const insert = (html: string) => {
    focusEditor();
    document.execCommand("insertHTML", false, html);
    syncCitations();
  };

  const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const marker = (paper: SavedPaper) =>
    `<span data-cite="${paper.id}" class="cite-marker">${formatInline(paper, style, 1)}</span>`;

  const citePaper = (paper: SavedPaper) => insert(`${marker(paper)}&nbsp;`);

  const insertQuote = (paper: SavedPaper) => {
    const source = (paper.snippet ?? "").trim().slice(0, 280) || paper.title;
    insert(`<p>&ldquo;${escapeHtml(source)}&rdquo; ${marker(paper)}</p><p><br></p>`);
  };

  const format = (command: string, value?: string) => {
    focusEditor();
    document.execCommand(command, false, value);
    syncCitations();
  };

  /** Convert `$...$` / `$$...$$` in the editor text into rendered equations. */
  const renderEquations = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const targets: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (/\$[^$\n]+\$|\$\$[\s\S]+\$\$/.test(node.data)) targets.push(node);
    }
    for (const node of targets) {
      const holder = document.createElement("span");
      holder.innerHTML = renderMathToHtml(node.data);
      holder.querySelectorAll(".katex").forEach((element) => {
        const wrapper = document.createElement("span");
        wrapper.className = "math-node";
        wrapper.setAttribute("contenteditable", "false");
        element.replaceWith(wrapper);
        wrapper.append(element);
      });
      node.replaceWith(...Array.from(holder.childNodes));
    }
    syncCitations();
  };

  const manuscriptText = () => (editorRef.current?.innerText ?? "").trim();

  const documentTitle = () => {
    const heading = editorRef.current?.querySelector("h1, h2, h3");
    return (heading?.textContent ?? "manuscript").trim() || "manuscript";
  };

  /* --------------------------- inline toolbar --------------------------- */

  useEffect(() => {
    const onSelectionChange = () => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setToolbar(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) {
        setToolbar(null);
        return;
      }
      if ((selection.toString() ?? "").trim().length < 3) {
        setToolbar(null);
        return;
      }
      savedRange.current = range.cloneRange();
      const rect = range.getBoundingClientRect();
      setToolbar({ top: rect.top + window.scrollY - 8, left: rect.left + window.scrollX + rect.width / 2 });
    };

    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("scroll", onSelectionChange, true);
    window.addEventListener("resize", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("scroll", onSelectionChange, true);
      window.removeEventListener("resize", onSelectionChange);
    };
  }, []);

  const selectedText = () => savedRange.current?.toString().trim() ?? "";

  const restoreRange = () => {
    const range = savedRange.current;
    if (!range) return false;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editorRef.current?.focus();
    return true;
  };

  const replaceSelection = () => {
    if (!output.trim()) return;
    if (!restoreRange()) return;
    document.execCommand("insertHTML", false, renderMathToHtml(output.trim()));
    setToolbar(null);
    syncCitations();
  };

  const insertOutput = () => {
    if (!output.trim()) return;
    const html = output
      .trim()
      .split(/\n{2,}/)
      .map((block) => `<p>${renderMathToHtml(block)}</p>`)
      .join("");
    insert(html);
  };

  /* ------------------------------- the AI ------------------------------- */

  const groundedSources = useMemo(
    () => library.filter((paper) => groundIds.includes(paper.id)),
    [groundIds, library],
  );

  const run = async (
    label: string,
    instruction: string,
    options?: { selection?: string; question?: string; sources?: SavedPaper[] },
  ) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const sources = options?.sources ?? (groundedSources.length ? groundedSources : library.slice(0, 6));

    setRunning(true);
    setError(null);
    setOutput("");
    setOutputLabel(label);
    setAiOpen(true);

    try {
      await streamAssist(
        {
          mode: engine,
          instruction,
          manuscript: manuscriptText(),
          selection: options?.selection ?? "",
          question: options?.question ?? "",
          citationStyle: styleLabel,
          sources: sources.map(toSource),
        },
        (chunk) => setOutput((previous) => previous + chunk),
        controller.signal,
      );
    } catch (requestError) {
      if ((requestError as Error).name !== "AbortError") {
        setError((requestError as Error).message);
      }
    } finally {
      setRunning(false);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const runAssistAction = (id: (typeof assistActions)[number]["id"], label: string) => {
    const instructions: Record<typeof id, string> = {
      "summarize-papers":
        "Summarize each supplied source in 3-4 sentences: aim, method, key finding, and how it relates to the manuscript.",
      "literature-review":
        "Draft a literature review section from the supplied sources, organised by theme, with in-text citations and a closing paragraph on remaining gaps.",
      paraphrase:
        "Paraphrase the manuscript into clearer academic prose, preserving meaning, structure, and every citation marker.",
      "verify-claims":
        "List the factual claims in the manuscript. For each, state whether the supplied sources support it, contradict it, or say nothing, and quote the supporting evidence.",
    };
    void run(label, instructions[id]);
  };

  const runInline = (id: (typeof inlineActions)[number]["id"], label: string) => {
    const selection = selectedText();
    if (!selection) return;
    const instructions: Record<typeof id, string> = {
      rephrase: "Rephrase the selected text in clear academic English. Return only the rewritten text.",
      summarize: "Summarize the selected text in one or two sentences. Return only the summary.",
      polish:
        "Polish the selected text to a formal academic register without changing its meaning or citations. Return only the polished text.",
      grammar:
        "Correct grammar, spelling and punctuation in the selected text, changing nothing else. Return only the corrected text.",
    };
    void run(label, instructions[id], { selection });
  };

  const chatPaper = library.find((paper) => paper.id === chatPaperId);

  const askPaper = () => {
    if (!chatPaper || !chatQuestion.trim()) return;
    void run(`Chat · ${chatPaper.title.slice(0, 40)}`,
      "Answer the user's question about this single paper using its abstract and metadata only. If the abstract does not contain the answer, say so plainly instead of guessing.",
      { question: chatQuestion.trim(), sources: [chatPaper] },
    );
  };

  /* ------------------------------- export ------------------------------- */

  const doExport = async (kind: "docx" | "pdf" | "bibtex" | "ris") => {
    const editor = editorRef.current;
    if (!editor) return;
    const blocks = readBlocks(editor);
    const title = documentTitle();
    if ((kind === "docx" || kind === "pdf") && blocks.length === 0) {
      setError("Write something in the manuscript before exporting.");
      return;
    }
    if ((kind === "bibtex" || kind === "ris") && bibliography.length === 0) {
      setError("Cite at least one source before exporting references.");
      return;
    }
    setError(null);
    if (kind === "docx") await exportDocx(title, blocks, bibliography, style);
    if (kind === "pdf") exportPdf(title, blocks, bibliography, style);
    if (kind === "bibtex") exportBibtex(title, bibliography);
    if (kind === "ris") exportRis(title, bibliography);
  };

  /* -------------------------------- panels ------------------------------ */

  const sourcePanel = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-display text-sm font-semibold">Source library</p>
          <p className="text-[11px] text-muted-foreground">
            {library.length} saved paper{library.length === 1 ? "" : "s"} · {groundIds.length} used by AI
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link to="/search" search={{ q: undefined }}>
            <Search /> Find
          </Link>
        </Button>
      </div>

      <div className="space-y-3">
        {library.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Save papers from Search &amp; discovery and they will appear here, ready to cite.
          </p>
        )}
        {library.map((paper) => {
          const position = citedIds.indexOf(paper.id);
          const checked = groundIds.includes(paper.id);
          return (
            <article key={paper.id} className="rounded-2xl border border-border bg-background p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) =>
                    setGroundIds((previous) =>
                      value ? [...previous, paper.id] : previous.filter((id) => id !== paper.id),
                    )
                  }
                  aria-label={`Use ${paper.title} as AI source`}
                  className="mt-0.5"
                />
                <p className="min-w-0 flex-1 text-xs font-semibold leading-snug">{paper.title}</p>
                <button
                  type="button"
                  onClick={() => setLibrary(removeFromLibrary(paper.id))}
                  className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                  aria-label={`Remove ${paper.title} from library`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {[paper.authors[0], paper.year, paper.venue].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Button size="sm" className="h-8 rounded-full px-3 text-[11px]" onClick={() => citePaper(paper)}>
                  Cite
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={() => insertQuote(paper)}
                >
                  <Quote /> Quote
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={() => {
                    setChatPaperId(paper.id);
                    setAiOpen(true);
                  }}
                >
                  <MessageSquareText /> Chat
                </Button>
                {position >= 0 && (
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold text-secondary-foreground">
                    Ref {position + 1}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );

  const aiPanel = (
    <div className="space-y-5">
      <div>
        <p className="font-display text-sm font-semibold">AI assistance</p>
        <p className="text-[11px] text-muted-foreground">
          {engineLabels[engine]} · grounded in {groundedSources.length || Math.min(library.length, 6)} source
          {(groundedSources.length || Math.min(library.length, 6)) === 1 ? "" : "s"}
        </p>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Writing suite</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {writingPresets.map((preset) => (
            <Button
              key={preset.id}
              size="sm"
              variant="outline"
              disabled={running}
              className="h-8 rounded-full px-3 text-[11px]"
              onClick={() => void run(preset.label, preset.instruction)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Assistants</p>
        <div className="mt-2 grid gap-1.5">
          {assistActions.map((action) => (
            <Button
              key={action.id}
              size="sm"
              variant="secondary"
              disabled={running}
              className="h-9 justify-start rounded-full px-3 text-[11px]"
              onClick={() => runAssistAction(action.id, action.label)}
            >
              <Sparkles /> {action.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border p-3">
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Chat with paper</p>
        <Select value={chatPaperId} onValueChange={setChatPaperId}>
          <SelectTrigger className="mt-2 h-9 rounded-full text-xs">
            <SelectValue placeholder={library.length ? "Choose a saved paper" : "No saved papers yet"} />
          </SelectTrigger>
          <SelectContent>
            {library.map((paper) => (
              <SelectItem key={paper.id} value={paper.id} className="text-xs">
                {paper.title.slice(0, 60)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea
          value={chatQuestion}
          onChange={(event) => setChatQuestion(event.target.value)}
          placeholder="Ask about this paper's method, findings or limitations…"
          className="mt-2 min-h-[4.5rem] rounded-2xl text-xs"
        />
        {chatPaper && !chatPaper.snippet && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Only metadata is saved for this paper — answers cannot cover the full text.
          </p>
        )}
        <Button
          size="sm"
          className="mt-2 h-9 w-full rounded-full text-[11px]"
          disabled={running || !chatPaper || !chatQuestion.trim()}
          onClick={askPaper}
        >
          <MessageSquareText /> Ask
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-background p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[11px] font-semibold uppercase text-muted-foreground">
            {outputLabel || "Result"}
          </p>
          {running ? (
            <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-[11px]" onClick={stop}>
              <CircleStop /> Stop
            </Button>
          ) : (
            output && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 rounded-full px-2 text-[11px]"
                onClick={() => void navigator.clipboard.writeText(output)}
              >
                <Copy /> Copy
              </Button>
            )
          )}
        </div>
        {error && <p className="mt-2 text-[11px] font-medium text-destructive">{error}</p>}
        {!output && !error && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {running ? "Working…" : "Choose an action above. Nothing is added to your manuscript until you insert it."}
          </p>
        )}
        {output && (
          <>
            <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap text-xs leading-6">
              {output}
              {running && <Loader2 className="ml-1 inline size-3 animate-spin" />}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Button size="sm" className="h-8 rounded-full px-3 text-[11px]" onClick={insertOutput}>
                Insert into manuscript
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-full px-3 text-[11px]"
                disabled={!savedRange.current}
                onClick={replaceSelection}
              >
                Replace selection
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[100rem] flex-wrap items-center gap-2 px-3 py-3 sm:px-6">
          <Button asChild variant="ghost" size="icon" className="rounded-full">
            <Link to="/" aria-label="Back to research canvas">
              <ChevronLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display truncate text-sm font-semibold sm:text-lg">Writing workspace</h1>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              Sources, manuscript and Gemini assistance in one place
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <Select
              value={engine}
              onValueChange={(value) => {
                setEngine(value as EngineMode);
                saveEngine(value as EngineMode);
              }}
            >
              <SelectTrigger className="h-9 w-[7.5rem] rounded-full text-xs sm:w-[9.5rem]" aria-label="AI engine mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {engineIds.map((id) => (
                  <SelectItem key={id} value={id} className="text-xs">
                    {engineLabels[id]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={style} onValueChange={(value) => setStyle(value as CitationStyle)}>
              <SelectTrigger className="h-9 w-[6.5rem] rounded-full text-xs" aria-label="Citation style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {citationStyles.map((item) => (
                  <SelectItem key={item.id} value={item.id} className="text-xs">
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-9 rounded-full" aria-label="Export">
                  <Download />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void doExport("docx")}>Word (.docx)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void doExport("pdf")}>PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void doExport("bibtex")}>References (BibTeX)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void doExport("ris")}>References (RIS)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="size-9 rounded-full lg:hidden" aria-label="Source library">
                  <BookOpenText />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[19rem] overflow-y-auto p-4 sm:w-[22rem]">
                <SheetHeader className="p-0">
                  <SheetTitle className="text-sm">Sources</SheetTitle>
                </SheetHeader>
                <div className="mt-4">{sourcePanel}</div>
              </SheetContent>
            </Sheet>

            <Sheet open={aiOpen} onOpenChange={setAiOpen}>
              <SheetTrigger asChild>
                <Button size="icon" className="size-9 rounded-full xl:hidden" aria-label="AI assistance">
                  <WandSparkles />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[20rem] overflow-y-auto p-4 sm:w-[23rem]">
                <SheetHeader className="p-0">
                  <SheetTitle className="text-sm">AI assistance</SheetTitle>
                </SheetHeader>
                <div className="mt-4">{aiPanel}</div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[100rem] gap-6 px-3 py-6 sm:px-6 lg:grid-cols-[19rem_minmax(0,1fr)] xl:grid-cols-[19rem_minmax(0,1fr)_21rem]">
        <section
          aria-label="Saved papers and source library"
          className="hidden rounded-3xl border border-border bg-card p-4 lg:block lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto"
        >
          {sourcePanel}
        </section>

        <section aria-label="Document editor" className="min-w-0 rounded-3xl border border-border bg-card p-3 sm:p-6">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-4">
            {[
              { icon: Bold, command: "bold", label: "Bold" },
              { icon: Italic, command: "italic", label: "Italic" },
              { icon: Underline, command: "underline", label: "Underline" },
              { icon: List, command: "insertUnorderedList", label: "Bullet list" },
            ].map((tool) => {
              const Icon = tool.icon;
              return (
                <Button
                  key={tool.command}
                  variant="outline"
                  size="icon"
                  className="size-9 rounded-full"
                  onClick={() => format(tool.command)}
                  aria-label={tool.label}
                  title={tool.label}
                >
                  <Icon />
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="icon"
              className="size-9 rounded-full"
              onClick={() => format("formatBlock", "<h2>")}
              aria-label="Heading"
              title="Heading"
            >
              <Heading2 />
            </Button>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => format("formatBlock", "<p>")}>
              Body text
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={renderEquations}
              title="Render $...$ and $$...$$ equations"
            >
              <Sigma /> Equations
            </Button>
            <VoiceInput label="Dictate into manuscript" onText={(text) => insert(`${escapeHtml(text)} `)} />
            <span
              aria-live="polite"
              className={cn(
                "ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                saveState === "saved" ? "text-muted-foreground" : "bg-secondary text-secondary-foreground",
              )}
            >
              {saveState === "saved" ? (
                <>
                  <CheckCircle2 className="size-3.5 text-primary" /> Saved to local storage
                </>
              ) : (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Unsaved changes
                </>
              )}
            </span>
          </div>

          <div
            ref={editorRef}
            className="document-editor mt-5 min-h-[24rem] outline-none"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Document body"
            onInput={syncCitations}
            onBlur={syncCitations}
          >
            <h2>Untitled manuscript</h2>
            <p>
              Start writing here. Use Cite or Quote on any saved paper, write equations as $E = mc^2$, and highlight
              text for inline AI actions.
            </p>
          </div>

          <div className="mt-8 border-t border-border pt-5">
            <h3 className="font-display text-sm font-semibold">
              References{" "}
              {bibliography.length > 0 && <span className="text-muted-foreground">({bibliography.length})</span>}
            </h3>
            {bibliography.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Citations you insert build this list automatically, in {styleLabel} order.
              </p>
            ) : (
              <ol className="mt-3 space-y-2">
                {bibliography.map((paper, index) => (
                  <li key={paper.id} className="text-xs leading-6 text-muted-foreground">
                    {formatReference(paper, style, index + 1)}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="mt-8 border-t border-border pt-5">
            <h3 className="font-display text-sm font-semibold">Studio</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Diagrams, posters, AI figures, and document analysis — insert results straight into the manuscript.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {([
                ["diagram", "Diagram & flowchart"],
                ["poster", "Poster & infographic"],
                ["image", "AI image"],
                ["analyze", "Analyze document"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setStudio(id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                    studio === id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4">
              {studio === "diagram" && <DiagramStudio onInsert={insert} />}
              {studio === "poster" && <PosterStudio onInsert={insert} />}
              {studio === "image" && <ImageStudio onInsert={insert} />}
              {studio === "analyze" && (
                <FileDropPanel
                  onAnalysis={(text, label) =>
                    insert(
                      `<h2>Analysis — ${escapeHtml(label)}</h2><p>${escapeHtml(text).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br />")}</p>`,
                    )
                  }
                />
              )}
            </div>
          </div>
        </section>

        <section
          aria-label="AI assistance"
          className="hidden rounded-3xl border border-border bg-card p-4 xl:block xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto"
        >
          {aiPanel}
        </section>
      </main>

      {toolbar && (
        <div
          role="toolbar"
          aria-label="AI actions for selected text"
          style={{ top: toolbar.top, left: toolbar.left }}
          className="fixed z-40 flex -translate-x-1/2 -translate-y-full flex-wrap items-center gap-1 rounded-full border border-border bg-popover p-1 shadow-lg"
          onMouseDown={(event) => event.preventDefault()}
        >
          {inlineActions.map((action) => (
            <Button
              key={action.id}
              size="sm"
              variant="ghost"
              disabled={running}
              className="h-7 rounded-full px-2.5 text-[11px]"
              onClick={() => runInline(action.id, action.label)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
