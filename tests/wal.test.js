import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { WalType } from "../js/constants.js"
import { WriteAheadLog } from "../js/wal/wal.js"
import { WalRecord } from "../js/wal/record.js"
import { Recovery } from "../js/wal/recovery.js"
import { createHost } from "./host.js"

test("WAL records preserve exact transaction data", () => {
  const source = new WalRecord({ lsn: 42n, transactionId: 7n, type: WalType.UPDATE, pageId: 9, payload: new Uint8Array([4, 5, 6]) })
  const restored = WalRecord.decode(source.encode())
  assert.equal(restored.lsn, 42n)
  assert.equal(restored.transactionId, 7n)
  assert.equal(restored.pageId, 9)
  assert.deepEqual([...restored.payload], [4, 5, 6])
})

test("WAL scans durable records after reopen", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mydb-wal-"))
  const file = path.join(directory, "data.wal")
  const host = createHost()
  let wal = WriteAheadLog.open(host, file)
  wal.append(1n, WalType.BEGIN, 0xffffffff, new Uint8Array())
  wal.append(1n, WalType.INSERT, 4, new Uint8Array([8]))
  wal.sync()
  wal.close()
  wal = WriteAheadLog.open(host, file)
  assert.deepEqual([...wal.records()].map(record => record.type), [WalType.BEGIN, WalType.INSERT])
  wal.close()
  fs.rmSync(directory, { recursive: true })
})

test("recovery redoes committed work and undoes incomplete work", () => {
  const records = [
    new WalRecord({ lsn: 1n, transactionId: 1n, type: WalType.BEGIN }),
    new WalRecord({ lsn: 2n, transactionId: 1n, type: WalType.INSERT }),
    new WalRecord({ lsn: 3n, transactionId: 1n, type: WalType.COMMIT }),
    new WalRecord({ lsn: 4n, transactionId: 2n, type: WalType.BEGIN }),
    new WalRecord({ lsn: 5n, transactionId: 2n, type: WalType.DELETE }),
  ]
  const actions = []
  const result = new Recovery({ records: function* () {
    yield* records
  } }, { redo: record => actions.push(`redo:${record.lsn}`), undo: record => actions.push(`undo:${record.lsn}`) }).run()
  assert.deepEqual(actions, ["redo:2", "undo:5"])
  assert.deepEqual(result, { redone: 1, undone: 1 })
})

test("WAL checksum catches torn records", () => {
  const record = new WalRecord({ lsn: 1n, transactionId: 1n, type: WalType.INSERT, payload: new Uint8Array([1, 2, 3]) })
  const bytes = record.encode()
  bytes[bytes.length - 1] ^= 255
  assert.throws(() => WalRecord.decode(bytes), /checksum/)
})

test("WAL ignores an incomplete final record", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mydb-wal-tail-"))
  const file = path.join(directory, "data.wal")
  const host = createHost()
  let wal = WriteAheadLog.open(host, file)
  wal.append(1n, WalType.BEGIN, 0xffffffff, new Uint8Array())
  wal.sync()
  const offset = wal.offset
  wal.close()
  const fd = host.fs.open(file, host.fs.O_RDWR)
  host.fs.pwrite(fd, new Uint8Array([1, 2, 3]), 0, 3, offset)
  host.fs.close(fd)
  wal = WriteAheadLog.open(host, file)
  assert.deepEqual([...wal.records()].map(record => record.type), [WalType.BEGIN])
  wal.append(2n, WalType.BEGIN, 0xffffffff, new Uint8Array())
  wal.sync()
  wal.close()
  wal = WriteAheadLog.open(host, file)
  assert.deepEqual([...wal.records()].map(record => record.transactionId), [1n, 2n])
  wal.close()
  fs.rmSync(directory, { recursive: true })
})

test("WAL rejects a complete record with a bad checksum", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mydb-wal-corrupt-"))
  const file = path.join(directory, "data.wal")
  const host = createHost()
  const wal = WriteAheadLog.open(host, file)
  wal.append(1n, WalType.BEGIN, 0xffffffff, new Uint8Array([1]))
  wal.sync()
  const offset = wal.offset
  wal.close()
  const fd = host.fs.open(file, host.fs.O_RDWR)
  const byte = new Uint8Array(1)
  host.fs.pread(fd, byte, 0, 1, offset - 1)
  byte[0] ^= 255
  host.fs.pwrite(fd, byte, 0, 1, offset - 1)
  host.fs.close(fd)
  assert.throws(() => WriteAheadLog.open(host, file), /checksum/)
  fs.rmSync(directory, { recursive: true })
})
