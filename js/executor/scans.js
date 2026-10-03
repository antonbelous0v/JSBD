import { evaluate, sqlBoolean } from "./expression.js"

export function sequenceScan(table, reference, transaction) {
  const source = table.scan(transaction)
  const rows = new Array(source.length)
  for (let index = 0; index < source.length; index += 1) {
    rows[index] = { [reference.alias]: source[index].row }
  }
  return rows
}

export function indexScan(table, reference, index, key, transaction) {
  const source = table.lookup(index, key, transaction)
  const rows = new Array(source.length)
  for (let position = 0; position < source.length; position += 1) {
    rows[position] = { [reference.alias]: source[position].row }
  }
  return rows
}

export function limitedSequenceScan(table, reference, transaction, condition, limit) {
  const rows = []
  table.forEach(transaction, (item) => {
    const context = { [reference.alias]: item.row }
    if (sqlBoolean(evaluate(condition, context))) {
      rows[rows.length] = context
    }
    return rows.length < limit
  })
  return rows
}
