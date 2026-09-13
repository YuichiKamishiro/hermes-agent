import { PassThrough } from 'stream'

import { renderSync } from '@hermes/ink'
import chalk from 'chalk'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { TodoPanel } from '../components/todoPanel.js'
import { DEFAULT_THEME } from '../theme.js'
import type { TodoItem } from '../types.js'

const renderRaw = (todos: TodoItem[]) => {
  const savedLevel = chalk.level
  chalk.level = 3

  const stdout = new PassThrough()
  const stdin = new PassThrough()
  const stderr = new PassThrough()
  let output = ''

  Object.assign(stdout, { columns: 60, isTTY: true, rows: 24 })
  Object.assign(stdin, { isTTY: false })
  Object.assign(stderr, { isTTY: false })
  stdout.on('data', chunk => {
    output += chunk.toString()
  })

  const instance = renderSync(React.createElement(TodoPanel, { t: DEFAULT_THEME, todos }), {
    patchConsole: false,
    stderr: stderr as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream
  })

  instance.unmount()
  instance.cleanup()
  chalk.level = savedLevel

  return output
}

const fgAt = (ansi: string, text: string): string | undefined => {
  // Ink emits a cursor-forward escape (`\x1b[1C`) between EVERY character it
  // draws, so a literal multi-word needle like 'active task' never matches
  // via plain indexOf. Find the first content character of the needle
  // instead, then walk backwards for the nearest preceding truecolor SGR.
  const firstChar = text.trim()[0]

  if (!firstChar) {
    return undefined
  }

  const end = ansi.indexOf(firstChar)

  if (end < 0) {
    return undefined
  }

  let fg: string | undefined

  for (const match of ansi.slice(0, end).matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m/g)) {
    fg = `#${match
      .slice(1, 4)
      .map(v => Number(v).toString(16).padStart(2, '0'))
      .join('')}`
  }

  return fg
}

describe('TodoPanel', () => {
  it('gives in_progress a color distinct from pending — not just a different glyph', () => {
    const todos: TodoItem[] = [
      { content: 'active task', id: 'a', status: 'in_progress' },
      { content: 'queued task', id: 'b', status: 'pending' }
    ]

    const output = renderRaw(todos)
    const activeFg = fgAt(output, 'active task')
    const pendingFg = fgAt(output, 'queued task')

    expect(activeFg).toBeDefined()
    expect(pendingFg).toBeDefined()
    expect(activeFg).not.toBe(pendingFg)
    // in_progress must stand out with the theme's accent tone, not just
    // reuse the plain body-text color pending already uses.
    expect(activeFg).toBe(DEFAULT_THEME.color.accent.toLowerCase())
  })
})
