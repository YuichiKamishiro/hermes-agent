import { describe, expect, it } from 'vitest'
import { highlightLine } from '../lib/syntax.js'
import { annotateUnifiedDiff } from '../lib/unifiedDiff.js'

const t: any = {
  color: {
    syntaxComment: 'CMT',
    syntaxFunction: 'FN',
    syntaxKeyword: 'KW',
    syntaxNumber: 'NUM',
    syntaxOperator: 'OP',
    syntaxPunctuation: 'PUN',
    syntaxString: 'STR',
    syntaxType: 'TYPE'
  }
}

/** A real `git diff` of a CMakeLists.txt — the case that used to render flat. */
const CMAKE_DIFF = [
  'diff --git a/CMakeLists.txt b/CMakeLists.txt',
  'index c3e1451..bbfcbe3 100644',
  '--- a/CMakeLists.txt',
  '+++ b/CMakeLists.txt',
  '@@ -1,3 +1,4 @@',
  '-cmake_minimum_required(VERSION 3.20)',
  '+cmake_minimum_required(VERSION 3.25)',
  ' project(demo)',
  '-set(CMAKE_CXX_STANDARD 20)',
  '+set(CMAKE_CXX_STANDARD 23)',
  '+add_executable(demo main.cpp)'
]

describe('diff → highlight (end to end)', () => {
  it('detects cmake from CMakeLists.txt and colours its content lines', () => {
    const diff = annotateUnifiedDiff(CMAKE_DIFF)

    expect(diff.file).toBe('CMakeLists.txt')
    expect(diff.language).toBe('cmake')
    expect(diff.added).toBe(3)
    expect(diff.removed).toBe(2)

    // Every content row must yield at least one coloured token — the whole
    // point of the fix (this diff previously highlighted nothing at all).
    for (const line of diff.lines.filter(l => l.kind === 'add' || l.kind === 'remove')) {
      const colored = highlightLine(line.text, diff.language, t).filter(([c]) => c !== '')
      expect(colored.length, line.text).toBeGreaterThan(0)
    }
  })

  it('keeps line numbers aligned with the hunk header', () => {
    const diff = annotateUnifiedDiff(CMAKE_DIFF)
    const ctx = diff.lines.find(l => l.kind === 'context')

    expect(ctx?.oldLine).toBe(2)
    expect(ctx?.newLine).toBe(2)
  })

  it('highlights a C++ diff body including tail comments', () => {
    const diff = annotateUnifiedDiff([
      '--- a/src/main.cpp',
      '+++ b/src/main.cpp',
      '@@ -1,2 +1,2 @@',
      '-    int n = 10;   // old',
      '+    auto n = 0xFF; // new'
    ])

    expect(diff.language).toBe('cpp')

    const added = diff.lines.find(l => l.kind === 'add')!
    const tokens = highlightLine(added.text, diff.language, t)

    expect(tokens.some(([c, s]) => c === 'NUM' && s === '0xFF')).toBe(true)
    expect(tokens.some(([c, s]) => c === 'CMT' && s.includes('// new'))).toBe(true)
  })

  it('still highlights when the diff has no index/diff header lines', () => {
    // `patch`-style diffs (no `diff --git`) are what the backend often sends.
    const diff = annotateUnifiedDiff(['--- a/x.py', '+++ b/x.py', '@@ -1 +1 @@', '-a = 1', '+a = 2  # bump'])

    expect(diff.language).toBe('py')
    const added = diff.lines.find(l => l.kind === 'add')!
    expect(highlightLine(added.text, diff.language, t).some(([c]) => c === 'CMT')).toBe(true)
  })
})
