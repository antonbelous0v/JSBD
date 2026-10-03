import { lowerBound, compareKeys } from "./key.js"
import { ConstraintError, ValidationError } from "../errors.js"
import { append, appendAll, insertAt, removeAt, takeLast } from "./node_array.js"

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
    if (!Number.isSafeInteger(order) || order < 4) {
      throw new ValidationError("B+Tree order must be at least four")
    }
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
      if (this.unique) {
        throw new ConstraintError("Duplicate index key")
      }
      while (index < leaf.keys.length && compareKeys(leaf.keys[index], key) === 0) {
        index += 1
      }
    }
    insertAt(leaf.keys, index, key)
    insertAt(leaf.values, index, value)
    this.size += 1
    if (leaf.keys.length >= this.order) {
      this.splitLeaf(leaf, path)
    }
  }

  remove(key, value) {
    const path = []
    const leaf = this.findLeaf(key, path)
    let index = lowerBound(leaf.keys, key)
    while (index < leaf.keys.length && compareKeys(leaf.keys[index], key) === 0) {
      if (value === undefined || sameValue(leaf.values[index], value)) {
        removeAt(leaf.keys, index)
        removeAt(leaf.values, index)
        this.size -= 1
        this.rebalanceLeaf(leaf, path)
        return true
      }
      index += 1
    }
    return false
  }

  rebalanceLeaf(leaf, path) {
    if (!path.length) {
      return
    }
    const minimum = Math.ceil((this.order - 1) / 2)
    if (leaf.keys.length >= minimum) {
      return
    }
    const { node: parent, index } = takeLast(path)
    const left = index > 0 ? parent.children[index - 1] : null
    const right = index + 1 < parent.children.length ? parent.children[index + 1] : null
    if (left && left.keys.length > minimum) {
      insertAt(leaf.keys, 0, takeLast(left.keys))
      insertAt(leaf.values, 0, takeLast(left.values))
      parent.keys[index - 1] = leaf.keys[0]
      return
    }
    if (right && right.keys.length > minimum) {
      append(leaf.keys, removeAt(right.keys, 0))
      append(leaf.values, removeAt(right.values, 0))
      parent.keys[index] = right.keys[0]
      return
    }
    if (left) {
      appendAll(left.keys, leaf.keys)
      appendAll(left.values, leaf.values)
      left.next = leaf.next
      removeAt(parent.keys, index - 1)
      removeAt(parent.children, index)
    } else if (right) {
      appendAll(leaf.keys, right.keys)
      appendAll(leaf.values, right.values)
      leaf.next = right.next
      removeAt(parent.keys, index)
      removeAt(parent.children, index + 1)
    }
    this.rebalanceInternal(parent, path)
  }

  rebalanceInternal(node, path) {
    if (node === this.root) {
      if (node.children.length === 1) {
        this.root = node.children[0]
      }
      return
    }
    const minimum = Math.ceil(this.order / 2)
    if (node.children.length >= minimum) {
      return
    }
    const { node: parent, index } = takeLast(path)
    const left = index > 0 ? parent.children[index - 1] : null
    const right = index + 1 < parent.children.length ? parent.children[index + 1] : null
    if (left && left.children.length > minimum) {
      insertAt(node.keys, 0, parent.keys[index - 1])
      insertAt(node.children, 0, takeLast(left.children))
      parent.keys[index - 1] = takeLast(left.keys)
      return
    }
    if (right && right.children.length > minimum) {
      append(node.keys, parent.keys[index])
      append(node.children, removeAt(right.children, 0))
      parent.keys[index] = removeAt(right.keys, 0)
      return
    }
    if (left) {
      append(left.keys, parent.keys[index - 1])
      appendAll(left.keys, node.keys)
      appendAll(left.children, node.children)
      removeAt(parent.keys, index - 1)
      removeAt(parent.children, index)
    } else if (right) {
      append(node.keys, parent.keys[index])
      appendAll(node.keys, right.keys)
      appendAll(node.children, right.children)
      removeAt(parent.keys, index)
      removeAt(parent.children, index + 1)
    }
    this.rebalanceInternal(parent, path)
  }

  findLeaf(key, path = []) {
    let node = this.root
    while (!node.leaf) {
      let index = lowerBound(node.keys, key)
      if (index < node.keys.length && compareKeys(key, node.keys[index]) >= 0) {
        index += 1
      }
      append(path, { node, index })
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
      append(root.keys, separator)
      append(root.children, left)
      append(root.children, right)
      this.root = root
      return
    }
    const { node: parent, index } = takeLast(path)
    insertAt(parent.keys, index, separator)
    insertAt(parent.children, index + 1, right)
    if (parent.children.length > this.order) {
      this.splitInternal(parent, path)
    }
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

  * range(start, end) {
    let leaf = this.findLeaf(start)
    let index = lowerBound(leaf.keys, start)
    while (leaf) {
      while (index < leaf.keys.length) {
        if (compareKeys(leaf.keys[index], end) > 0) {
          return
        }
        yield { key: leaf.keys[index], value: leaf.values[index] }
        index += 1
      }
      leaf = leaf.next
      index = 0
    }
  }

  * scan() {
    let node = this.root
    while (!node.leaf) {
      node = node.children[0]
    }
    while (node) {
      for (let index = 0; index < node.keys.length; index += 1) {
        yield { key: node.keys[index], value: node.values[index] }
      }
      node = node.next
    }
  }
}

function sameValue(left, right) {
  if (Object.is(left, right)) {
    return true
  }
  return left && right && left.pageId === right.pageId && left.slotId === right.slotId
}
