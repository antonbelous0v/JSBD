import assert from "node:assert/strict"
import test from "node:test"

import { BTree } from "../js/index/btree.js"

test("B+Tree matches a sorted map under random operations", () => {
  const tree = new BTree(8)
  const expected = new Map()
  let state = 123456789
  for (let step = 0; step < 5000; step += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const key = state % 500
    if (state & 1) {
      if (!expected.has(key)) { expected.set(key, key * 3); tree.insert(key, key * 3) }
    } else {
      assert.equal(tree.remove(key), expected.delete(key))
    }
  }
  assert.deepEqual([...tree.scan()].map(entry => [entry.key, entry.value]), [...expected].sort((left, right) => left[0] - right[0]))
})
