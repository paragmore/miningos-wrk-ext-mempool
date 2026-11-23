'use strict'

const { MS_1_HOUR } = require('./constants')

const hourBucket = (ts) => Math.floor(ts / MS_1_HOUR) * MS_1_HOUR

const toBlockStat = (block) => {
  const stat = {
    height: block?.height,
    ts: block?.timestamp * 1000,
    reward: block?.extras?.reward,
    totalFees: block?.extras?.totalFees,
    size: block?.size
  }
  if (!Object.values(stat).every(Number.isFinite)) throw new Error('ERR_BLOCK_STATS_INVALID_BLOCK')
  return stat
}

// The unbroken run of blocks ending at `to`, oldest first and no lower than
// `from`. A page shorter than asked for comes back as a shorter run - never as
// a run with a hole in it, which would leave a block out of the sums for good.
const pickBlocks = (page, from, to) => {
  if (!Array.isArray(page)) throw new Error('ERR_BLOCK_STATS_INVALID_PAGE')

  const byHeight = new Map()
  for (const block of page) {
    if (Number.isInteger(block?.height)) byHeight.set(block.height, block)
  }

  const blocks = []
  for (let height = to; height >= from && byHeight.has(height); height--) {
    blocks.unshift(toBlockStat(byHeight.get(height)))
  }
  if (!blocks.length) throw new Error('ERR_BLOCK_STATS_EMPTY_PAGE')
  return blocks
}

const groupByHour = (blocks) => {
  const hours = new Map()
  for (const block of blocks) {
    const ts = hourBucket(block.ts)
    if (!hours.has(ts)) hours.set(ts, [])
    hours.get(ts).push(block)
  }
  return hours
}

// Heights are synced as one unbroken range that only grows at its ends, so a
// block inside the height span a row already covers has been counted before:
// re-running a page after a crash between the row write and the cursor write
// adds nothing twice.
const addBlocksToRow = (row, ts, blocks) => {
  const next = row
    ? { ...row }
    : { ts, blockCount: 0, blockRewardSum: 0, blockTotalFeesSum: 0, blockSizeSum: 0 }

  const covers = (height) => !!row && height >= row.minHeight && height <= row.maxHeight

  for (const block of blocks) {
    if (covers(block.height)) continue
    next.minHeight = next.blockCount ? Math.min(next.minHeight, block.height) : block.height
    next.maxHeight = next.blockCount ? Math.max(next.maxHeight, block.height) : block.height
    next.blockCount++
    next.blockRewardSum += block.reward
    next.blockTotalFeesSum += block.totalFees
    next.blockSizeSum += block.size
  }

  return next
}

module.exports = {
  hourBucket,
  pickBlocks,
  groupByHour,
  addBlocksToRow
}
