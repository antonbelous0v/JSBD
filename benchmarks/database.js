import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { Database } from "../js/database.js"
import { createHost } from "../tests/host.js"

const count = Number(process.argv[2] ?? 10000)
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mydb-benchmark-"))
const database = Database.open(path.join(directory, "data.db"), createHost())
database.execute("CREATE TABLE values_table (id BIGINT PRIMARY KEY, value INT NOT NULL)")
const start = process.hrtime.bigint()
database.execute("BEGIN")
for (let index = 0; index < count; index += 1) database.execute(`INSERT INTO values_table VALUES (${index}, ${index})`)
database.execute("COMMIT")
const inserted = process.hrtime.bigint()
for (let index = 0; index < count; index += 1) database.execute(`SELECT value FROM values_table WHERE id = ${index}`)
const finished = process.hrtime.bigint()
console.log(`insert: ${rate(count, start, inserted)} ops/s`)
console.log(`point select: ${rate(count, inserted, finished)} ops/s`)
database.close()
fs.rmSync(directory, { recursive: true })

function rate(operations, startTime, endTime) { return Math.round(operations / (Number(endTime - startTime) / 1e9)) }
