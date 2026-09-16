#!/usr/bin/env node
// Records the conditions a benchmark run happened under, automatically, so two
// runs can be compared (or shown to be incomparable) without anyone having to
// remember what the machine was doing at the time.
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

function ps(script) {
  try {
    return execFileSync('powershell', ['-NoProfile', '-Command', script], {
      encoding: 'utf8',

    }).trim()
  } catch {
    return 'unknown'
  }
}

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

// BatteryStatus: 1 = discharging, 2 = on AC. Absent on desktops.
const batteryRaw = ps('(Get-CimInstance Win32_Battery).BatteryStatus')
// Power plan needs admin in this session; omitted rather than reported as unknown.

const meta = {
  capturedAt: new Date().toISOString(),
  os: `${os.platform()} ${os.release()}`,
  cpu: os.cpus()[0].model,
  cores: os.cpus().length,
  totalMemGB: +(os.totalmem() / 1024 ** 3).toFixed(1),
  freeMemGB: +(os.freemem() / 1024 ** 3).toFixed(1),
  node: process.version,
  chrome: ps(`(Get-Item '${CHROME}').VersionInfo.ProductVersion`),
  onMainsPower: batteryRaw === '2' ? true : batteryRaw === '1' ? false : 'no battery reported',

  harnessRunner: 'puppeteer (webdriver-ts default)',
  harnessIterations: 15,
  // Not 4x across the board, despite what docs/BENCHMARKS.md claims. The harness
  // sets this per benchmark in webdriver-ts/src/benchmarksCommon.ts.
  throttling: {
    '01_run1k': 1,
    '02_replace1k': 1,
    '03_update10th1k_x16': 4,
    '04_select1k': 4,
    '05_swap1k': 4,
    '06_remove-one-1k': 2,
    '07_create10k': 1,
    '08_create1k-after1k_x2': 1,
    '09_clear1k_x8': 4,
  },
  reactVersion: '19.2.0',
  rrjsRendererVersion: JSON.parse(
    readFileSync(join(ROOT, 'packages', 'renderer', 'package.json'), 'utf8')
  ).version,
  rrjsGitHead: (() => {
    try {
      return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
    } catch {
      return 'unknown'
    }
  })(),
  rrjsWorkingTreeDirty: (() => {
    try {
      return execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim().length > 0
    } catch {
      return 'unknown'
    }
  })(),
}

const out = join(ROOT, 'bench-results', 'environment.json')
writeFileSync(out, JSON.stringify(meta, null, 2) + '\n')
console.log(JSON.stringify(meta, null, 2))
if (!existsSync(out)) process.exit(1)
