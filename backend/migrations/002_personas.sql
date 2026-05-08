-- Migration 002: Personas — organizations, members, invites + user profile extensions

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text unique not null,               -- short identifier, used in invite links
    jurisdictions text[] not null default '{}',
    practice_areas text[] not null default '{}',
    custom_instructions text,               -- injected into every member's system prompt
    language text not null default 'en',    -- 'en' | 'fr'
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------

create table if not exists public.organization_members (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null default 'member',   -- 'admin' | 'member'
    joined_at timestamptz not null default now(),
    constraint organization_members_org_user_unique unique (org_id, user_id)
);

create index if not exists organization_members_user_id_idx
    on public.organization_members(user_id);

create index if not exists organization_members_org_id_idx
    on public.organization_members(org_id);

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------

create table if not exists public.organization_invites (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizations(id) on delete cascade,
    invited_email text not null,
    invited_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default now() + interval '7 days',
    constraint organization_invites_org_email_unique unique (org_id, invited_email)
);

-- ---------------------------------------------------------------------------
-- Extend user_profiles for individual persona
-- ---------------------------------------------------------------------------

alter table public.user_profiles
    add column if not exists org_id uuid references public.organizations(id) on delete set null,
    add column if not exists user_role text,                  -- 'Partner', 'Associate', 'Paralegal', …
    add column if not exists practice_areas text[] default '{}',
    add column if not exists user_custom_instructions text,   -- personal additions to system prompt
    add column if not exists bar_number text,                 -- barreau / law society number
    add column if not exists openrouter_api_key text;         -- in case not added by migration 001

-- ---------------------------------------------------------------------------
-- RLS policies (service-role key bypasses RLS on the backend)
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invites enable row level security;

-- Any authenticated user can read orgs they belong to
create policy "members can view their org" on public.organizations
    for select using (
        id in (
            select org_id from public.organization_members
            where user_id = auth.uid()
        )
    );

-- Members can view their own membership rows
create policy "members can view memberships" on public.organization_members
    for select using (user_id = auth.uid());

-- Admins can view all members of their org
create policy "admins can view org members" on public.organization_members
    for select using (
        org_id in (
            select org_id from public.organization_members
            where user_id = auth.uid() and role = 'admin'
        )
    );

-- Pending invites visible to org admins
create policy "admins can view invites" on public.organization_invites
    for select using (
        org_id in (
            select org_id from public.organization_members
            where user_id = auth.uid() and role = 'admin'
        )
    );
