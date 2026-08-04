import writeXlsxFile, { type Cell, type SheetData } from "write-excel-file/browser";

export type ExcelSheet = {
  name: string;
  rows: Array<Record<string, unknown>>;
};

function toTitleCase(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function toCell(value: unknown): Cell {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? { value, type: Number } : null;
  }

  if (typeof value === "boolean") return { value, type: Boolean };
  if (value instanceof Date) return { value, type: Date };

  return { value: String(value), type: String };
}

function buildSheet(rows: Array<Record<string, unknown>>): SheetData {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  const headerRow: Cell[] = keys.map((key) => ({
    value: toTitleCase(key),
    type: String,
    fontWeight: "bold",
  }));

  const dataRows: Cell[][] = rows.map((row) => keys.map((key) => toCell(row[key])));

  return [headerRow, ...dataRows];
}

/**
 * Sheets whose `rows` are empty are dropped, because the format requires at
 * least one sheet with content.
 */
export async function downloadExcel(sheets: ExcelSheet[], fileName: string) {
  const populated = sheets.filter((sheet) => sheet.rows.length > 0);

  if (populated.length === 0) {
    throw new Error("No data available to export");
  }

  await writeXlsxFile(
    populated.map((sheet) => ({
      name: sheet.name,
      data: buildSheet(sheet.rows),
    }))
  ).toFile(fileName);
}
