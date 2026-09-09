import { WalType } from "../constants.js"

export class Recovery {
  constructor(wal, apply) {
    this.wal = wal
    this.apply = apply
  }

  run(checkpointLSN = 0n) {
    const records = [...this.wal.records()].filter(record => record.lsn > checkpointLSN)
    const committed = new Set(records.filter(record => record.type === WalType.COMMIT).map(record => record.transactionId))
    const aborted = new Set(records.filter(record => record.type === WalType.ABORT).map(record => record.transactionId))
    for (const record of records) {
      if (committed.has(record.transactionId) && record.type !== WalType.BEGIN && record.type !== WalType.COMMIT) this.apply.redo(record)
    }
    const incomplete = new Set(records.filter(record => record.type === WalType.BEGIN).map(record => record.transactionId))
    for (const transactionId of committed) incomplete.delete(transactionId)
    for (const transactionId of aborted) incomplete.delete(transactionId)
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const record = records[index]
      if (incomplete.has(record.transactionId) && record.type !== WalType.BEGIN) this.apply.undo(record)
    }
    return { redone: committed.size, undone: incomplete.size }
  }
}
