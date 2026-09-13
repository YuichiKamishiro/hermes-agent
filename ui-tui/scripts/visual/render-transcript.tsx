/* Transcript visual harness: renders real MessageLine scenes (user bubble,
 * assistant card, markdown, cpp + diff fences) to tui-visual.html so the
 * design can be eyeballed/agent-reviewed. Sibling of render.tsx — same
 * helpers, different scenes. Run: npx tsx scripts/visual/render-transcript.tsx
 * then the electron shot (scripts/visual/shot.mjs). */
process.env.FORCE_COLOR = '3'
process.env.COLORTERM = 'truecolor'

import '../../src/lib/forceTruecolor.js'

import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { PassThrough } from 'stream'

import { visualOutDir } from './paths.mjs'

import { Box, renderSync } from '@hermes/ink'
import chalk from 'chalk'
import React, { type ReactElement } from 'react'

import { ToolTrail } from '../../src/components/thinking.js'
import { MessageLine } from '../../src/components/messageLine.js'
import { buildVerboseToolTrailLine } from '../../src/lib/text.js'
import { fromSkin, type Theme } from '../../src/theme.js'
import type { Msg } from '../../src/types.js'

const noop = () => {}

function renderAnsi(node: ReactElement, columns: number): string {
  chalk.level = 3

  const stdout = new PassThrough()
  const stdin = new PassThrough()
  const stderr = new PassThrough()

  let output = ''

  ;(process.stdout as unknown as { columns: number }).columns = columns
  Object.assign(stdout, { columns, isTTY: true, rows: 60 })
  Object.assign(stdin, {
    isTTY: true,
    pause: noop,
    ref: noop,
    resume: noop,
    setEncoding: noop,
    setRawMode: noop,
    unref: noop
  })
  Object.assign(stderr, { isTTY: false })
  stdout.on('data', chunk => {
    output += chunk.toString()
  })

  const instance = renderSync(<Box flexDirection="column" width={columns}>{node}</Box>, {
    exitOnCtrlC: false,
    patchConsole: false,
    stderr: stderr as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream
  })

  instance.unmount()
  instance.cleanup()

  return output
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function ansiToHtml(raw: string, defaultFg: string, defaultBg: string): string {
  let fg = defaultFg
  let bg = defaultBg
  let bold = false
  let dim = false
  let italic = false
  let inverse = false
  let html = ''

  const openSpan = () => {
    const f = inverse ? bg : fg
    const b = inverse ? fg : bg
    const styles = [`color:${f}`]

    if (b !== defaultBg || inverse) {
      styles.push(`background-color:${b}`)
    }

    if (bold) {
      styles.push('font-weight:bold')
    }

    if (dim) {
      styles.push('opacity:0.55')
    }

    if (italic) {
      styles.push('font-style:italic')
    }

    return `<span style="${styles.join(';')}">`
  }

  // eslint-disable-next-line no-control-regex
  const parts = raw.split(/(\x1b\[[0-9;]*m)/)

  html += openSpan()

  for (const part of parts) {
    // eslint-disable-next-line no-control-regex
    const m = /^\x1b\[([0-9;]*)m$/.exec(part)

    if (!m) {
      // eslint-disable-next-line no-control-regex
      const positioned = part.replace(/\x1b\[(\d*)C/g, (_, count: string) => ' '.repeat(Number(count) || 1))
      html += escapeHtml(positioned.replace(/\x1b\[[?0-9;]*[A-Za-z]/g, ''))

      continue
    }

    const codes = (m[1] || '0').split(';').map(Number)

    for (let i = 0; i < codes.length; i++) {
      const c = codes[i]!
      if (c === 0) {
        fg = defaultFg
        bg = defaultBg
        bold = dim = italic = inverse = false
      } else if (c === 1) {bold = true}
      else if (c === 2) {dim = true}
      else if (c === 3) {italic = true}
      else if (c === 7) {inverse = true}
      else if (c === 22) { bold = false; dim = false }
      else if (c === 23) {italic = false}
      else if (c === 27) {inverse = false}
      else if (c === 39) {fg = defaultFg}
      else if (c === 49) {bg = defaultBg}
      else if (c === 38 && codes[i + 1] === 2) {
        fg = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`
        i += 4
      } else if (c === 48 && codes[i + 1] === 2) {
        bg = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`
        i += 4
      }
    }

    html += `</span>${openSpan()}`
  }

  return html + '</span>'
}

// ── Changed surfaces only ──

const DIFF: Msg = {
  kind: 'diff',
  role: 'assistant',
  text: [
    '```diff',
    '--- a/src/session.cpp',
    '+++ b/src/session.cpp',
    '@@ -41,5 +41,5 @@ Result Session::connect()',
    '   const auto liid = request.liid();',
    '-  const auto timeout = 1000;',
    '+  const auto timeout = 1500;',
    '   return transport.connect(liid, timeout);',
    '```'
  ].join('\n')
}

const TRAIL = [
  buildVerboseToolTrailLine(
    'patch',
    'Update ui-tui/src/components/markdown.tsx',
    false,
    0.21,
    'Applied unified-diff renderer with intraline highlighting'
  ),
  buildVerboseToolTrailLine(
    'terminal',
    'npx vitest run src/__tests__/markdown.test.ts',
    false,
    2.43,
    'Test Files 7 passed (7); Tests 72 passed (72); long output wraps instead of disappearing'
  )
]

// Exact Sisyphus palette plus the six scoped keys under review. The terminal
// background is a harness input only; the production skin has no background.
const SISYPHUS = {
  banner_border: '#B7B7B7',
  banner_title: '#F5F5F5',
  banner_accent: '#E7E7E7',
  banner_dim: '#5C5C5C',
  banner_text: '#D3D3D3',
  ui_accent: '#E7E7E7',
  ui_label: '#D3D3D3',
  ui_tool: '#58A6FF',
  ui_ok: '#919191',
  ui_error: '#E7E7E7',
  ui_warn: '#B7B7B7',
  prompt: '#F5F5F5',
  input_rule: '#656565',
  response_border: '#B7B7B7',
  completion_menu_bg: '#202020',
  completion_menu_current_bg: '#585858',
  selection_bg: '#666666',
  diff_added: '#10261A',
  diff_removed: '#321B1F',
  diff_added_word: '#1F6F3F',
  diff_removed_word: '#7A2E36',
  syntax_keyword: '#B98CE0',
  syntax_string: '#D9B36B',
  syntax_number: '#7FB3D9',
  syntax_comment: '#7A7A7A'
}

interface Scene {
  bg: string
  name: string
  skin: Record<string, string>
}

const scenes: Scene[] = [
  { bg: '#101014', name: 'Sisyphus · scoped diff + Tool calls', skin: SISYPHUS }
]

let page = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#666;font:13px/1.35 Menlo,monospace"><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px">`

const outDir = visualOutDir()
mkdirSync(outDir, { recursive: true })

for (const scene of scenes) {
  process.env.HERMES_TUI_BACKGROUND = scene.bg
  const theme: Theme = fromSkin(scene.skin, {})

  const transcript = renderAnsi(
    <Box flexDirection="column">
      <MessageLine cols={86} msg={DIFF} t={theme} />
      <ToolTrail detailsMode="expanded" t={theme} trail={TRAIL} />
    </Box>,
    88
  )

  page += `<div style="background:${scene.bg};color:${theme.color.text};padding:14px;border-radius:6px">`
  page += `<div style="font:bold 12px sans-serif;opacity:.6;margin-bottom:8px">${scene.name}</div>`
  page += `<pre style="margin:0;white-space:pre">${ansiToHtml(transcript, theme.color.text, scene.bg)}</pre>`
  page += `</div>`

  // Raw ANSI per scene — the pyte+PIL rasterizer turns these into PNGs
  // without needing a browser.
  writeFileSync(join(outDir, `scene_${scene.name[0]}.ansi`), transcript)
  writeFileSync(
    join(outDir, `scene_${scene.name[0]}.meta.json`),
    JSON.stringify({ bg: scene.bg, fg: theme.color.text, name: scene.name })
  )
}

page += '</div></body>'

const outFile = join(outDir, 'tui-visual.html')
writeFileSync(outFile, page)
console.log(`wrote ${outFile}`)
process.exit(0)
