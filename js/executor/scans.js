export function* sequenceScan(table, reference, transaction) {
  for (const item of table.scan(transaction)) yield { [reference.alias]: item.row }
}

export function* indexScan(table, reference, index, key, transaction) {
  for (const item of table.lookup(index, key, transaction)) yield { [reference.alias]: item.row }
}
