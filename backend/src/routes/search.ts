import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { semanticSearch } from "../lib/embeddings";

export const searchRouter = Router();

// POST /search/semantic
// Body: { query: string, document_ids?: string[], top_k?: number }
searchRouter.post("/semantic", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { query, document_ids, top_k } = req.body as {
        query?: string;
        document_ids?: string[];
        top_k?: number;
    };

    if (!query?.trim()) {
        return void res.status(400).json({ detail: "query is required" });
    }
    if (!process.env.VOYAGE_API_KEY) {
        return void res
            .status(503)
            .json({ detail: "Semantic search is not configured" });
    }

    const topK = Math.min(20, Math.max(1, top_k ?? 10));
    const db = createServerSupabase();

    try {
        const results = await semanticSearch({
            query: query.trim(),
            userId,
            documentIds: Array.isArray(document_ids) ? document_ids : undefined,
            topK,
            db,
        });
        res.json({ results });
    } catch (err) {
        console.error("[semantic-search]", err);
        res.status(500).json({ detail: "Search failed" });
    }
});
