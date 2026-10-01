import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { PageType } from "../js/constants.js"
import { Pager } from "../js/storage/pager.js"
import { BufferPool } from "../js/storage/buffer_pool.js"
import { SlottedPage } from "../js/storage/slotted_page.js"
import { createHost } from "./host.js"
import { CorruptionError } from "../js/errors.js"

test("pager persists slotted pages", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mydb-storage-"))
  const file = path.join(directory, "data.db")
  const host = createHost()
  const pager = Pager.open(host, file)
  const pool = new BufferPool(pager, 2)
  const page = pool.allocate(PageType.HEAP)
  const slots = SlottedPage.initialize(page)
  assert.equal(slots.insert(new Uint8Array([1, 2, 3])), 0)
  const id = page.id
  pool.unpin(page, true)
  pool.flushAll()
  const restored = pager.read(id)
  assert.deepEqual([...new SlottedPage(restored).get(0)], [1, 2, 3])
  pager.close()
  fs.rmSync(directory, { recursive: true })
})

test("pager refuses corrupted page contents", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mydb-corrupt-"))
  const file = path.join(directory, "data.db")
  const host = createHost()
  let pager = Pager.open(host, file)
  const page = pager.allocate(PageType.HEAP)
  pager.write(page)
  pager.close()
  const fd = fs.openSync(file, "r+")
  fs.writeSync(fd, new Uint8Array([255]), 0, 1, page.id * 8192 + 100)
  fs.closeSync(fd)
  pager = Pager.open(host, file)
  assert.throws(() => pager.read(page.id), CorruptionError)
  pager.close()
  fs.rmSync(directory, { recursive: true })
})
