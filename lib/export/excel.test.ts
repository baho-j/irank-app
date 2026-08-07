import { describe, expect, test, vi, beforeEach } from "vitest";

const writeXlsxFile = vi.hoisted(() => vi.fn());

vi.mock("write-excel-file/browser", () => ({
  default: writeXlsxFile,
}));

import { downloadExcel } from "./excel";

function lastCallSheets() {
  return writeXlsxFile.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  writeXlsxFile.mockReset();
  writeXlsxFile.mockReturnValue({ toFile: vi.fn().mockResolvedValue(undefined) });
});

describe("downloadExcel", () => {
  test("throws when every sheet is empty rather than writing a broken file", async () => {
    await expect(
      downloadExcel([{ name: "Empty", rows: [] }], "out.xlsx")
    ).rejects.toThrow(/no data available/i);

    expect(writeXlsxFile).not.toHaveBeenCalled();
  });

  test("drops empty sheets but keeps populated ones", async () => {
    await downloadExcel(
      [
        { name: "Empty", rows: [] },
        { name: "Teams", rows: [{ name: "Team A" }] },
      ],
      "out.xlsx"
    );

    expect(lastCallSheets()).toHaveLength(1);
    expect(lastCallSheets()[0].name).toBe("Teams");
  });

  test("writes a bold header row derived from the row keys", async () => {
    await downloadExcel(
      [{ name: "Teams", rows: [{ team_name: "A", total_points: 10 }] }],
      "out.xlsx"
    );

    const [header] = lastCallSheets()[0].data;

    expect(header).toEqual([
      { value: "Team Name", type: String, fontWeight: "bold" },
      { value: "Total Points", type: String, fontWeight: "bold" },
    ]);
  });

  test("preserves value types so numbers stay numeric in the spreadsheet", async () => {
    const when = new Date("2026-08-04T00:00:00Z");

    await downloadExcel(
      [{ name: "Mixed", rows: [{ count: 42, active: true, when, label: "x" }] }],
      "out.xlsx"
    );

    const [, row] = lastCallSheets()[0].data;

    expect(row).toEqual([
      { value: 42, type: Number },
      { value: true, type: Boolean },
      { value: when, type: Date },
      { value: "x", type: String },
    ]);
  });

  test("unions keys across rows so ragged data stays aligned", async () => {
    await downloadExcel(
      [{ name: "Ragged", rows: [{ a: 1 }, { b: 2 }] }],
      "out.xlsx"
    );

    const [header, first, second] = lastCallSheets()[0].data;

    expect(header.map((cell: any) => cell.value)).toEqual(["A", "B"]);
    expect(first).toEqual([{ value: 1, type: Number }, null]);
    expect(second).toEqual([null, { value: 2, type: Number }]);
  });

  test("writes null for values the format cannot represent", async () => {
    await downloadExcel(
      [{ name: "Gaps", rows: [{ missing: null, undef: undefined, nan: NaN }] }],
      "out.xlsx"
    );

    const [, row] = lastCallSheets()[0].data;

    expect(row).toEqual([null, null, null]);
  });

  test("passes the file name through to toFile", async () => {
    const toFile = vi.fn().mockResolvedValue(undefined);
    writeXlsxFile.mockReturnValue({ toFile });

    await downloadExcel([{ name: "S", rows: [{ a: 1 }] }], "report.xlsx");

    expect(toFile).toHaveBeenCalledWith("report.xlsx");
  });
});
