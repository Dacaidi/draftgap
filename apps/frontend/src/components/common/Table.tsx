import { Table as TanstackTable, flexRender, Row } from "@tanstack/solid-table";
import { createVirtualizer } from "@tanstack/solid-virtual";
import { For, JSX, Show, createMemo } from "solid-js";
import { cn } from "../../utils/style";

interface Props<T> {
    table: TanstackTable<T>;
    onClickRow?: (row: Row<T>) => void;
    rowClassName?: (row: Row<T>) => string;
}

export function Table<T>(props: Props<T> & JSX.HTMLAttributes<HTMLDivElement>) {
    let tableEl: HTMLTableElement | undefined;

    const rows = createMemo(() => props.table.getRowModel().rows);

    const rowVirtualizer = createVirtualizer<Element, Element>({
        getScrollElement: () => tableEl!,
        estimateSize: () => 57,
        get count() {
            return rows().length;
        },
        overscan: 10,
    });

    const virtualRows = createMemo(() => rowVirtualizer.getVirtualItems());

    const paddingTop = () =>
        virtualRows().length > 0 ? virtualRows()?.[0]?.start || 0 : 0;
    const paddingBottom = () =>
        virtualRows().length > 0
            ? rowVirtualizer.getTotalSize() -
              (virtualRows()?.[virtualRows().length - 1]?.end || 0)
            : 0;

    return (
        <div
            ref={tableEl}
            {...props}
            class={cn(
                "rounded-md overflow-auto max-h-full max-w-full",
                props.class,
            )}
        >
            <table
                class="min-w-full text-lg md:text-xl lg:text-2xl"
                classList={{
                    "divide-y divide-neutral-700": rows.length > 0,
                }}
            >
                <thead class="bg-neutral-900 sticky top-0 z-1">
                    <For each={props.table.getHeaderGroups()}>
                        {(headerGroup) => (
                            <tr>
                                <For each={headerGroup.headers}>
                                    {(header, i) => (
                                        <th
                                            scope="col"
                                            class={cn(
                                                "py-3 px-2 text-left font-normal uppercase w-full whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ally",
                                                {
                                                    "pl-4": i() === 0,
                                                    "pr-4":
                                                        i() ===
                                                        headerGroup.headers
                                                            .length -
                                                            1,
                                                    "hover:bg-neutral-800 cursor-default":
                                                        header.column.getCanSort(),
                                                },
                                                (
                                                    header.column.columnDef
                                                        .meta as any
                                                )?.headerClass,
                                            )}
                                            aria-sort={
                                                !header.column.getCanSort()
                                                    ? undefined
                                                    : header.column.getIsSorted() ===
                                                        "asc"
                                                      ? "ascending"
                                                      : header.column.getIsSorted() ===
                                                          "desc"
                                                        ? "descending"
                                                        : "none"
                                            }
                                            tabindex={
                                                header.column.getCanSort()
                                                    ? 0
                                                    : undefined
                                            }
                                            onClick={header.column.getToggleSortingHandler()}
                                            onKeyDown={(event) => {
                                                if (
                                                    !header.column.getCanSort() ||
                                                    (event.key !== "Enter" &&
                                                        event.key !== " ")
                                                )
                                                    return;

                                                event.preventDefault();
                                                header.column.getToggleSortingHandler()?.(
                                                    event,
                                                );
                                            }}
                                        >
                                            <div class="flex items-center gap-1">
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(
                                                          header.column
                                                              .columnDef.header,
                                                          header.getContext(),
                                                      )}
                                                <Show
                                                    when={
                                                        header.column.getIsSorted() !==
                                                        false
                                                    }
                                                >
                                                    <span class="text-base mr-">
                                                        {
                                                            {
                                                                asc: "\u25B2",
                                                                desc: "\u25BC",
                                                            }[
                                                                header.column.getIsSorted() as string
                                                            ]
                                                        }
                                                    </span>
                                                </Show>
                                            </div>
                                        </th>
                                    )}
                                </For>
                            </tr>
                        )}
                    </For>
                </thead>
                <tbody class="divide-y divide-neutral-800 bg-primary">
                    <Show when={paddingTop() > 0}>
                        <tr>
                            <td style={{ height: `${paddingTop()}px` }} />
                        </tr>
                    </Show>
                    <For
                        each={rowVirtualizer
                            .getVirtualItems()
                            .map((i: any) => rows()[i.index])
                            .filter((r: any) => r)}
                    >
                        {(row) => (
                            <tr
                                class="transition duration-200 ease-out group/row focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ally"
                                classList={{
                                    "hover:bg-neutral-800": Boolean(
                                        props.onClickRow,
                                    ),
                                    [props.rowClassName?.(row) ?? ""]: true,
                                }}
                                onClick={() => props.onClickRow?.(row)}
                                tabindex={props.onClickRow ? 0 : undefined}
                                onKeyDown={(e) => {
                                    if (e.target !== e.currentTarget) return;
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        props.onClickRow?.(row);
                                    }
                                }}
                            >
                                <For each={row.getVisibleCells()}>
                                    {(cell, i) => (
                                        <td
                                            class={cn(
                                                "whitespace-nowrap py-3 px-2 group/cell transition-colors",
                                                {
                                                    "pl-4": i() === 0,
                                                    "pr-4":
                                                        i() ===
                                                        row.getVisibleCells()
                                                            .length -
                                                            1,
                                                    "hover:bg-neutral-800 cursor-default":
                                                        Boolean(
                                                            (
                                                                cell.column
                                                                    .columnDef
                                                                    .meta as any
                                                            )?.onClickCell,
                                                        ),
                                                },
                                                (
                                                    cell.column.columnDef
                                                        .meta as any
                                                )?.cellClass,
                                            )}
                                            onClick={(e) =>
                                                (
                                                    cell.column.columnDef
                                                        .meta as any
                                                )?.onClickCell?.(
                                                    e,
                                                    cell.getContext(),
                                                )
                                            }
                                        >
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext(),
                                            )}
                                        </td>
                                    )}
                                </For>
                            </tr>
                        )}
                    </For>
                    <Show when={paddingBottom() > 0}>
                        <tr>
                            <td style={{ height: `${paddingBottom()}px` }} />
                        </tr>
                    </Show>
                    <Show when={rows().length === 0}>
                        <tr>
                            <td
                                class="py-6 px-2 text-center uppercase text-lg text-neutral-500"
                                colspan="100%"
                            >
                                No results
                            </td>
                        </tr>
                    </Show>
                </tbody>
                <Show
                    when={props.table
                        .getFooterGroups()
                        .flatMap((g) => g.headers)
                        .some((h) => h.column.columnDef.footer)}
                >
                    <tfoot class="bg-neutral-900">
                        <For each={props.table.getFooterGroups()}>
                            {(footerGroup) => (
                                <tr>
                                    <For each={footerGroup.headers}>
                                        {(footer, i) => (
                                            <th
                                                scope="col"
                                                class={cn(
                                                    "py-3 px-2 text-left font-normal uppercase w-full",
                                                    {
                                                        "pl-4": i() === 0,
                                                        "pr-4":
                                                            i() ===
                                                            footerGroup.headers
                                                                .length -
                                                                1,
                                                    },
                                                    (
                                                        footer.column.columnDef
                                                            .meta as any
                                                    )?.footerClass,
                                                )}
                                            >
                                                {footer.isPlaceholder
                                                    ? null
                                                    : flexRender(
                                                          footer.column
                                                              .columnDef.footer,
                                                          footer.getContext(),
                                                      )}
                                            </th>
                                        )}
                                    </For>
                                </tr>
                            )}
                        </For>
                    </tfoot>
                </Show>
            </table>
        </div>
    );
}
