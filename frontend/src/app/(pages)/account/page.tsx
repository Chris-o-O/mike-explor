"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LogOut, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { deleteAccount, updateUserPersona } from "@/app/lib/mikeApi";

const PRACTICE_AREAS = [
    "Corporate / M&A", "Litigation", "Real Estate", "Employment",
    "Intellectual Property", "Tax", "Banking & Finance", "Insolvency",
    "Privacy / Data Protection", "Regulatory", "Family Law", "Criminal",
    "Immigration", "Environmental",
];

export default function AccountPage() {
    const router = useRouter();
    const { user, signOut } = useAuth();
    const { profile, updateDisplayName, updateOrganisation, reloadProfile } = useUserProfile();
    const [displayName, setDisplayName] = useState("");
    const [isSavingName, setIsSavingName] = useState(false);
    const [saved, setSaved] = useState(false);
    const [organisation, setOrganisation] = useState("");
    const [isSavingOrg, setIsSavingOrg] = useState(false);
    const [orgSaved, setOrgSaved] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Persona fields
    const [userRole, setUserRole] = useState("");
    const [practiceAreas, setPracticeAreas] = useState<string[]>([]);
    const [barNumber, setBarNumber] = useState("");
    const [userInstructions, setUserInstructions] = useState("");
    const [isSavingPersona, setIsSavingPersona] = useState(false);
    const [personaSaved, setPersonaSaved] = useState(false);

    useEffect(() => {
        if (profile?.displayName) {
            setDisplayName(profile.displayName);
        }
        if (profile?.organisation) {
            setOrganisation(profile.organisation);
        }
        if (profile) {
            setUserRole(profile.userRole ?? "");
            setPracticeAreas(profile.practiceAreas ?? []);
            setBarNumber(profile.barNumber ?? "");
            setUserInstructions(profile.userCustomInstructions ?? "");
        }
    }, [profile]);

    const handleLogout = async () => {
        await signOut();
        router.push("/");
    };

    const handleDeleteAccount = async () => {
        setIsDeleting(true);
        try {
            await deleteAccount();
            await signOut();
            router.push("/");
        } catch {
            setIsDeleting(false);
            setDeleteConfirm(false);
            alert("Failed to delete account. Please try again.");
        }
    };

    const handleSaveDisplayName = async () => {
        setIsSavingName(true);
        const success = await updateDisplayName(displayName.trim());
        setIsSavingName(false);

        if (success) {
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } else {
            alert("Failed to update display name. Please try again.");
        }
    };

    const handleSaveOrganisation = async () => {
        setIsSavingOrg(true);
        const success = await updateOrganisation(organisation.trim());
        setIsSavingOrg(false);

        if (success) {
            setOrgSaved(true);
            setTimeout(() => setOrgSaved(false), 2000);
        } else {
            alert("Failed to update organisation. Please try again.");
        }
    };

    const handleSavePersona = async () => {
        setIsSavingPersona(true);
        try {
            await updateUserPersona({
                user_role: userRole.trim() || null,
                practice_areas: practiceAreas,
                bar_number: barNumber.trim() || null,
                user_custom_instructions: userInstructions.trim() || null,
            });
            await reloadProfile();
            setPersonaSaved(true);
            setTimeout(() => setPersonaSaved(false), 2000);
        } catch {
            alert("Failed to save profile. Please try again.");
        } finally {
            setIsSavingPersona(false);
        }
    };

    if (!user) return null;

    return (
        <div className="space-y-4">
            {/* Profile Settings */}
            <div className="pb-6">
                <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-2xl font-medium font-serif">Profile</h2>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm text-gray-600 block mb-2">
                            Display Name
                        </label>
                        <div className="flex gap-2">
                            <Input
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Enter your name"
                                className="flex-1"
                            />
                            <Button
                                onClick={handleSaveDisplayName}
                                disabled={
                                    isSavingName || !displayName.trim() || saved
                                }
                                className="min-w-[80px] transition-all bg-black hover:bg-gray-900 text-white"
                            >
                                {isSavingName ? (
                                    "Saving..."
                                ) : saved ? (
                                    <>
                                        <Check className="h-4 w-3" />
                                        Saved
                                    </>
                                ) : (
                                    "Save"
                                )}
                            </Button>
                        </div>
                    </div>
                    <div>
                        <label className="text-sm text-gray-600 block mb-2">
                            Organisation
                        </label>
                        <div className="flex gap-2">
                            <Input
                                type="text"
                                value={organisation}
                                onChange={(e) =>
                                    setOrganisation(e.target.value)
                                }
                                placeholder="Enter your organisation"
                                className="flex-1"
                            />
                            <Button
                                onClick={handleSaveOrganisation}
                                disabled={
                                    isSavingOrg ||
                                    organisation.trim() ===
                                        (profile?.organisation ?? "") ||
                                    orgSaved
                                }
                                className="min-w-[80px] transition-all bg-black hover:bg-gray-900 text-white"
                            >
                                {isSavingOrg ? (
                                    "Saving..."
                                ) : orgSaved ? (
                                    <>
                                        <Check className="h-4 w-3" />
                                        Saved
                                    </>
                                ) : (
                                    "Save"
                                )}
                            </Button>
                        </div>
                    </div>
                    <div>
                        <label className="text-sm text-gray-600 block mb-2">
                            Email
                        </label>
                        <p className="text-base">{user?.email}</p>
                    </div>
                </div>
            </div>

            {/* Persona */}
            <div className="py-6 border-t border-gray-100">
                <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-2xl font-medium font-serif">My Profile</h2>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                    This information helps Mike tailor its responses to your role and expertise.
                </p>
                <div className="space-y-4 max-w-xl">
                    <div>
                        <label className="text-sm text-gray-600 block mb-2">Role / Title</label>
                        <Input
                            value={userRole}
                            onChange={(e) => setUserRole(e.target.value)}
                            placeholder="e.g. Senior Associate, Partner, In-house Counsel"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-gray-600 block mb-2">Practice areas</label>
                        <div className="flex flex-wrap gap-2">
                            {PRACTICE_AREAS.map((tag) => {
                                const active = practiceAreas.includes(tag);
                                return (
                                    <button
                                        key={tag}
                                        type="button"
                                        onClick={() =>
                                            setPracticeAreas(
                                                active
                                                    ? practiceAreas.filter((t) => t !== tag)
                                                    : [...practiceAreas, tag],
                                            )
                                        }
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
                    </div>
                    <div>
                        <label className="text-sm text-gray-600 block mb-2">Bar number</label>
                        <Input
                            value={barNumber}
                            onChange={(e) => setBarNumber(e.target.value)}
                            placeholder="e.g. 123456 (Barreau du Québec)"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-gray-600 block mb-2">
                            Personal instructions for Mike
                        </label>
                        <Textarea
                            value={userInstructions}
                            onChange={(e) => setUserInstructions(e.target.value)}
                            placeholder="e.g. Always respond in French. Prioritise Quebec civil law. Flag any constitutional issues."
                            rows={4}
                        />
                    </div>
                    <Button
                        onClick={handleSavePersona}
                        disabled={isSavingPersona || personaSaved}
                        className="min-w-[80px] transition-all bg-black hover:bg-gray-900 text-white"
                    >
                        {isSavingPersona ? (
                            "Saving..."
                        ) : personaSaved ? (
                            <><Check className="h-4 w-3 mr-1" />Saved</>
                        ) : (
                            "Save"
                        )}
                    </Button>
                </div>
            </div>

            {/* Plan */}
            <div className="py-6 border-t border-gray-100">
                <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-2xl font-medium font-serif">
                        Usage Plan
                    </h2>
                </div>
                <div>
                    <p className="text-base font-medium text-gray-500 capitalize">
                        {profile?.tier || "Free"}
                    </p>
                </div>
            </div>

            {/* Actions */}
            <div className="py-6">
                <h2 className="text-2xl font-medium font-serif mb-4">
                    Actions
                </h2>
                <Button
                    variant="outline"
                    onClick={handleLogout}
                    className="w-full sm:w-auto"
                >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                </Button>
            </div>

            {/* Danger Zone */}
            <div className="py-6">
                <h2 className="text-2xl font-medium font-serif mb-1 text-red-600">
                    Danger Zone
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                    Permanently delete your account and all associated data.
                    This action cannot be undone.
                </p>
                {deleteConfirm ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3 max-w-sm">
                        <p className="text-sm font-medium text-red-700">
                            Are you sure? This will permanently delete your
                            account.
                        </p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setDeleteConfirm(false)}
                                disabled={isDeleting}
                                className="text-sm"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleDeleteAccount}
                                disabled={isDeleting}
                                className="text-sm bg-red-600 hover:bg-red-700 text-white"
                            >
                                {isDeleting ? "Deleting…" : "Delete Account"}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button
                        variant="outline"
                        onClick={() => setDeleteConfirm(true)}
                        className="w-full sm:w-auto border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                        Delete Account
                    </Button>
                )}
            </div>
        </div>
    );
}
