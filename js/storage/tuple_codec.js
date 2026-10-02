import { BinaryReader } from "../binary/reader.js"
import { BinaryWriter } from "../binary/writer.js"
import { DataType } from "../constants.js"
import { ValidationError } from "../errors.js"
import { encodeUtf8 } from "../binary/utf8.js"

function valueSize(type, value) {
  if (value === null) return 0
  if (type === DataType.BOOLEAN) return 1
  if (type === DataType.INT32) return 4
  if (type === DataType.INT64 || type === DataType.FLOAT64 || type === DataType.TIMESTAMP) return 8
  if (type === DataType.TEXT) return 4 + encodeUtf8(value).length
  throw new ValidationError(`Unsupported type ${type}`)
}

export class TupleCodec {
  static encode(schema, row, xmin, xmax = 0n) {
    const nullBytes = Math.ceil(schema.columns.length / 8)
    const valuesSize = schema.columns.reduce((total, column, index) => total + valueSize(column.type, row[index]), 0)
    const bytes = new Uint8Array(20 + nullBytes + valuesSize)
    const writer = new BinaryWriter(bytes)
    writer.writeU64(xmin).writeU64(xmax).writeU16(0).writeU16(nullBytes)
    const bitmapOffset = writer.offset
    writer.offset += nullBytes
    schema.columns.forEach((column, index) => {
      const value = row[index]
      if (value === null) { bytes[bitmapOffset + (index >> 3)] |= 1 << (index & 7); return }
      if (column.type === DataType.BOOLEAN) writer.writeU8(value ? 1 : 0)
      else if (column.type === DataType.INT32) writer.writeI32(value)
      else if (column.type === DataType.INT64 || column.type === DataType.TIMESTAMP) writer.writeI64(value)
      else if (column.type === DataType.FLOAT64) writer.writeF64(value)
      else if (column.type === DataType.TEXT) writer.writeString(value)
    })
    return bytes
  }

  static decode(schema, bytes) {
    const reader = new BinaryReader(bytes)
    const xmin = reader.readU64()
    const xmax = reader.readU64()
    reader.readU16()
    const nullBytes = reader.readU16()
    const bitmap = reader.readBytes(nullBytes)
    const row = schema.columns.map((column, index) => {
      if (bitmap[index >> 3] & (1 << (index & 7))) return null
      if (column.type === DataType.BOOLEAN) return reader.readU8() !== 0
      if (column.type === DataType.INT32) return reader.readI32()
      if (column.type === DataType.INT64 || column.type === DataType.TIMESTAMP) return reader.readI64()
      if (column.type === DataType.FLOAT64) return reader.readF64()
      if (column.type === DataType.TEXT) return reader.readString()
      throw new ValidationError(`Unsupported type ${column.type}`)
    })
    return { xmin, xmax, row }
  }
}
