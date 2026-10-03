import fs from "node:fs"

import { Page } from "../js/storage/page.js"
import { PAGE_SIZE } from "../js/constants.js"
import { CorruptionError } from "../js/errors.js"

const source = fs.readFileSync(process.argv[2])
const bytes = new Uint8Array(PAGE_SIZE)
bytes.set(source.subarray(0, PAGE_SIZE))

try {
  Page.decode(bytes, 0)
} catch (error) {
  if (!(error instanceof CorruptionError) && !(error instanceof RangeError)) {
    throw error
  }
}
