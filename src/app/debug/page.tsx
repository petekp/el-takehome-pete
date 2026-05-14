'use client'

/**
 * /debug — component gallery for fast visual iteration.
 *
 * Each "DebugZone" wraps a prototype component in an isolated PrototypeStore
 * (built via buildMockStore) so we can render any beat/state without driving
 * the arc through the full chat flow. Mutations from the rendered components
 * (e.g. clicking a prediction option) are intentionally no-ops here — we're
 * inspecting layouts, not exercising the state machine. To verify the live
 * flow, use the real /new chat.
 */

import { useState, type ReactNode } from 'react'
import {
  PrototypeContext,
  type ArcState,
  type PrototypeStore,
  type SidePanelState,
} from '@/lib/prototype-store'
import { CONCEPTS } from '@/lib/concepts'
import {
  AffordanceButtons,
  MapView,
  PredictionOptions,
  ReflectionCard,
  ReflectionInput,
  SidePanel,
  WorkshopView,
} from '@/components/prototype'
import { AssistantBody } from '@/components/chat'

const CONCEPT_ID = CONCEPTS[0].id
const FALLBACK = CONCEPTS[0].descriptors.fallback

const BASE_ARC: ArcState = {
  beat: 'idle',
  path: null,
  conceptId: CONCEPT_ID,
  chatId: 'debug-chat',
  triggerMessageId: 'debug-trigger',
  affordanceMessageId: null,
  prediction: null,
  predictionOptions: null,
  reveal: null,
  reflectionFraming: null,
  reflection: null,
  cardMeta: null,
  ghostNodes: null,
  workshopOpening: null,
}

const NOOP = () => {}
const NOOP_ASYNC = async () => {}

function buildMockStore(
  arc: ArcState,
  sidePanel: SidePanelState = { open: false, view: 'map' },
): PrototypeStore {
  return {
    state: { arc, sidePanel },
    resetArc: NOOP,
    fireArc: NOOP,
    chooseWrapper: NOOP,
    chooseLearn: NOOP_ASYNC,
    recordPrediction: NOOP_ASYNC,
    recordReveal: NOOP,
    recordReflection: NOOP_ASYNC,
    markCardReady: NOOP,
    endExchange: NOOP,
    openCard: NOOP,
    enterWorkshop: NOOP,
    setSidePanel: NOOP,
    closeSidePanel: NOOP,
  }
}

function DebugZone({
  title,
  note,
  arc,
  sidePanel,
  children,
}: {
  title: string
  note?: string
  arc: ArcState
  sidePanel?: SidePanelState
  children: ReactNode
}) {
  const store = buildMockStore(arc, sidePanel)
  return (
    <PrototypeContext.Provider value={store}>
      <div className="border-border-soft bg-page flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-text-primary text-sm font-medium">{title}</h3>
          {note && <span className="text-text-tertiary text-xs">{note}</span>}
        </div>
        <div className="bg-surface border-border-subtle rounded-md border px-4 py-3">
          {children}
        </div>
      </div>
    </PrototypeContext.Provider>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-text-primary font-serif text-lg">{title}</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{children}</div>
    </section>
  )
}

export default function DebugPage() {
  return (
    <main className="bg-page text-text-primary scroll-area h-full w-full overflow-y-auto px-8 py-10">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-10">
        <header className="flex flex-col gap-2">
          <h1 className="font-serif text-3xl">Component debug</h1>
          <p className="text-text-secondary text-sm">
            Every prototype component rendered in its meaningful states with mock
            PrototypeStores. Mutations are no-ops — visit /new for the live flow.
          </p>
        </header>

        <Section title="Affordance buttons">
          <DebugZone
            title="choosing"
            note="active two-button affordance"
            arc={{ ...BASE_ARC, beat: 'choosing' }}
          >
            <AffordanceButtons />
          </DebugZone>
          <DebugZone
            title="chose: wrapper"
            note="inert pill after wrapper path"
            arc={{ ...BASE_ARC, beat: 'wrapper-response', path: 'wrapper' }}
          >
            <AffordanceButtons />
          </DebugZone>
          <DebugZone
            title="chose: learning"
            note="inert pill after learning path"
            arc={{ ...BASE_ARC, beat: 'predicting', path: 'learning' }}
          >
            <AffordanceButtons />
          </DebugZone>
        </Section>

        <Section title="Prediction surface">
          <DebugZone
            title="predicting (registry fallback)"
            arc={{ ...BASE_ARC, beat: 'predicting' }}
          >
            <PredictionOptions />
          </DebugZone>
          <DebugZone
            title="predicting (live API options)"
            note="custom options + framing"
            arc={{
              ...BASE_ARC,
              beat: 'predicting',
              predictionOptions: {
                framing: '(live framing)',
                options: [
                  {
                    id: 'truth',
                    label:
                      'It hangs forever too — Promise.all won\'t settle until every promise does.',
                    isCorrect: true,
                    misconceptionTag: 'truth',
                  },
                  {
                    id: 'allSettled',
                    label:
                      'You get back what finished — the third is marked as still pending.',
                    isCorrect: false,
                    misconceptionTag: 'allSettled',
                  },
                  {
                    id: 'default-timeout',
                    label: 'Waits a built-in timeout, then rejects with a timeout error.',
                    isCorrect: false,
                    misconceptionTag: 'default-timeout',
                  },
                ],
              },
            }}
          >
            <PredictionOptions />
          </DebugZone>
          <DebugZone
            title="submitted (option)"
            note="faded card with selected option"
            arc={{
              ...BASE_ARC,
              beat: 'revealing',
              prediction: { optionId: 'allSettled' },
            }}
          >
            <PredictionOptions />
          </DebugZone>
          <DebugZone
            title="submitted (free-text)"
            arc={{
              ...BASE_ARC,
              beat: 'revealing',
              prediction: {
                freeText:
                  "I think it would return the successful results and skip the broken one.",
              },
            }}
          >
            <PredictionOptions />
          </DebugZone>
          <DebugZone
            title="exchange-ended"
            note="nothing rendered (choice pill remains on prior msg)"
            arc={{ ...BASE_ARC, beat: 'exchange-ended', path: 'learning' }}
          >
            <PredictionOptions />
          </DebugZone>
        </Section>

        <Section title="Reflection input">
          <DebugZone title="reflecting" arc={{ ...BASE_ARC, beat: 'reflecting' }}>
            <ReflectionInput />
          </DebugZone>
          <DebugZone
            title="reflection captured"
            arc={{
              ...BASE_ARC,
              beat: 'card-ready',
              reflection: { text: 'All-or-nothing — try/catch needs something to actually catch.' },
            }}
          >
            <ReflectionInput />
          </DebugZone>
          <DebugZone
            title="reflection skipped"
            arc={{ ...BASE_ARC, beat: 'card-ready', reflection: { text: '' } }}
          >
            <ReflectionInput />
          </DebugZone>
          <DebugZone
            title="exchange-ended"
            note="nothing rendered"
            arc={{ ...BASE_ARC, beat: 'exchange-ended' }}
          >
            <ReflectionInput />
          </DebugZone>
        </Section>

        <Section title="Inline reflection card">
          <DebugZone
            title="card-ready"
            note="primary state — Open is the active affordance"
            arc={{ ...BASE_ARC, beat: 'card-ready' }}
          >
            <ReflectionCard />
          </DebugZone>
          <DebugZone
            title="card-ready (live conceptTitle from API)"
            arc={{
              ...BASE_ARC,
              beat: 'card-ready',
              cardMeta: {
                framing: 'Held onto this:',
                conceptTitle: FALLBACK.cardMeta.conceptTitle,
              },
            }}
          >
            <ReflectionCard />
          </DebugZone>
          <DebugZone
            title="opened (map view active)"
            arc={{ ...BASE_ARC, beat: 'map-open' }}
          >
            <ReflectionCard />
          </DebugZone>
          <DebugZone
            title="opened (workshop active)"
            arc={{ ...BASE_ARC, beat: 'workshop-open' }}
          >
            <ReflectionCard />
          </DebugZone>
        </Section>

        <Section title="Map view (full panel width)">
          <div className="md:col-span-2">
            <DebugZone
              title="map-open"
              note="warm halo + central solid node + 4 dashed ghost nodes + atmospheric outer dots"
              arc={{ ...BASE_ARC, beat: 'map-open' }}
              sidePanel={{ open: true, view: 'map' }}
            >
              <div className="mx-auto max-w-[420px]">
                <MapView />
              </div>
            </DebugZone>
          </div>
        </Section>

        <Section title="Workshop view (full panel width)">
          <div className="md:col-span-2">
            <DebugZone
              title="workshop-open"
              note="back-to-map + configurable timeline viz + opening predict-reveal"
              arc={{ ...BASE_ARC, beat: 'workshop-open' }}
              sidePanel={{ open: true, view: 'workshop' }}
            >
              <div className="mx-auto w-[752px]">
                <WorkshopView />
              </div>
            </DebugZone>
          </div>
        </Section>

        <Section title="Side panel (true layout context)">
          <div className="md:col-span-2">
            <SidePanelDemo />
          </div>
        </Section>

        <Section title="Assistant body (markdown + inline tags)">
          <div className="md:col-span-2">
            <DebugZone
              title="full structured exchange in one message"
              note="Streamdown rendering inline custom tags alongside prose"
              arc={{
                ...BASE_ARC,
                beat: 'card-ready',
                path: 'learning',
                prediction: { optionId: 'allSettled' },
                reveal: { text: '(reveal text)' },
                reflection: { text: 'All-or-nothing — try/catch needs something to actually catch.' },
                cardMeta: {
                  framing: 'Held onto this:',
                  conceptTitle: FALLBACK.cardMeta.conceptTitle,
                },
              }}
            >
              <AssistantBody
                text={[
                  "There's a behavior in `Promise.all` worth knowing about before we wrap anything.",
                  '',
                  '<affordance/>',
                  '',
                  'Now the predict beat:',
                  '',
                  '<prediction-options/>',
                  '',
                  '(reveal prose would land here as a separate streamed assistant message)',
                  '',
                  'Anything you want to keep from that?',
                  '',
                  '<reflection-input/>',
                  '',
                  'Held onto this:',
                  '',
                  '<reflection-card/>',
                ].join('\n')}
              />
            </DebugZone>
          </div>
        </Section>
      </div>
    </main>
  )
}

/**
 * Stateful demo of the SidePanel — the panel slides between closed/open and
 * map/workshop views, so we drive it with local state rather than a single
 * frozen snapshot.
 */
function SidePanelDemo() {
  const [open, setOpen] = useState(true)
  const [view, setView] = useState<'map' | 'workshop'>('map')

  const store = buildMockStore(
    {
      ...BASE_ARC,
      beat: view === 'workshop' ? 'workshop-open' : 'map-open',
    },
    { open, view },
  )

  return (
    <PrototypeContext.Provider value={store}>
      <div className="border-border-soft bg-page flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-text-primary text-sm font-medium">Side panel</h3>
          <div className="text-text-tertiary flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="border-border-soft rounded border px-2 py-1"
            >
              {open ? 'Close' : 'Open'}
            </button>
            <button
              type="button"
              onClick={() => setView('map')}
              className={`border-border-soft rounded border px-2 py-1 ${
                view === 'map' ? 'bg-state-pill' : ''
              }`}
            >
              Map
            </button>
            <button
              type="button"
              onClick={() => setView('workshop')}
              className={`border-border-soft rounded border px-2 py-1 ${
                view === 'workshop' ? 'bg-state-pill' : ''
              }`}
            >
              Workshop
            </button>
          </div>
        </div>
        <div className="bg-surface border-border-subtle flex h-[640px] overflow-hidden rounded-md border">
          <div className="text-text-tertiary flex-1 p-6 text-sm italic">
            (chat column would live here)
          </div>
          <SidePanel />
        </div>
      </div>
    </PrototypeContext.Provider>
  )
}
