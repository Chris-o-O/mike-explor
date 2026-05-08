"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Plus, Trash2, UserMinus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    acceptOrgInvite,
    createOrg,
    deleteOrgInvite,
    getMyOrg,
    getOrgInvites,
    getOrgMembers,
    inviteOrgMember,
    leaveOrg,
    removeOrgMember,
    updateOrg,
    type Organization,
    type OrgInvite,
    type OrgMember,
} from "@/app/lib/mikeApi";
import { useUserProfile } from "@/contexts/UserProfileContext";

const JURISDICTIONS = [
    "Federal (Canada)", "Quebec", "Ontario", "British Columbia", "Alberta",
    "Manitoba", "Saskatchewan", "Nova Scotia", "New Brunswick",
    "Federal (USA)", "New York", "California", "France", "Belgium", "Switzerland",
];

const PRACTICE_AREAS = [
    "Corporate / M&A", "Litigation", "Real Estate", "Employment",
    "Intellectual Property", "Tax", "Banking & Finance", "Insolvency",
    "Privacy / Data Protection", "Regulatory", "Family Law", "Criminal",
    "Immigration", "Environmental",
];

export default function CompanyPage() {
    const { profile, reloadProfile } = useUserProfile();
    const [loading, setLoading] = useState(true);
    const [org, setOrg] = useState<Organization | null>(null);
    const [membership, setMembership] = useState<{ role: "admin" | "member"; joined_at: string } | null>(null);
    const [members, setMembers] = useState<OrgMember[]>([]);
    const [invites, setInvites] = useState<OrgInvite[]>([]);

    // Create-org form
    const [creating, setCreating] = useState(false);
    const [createName, setCreateName] = useState("");
    const [createLang, setCreateLang] = useState("en");
    const [createJurisdictions, setCreateJurisdictions] = useState<string[]>([]);
    const [createPracticeAreas, setCreatePracticeAreas] = useState<string[]>([]);
    const [createInstructions, setCreateInstructions] = useState("");
    const [isSavingCreate, setIsSavingCreate] = useState(false);

    // Edit-org form (admin)
    const [editMode, setEditMode] = useState(false);
    const [editJurisdictions, setEditJurisdictions] = useState<string[]>([]);
    const [editPracticeAreas, setEditPracticeAreas] = useState<string[]>([]);
    const [editInstructions, setEditInstructions] = useState("");
    const [editLanguage, setEditLanguage] = useState("en");
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    // Invite
    const [inviteEmail, setInviteEmail] = useState("");
    const [isSendingInvite, setIsSendingInvite] = useState(false);
    const [inviteSent, setInviteSent] = useState(false);

    // Join by invite
    const [isJoining, setIsJoining] = useState(false);

    const loadOrg = useCallback(async () => {
        setLoading(true);
        try {
            const { org: o, membership: m } = await getMyOrg();
            setOrg(o);
            setMembership(m);
            if (o && m) {
                if (m.role === "admin") {
                    const [{ members: ms }, { invites: ivs }] = await Promise.all([
                        getOrgMembers(o.id),
                        getOrgInvites(o.id),
                    ]);
                    setMembers(ms);
                    setInvites(ivs);
                } else {
                    const { members: ms } = await getOrgMembers(o.id);
                    setMembers(ms);
                }
                setEditJurisdictions(o.jurisdictions);
                setEditPracticeAreas(o.practice_areas);
                setEditInstructions(o.custom_instructions ?? "");
                setEditLanguage(o.language);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadOrg(); }, [loadOrg]);

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    function toggleTag(list: string[], setList: (v: string[]) => void, tag: string) {
        setList(list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]);
    }

    async function handleCreate() {
        if (!createName.trim()) return;
        setIsSavingCreate(true);
        try {
            const { org: newOrg } = await createOrg({
                name: createName.trim(),
                jurisdictions: createJurisdictions,
                practice_areas: createPracticeAreas,
                custom_instructions: createInstructions.trim() || undefined,
                language: createLang,
            });
            setOrg(newOrg);
            setMembership({ role: "admin", joined_at: new Date().toISOString() });
            setCreating(false);
            await reloadProfile();
            await loadOrg();
        } catch (err) {
            alert((err as Error).message ?? "Failed to create organisation.");
        } finally {
            setIsSavingCreate(false);
        }
    }

    async function handleSaveEdit() {
        if (!org) return;
        setIsSavingEdit(true);
        try {
            const { org: updated } = await updateOrg(org.id, {
                jurisdictions: editJurisdictions,
                practice_areas: editPracticeAreas,
                custom_instructions: editInstructions.trim() || undefined,
                language: editLanguage,
            });
            setOrg(updated);
            setEditMode(false);
        } catch (err) {
            alert((err as Error).message ?? "Failed to save.");
        } finally {
            setIsSavingEdit(false);
        }
    }

    async function handleSendInvite() {
        if (!org || !inviteEmail.trim()) return;
        setIsSendingInvite(true);
        try {
            await inviteOrgMember(org.id, inviteEmail.trim());
            setInviteEmail("");
            setInviteSent(true);
            setTimeout(() => setInviteSent(false), 2500);
            const { invites: ivs } = await getOrgInvites(org.id);
            setInvites(ivs);
        } catch (err) {
            alert((err as Error).message ?? "Failed to send invite.");
        } finally {
            setIsSendingInvite(false);
        }
    }

    async function handleDeleteInvite(inviteId: string) {
        if (!org) return;
        await deleteOrgInvite(org.id, inviteId);
        setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    }

    async function handleRemoveMember(memberId: string) {
        if (!org || !confirm("Remove this member from the organisation?")) return;
        await removeOrgMember(org.id, memberId);
        setMembers((prev) => prev.filter((m) => m.id !== memberId));
    }

    async function handleLeave() {
        if (!org || !confirm("Leave this organisation?")) return;
        await leaveOrg(org.id);
        setOrg(null);
        setMembership(null);
        setMembers([]);
        setInvites([]);
        await reloadProfile();
    }

    async function handleJoin() {
        setIsJoining(true);
        try {
            const { org: joinedOrg } = await acceptOrgInvite();
            setOrg(joinedOrg);
            await reloadProfile();
            await loadOrg();
        } catch (err) {
            alert((err as Error).message ?? "No pending invitation found for your email.");
        } finally {
            setIsJoining(false);
        }
    }

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        );
    }

    // No org — show create / join options
    if (!org) {
        if (creating) {
            return (
                <div className="space-y-6 max-w-xl">
                    <h2 className="text-2xl font-medium font-serif">Create Organisation</h2>
                    <div>
                        <label className="text-sm text-gray-600 block mb-1">Organisation name *</label>
                        <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Firm name" />
                    </div>
                    <div>
                        <label className="text-sm text-gray-600 block mb-1">Language</label>
                        <select value={createLang} onChange={(e) => setCreateLang(e.target.value)} className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-sm">
                            <option value="en">English</option>
                            <option value="fr">French</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-sm text-gray-600 block mb-2">Jurisdictions</label>
                        <TagGrid tags={JURISDICTIONS} selected={createJurisdictions} onToggle={(t) => toggleTag(createJurisdictions, setCreateJurisdictions, t)} />
                    </div>
                    <div>
                        <label className="text-sm text-gray-600 block mb-2">Practice areas</label>
                        <TagGrid tags={PRACTICE_AREAS} selected={createPracticeAreas} onToggle={(t) => toggleTag(createPracticeAreas, setCreatePracticeAreas, t)} />
                    </div>
                    <div>
                        <label className="text-sm text-gray-600 block mb-1">Firm-wide instructions for Mike</label>
                        <Textarea value={createInstructions} onChange={(e) => setCreateInstructions(e.target.value)} placeholder="e.g. Always apply Quebec civil law unless otherwise specified. Use formal French." rows={4} />
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleCreate} disabled={!createName.trim() || isSavingCreate} className="bg-black hover:bg-gray-900 text-white">
                            {isSavingCreate ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
                        </Button>
                        <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
                    </div>
                </div>
            );
        }

        return (
            <div className="space-y-6 max-w-xl">
                <h2 className="text-2xl font-medium font-serif">Company & Team</h2>
                <p className="text-sm text-gray-500">You are not currently part of any organisation.</p>
                <div className="flex flex-col sm:flex-row gap-3">
                    <Button onClick={() => setCreating(true)} className="bg-black hover:bg-gray-900 text-white">
                        <Plus className="h-4 w-4 mr-2" /> Create Organisation
                    </Button>
                    <Button variant="outline" onClick={handleJoin} disabled={isJoining}>
                        {isJoining ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Join via Invitation
                    </Button>
                </div>
                <p className="text-xs text-gray-400">
                    If you received an invitation email, click &ldquo;Join via Invitation&rdquo; and your account will be linked automatically.
                </p>
            </div>
        );
    }

    // In an org
    const isAdmin = membership?.role === "admin";

    return (
        <div className="space-y-8 max-w-2xl">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-2xl font-medium font-serif">{org.name}</h2>
                    <p className="text-sm text-gray-500 mt-0.5 capitalize">{membership?.role ?? "member"}</p>
                </div>
                {isAdmin && !editMode && (
                    <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>Edit</Button>
                )}
            </div>

            {/* Edit form */}
            {editMode && isAdmin ? (
                <div className="space-y-4">
                    <div>
                        <label className="text-sm text-gray-600 block mb-1">Language</label>
                        <select value={editLanguage} onChange={(e) => setEditLanguage(e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm">
                            <option value="en">English</option>
                            <option value="fr">French</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-sm text-gray-600 block mb-2">Jurisdictions</label>
                        <TagGrid tags={JURISDICTIONS} selected={editJurisdictions} onToggle={(t) => toggleTag(editJurisdictions, setEditJurisdictions, t)} />
                    </div>
                    <div>
                        <label className="text-sm text-gray-600 block mb-2">Practice areas</label>
                        <TagGrid tags={PRACTICE_AREAS} selected={editPracticeAreas} onToggle={(t) => toggleTag(editPracticeAreas, setEditPracticeAreas, t)} />
                    </div>
                    <div>
                        <label className="text-sm text-gray-600 block mb-1">Firm-wide instructions for Mike</label>
                        <Textarea value={editInstructions} onChange={(e) => setEditInstructions(e.target.value)} rows={5} />
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleSaveEdit} disabled={isSavingEdit} className="bg-black hover:bg-gray-900 text-white">
                            {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" /> Save</>}
                        </Button>
                        <Button variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    {org.jurisdictions.length > 0 && (
                        <InfoRow label="Jurisdictions" value={org.jurisdictions.join(" · ")} />
                    )}
                    {org.practice_areas.length > 0 && (
                        <InfoRow label="Practice areas" value={org.practice_areas.join(" · ")} />
                    )}
                    {org.custom_instructions && (
                        <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Firm instructions</p>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-md px-3 py-2">{org.custom_instructions}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Members */}
            <div>
                <h3 className="text-lg font-medium mb-3">Members</h3>
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {members.map((m) => (
                        <li key={m.id} className="flex items-center justify-between px-4 py-3">
                            <div>
                                <p className="text-sm font-medium text-gray-900">
                                    {m.display_name ?? "—"}
                                    <span className="ml-2 text-xs text-gray-400 capitalize">{m.role}</span>
                                </p>
                                {m.user_role && <p className="text-xs text-gray-500">{m.user_role}</p>}
                            </div>
                            {isAdmin && m.user_id !== profile?.orgId && (
                                <button onClick={() => handleRemoveMember(m.id)} className="text-gray-400 hover:text-red-500 transition-colors" title="Remove member">
                                    <UserMinus className="h-4 w-4" />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Invite (admin) */}
            {isAdmin && (
                <div>
                    <h3 className="text-lg font-medium mb-3">Invite a member</h3>
                    <div className="flex gap-2 max-w-md">
                        <Input
                            type="email"
                            placeholder="colleague@firm.com"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleSendInvite(); }}
                        />
                        <Button onClick={handleSendInvite} disabled={isSendingInvite || !inviteEmail.trim() || inviteSent} className="bg-black hover:bg-gray-900 text-white min-w-[100px]">
                            {isSendingInvite ? <Loader2 className="h-4 w-4 animate-spin" /> : inviteSent ? <><Check className="h-4 w-4 mr-1" />Sent</> : "Send Invite"}
                        </Button>
                    </div>

                    {invites.length > 0 && (
                        <div className="mt-3">
                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Pending invitations</p>
                            <ul className="space-y-1">
                                {invites.map((inv) => (
                                    <li key={inv.id} className="flex items-center justify-between text-sm text-gray-600 bg-gray-50 rounded px-3 py-2">
                                        <span>{inv.invited_email}</span>
                                        <button onClick={() => handleDeleteInvite(inv.id)} className="text-gray-400 hover:text-red-500">
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* Leave */}
            <div className="pt-4 border-t border-gray-100">
                <Button variant="outline" onClick={handleLeave} className="border-red-200 text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4 mr-2" /> Leave Organisation
                </Button>
            </div>
        </div>
    );
}

function TagGrid({
    tags,
    selected,
    onToggle,
}: {
    tags: string[];
    selected: string[];
    onToggle: (tag: string) => void;
}) {
    return (
        <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
                const active = selected.includes(tag);
                return (
                    <button
                        key={tag}
                        type="button"
                        onClick={() => onToggle(tag)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            active
                                ? "border-gray-900 bg-gray-900 text-white"
                                : "border-gray-200 text-gray-600 hover:border-gray-400"
                        }`}
                    >
                        {tag}
                    </button>
                );
            })}
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
            <p className="text-sm text-gray-700 mt-0.5">{value}</p>
        </div>
    );
}
