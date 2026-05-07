-- Migration 001: Add OpenRouter API key and semantic search infrastructure

-- OpenRouter API key per user
alter table public.user_profiles
    add column if not exists openrouter_api_key text;

-- pgvector extension (must be enabled in Supabase dashboard under Extensions first)
create extension if not exists vector;

-- Document chunks for semantic search (voyage-law-2 produces 1024-dim embeddings)
create table if not exists public.document_chunks (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references public.documents(id) on delete cascade,
    version_id uuid not null references public.document_versions(id) on delete cascade,
    chunk_index integer not null,
    chunk_text text not null,
    embedding vector(1024),
    page_number integer,
    created_at timestamptz not null default now(),
    constraint document_chunks_version_chunk_unique unique (version_id, chunk_index)
);

create index if not exists document_chunks_document_id_idx
    on public.document_chunks(document_id);

create index if not exists document_chunks_version_id_idx
    on public.document_chunks(version_id);

-- Cosine similarity search function (called via Supabase RPC from backend)
create or replace function public.match_document_chunks(
    query_embedding vector(1024),
    p_user_id text,
    p_document_ids uuid[],
    match_count integer default 10
)
returns table (
    document_id uuid,
    version_id uuid,
    chunk_index integer,
    chunk_text text,
    page_number integer,
    similarity float,
    filename text
)
language plpgsql
security definer
as $$
begin
    return query
    select
        dc.document_id,
        dc.version_id,
        dc.chunk_index,
        dc.chunk_text,
        dc.page_number,
        1 - (dc.embedding <=> query_embedding) as similarity,
        d.filename
    from document_chunks dc
    join documents d on d.id = dc.document_id
    where
        d.user_id = p_user_id
        and (p_document_ids is null or dc.document_id = any(p_document_ids))
        and dc.embedding is not null
    order by dc.embedding <=> query_embedding
    limit match_count;
end;
$$;
