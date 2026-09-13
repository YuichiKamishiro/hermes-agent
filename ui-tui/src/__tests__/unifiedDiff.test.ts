import { describe, expect, it } from 'vitest'

import { annotateUnifiedDiff } from '../lib/unifiedDiff.js'

describe('annotateUnifiedDiff', () => {
  it('infers the language and isolates the changed span in paired lines', () => {
    const diff = annotateUnifiedDiff([
      '--- a/src/config.cpp',
      '+++ b/src/config.cpp',
      '@@ -1 +1 @@',
      '-const auto timeout = 1000;',
      '+constexpr auto timeout = 1500;'
    ])
    const removed = diff.lines[3]!
    const added = diff.lines[4]!

    expect(diff.language).toBe('cpp')
    expect(diff.lines.slice(0, 2).map(line => line.kind)).toEqual(['meta', 'meta'])
    expect(removed.kind).toBe('remove')
    expect(added.kind).toBe('add')
    expect(removed.changed && removed.text.slice(...removed.changed)).toBe(' auto timeout = 10')
    expect(added.changed && added.text.slice(...added.changed)).toBe('expr auto timeout = 15')
  })

  it('leaves a whole new file (add-only run, no paired removal) on the weak background', () => {
    // write_file / a brand-new file: every line is `+` with nothing removed.
    // This is new content, not an in-place edit — it must NOT get the strong
    // intraline background, or the whole file "shouts" instead of a quiet
    // uniform add tint (the bug: previously every unpaired `+` line was
    // marked fully changed, painting entire new files loudly).
    const diff = annotateUnifiedDiff(['@@ -0,0 +1,2 @@', '+int result = 42;', '+return result;'])

    expect(diff.lines.map(line => [line.kind, line.changed])).toEqual([
      ['hunk', null],
      ['add', null],
      ['add', null]
    ])
  })

  it('leaves leftover unpaired lines of a mixed run on the weak background', () => {
    // A run with SOME real -/+ pairs plus extra unpaired lines (2 removed,
    // 3 added). Painting the leftover line fully changed produced a solid
    // bright-green row next to pale-tint rows — read as \"the green keeps
    // changing\" (user report). Leftovers now stay on the weak line tint;
    // the strong background is reserved for genuinely paired fragments.
    const diff = annotateUnifiedDiff(['@@ -1,2 +1,3 @@', '-old_a', '-old_b', '+new_a', '+new_b', '+new_c'])
    const extra = diff.lines[5]!

    expect(extra.kind).toBe('add')
    expect(extra.text).toBe('new_c')
    expect(extra.changed).toBeNull()
  })

  it('skips intraline entirely for a mostly-rewritten pair (dissimilar lines)', () => {
    // When the changed span covers almost the whole line, intraline carries
    // no information — it just paints the full row bright (another \"green\
    // changes randomly\" source). Standard delta/difftastic behaviour: no
    // intraline for dissimilar pairs.
    const diff = annotateUnifiedDiff(['@@ -1 +1 @@', '-aaaa bbbb cccc', '+zzzz yyyy xxxx'])

    expect(diff.lines[1]!.changed).toBeNull()
    expect(diff.lines[2]!.changed).toBeNull()
  })

  it('keeps context and hunk lines free of intraline ranges', () => {
    const diff = annotateUnifiedDiff(['@@ -1 +1 @@', ' unchanged'])

    expect(diff.lines.map(line => [line.kind, line.changed])).toEqual([
      ['hunk', null],
      ['context', null]
    ])
  })

  it('extracts the file name and add/remove counts for the header line', () => {
    // Codex/Claude-Code-style header: `Update(file) +N -M` replaces the raw
    // `--- a/x` / `+++ b/x` rows, so the parser must surface the display
    // file name and the counts.
    const diff = annotateUnifiedDiff([
      '--- a/src/session.cpp',
      '+++ b/src/session.cpp',
      '@@ -4,3 +4,4 @@',
      ' int f() {',
      '-  int t = 1;',
      '+  int t = 2;',
      '+  int u = 3;',
      ' }'
    ])

    expect(diff.file).toBe('src/session.cpp')
    expect(diff.added).toBe(2)
    expect(diff.removed).toBe(1)
  })

  it('assigns old/new line numbers from the hunk header', () => {
    // `@@ -4,2 +4,3 @@` means: old side starts at 4, new side starts at 4.
    // Context advances both; remove advances old only; add advances new only.
    const diff = annotateUnifiedDiff([
      '@@ -4,2 +4,3 @@',
      ' int f() {',
      '-  int t = 1;',
      '+  int t = 2;',
      '+  int u = 3;',
      ' }'
    ])

    expect(diff.lines.map(line => [line.kind, line.oldLine ?? null, line.newLine ?? null])).toEqual([
      ['hunk', null, null],
      ['context', 4, 4],
      ['remove', 5, null],
      ['add', null, 5],
      ['add', null, 6],
      ['context', 6, 7]
    ])
  })

  it('resets line numbering at each new hunk header', () => {
    const diff = annotateUnifiedDiff(['@@ -1 +1 @@', '-a', '+b', '@@ -50,1 +50,2 @@', ' ctx', '+added'])

    expect(diff.lines.map(line => [line.kind, line.oldLine ?? null, line.newLine ?? null])).toEqual([
      ['hunk', null, null],
      ['remove', 1, null],
      ['add', null, 1],
      ['hunk', null, null],
      ['context', 50, 50],
      ['add', null, 51]
    ])
  })

  it('reports a new file as its +++ name with pure add counts', () => {
    const diff = annotateUnifiedDiff(['--- /dev/null', '+++ b/tools/probe.py', '@@ -0,0 +1,2 @@', '+x = 1', '+y = 2'])

    expect(diff.file).toBe('tools/probe.py')
    expect(diff.added).toBe(2)
    expect(diff.removed).toBe(0)
  })
})
