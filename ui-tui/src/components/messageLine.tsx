import { Ansi, Box, NoSelect, Text } from '@hermes/ink'
import { memo, useState } from 'react'

import { TERMUX_TUI_MODE } from '../config/env.js'
import { LONG_MSG } from '../config/limits.js'
import { hasLeadGap } from '../domain/blockLayout.js'
import { splitComposerHighlights } from '../domain/composerHighlights.js'
import { sectionMode } from '../domain/details.js'
import { userDisplayParts } from '../domain/messages.js'
import { ROLE } from '../domain/roles.js'
import { transcriptBodyWidth, transcriptGutterWidth } from '../lib/inputMetrics.js'
import {
  boundedLiveRenderText,
  hasAnsi,
  isPasteBackedText,
  sanitizeAnsiForRender
} from '../lib/text.js'
import type { Theme } from '../theme.js'
import type { ActiveTool, DetailsMode, Msg, SectionVisibility } from '../types.js'

import { Md } from './markdown.js'
import { StreamingMd } from './streamingMarkdown.js'
import { ToolTrail } from './thinking.js'
import { TodoPanel } from './todoPanel.js'

// Collapse threshold for long system messages (system prompt etc.)
const SYSTEM_COLLAPSE_CHARS = 400

// `display.timestamps` label — same HH:MM shape the classic CLI's default
// `display.timestamp_format` ("%H:%M") produces on its message labels, so
// one config key reads identically across surfaces (#41531).
export const fmtMsgTimestamp = (createdAt: number | undefined): null | string => {
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt) || createdAt <= 0) {
    return null
  }

  const date = new Date(createdAt * 1000)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')

  return `[${hh}:${mm}]`
}

export const MessageLine = memo(function MessageLine({
  cols,
  compact,
  detailsMode = 'collapsed',
  detailsModeCommandOverride = false,
  isStreaming = false,
  liveDetails = false,
  msg,
  prev,
  reasoningActive = false,
  sections,
  t,
  timestamps = false,
  tools = []
}: MessageLineProps) {
  // Per-section overrides win over the global mode, so resolve each section
  // we might consume here once and gate visibility on the *content-bearing*
  // sections only — never on the global mode.  A `trail` message feeds Tool
  // calls + Activity; an assistant message with thinking/tools metadata
  // feeds Thinking + Tool calls.  Gating on every section would let
  // `thinking` (expanded by default) keep an empty wrapper alive when only
  // `tools` is hidden — exactly the empty-Box bug Copilot caught.
  const thinkingMode = sectionMode('thinking', detailsMode, sections, detailsModeCommandOverride)
  const toolsMode = sectionMode('tools', detailsMode, sections, detailsModeCommandOverride)
  const activityMode = sectionMode('activity', detailsMode, sections, detailsModeCommandOverride)
  const thinking = msg.thinking?.trim() ?? ''

  // One blank line above this block iff it opens a new visual group relative
  // to the block directly above it (`prev`) — the flex-grouping rule. Applied
  // intrinsically on each *rendered* element (not via an outer wrapper) so a
  // block that renders nothing — e.g. a tool trail hidden by /details — emits
  // no floating gap. Streaming-safe: the gap is derived from the stable
  // predecessor, never this block's own live content. See domain/blockLayout.
  const leadGap = hasLeadGap(prev, msg)

  // Collapse toggle for long system messages
  const systemIsLong = msg.role === 'system' && msg.text.length > SYSTEM_COLLAPSE_CHARS
  const [systemOpen, setSystemOpen] = useState(false)

  if (msg.kind === 'trail' && msg.todos?.length) {
    return (
      <TodoPanel
        defaultCollapsed={msg.todoCollapsedByDefault}
        incomplete={msg.todoIncomplete}
        t={t}
        todos={msg.todos}
      />
    )
  }

  if (msg.kind === 'trail' && (msg.tools?.length || tools.length || thinking)) {
    return shouldShowThinkingTrail(msg, thinkingMode, toolsMode, activityMode) ? (
      <Box flexDirection="column" marginTop={leadGap ? 1 : 0}>
        <ToolTrail
          cols={transcriptBodyWidth(cols, msg.role, t.brand.prompt, TERMUX_TUI_MODE)}
          commandOverride={detailsModeCommandOverride}
          detailsMode={detailsMode}
          preferExpandedThinking={liveDetails}
          reasoning={thinking}
          reasoningActive={reasoningActive}
          reasoningAlwaysVisible={msg.isMoaReference}
          reasoningTokens={msg.thinkingTokens}
          sections={sections}
          t={t}
          tools={tools}
          toolTokens={msg.toolTokens}
          trail={msg.tools ?? []}
        />
      </Box>
    ) : null
  }

  // A trail with no reasoning, tools, or todos to show (e.g. the finalDetails
  // segment message.complete appends carrying only a token tally) has nothing
  // to draw — render nothing instead of an empty gutter row. blockRenders()
  // agrees, so it also stays transparent to grouping and never opens a gap.
  if (msg.kind === 'trail') {
    return null
  }

  if (msg.role === 'tool') {
    const toolText = msg.text || '(empty tool result)'
    const safeAnsi = hasAnsi(toolText) ? sanitizeAnsiForRender(toolText) : toolText

    return (
      <Box
        alignSelf="flex-start"
        borderColor={t.color.muted}
        borderStyle="round"
        marginLeft={1}
        paddingX={1}
        width={Math.max(8, cols - 2)}
      >
        {hasAnsi(toolText) ? (
          <Text wrap="wrap">
            <Ansi>{safeAnsi}</Ansi>
          </Text>
        ) : (
          <Text color={t.color.muted} wrap="wrap">
            {toolText}
          </Text>
        )}
      </Box>
    )
  }

  // Timeline events (model switches, delegation completions) render as
  // dim ◈ markers with no gutter — not as opaque user messages.
  if (msg.kind === 'event') {
    const eventGutterWidth = transcriptGutterWidth('system', t.brand.prompt)

    return (
      <Box marginBottom={1} marginTop={leadGap ? 1 : 0}>
        <NoSelect flexShrink={0} fromLeftEdge width={eventGutterWidth}>
          <Text> </Text>
        </NoSelect>
        <Text color={t.color.muted} dimColor>
          ◈ {msg.text}
        </Text>
      </Box>
    )
  }

  const { body, glyph, prefix } = ROLE[msg.role](t)
  const gutterWidth = transcriptGutterWidth(msg.role, t.brand.prompt)
  // The card's own `╭` border already marks the turn boundary for a boxed
  // (non-blank) assistant answer, so the gutter glyph would sit alone,
  // detached from the card — a stray mark rather than part of it. Suppress
  // it only for that case; every other role/kind keeps its usual glyph.
  const isBoxedAssistant = msg.role === 'assistant' && !msg.kind && /\S/.test(msg.text)

  const showDetails =
    (toolsMode !== 'hidden' && Boolean(msg.tools?.length)) || (thinkingMode !== 'hidden' && Boolean(thinking))

  const content = (() => {
    if (msg.kind === 'slash') {
      return <Text color={t.color.muted}>{msg.text}</Text>
    }

    // ── Collapsible long system message (system prompt, AGENTS.md, etc.) ──
    // MUST come before the hasAnsi check — system messages from the backend
    // contain Rich markup escape codes that would otherwise hit <Ansi> full render.
    if (systemIsLong) {
      const firstLine = (msg.text.split('\n')[0] ?? '').trim().slice(0, 120) || '(system message)'

      return (
        <Box flexDirection="column">
          <Box onClick={() => setSystemOpen(v => !v)}>
            <Text color={t.color.accent}>{systemOpen ? '▾ ' : '▸ '}</Text>
            <Text color={t.color.muted}>{firstLine}</Text>
            <Text color={t.color.muted} dimColor>
              {' — '}
              {msg.text.length.toLocaleString()} chars
            </Text>
          </Box>
          {systemOpen && <Ansi>{sanitizeAnsiForRender(msg.text)}</Ansi>}
        </Box>
      )
    }

    if (msg.role !== 'user' && hasAnsi(msg.text)) {
      return <Ansi>{sanitizeAnsiForRender(msg.text)}</Ansi>
    }

    if (msg.role === 'assistant') {
      // Assistant answers render inside a round-border box (web-chat card
      // look): 2 border columns + paddingX 1 eat 4 columns of wrap width.
      const bodyWidth = Math.max(
        1,
        transcriptBodyWidth(cols, msg.role, t.brand.prompt, TERMUX_TUI_MODE) - (msg.kind ? 0 : 4),
      )

      return isStreaming ? (
        // Incremental markdown: split at the last stable block boundary so
        // only the in-flight tail re-tokenizes per delta. See
        // streamingMarkdown.tsx for the cost model.
        <StreamingMd cols={bodyWidth} compact={compact} t={t} text={boundedLiveRenderText(msg.text)} />
      ) : (
        <Md cols={bodyWidth} compact={compact} t={t} text={msg.text} />
      )
    }

    if (msg.role === 'user' && msg.text.length > LONG_MSG && isPasteBackedText(msg.text)) {
      const { head, marker } = userDisplayParts(msg.text)

      return (
        <Text color={body}>
          {head}
          <Text color={t.color.muted} dimColor>
            {marker}
          </Text>
        </Text>
      )
    }

    // A skill, `@ref`, or attachment token the user put in the message keeps
    // the accent it wore in the composer, instead of flattening back into the
    // body text.
    if (msg.role === 'user') {
      const segments = splitComposerHighlights(msg.text)

      return (
        <Text {...(body ? { color: body } : {})}>
          {segments.map((segment, i) =>
            segment.ref ? (
              <Text color={t.color.accent} key={i}>
                {segment.text}
              </Text>
            ) : (
              segment.text
            )
          )}
        </Text>
      )
    }

    return <Text {...(body ? { color: body } : {})}>{msg.text}</Text>
  })()

  // Diff segments (emitted by pushInlineDiffSegment between narration
  // segments) keep a blank line on both sides so the patch doesn't butt up
  // against the prose around it.
  const isDiffSegment = msg.kind === 'diff'

  // `display.timestamps`: dim [HH:MM] beside the gutter glyph on user and
  // assistant rows only — event/trail/system chrome stays unstamped, matching
  // the classic CLI which stamps its user/assistant labels (#41531).
  const stamp =
    timestamps && (msg.role === 'user' || msg.role === 'assistant') && !msg.kind ? fmtMsgTimestamp(msg.createdAt) : null

  return (
    <Box
      flexDirection="column"
      marginBottom={msg.role === 'user' || isDiffSegment ? 1 : 0}
      marginTop={msg.role === 'user' || msg.kind === 'slash' || isDiffSegment || leadGap ? 1 : 0}
    >
      {showDetails && (
        <Box flexDirection="column" marginBottom={1}>
          <ToolTrail
            cols={transcriptBodyWidth(cols, msg.role, t.brand.prompt, TERMUX_TUI_MODE)}
            commandOverride={detailsModeCommandOverride}
            detailsMode={detailsMode}
            preferExpandedThinking={liveDetails}
            reasoning={thinking}
            reasoningActive={reasoningActive}
            reasoningTokens={msg.thinkingTokens}
            sections={sections}
            t={t}
            toolTokens={msg.toolTokens}
            trail={msg.tools}
          />
        </Box>
      )}

      {stamp && (
        <Box>
          <NoSelect flexShrink={0} fromLeftEdge width={gutterWidth}>
            <Text> </Text>
          </NoSelect>
          <Text color={t.color.muted} dim>
            {stamp}
          </Text>
        </Box>
      )}

      <Box>
        <NoSelect flexShrink={0} fromLeftEdge width={gutterWidth}>
          <Text bold={msg.role === 'user'} color={prefix}>
            {isBoxedAssistant ? ' ' : `${glyph} `}
          </Text>
        </NoSelect>

        {/* Web-chat card look, both sides of the turn:
         * · user      — filled bubble in the selection tone (lightest surface,
         *               ChatGPT-style emphasis on the prompt), paddingX 1
         * · assistant — round-border card filled with the panel surface tone:
         *               2 border cols + paddingX 1 eat 4 wrap columns
         * Ink `width` is border-box (includes padding/borders — verified
         * against the renderer), so the row's total width — and thus the
         * virtual-scroll height math — is unchanged; the matching wrap-width
         * adjustments live in virtualHeights.ts and the Md cols above. */}
        <Box
          backgroundColor={
            msg.role === 'user' && !msg.kind
              ? t.color.selectionBg
              : msg.role === 'assistant' && !msg.kind && /\S/.test(msg.text)
                ? t.color.completionBg
                : undefined
          }
          borderColor={msg.role === 'assistant' && !msg.kind && /\S/.test(msg.text) ? t.color.border : undefined}
          borderStyle={msg.role === 'assistant' && !msg.kind && /\S/.test(msg.text) ? 'round' : undefined}
          paddingX={
            (msg.role === 'user' || (msg.role === 'assistant' && /\S/.test(msg.text))) && !msg.kind ? 1 : 0
          }
          width={transcriptBodyWidth(cols, msg.role, t.brand.prompt, TERMUX_TUI_MODE)}
        >
          {content}
        </Box>
      </Box>
    </Box>
  )
})

// A MoA reference block (msg.isMoaReference) is the user-facing
// mixture-of-agents process the user opted into, not private model
// reasoning — it must stay visible even when every other trail section is
// hidden (#64657).
export const shouldShowThinkingTrail = (
  msg: Msg,
  thinkingMode: DetailsMode,
  toolsMode: DetailsMode,
  activityMode: DetailsMode
): boolean =>
  Boolean(msg.isMoaReference) || thinkingMode !== 'hidden' || toolsMode !== 'hidden' || activityMode !== 'hidden'

interface MessageLineProps {
  cols: number
  compact?: boolean
  detailsMode?: DetailsMode
  detailsModeCommandOverride?: boolean
  isStreaming?: boolean
  liveDetails?: boolean
  msg: Msg
  // The block rendered directly above this one. Drives the group-boundary
  // lead gap (see domain/blockLayout.ts::hasLeadGap). Undefined at the top of
  // the transcript or when spacing is irrelevant.
  prev?: Msg
  reasoningActive?: boolean
  sections?: SectionVisibility
  t: Theme
  /** `display.timestamps` — dim [HH:MM] label on user/assistant rows. */
  timestamps?: boolean
  tools?: ActiveTool[]
}
