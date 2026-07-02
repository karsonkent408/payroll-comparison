import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Popover, PopoverTrigger, PopoverContent } from "@/shared/components/ui/popover";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { authClient } from "@/shared/lib/auth-client";
import { Button } from "@/shared/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { StatusBadge, type ComparisonStatus } from "@/features/comparisons/components/StatusBadge";
import { FilterPopover, type ComparisonFilter } from "@/features/comparisons/components/FilterPopover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import type { MyUser as User } from '@/shared/lib/types'
import { ComparisonQueries } from "@/features/comparisons/query";
import { ComparisonMutations } from "@/features/comparisons/mutations";
import { useMutation } from "@tanstack/react-query";

const PAGE_SIZE = 20;

type Comparison = {
  id: number;
  label: string;
  pay_period_start: string;
  pay_period_end: string;
  status: ComparisonStatus;
  owner: { id: string; name: string } | null;
};

export function ComparisonList() {
  const navigate = useNavigate({ from: "/" });
  const deleteComparison = useMutation(ComparisonMutations.deleteComparison)
  const search = useSearch({ from: "/" });
  const { page = 1, filters: filtersFromUrl } = search as { page?: number; filters?: string };
  const filtersRaw = filtersFromUrl ?? localStorage.getItem("comparisonListFilters") ?? undefined;

  const activeFilters: ComparisonFilter[] = useMemo(() => {
    if (!filtersRaw) return [];
    try { return JSON.parse(filtersRaw) as ComparisonFilter[]; }
    catch { return []; }
  }, [filtersRaw]);

  const [comparisons, setComparisons] = useState<Comparison[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openPopoverId, setOpenPopoverId] = useState<number | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const { data: session } = authClient.useSession()
  const user = session?.user ?? null
  const { isPending, isError, data, error } = ComparisonQueries.useComparisons(page, 20, filtersRaw)


  useEffect(() => {
    if (data) {
      setComparisons(data.items);
      setTotal(data.total);
      setTotalPages(Math.max(1, Math.ceil(data.total / PAGE_SIZE)));
    }
  }, [data, page, filtersRaw]);

  async function handleDelete() {
    if (deletingId === null) return;
    setDeleting(true);
    try {
      await deleteComparison.mutateAsync(String(deletingId));
      setDeletingId(null);
    } finally {
      setDeleting(false);
    }
  }

  function handleFilterApply(newFilters: ComparisonFilter[]) {
    const serialized = newFilters.length ? JSON.stringify(newFilters) : undefined;
    if (serialized) {
      localStorage.setItem("comparisonListFilters", serialized);
    } else {
      localStorage.removeItem("comparisonListFilters");
    }
    navigate({
      search: {
        page: 1,
        filters: serialized,
      },
    });
  }

  const deletingComparison = comparisons?.find((c) => c.id === deletingId);

  const columns = useMemo<ColumnDef<Comparison>[]>(
    () => [
      {
        accessorKey: "label",
        header: "Label",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.label}</span>
        ),
      },
      {
        accessorKey: "pay_period_start",
        header: "Period Start",
      },
      {
        accessorKey: "pay_period_end",
        header: "Period End",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "owner",
        header: "Owner",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.owner?.name ?? "—"}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          currentUser && (currentUser.role === "admin" || row.original.owner?.id === currentUser.id) ? (
            <Popover
              open={openPopoverId === row.original.id}
              onOpenChange={(open) => setOpenPopoverId(open ? row.original.id : null)}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="More options"
                  onClick={(e) => e.stopPropagation()}
                  className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-36 p-1"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive hover:bg-muted transition-colors"
                  onClick={() => {
                    setOpenPopoverId(null);
                    setDeletingId(row.original.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </PopoverContent>
            </Popover>
          ) : null,
      },
    ],
    [currentUser, openPopoverId]
  );

  const table = useReactTable({
    data: comparisons ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="container mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold">Comparisons</h1>
        <Link to="/comparisons/new">
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            New Comparison
          </button>
        </Link>
      </div>

      <div className="flex items-center justify-end mb-4 min-h-9">
        <FilterPopover filters={activeFilters} onApply={handleFilterApply} currentUserId={currentUser?.id ?? null} />
      </div>

      {comparisons === null && !isError && (
        <ComparisonListSkeleton />
      )}

      {isError && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="text-sm">Failed to load comparisons.</p>
        </div>
      )}

      {comparisons !== null && comparisons.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="text-sm">No comparisons yet.</p>
          <p className="text-sm mt-1">
            <Link to="/comparisons/new" className="underline underline-offset-4">
              Create your first one
            </Link>{" "}
            to get started.
          </p>
        </div>
      )}

      {comparisons !== null && comparisons.length > 0 && (
        <>
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
                  <TableRow
                    key={row.id}
                    onClick={() =>
                      navigate({ to: "/comparisons/$id", params: { id: String(row.original.id) }, search: { message: undefined } })
                    }
                    className="cursor-pointer hover:bg-muted/40"
                  >
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

          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              {total === 1 ? "1 comparison" : `${total} comparisons`}
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => navigate({ search: { page: page - 1 } })}
              >
                Prev
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => navigate({ search: { page: page + 1 } })}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={deletingId !== null} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete comparison?</DialogTitle>
            <DialogDescription>
              <strong className="text-foreground">{deletingComparison?.label}</strong> and all its data will be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ComparisonListSkeleton() {
  return (
    <div className="rounded-md border overflow-hidden bg-card">
      <div className="border-b bg-muted/50 px-4 py-3 flex gap-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-28 ml-auto" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-8" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="border-t px-4 py-3 flex items-center gap-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-16 rounded-full ml-auto" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-6 rounded" />
        </div>
      ))}
    </div>
  );
}
