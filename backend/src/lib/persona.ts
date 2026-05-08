import { createServerSupabase } from "./supabase";

export type PersonaContext = {
    userRole: string | null;
    userName: string | null;
    practiceAreas: string[];
    userCustomInstructions: string | null;
    orgName: string | null;
    orgJurisdictions: string[];
    orgPracticeAreas: string[];
    orgCustomInstructions: string | null;
    orgLanguage: string | null;
};

export async function fetchPersonaContext(
    userId: string,
    db?: ReturnType<typeof createServerSupabase>,
): Promise<PersonaContext> {
    const client = db ?? createServerSupabase();

    const { data: profile } = await client
        .from("user_profiles")
        .select(
            "display_name, user_role, practice_areas, user_custom_instructions, org_id",
        )
        .eq("user_id", userId)
        .single();

    const ctx: PersonaContext = {
        userRole: profile?.user_role ?? null,
        userName: profile?.display_name ?? null,
        practiceAreas: (profile?.practice_areas as string[] | null) ?? [],
        userCustomInstructions: profile?.user_custom_instructions ?? null,
        orgName: null,
        orgJurisdictions: [],
        orgPracticeAreas: [],
        orgCustomInstructions: null,
        orgLanguage: null,
    };

    const orgId = profile?.org_id as string | null;
    if (orgId) {
        const { data: org } = await client
            .from("organizations")
            .select(
                "name, jurisdictions, practice_areas, custom_instructions, language",
            )
            .eq("id", orgId)
            .single();

        if (org) {
            ctx.orgName = org.name as string;
            ctx.orgJurisdictions = (org.jurisdictions as string[] | null) ?? [];
            ctx.orgPracticeAreas = (org.practice_areas as string[] | null) ?? [];
            ctx.orgCustomInstructions = org.custom_instructions as string | null;
            ctx.orgLanguage = org.language as string | null;
        }
    }

    return ctx;
}

// Build a concise system prompt block from persona context.
// Returns null when there is no meaningful persona data to inject.
export function buildPersonaBlock(ctx: PersonaContext): string | null {
    const lines: string[] = [];

    // Organisation section
    if (ctx.orgName) {
        lines.push(`Organisation: ${ctx.orgName}`);
        if (ctx.orgJurisdictions.length)
            lines.push(`Jurisdictions: ${ctx.orgJurisdictions.join(", ")}`);
        if (ctx.orgPracticeAreas.length)
            lines.push(`Practice areas: ${ctx.orgPracticeAreas.join(", ")}`);
        if (ctx.orgLanguage && ctx.orgLanguage !== "en")
            lines.push(
                `Preferred language: ${ctx.orgLanguage === "fr" ? "French" : ctx.orgLanguage}`,
            );
    }

    // User section
    if (ctx.userName || ctx.userRole || ctx.practiceAreas.length) {
        const whoLine = [ctx.userName, ctx.userRole]
            .filter(Boolean)
            .join(", ");
        if (whoLine) lines.push(`User: ${whoLine}`);
        if (ctx.practiceAreas.length)
            lines.push(`User specializations: ${ctx.practiceAreas.join(", ")}`);
    }

    // Custom instructions (org first, then user — user overrides org if contradictory)
    if (ctx.orgCustomInstructions?.trim())
        lines.push(`\nFirm instructions:\n${ctx.orgCustomInstructions.trim()}`);
    if (ctx.userCustomInstructions?.trim())
        lines.push(`\nUser instructions:\n${ctx.userCustomInstructions.trim()}`);

    if (lines.length === 0) return null;

    return `USER & ORGANISATION CONTEXT:\n${lines.join("\n")}`;
}
