'use strict'

const { BTC_SATS } = require('./constants')

// Every confirmed transaction paying `address` is a rebate, except those that
// also spend from it: change from our own outgoing transfers looks like an
// incoming payment but is not a rebate.
function extractRebates (txs, address) {
  const rebates = []
  const seen = new Set()

  for (const tx of Array.isArray(txs) ? txs : []) {
    if (!tx?.txid || !tx.status?.confirmed || !Number.isFinite(tx.status.block_time)) continue
    if (seen.has(tx.txid)) continue

    const inputs = Array.isArray(tx.vin) ? tx.vin : []
    if (inputs.some((vin) => vin?.prevout?.scriptpubkey_address === address)) continue

    const sats = (Array.isArray(tx.vout) ? tx.vout : [])
      .filter((vout) => vout?.scriptpubkey_address === address)
      .reduce((sum, vout) => sum + (Number(vout.value) || 0), 0)
    if (sats <= 0) continue

    seen.add(tx.txid)
    rebates.push({
      ts: tx.status.block_time * 1000,
      amountBTC: sats / BTC_SATS,
      txid: tx.txid,
      sender: inputs.find((vin) => vin?.prevout?.scriptpubkey_address)?.prevout.scriptpubkey_address,
      receiver: address,
      source: 'auto'
    })
  }

  return rebates
}

const DAY_MS = 24 * 60 * 60 * 1000

// Daily schedules only: "M H * * *", evaluated in UTC. A plain hour/minute in
// UTC keeps site locations out of config files (a timezone names the site);
// e.g. "0 4 * * *" runs at a South American site's midnight.
function parseDailyCron (expr) {
  const parts = String(expr ?? '').trim().split(/\s+/)
  if (parts.length !== 5 || parts[2] !== '*' || parts[3] !== '*' || parts[4] !== '*') {
    throw new Error('ERR_INVALID_SYNC_CRON')
  }

  const minute = Number(parts[0])
  const hour = Number(parts[1])
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error('ERR_INVALID_SYNC_CRON')
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('ERR_INVALID_SYNC_CRON')

  return { minute, hour }
}

// The most recent scheduled fire time at or before `now`; a run is due when
// the last completed run predates it.
function lastCronFire (now, { minute, hour }) {
  const dayStart = now - (now % DAY_MS)
  const todayFire = dayStart + hour * 60 * 60 * 1000 + minute * 60 * 1000
  return now >= todayFire ? todayFire : todayFire - DAY_MS
}

module.exports = {
  extractRebates,
  parseDailyCron,
  lastCronFire
}
