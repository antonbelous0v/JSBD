import { PAGE_HEADER_SIZE, PAGE_SIZE, PageType } from "../constants.js"
import { ConstraintError, CorruptionError } from "../errors.js"
import { decodeCatalog, encodeCatalog } from "./codec.js"

export class Catalog {
  constructor(bufferPool, tables = [], pageIds = []) {
    this.bufferPool = bufferPool
    this.tables = new Map(tables.map(table => [table.schema.name, table]))
    this.nextId = tables.reduce((maximum, table) => table.id > maximum ? table.id : maximum, 0n) + 1n
    this.dirty = false
    this.pageIds = pageIds
  }

  static load(bufferPool, rootPageId) {
    if (!rootPageId) {
      return new Catalog(bufferPool)
    }
    const page = bufferPool.get(rootPageId)
    if (page.view.getUint16(14, true) & 1) {
      return Catalog.loadChain(bufferPool, page)
    }
    try {
      const length = page.view.getUint32(PAGE_HEADER_SIZE, true)
      if (length > page.freeEnd - PAGE_HEADER_SIZE - 4) {
        throw new CorruptionError("Catalog exceeds page boundary")
      }
      return new Catalog(bufferPool, decodeCatalog(page.bytes.subarray(PAGE_HEADER_SIZE + 4, PAGE_HEADER_SIZE + 4 + length)), [rootPageId])
    } finally {
      bufferPool.unpin(page)
    }
  }

  static loadChain(bufferPool, firstPage) {
    const chunks = []
    const pageIds = []
    const visited = new Set()
    let page = firstPage
    while (page) {
      if (visited.has(page.id)) {
        throw new CorruptionError("Catalog page cycle")
      }
      visited.add(page.id)
      pageIds[pageIds.length] = page.id
      const length = page.view.getUint32(PAGE_HEADER_SIZE + 4, true)
      if (length > PAGE_SIZE - PAGE_HEADER_SIZE - 8) {
        throw new CorruptionError("Catalog chunk exceeds page boundary")
      }
      chunks[chunks.length] = new Uint8Array(page.bytes.subarray(PAGE_HEADER_SIZE + 8, PAGE_HEADER_SIZE + 8 + length))
      const next = page.view.getUint32(PAGE_HEADER_SIZE, true)
      bufferPool.unpin(page)
      page = next === 0xffffffff ? null : bufferPool.get(next)
    }
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.length
    }
    return new Catalog(bufferPool, decodeCatalog(bytes), pageIds)
  }

  createTable(schema) {
    if (this.tables.has(schema.name)) {
      throw new ConstraintError(`Table ${schema.name} already exists`)
    }
    const table = { id: this.nextId++, schema, pageIds: [], indexes: [] }
    this.tables.set(schema.name, table)
    this.dirty = true
    return table
  }

  dropTable(name) {
    if (!this.tables.delete(name)) {
      throw new ConstraintError(`Table ${name} does not exist`)
    }
    this.dirty = true
  }

  getTable(name) {
    const table = this.tables.get(name)
    if (!table) {
      throw new ConstraintError(`Table ${name} does not exist`)
    }
    return table
  }

  addIndex(tableName, definition) {
    const table = this.getTable(tableName)
    for (const candidate of this.tables.values()) {
      for (let index = 0; index < candidate.indexes.length; index += 1) {
        if (candidate.indexes[index].name === definition.name) {
          throw new ConstraintError(`Index ${definition.name} already exists`)
        }
      }
    }
    for (const column of definition.columns) {
      table.schema.indexOf(column)
    }
    table.indexes[table.indexes.length] = { name: definition.name, columns: [...definition.columns], unique: Boolean(definition.unique) }
    this.dirty = true
  }

  dropIndex(name) {
    for (const table of this.tables.values()) {
      const index = table.indexes.findIndex(candidate => candidate.name === name)
      if (index >= 0) {
        table.indexes.splice(index, 1)
        this.dirty = true
        return
      }
    }
    throw new ConstraintError(`Index ${name} does not exist`)
  }

  persist() {
    if (!this.dirty && this.bufferPool.pager.header.catalogRoot) {
      return false
    }
    const bytes = encodeCatalog([...this.tables.values()])
    const capacity = PAGE_SIZE - PAGE_HEADER_SIZE - 8
    const required = Math.max(1, Math.ceil(bytes.length / capacity))
    while (this.pageIds.length < required) {
      const page = this.bufferPool.allocate(PageType.CATALOG)
      this.pageIds[this.pageIds.length] = page.id
      this.bufferPool.unpin(page)
    }
    for (let index = 0; index < required; index += 1) {
      const page = this.bufferPool.get(this.pageIds[index])
      const chunk = bytes.subarray(index * capacity, Math.min(bytes.length, (index + 1) * capacity))
      page.view.setUint16(14, 1, true)
      page.view.setUint32(PAGE_HEADER_SIZE, index + 1 < required ? this.pageIds[index + 1] : 0xffffffff, true)
      page.view.setUint32(PAGE_HEADER_SIZE + 4, chunk.length, true)
      page.bytes.fill(0, PAGE_HEADER_SIZE + 8)
      page.bytes.set(chunk, PAGE_HEADER_SIZE + 8)
      this.bufferPool.unpin(page, true)
    }
    const newRoot = !this.bufferPool.pager.header.catalogRoot
    if (newRoot) {
      this.bufferPool.pager.header.catalogRoot = this.pageIds[0]
    }
    this.dirty = false
    return newRoot
  }

  markDirty() {
    this.dirty = true
  }
}
