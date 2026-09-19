import { evaluate } from "./expression.js"
import { SqlError } from "../errors.js"

export function aggregate(input, columns) {
  const rows = [...input]
  return [columns.map(column => compute(column.expression, rows))]
}

function compute(expression, rows) {
  if (expression.type !== "call") throw new SqlError("Columns outside aggregate functions require GROUP BY")
  const name = expression.name
  const values = expression.args[0].type === "star" ? rows.map(() => 1) : rows.map(row => evaluate(expression.args[0], row)).filter(value => value !== null)
  if (name === "COUNT") return BigInt(values.length)
  if (!values.length) return null
  if (name === "MIN") return values.reduce((left, right) => left < right ? left : right)
  if (name === "MAX") return values.reduce((left, right) => left > right ? left : right)
  if (name === "SUM") return values.reduce((left, right) => left + right)
  if (name === "AVG") {
    const sum = values.reduce((left, right) => left + right)
    return typeof sum === "bigint" ? Number(sum) / values.length : sum / values.length
  }
  throw new SqlError(`Unknown aggregate ${name}`)
}
