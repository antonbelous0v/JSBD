import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { Database } from "../js/database.js"
import { createHost } from "./host.js"

test("database executes persistent relational SQL", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mydb-database-"))
  const file = path.join(directory, "data.db")
  const host = createHost()
  let database = Database.open(file, host)
  database.execute("CREATE TABLE users (id BIGINT PRIMARY KEY, name TEXT NOT NULL, score INT)")
  database.execute("INSERT INTO users VALUES (1, 'Ada', 9), (2, 'Linus', 7), (3, 'Grace', 10)")
  assert.deepEqual(database.execute("SELECT name FROM users WHERE score >= 9 ORDER BY name"), [["Ada"], ["Grace"]])
  assert.deepEqual(database.execute("SELECT COUNT(*), MAX(score) FROM users"), [[3n, 10]])
  database.close()
  database = Database.open(file, host)
  assert.deepEqual(database.execute("SELECT name FROM users WHERE id = 2"), [["Linus"]])
  database.close()
  fs.rmSync(directory, { recursive: true })
})
