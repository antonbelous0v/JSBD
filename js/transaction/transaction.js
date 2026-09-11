import { TransactionState, WalType } from "../constants.js"

export class Transaction {
  constructor(id, snapshot, startLSN) {
    this.id = id
    this.snapshot = snapshot
    this.startLSN = startLSN
    this.state = TransactionState.ACTIVE
    this.undo = []
  }

  addUndo(action) { this.undo.push(action) }
}

export class TransactionManager {
  constructor(wal, locks) {
    this.wal = wal
    this.locks = locks
    this.nextId = 1n
    this.transactions = new Map()
    this.states = new Map()
    this.committed = 0
    this.aborted = 0
  }

  begin() {
    const id = this.nextId++
    const active = [...this.transactions.values()].filter(transaction => transaction.state === TransactionState.ACTIVE).map(transaction => transaction.id)
    const snapshot = { xmin: active.length ? active.reduce((left, right) => left < right ? left : right) : id, xmax: this.nextId, active: new Set(active) }
    const startLSN = this.wal.append(id, WalType.BEGIN, 0xffffffff, new Uint8Array())
    const transaction = new Transaction(id, snapshot, startLSN)
    this.transactions.set(id, transaction)
    this.states.set(id, TransactionState.ACTIVE)
    return transaction
  }

  commit(transaction) {
    this.requireActive(transaction)
    const lsn = this.wal.append(transaction.id, WalType.COMMIT, 0xffffffff, new Uint8Array())
    this.wal.sync(lsn)
    transaction.state = TransactionState.COMMITTED
    this.states.set(transaction.id, transaction.state)
    this.locks.release(transaction.id)
    transaction.undo.length = 0
    this.committed += 1
  }

  rollback(transaction) {
    this.requireActive(transaction)
    for (let index = transaction.undo.length - 1; index >= 0; index -= 1) transaction.undo[index]()
    const lsn = this.wal.append(transaction.id, WalType.ABORT, 0xffffffff, new Uint8Array())
    this.wal.sync(lsn)
    transaction.state = TransactionState.ABORTED
    this.states.set(transaction.id, transaction.state)
    this.locks.release(transaction.id)
    this.aborted += 1
  }

  requireActive(transaction) {
    if (!transaction || transaction.state !== TransactionState.ACTIVE) throw new Error("Transaction is not active")
  }
}
