import type { ReactNode } from 'react'

/**
 * Standalone shell: no app sidebar, no dev-mode Agentation widget, no chat
 * store wrappers. Used for narration-only pages like /evolution that need a
 * clean full-bleed canvas for screen-recording.
 *
 * Lives in the root layout's children slot, so root <html>/<body>/font setup
 * still applies — we just opt out of the providers that paint chrome over
 * the page.
 */
export default function StandaloneLayout({ children }: { children: ReactNode }) {
  return <div className="bg-page fixed inset-0">{children}</div>
}
