import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpRight,
  BadgeCheck,
  BookmarkCheck,
  BookmarkPlus,
  BookOpenText,

  ChevronLeft,
  Download,
  ExternalLink,
  Github,
  Globe,
  GraduationCap,
  History,
  Loader2,
  PenLine,

  Quote,
  Search,
  SlidersHorizontal,
  Unlock,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { FileDropPanel } from "@/components/FileDropPanel";
import { VoiceInput } from "@/components/VoiceInput";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { applySavedAppearance } from "@/lib/theme";
import { addToLibrary, loadLibrary, removeFromLibrary } from "@/lib/library";
import { searchPapers, type Paper } from "@/lib/search.functions";


export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search & Discovery — Orbis Research" },
      {
        name: "description",
        content:
          "Search OpenAlex, Crossref, Semantic Scholar and PubMed by keyword, DOI, patent or dataset, with year, indexing and citation filters.",
      },
      { property: "og:title", content: "Search & Discovery — Orbis Research" },
      {
        property: "og:description",
        content: "One search bar across free academic APIs, with filters, launchers and rich paper cards.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search["q"] === "string" ? (search["q"] as string) : undefined,
  }),
  component: SearchDiscovery,
});

const CURRENT_YEAR = new Date().getFullYear();

const queryModes = [
  { id: "keyword", label: "Keyword", hint: "Topic or phrase" },
  { id: "doi", label: "DOI", hint: "10.1038/s41586-020-2649-2" },
  { id: "patent", label: "Patent", hint: "Invention or applicant" },
  { id: "dataset", label: "Dataset", hint: "Data collection query" },
] as const;

const sources = [
  { id: "openalex", label: "OpenAlex" },
  { id: "crossref", label: "Crossref" },
  { id: "semanticscholar", label: "Semantic Scholar" },
  { id: "pubmed", label: "PubMed" },
  { id: "doaj", label: "DOAJ (open access)" },
] as const;

const HISTORY_KEY = "orbis-search-history";

function loadHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as string[]).slice(0, 8) : [];
  } catch {
    return [];
  }
}

const indexFilters = [
  { id: "openAccess", label: "Open Access", icon: Unlock },
  { id: "crossref", label: "Crossref indexed", icon: BadgeCheck },
  { id: "pubmed", label: "PubMed indexed", icon: BookOpenText },
  { id: "doaj", label: "DOAJ / Sinta-eligible", icon: GraduationCap },
] as const;

const sortOptions = [
  { id: "relevance", label: "Relevance" },
  { id: "citations", label: "Most cited" },
  { id: "year", label: "Newest" },
] as const;

type QueryMode = (typeof queryModes)[number]["id"];
type SourceId = (typeof sources)[number]["id"];
type SortId = (typeof sortOptions)[number]["id"];
type IndexFilterId = (typeof indexFilters)[number]["id"];

const viewers = [
  {
    id: "scholar",
    label: "Google Scholar",
    icon: GraduationCap,
    build: (q: string) => `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}`,
  },
  {
    id: "github",
    label: "GitHub Repos",
    icon: Github,
    build: (q: string) => `https://github.com/search?type=repositories&q=${encodeURIComponent(q)}`,
  },
  {
    id: "researchgate",
    label: "ResearchGate",
    icon: BookOpenText,
    build: (q: string) => `https://www.researchgate.net/search/publication?q=${encodeURIComponent(q)}`,
  },
  {
    id: "web",
    label: "Google Web",
    icon: Globe,
    build: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  },
] as const;

function SearchDiscovery() {
  const runSearch = useServerFn(searchPapers);
  const { q } = Route.useSearch();
  const [query, setQuery] = useState(q ?? "");
  const [mode, setMode] = useState<QueryMode>("keyword");
  const [source, setSource] = useState<SourceId>("openalex");
  const [years, setYears] = useState<[number, number]>([2015, CURRENT_YEAR]);
  const [activeFilters, setActiveFilters] = useState<IndexFilterId[]>([]);
  const [sort, setSort] = useState<SortId>("relevance");
  const [viewer, setViewer] = useState<(typeof viewers)[number]["id"]>("scholar");
  const [history, setHistory] = useState<string[]>([]);

  const rememberQuery = (value: string) => {
    setHistory((current) => {
      const next = [value, ...current.filter((item) => item !== value)].slice(0, 8);
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  };

  const search = useMutation({
    mutationFn: (vars: {
      query: string;
      source: SourceId;
      mode: QueryMode;
      yearFrom: number;
      yearTo: number;
      openAccessOnly: boolean;
      sort: SortId;
    }) => runSearch({ data: vars }),
  });

  const toggleFilter = (id: IndexFilterId) =>
    setActiveFilters((current) => (current.includes(id) ? current.filter((f) => f !== id) : [...current, id]));

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!query.trim()) return;
    rememberQuery(query.trim());
    search.mutate({
      query: query.trim(),
      source,
      mode,
      yearFrom: years[0],
      yearTo: years[1],
      openAccessOnly: activeFilters.includes("openAccess"),
      sort,
    });
  };

  const searchMutate = search.mutate;
  const autoRan = useRef(false);
  useEffect(() => {
    applySavedAppearance();
    setHistory(loadHistory());
  }, []);


  useEffect(() => {
    if (autoRan.current || !q?.trim()) return;
    autoRan.current = true;
    searchMutate({
      query: q.trim(),
      source: "openalex",
      mode: "keyword",
      yearFrom: 2015,
      yearTo: CURRENT_YEAR,
      openAccessOnly: false,
      sort: "relevance",
    });
  }, [q, searchMutate]);

  const papers = useMemo(() => {
    const list = search.data?.papers ?? [];
    return list.filter((paper) => {
      if (activeFilters.includes("openAccess") && !paper.openAccess) return false;
      if (activeFilters.includes("crossref") && !(paper.indexedIn.includes("crossref") || paper.doi)) return false;
      if (activeFilters.includes("pubmed") && !paper.indexedIn.includes("pubmed")) return false;
      if (activeFilters.includes("doaj") && !paper.indexedIn.includes("doaj")) return false;
      return true;
    });
  }, [search.data, activeFilters]);

  const activeViewer = viewers.find((item) => item.id === viewer) ?? viewers[0];
  const viewerUrl = activeViewer.build(query.trim() || "academic research");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Button asChild variant="ghost" size="icon" className="rounded-full">
            <Link to="/" aria-label="Back to research canvas">
              <ChevronLeft />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="font-display truncate text-base font-semibold sm:text-lg">Search &amp; discovery</h1>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              Free academic APIs, one query surface
            </p>
          </div>
          <Button asChild variant="outline" className="ml-auto shrink-0 rounded-full">
            <Link to="/write">
              <PenLine />
              <span className="hidden sm:inline">Writing workspace</span>
            </Link>
          </Button>

        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <form onSubmit={submit} className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap gap-2">
            {queryModes.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  mode === item.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-full border border-input bg-background px-4 py-2">
            <div className="flex min-w-0 items-center gap-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={queryModes.find((item) => item.id === mode)?.hint}
                aria-label="Universal search"
                className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex items-center gap-2">
            <VoiceInput label="Dictate search query" onText={(text) => setQuery((value) => (value ? `${value} ${text}` : text))} />
            <Button type="submit" className="rounded-full px-5" disabled={!query.trim() || search.isPending}>
              {search.isPending ? <Loader2 className="animate-spin" /> : <Search />}
              <span className="hidden sm:inline">Search</span>
            </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {sources.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSource(item.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-colors",
                  source === item.id ? "border-primary/60 bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {history.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
                <History className="size-3.5" /> Recent
              </span>
              {history.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setQuery(item);
                    rememberQuery(item);
                    search.mutate({
                      query: item,
                      source,
                      mode,
                      yearFrom: years[0],
                      yearTo: years[1],
                      openAccessOnly: activeFilters.includes("openAccess"),
                      sort,
                    });
                  }}
                  className="max-w-[14rem] truncate rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {item}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  window.localStorage.removeItem(HISTORY_KEY);
                  setHistory([]);
                }}
                className="rounded-full px-2 py-1 text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                Clear
              </button>
            </div>
          )}


          <div className="mt-6 grid gap-6 border-t border-border pt-6 lg:grid-cols-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <SlidersHorizontal className="size-3.5" /> Publication years
              </p>
              <p className="mt-2 font-display text-sm font-semibold">
                {years[0]} – {years[1]}
              </p>
              <Slider
                className="mt-4"
                min={1950}
                max={CURRENT_YEAR}
                step={1}
                value={years}
                onValueChange={(value) => setYears([value[0] ?? 1950, value[1] ?? CURRENT_YEAR])}
                aria-label="Publication year range"
              />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Indexing</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {indexFilters.map((item) => {
                  const Icon = item.icon;
                  const active = activeFilters.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleFilter(item.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                        active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <Icon className="size-3.5" /> {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Sort by</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sortOptions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSort(item.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                      sort === item.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </form>

        <section aria-label="Analyze a document" className="mt-8 rounded-3xl border border-border bg-card p-4 sm:p-6">
          <p className="font-display text-sm font-semibold">Analyze a paper</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Drop a PDF, Word file, image, or video — or paste a link — and Orbis will summarize it.
          </p>
          <div className="mt-4">
            <FileDropPanel />
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-border bg-card p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {viewers.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setViewer(item.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                      viewer === item.id ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="size-3.5" /> {item.label}
                  </button>
                );
              })}
            </div>
            <Button asChild variant="outline" className="rounded-full">
              <a href={viewerUrl} target="_blank" rel="noreferrer">
                Launch {activeViewer.label} <ArrowUpRight />
              </a>
            </Button>
          </div>
          <p className="mt-3 truncate rounded-full bg-muted px-4 py-2 text-[11px] text-muted-foreground">{viewerUrl}</p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            These sites block embedding, so Orbis opens them in a dedicated tab with your query pre-filled.
          </p>
        </section>

        <section className="mt-8">
          {search.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Searching {sources.find((s) => s.id === source)?.label}…
            </div>
          )}

          {!search.isPending && search.data && (
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display text-lg font-semibold">
                {papers.length} result{papers.length === 1 ? "" : "s"}
              </p>
              {search.data.notice && <p className="text-xs text-muted-foreground">{search.data.notice}</p>}
            </div>
          )}

          {!search.isPending && !search.data && (
            <div className="rise-in flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border p-10 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground"><BookOpenText className="size-5" /></span>
              <p className="text-sm font-medium">Nothing searched yet</p>
              <p className="max-w-sm text-xs text-muted-foreground">Search a topic, paste a DOI, or look for a dataset. Results appear here with abstracts, DOIs and open-access PDFs.</p>
            </div>
          )}

          <div className="grid gap-4">
            {papers.map((paper) => (
              <PaperCard key={paper.id} paper={paper} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function PaperCard({ paper }: { paper: Paper }) {
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);
  const abstract = paper.abstract ?? "No abstract provided by this source.";
  const shown = expanded || abstract.length <= 320 ? abstract : `${abstract.slice(0, 320)}…`;

  useEffect(() => {
    setSaved(loadLibrary().some((item) => item.id === paper.id));
  }, [paper.id]);

  const toggleSaved = () => {
    if (saved) {
      removeFromLibrary(paper.id);
      setSaved(false);
      return;
    }
    addToLibrary({
      id: paper.id,
      title: paper.title,
      authors: paper.authors,
      year: paper.year ?? null,
      venue: paper.venue ?? null,
      doi: paper.doi ?? null,
      url: paper.pdfUrl ?? paper.landingUrl ?? null,
      snippet: paper.abstract ?? null,
    });
    setSaved(true);
  };



  return (
    <article className="rounded-3xl border border-border bg-card p-5 transition-colors hover:border-primary/40">
      <div className="flex flex-wrap items-center gap-2">
        {paper.venue && (
          <span className="max-w-full truncate rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold text-secondary-foreground">
            {paper.venue}
          </span>
        )}
        {paper.year && <span className="rounded-full border border-border px-3 py-1 text-[11px]">{paper.year}</span>}
        {paper.openAccess && (
          <span className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground">
            <Unlock className="size-3" /> Open access
          </span>
        )}
        <span className="rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground">{paper.source}</span>
      </div>

      <h3 className="font-display mt-3 text-base font-semibold leading-snug sm:text-lg">{paper.title}</h3>

      {paper.authors.length > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">{paper.authors.join(", ")}</p>
      )}

      <p className="mt-3 text-sm leading-6 text-muted-foreground">{shown}</p>
      {abstract.length > 320 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 text-xs font-semibold text-primary hover:underline"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[11px] font-semibold">
          <Quote className="size-3" /> {paper.citations} citations
        </span>
        <Button
          size="sm"
          variant={saved ? "default" : "outline"}
          className="rounded-full"
          onClick={toggleSaved}
          aria-pressed={saved}
        >
          {saved ? <BookmarkCheck /> : <BookmarkPlus />}
          {saved ? "Saved to library" : "Save to library"}
        </Button>

        {paper.pdfUrl && (
          <Button asChild size="sm" className="rounded-full">
            <a href={paper.pdfUrl} target="_blank" rel="noreferrer">
              <Download /> PDF
            </a>
          </Button>
        )}
        {paper.doi && (
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer">
              <ExternalLink /> DOI
            </a>
          </Button>
        )}
        {!paper.doi && paper.landingUrl && (
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <a href={paper.landingUrl} target="_blank" rel="noreferrer">
              <ExternalLink /> Source
            </a>
          </Button>
        )}
      </div>
    </article>
  );
}
