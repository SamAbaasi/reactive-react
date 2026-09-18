import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const slashes = path => path.split('\\').join('/')

function filesUnder(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? filesUnder(join(directory, entry.name)).map(file => `${entry.name}/${file}`)
    : [entry.name])
}

// A source map stores the path from the map to its source, which depends on where
// the output folder sits. Compare the sources relative to the package root.
function normalizedMap(text, mapFile, packageRoot) {
  try {
    const map = JSON.parse(text)
    map.sources = map.sources.map(source => slashes(relative(packageRoot, resolve(dirname(mapFile), source))))
    return JSON.stringify(map)
  } catch {
    return undefined
  }
}

// tsc never deletes output whose source has gone, and the packages publish dist/
// whole. @rrjs/react-compat and @rrjs/renderer 0.2.0 and 0.2.1 shipped dist/react.*
// compiled from an experiment that was never committed. What a package ships under
// dist/ must be exactly what compiling its current source produces.
export function assertDistMatchesSource({ name, shipped, compiled, sourceRoot }) {
  const shippedFiles = filesUnder(join(shipped, 'dist')).sort()
  const compiledFiles = filesUnder(compiled).sort()
  // assert.ok keeps each message to the one line written here; the deepEqual
  // family appends a diff to it.
  const extra = shippedFiles.filter(file => !compiledFiles.includes(file))
  assert.ok(extra.length === 0, `P7: ${name} ships dist files its source does not produce: ${extra.join(', ')}`)
  const missing = compiledFiles.filter(file => !shippedFiles.includes(file))
  assert.ok(missing.length === 0, `P7: ${name} is missing compiled output: ${missing.join(', ')}`)
  const result = { files: compiledFiles.length, identical: 0, sourceMaps: 0 }
  const differing = []
  for (const file of compiledFiles) {
    const shippedFile = join(shipped, 'dist', file)
    const compiledFile = join(compiled, file)
    const shippedBytes = readFileSync(shippedFile)
    const compiledBytes = readFileSync(compiledFile)
    if (shippedBytes.equals(compiledBytes)) {
      result.identical++
      continue
    }
    const shippedMap = file.endsWith('.map') ? normalizedMap(shippedBytes.toString('utf8'), shippedFile, shipped) : undefined
    if (shippedMap !== undefined && shippedMap === normalizedMap(compiledBytes.toString('utf8'), compiledFile, sourceRoot)) {
      result.sourceMaps++
      continue
    }
    differing.push(file)
  }
  assert.ok(differing.length === 0, `P7: ${name} ships dist files that differ from compiling its current source: ${differing.join(', ')}`)
  return result
}

// Run a Node script without forcing its exit. The script receives a file path and
// appends the name of each stage it reaches, synchronously, so the record survives
// a kill. Finishing and exiting get separate limits: a single timeout for both
// cannot tell a slow start from a package that holds Node open.
export function runToExit(script, { cwd, stagesFile, finishWithinMs, exitWithinMs }) {
  return new Promise(settle => {
    const started = Date.now()
    const child = spawn(process.execPath, [script, stagesFile], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
    const stages = () => existsSync(stagesFile) ? readFileSync(stagesFile, 'utf8').split('\n').filter(Boolean) : []
    let outcome = 'exited'
    let finishedAt
    const watch = setInterval(() => {
      if (finishedAt === undefined && stages().includes('finished')) finishedAt = Date.now()
      const stop = finishedAt === undefined
        ? Date.now() - started > finishWithinMs && 'did-not-finish'
        : Date.now() - finishedAt > exitWithinMs && 'did-not-exit'
      if (!stop) return
      outcome = stop
      clearInterval(watch)
      child.kill()
    }, 25)
    child.on('close', (code, signal) => {
      clearInterval(watch)
      settle({ outcome, code, signal, stages: stages(), stdout, stderr, elapsedMs: Date.now() - started, finishWithinMs, exitWithinMs })
    })
  })
}

// `stages` maps each stage the script must have reached to what its absence means.
export function assertLifetime(run, { name, stages }) {
  assert.ok(run.outcome !== 'did-not-finish',
    `P7: ${name} did not finish within ${run.finishWithinMs} ms, so whether the packages let Node exit was not checked; a slow or blocked start is not evidence either way`)
  assert.ok(run.outcome !== 'did-not-exit',
    `P7: importing the packages keeps Node alive: ${name} finished and was still running ${run.exitWithinMs} ms later`)
  const output = `${run.stdout}\n${run.stderr}`.trim().split('\n').slice(-6).join(' | ')
  assert.ok(run.code === 0, `P7: ${name} exited with code ${run.code}: ${output}`)
  for (const [stage, meaning] of Object.entries(stages)) {
    assert.ok(run.stages.includes(stage), `P7: ${meaning} (${name} ended without reaching "${stage}")`)
  }
}
