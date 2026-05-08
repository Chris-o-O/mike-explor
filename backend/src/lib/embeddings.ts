import { downloadFile } from "./storage";
import { createServerSupabase } from "./supabase";

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 150;

export type DocumentChunk = {
    chunk_index: number;
    chunk_text: string;
    page_number: number | null;
};

// Split text into overlapping fixed-size chunks. For PDF text that contains
// [Page N] markers, records the page number for each chunk.
export function chunkText(text: string): DocumentChunk[] {
    if (!text.trim()) return [];

    // Pre-process: build a map of character offset → page number from [Page N] markers.
    const pageAtOffset = new Map<number, number>();
    const markerRe = /\[Page (\d+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = markerRe.exec(text)) !== null) {
        pageAtOffset.set(m.index, parseInt(m[1], 10));
    }

    // Remove the [Page N] markers from the text before chunking.
    const clean = text.replace(/\[Page \d+\]\n?/g, "");

    const chunks: DocumentChunk[] = [];
    let chunkIndex = 0;
    let offset = 0;

    while (offset < clean.length) {
        const end = Math.min(offset + CHUNK_SIZE, clean.length);
        const chunkText = clean.slice(offset, end).trim();
        if (chunkText.length > 0) {
            // Determine page number: find the last page marker whose original
            // offset is ≤ the current chunk's start offset (approximate).
            let page: number | null = null;
            for (const [markerOffset, pageNum] of pageAtOffset) {
                if (markerOffset <= offset) page = pageNum;
            }
            chunks.push({ chunk_index: chunkIndex++, chunk_text: chunkText, page_number: page });
        }
        if (end >= clean.length) break;
        offset += CHUNK_SIZE - CHUNK_OVERLAP;
    }

    return chunks;
}

// ---------------------------------------------------------------------------
// Voyage AI embeddings (voyage-law-2 — optimized for legal documents)
// ---------------------------------------------------------------------------

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-law-2";
const VOYAGE_BATCH_SIZE = 128;

export async function embedChunks(texts: string[]): Promise<number[][]> {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) throw new Error("VOYAGE_API_KEY is not set");

    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += VOYAGE_BATCH_SIZE) {
        const batch = texts.slice(i, i + VOYAGE_BATCH_SIZE);
        const resp = await fetch(VOYAGE_API_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ model: VOYAGE_MODEL, input: batch }),
        });
        if (!resp.ok) {
            const body = await resp.text();
            throw new Error(`Voyage AI error ${resp.status}: ${body}`);
        }
        const data = (await resp.json()) as { data: { embedding: number[] }[] };
        results.push(...data.data.map((d) => d.embedding));
    }

    return results;
}

export async function embedQuery(query: string): Promise<number[]> {
    const [vec] = await embedChunks([query]);
    return vec;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function hasChunks(
    versionId: string,
    db: ReturnType<typeof createServerSupabase>,
): Promise<boolean> {
    const { count } = await db
        .from("document_chunks")
        .select("id", { count: "exact", head: true })
        .eq("version_id", versionId);
    return (count ?? 0) > 0;
}

export async function indexDocumentVersion(params: {
    documentId: string;
    versionId: string;
    text: string;
    db: ReturnType<typeof createServerSupabase>;
}): Promise<void> {
    const { documentId, versionId, text, db } = params;

    if (await hasChunks(versionId, db)) return;

    const chunks = chunkText(text);
    if (chunks.length === 0) return;

    const embeddings = await embedChunks(chunks.map((c) => c.chunk_text));

    const rows = chunks.map((c, i) => ({
        document_id: documentId,
        version_id: versionId,
        chunk_index: c.chunk_index,
        chunk_text: c.chunk_text,
        embedding: JSON.stringify(embeddings[i]),
        page_number: c.page_number,
    }));

    // Upsert in batches of 100 to stay within Supabase request limits.
    for (let i = 0; i < rows.length; i += 100) {
        await db
            .from("document_chunks")
            .upsert(rows.slice(i, i + 100), {
                onConflict: "version_id,chunk_index",
            });
    }
}

// ---------------------------------------------------------------------------
// Text extraction (mirrors chatTools.ts but self-contained for background use)
// ---------------------------------------------------------------------------

async function extractPdfText(buf: ArrayBuffer): Promise<string> {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs" as string);
    const pdf = await (
        pdfjsLib as unknown as {
            getDocument: (opts: unknown) => {
                promise: Promise<{
                    numPages: number;
                    getPage: (n: number) => Promise<{
                        getTextContent: () => Promise<{
                            items: { str: string; hasEOL?: boolean }[];
                        }>;
                    }>;
                }>;
            };
        }
    ).getDocument({ data: new Uint8Array(buf) }).promise;

    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
            .map((item) => item.str + (item.hasEOL ? "\n" : ""))
            .join("");
        pages.push(`[Page ${i}]\n${text}`);
    }
    return pages.join("\n\n");
}

async function extractDocxText(buf: ArrayBuffer): Promise<string> {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
    return result.value;
}

// Download a document version from storage and extract its text.
export async function extractVersionText(
    storagePath: string,
    fileType: string,
): Promise<string | null> {
    const raw = await downloadFile(storagePath);
    if (!raw) return null;
    if (fileType === "pdf") return extractPdfText(raw);
    if (fileType === "docx" || fileType === "doc") return extractDocxText(raw);
    return null;
}

// ---------------------------------------------------------------------------
// Semantic search
// ---------------------------------------------------------------------------

export type SemanticSearchResult = {
    document_id: string;
    version_id: string;
    chunk_index: number;
    chunk_text: string;
    page_number: number | null;
    similarity: number;
    filename: string;
};

export async function semanticSearch(params: {
    query: string;
    userId: string;
    documentIds?: string[];
    topK?: number;
    db: ReturnType<typeof createServerSupabase>;
}): Promise<SemanticSearchResult[]> {
    const { query, userId, documentIds, topK = 10, db } = params;
    const queryVec = await embedQuery(query);

    const { data, error } = await db.rpc("match_document_chunks", {
        query_embedding: JSON.stringify(queryVec),
        p_user_id: userId,
        p_document_ids: documentIds ?? null,
        match_count: topK,
    });

    if (error) throw new Error(`Semantic search failed: ${error.message}`);
    return (data ?? []) as SemanticSearchResult[];
}
