import { BinaryReader } from "../binary/reader.js"
import { BinaryWriter } from "../binary/writer.js"
import { Column, TableSchema } from "./schema.js"

const encoder = new TextEncoder()

function stringSize(value) { return 4 + encoder.encode(value).length }

export function encodeCatalog(tables) {
  let size = 4
  for (const table of tables) {
    size += 8 + stringSize(table.schema.name) + 4 + table.pageIds.length * 4 + 4
    for (const column of table.schema.columns) size += stringSize(column.name) + stringSize(column.type) + 1 + stringSize(column.references?.table ?? "") + stringSize(column.references?.column ?? "")
    size += 4 + table.schema.primaryKey.reduce((sum, value) => sum + stringSize(value), 0)
    size += 4 + table.indexes.reduce((sum, index) => sum + stringSize(index.name) + 1 + 4 + index.columns.reduce((total, value) => total + stringSize(value), 0), 0)
  }
  const bytes = new Uint8Array(size)
  const writer = new BinaryWriter(bytes)
  writer.writeU32(tables.length)
  for (const table of tables) {
    writer.writeU64(table.id).writeString(table.schema.name).writeU32(table.pageIds.length)
    for (const pageId of table.pageIds) writer.writeU32(pageId)
    writer.writeU32(table.schema.columns.length)
    for (const column of table.schema.columns) writer.writeString(column.name).writeString(column.type).writeU8(column.nullable ? 1 : 0).writeString(column.references?.table ?? "").writeString(column.references?.column ?? "")
    writer.writeU32(table.schema.primaryKey.length)
    for (const column of table.schema.primaryKey) writer.writeString(column)
    writer.writeU32(table.indexes.length)
    for (const index of table.indexes) {
      writer.writeString(index.name).writeU8(index.unique ? 1 : 0).writeU32(index.columns.length)
      for (const column of index.columns) writer.writeString(column)
    }
  }
  return bytes
}

export function decodeCatalog(bytes) {
  const reader = new BinaryReader(bytes)
  return Array.from({ length: reader.readU32() }, () => {
    const id = reader.readU64()
    const name = reader.readString()
    const pageIds = Array.from({ length: reader.readU32() }, () => reader.readU32())
    const columns = Array.from({ length: reader.readU32() }, () => {
      const columnName = reader.readString()
      const type = reader.readString()
      const nullable = reader.readU8() !== 0
      const table = reader.readString()
      const column = reader.readString()
      return new Column({ name: columnName, type, nullable, references: table ? { table, column } : null })
    })
    const primaryKey = Array.from({ length: reader.readU32() }, () => reader.readString())
    const indexes = Array.from({ length: reader.readU32() }, () => {
      const indexName = reader.readString()
      const unique = reader.readU8() !== 0
      const indexColumns = Array.from({ length: reader.readU32() }, () => reader.readString())
      return { name: indexName, unique, columns: indexColumns }
    })
    return { id, schema: new TableSchema({ name, columns, primaryKey }), pageIds, indexes }
  })
}
