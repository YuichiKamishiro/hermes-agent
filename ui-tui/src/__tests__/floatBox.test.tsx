import { PassThrough } from 'stream'

import { renderSync, Text } from '@hermes/ink'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { FloatBox } from '../components/appChrome.js'
import { DEFAULT_THEME } from '../theme.js'

const renderPlain = (node: React.ReactNode) => {
  const stdout = new PassThrough()
  const stdin = new PassThrough()
  const stderr = new PassThrough()
  let output = ''

  Object.assign(stdout, { columns: 60, isTTY: false, rows: 24 })
  Object.assign(stdin, { isTTY: false })
  Object.assign(stderr, { isTTY: false })
  stdout.on('data', chunk => {
    output += chunk.toString()
  })

  const instance = renderSync(node, {
    patchConsole: false,
    stderr: stderr as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream
  })

  instance.unmount()
  instance.cleanup()

  return output
}

describe('FloatBox', () => {
  it('uses the same round-corner border style as the assistant answer card, not a heavy double line', () => {
    // The `/` command menu and other floating overlays (FloatBox) used a
    // double-line border (╔═╗), which reads as a visually heavier/different
    // UI language than every other bordered surface in the TUI (assistant
    // answer cards, tool results — all round `╭─╮`). One consistent border
    // style across the app, not two competing ones.
    const output = renderPlain(
      <FloatBox color={DEFAULT_THEME.color.border}>
        <Text>x</Text>
      </FloatBox>
    )

    expect(output).toContain('╭')
    expect(output).not.toContain('╔')
    expect(output).not.toContain('║')
  })
})
