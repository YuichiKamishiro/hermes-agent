import { describe, expect, it } from 'vitest'

import { highlightLine, isHighlightable } from '../lib/syntax.js'
import { DEFAULT_THEME } from '../theme.js'

const t = DEFAULT_THEME

describe('syntax highlighter', () => {
  it('recognizes supported langs and aliases', () => {
    expect(isHighlightable('ts')).toBe(true)
    expect(isHighlightable('js')).toBe(true)
    expect(isHighlightable('python')).toBe(true)
    expect(isHighlightable('rs')).toBe(true)
    expect(isHighlightable('bash')).toBe(true)
    expect(isHighlightable('whatever')).toBe(false)
    expect(isHighlightable('')).toBe(false)
  })

  it('covers the daily config/dotfile formats (toml, ini/conf, rc files)', () => {
    // Cargo.toml / .cargo/config.toml
    expect(isHighlightable('toml')).toBe(true)
    // systemd units, git config, editorconfig…
    expect(isHighlightable('ini')).toBe(true)
    expect(isHighlightable('conf')).toBe(true)
    expect(isHighlightable('cfg')).toBe(true)
    // diff of a dotfile: `.zshrc` extension-parses to 'zshrc'
    expect(isHighlightable('zshrc')).toBe(true)
    expect(isHighlightable('bashrc')).toBe(true)
    // fence labels seen constantly in agent output
    expect(isHighlightable('cmake')).toBe(true)
    expect(isHighlightable('makefile')).toBe(true)
    expect(isHighlightable('dockerfile')).toBe(true)
  })

  it('paints `;` comments in ini and `#` comments in toml', () => {
    expect(highlightLine('; legacy comment', 'ini', t)).toEqual([[t.color.syntaxComment, '; legacy comment']])
    expect(highlightLine('# section note', 'ini', t)).toEqual([[t.color.syntaxComment, '# section note']])
    expect(highlightLine('# build deps', 'toml', t)).toEqual([[t.color.syntaxComment, '# build deps']])
  })

  it('highlights toml strings and numbers', () => {
    const tokens = highlightLine('name = "x_builder" # lib', 'toml', t)
    const colors = tokens.map(tok => tok[0])

    expect(colors).toContain(t.color.syntaxString) // "x_builder"
  })

  it('paints a whole-line comment with the comment token', () => {
    const tokens = highlightLine('// hello', 'ts', t)

    // Assert against the SEMANTIC token, not a brand colour: syntax defaults
    // are now an editor palette (GitHub Dark/Light), independent of muted.
    expect(tokens).toEqual([[t.color.syntaxComment, '// hello']])
  })

  it('paints keywords, strings, and numbers in a ts line', () => {
    const tokens = highlightLine(`const x = 'hi' + 42`, 'ts', t)
    const colors = tokens.map(tok => tok[0])

    expect(colors).toContain(t.color.syntaxKeyword) // const
    expect(colors).toContain(t.color.syntaxString) // 'hi'
    expect(colors).toContain(t.color.syntaxNumber) // 42
  })

  it('falls through unchanged for unknown langs', () => {
    const tokens = highlightLine(`const x = 1`, 'zzz', t)

    expect(tokens).toEqual([['', 'const x = 1']])
  })

  it('treats `#` as a python comment, not a selector', () => {
    const tokens = highlightLine('# comment', 'py', t)

    expect(tokens).toEqual([[t.color.syntaxComment, '# comment']])
  })
})
