import { BTree } from "../index/btree.js"
import { Heap } from "../storage/heap.js"
import { TupleCodec } from "../storage/tuple_codec.js"
import { isVisible } from "../transaction/snapshot.js"
import { ConstraintError } from "../errors.js"
import { TransactionState, WalType } from "../constants.js"

function ridKey(rid) {
  return `${rid.pageId}:${rid.slotId}`
}

export class Table {
  constructor(metadata, bufferPool, transactionManager, catalog) {
    this.metadata = metadata
    this.schema = metadata.schema
    this.heap = new Heap(bufferPool, metadata.pageIds)
    this.transactions = transactionManager
    this.catalog = catalog
    this.indexes = new Map()
    this.rowPages = []
    this.buildIndexes()
  }

  buildIndexes() {
    const definitions = [...this.metadata.indexes]
    const primaryName = `${this.schema.name}_pkey`
    let hasPrimary = false
    for (let index = 0; index < definitions.length; index += 1) {
      if (definitions[index].name === primaryName) {
        hasPrimary = true
        break
      }
    }
    if (this.schema.primaryKey.length && !hasPrimary) {
      let index = definitions.length
      while (index > 0) {
        definitions[index] = definitions[index - 1]
        index -= 1
      }
      definitions[0] = { name: primaryName, columns: this.schema.primaryKey, unique: true }
    }
    for (const definition of definitions) {
      this.indexes.set(definition.name, { definition, tree: new BTree(32, definition.unique) })
    }
    this.heap.forEach((pageId, slotId, bytes) => {
      const version = TupleCodec.decode(this.schema, bytes)
      const rid = { pageId, slotId }
      this.setVersion(rid, version)
      if (this.transactions.states.get(version.xmin) === TransactionState.COMMITTED && (version.xmax === 0n || this.transactions.states.get(version.xmax) !== TransactionState.COMMITTED)) {
        this.addToIndexes(version.row, rid)
      }
    })
  }

  insert(input, transaction) {
    this.transactions.requireActive(transaction)
    const row = this.schema.normalize(input)
    this.checkForeignKeys(row, transaction)
    const bytes = TupleCodec.encode(this.schema, row, transaction.id)
    this.checkUnique(row)
    const rid = this.heap.insert(bytes)
    this.setVersion(rid, { xmin: transaction.id, xmax: 0n, row })
    this.addToIndexes(row, rid)
    const lsn = this.transactions.wal.append(transaction.id, WalType.INSERT, rid.pageId, bytes)
    this.setPageLSN(rid.pageId, lsn)
    transaction.addUndo(() => {
      this.removeFromIndexes(row, rid)
      this.rowPages[rid.pageId][rid.slotId] = undefined
      this.heap.remove(rid)
    })
    return rid
  }

  deleteWhere(predicate, transaction) {
    let count = 0
    for (const item of this.scan(transaction)) {
      if (!predicate(item.row)) {
        continue
      }
      this.deleteOne(item, transaction)
      count += 1
    }
    return count
  }

  updateWhere(predicate, changes, transaction) {
    let count = 0
    for (const item of this.scan(transaction)) {
      if (!predicate(item.row)) {
        continue
      }
      const input = Object.fromEntries(this.schema.columns.map((column, index) => [column.name, item.row[index]]))
      for (const [name, value] of Object.entries(changes)) {
        input[name] = typeof value === "function" ? value(input[name], input) : value
      }
      this.deleteOne(item, transaction)
      this.insert(input, transaction)
      count += 1
    }
    return count
  }

  deleteOne(item, transaction) {
    this.catalog.assertDeleteAllowed(this.schema.name, item.row, transaction)
    this.transactions.locks.acquire(transaction.id, `${this.schema.name}:${ridKey(item.rid)}`)
    const oldBytes = this.heap.get(item.rid)
    const version = this.getVersion(item.rid)
    const oldXmax = version.xmax
    const newBytes = TupleCodec.encode(this.schema, version.row, version.xmin, transaction.id)
    this.heap.update(item.rid, newBytes)
    version.xmax = transaction.id
    this.removeFromIndexes(version.row, item.rid)
    const lsn = this.transactions.wal.append(transaction.id, WalType.DELETE, item.rid.pageId, newBytes)
    this.setPageLSN(item.rid.pageId, lsn)
    transaction.addUndo(() => {
      version.xmax = oldXmax
      this.heap.update(item.rid, oldBytes)
      this.addToIndexes(version.row, item.rid)
    })
  }

  scan(transaction) {
    const rows = []
    this.forEach(transaction, (item) => {
      rows[rows.length] = item
    })
    return rows
  }

  forEach(transaction, action) {
    for (let pageId = 0; pageId < this.rowPages.length; pageId += 1) {
      const page = this.rowPages[pageId]
      if (!page) {
        continue
      }
      for (let slotId = 0; slotId < page.length; slotId += 1) {
        const version = page[slotId]
        if (version && isVisible(version, transaction.snapshot, transaction.id, this.transactions.states) && action({ rid: { pageId, slotId }, row: version.row }) === false) {
          return false
        }
      }
    }
    return true
  }

  lookup(indexName, key, transaction) {
    const index = this.indexes.get(indexName)
    if (!index) {
      throw new ConstraintError(`Index ${indexName} does not exist`)
    }
    const found = index.tree.find(key)
    if (found === undefined) {
      return []
    }
    const rows = []
    if (index.definition.unique) {
      const version = this.getVersion(found)
      if (isVisible(version, transaction.snapshot, transaction.id, this.transactions.states)) {
        rows[0] = { rid: found, row: version.row }
      }
      return rows
    }
    for (const entry of index.tree.range(key, key)) {
      const version = this.getVersion(entry.value)
      if (isVisible(version, transaction.snapshot, transaction.id, this.transactions.states)) {
        rows[rows.length] = { rid: entry.value, row: version.row }
      }
    }
    return rows
  }

  checkUnique(row) {
    for (const { definition, tree } of this.indexes.values()) {
      if (definition.unique && tree.find(this.key(definition, row)) !== undefined) {
        throw new ConstraintError(`Unique constraint ${definition.name} failed`)
      }
    }
  }

  checkForeignKeys(row, transaction) {
    for (let index = 0; index < this.schema.columns.length; index += 1) {
      const column = this.schema.columns[index]
      if (!column.references || row[index] === null) {
        continue
      }
      const referenced = this.catalog.table(column.references.table)
      const definition = [...referenced.indexes.values()].find(candidate => candidate.definition.unique && candidate.definition.columns.length === 1 && candidate.definition.columns[0] === column.references.column)
      if (!definition || !referenced.lookup(definition.definition.name, row[index], transaction).length) {
        throw new ConstraintError(`Foreign key ${column.name} failed`)
      }
    }
  }

  key(definition, row) {
    const values = definition.columns.map(column => row[this.schema.indexOf(column)])
    return values.length === 1 ? values[0] : values
  }

  addToIndexes(row, rid) {
    for (const { definition, tree } of this.indexes.values()) {
      tree.insert(this.key(definition, row), rid)
    }
  }

  removeFromIndexes(row, rid) {
    for (const { definition, tree } of this.indexes.values()) {
      tree.remove(this.key(definition, row), rid)
    }
  }

  setVersion(rid, version) {
    let page = this.rowPages[rid.pageId]
    if (!page) {
      page = []
      this.rowPages[rid.pageId] = page
    }
    page[rid.slotId] = version
  }

  getVersion(rid) {
    return this.rowPages[rid.pageId][rid.slotId]
  }

  setPageLSN(pageId, lsn) {
    const page = this.heap.bufferPool.get(pageId)
    page.pageLSN = lsn
    this.heap.bufferPool.unpin(page, true)
  }
}
