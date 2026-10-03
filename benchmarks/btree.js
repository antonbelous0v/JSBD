import { BTree } from "../js/index/btree.js"

const count = Number(process.argv[2] ?? 100000)
const tree = new BTree()
const startInsert = process.hrtime.bigint()
for (let index = 0; index < count; index += 1) {
  tree.insert(index, index)
}
const startRead = process.hrtime.bigint()
for (let index = 0; index < count; index += 1) {
  tree.find(index)
}
const end = process.hrtime.bigint()

printResult("insert", count, startInsert, startRead)
printResult("lookup", count, startRead, end)

function printResult(name, operations, start, finish) {
  const seconds = Number(finish - start) / 1e9
  console.log(`${name}: ${Math.round(operations / seconds)} ops/s`)
}
