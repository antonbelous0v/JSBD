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

test("updates deletes and rollbacks preserve row versions", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mydb-mvcc-"))
  const file = path.join(directory, "data.db")
  const database = Database.open(file, createHost())
  database.execute("CREATE TABLE accounts (id BIGINT PRIMARY KEY, balance INT NOT NULL)")
  database.execute("INSERT INTO accounts VALUES (1, 100), (2, 200)")
  database.execute("BEGIN")
  database.execute("UPDATE accounts SET balance = balance + 50 WHERE id = 1")
  database.execute("DELETE FROM accounts WHERE id = 2")
  database.execute("ROLLBACK")
  assert.deepEqual(database.execute("SELECT id, balance FROM accounts ORDER BY id"), [[1n, 100], [2n, 200]])
  database.execute("UPDATE accounts SET balance = 125 WHERE id = 1")
  database.execute("DELETE FROM accounts WHERE id = 2")
  assert.deepEqual(database.execute("SELECT id, balance FROM accounts"), [[1n, 125]])
  database.close()
  fs.rmSync(directory, { recursive: true })
})

test("primary unique not null and foreign keys reject invalid rows", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mydb-constraints-"))
  const database = Database.open(path.join(directory, "data.db"), createHost())
  database.execute("CREATE TABLE users (id BIGINT PRIMARY KEY, email TEXT UNIQUE NOT NULL)")
  database.execute("CREATE TABLE orders (id BIGINT PRIMARY KEY, user_id BIGINT REFERENCES users(id))")
  database.execute("INSERT INTO users VALUES (1, 'ada@example.test')")
  assert.throws(() => database.execute("INSERT INTO users VALUES (2, 'ada@example.test')"), /Unique constraint/)
  assert.throws(() => database.execute("INSERT INTO users VALUES (3, NULL)"), /cannot be null/)
  assert.throws(() => database.execute("INSERT INTO orders VALUES (1, 99)"), /Foreign key/)
  database.execute("INSERT INTO orders VALUES (1, 1)")
  database.close()
  fs.rmSync(directory, { recursive: true })
})
