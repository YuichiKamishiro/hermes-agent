import { PassThrough } from 'stream'

import { renderSync } from '@hermes/ink'
import chalk from 'chalk'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { ToolTrail } from '../components/thinking.js'
import { buildVerboseToolTrailLine, stripAnsi } from '../lib/text.js'
import { DEFAULT_THEME } from '../theme.js'

const renderTrailRaw = (trail: string[], columns = 36, color = false) => {
  const savedLevel = chalk.level

  if (color) {
    chalk.level = 3
  }

  const stdout = new PassThrough()
  const stdin = new PassThrough()
  const stderr = new PassThrough()
  let output = ''

  Object.assign(stdout, { columns, isTTY: color, rows: 24 })
  Object.assign(stdin, { isTTY: false })
  Object.assign(stderr, { isTTY: false })
  stdout.on('data', chunk => {
    output += chunk.toString()
  })

  const instance = renderSync(
    <ToolTrail detailsMode="expanded" t={DEFAULT_THEME} trail={trail} />,
    {
      patchConsole: false,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream
    }
  )

  instance.unmount()
  instance.cleanup()
  chalk.level = savedLevel

  return output
}

const renderTrail = (trail: string[], columns = 36) =>
  stripAnsi(renderTrailRaw(trail, columns)).split('\n').map(line => line.trimEnd())

const dimAt = (ansi: string, text: string) => {
  const end = ansi.indexOf(text)
  let dim = false

  for (const match of ansi.slice(0, end).matchAll(/\x1b\[([0-9;]*)m/g)) {
    const codes = (match[1] || '0').split(';').map(Number)

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i]!

      // 38;2;r;g;b / 48;2;r;g;b truecolor sequences pack unrelated numbers
      // (incl. literal 2 and 0) — consume them as one token, don't treat
      // each component as its own SGR code.
      if ((code === 38 || code === 48) && codes[i + 1] === 2) {
        i += 4
        continue
      }

      if (code === 0 || code === 22) {
        dim = false
      } else if (code === 2) {
        dim = true
      }
    }
  }

  return dim
}

describe('ToolTrail compact layout', () => {
  it('uses one rail for calls and indents details by two columns, inside the group border', () => {
    // The `│` on every line is the ToolTrail group border. It used to be a
    // left-only rail; it is now a CLOSED round card (see thinking.tsx), so
    // each row carries a border glyph on BOTH sides and the card eats 4
    // columns (2 border + paddingX 1) out of the content width.
    const detail = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const trail = [buildVerboseToolTrailLine('terminal', 'build project', false, 1.25, detail)]
    const lines = renderTrail(trail)
    const callLine = lines.find(line => line.includes('● Terminal'))
    const detailLine = lines.find(line => line.includes('Args:'))

    expect(callLine).toMatch(/^│ └─ ● Terminal/)
    expect(detailLine).toMatch(/^│   └─ Args:/)
    // Strip the group-border glyph from BOTH ends of every wrapped line
    // before checking the detail text survived intact — otherwise the
    // border (which repeats on every wrapped continuation row, on both
    // sides now that the card is closed) gets spliced into the middle of
    // the concatenated detail text.
    expect(
      lines
        .map(line => line.replace(/^│\s?/, '').replace(/\s?│$/, ''))
        .join('')
        .replace(/\s/g, '')
    ).toContain(detail)
  })

  it('keeps the section label and successful output readable', () => {
    const trail = [buildVerboseToolTrailLine('terminal', 'build project', false, undefined, 'readable output')]
    const output = renderTrailRaw(trail, 50, true)

    expect(dimAt(output, 'Tool')).toBe(false)
    expect(dimAt(output, 'readable')).toBe(false)
  })
})
