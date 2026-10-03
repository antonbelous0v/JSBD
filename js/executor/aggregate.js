import { evaluate } from "./expression.js"
import { SqlError } from "../errors.js"

export function aggregate(input, columns) {
  const row = new Array(columns.length)
  for (let index = 0; index < columns.length; index += 1) {
    row[index] = compute(columns[index].expression, input)
  }
  return [row]
}

function compute(expression, rows) {
  if (expression.type !== "call") {
    throw new SqlError("Columns outside aggregate functions require GROUP BY")
  }
  const name = expression.name
  const star = expression.args[0].type === "star"
  let count = 0
  let result = null
  for (let index = 0; index < rows.length; index += 1) {
    const value = star ? 1 : evaluate(expression.args[0], rows[index])
    if (value === null) {
      continue
    }
    count += 1
    if (name === "MIN") {
      result = result === null || value < result ? value : result
    } else if (name === "MAX") {
      result = result === null || value > result ? value : result
    } else if (name === "SUM" || name === "AVG") {
      result = result === null ? value : result + value
    }
  }
  if (name === "COUNT") {
    return BigInt(count)
  }
  if (!count) {
    return null
  }
  if (name === "MIN" || name === "MAX" || name === "SUM") {
    return result
  }
  if (name === "AVG") {
    return typeof result === "bigint" ? Number(result) / count : result / count
  }
  throw new SqlError(`Unknown aggregate ${name}`)
}
