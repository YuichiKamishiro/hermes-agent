export type UnifiedDiffLineKind = 'add' | 'context' | 'hunk' | 'meta' | 'remove'

export interface UnifiedDiffLine {
  changed: null | [number, number]
  kind: UnifiedDiffLineKind
  marker: '' | ' ' | '+' | '-'
  /** 1-based line number on the OLD side (remove/context rows). */
  oldLine?: number
  /** 1-based line number on the NEW side (add/context rows). */
  newLine?: number
  text: string
}

export interface UnifiedDiff {
  /** Count of `+` content lines (excludes headers). */
  added: number
  /** Display path from the diff headers (`b/` side preferred), '' if none. */
  file: string
  language: string
  lines: UnifiedDiffLine[]
  /** Count of `-` content lines (excludes headers). */
  removed: number
}

const headerPath = (lines: string[]): string => {
  const header =
    lines.find(line => line.startsWith('+++ ') && !line.startsWith('+++ /dev/null')) ??
    lines.find(line => line.startsWith('--- ') && !line.startsWith('--- /dev/null'))

  return header?.replace(/^(?:---|\+\+\+)\s+/, '').split('\t', 1)[0]?.replace(/^[ab]\//, '') ?? ''
}

/** Basenames whose language is the NAME, not the extension — `CMakeLists.txt`
 *  is cmake (not txt), `Dockerfile.dev` is a Dockerfile (not "dev"). */
const BASENAME_LANG: Record<string, string> = {
  cmakelists: 'cmake',
  dockerfile: 'dockerfile',
  containerfile: 'dockerfile',
  makefile: 'makefile',
  gnumakefile: 'makefile',
  rakefile: 'rakefile',
  gemfile: 'gemfile',
  vagrantfile: 'ruby',
  jenkinsfile: 'groovy'
}

const diffLanguage = (path: string): string => {
  const name = path.split('/').at(-1) ?? ''
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')

  // Dotfiles (`.gitignore`, `.bashrc`) have no extension — the leading dot is
  // part of the name, so strip it and let the alias table match the stem.
  if (lower.startsWith('.') && lower.indexOf('.', 1) < 0) {
    return lower.slice(1)
  }

  // `CMakeLists.txt` / `Dockerfile.dev`: the stem carries the language, and a
  // suffix like `.txt`/`.dev`/`.in` would otherwise win and kill highlighting.
  const stem = dot >= 0 ? lower.slice(0, dot) : lower

  if (BASENAME_LANG[stem]) {
    return BASENAME_LANG[stem]
  }

  // Extensionless files (Makefile, Dockerfile) ARE their language — pass
  // the lowercased basename and let the highlighter's alias table decide.
  return dot >= 0 ? lower.slice(dot + 1) : lower
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/** Intraline highlight is only drawn when the changed span is at most this
 *  fraction of the line — beyond it the pair is a rewrite, not a token edit,
 *  and the strong background would flood the whole row. 0.75 keeps genuine
 *  multi-token edits (two changed tokens merge into one span via common
 *  prefix/suffix trimming) while dropping near-total rewrites. */
const INTRALINE_MAX_FRACTION = 0.75

const classifyLine = (line: string): UnifiedDiffLine => {
  if (line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('diff ') || line.startsWith('index ')) {
    return { changed: null, kind: 'meta', marker: '', text: line }
  }

  if (line.startsWith('@@')) {
    return { changed: null, kind: 'hunk', marker: '', text: line }
  }

  if (line.startsWith('+')) {
    return { changed: null, kind: 'add', marker: '+', text: line.slice(1) }
  }

  if (line.startsWith('-')) {
    return { changed: null, kind: 'remove', marker: '-', text: line.slice(1) }
  }

  if (line.startsWith(' ')) {
    return { changed: null, kind: 'context', marker: ' ', text: line.slice(1) }
  }

  return { changed: null, kind: 'meta', marker: '', text: line }
}

/**
 * Walk the classified lines assigning old/new line numbers from each `@@`
 * hunk header (context advances both counters, remove only the old one, add
 * only the new one — standard unified-diff semantics). Lines before the
 * first hunk header stay unnumbered.
 */
const assignLineNumbers = (lines: UnifiedDiffLine[]) => {
  let oldLn: number | undefined
  let newLn: number | undefined

  for (const line of lines) {
    if (line.kind === 'hunk') {
      const m = HUNK_RE.exec(line.text)

      oldLn = m ? Number(m[1]) : undefined
      newLn = m ? Number(m[2]) : undefined

      continue
    }

    if (line.kind === 'meta' || oldLn === undefined || newLn === undefined) {
      continue
    }

    if (line.kind === 'context') {
      line.oldLine = oldLn++
      line.newLine = newLn++
    } else if (line.kind === 'remove') {
      line.oldLine = oldLn++
    } else if (line.kind === 'add') {
      line.newLine = newLn++
    }
  }
}

const changedRange = (left: string, right: string): [[number, number] | null, [number, number] | null] => {
  let prefix = 0

  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) {
    prefix++
  }

  if (prefix === left.length && prefix === right.length) {
    return [null, null]
  }

  let suffix = 0

  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) {
    suffix++
  }

  return [
    [prefix, left.length - suffix],
    [prefix, right.length - suffix]
  ]
}

const annotateChangedRuns = (lines: UnifiedDiffLine[]) => {
  for (let i = 0; i < lines.length; ) {
    if (lines[i]?.kind !== 'remove') {
      i++
      continue
    }

    const removed: UnifiedDiffLine[] = []
    const added: UnifiedDiffLine[] = []

    while (lines[i]?.kind === 'remove') {
      removed.push(lines[i]!)
      i++
    }

    while (lines[i]?.kind === 'add') {
      added.push(lines[i]!)
      i++
    }

    const pairs = Math.min(removed.length, added.length)

    for (let j = 0; j < pairs; j++) {
      const [removedRange, addedRange] = changedRange(removed[j]!.text, added[j]!.text)

      // Intraline only earns its strong background when the changed span is
      // a MINORITY of the line — a focused token edit. When most of the line
      // differs (a rewrite, not a tweak), the highlight would flood the row
      // with the bright tint and read as inconsistent add/remove colors
      // between neighbouring rows (delta/difftastic skip these too).
      const focused = (range: [number, number] | null, text: string) =>
        range !== null && text.length > 0 && (range[1] - range[0]) / text.length <= INTRALINE_MAX_FRACTION

      if (focused(removedRange, removed[j]!.text) && focused(addedRange, added[j]!.text)) {
        removed[j]!.changed = removedRange
        added[j]!.changed = addedRange
      }
    }
    // Leftover un-paired lines keep the weak line-level tint only. Painting
    // them with the strong intraline background made runs like `-2 +3` show
    // one solid-bright row among pale ones — perceived as the diff colors
    // "changing randomly" between lines.
  }
}

export function annotateUnifiedDiff(source: string[]): UnifiedDiff {
  const lines = source.map(classifyLine)

  assignLineNumbers(lines)
  annotateChangedRuns(lines)

  const file = headerPath(source)

  return {
    added: lines.filter(line => line.kind === 'add').length,
    file,
    language: diffLanguage(file),
    lines,
    removed: lines.filter(line => line.kind === 'remove').length
  }
}
