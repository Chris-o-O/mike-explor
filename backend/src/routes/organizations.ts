import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";

export const orgsRouter = Router();

// Slugify org name for the invite URL
function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);
}

function uniqueSlug(base: string): string {
    const suffix = Math.random().toString(36).slice(2, 6);
    return `${base}-${suffix}`;
}

// ---------------------------------------------------------------------------
// GET /organizations/mine — org the authenticated user belongs to (if any)
// ---------------------------------------------------------------------------
orgsRouter.get("/mine", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();

    const { data: profile } = await db
        .from("user_profiles")
        .select("org_id")
        .eq("user_id", userId)
        .single();

    if (!profile?.org_id) return void res.json({ org: null, membership: null });

    const [{ data: org }, { data: membership }] = await Promise.all([
        db.from("organizations").select("*").eq("id", profile.org_id).single(),
        db
            .from("organization_members")
            .select("role, joined_at")
            .eq("org_id", profile.org_id)
            .eq("user_id", userId)
            .single(),
    ]);

    res.json({ org, membership });
});

// ---------------------------------------------------------------------------
// GET /organizations/:id/members
// ---------------------------------------------------------------------------
orgsRouter.get("/:id/members", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { id } = req.params;
    const db = createServerSupabase();

    // Must be a member
    const { data: myMembership } = await db
        .from("organization_members")
        .select("role")
        .eq("org_id", id)
        .eq("user_id", userId)
        .single();
    if (!myMembership)
        return void res.status(403).json({ detail: "Access denied" });

    const { data: members } = await db
        .from("organization_members")
        .select("id, user_id, role, joined_at")
        .eq("org_id", id)
        .order("joined_at");

    // Enrich with display names from user_profiles
    const enriched = await Promise.all(
        (members ?? []).map(async (m) => {
            const { data: prof } = await db
                .from("user_profiles")
                .select("display_name, user_role")
                .eq("user_id", m.user_id)
                .single();
            return {
                ...m,
                display_name: prof?.display_name ?? null,
                user_role: prof?.user_role ?? null,
            };
        }),
    );

    res.json({ members: enriched });
});

// ---------------------------------------------------------------------------
// POST /organizations — create a new org and make the creator admin
// ---------------------------------------------------------------------------
orgsRouter.post("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    const {
        name,
        jurisdictions = [],
        practice_areas = [],
        custom_instructions,
        language = "en",
    } = req.body as {
        name?: string;
        jurisdictions?: string[];
        practice_areas?: string[];
        custom_instructions?: string;
        language?: string;
    };

    if (!name?.trim())
        return void res.status(400).json({ detail: "name is required" });

    // Check if user already belongs to an org
    const { data: existingProfile } = await db
        .from("user_profiles")
        .select("org_id")
        .eq("user_id", userId)
        .single();
    if (existingProfile?.org_id)
        return void res
            .status(409)
            .json({ detail: "You already belong to an organisation. Leave it first." });

    const slug = uniqueSlug(slugify(name.trim()));

    const { data: org, error } = await db
        .from("organizations")
        .insert({
            name: name.trim().slice(0, 200),
            slug,
            jurisdictions,
            practice_areas,
            custom_instructions: custom_instructions?.trim() || null,
            language,
            created_by: userId,
        })
        .select("*")
        .single();

    if (error || !org)
        return void res
            .status(500)
            .json({ detail: error?.message ?? "Failed to create organisation" });

    // Add creator as admin member
    await db.from("organization_members").insert({
        org_id: org.id,
        user_id: userId,
        role: "admin",
    });

    // Link user_profile to org
    await db
        .from("user_profiles")
        .update({ org_id: org.id })
        .eq("user_id", userId);

    res.status(201).json({ org });
});

// ---------------------------------------------------------------------------
// PATCH /organizations/:id — update org (admin only)
// ---------------------------------------------------------------------------
orgsRouter.patch("/:id", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { id } = req.params;
    const db = createServerSupabase();

    const { data: membership } = await db
        .from("organization_members")
        .select("role")
        .eq("org_id", id)
        .eq("user_id", userId)
        .single();
    if (membership?.role !== "admin")
        return void res.status(403).json({ detail: "Admin access required" });

    const allowed = [
        "name",
        "jurisdictions",
        "practice_areas",
        "custom_instructions",
        "language",
    ] as const;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
        if (key in req.body) updates[key] = req.body[key];
    }

    const { data: org, error } = await db
        .from("organizations")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();

    if (error) return void res.status(500).json({ detail: error.message });
    res.json({ org });
});

// ---------------------------------------------------------------------------
// POST /organizations/:id/invites — invite a user by email (admin only)
// ---------------------------------------------------------------------------
orgsRouter.post("/:id/invites", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { id } = req.params;
    const db = createServerSupabase();

    const { data: membership } = await db
        .from("organization_members")
        .select("role")
        .eq("org_id", id)
        .eq("user_id", userId)
        .single();
    if (membership?.role !== "admin")
        return void res.status(403).json({ detail: "Admin access required" });

    const { email } = req.body as { email?: string };
    if (!email?.trim())
        return void res.status(400).json({ detail: "email is required" });

    const normalizedEmail = email.trim().toLowerCase();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invite, error } = await db
        .from("organization_invites")
        .upsert(
            {
                org_id: id,
                invited_email: normalizedEmail,
                invited_by: userId,
                expires_at: expiresAt,
            },
            { onConflict: "org_id,invited_email" },
        )
        .select("*")
        .single();

    if (error) return void res.status(500).json({ detail: error.message });
    res.status(201).json({ invite });
});

// ---------------------------------------------------------------------------
// GET /organizations/:id/invites — list pending invites (admin only)
// ---------------------------------------------------------------------------
orgsRouter.get("/:id/invites", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { id } = req.params;
    const db = createServerSupabase();

    const { data: membership } = await db
        .from("organization_members")
        .select("role")
        .eq("org_id", id)
        .eq("user_id", userId)
        .single();
    if (membership?.role !== "admin")
        return void res.status(403).json({ detail: "Admin access required" });

    const { data: invites } = await db
        .from("organization_invites")
        .select("*")
        .eq("org_id", id)
        .gt("expires_at", new Date().toISOString())
        .order("created_at");

    res.json({ invites: invites ?? [] });
});

// ---------------------------------------------------------------------------
// POST /organizations/accept-invite — join org via email invite
// The caller must be authenticated; their email must match the invite.
// ---------------------------------------------------------------------------
orgsRouter.post("/accept-invite", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = (res.locals.userEmail as string | undefined)?.toLowerCase();
    const db = createServerSupabase();

    if (!userEmail)
        return void res.status(400).json({ detail: "Could not determine user email" });

    // Check if user already belongs to an org
    const { data: existingProfile } = await db
        .from("user_profiles")
        .select("org_id")
        .eq("user_id", userId)
        .single();
    if (existingProfile?.org_id)
        return void res
            .status(409)
            .json({ detail: "You already belong to an organisation. Leave it first." });

    // Find a valid invite for this email
    const { data: invite } = await db
        .from("organization_invites")
        .select("*")
        .eq("invited_email", userEmail)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

    if (!invite)
        return void res
            .status(404)
            .json({ detail: "No pending invitation found for your email address" });

    const orgId = invite.org_id as string;

    // Add as member
    await db.from("organization_members").upsert(
        { org_id: orgId, user_id: userId, role: "member" },
        { onConflict: "org_id,user_id" },
    );

    // Link user_profile to org
    await db
        .from("user_profiles")
        .update({ org_id: orgId })
        .eq("user_id", userId);

    // Delete the consumed invite
    await db.from("organization_invites").delete().eq("id", invite.id);

    const { data: org } = await db
        .from("organizations")
        .select("*")
        .eq("id", orgId)
        .single();

    res.json({ ok: true, org });
});

// ---------------------------------------------------------------------------
// DELETE /organizations/:id/members/:memberId — remove a member (admin only)
// ---------------------------------------------------------------------------
orgsRouter.delete("/:id/members/:memberId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { id, memberId } = req.params;
    const db = createServerSupabase();

    const { data: myMembership } = await db
        .from("organization_members")
        .select("role")
        .eq("org_id", id)
        .eq("user_id", userId)
        .single();
    if (myMembership?.role !== "admin")
        return void res.status(403).json({ detail: "Admin access required" });

    // Get the target membership row
    const { data: target } = await db
        .from("organization_members")
        .select("user_id")
        .eq("id", memberId)
        .eq("org_id", id)
        .single();
    if (!target)
        return void res.status(404).json({ detail: "Member not found" });

    await db.from("organization_members").delete().eq("id", memberId);

    // Unlink org from that user's profile
    await db
        .from("user_profiles")
        .update({ org_id: null })
        .eq("user_id", target.user_id);

    res.status(204).send();
});

// ---------------------------------------------------------------------------
// DELETE /organizations/:id/leave — leave an org (self-service)
// ---------------------------------------------------------------------------
orgsRouter.delete("/:id/leave", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { id } = req.params;
    const db = createServerSupabase();

    const { data: membership } = await db
        .from("organization_members")
        .select("role")
        .eq("org_id", id)
        .eq("user_id", userId)
        .single();
    if (!membership)
        return void res.status(404).json({ detail: "You are not a member of this organisation" });

    // Prevent last admin from leaving without transferring
    if (membership.role === "admin") {
        const { count } = await db
            .from("organization_members")
            .select("id", { count: "exact", head: true })
            .eq("org_id", id)
            .eq("role", "admin");
        if ((count ?? 0) <= 1) {
            return void res.status(409).json({
                detail:
                    "You are the only admin. Transfer admin rights to another member before leaving.",
            });
        }
    }

    await db
        .from("organization_members")
        .delete()
        .eq("org_id", id)
        .eq("user_id", userId);

    await db
        .from("user_profiles")
        .update({ org_id: null })
        .eq("user_id", userId);

    res.status(204).send();
});

// ---------------------------------------------------------------------------
// GET /organizations/:id/invites — delete an invite (admin only)
// ---------------------------------------------------------------------------
orgsRouter.delete("/:id/invites/:inviteId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { id, inviteId } = req.params;
    const db = createServerSupabase();

    const { data: membership } = await db
        .from("organization_members")
        .select("role")
        .eq("org_id", id)
        .eq("user_id", userId)
        .single();
    if (membership?.role !== "admin")
        return void res.status(403).json({ detail: "Admin access required" });

    await db
        .from("organization_invites")
        .delete()
        .eq("id", inviteId)
        .eq("org_id", id);

    res.status(204).send();
});
