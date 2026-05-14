'use client'

import { useState } from 'react'
import { MoleculeScene } from '@/components/prototype/MoleculeScene'
import type { Molecule } from '@/lib/artifact-script'
import type { ChipState } from '@/lib/prototype-store'

const MOLECULES: Molecule[] = ['xef2', 'xef2-axial-strain', 'clf3']

export default function TestMoleculePage() {
  const [molecule, setMolecule] = useState<Molecule>('xef2')
  const [chipState, setChipState] = useState<ChipState>({
    bonds: true,
    lonePairs: true,
    equatorialPlane: true,
    angles: true,
  })

  return (
    <main className="bg-page min-h-screen p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1 className="font-serif text-2xl">Molecule scene — contrast test</h1>

        <div className="flex flex-wrap gap-3">
          {MOLECULES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMolecule(m)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                molecule === m
                  ? 'border-accent bg-accent/10 text-accent-strong'
                  : 'border-border-subtle bg-page'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          {(Object.keys(chipState) as (keyof ChipState)[]).map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chipState[key]}
                onChange={(e) =>
                  setChipState((s) => ({ ...s, [key]: e.target.checked }))
                }
              />
              {key}
            </label>
          ))}
        </div>

        <div className="aspect-[4/3] w-full overflow-hidden rounded-md border border-border-subtle">
          <MoleculeScene molecule={molecule} chipState={chipState} className="size-full" />
        </div>
      </div>
    </main>
  )
}
