import { formatRows } from "./format.js"

export function runShell(database, host = Host) {
  let sql = ""
  while (true) {
    print(sql ? "   ...> " : "mydb> ")
    const line = host.process.readLine()
    if (line === null || line.trim() === ".quit") break
    if (!sql && line.trim() === ".tables") { print([...database.catalog.tables.keys()].join("\n")); continue }
    if (!sql && line.trim() === ".stats") { print(formatRows(database.stats())); continue }
    sql += `${line}\n`
    if (!line.includes(";")) continue
    try { print(formatRows(database.execute(sql))) }
    catch (error) { print(`${error.code ?? error.name}: ${error.message}`) }
    sql = ""
  }
}
