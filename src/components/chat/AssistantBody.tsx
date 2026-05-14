import { Streamdown, type AllowedTags, type Components } from 'streamdown'
import { cn } from '@/lib/utils'
import { AffordanceButtons, Artifact } from '@/components/prototype'
import { ClaudeHeading, ClaudeList, ClaudeListItem, ClaudeParagraph } from './ClaudeMessage'

/**
 * Inline arc components. The trigger response emits <affordance/>; the
 * learning path commits a message that's just <artifact/>. Streamdown swaps
 * the tags for the real React components, which read PrototypeState.
 */
const ARC_TAGS: AllowedTags = {
  affordance: [],
  artifact: [],
}

type AssistantBodyProps = {
  text: string
  isStreaming?: boolean
}

export function AssistantBody({ text, isStreaming = false }: AssistantBodyProps) {
  const hasText = text.length > 0
  return (
    <Streamdown
      isAnimating={isStreaming && hasText}
      animated={false}
      caret="circle"
      parseIncompleteMarkdown
      allowedTags={ARC_TAGS}
      components={MARKDOWN_COMPONENTS}
    >
      {text}
    </Streamdown>
  )
}

const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => <ClaudeHeading level={2}>{children}</ClaudeHeading>,
  h2: ({ children }) => <ClaudeHeading level={2}>{children}</ClaudeHeading>,
  h3: ({ children }) => <ClaudeHeading level={3}>{children}</ClaudeHeading>,
  h4: ({ children }) => <ClaudeHeading level={3}>{children}</ClaudeHeading>,
  p: ({ children }) => <ClaudeParagraph>{children}</ClaudeParagraph>,
  ul: ({ children }) => <ClaudeList>{children}</ClaudeList>,
  ol: ({ children }) => <ol className="m-0 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <ClaudeListItem>{children}</ClaudeListItem>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent hover:text-accent-strong underline underline-offset-2"
    >
      {children}
    </a>
  ),
  inlineCode: ({ children }) => (
    <code className="bg-state-pill rounded-xs px-1 py-0.5 font-mono text-[0.9em]">
      {children}
    </code>
  ),
  code: ({ className, children }) => (
    <code className={cn('font-mono text-[0.85em]', className)}>{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="bg-state-pill border-border-soft my-1 overflow-x-auto rounded-md border p-3 text-sm leading-snug">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-border-subtle text-text-secondary border-l-2 pl-3 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border-soft my-2" />,
  affordance: () => <AffordanceButtons />,
  artifact: () => <Artifact />,
}
