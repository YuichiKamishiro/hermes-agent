import { describe, expect, it } from 'vitest'
import { highlightLine, isHighlightable } from '../lib/syntax.js'
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

/** Colour assigned to the first occurrence of `needle`, or '' when plain. */
const colorOf = (line: string, lang: string, needle: string): string => {
  for (const [color, text] of highlightLine(line, lang, t)) {
    if (text.includes(needle)) return color
  }
  return '<absent>'
}

const langOf = (path: string) =>
  annotateUnifiedDiff([`--- a/${path}`, `+++ b/${path}`, '@@ -1 +1 @@', '-x', '+y']).language

describe('diff language detection', () => {
  it('maps extensions to highlightable languages', () => {
    for (const p of ['src/main.cpp', 'a.hpp', 'x.cc', 'm.py', 'r.sh', 'c.yaml', 'p.json', 'C.toml', 'm.rs', 'm.go', 'i.ts', 'i.tsx', 'q.sql']) {
      expect(isHighlightable(langOf(p)), p).toBe(true)
    }
  })

  it('resolves basename-is-the-language files, ignoring a misleading suffix', () => {
    // Regression: CMakeLists.txt resolved to "txt" and lost all highlighting.
    expect(langOf('CMakeLists.txt')).toBe('cmake')
    expect(langOf('cmake/CMakeLists.txt')).toBe('cmake')
    expect(langOf('Dockerfile')).toBe('dockerfile')
    expect(langOf('Dockerfile.dev')).toBe('dockerfile')
    expect(langOf('Makefile')).toBe('makefile')
    for (const p of ['CMakeLists.txt', 'Dockerfile.dev', 'Makefile']) {
      expect(isHighlightable(langOf(p)), p).toBe(true)
    }
  })

  it('resolves dotfiles by stem', () => {
    expect(langOf('.gitignore')).toBe('gitignore')
    expect(langOf('.bashrc')).toBe('bashrc')
    for (const p of ['.gitignore', '.bashrc', '.editorconfig']) {
      expect(isHighlightable(langOf(p)), p).toBe(true)
    }
  })

  it('covers the languages in this user\'s repos', () => {
    // qmake (.pro/.pri) and ASN.1 schemas show up in every LI project diff.
    for (const p of ['hlr_hub.pro', 'common.pri', 'huawei_x1.asn', 'App.cs', 'Main.java', 'index.php', 'main.lua', 'schema.proto', 'style.css', 'index.html']) {
      expect(isHighlightable(langOf(p)), p).toBe(true)
    }
  })

  it('treats prose as non-code', () => {
    for (const p of ['README.md', 'notes.txt']) {
      expect(isHighlightable(langOf(p)), p).toBe(false)
    }
  })
})

describe('comments', () => {
  it('colours trailing comments, not just whole-line ones', () => {
    // Regression: tail comments were left uncoloured in every language.
    expect(colorOf('int x = 5; // why', 'cpp', '// why')).toBe('CMT')
    expect(colorOf('x = 5  # why', 'py', '# why')).toBe('CMT')
    expect(colorOf('SELECT 1 -- why', 'sql', '-- why')).toBe('CMT')
    expect(colorOf('key: val # why', 'yaml', '# why')).toBe('CMT')
  })

  it('keeps code before a trailing comment highlighted', () => {
    expect(colorOf('int x = 5; // why', 'cpp', 'int')).toBe('TYPE')
    expect(colorOf('int x = 5; // why', 'cpp', '5')).toBe('NUM')
  })

  it('does not treat a comment opener inside a string as a comment', () => {
    // Regression guard: URLs would truncate the rest of the line.
    expect(colorOf('const u = "http://x.dev/a"', 'ts', '"http://x.dev/a"')).toBe('STR')
    expect(colorOf("s = 'a # b'", 'py', "'a # b'")).toBe('STR')
  })

  it('colours block comments and their continuation lines', () => {
    expect(colorOf('/* note */', 'cpp', '/* note */')).toBe('CMT')
    expect(colorOf(' * continued', 'cpp', '* continued')).toBe('CMT')
    expect(colorOf('  }; */', 'cpp', '*/')).toBe('CMT')
  })

  it('colours whole-line comments', () => {
    expect(colorOf('# note', 'py', '# note')).toBe('CMT')
    expect(colorOf('; ini style', 'ini', '; ini style')).toBe('CMT')
  })
})

describe('tokens', () => {
  it('recognises hex, binary, float and suffixed numbers', () => {
    // Regression: only bare decimals were recognised, so 0xFF read as plain.
    expect(colorOf('x = 0xFF', 'ts', '0xFF')).toBe('NUM')
    expect(colorOf('x = 0b1010', 'cpp', '0b1010')).toBe('NUM')
    expect(colorOf('x = 1.5e-3', 'cpp', '1.5e-3')).toBe('NUM')
    expect(colorOf('x = 10u', 'cpp', '10u')).toBe('NUM')
  })

  it('colours strings', () => {
    expect(colorOf('s = "hi"', 'cpp', '"hi"')).toBe('STR')
    expect(colorOf("s = 'hi'", 'py', "'hi'")).toBe('STR')
  })

  it('keeps a python docstring as one string token', () => {
    // Regression: """doc""" was split into three separate string tokens.
    expect(colorOf('"""doc"""', 'py', '"""doc"""')).toBe('STR')
  })

  it('separates types from control keywords', () => {
    expect(colorOf('int x = 0;', 'cpp', 'int')).toBe('TYPE')
    expect(colorOf('return x;', 'cpp', 'return')).toBe('KW')
    expect(colorOf('let v: Vec<u8>', 'rust', 'Vec')).toBe('TYPE')
  })

  it('colours call sites as functions', () => {
    expect(colorOf('compute(x)', 'cpp', 'compute')).toBe('FN')
    expect(colorOf('def compute(x):', 'py', 'compute')).toBe('FN')
  })

  it('colours operators and punctuation', () => {
    expect(colorOf('a => b', 'ts', '=>')).toBe('OP')
    expect(colorOf('f(a, b)', 'ts', ',')).toBe('PUN')
  })

  it('matches SQL keywords case-insensitively', () => {
    // Regression: uppercase SELECT/FROM (the common style) went uncoloured.
    expect(colorOf('SELECT id FROM t', 'sql', 'SELECT')).toBe('KW')
    expect(colorOf('SELECT id FROM t', 'sql', 'FROM')).toBe('KW')
    expect(colorOf('select id from t', 'sql', 'select')).toBe('KW')
  })

  it('colours C/C++ preprocessor directives', () => {
    // Regression: `#` is not a C++ comment opener, so directives were plain.
    expect(colorOf('#include <vector>', 'cpp', '#include')).toBe('KW')
    expect(colorOf('  #define MAX 10', 'cpp', '#define')).toBe('KW')
    expect(colorOf('#define MAX 10', 'cpp', '10')).toBe('NUM')
  })

  it('leaves unknown languages untouched', () => {
    expect(highlightLine('anything at all', 'md', t)).toEqual([['', 'anything at all']])
  })
})
