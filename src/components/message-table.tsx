"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { ArrowUpDown, Check, Star, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";

export type MessageItem = {
  id: string;
  sender: string;
  senderName: string;
  subject: string;
  preview: string;
  receivedAt: string;
  isJunk: boolean;
  isRead: boolean;
  webLink: string | null;
  /** Confirmed label (user or folder), if any. */
  label: "important" | "not_important" | null;
  /** Model's P(important), null while it has too little training data. */
  score: number | null;
};

function Suggestion({ m }: { m: MessageItem }) {
  if (m.label) {
    return m.label === "important" ? <Badge variant="success">Important</Badge> : <Badge variant="secondary">Not important</Badge>;
  }
  if (m.score == null) return <Badge variant="outline">Unsure</Badge>;
  const imp = m.score >= 0.5;
  const pct = Math.round((imp ? m.score : 1 - m.score) * 100);
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      {imp ? "Important?" : "Not important?"} <span className="text-muted-foreground">{pct}%</span>
    </Badge>
  );
}

export function MessageTable({ items, timeZone, emptyText }: { items: MessageItem[]; timeZone: string; emptyText: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [sorting, setSorting] = useState<SortingState>([{ id: "receivedAt", desc: true }]);
  const [filter, setFilter] = useState("");
  const [selection, setSelection] = useState<RowSelectionState>({});

  const fmt = useMemo(
    () => new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    [timeZone],
  );

  async function label(ids: string[], value: "important" | "not_important") {
    try {
      await api("/api/label", "POST", { ids, label: value });
      toast.success(`${ids.length} marked ${value === "important" ? "important" : "not important"}`);
      setSelection({});
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  const columns = useMemo<ColumnDef<MessageItem>[]>(
    () => [
      {
        id: "select",
        enableSorting: false,
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="Select all"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input type="checkbox" aria-label="Select row" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />
        ),
      },
      {
        id: "message",
        accessorFn: (m) => `${m.senderName} ${m.sender} ${m.subject} ${m.preview}`,
        header: "Message",
        enableSorting: false,
        cell: ({ row }) => {
          const m = row.original;
          return (
            <div className="min-w-0 max-w-[52ch]">
              <div className="flex items-center gap-2">
                <span className={cn("truncate", !m.isRead && "font-semibold")}>{m.senderName || m.sender}</span>
                {m.isJunk && <Badge variant="warning">Junk</Badge>}
              </div>
              <a
                href={m.webLink ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-sm hover:underline"
              >
                {m.subject || "(no subject)"}
              </a>
              <div className="truncate text-xs text-muted-foreground">{m.preview}</div>
            </div>
          );
        },
      },
      {
        accessorKey: "receivedAt",
        header: ({ column }) => (
          <Button variant="ghost" size="sm" className="-ml-3" onClick={() => column.toggleSorting()}>
            Received <ArrowUpDown />
          </Button>
        ),
        cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{fmt.format(new Date(row.original.receivedAt))}</span>,
        meta: { className: "hidden sm:table-cell" },
      },
      {
        id: "score",
        accessorFn: (m) => (m.score == null ? -1 : Math.abs(m.score - 0.5)),
        header: ({ column }) => (
          <Button variant="ghost" size="sm" className="-ml-3" onClick={() => column.toggleSorting()}>
            Model <ArrowUpDown />
          </Button>
        ),
        cell: ({ row }) => <Suggestion m={row.original} />,
        sortUndefined: "last",
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button size="icon" variant="ghost" title="Important" onClick={() => label([row.original.id], "important")}>
              <Star className="text-emerald-600" />
            </Button>
            <Button size="icon" variant="ghost" title="Not important" onClick={() => label([row.original.id], "not_important")}>
              <X className="text-muted-foreground" />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fmt],
  );

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting, globalFilter: filter, rowSelection: selection },
    getRowId: (m) => m.id,
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    onRowSelectionChange: setSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const selected = Object.keys(selection);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search sender, subject…" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
        {selected.length > 0 && (
          <>
            <span className="text-sm text-muted-foreground">{selected.length} selected</span>
            <Button size="sm" onClick={() => label(selected, "important")}>
              <Check /> Important
            </Button>
            <Button size="sm" variant="secondary" onClick={() => label(selected, "not_important")}>
              <X /> Not important
            </Button>
          </>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className={(h.column.columnDef.meta as { className?: string } | undefined)?.className}>
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={cn(row.original.isJunk && "bg-amber-500/10 hover:bg-amber-500/15", row.getIsSelected() && "bg-muted")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={(cell.column.columnDef.meta as { className?: string } | undefined)?.className}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {emptyText}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {table.getFilteredRowModel().rows.length} messages · page {table.getState().pagination.pageIndex + 1} of{" "}
          {Math.max(1, table.getPageCount())}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            Previous
          </Button>
          <Button size="sm" variant="outline" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
