import assert from "node:assert/strict"
import test from "node:test"

import { BTree } from "../js/index/btree.js"

test("B+Tree survives splits ranges and merges", () => {
  const tree = new BTree(4)
  for (let value = 100; value >= 0; value -= 1) tree.insert(value, value * 2)
  assert.equal(tree.find(42), 84)
  assert.deepEqual([...tree.range(40, 44)].map(entry => entry.key), [40, 41, 42, 43, 44])
  for (let value = 0; value <= 100; value += 2) assert.equal(tree.remove(value), true)
  assert.deepEqual([...tree.scan()].map(entry => entry.key), Array.from({ length: 50 }, (_, index) => index * 2 + 1))
})
