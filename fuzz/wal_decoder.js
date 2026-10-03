import fs from "node:fs"

import { WalRecord } from "../js/wal/record.js"
import { CorruptionError } from "../js/errors.js"

const bytes = new Uint8Array(fs.readFileSync(process.argv[2]))

try {
  WalRecord.decode(bytes)
} catch (error) {
  if (!(error instanceof CorruptionError) && !(error instanceof RangeError)) {
    throw error
  }
}
