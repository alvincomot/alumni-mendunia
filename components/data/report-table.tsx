"use client";

import { useMemo } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

export function ReportTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  const columns = useMemo(
    () =>
      headers.map((header, index) => ({
        id: String(index),
        header,
        accessorFn: (row: string[]) => row[index],
      })),
    [headers],
  );
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <div
      role="region"
      aria-label="Rincian laporan, geser untuk melihat seluruh kolom"
      tabIndex={0}
      className="overflow-x-auto rounded-lg border bg-white"
    >
      <table className="w-full min-w-[1100px] text-left text-sm">
        <caption className="sr-only">
          Rincian alumni dan penempatan saat ini
        </caption>
        <thead className="border-b bg-secondary">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th scope="col" key={header.id} className="px-4 py-3">
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="max-w-64 break-words px-4 py-4">
                  {flexRender(cell.column.columnDef.cell, cell.getContext()) ||
                    "Belum dicatat"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
