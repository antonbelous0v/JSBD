import { BufferPool } from "./storage/buffer_pool.js"
import { Pager } from "./storage/pager.js"
import { WriteAheadLog } from "./wal/wal.js"
import { LockTable } from "./transaction/lock_table.js"
import { TransactionManager } from "./transaction/transaction.js"
import { Catalog } from "./catalog/catalog.js"
import { Column, TableSchema } from "./catalog/schema.js"
import { Table } from "./catalog/table.js"
import { Parser } from "./sql/parser.js"
import { Binder } from "./sql/binder.js"
import { LogicalPlanner } from "./planner/logical.js"
import { PhysicalPlanner } from "./planner/physical.js"
import { Executor } from "./executor/executor.js"
import { evaluate } from "./executor/expression.js"
import { explain } from "./planner/explain.js"
import { DataType, TransactionState, WalType } from "./constants.js"

export class Database {
  constructor(host, path, pager, wal, bufferPool, transactions, catalog) {
    this.host = host
    this.path = path
    this.pager = pager
    this.wal = wal
    this.bufferPool = bufferPool
    this.transactions = transactions
    this.catalog = catalog
    this.tables = new Map()
    this.currentTransaction = null
    this.queriesExecuted = 0
  }

  static open(path, host = Host) {
    const pager = Pager.open(host, path)
    const wal = WriteAheadLog.open(host, `${path}.wal`)
    const bufferPool = new BufferPool(pager, 128, lsn => wal.sync(lsn))
    const transactions = new TransactionManager(wal, new LockTable())
    transactions.restore(wal.records())
    const catalog = Catalog.load(bufferPool, pager.header.catalogRoot)
    return new Database(host, path, pager, wal, bufferPool, transactions, catalog)
  }

  table(name) {
    let table = this.tables.get(name)
    if (!table) {
      table = new Table(this.catalog.getTable(name), this.bufferPool, this.transactions, this)
      this.tables.set(name, table)
    }
    return table
  }

  execute(sql) {
    const results = []
    for (const statement of new Parser(sql).parse()) results.push(this.executeStatement(statement))
    return results.length === 1 ? results[0] : results
  }

  executeStatement(statement) {
    this.queriesExecuted += 1
    const bound = new Binder(this.catalog).bind(statement)
    if (bound.type === "begin") return this.begin()
    if (bound.type === "commit") return this.commit()
    if (bound.type === "rollback") return this.rollback()
    const owned = !this.currentTransaction
    const transaction = this.currentTransaction ?? this.transactions.begin()
    try {
      const result = this.run(bound, transaction)
      if (owned) this.transactions.commit(transaction)
      return result
    } catch (error) {
      if (owned && transaction.state === TransactionState.ACTIVE) this.transactions.rollback(transaction)
      throw error
    }
  }

  run(statement, transaction) {
    if (statement.type === "create_table") return this.createTable(statement, transaction)
    if (statement.type === "drop_table") return this.dropTable(statement, transaction)
    if (statement.type === "create_index") return this.createIndex(statement, transaction)
    if (statement.type === "drop_index") return this.dropIndex(statement, transaction)
    if (statement.type === "insert") return this.insert(statement, transaction)
    if (statement.type === "update") return this.update(statement, transaction)
    if (statement.type === "delete") return this.delete(statement, transaction)
    if (statement.type === "select") return this.select(statement, transaction)
    if (statement.type === "explain") return this.explain(statement.statement)
    throw new Error(`Unsupported statement ${statement.type}`)
  }

  begin() {
    if (this.currentTransaction) throw new Error("Transaction already active")
    this.currentTransaction = this.transactions.begin()
    return { status: "BEGIN" }
  }

  commit() {
    if (!this.currentTransaction) throw new Error("No active transaction")
    this.catalog.persist()
    this.transactions.commit(this.currentTransaction)
    this.currentTransaction = null
    return { status: "COMMIT" }
  }

  rollback() {
    if (!this.currentTransaction) throw new Error("No active transaction")
    this.transactions.rollback(this.currentTransaction)
    this.currentTransaction = null
    this.tables.clear()
    return { status: "ROLLBACK" }
  }

  createTable(statement, transaction) {
    const schema = new TableSchema({ name: statement.name, columns: statement.columns.map(column => new Column({ name: column.name, type: column.dataType, nullable: column.nullable, references: column.references })), primaryKey: statement.primaryKey, unique: statement.unique })
    const table = this.catalog.createTable(schema)
    for (const columns of schema.unique) table.indexes.push({ name: `${schema.name}_${columns.join("_")}_key`, columns, unique: true })
    transaction.addUndo(() => { this.catalog.dropTable(schema.name); this.tables.delete(schema.name) })
    this.catalog.persist()
    return { status: "CREATE TABLE", table: table.schema.name }
  }

  dropTable(statement, transaction) {
    const metadata = this.catalog.getTable(statement.name)
    this.catalog.dropTable(statement.name)
    this.tables.delete(statement.name)
    transaction.addUndo(() => this.catalog.tables.set(statement.name, metadata))
    this.catalog.persist()
    return { status: "DROP TABLE" }
  }

  createIndex(statement, transaction) {
    this.catalog.addIndex(statement.table, statement)
    this.tables.delete(statement.table)
    transaction.addUndo(() => { this.catalog.dropIndex(statement.name); this.tables.delete(statement.table) })
    this.catalog.persist()
    return { status: "CREATE INDEX" }
  }

  dropIndex(statement, transaction) {
    const owner = [...this.catalog.tables.values()].find(table => table.indexes.some(index => index.name === statement.name))
    const definition = owner?.indexes.find(index => index.name === statement.name)
    this.catalog.dropIndex(statement.name)
    this.tables.delete(owner.schema.name)
    transaction.addUndo(() => owner.indexes.push(definition))
    this.catalog.persist()
    return { status: "DROP INDEX" }
  }

  insert(statement, transaction) {
    const table = this.table(statement.table)
    const columns = statement.columns ?? table.schema.columns.map(column => column.name)
    for (const values of statement.values) {
      const input = Object.fromEntries(columns.map((column, index) => {
        const definition = table.schema.columns[table.schema.indexOf(column)]
        const value = evaluate(values[index], {})
        return [column, value === null ? null : definition.type === DataType.INT32 || definition.type === DataType.FLOAT64 ? Number(value) : definition.type === DataType.INT64 || definition.type === DataType.TIMESTAMP ? BigInt(value) : value]
      }))
      table.insert(input, transaction)
    }
    this.catalog.persist()
    return { status: "INSERT", rows: statement.values.length }
  }

  update(statement, transaction) {
    const table = this.table(statement.table)
    const predicate = row => !statement.where || evaluate(statement.where, { [statement.table]: row }) === true
    const changes = Object.fromEntries(statement.assignments.map(assignment => [assignment.column, (_, input) => {
      const column = table.schema.columns[table.schema.indexOf(assignment.column)]
      const value = evaluate(assignment.value, { [statement.table]: table.schema.columns.map(definition => input[definition.name]) })
      return value === null ? null : column.type === DataType.INT32 || column.type === DataType.FLOAT64 ? Number(value) : column.type === DataType.INT64 || column.type === DataType.TIMESTAMP ? BigInt(value) : value
    }]))
    return { status: "UPDATE", rows: table.updateWhere(predicate, changes, transaction) }
  }

  delete(statement, transaction) {
    const table = this.table(statement.table)
    const predicate = row => !statement.where || evaluate(statement.where, { [statement.table]: row }) === true
    return { status: "DELETE", rows: table.deleteWhere(predicate, transaction) }
  }

  select(statement, transaction) {
    const physical = this.plan(statement)
    return [...new Executor(name => this.table(name), transaction).execute(physical)]
  }

  explain(statement) { return explain(this.plan(statement)) }

  plan(statement) {
    const bound = statement.references ? statement : new Binder(this.catalog).bind(statement)
    return new PhysicalPlanner().plan(new LogicalPlanner().plan(bound))
  }

  checkpoint() {
    this.bufferPool.flushAll()
    const lsn = this.wal.append(0n, WalType.CHECKPOINT, 0xffffffff, new Uint8Array())
    this.wal.sync(lsn)
    this.pager.header.checkpointLSN = lsn
    this.pager.persistHeader()
  }

  stats() {
    return { bufferPoolHits: this.bufferPool.hits, bufferPoolMisses: this.bufferPool.misses, walBytesWritten: this.wal.bytesWritten, walFsyncs: this.wal.fsyncs, transactionsCommitted: this.transactions.committed, transactionsAborted: this.transactions.aborted, queriesExecuted: this.queriesExecuted, btreeSplits: [...this.tables.values()].reduce((total, table) => total + [...table.indexes.values()].reduce((sum, index) => sum + index.tree.splits, 0), 0) }
  }

  close() {
    if (this.currentTransaction) this.rollback()
    this.checkpoint()
    this.wal.close()
    this.pager.close()
  }
}
