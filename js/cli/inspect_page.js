import { Page } from "../storage/page.js"
import { PAGE_SIZE } from "../constants.js"

export function inspectPage(host, path, pageId) {
  const fd = host.fs.open(path, host.fs.O_RDONLY)
  try {
    const bytes = new Uint8Array(PAGE_SIZE)
    if (host.fs.pread(fd, bytes, 0, PAGE_SIZE, pageId * PAGE_SIZE) !== PAGE_SIZE) throw new Error(`Cannot read page ${pageId}`)
    const page = Page.decode(bytes, pageId)
    return { pageId: page.id, type: page.type, pageLSN: page.pageLSN, freeStart: page.freeStart, freeEnd: page.freeEnd, checksum: "OK" }
  } finally { host.fs.close(fd) }
}
