export interface ReliablePacket<T = any> {
  seq: number
  t: number
  data: T
}

export interface ReliableEngineOptions {
  maxOutgoing?: number
  maxIncomingBuffer?: number
  gapTimeoutMs?: number
  onGapTimeout?: (params: { expectedSeq: number; highestSeq: number }) => void
}

/**
 * ReliableEngine provides a small reusable sequencing layer:
 * - sender side: create outgoing packets, keep resend queue, ack and evict
 * - receiver side: reorder packets by seq, hold gaps, timeout-trigger retransmit
 */
export class ReliableEngine<T = any> {
  private readonly maxOutgoing: number
  private readonly maxIncomingBuffer: number
  private readonly gapTimeoutMs: number
  private readonly onGapTimeout?: (params: {
    expectedSeq: number
    highestSeq: number
  }) => void

  private nextOutgoingSeq = 0
  private outgoing = new Map<number, ReliablePacket<T>>()

  private expectedIncomingSeq = 1
  private incomingBuffer = new Map<number, ReliablePacket<T>>()
  private gapTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: ReliableEngineOptions = {}) {
    this.maxOutgoing = options.maxOutgoing ?? 1000
    this.maxIncomingBuffer = options.maxIncomingBuffer ?? 1000
    this.gapTimeoutMs = options.gapTimeoutMs ?? 1200
    this.onGapTimeout = options.onGapTimeout
  }

  createOutgoingPacket(data: T): ReliablePacket<T> {
    const packet: ReliablePacket<T> = {
      seq: ++this.nextOutgoingSeq,
      t: Date.now(),
      data,
    }
    this.outgoing.set(packet.seq, packet)

    if (this.outgoing.size > this.maxOutgoing) {
      const oldest = this.outgoing.keys().next().value
      if (typeof oldest === 'number') this.outgoing.delete(oldest)
    }

    return packet
  }

  ack(seq: number) {
    if (!Number.isFinite(seq)) return
    const ackSeq = Math.floor(seq)
    for (const key of this.outgoing.keys()) {
      if (key <= ackSeq) this.outgoing.delete(key)
    }
  }

  getOutgoingPacket(seq: number): ReliablePacket<T> | undefined {
    return this.outgoing.get(seq)
  }

  getOutgoingRange(fromSeq: number, toSeq?: number): ReliablePacket<T>[] {
    if (!Number.isFinite(fromSeq)) return []
    const from = Math.max(1, Math.floor(fromSeq))
    const to = Number.isFinite(toSeq ?? NaN) ? Math.floor(toSeq as number) : Number.MAX_SAFE_INTEGER
    const out: ReliablePacket<T>[] = []
    for (const [seq, packet] of this.outgoing.entries()) {
      if (seq >= from && seq <= to) out.push(packet)
    }
    out.sort((a, b) => a.seq - b.seq)
    return out
  }

  consumeIncomingPacket(packet: ReliablePacket<T>, onDeliver: (packet: ReliablePacket<T>) => void) {
    if (!packet || !Number.isFinite(packet.seq)) return
    const seq = Math.floor(packet.seq)

    // Duplicate or old packet.
    if (seq < this.expectedIncomingSeq) return

    // In-order packet.
    if (seq === this.expectedIncomingSeq) {
      onDeliver(packet)
      this.expectedIncomingSeq += 1
      this.flushBuffered(onDeliver)
      if (this.incomingBuffer.size === 0) this.clearGapTimer()
      return
    }

    // Future packet: keep and wait for missing seq.
    this.incomingBuffer.set(seq, packet)
    if (this.incomingBuffer.size > this.maxIncomingBuffer) {
      const oldest = this.incomingBuffer.keys().next().value
      if (typeof oldest === 'number') this.incomingBuffer.delete(oldest)
    }

    this.startGapTimer()
  }

  private flushBuffered(onDeliver: (packet: ReliablePacket<T>) => void) {
    while (true) {
      const packet = this.incomingBuffer.get(this.expectedIncomingSeq)
      if (!packet) break
      this.incomingBuffer.delete(this.expectedIncomingSeq)
      onDeliver(packet)
      this.expectedIncomingSeq += 1
    }
  }

  private startGapTimer() {
    if (this.gapTimer || !this.onGapTimeout) return

    this.gapTimer = setTimeout(() => {
      this.gapTimer = null
      if (this.incomingBuffer.size === 0) return
      const highest = Math.max(...Array.from(this.incomingBuffer.keys()))
      this.onGapTimeout?.({
        expectedSeq: this.expectedIncomingSeq,
        highestSeq: highest,
      })
    }, this.gapTimeoutMs)
  }

  private clearGapTimer() {
    if (!this.gapTimer) return
    clearTimeout(this.gapTimer)
    this.gapTimer = null
  }

  getExpectedIncomingSeq() {
    return this.expectedIncomingSeq
  }
}
