import type { Theme } from '../theme.js'

export type Token = [string, string]

interface LangSpec {
  comment: null | string
  /** Additional whole-line comment openers (e.g. `;` for ini). */
  altComment?: string
  /** Block-comment delimiters, e.g. ['/*', '*&#47;'] — colored whole-line. */
  block?: [string, string]
  /** Preprocessor/directive opener colored as a keyword (`#include`). */
  directive?: string
  /** Keywords match case-insensitively (SQL). */
  ignoreCase?: boolean
  keywords: Set<string>
  /** Type/class names colored separately from control keywords. */
  types?: Set<string>
}

const KW = (s: string) => new Set(s.split(/\s+/).filter(Boolean))

const TS = KW(`
  abstract as async await break case catch class const continue debugger default delete do else enum export extends
  false finally for from function get if implements import in instanceof interface is let new null of package private
  protected public readonly return set static super switch this throw true try type typeof undefined var void while
  with yield
`)

const PY = KW(`
  False None True and as assert async await break class continue def del elif else except finally for from global if
  import in is lambda nonlocal not or pass raise return try while with yield
`)

const SH = KW(`
  if then else elif fi for in do done while until case esac function return break continue local export readonly
  declare typeset
`)

const GO = KW(`
  break case chan const continue default defer else fallthrough for func go goto if import interface map package range
  return select struct switch type var nil true false
`)

const RUST = KW(`
  as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut
  pub ref return self Self static struct super trait true type unsafe use where while yield
`)

const CPP = KW(`
  alignas alignof asm auto bool break case catch char char8_t char16_t char32_t class concept const consteval constexpr
  constinit const_cast continue co_await co_return co_yield decltype default delete do double dynamic_cast else enum
  explicit export extern false float for friend goto if inline int long mutable namespace new noexcept nullptr operator
  private protected public register reinterpret_cast requires return short signed sizeof static static_assert static_cast
  struct switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void
  volatile wchar_t while
`)

const SQL = KW(`
  select from where and or not in is null as by group order limit offset insert into values update set delete create
  table drop alter add column primary key foreign references join left right inner outer on
`)

const CMAKE = KW(`
  add_executable add_library add_subdirectory cmake_minimum_required else elseif endforeach endfunction endif endmacro
  endwhile find_package foreach function if include install list macro message option project return set set_target_properties
  string target_compile_definitions target_compile_features target_compile_options target_include_directories
  target_link_libraries while
`)

const MAKE = KW(`
  define else endef endif export ifdef ifeq ifndef ifneq include override unexport vpath
`)

const DOCKER = KW(`
  ADD ARG CMD COPY ENTRYPOINT ENV EXPOSE FROM HEALTHCHECK LABEL MAINTAINER ONBUILD RUN SHELL STOPSIGNAL USER VOLUME
  WORKDIR AS
`)

// --- type/class sets: colored separately from control keywords ---------------

const CPP_TYPES = KW(`
  bool char char8_t char16_t char32_t double float int long short signed unsigned void wchar_t size_t ssize_t
  int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t string vector map set unordered_map
  unordered_set optional variant array span shared_ptr unique_ptr weak_ptr pair tuple auto
`)

const PY_TYPES = KW(`
  bool bytes complex dict float frozenset int list object set str tuple type Any Callable Dict List Optional
  Sequence Set Tuple Union self cls
`)

const TS_TYPES = KW(`
  any bigint boolean never number object string symbol unknown void Array Promise Record Partial Readonly Map Set
  Date RegExp Error
`)

const GO_TYPES = KW(`
  bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16
  uint32 uint64 uintptr any
`)

const RUST_TYPES = KW(`
  bool char f32 f64 i8 i16 i32 i64 i128 isize str u8 u16 u32 u64 u128 usize String Vec Option Result Box Rc Arc
  HashMap HashSet BTreeMap
`)

const SQL_TYPES = KW(`
  bigint blob boolean char date datetime decimal double float int integer numeric real smallint text time
  timestamp uuid varchar
`)

const JAVA = KW(`
  abstract assert break case catch class const continue default do else enum extends final finally for goto if
  implements import instanceof interface native new package private protected public return static strictfp super
  switch synchronized this throw throws transient try volatile while true false null var record sealed yield
`)

const JAVA_TYPES = KW(`
  boolean byte char double float int long short void Boolean Byte Character Double Float Integer Long Object
  Short String List Map Set Optional Stream
`)

const CSHARP = KW(`
  abstract as async await base break case catch checked class const continue default delegate do else enum event
  explicit extern false finally fixed for foreach get goto if implicit in interface internal is lock namespace new
  null operator out override params private protected public readonly ref return sealed set sizeof stackalloc
  static switch this throw true try typeof unchecked unsafe using var virtual void volatile while record nameof
`)

const CSHARP_TYPES = KW(`
  bool byte char decimal double dynamic float int long object sbyte short string uint ulong ushort
  List Dictionary IEnumerable Task Nullable Span
`)

const RUBY = KW(`
  alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or
  redo rescue retry return self super then true undef unless until when while yield attr_accessor attr_reader
  attr_writer require require_relative
`)

const PHP = KW(`
  abstract and array as break callable case catch class clone const continue declare default do echo else elseif
  empty enddeclare endfor endforeach endif endswitch endwhile enum extends final finally fn for foreach function
  global goto if implements include include_once instanceof insteadof interface isset list match namespace new or
  print private protected public readonly require require_once return static switch throw trait try unset use var
  while xor yield true false null
`)

const LUA = KW(`
  and break do else elseif end false for function goto if in local nil not or repeat return then true until while
  self
`)

const PROTO = KW(`
  syntax package import option message enum service rpc returns repeated optional required reserved oneof map
  extend extensions stream public weak
`)

const PROTO_TYPES = KW(`
  bool bytes double fixed32 fixed64 float int32 int64 sfixed32 sfixed64 sint32 sint64 string uint32 uint64
`)

const LANGS: Record<string, LangSpec> = {
  cmake: { comment: '#', keywords: CMAKE, ignoreCase: true },
  cpp: { block: ['/*', '*/'], comment: '//', directive: '#', keywords: CPP, types: CPP_TYPES },
  csharp: { block: ['/*', '*/'], comment: '//', keywords: CSHARP, types: CSHARP_TYPES },
  css: { block: ['/*', '*/'], comment: null, keywords: KW('important from to') },
  dockerfile: { comment: '#', keywords: DOCKER, ignoreCase: true },
  go: { block: ['/*', '*/'], comment: '//', keywords: GO, types: GO_TYPES },
  // ini/conf: `;` is the classic opener (git config, systemd accept both).
  ini: { altComment: ';', comment: '#', keywords: KW('true false yes no on off') },
  java: { block: ['/*', '*/'], comment: '//', keywords: JAVA, types: JAVA_TYPES },
  json: { comment: null, keywords: KW('true false null') },
  lua: { block: ['--[[', ']]'], comment: '--', keywords: LUA },
  make: { comment: '#', keywords: MAKE },
  php: { block: ['/*', '*/'], comment: '//', keywords: PHP },
  proto: { block: ['/*', '*/'], comment: '//', keywords: PROTO, types: PROTO_TYPES },
  py: { comment: '#', keywords: PY, types: PY_TYPES },
  ruby: { comment: '#', keywords: RUBY },
  rust: { block: ['/*', '*/'], comment: '//', keywords: RUST, types: RUST_TYPES },
  sh: { comment: '#', keywords: SH },
  sql: { block: ['/*', '*/'], comment: '--', ignoreCase: true, keywords: SQL, types: SQL_TYPES },
  toml: { comment: '#', keywords: KW('true false') },
  ts: { block: ['/*', '*/'], comment: '//', keywords: TS, types: TS_TYPES },
  xml: { block: ['<!--', '-->'], comment: null, keywords: KW('') },
  yaml: { comment: '#', keywords: KW('true false null yes no on off') }
}

const ALIAS: Record<string, string> = {
  bash: 'sh',
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  h: 'cpp',
  hh: 'cpp',
  hpp: 'cpp',
  hxx: 'cpp',
  c: 'cpp',
  ino: 'cpp',
  cu: 'cpp',
  // rc-file diffs surface bare extensions: `.zshrc` → 'zshrc'
  bashrc: 'sh',
  zshrc: 'sh',
  profile: 'sh',
  bash_profile: 'sh',
  zprofile: 'sh',
  // config formats — one family, one spec
  cfg: 'ini',
  conf: 'ini',
  properties: 'ini',
  service: 'ini',
  desktop: 'ini',
  gitconfig: 'ini',
  editorconfig: 'ini',
  gitignore: 'ini',
  gitattributes: 'ini',
  gitmodules: 'ini',
  dockerignore: 'ini',
  npmrc: 'ini',
  env: 'ini',
  javascript: 'ts',
  js: 'ts',
  jsx: 'ts',
  mjs: 'ts',
  cjs: 'ts',
  mts: 'ts',
  cts: 'ts',
  makefile: 'make',
  mk: 'make',
  gnumakefile: 'make',
  containerfile: 'dockerfile',
  python: 'py',
  pyi: 'py',
  rs: 'rust',
  shell: 'sh',
  tsx: 'ts',
  typescript: 'ts',
  yml: 'yaml',
  zsh: 'sh',
  // CMake surfaces as `CMakeLists.txt` — extension `txt`, basename is the tell.
  cmakelists: 'cmake',
  // Qt / qmake project files (hlr_hub, HlrEmul, Imitator_PU are qmake builds)
  pro: 'make',
  pri: 'make',
  // ASN.1 schema files read as C-family well enough (comments `--`, types)
  asn: 'sql',
  asn1: 'sql',
  // additional languages
  cs: 'csharp',
  java: 'java',
  kt: 'java',
  kts: 'java',
  scala: 'java',
  groovy: 'java',
  gradle: 'java',
  swift: 'java',
  rb: 'ruby',
  ruby: 'ruby',
  gemfile: 'ruby',
  rakefile: 'ruby',
  php: 'php',
  lua: 'lua',
  proto: 'proto',
  html: 'xml',
  htm: 'xml',
  xhtml: 'xml',
  svg: 'xml',
  xsd: 'xml',
  plist: 'xml',
  ui: 'xml',
  qrc: 'xml',
  css: 'css',
  scss: 'css',
  less: 'css',
  jsonc: 'json',
  json5: 'json',
  ipynb: 'json',
  lock: 'json',
  // Terraform/HCL and Nix read close enough to ini/toml-ish key = value
  tf: 'toml',
  tfvars: 'toml',
  hcl: 'toml',
  nix: 'toml'
}

const resolve = (lang: string): LangSpec | null => LANGS[ALIAS[lang] ?? lang] ?? null

export const isHighlightable = (lang: string): boolean => resolve(lang) !== null

/** Strings, numbers (incl. hex/binary/float/exponent/suffix), identifiers,
 *  and operator/punctuation runs. Ordered so longer forms win. */
const TOKEN_RE =
  /"""[\s\S]*?"""|'''[\s\S]*?'''|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|\b0[xX][0-9a-fA-F']+[uUlLfF]*\b|\b0[bB][01']+[uUlL]*\b|\b\d[\d']*(?:\.\d[\d']*)?(?:[eE][+-]?\d+)?[uUlLfF]*\b|[A-Za-z_$][\w$]*|[()[\]{},;]|[-+*/%=<>!&|^~?:.]+/g

const PUNCT_RE = /^[()[\]{},;]$/
const OPERATOR_RE = /^[-+*/%=<>!&|^~?:.]+$/

/** Index of a comment opener that is NOT inside a string literal. */
const tailCommentAt = (line: string, opener: string): number => {
  let quote = ''

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!

    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = ''
      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      continue
    }

    if (line.startsWith(opener, i)) return i
  }

  return -1
}

export function highlightLine(line: string, lang: string, t: Theme): Token[] {
  const spec = resolve(lang)

  if (!spec) {
    return [['', line]]
  }

  const trimmed = line.trimStart()

  // Whole-line comments, including block-comment openers and the ` * ` bodies
  // of a wrapped block comment — previously these rendered as plain text.
  if (
    (spec.comment && trimmed.startsWith(spec.comment)) ||
    (spec.altComment && trimmed.startsWith(spec.altComment)) ||
    (spec.block && (trimmed.startsWith(spec.block[0]) || trimmed.startsWith('*') || trimmed.endsWith(spec.block[1])))
  ) {
    return [[t.color.syntaxComment, line]]
  }

  // Preprocessor directives (`#include`, `#define`) — the `#` is not a comment
  // opener in C/C++, so the whole directive used to render uncolored.
  if (spec.directive && trimmed.startsWith(spec.directive)) {
    const head = line.length - trimmed.length
    const end = line.indexOf(' ', head)
    const stop = end < 0 ? line.length : end

    return [
      ['', line.slice(0, head)],
      [t.color.syntaxKeyword, line.slice(head, stop)],
      ...(stop < line.length ? highlightLine(line.slice(stop), lang, t) : [])
    ]
  }

  // Split off a trailing comment (`x = 1  // why`) so its text is colored as a
  // comment instead of being tokenized as code. Quote-aware so a `//` or `#`
  // inside a string literal (URLs!) does not truncate the line.
  for (const opener of [spec.comment, spec.altComment]) {
    if (!opener) continue

    const at = tailCommentAt(line, opener)

    if (at > 0) {
      return [...highlightLine(line.slice(0, at), lang, t), [t.color.syntaxComment, line.slice(at)]]
    }
  }

  const tokens: Token[] = []
  let last = 0

  for (const m of line.matchAll(TOKEN_RE)) {
    const start = m.index ?? 0

    if (start > last) {
      tokens.push(['', line.slice(last, start)])
    }

    const tok = m[0]
    const ch = tok[0]!
    const key = spec.ignoreCase ? tok.toLowerCase() : tok

    if (ch === '"' || ch === "'" || ch === '`') {
      tokens.push([t.color.syntaxString, tok])
    } else if (ch >= '0' && ch <= '9') {
      tokens.push([t.color.syntaxNumber, tok])
    } else if (PUNCT_RE.test(tok)) {
      tokens.push([t.color.syntaxPunctuation, tok])
    } else if (OPERATOR_RE.test(tok)) {
      tokens.push([t.color.syntaxOperator, tok])
    } else if (spec.types?.has(key)) {
      // Types win over keywords: `int`/`bool`/`string` live in both sets, and
      // colouring them as types is what an editor palette does.
      tokens.push([t.color.syntaxType, tok])
    } else if (spec.keywords.has(key)) {
      tokens.push([t.color.syntaxKeyword, tok])
    } else if (line[start + tok.length] === '(') {
      // Identifier immediately followed by `(` is a call/definition site.
      tokens.push([t.color.syntaxFunction, tok])
    } else {
      tokens.push(['', tok])
    }

    last = start + tok.length
  }

  if (last < line.length) {
    tokens.push(['', line.slice(last)])
  }

  return tokens
}
