"use client";

import { useEffect, useState } from "react";
import { Clock3, Crown, Mail, ShieldCheck, Trash2, UserMinus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, SheetHandle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { confirm } from "@/components/ui/confirm";
import { useCollectionSharing, useCollectionSharingMutations } from "@/lib/data/collections";
import { useUser } from "@/lib/user-context";
import type { Collection, CollectionRole } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

type MemberRole = Exclude<CollectionRole, "owner">;

const ROLE_LABELS: Record<CollectionRole, string> = {
  owner: "Owner",
  editor: "Can add and organize",
  viewer: "View only",
};

export function ShareCollectionDialog({
  collection,
  open,
  onOpenChange,
  onLeft,
}: {
  collection: Collection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeft?: () => void;
}) {
  const user = useUser();
  const sharing = useCollectionSharing(open ? collection?.id ?? null : null, collection?.user_id);
  const mutations = useCollectionSharingMutations(collection?.id ?? "");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("editor");
  const isOwner = collection?.access_role === "owner";

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setRole("editor");
  }, [open, collection?.id]);

  async function sendInvite(event: React.FormEvent) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    try {
      await mutations.invite.mutateAsync({ email: normalized, role });
      setEmail("");
      toast.success(`Invitation ready for ${normalized}`);
    } catch (error) {
      const message = errorMessage(error);
      toast.error(message.includes("collection_invites_pending_email_idx") ? "This person already has a pending invitation" : message);
    }
  }

  async function leaveCollection() {
    const ok = await confirm({
      title: `Leave “${collection?.name}”?`,
      description: "The collection and its entries stay with the other members. Your own entries are not deleted.",
      confirmLabel: "Leave collection",
      destructive: true,
    });
    if (!ok) return;
    try {
      await mutations.removeMember.mutateAsync(user.id);
      onOpenChange(false);
      onLeft?.();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <SheetHandle />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5" /> Share {collection?.name ?? "collection"}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[65dvh] space-y-5 overflow-y-auto px-5 pb-2">
          {isOwner && (
            <form onSubmit={sendInvite} className="space-y-3 rounded-xl border bg-muted/30 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="share-email">Invite by email</Label>
                <div className="flex min-w-0 gap-2">
                  <Input
                    id="share-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@example.com"
                    maxLength={320}
                    required
                    className="min-w-0 flex-1"
                  />
                  <Button type="submit" disabled={!email.trim() || mutations.invite.isPending}>
                    <Mail /> Invite
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Invitation permission">
                {(["editor", "viewer"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={role === value}
                    onClick={() => setRole(value)}
                    className={`min-h-11 rounded-lg border px-3 py-2 text-left text-xs transition ${
                      role === value ? "border-primary/50 bg-primary-soft text-foreground" : "bg-card text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    <span className="block font-semibold">{value === "editor" ? "Editor" : "Viewer"}</span>
                    <span>{ROLE_LABELS[value]}</span>
                  </button>
                ))}
              </div>
            </form>
          )}

          <section aria-labelledby="collection-people-title" className="space-y-2">
            <h3 id="collection-people-title" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              People
            </h3>
            {sharing.isLoading && <Skeleton className="h-28 rounded-xl" />}
            {sharing.error && <p className="text-sm text-destructive">{errorMessage(sharing.error)}</p>}
            {sharing.data && (
              <ul className="divide-y rounded-xl border bg-card px-3">
                <li className="flex min-h-14 items-center gap-3 py-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                    <Crown className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{sharing.data.owner?.display_name || (isOwner ? "You" : "Collection owner")}</p>
                    <p className="text-xs text-muted-foreground">Owner</p>
                  </div>
                </li>
                {sharing.data.members.map((member) => (
                  <li key={member.user_id} className="flex min-h-14 items-center gap-3 py-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-muted-foreground">
                      <ShieldCheck className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{member.user_id === user.id ? "You" : member.display_name || "Stash member"}</p>
                      <p className="text-xs text-muted-foreground">{ROLE_LABELS[member.role]}</p>
                    </div>
                    {isOwner && (
                      <div className="flex items-center gap-1">
                        <select
                          aria-label={`Permission for ${member.display_name || "member"}`}
                          value={member.role}
                          onChange={(event) =>
                            mutations.changeRole.mutate(
                              { userId: member.user_id, role: event.target.value as MemberRole },
                              { onError: (error) => toast.error(errorMessage(error)) },
                            )
                          }
                          className="h-9 max-w-28 rounded-lg border bg-card px-2 text-xs"
                        >
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <button
                          type="button"
                          aria-label={`Remove ${member.display_name || "member"}`}
                          onClick={() =>
                            mutations.removeMember.mutate(member.user_id, { onError: (error) => toast.error(errorMessage(error)) })
                          }
                          className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <UserMinus className="size-4" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isOwner && sharing.data && sharing.data.invites.length > 0 && (
            <section aria-labelledby="pending-invites-title" className="space-y-2">
              <h3 id="pending-invites-title" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Pending invitations
              </h3>
              <ul className="divide-y rounded-xl border bg-card px-3">
                {sharing.data.invites.map((invite) => (
                  <li key={invite.id} className="flex min-h-12 items-center gap-3 py-2">
                    <Clock3 className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{invite.email}</p>
                      <p className="text-xs text-muted-foreground">{invite.role === "editor" ? "Editor" : "Viewer"}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Cancel invitation to ${invite.email}`}
                      onClick={() => mutations.cancelInvite.mutate(invite.id, { onError: (error) => toast.error(errorMessage(error)) })}
                      className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <DialogFooter>
          {!isOwner && (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void leaveCollection()}>
              Leave collection
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
