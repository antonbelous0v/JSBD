import { WriteConflictError } from "../errors.js"

export class LockTable {
  constructor() {
    this.owners = new Map()
    this.held = new Map()
  }

  acquire(transactionId, resource) {
    const owner = this.owners.get(resource)
    if (owner !== undefined && owner !== transactionId) throw new WriteConflictError(`Resource ${resource} is being modified`)
    this.owners.set(resource, transactionId)
    let resources = this.held.get(transactionId)
    if (!resources) this.held.set(transactionId, resources = new Set())
    resources.add(resource)
  }

  release(transactionId) {
    const resources = this.held.get(transactionId)
    if (!resources) return
    for (const resource of resources) if (this.owners.get(resource) === transactionId) this.owners.delete(resource)
    this.held.delete(transactionId)
  }
}
