"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import {
    semanticSearch,
    type SemanticSearchResult,
} from "@/app/lib/mikeApi";

interface Props {
    documentIds?: string[];
    onResultClick?: (result: SemanticSearchResult) => void;
}

export function SemanticSearchWidget({ documentIds, onResultClick }: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SemanticSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const runSearch = useCallback(
        async (q: string) => {
            if (!q.trim()) {
                setResults([]);
                return;
            }
            abortRef.current?.abort();
            abortRef.current = new AbortController();
            setLoading(true);
            setError(null);
            try {
                const { results } = await semanticSearch({
                    query: q,
                    document_ids: documentIds,
                    top_k: 8,
                });
                setResults(results);
            } catch (err) {
                if ((err as Error).name !== "AbortError") {
                    setError("Search failed. Please try again.");
                }
            } finally {
                setLoading(false);
            }
        },
        [documentIds],
    );

    // Debounce: fire search 400 ms after the last keystroke.
    useEffect(() => {
        const timer = setTimeout(() => runSearch(query), 400);
        return () => clearTimeout(timer);
    }, [query, runSearch]);

    // Close on click outside.
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                close();
            }
        }
        if (open) document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    function close() {
        setOpen(false);
        setQuery("");
        setResults([]);
        setError(null);
        abortRef.current?.abort();
    }

    function openWidget() {
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
    }

    function formatSimilarity(score: number) {
        return `${Math.round(score * 100)}%`;
    }

    function truncate(text: string, max = 200) {
        if (text.length <= max) return text;
        return text.slice(0, max) + "…";
    }

    if (!open) {
        return (
            <button
                onClick={openWidget}
                title="Semantic document search"
                className="flex items-center justify-center p-1.5 text-gray-500 hover:text-gray-900 transition-colors"
            >
                <Search className="h-4 w-4" />
            </button>
        );
    }

    return (
        <div ref={ref} className="relative">
            {/* Search input */}
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm w-[480px]">
                {loading ? (
                    <Loader2 className="h-3.5 w-3.5 text-gray-400 shrink-0 animate-spin" />
                ) : (
                    <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                )}
                <input
                    ref={inputRef}
                    autoFocus
                    type="text"
                    placeholder="Search by meaning…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="flex-1 text-sm text-gray-700 placeholder:text-gray-400 outline-none bg-transparent"
                />
                <button
                    onClick={close}
                    className="text-gray-400 hover:text-gray-600"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* Results dropdown */}
            {(results.length > 0 || error) && (
                <div className="absolute left-0 top-full mt-1 w-[480px] bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
                    {error && (
                        <div className="px-4 py-3 text-sm text-red-600">{error}</div>
                    )}
                    {results.map((r, i) => (
                        <button
                            key={`${r.document_id}-${r.chunk_index}`}
                            onClick={() => {
                                onResultClick?.(r);
                                close();
                            }}
                            className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${i > 0 ? "border-t border-gray-100" : ""}`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-gray-900 truncate max-w-[340px]">
                                    {r.filename}
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                    {r.page_number != null && (
                                        <span className="text-xs text-gray-400">
                                            p.&nbsp;{r.page_number}
                                        </span>
                                    )}
                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                        {formatSimilarity(r.similarity)}
                                    </span>
                                </div>
                            </div>
                            <p className="text-xs text-gray-600 leading-relaxed">
                                {truncate(r.chunk_text)}
                            </p>
                        </button>
                    ))}
                    {results.length === 0 && !error && !loading && query.trim() && (
                        <div className="px-4 py-3 text-sm text-gray-400">
                            No results found.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
