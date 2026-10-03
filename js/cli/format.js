function text(value) {
  if (value === null) {
    return "NULL"
  }
  if (typeof value === "bigint") {
    return value.toString()
  }
  return String(value)
}

export function formatRows(rows) {
  if (!Array.isArray(rows) || !rows.length || !Array.isArray(rows[0])) {
    return typeof rows === "string" ? rows : JSON.stringify(rows, (_, value) => typeof value === "bigint" ? value.toString() : value)
  }
  const widths = rows[0].map((_, column) => Math.max(...rows.map(row => text(row[column]).length)))
  return rows.map(row => row.map((value, column) => text(value).padEnd(widths[column])).join(" | ")).join("\n")
}
