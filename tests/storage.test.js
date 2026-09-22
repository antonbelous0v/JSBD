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
