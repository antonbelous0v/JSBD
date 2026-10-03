import { WalType } from "../constants.js"

export class Recovery {
  constructor(wal, apply) {
    this.wal = wal
    this.apply = apply
  }

  run(checkpointLSN = 0n) {
    const records = []
    const committed = new Set()
    const aborted = new Set()
    const incomplete = new Set()
    for (const record of this.wal.records()) {
      if (record.lsn <= checkpointLSN) {
        continue
      }
      records[records.length] = record
      if (record.type === WalType.COMMIT) {
        committed.add(record.transactionId)
      } else if (record.type === WalType.ABORT) {
        aborted.add(record.transactionId)
      } else if (record.type === WalType.BEGIN) {
        incomplete.add(record.transactionId)
      }
    }
    for (const record of records) {
      if (committed.has(record.transactionId) && record.type !== WalType.BEGIN && record.type !== WalType.COMMIT) {
        this.apply.redo(record)
      }
    }
    for (const transactionId of committed) {
      incomplete.delete(transactionId)
    }
    for (const transactionId of aborted) {
      incomplete.delete(transactionId)
    }
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const record = records[index]
      if (incomplete.has(record.transactionId) && record.type !== WalType.BEGIN) {
        this.apply.undo(record)
      }
    }
    return { redone: committed.size, undone: incomplete.size }
  }
}
