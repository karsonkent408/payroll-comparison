import { useState } from "react";
import { coerceSortPreference } from "@/features/comparisons/sortMatchedRows";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { DatePickerNaturalLanguage } from "@/shared/components/naturalLangaugeDatePicker";
import { Textarea } from "@/shared/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import { MoreHorizontal } from "lucide-react";
import { StatusBadge, type ComparisonStatus } from "@/features/comparisons/components/StatusBadge";
import { authClient } from "@/shared/lib/auth-client";
import { canModify, isOwner } from "@/shared/lib/canModify";
import { ComparisonQueries } from "@/features/comparisons/query";
import { ComparisonMutations } from "@/features/comparisons/mutations";
import { useMutation } from "@tanstack/react-query";
import { useDebouncer } from '@tanstack/react-pacer'
import { toast } from "sonner"



type ComparisonData = {
  id: number;
  label: string;
  pay_period_start: string;
  pay_period_end: string;
  description: string | null;
  status: ComparisonStatus;
  owner_name: string | null;
  sort_preference: string;
};


export function OptionsPage() {
  const { id } = useParams({ from: "/comparisons/$id/options" });
  const navigate = useNavigate();

  const { data: comparison } = ComparisonQueries.useComparison(id)
  const { data: collaborators } = ComparisonQueries.useCollaborators(id)
  const [newLabel, setNewLabel] = useState<string | null>(null);
  const [newPayPeriodStart, setNewPayPeriodStart] = useState<string | null>(null);
  const [newPayPeriodEnd, setNewPayPeriodEnd] = useState<string | null>(null);
  const [newDescription, setNewDescription] = useState<string | null>(null);
  const [newSortPreference, setNewSortPreference] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingCollab, setEditingCollab] = useState<{ userId: string; access: 'viewer' | 'editor' } | null>(null);
  const [editAccess, setEditAccess] = useState<'viewer' | 'editor'>('viewer');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const { data: session } = authClient.useSession();
  const user = session?.user

  const patchComparison = useMutation(ComparisonMutations.patchComparison)
  const deleteComparison = useMutation(ComparisonMutations.deleteComparison)
  const patchCollaboratorAccess = useMutation(ComparisonMutations.patchCollaboratorAccess)
  const removeCollaborator = useMutation(ComparisonMutations.removeCollaborator)
  const makeOwner = useMutation(ComparisonMutations.makeOwner)
  const inviteCollaborator = useMutation(ComparisonMutations.inviteCollaborator)
  const debouncedPatchSort = useDebouncer(
    (value: string) => {
      patchComparison.mutate(
        { id, sort_preference: coerceSortPreference(value) },
        {
          onSuccess: () => {
            setNewSortPreference(null);
            toast('Sort preference updated.');
          },
          onError: () => {
            setNewSortPreference(null);
            toast.error('Failed to update sort preference.');
          },
        }
      );
    },
    { wait: 500 }
  );


  const label = newLabel ?? comparison?.label
  const payPeriodStart = newPayPeriodStart ?? comparison?.pay_period_start
  const payPeriodEnd = newPayPeriodEnd ?? comparison?.pay_period_end
  const description = newDescription ?? comparison?.description
  const sortPreference = newSortPreference ?? comparison?.sort_preference

  const userCanModify = canModify(user?.role ?? null, user?.id ?? '', collaborators ?? [])
  const userIsOwner = isOwner(user?.role ?? null, user?.id ?? '', collaborators ?? [])

  const dirty =
    comparison && (
      label !== comparison.label ||
      payPeriodStart !== comparison.pay_period_start ||
      payPeriodEnd !== comparison.pay_period_end ||
      (description ?? "") !== (comparison.description ?? "")
    )

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const input = {
      label: label?.trim(),
      pay_period_start: payPeriodStart,
      pay_period_end: payPeriodEnd,
      description: description?.trim()
    }
    try {
      await patchComparison.mutateAsync({id, ...input});
      toast('Comparison updated.');
    } catch {
      toast.error('Failed to update comparison.');
    }
  }

  function handleSortPreferenceChange(value: string) {
    setNewSortPreference(value);
    debouncedPatchSort.maybeExecute(value);
  }

  function handleEditAccess(userId: string, access: 'viewer' | 'editor') {
    setEditAccess(access);
    setEditingCollab({ userId, access });
  }

  function handleSaveAccess() {
    if (!editingCollab) return;
    patchCollaboratorAccess.mutate(
      { id, userId: editingCollab.userId, access: editAccess },
      {
        onSuccess: () => { setEditingCollab(null); toast('Access updated.'); },
        onError: () => toast.error('Failed to update access.'),
      }
    );
  }

  function handleRemove(userId: string) {
    removeCollaborator.mutate(
      { id, userId },
      {
        onSuccess: () => toast('Collaborator removed.'),
        onError: () => toast.error('Failed to remove collaborator.'),
      }
    );
  }

  function handleMakeOwner(userId: string) {
    makeOwner.mutate(
      { id, userId },
      {
        onSuccess: () => toast('Ownership transferred.'),
        onError: () => toast.error('Failed to transfer ownership.'),
      }
    );
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteComparison.mutateAsync(id)
      navigate({ to: "/", search: { page: 1, filters: undefined } });
    } finally {
      setDeleting(false);
    }
  }

  async function handleInvite() {
    try {
      await inviteCollaborator.mutateAsync({ id, email: inviteEmail });
      setInviteOpen(false);
      toast('Collaborator invited.');
    } catch {
      toast.error('Failed to invite collaborator.');
    }
  }


  if (!comparison) {
    return <OptionsPageSkeleton />;
  }

  return (
    <div className="container mx-auto max-w-2xl p-8 flex flex-col gap-6">
      {/* Header */}
      <div>
        <Link
          to="/comparisons/$id"
          params={{ id }}
          search={{ message: undefined }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {comparison.label}
        </Link>
        <div className="flex items-center justify-between mt-3">
          <h1 className="text-2xl font-bold">Options</h1>
          <StatusBadge status={comparison.status} />
        </div>
      </div>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                value={label ?? ''}
                onChange={(e) => setNewLabel(e.target.value)}
                disabled={!userCanModify}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-period-start">Pay Period Start</Label>
              <DatePickerNaturalLanguage
                id="pay-period-start"
                initialDate={payPeriodStart}
                onDateChange={(iso) => setNewPayPeriodStart(iso)}
                disabled={!userCanModify}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-period-end">Pay Period End</Label>
              <DatePickerNaturalLanguage
                id="pay-period-end"
                initialDate={payPeriodEnd}
                onDateChange={(iso) => setNewPayPeriodEnd(iso)}
                disabled={!userCanModify}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">
                Description{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="description"
                value={description ?? ''}
                onChange={(e) => setNewDescription(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if ((e.metaKey || e.ctrlKey) && e.key === "a") {
                    e.preventDefault();
                    e.currentTarget.select();
                  }
                }}
                placeholder="Any notes about this comparison run…"
                disabled={!userCanModify}
              />
            </div>

            {userCanModify && (
              <div className="flex items-center gap-3 pt-1">
                <Button type="submit" disabled={patchComparison.isPending || !dirty}>
                  {patchComparison.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {patchComparison.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Display */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Display</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sort-preference">Sort employees by</Label>
            <Select
              value={sortPreference}
              onValueChange={handleSortPreferenceChange}
              disabled={!userCanModify}
            >
              <SelectTrigger id="sort-preference" className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="discrepancy_amount">Discrepancy amount</SelectItem>
                <SelectItem value="first_name">First name</SelectItem>
                <SelectItem value="last_name">Last name</SelectItem>
                <SelectItem value="employee_key">Employee key</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Reconfigure */}
      {userCanModify && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reconfigure</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Link to="/comparisons/$id/reconfigure" params={{ id }} search={{ step: 0 }}>
              <Button variant="outline">Replace Files</Button>
            </Link>
            <Link to="/comparisons/$id/reconfigure" params={{ id }} search={{ step: 2 }}>
              <Button variant="outline">Remap Employees</Button>
            </Link>
            <Link to="/comparisons/$id/reconfigure" params={{ id }} search={{ step: 3 }}>
              <Button variant="outline">Remap Columns</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Collaborators */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Collaborators</CardTitle>
          {userCanModify && <Button variant="outline" size="sm" onClick={() => { setInviteEmail(''); setInviteOpen(true); }}>Invite</Button>}
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-6 py-2.5 text-left font-medium text-muted-foreground">User</th>
                <th className="px-6 py-2.5 text-left font-medium text-muted-foreground">Access</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {collaborators?.map((c) => (
                <tr key={c.userId} className="border-b last:border-0">
                  <td className="px-6 py-3">
                    <p className="font-medium">{c.userName ?? c.userEmail}</p>
                    {c.userName && <p className="text-xs text-muted-foreground">{c.userEmail}</p>}
                  </td>
                  <td className="px-6 py-3 capitalize text-muted-foreground">{c.access}</td>
                  <td className="pr-3 py-3">
                    {c.access !== 'owner' && userCanModify && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-44 p-1">
                          <button
                            className="w-full rounded-sm px-2 py-1.5 text-sm text-left hover:bg-accent"
                            onClick={() => handleEditAccess(c.userId, c.access as 'viewer' | 'editor')}
                          >
                            Edit access
                          </button>
                          {c?.role !== 'guest' && (
                            <button
                              className="w-full rounded-sm px-2 py-1.5 text-sm text-left hover:bg-accent"
                              onClick={() => handleMakeOwner(c.userId)}
                            >
                              Make owner
                            </button>
                          )}
                          <button
                            className="w-full rounded-sm px-2 py-1.5 text-sm text-left text-destructive hover:bg-destructive/10"
                            onClick={() => handleRemove(c.userId)}
                          >
                            Remove access
                          </button>
                        </PopoverContent>
                      </Popover>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite collaborator</DialogTitle>
            <DialogDescription>Enter the email address of the person you'd like to invite.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="name@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button disabled={!inviteEmail.trim() || inviteCollaborator.isPending} onClick={handleInvite}>
              {inviteCollaborator.isPending ? 'Inviting…' : 'Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit access dialog */}
      <Dialog open={!!editingCollab} onOpenChange={(open) => { if (!open) setEditingCollab(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit access</DialogTitle>
            <DialogDescription>Change the access level for this collaborator.</DialogDescription>
          </DialogHeader>
          <Select value={editAccess} onValueChange={(v) => setEditAccess(v as 'viewer' | 'editor')}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">Viewer</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCollab(null)}>Cancel</Button>
            <Button onClick={handleSaveAccess} disabled={patchCollaboratorAccess.isPending}>
              {patchCollaboratorAccess.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Danger Zone */}
      {userIsOwner && <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete this Comparison</p>
              <p className="text-sm text-muted-foreground">
                Permanently removes all sources, mappings, and results.
              </p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive">Delete</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete "{comparison.label}"?</DialogTitle>
                  <DialogDescription>
                    This will permanently delete the Comparison and all its sources, mappings,
                    and results. This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter showCloseButton>
                  <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
                    {deleting ? "Deleting…" : "Delete"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>}
    </div>
  );
}

function OptionsPageSkeleton() {
  return (
    <div className="container mx-auto max-w-2xl p-8 flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>
      <div className="rounded-lg border p-6 flex flex-col gap-4">
        <Skeleton className="h-5 w-24" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-9 w-20" />
      </div>
    </div>
  );
}
