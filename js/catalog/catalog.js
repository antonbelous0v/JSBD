import { PAGE_HEADER_SIZE, PageType } from "../constants.js"
import { ConstraintError, CorruptionError } from "../errors.js"
import { decodeCatalog, encodeCatalog } from "./codec.js"

export class Catalog {
  constructor(bufferPool, tables = []) {
    this.bufferPool = bufferPool
    this.tables = new Map(tables.map(table => [table.schema.name, table]))
    this.nextId = tables.reduce((maximum, table) => table.id > maximum ? table.id : maximum, 0n) + 1n
  }

  static load(bufferPool, rootPageId) {
    if (!rootPageId) return new Catalog(bufferPool)
    const page = bufferPool.get(rootPageId)
    try {
      const length = page.view.getUint32(PAGE_HEADER_SIZE, true)
      if (length > page.freeEnd - PAGE_HEADER_SIZE - 4) throw new CorruptionError("Catalog exceeds page boundary")
      return new Catalog(bufferPool, decodeCatalog(page.bytes.subarray(PAGE_HEADER_SIZE + 4, PAGE_HEADER_SIZE + 4 + length)))
    } finally { bufferPool.unpin(page) }
  }

  createTable(schema) {
    if (this.tables.has(schema.name)) throw new ConstraintError(`Table ${schema.name} already exists`)
    const table = { id: this.nextId++, schema, pageIds: [], indexes: [] }
    this.tables.set(schema.name, table)
    return table
  }

  dropTable(name) {
    if (!this.tables.delete(name)) throw new ConstraintError(`Table ${name} does not exist`)
  }

  getTable(name) {
    const table = this.tables.get(name)
    if (!table) throw new ConstraintError(`Table ${name} does not exist`)
    return table
  }

  addIndex(tableName, definition) {
    const table = this.getTable(tableName)
    if ([...this.tables.values()].some(candidate => candidate.indexes.some(index => index.name === definition.name))) throw new ConstraintError(`Index ${definition.name} already exists`)
    for (const column of definition.columns) table.schema.indexOf(column)
    table.indexes.push({ name: definition.name, columns: [...definition.columns], unique: Boolean(definition.unique) })
  }

  dropIndex(name) {
    for (const table of this.tables.values()) {
      const index = table.indexes.findIndex(candidate => candidate.name === name)
      if (index >= 0) { table.indexes.splice(index, 1); return }
    }
    throw new ConstraintError(`Index ${name} does not exist`)
  }

  persist() {
    const bytes = encodeCatalog([...this.tables.values()])
    let page
    if (this.bufferPool.pager.header.catalogRoot) page = this.bufferPool.get(this.bufferPool.pager.header.catalogRoot)
    else {
      page = this.bufferPool.allocate(PageType.CATALOG)
      this.bufferPool.pager.header.catalogRoot = page.id
      this.bufferPool.pager.persistHeader()
    }
    if (bytes.length + 4 > page.freeEnd - PAGE_HEADER_SIZE) throw new Error("Catalog page is full")
    page.view.setUint32(PAGE_HEADER_SIZE, bytes.length, true)
    page.bytes.set(bytes, PAGE_HEADER_SIZE + 4)
    this.bufferPool.unpin(page, true)
  }
}
