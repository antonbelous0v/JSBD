import { lowerBound, compareKeys } from "./key.js"
import { ConstraintError, ValidationError } from "../errors.js"

class Node {
  constructor(leaf) {
    this.leaf = leaf
    this.keys = []
    this.values = leaf ? [] : null
    this.children = leaf ? null : []
    this.next = null
  }
}

export class BTree {
  constructor(order = 32, unique = true) {
    if (!Number.isSafeInteger(order) || order < 4) throw new ValidationError("B+Tree order must be at least four")
    this.order = order
    this.unique = unique
    this.root = new Node(true)
    this.size = 0
    this.splits = 0
  }

  find(key) {
    const leaf = this.findLeaf(key)
    const index = lowerBound(leaf.keys, key)
    return index < leaf.keys.length && compareKeys(leaf.keys[index], key) === 0 ? leaf.values[index] : undefined
  }

  insert(key, value) {
    const path = []
    const leaf = this.findLeaf(key, path)
    let index = lowerBound(leaf.keys, key)
    if (index < leaf.keys.length && compareKeys(leaf.keys[index], key) === 0) {
      if (this.unique) throw new ConstraintError("Duplicate index key")
      while (index < leaf.keys.length && compareKeys(leaf.keys[index], key) === 0) index += 1
    }
    leaf.keys.splice(index, 0, key)
    leaf.values.splice(index, 0, value)
    this.size += 1
    if (leaf.keys.length >= this.order) this.splitLeaf(leaf, path)
  }

  remove(key, value) {
    const path = []
    const leaf = this.findLeaf(key, path)
    let index = lowerBound(leaf.keys, key)
    while (index < leaf.keys.length && compareKeys(leaf.keys[index], key) === 0) {
      if (value === undefined || sameValue(leaf.values[index], value)) {
        leaf.keys.splice(index, 1)
        leaf.values.splice(index, 1)
        this.size -= 1
        this.rebalanceLeaf(leaf, path)
        return true
      }
      index += 1
    }
    return false
  }

  rebalanceLeaf(leaf, path) {
    if (!path.length) return
    const minimum = Math.ceil((this.order - 1) / 2)
    if (leaf.keys.length >= minimum) return
    const { node: parent, index } = path.pop()
    const left = index > 0 ? parent.children[index - 1] : null
    const right = index + 1 < parent.children.length ? parent.children[index + 1] : null
    if (left && left.keys.length > minimum) {
      leaf.keys.unshift(left.keys.pop())
      leaf.values.unshift(left.values.pop())
      parent.keys[index - 1] = leaf.keys[0]
      return
    }
    if (right && right.keys.length > minimum) {
      leaf.keys.push(right.keys.shift())
      leaf.values.push(right.values.shift())
      parent.keys[index] = right.keys[0]
      return
    }
    if (left) {
      left.keys.push(...leaf.keys)
      left.values.push(...leaf.values)
      left.next = leaf.next
      parent.keys.splice(index - 1, 1)
      parent.children.splice(index, 1)
    } else if (right) {
      leaf.keys.push(...right.keys)
      leaf.values.push(...right.values)
      leaf.next = right.next
      parent.keys.splice(index, 1)
      parent.children.splice(index + 1, 1)
    }
    this.rebalanceInternal(parent, path)
  }

  rebalanceInternal(node, path) {
    if (node === this.root) {
      if (node.children.length === 1) this.root = node.children[0]
      return
    }
    const minimum = Math.ceil(this.order / 2)
    if (node.children.length >= minimum) return
    const { node: parent, index } = path.pop()
    const left = index > 0 ? parent.children[index - 1] : null
    const right = index + 1 < parent.children.length ? parent.children[index + 1] : null
    if (left && left.children.length > minimum) {
      node.keys.unshift(parent.keys[index - 1])
      node.children.unshift(left.children.pop())
      parent.keys[index - 1] = left.keys.pop()
      return
    }
    if (right && right.children.length > minimum) {
      node.keys.push(parent.keys[index])
      node.children.push(right.children.shift())
      parent.keys[index] = right.keys.shift()
      return
    }
    if (left) {
      left.keys.push(parent.keys[index - 1], ...node.keys)
      left.children.push(...node.children)
      parent.keys.splice(index - 1, 1)
      parent.children.splice(index, 1)
    } else if (right) {
      node.keys.push(parent.keys[index], ...right.keys)
      node.children.push(...right.children)
      parent.keys.splice(index, 1)
      parent.children.splice(index + 1, 1)
    }
    this.rebalanceInternal(parent, path)
  }

  findLeaf(key, path = []) {
    let node = this.root
    while (!node.leaf) {
      let index = lowerBound(node.keys, key)
      if (index < node.keys.length && compareKeys(key, node.keys[index]) >= 0) index += 1
      path.push({ node, index })
      node = node.children[index]
    }
    return node
  }

  splitLeaf(leaf, path) {
    const middle = Math.ceil(leaf.keys.length / 2)
    const right = new Node(true)
    right.keys = leaf.keys.splice(middle)
    right.values = leaf.values.splice(middle)
    right.next = leaf.next
    leaf.next = right
    this.insertParent(leaf, right.keys[0], right, path)
  }

  insertParent(left, separator, right, path) {
    this.splits += 1
    if (!path.length) {
      const root = new Node(false)
      root.keys.push(separator)
      root.children.push(left, right)
      this.root = root
      return
    }
    const { node: parent, index } = path.pop()
    parent.keys.splice(index, 0, separator)
    parent.children.splice(index + 1, 0, right)
    if (parent.children.length > this.order) this.splitInternal(parent, path)
  }

  splitInternal(node, path) {
    const middle = node.keys.length >> 1
    const separator = node.keys[middle]
    const right = new Node(false)
    right.keys = node.keys.splice(middle + 1)
    right.children = node.children.splice(middle + 1)
    node.keys.splice(middle)
    this.insertParent(node, separator, right, path)
  }

  *range(start, end) {
    let leaf = this.findLeaf(start)
    let index = lowerBound(leaf.keys, start)
    while (leaf) {
      while (index < leaf.keys.length) {
        if (compareKeys(leaf.keys[index], end) > 0) return
        yield { key: leaf.keys[index], value: leaf.values[index] }
        index += 1
      }
      leaf = leaf.next
      index = 0
    }
  }

  *scan() {
    let node = this.root
    while (!node.leaf) node = node.children[0]
    while (node) {
      for (let index = 0; index < node.keys.length; index += 1) yield { key: node.keys[index], value: node.values[index] }
      node = node.next
    }
  }
}

function sameValue(left, right) {
  if (Object.is(left, right)) return true
  return left && right && left.pageId === right.pageId && left.slotId === right.slotId
}
