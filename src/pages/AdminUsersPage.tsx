import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, MoreHorizontal, PlusIcon } from "lucide-react";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { userQueries } from "@/features/users/query";
import { userMutations } from "@/features/users/mutations";
import { useMutation } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { Switch } from "@/shared/components/ui/switch";
import { Button } from "@/shared/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Field, FieldLabel } from "@/shared/components/ui/field";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Popover, PopoverTrigger, PopoverContent } from "@/shared/components/ui/popover";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

type User = { id: string; name: string; email: string; role: string | null; banned: boolean | null };

export function AdminUsersPage() {
  const [suspendedVisible, setSuspendedVisible] = useState(false);
  const { isPending, data: users, error } = userQueries.useUsers(suspendedVisible);
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newRole, setNewRole] = useState("");
  const [suspendingUser, setSuspendingUser] = useState<User | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "implementor" | "guest">("implementor");
  const deleteUser = useMutation(userMutations.deleteUser)
  const createUser = useMutation(userMutations.createUser)
  const patchUser = useMutation(userMutations.patchUser)
  const suspendUser = useMutation(userMutations.suspendUser)

  const deletingUser = users?.find((u) => u.id === deletingUserId);

  async function handleCreateUser() {
    try {
      await createUser.mutateAsync(
        { name: newUserName, email: newUserEmail, role: newUserRole },
        {
          onSuccess: () => toast('User created'),
          onError: (e: Error) => toast.error(e.message),
        }
      );
      setCreatingUser(false);
    } catch {}
  }

  async function handleSaveRole() {
    if (!editingUser) return;
    try {
      await patchUser.mutateAsync(
        { id: editingUser.id, role: newRole },
        {
          onSuccess: () => toast('User role updated'),
          onError: (e: Error) => toast.error(e.message),
        }
      );
      setEditingUser(null);
    } catch {}
  }

  async function handleDelete() {
    if (!deletingUserId) return;
    try {
      await deleteUser.mutateAsync(
        { id: deletingUserId },
        {
          onSuccess: () => toast('User deleted'),
          onError: (e: Error) => toast.error(e.message),
        }
      );
      setDeletingUserId(null);
    } catch {}
  }

  async function handleSuspend() {
    if (!suspendingUser) return;
    try {
      await suspendUser.mutateAsync(
        { id: suspendingUser.id, suspended: true, reason: suspendReason },
        {
          onSuccess: () => toast('User suspended'),
          onError: (e: Error) => toast.error(e.message),
        }
      );
      setSuspendingUser(null);
    } catch {}
  }

  async function handleUnsuspend(id:string) {
    try {
      await suspendUser.mutateAsync(
        { id, suspended: false, reason: '' },
        {
          onSuccess: () => toast('User unsuspended'),
          onError: (e: Error) => toast.error(e.message),
        }
      );
    } catch {}
  }

  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.email}</span>
        ),
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.role}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Popover
            open={openPopoverId === row.original.id}
            onOpenChange={(open) => setOpenPopoverId(open ? row.original.id : null)}
          >
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="More options"
                onClick={(e) => e.stopPropagation()}
                className="h-7 w-7 text-muted-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-40 p-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setOpenPopoverId(null);
                  setEditingUser(row.original);
                  setNewRole(row.original.role ?? "");
                }}
              >
                Edit role
              </Button>
              {row.original.banned ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={async () => {
                    setOpenPopoverId(null);
                    handleUnsuspend(row.original.id)
                  }}
                >
                  Unsuspend user
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    setOpenPopoverId(null);
                    setSuspendingUser(row.original);
                    setSuspendReason("");
                  }}
                >
                  Suspend user
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-destructive hover:text-destructive"
                onClick={() => {
                  setOpenPopoverId(null);
                  setDeletingUserId(row.original.id);
                }}
              >
                Delete user
              </Button>
            </PopoverContent>
          </Popover>
        ),
      },
    ],
    [openPopoverId]
  );

  const table = useReactTable({
    data: users ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (error) return <p className="p-8 text-destructive">{error.message}</p>;
  if (isPending) return <AdminUsersPageSkeleton />;

  return (
    <div className="container mx-auto max-w-3xl p-8">
      <Link to="/" search={{ page: 1, filters: undefined }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to comparisons
      </Link>
      <h1 className="text-2xl font-bold mb-6">Users</h1>
      <div className="flex flex-row pb-2">
        <Field orientation="horizontal">
          <Switch id="suspended-visible" checked={suspendedVisible} onCheckedChange={setSuspendedVisible} />
          <FieldLabel htmlFor="suspended-visible">Show suspended</FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <FieldLabel htmlFor="add-user" className="justify-end">Add User</FieldLabel>
          <Button id="add-user" size="icon" onClick={() => { setNewUserName(""); setNewUserEmail(""); setNewUserRole("implementor"); setCreatingUser(true); }}>
            <PlusIcon />
          </Button>
        </Field>
      </div>
      <div className="rounded-md border overflow-hidden bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="px-4 py-3">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className={row.original.banned ? "bg-muted/40" : ""}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editingUser !== null} onOpenChange={(open) => { if (!open) setEditingUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit role</DialogTitle>
            <DialogDescription>{editingUser?.name}</DialogDescription>
          </DialogHeader>
          <Select value={newRole} onValueChange={setNewRole}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="implementor">Implementor</SelectItem>
              <SelectItem value="guest">Guest</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button onClick={handleSaveRole}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={suspendingUser !== null} onOpenChange={(open) => { if (!open) setSuspendingUser(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Suspend user?</DialogTitle>
            <DialogDescription>{suspendingUser?.name} will be suspended and unable to log in.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="suspend-reason">Reason</Label>
            <Textarea
              id="suspend-reason"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Provide a reason for suspension…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendingUser(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!suspendReason.trim() || suspendUser.isPending} onClick={handleSuspend}>
              {suspendUser.isPending ? "Suspending…" : "Suspend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deletingUserId !== null} onOpenChange={(open) => { if (!open) setDeletingUserId(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete user?</DialogTitle>
            <DialogDescription>
              <strong className="text-foreground">{deletingUser?.name}</strong> will be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingUserId(null)} disabled={deleteUser.isPending}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteUser.isPending}>
              {deleteUser.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={creatingUser} onOpenChange={(open) => { if (!open) setCreatingUser(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-user-name">Name</Label>
              <input
                id="new-user-name"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Full name"
                className="rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-user-email">Email</Label>
              <input
                id="new-user-email"
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="email@example.com"
                className="rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <Select value={newUserRole} onValueChange={(v) => { if (v === "admin" || v === "implementor" || v === "guest") setNewUserRole(v); }}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="implementor">Implementor</SelectItem>
                  <SelectItem value="guest">Guest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatingUser(false)}>Cancel</Button>
            <Button
              onClick={handleCreateUser}
              disabled={!newUserName.trim() || !newUserEmail.trim() || createUser.isPending}
            >
              {createUser.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminUsersPageSkeleton() {
  return (
    <div className="container mx-auto max-w-3xl p-8">
      <Skeleton className="h-8 w-20 mb-6" />
      <div className="rounded-md border overflow-hidden bg-card">
        <div className="border-b bg-muted/50 px-4 py-3 flex gap-8">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-12" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-t px-4 py-3 flex items-center gap-8">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-7 w-28 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
