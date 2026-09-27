import { Database } from "./database.js"
import { runShell } from "./cli/shell.js"

const argumentsList = Host.process.argv.slice(1)
const path = argumentsList.find(argument => !argument.startsWith("--"))

if (!path) throw new Error("Usage: mydb database.db [--shell]")

const database = Database.open(path)

try {
  if (argumentsList.includes("--shell")) runShell(database)
} finally {
  database.close()
}
