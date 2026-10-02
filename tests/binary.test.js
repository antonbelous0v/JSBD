import assert from "node:assert/strict"
import test from "node:test"

import { BinaryReader } from "../js/binary/reader.js"
import { BinaryWriter } from "../js/binary/writer.js"
import { crc32c } from "../js/binary/checksum.js"
import { CorruptionError, ValidationError } from "../js/errors.js"

test("binary values round trip", () => {
  const bytes = new Uint8Array(128)
  new BinaryWriter(bytes).writeU8(255).writeU16(65535).writeU32(4294967295).writeU64(9007199254740993n).writeI32(-42).writeI64(-99n).writeF64(Math.PI).writeString("Привіт")
  const reader = new BinaryReader(bytes)
  assert.equal(reader.readU8(), 255)
  assert.equal(reader.readU16(), 65535)
  assert.equal(reader.readU32(), 4294967295)
  assert.equal(reader.readU64(), 9007199254740993n)
  assert.equal(reader.readI32(), -42)
  assert.equal(reader.readI64(), -99n)
  assert.equal(reader.readF64(), Math.PI)
  assert.equal(reader.readString(), "Привіт")
  assert.equal(crc32c(new TextEncoder().encode("123456789")), 0xe3069283)
})

test("binary codecs fail before crossing buffer bounds", () => {
  assert.throws(() => new BinaryWriter(new Uint8Array(1)).writeU16(1), ValidationError)
  assert.throws(() => new BinaryReader(new Uint8Array(1)).readU16(), CorruptionError)
})
