import { PageType } from "../constants.js"
import { SlottedPage } from "./slotted_page.js"

export class Heap {
  constructor(bufferPool, pageIds = []) {
    this.bufferPool = bufferPool
    this.pageIds = pageIds
  }

  insert(bytes) {
    for (const pageId of this.pageIds) {
      const page = this.bufferPool.get(pageId)
      const slots = new SlottedPage(page)
      const slotId = slots.insert(bytes)
      this.bufferPool.unpin(page, slotId >= 0)
      if (slotId >= 0) return { pageId, slotId }
    }
    const page = this.bufferPool.allocate(PageType.HEAP)
    const slots = SlottedPage.initialize(page)
    const slotId = slots.insert(bytes)
    this.pageIds.push(page.id)
    this.bufferPool.unpin(page, true)
    return { pageId: page.id, slotId }
  }

  get(rid) {
    const page = this.bufferPool.get(rid.pageId)
    try { return new Uint8Array(new SlottedPage(page).get(rid.slotId)) }
    finally { this.bufferPool.unpin(page) }
  }

  remove(rid) {
    const page = this.bufferPool.get(rid.pageId)
    try { return new SlottedPage(page).remove(rid.slotId) }
    finally { this.bufferPool.unpin(page, true) }
  }

  *scan() {
    for (const pageId of this.pageIds) {
      const page = this.bufferPool.get(pageId)
      try {
        for (const entry of new SlottedPage(page).entries()) yield { rid: { pageId, slotId: entry.slotId }, bytes: new Uint8Array(entry.bytes) }
      } finally { this.bufferPool.unpin(page) }
    }
  }
}
