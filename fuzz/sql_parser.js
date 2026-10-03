import { Parser } from "../js/sql/parser.js"

const input = process.argv[2] ?? ""

try {
  new Parser(input).parse()
} catch (error) {
  if (error.code !== "SQL_ERROR" && !(error instanceof RangeError)) {
    throw error
  }
}
