import { PassThrough } from 'stream'

import { renderSync } from '@hermes/ink'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { fmtMsgTimestamp, MessageLine } from '../components/messageLine.js'
import { MAX_HISTORY } from '../config/limits.js'
import { toTranscriptMessages } from '../domain/messages.js'
import { appendTranscriptMessage, capTranscriptHistory, upsert } from '../lib/messages.js'
import { stripAnsi } from '../lib/text.js'
import { DEFAULT_THEME } from '../theme.js'

describe('toTranscriptMessages', () => {
  it('preserves assistant tool-call rows so resume does not drop prior turns', () => {
    const rows = [
      { role: 'user', text: 'first prompt' },
      { role: 'tool', context: 'repo', name: 'search_files', text: 'ignored raw result' },
      { role: 'assistant', text: 'first answer' },
      { role: 'user', text: 'second prompt' }
    ]

    expect(toTranscriptMessages(rows).map(msg => [msg.role, msg.text])).toEqual([
      ['user', 'first prompt'],
      ['assistant', 'first answer'],
      ['user', 'second prompt']
    ])
    expect(toTranscriptMessages(rows)[1]?.tools?.[0]).toContain('Search Files')
  })

  it('skips hidden display_kind rows entirely', () => {
    const rows = [
      { role: 'user', text: 'visible prompt' },
      { role: 'user', text: '[CONTEXT COMPACTION — REFERENCE ONLY]', display_kind: 'hidden' },
      { role: 'assistant', text: 'visible reply' }
    ]

    const result = toTranscriptMessages(rows)
    expect(result.map(msg => msg.text)).toEqual(['visible prompt', 'visible reply'])
    expect(result.every(m => !m.text?.includes('COMPACTION'))).toBe(true)
  })

  it('projects model_switch as an event with replaced text', () => {
    const rows = [
      { role: 'user', text: 'hello' },
      { role: 'user', text: '[System: model changed to gpt-5]', display_kind: 'model_switch' },
      { role: 'assistant', text: 'hi' }
    ]

    const result = toTranscriptMessages(rows)
    expect(result.map(msg => [msg.kind, msg.role, msg.text])).toEqual([
      [undefined, 'user', 'hello'],
      ['event', 'system', 'model changed'],
      [undefined, 'assistant', 'hi']
    ])
  })

  it('projects async_delegation_complete with task_count metadata', () => {
    const rows = [
      { role: 'user', text: 'do work' },
      { role: 'assistant', text: 'done' },
      {
        role: 'user',
        text: '[IMPORTANT: delegation done]',
        display_kind: 'async_delegation_complete',
        display_metadata: { task_count: 3 }
      },
      { role: 'assistant', text: 'merged' }
    ]

    const result = toTranscriptMessages(rows)
    expect(result.map(msg => [msg.kind, msg.text])).toEqual([
      [undefined, 'do work'],
      [undefined, 'done'],
      ['event', '3 background agents finished'],
      [undefined, 'merged']
    ])
  })

  it('projects async_delegation_complete without metadata as generic text', () => {
    const rows = [{ role: 'user', text: 'event', display_kind: 'async_delegation_complete' }]

    const result = toTranscriptMessages(rows)
    expect(result[0]?.kind).toBe('event')
    expect(result[0]?.text).toBe('background agent work finished')
  })
})

describe('MessageLine', () => {
  it('preserves a separator after compound user prompt glyphs in transcript rows', () => {
    const stdout = new PassThrough()
    const stdin = new PassThrough()
    const stderr = new PassThrough()
    let output = ''

    Object.assign(stdout, { columns: 80, isTTY: false, rows: 24 })
    Object.assign(stdin, { isTTY: false })
    Object.assign(stderr, { isTTY: false })
    stdout.on('data', chunk => {
      output += chunk.toString()
    })

    const t = {
      ...DEFAULT_THEME,
      brand: { ...DEFAULT_THEME.brand, prompt: 'Ψ >' }
    }

    const instance = renderSync(
      React.createElement(MessageLine, {
        cols: 80,
        msg: { role: 'user', text: 'Okay' },
        t
      }),
      {
        patchConsole: false,
        stderr: stderr as NodeJS.WriteStream,
        stdin: stdin as NodeJS.ReadStream,
        stdout: stdout as NodeJS.WriteStream
      }
    )

    instance.unmount()
    instance.cleanup()

    const renderedLine = stripAnsi(output)
      .split('\n')
      .find(line => line.includes('Okay'))

    // The user bubble adds paddingX 1 inside the panel, so the body starts
    // one column later than the bare glyph row.
    expect(renderedLine).toContain('Ψ >  Okay')
  })

  it('does not draw a lone gutter glyph beside a boxed (non-empty) assistant card', () => {
    // messageLine renders a `╭...╮` card for a non-blank assistant answer.
    // The gutter tool_prefix glyph (Sisyphus: '│') predates that card and
    // used to sit alone in the gutter column, detached from the card's own
    // border — it read as a stray mark, not part of the card. The card's
    // own `╭` already marks the turn boundary, so the gutter column must
    // stay blank for a boxed assistant row.
    const stdout = new PassThrough()
    const stdin = new PassThrough()
    const stderr = new PassThrough()
    let output = ''

    Object.assign(stdout, { columns: 80, isTTY: false, rows: 24 })
    Object.assign(stdin, { isTTY: false })
    Object.assign(stderr, { isTTY: false })
    stdout.on('data', chunk => {
      output += chunk.toString()
    })

    const t = { ...DEFAULT_THEME, brand: { ...DEFAULT_THEME.brand, tool: '│' } }

    const instance = renderSync(
      React.createElement(MessageLine, {
        cols: 80,
        msg: { role: 'assistant', text: 'Readable response' },
        t
      }),
      {
        patchConsole: false,
        stderr: stderr as unknown as NodeJS.WriteStream,
        stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream
      }
    )

    instance.unmount()
    instance.cleanup()

    const rendered = stripAnsi(output)
    const cardLine = rendered.split('\n').find(line => line.includes('╭'))

    expect(cardLine).toBeDefined()
    // The gutter column (left of the card) must be blank, not carry the
    // lone tool_prefix glyph.
    expect(cardLine?.slice(0, cardLine.indexOf('╭'))).not.toContain('│')
  })

  it('wraps standalone tool results without dropping their tail', () => {
    const stdout = new PassThrough()
    const stdin = new PassThrough()
    const stderr = new PassThrough()
    let output = ''
    const payload = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

    Object.assign(stdout, { columns: 24, isTTY: false, rows: 24 })
    Object.assign(stdin, { isTTY: false })
    Object.assign(stderr, { isTTY: false })
    stdout.on('data', chunk => {
      output += chunk.toString()
    })

    const instance = renderSync(
      React.createElement(MessageLine, {
        cols: 24,
        msg: { role: 'tool', text: payload },
        t: DEFAULT_THEME
      }),
      {
        patchConsole: false,
        stderr: stderr as unknown as NodeJS.WriteStream,
        stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream
      }
    )

    instance.unmount()
    instance.cleanup()

    expect(stripAnsi(output).replace(/[╭╮╰╯│─\s]/g, '')).toContain(payload)
  })

  it('keeps historical thinking blocks collapsed by default', () => {
    const stdout = new PassThrough()
    const stdin = new PassThrough()
    const stderr = new PassThrough()
    let output = ''

    Object.assign(stdout, { columns: 80, isTTY: false, rows: 24 })
    Object.assign(stdin, { isTTY: false })
    Object.assign(stderr, { isTTY: false })
    stdout.on('data', chunk => {
      output += chunk.toString()
    })

    const instance = renderSync(
      React.createElement(MessageLine, {
        cols: 80,
        msg: { kind: 'trail', role: 'system', text: '', thinking: 'step one\nstep two' },
        t: DEFAULT_THEME
      }),
      {
        patchConsole: false,
        stderr: stderr as NodeJS.WriteStream,
        stdin: stdin as NodeJS.ReadStream,
        stdout: stdout as NodeJS.WriteStream
      }
    )

    instance.unmount()
    instance.cleanup()

    const rendered = stripAnsi(output)

    expect(rendered).toContain('Thinking')
    expect(rendered).not.toContain('step one')
    expect(rendered).not.toContain('step two')
  })

  it('keeps live thinking blocks expanded while streaming', () => {
    const stdout = new PassThrough()
    const stdin = new PassThrough()
    const stderr = new PassThrough()
    let output = ''

    Object.assign(stdout, { columns: 80, isTTY: false, rows: 24 })
    Object.assign(stdin, { isTTY: false })
    Object.assign(stderr, { isTTY: false })
    stdout.on('data', chunk => {
      output += chunk.toString()
    })

    const instance = renderSync(
      React.createElement(MessageLine, {
        cols: 80,
        liveDetails: true,
        msg: { kind: 'trail', role: 'system', text: '', thinking: 'step one\nstep two' },
        t: DEFAULT_THEME
      }),
      {
        patchConsole: false,
        stderr: stderr as NodeJS.WriteStream,
        stdin: stdin as NodeJS.ReadStream,
        stdout: stdout as NodeJS.WriteStream
      }
    )

    instance.unmount()
    instance.cleanup()

    const rendered = stripAnsi(output)

    expect(rendered).toContain('Thinking')
    expect(rendered).toContain('step one')
    expect(rendered).toContain('step two')
  })
})

describe('upsert', () => {
  it('appends when last role differs', () => {
    expect(upsert([{ role: 'user', text: 'hi' }], 'assistant', 'hello')).toHaveLength(2)
  })

  it('replaces when last role matches', () => {
    expect(upsert([{ role: 'assistant', text: 'partial' }], 'assistant', 'full')[0]!.text).toBe('full')
  })

  it('appends to empty', () => {
    expect(upsert([], 'user', 'first')).toEqual([{ role: 'user', text: 'first' }])
  })

  it('does not mutate', () => {
    const prev = [{ role: 'user' as const, text: 'hi' }]
    upsert(prev, 'assistant', 'yo')
    expect(prev).toHaveLength(1)
  })
})

describe('capTranscriptHistory', () => {
  it('keeps the intro and the newest bounded display rows', () => {
    const intro = { kind: 'intro' as const, role: 'system' as const, text: '' }
    const rows = Array.from({ length: 1_005 }, (_, index) => ({ role: 'user' as const, text: `m${index}` }))
    const capped = capTranscriptHistory([intro, ...rows])

    expect(capped).toHaveLength(MAX_HISTORY)
    expect(capped[0]).toBe(intro)
    expect(capped[1]?.text).toBe(`m${rows.length - (MAX_HISTORY - 1)}`)
    expect(capped.at(-1)?.text).toBe('m1004')
  })
})

describe('display.timestamps (#41531)', () => {
  it('formats a Unix-seconds timestamp as [HH:MM] and rejects garbage', () => {
    const noon = new Date()
    noon.setHours(13, 5, 0, 0)

    expect(fmtMsgTimestamp(noon.getTime() / 1000)).toBe('[13:05]')
    expect(fmtMsgTimestamp(undefined)).toBeNull()
    expect(fmtMsgTimestamp(0)).toBeNull()
    expect(fmtMsgTimestamp(Number.NaN)).toBeNull()
  })

  it('threads persisted transcript timestamps onto rehydrated rows', () => {
    const rows = [
      { role: 'user', text: 'when was this', timestamp: 1_750_000_000 },
      { role: 'assistant', text: 'right then', timestamp: 1_750_000_060 }
    ]

    const result = toTranscriptMessages(rows)
    expect(result[0]?.createdAt).toBe(1_750_000_000)
    expect(result[1]?.createdAt).toBe(1_750_000_060)
  })

  it('stamps live rows at append and preserves supplied times', () => {
    const before = Date.now() / 1000
    const [live] = appendTranscriptMessage([], { role: 'user', text: 'now' })

    expect(live?.createdAt).toBeGreaterThanOrEqual(before - 1)
    expect(live?.createdAt).toBeLessThanOrEqual(Date.now() / 1000 + 1)

    const [kept] = appendTranscriptMessage([], { createdAt: 123, role: 'user', text: 'then' })
    expect(kept?.createdAt).toBe(123)
  })
})
