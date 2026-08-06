import { describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResponsiveTable, type ResponsiveColumn } from "./responsive-table";

interface Team {
  id: string;
  name: string;
  school: string;
  wins: number;
  points: number;
  oppWins: number;
}

const rows: Team[] = [
  { id: "t1", name: "Green Hills A", school: "Green Hills", wins: 4, points: 820, oppWins: 9 },
  { id: "t2", name: "Riverside B", school: "Riverside", wins: 2, points: 780, oppWins: 11 },
];

const columns: Array<ResponsiveColumn<Team>> = [
  { id: "name", header: "Team", cell: (row) => row.name, priority: "primary" },
  { id: "school", header: "School", cell: (row) => row.school, priority: "secondary" },
  { id: "wins", header: "Wins", cell: (row) => row.wins, priority: "summary" },
  { id: "points", header: "Points", cell: (row) => row.points, priority: "summary" },
  { id: "oppWins", header: "Opp Wins", cell: (row) => row.oppWins, priority: "detail" },
];

const renderTable = (props: Partial<React.ComponentProps<typeof ResponsiveTable<Team>>> = {}) =>
  render(
    <ResponsiveTable rows={rows} columns={columns} rowKey={(row) => row.id} {...props} />
  );

/** The card list, so assertions about card content ignore the table. */
const cards = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(".sm\\:hidden")!;

describe("both presentations show the same data", () => {
  test("the table renders every column", () => {
    renderTable();

    const table = screen.getByRole("table");

    for (const column of columns) {
      expect(within(table).getByText(column.header as string)).toBeInTheDocument();
    }
  });

  test("every row appears in both forms", () => {
    renderTable();

    // Once in the table, once on a card — the two are toggled by CSS.
    expect(screen.getAllByText("Green Hills A")).toHaveLength(2);
    expect(screen.getAllByText("Riverside B")).toHaveLength(2);
  });

  test("an empty set shows the fallback instead", () => {
    renderTable({ rows: [], empty: <p>No teams yet</p> });

    expect(screen.getByText("No teams yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("an empty set with no fallback still renders the header", () => {
    renderTable({ rows: [] });

    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

describe("card priorities", () => {
  test("detail columns are hidden until asked for", () => {
    const { container } = renderTable();

    // The table still carries every column; the card does not.
    expect(within(cards(container)).queryByText("Opp Wins")).not.toBeInTheDocument();
    expect(within(cards(container)).queryByText("11")).not.toBeInTheDocument();
  });

  test("expanding a card reveals its detail fields", async () => {
    const user = userEvent.setup();
    const { container } = renderTable();

    await user.click(screen.getAllByLabelText("Show details")[0]);

    expect(within(cards(container)).getByText("Opp Wins")).toBeInTheDocument();
    expect(within(cards(container)).getByText("9")).toBeInTheDocument();
  });

  test("collapsing hides them again", async () => {
    const user = userEvent.setup();
    const { container } = renderTable();

    await user.click(screen.getAllByLabelText("Show details")[0]);
    await user.click(screen.getAllByLabelText("Hide details")[0]);

    expect(within(cards(container)).queryByText("Opp Wins")).not.toBeInTheDocument();
  });

  test("each card expands on its own", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getAllByLabelText("Show details")[0]);

    // The second card is untouched.
    expect(screen.getAllByLabelText("Show details")).toHaveLength(1);
  });

  test("no disclosure is shown when nothing is hidden", () => {
    renderTable({ columns: columns.filter((column) => column.priority !== "detail") });

    expect(screen.queryByLabelText("Show details")).not.toBeInTheDocument();
  });

  test("a column with no priority is treated as a summary field", () => {
    renderTable({
      columns: [
        { id: "name", header: "Team", cell: (row: Team) => row.name, priority: "primary" },
        { id: "wins", header: "Wins", cell: (row: Team) => row.wins },
      ],
    });

    // Labelled on the card, so it came through as a summary rather than hidden.
    expect(screen.getAllByText("Wins").length).toBeGreaterThan(1);
  });

  test("a card label overrides the header", () => {
    renderTable({
      columns: [
        { id: "name", header: "Team", cell: (row: Team) => row.name, priority: "primary" },
        {
          id: "oppWins",
          header: "Opp Wins",
          cardLabel: "Opponent wins",
          cell: (row: Team) => row.oppWins,
          priority: "summary",
        },
      ],
    });

    expect(screen.getAllByText("Opponent wins").length).toBeGreaterThan(0);
  });
});

describe("row interaction", () => {
  test("a row reports the record it belongs to", async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();

    renderTable({ onRowClick });

    await user.click(screen.getAllByText("Riverside B")[0]);

    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  test("expanding a card does not also select the row", async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();

    renderTable({ onRowClick });

    await user.click(screen.getAllByLabelText("Show details")[0]);

    expect(onRowClick).not.toHaveBeenCalled();
  });

  test("a footer is rendered per card", () => {
    renderTable({ cardFooter: (row: Team) => <button>Edit {row.name}</button> });

    expect(screen.getByRole("button", { name: "Edit Green Hills A" })).toBeInTheDocument();
  });
});

describe("the mobile presentation is not a horizontal peephole", () => {
  test("cards are shown below sm and the table above it", () => {
    const { container } = renderTable();

    const table = container.querySelector(".hidden.sm\\:block");
    const cards = container.querySelector(".sm\\:hidden");

    expect(table).toBeInTheDocument();
    expect(cards).toBeInTheDocument();
  });

  test("the disclosure meets the minimum tap target", () => {
    renderTable();

    expect(screen.getAllByLabelText("Show details")[0]).toHaveClass("size-11");
  });
});
