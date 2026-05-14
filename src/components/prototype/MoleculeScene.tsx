'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { cn } from '@/lib/utils'
import type { Molecule } from '@/lib/artifact-script'
import type { ChipState, RepresentationPanelId } from '@/lib/prototype-store'

/**
 * The 3D molecule viewport — the centerpiece of the artifact.
 *
 * Renders XeF2 (or its axial-strain variant) and ClF3 with sphere atoms +
 * cylinder bonds, plus optional lone-pair density clouds, an equatorial-
 * plane disc, and bond-angle annotations driven by `chipState`.
 *
 * v4 polish: each representation panel triggers a dramatic visual treatment.
 *   lewis     — camera snaps to a head-on view, FOV collapses toward
 *               orthographic, scene desaturates, depth cues disappear. The
 *               molecule "flattens" into a 2D diagram.
 *   wedge     — camera holds a canonical perspective view, bonds re-render
 *               with wedge/dash visual vocabulary based on their angle to
 *               the camera. Lone pairs, equatorial plane, and angle labels
 *               are hidden.
 *   geometry  — camera holds a clean view, equatorial disc and bond-angle
 *               annotation are forced on, a floating shape-name label
 *               appears, atom colors desaturate to foreground the abstract
 *               structure. Lone pairs are hidden.
 *   default   — free orbit, all features available, no overlays.
 *
 * Other constraints:
 *   - Bret Victor aesthetic: matte materials, soft lighting, off-white bg.
 *   - Auto-rotates slowly on load to signal "this is 3D, drag me."
 *   - OrbitControls 'change' events feed a rotation accumulator the parent
 *     uses to satisfy the rotation gate at >=90 degrees.
 *   - Camera rotation is disabled while a treatment is active so the panel
 *     visuals stay legible.
 *   - Reset-view affordance in the corner.
 */

// ---------------------------------------------------------------------------
// Molecule data — atom positions, bonds, lone pairs, equatorial plane.
// ---------------------------------------------------------------------------

type ElementSymbol = 'Xe' | 'F' | 'Cl'

type AtomDef = {
  element: ElementSymbol
  position: [number, number, number]
}

type BondDef = {
  from: number
  to: number
}

type LonePairDef = {
  /** Position of the lone-pair cloud center relative to the central atom. */
  position: [number, number, number]
  /** Direction the cloud orients along. */
  direction: [number, number, number]
}

type MoleculeData = {
  atoms: AtomDef[]
  bonds: BondDef[]
  lonePairs: LonePairDef[]
  /** Pair of atom indices defining the bond-angle annotation (typically the
   *  two axial F's for XeF2 → 180° label). */
  bondAnglePair?: [number, number]
  /** Angle in degrees displayed on the annotation. */
  bondAngle?: number
  /** Whether the equatorial plane disc should render when the chip is on. */
  hasEquatorialPlane: boolean
  /** Shape name shown when in geometry treatment. */
  shapeName: string
}

const BOND_LEN = 1.2
const LONE_PAIR_RADIAL = 0.85
const EQUATORIAL_PLANE_RADIUS = 1.35

const AXIAL_UP: [number, number, number] = [0, BOND_LEN, 0]
const AXIAL_DOWN: [number, number, number] = [0, -BOND_LEN, 0]

function equatorialPos(angleDeg: number, r: number): [number, number, number] {
  const θ = (angleDeg * Math.PI) / 180
  return [Math.cos(θ) * r, 0, Math.sin(θ) * r]
}

function xef2(): MoleculeData {
  return {
    atoms: [
      { element: 'Xe', position: [0, 0, 0] },
      { element: 'F', position: AXIAL_UP },
      { element: 'F', position: AXIAL_DOWN },
    ],
    bonds: [
      { from: 0, to: 1 },
      { from: 0, to: 2 },
    ],
    lonePairs: [
      { position: equatorialPos(0, LONE_PAIR_RADIAL), direction: equatorialPos(0, 1) },
      { position: equatorialPos(120, LONE_PAIR_RADIAL), direction: equatorialPos(120, 1) },
      { position: equatorialPos(240, LONE_PAIR_RADIAL), direction: equatorialPos(240, 1) },
    ],
    bondAnglePair: [1, 2],
    bondAngle: 180,
    hasEquatorialPlane: true,
    shapeName: 'Linear',
  }
}

function xef2AxialStrain(): MoleculeData {
  return {
    atoms: [
      { element: 'Xe', position: [0, 0, 0] },
      { element: 'F', position: AXIAL_DOWN },
      { element: 'F', position: equatorialPos(0, BOND_LEN) },
    ],
    bonds: [
      { from: 0, to: 1 },
      { from: 0, to: 2 },
    ],
    lonePairs: [
      { position: [0, LONE_PAIR_RADIAL, 0], direction: [0, 1, 0] },
      { position: equatorialPos(120, LONE_PAIR_RADIAL), direction: equatorialPos(120, 1) },
      { position: equatorialPos(240, LONE_PAIR_RADIAL), direction: equatorialPos(240, 1) },
    ],
    hasEquatorialPlane: true,
    shapeName: 'Strained',
  }
}

function clf3(): MoleculeData {
  return {
    atoms: [
      { element: 'Cl', position: [0, 0, 0] },
      { element: 'F', position: AXIAL_UP },
      { element: 'F', position: AXIAL_DOWN },
      { element: 'F', position: equatorialPos(0, BOND_LEN) },
    ],
    bonds: [
      { from: 0, to: 1 },
      { from: 0, to: 2 },
      { from: 0, to: 3 },
    ],
    lonePairs: [
      { position: equatorialPos(120, LONE_PAIR_RADIAL), direction: equatorialPos(120, 1) },
      { position: equatorialPos(240, LONE_PAIR_RADIAL), direction: equatorialPos(240, 1) },
    ],
    bondAnglePair: [1, 2],
    bondAngle: 180,
    hasEquatorialPlane: true,
    shapeName: 'T-shaped',
  }
}

export function moleculeData(name: Molecule): MoleculeData {
  switch (name) {
    case 'xef2':
      return xef2()
    case 'xef2-axial-strain':
      return xef2AxialStrain()
    case 'clf3':
      return clf3()
  }
}

const ATOM_RADIUS: Record<ElementSymbol, number> = {
  Xe: 0.45,
  F: 0.24,
  Cl: 0.36,
}

const ATOM_COLOR: Record<ElementSymbol, number> = {
  Xe: 0x8b6dd5,
  F: 0xb8c75c,
  Cl: 0x7a8f3e,
}

const BOND_RADIUS = 0.07
const BOND_COLOR = 0x9a958e
const BOND_TOWARD_COLOR = 0x4a4540
const BOND_AWAY_COLOR = 0x6b665e

const LONE_PAIR_COLOR = 0x6b46c1
const LONE_PAIR_OPACITY = 0.62

const EQUATORIAL_PLANE_COLOR = 0xc6b8e8
const EQUATORIAL_PLANE_OPACITY = 0.18
const EQUATORIAL_PLANE_RING_COLOR = 0x8b6dd5
const EQUATORIAL_PLANE_RING_OPACITY = 0.4

const ANGLE_LINE_COLOR = 0x5a544c
const ANGLE_LINE_OPACITY = 0.7

// ---------------------------------------------------------------------------
// Treatments — drive a per-panel rendering mode.
// ---------------------------------------------------------------------------

type Treatment = 'default' | 'lewis' | 'wedge' | 'geometry'

type TreatmentTarget = {
  cameraPos: THREE.Vector3
  fov: number
  enableRotate: boolean
  filter: string
}

const DEFAULT_CAM = new THREE.Vector3(3.2, 1.6, 4.6)
// Head-on, telephoto-leaning so the scene reads as a "flat" Lewis-style
// diagram. The combination of FOV 25 and distance 9 gives the molecule the
// same projected size as the default treatment (after safeAreaZoom), so the
// axial F's stay comfortably inside the safe rectangle and don't slip under
// the header overlay.
const LEWIS_CAM = new THREE.Vector3(0, 0, 9)
const WEDGE_CAM = new THREE.Vector3(3.6, 1.0, 4.0)
const GEOMETRY_CAM = new THREE.Vector3(3.0, 1.4, 4.6)

const TREATMENT_TARGETS: Record<Treatment, TreatmentTarget> = {
  default: {
    cameraPos: DEFAULT_CAM,
    fov: 40,
    enableRotate: true,
    filter: 'none',
  },
  lewis: {
    cameraPos: LEWIS_CAM,
    fov: 25,
    enableRotate: true,
    filter: 'grayscale(0.6) contrast(0.95) brightness(1.03)',
  },
  wedge: {
    cameraPos: WEDGE_CAM,
    fov: 40,
    enableRotate: true,
    filter: 'none',
  },
  geometry: {
    cameraPos: GEOMETRY_CAM,
    fov: 40,
    enableRotate: true,
    filter: 'saturate(0.55)',
  },
}

function panelToTreatment(panel: RepresentationPanelId | null | undefined): Treatment {
  if (panel === 'lewis') return 'lewis'
  if (panel === 'wedge') return 'wedge'
  if (panel === 'geometry') return 'geometry'
  return 'default'
}

type SafeInsets = {
  top: number
  right: number
  bottom: number
}

/**
 * Shift the rendered molecule so it sits centered in the "safe area" — the
 * canvas minus the overlaid UI on each edge. Uses Three.js's view-offset
 * mechanism: tell the camera it's rendering a sub-window of a virtual
 * viewport that is `top + bottom` taller and `right` wider, with our window
 * aligned so the molecule (otherwise at virtual center) ends up at the safe
 * area's center within our actual canvas.
 *
 * Math: setViewOffset(fullW, fullH, offX, offY, w, h). Molecule at virtual
 * center = (fullW/2, fullH/2). Its position in our window = virtual center −
 * (offX, offY). For the molecule to appear at the safe area center we want:
 *   - x: (W − rightInset)/2 → offX = rightInset
 *   - y: (H + topInset − bottomInset)/2 → offY = bottomInset
 * Then fullW = W + rightInset, fullH = H + topInset + bottomInset gives the
 * desired projection. Left inset is 0 by convention here (we don't overlay
 * on the left).
 *
 * Pixel ratios cancel out — fullW/fullH and w/h share units, so passing CSS
 * pixels works regardless of devicePixelRatio.
 */
function applyViewOffset(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  insets: SafeInsets,
) {
  if (width <= 0 || height <= 0) return
  const totalY = insets.top + insets.bottom
  if (insets.right <= 0 && totalY <= 0) {
    camera.clearViewOffset()
    return
  }
  const fullW = width + insets.right
  const fullH = height + totalY
  camera.setViewOffset(fullW, fullH, insets.right, insets.bottom, width, height)
}

/**
 * Compute the zoom factor that scales the projection so the molecule fits
 * within the safe area (canvas minus overlaid UI). Used for the initial view
 * and Reset View; user dolly/pan can take the molecule outside the safe
 * area, which is fine. Only applied to the default treatment; the panel
 * treatments (lewis/wedge/geometry) keep zoom=1 so their carefully tuned
 * camera positions and FOVs aren't distorted.
 *
 * Picks the more constraining axis (the molecule must fit both horizontally
 * and vertically) so the safe area never overflows.
 */
function safeAreaZoom(width: number, height: number, insets: SafeInsets): number {
  if (width <= 0 || height <= 0) return 1
  const horizRatio = (width - insets.right) / width
  const vertRatio = (height - insets.top - insets.bottom) / height
  // The 0.95 multiplier leaves a small visual margin inside the safe area
  // without aggressively shrinking the molecule. (Previously 0.8 when bonds
  // were 1.5 long; with the now-shorter 1.2 bonds the molecule has more
  // headroom, so we can let it fill more of the safe rectangle.)
  const ratio = Math.min(horizRatio, vertRatio) * 0.95
  return Math.max(0.3, Math.min(1, ratio))
}

function targetZoomForTreatment(
  _treatment: Treatment,
  width: number,
  height: number,
  insets: SafeInsets,
): number {
  // All treatments share the safe-area zoom so the molecule always fits in
  // the rectangle left by the overlaid UI. Originally only `default` used
  // this and panel treatments stayed at zoom=1, which combined with their
  // specific FOVs/camera positions could clip the molecule (most visibly
  // Lewis at FOV 8) or push it under the right pane.
  return safeAreaZoom(width, height, insets)
}

// ---------------------------------------------------------------------------
// Scene component
// ---------------------------------------------------------------------------

type MoleculeSceneProps = {
  molecule: Molecule
  chipState: ChipState
  /** Drives the per-panel rendering treatment. */
  activePanel?: RepresentationPanelId | null
  /** Called with positive rotation deltas (radians) every orbit-controls tick.
   *  The parent accumulates these toward the rotation gate. */
  onRotationDelta?: (deltaRad: number) => void
  /** Called when the user clicks the Reset View button while a non-default
   *  treatment is active. The parent should clear `activePanel` in response;
   *  Reset View always resets the camera locally before this fires. */
  onExitTreatment?: () => void
  /** Reserved space (CSS pixels) on each edge of the canvas for overlaid UI:
   *  - `top`    — typically the affixed header
   *  - `right`  — typically the floating right pane
   *  - `bottom` — typically the representation-panels row
   *  The projection is offset so the molecule renders centered in the
   *  resulting safe area, and the camera zooms out so it fits within.
   *  Default 0 on each edge (no inset). */
  topOverlayInsetPx?: number
  rightOverlayInsetPx?: number
  bottomOverlayInsetPx?: number
  className?: string
}

export function MoleculeScene({
  molecule,
  chipState,
  activePanel,
  onRotationDelta,
  onExitTreatment,
  topOverlayInsetPx = 0,
  rightOverlayInsetPx = 0,
  bottomOverlayInsetPx = 0,
  className,
}: MoleculeSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const refs = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    controls: OrbitControls
    moleculeGroup: THREE.Group
    resetView: () => void
    /** Cache the camera forward at last build so wedge geometry stays stable
     *  for the duration of the treatment. */
    lastBuildForward: THREE.Vector3
  } | null>(null)

  const data = useMemo(() => moleculeData(molecule), [molecule])
  const treatment = panelToTreatment(activePanel ?? null)
  const [filterCss, setFilterCss] = useState<string>('none')

  // Refs the resize observer (inside the mount-once effect) reads to compute
  // the right safe-area zoom for the current treatment.
  const currentTreatmentRef = useRef<Treatment>(treatment)
  useEffect(() => {
    currentTreatmentRef.current = treatment
  }, [treatment])

  const onRotationDeltaRef = useRef(onRotationDelta)
  useEffect(() => {
    onRotationDeltaRef.current = onRotationDelta
  }, [onRotationDelta])

  // Cached so the resize observer (inside the mount-once effect) reads the
  // latest insets without forcing a full scene rebuild on prop change.
  const insetsRef = useRef<SafeInsets>({
    top: topOverlayInsetPx,
    right: rightOverlayInsetPx,
    bottom: bottomOverlayInsetPx,
  })
  useEffect(() => {
    insetsRef.current = {
      top: topOverlayInsetPx,
      right: rightOverlayInsetPx,
      bottom: bottomOverlayInsetPx,
    }
    const r = refs.current
    if (!r) return
    const w = r.renderer.domElement.clientWidth
    const h = r.renderer.domElement.clientHeight
    applyViewOffset(r.camera, w, h, insetsRef.current)
    r.camera.zoom = targetZoomForTreatment(currentTreatmentRef.current, w, h, insetsRef.current)
    r.camera.updateProjectionMatrix()
  }, [topOverlayInsetPx, rightOverlayInsetPx, bottomOverlayInsetPx])

  // Mount: build scene, camera, renderer, controls.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const { width, height } = container.getBoundingClientRect()

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf5f3ef)

    const camera = new THREE.PerspectiveCamera(40, Math.max(width / height, 0.1), 0.1, 100)
    camera.position.copy(DEFAULT_CAM)
    applyViewOffset(camera, width, height, insetsRef.current)
    camera.zoom = safeAreaZoom(width, height, insetsRef.current)
    camera.updateProjectionMatrix()

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width || 400, height || 400)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    container.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.72))
    const dir = new THREE.DirectionalLight(0xffffff, 1.15)
    dir.position.set(2.5, 3.5, 4)
    scene.add(dir)
    const rim = new THREE.DirectionalLight(0xfff4e8, 0.35)
    rim.position.set(-3, 1, -2)
    scene.add(rim)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.minDistance = 2.8
    // maxDistance 12 lets the telephoto-leaning Lewis treatment (camera at
    // z=9) sit inside the controls' allowed range; without this the controls
    // would clamp the position back to 8 after the treatment animation
    // settled and the user touched the molecule.
    controls.maxDistance = 12
    controls.target.set(0, 0, 0)
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.6
    controls.update()

    // Rotation accumulator — track the spherical angle change per frame and
    // notify parent with positive deltas. autoRotate's contribution doesn't
    // count toward the gate; we only forward deltas from user interaction.
    let lastAzimuth = controls.getAzimuthalAngle()
    let lastPolar = controls.getPolarAngle()
    let userInteracting = false
    const onStart = () => {
      controls.autoRotate = false
      userInteracting = true
      lastAzimuth = controls.getAzimuthalAngle()
      lastPolar = controls.getPolarAngle()
    }
    const onEnd = () => {
      userInteracting = false
    }
    controls.addEventListener('start', onStart)
    controls.addEventListener('end', onEnd)

    const moleculeGroup = new THREE.Group()
    scene.add(moleculeGroup)

    const lastBuildForward = new THREE.Vector3()
    camera.getWorldDirection(lastBuildForward)
    buildScene(moleculeGroup, data, chipState, 'default', lastBuildForward, false)

    const resetView = () => {
      camera.position.copy(DEFAULT_CAM)
      controls.target.set(0, 0, 0)
      controls.update()
    }

    let rafId = 0
    const tick = () => {
      controls.update()

      if (userInteracting) {
        const az = controls.getAzimuthalAngle()
        const pol = controls.getPolarAngle()
        const dAz = Math.abs(az - lastAzimuth)
        const dPol = Math.abs(pol - lastPolar)
        // Wrap-around guard: ignore jumps larger than ~90° per frame.
        const delta = (dAz < Math.PI / 2 ? dAz : 0) + (dPol < Math.PI / 2 ? dPol : 0)
        if (delta > 0) onRotationDeltaRef.current?.(delta)
        lastAzimuth = az
        lastPolar = pol
      }

      renderer.render(scene, camera)
      rafId = requestAnimationFrame(tick)
    }
    tick()

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect
        if (w === 0 || h === 0) continue
        renderer.setSize(w, h)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        applyViewOffset(camera, w, h, insetsRef.current)
        // Re-apply safe-area zoom for the current treatment so the molecule
        // stays appropriately scaled when the viewport size changes.
        camera.zoom = targetZoomForTreatment(
          currentTreatmentRef.current,
          w,
          h,
          insetsRef.current,
        )
        camera.updateProjectionMatrix()
      }
    })
    ro.observe(container)

    refs.current = {
      scene,
      camera,
      renderer,
      controls,
      moleculeGroup,
      resetView,
      lastBuildForward,
    }

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      controls.removeEventListener('start', onStart)
      controls.removeEventListener('end', onEnd)
      controls.dispose()
      disposeGroup(moleculeGroup)
      renderer.dispose()
      try {
        container.removeChild(renderer.domElement)
      } catch {
        /* might already be detached on unmount */
      }
      refs.current = null
    }
    // Intentionally empty deps — scene is built once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Animate camera + FOV to the treatment target. Runs whenever treatment
  // changes. The CSS filter cross-fades alongside.
  useEffect(() => {
    const r = refs.current
    if (!r) return
    const target = TREATMENT_TARGETS[treatment]

    // Disable user rotation immediately for non-default treatments so the
    // canonical view stays put through the animation.
    r.controls.autoRotate = false
    r.controls.enableRotate = target.enableRotate

    const startPos = r.camera.position.clone()
    const endPos = target.cameraPos.clone()
    const startFov = r.camera.fov
    const endFov = target.fov
    const startZoom = r.camera.zoom
    const endZoom = targetZoomForTreatment(
      treatment,
      r.renderer.domElement.clientWidth,
      r.renderer.domElement.clientHeight,
      insetsRef.current,
    )

    const duration = 380
    const startTs = performance.now()
    let cancelled = false
    let rafId = 0

    const tick = () => {
      if (cancelled) return
      const now = performance.now()
      const t = Math.min((now - startTs) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)

      r.camera.position.lerpVectors(startPos, endPos, eased)
      r.camera.fov = startFov + (endFov - startFov) * eased
      r.camera.zoom = startZoom + (endZoom - startZoom) * eased
      r.camera.updateProjectionMatrix()
      r.controls.target.set(0, 0, 0)

      if (t >= 1) {
        // Rebuild the molecule using the post-animation camera forward so
        // wedge geometry reflects the final view.
        r.camera.getWorldDirection(r.lastBuildForward)
        disposeGroup(r.moleculeGroup)
        r.moleculeGroup.clear()
        buildScene(
          r.moleculeGroup,
          data,
          chipState,
          treatment,
          r.lastBuildForward,
          true,
        )
        return
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    setFilterCss(target.filter)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [treatment, data, chipState])

  // Rebuild on molecule or chipState change (cross-fade molecule swap).
  const prevDataRef = useRef<MoleculeData | null>(null)
  useEffect(() => {
    const r = refs.current
    if (!r) return
    const prev = prevDataRef.current
    prevDataRef.current = data
    const isInitial = prev === null
    const dataChanged = !isInitial && prev !== data

    if (isInitial || !dataChanged) {
      r.camera.getWorldDirection(r.lastBuildForward)
      disposeGroup(r.moleculeGroup)
      r.moleculeGroup.clear()
      buildScene(r.moleculeGroup, data, chipState, treatment, r.lastBuildForward, true)
      return
    }

    const FADE_OUT_MS = 320
    const FADE_IN_MS = 380
    let rafId = 0
    let cancelled = false
    let phase: 'out' | 'in' = 'out'
    let phaseStart = performance.now()

    const tick = () => {
      if (cancelled) return
      const now = performance.now()
      const duration = phase === 'out' ? FADE_OUT_MS : FADE_IN_MS
      const t = Math.min((now - phaseStart) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 2)

      if (phase === 'out') {
        applyTransitionScalar(r.moleculeGroup, 1 - eased)
        if (t >= 1) {
          r.camera.getWorldDirection(r.lastBuildForward)
          disposeGroup(r.moleculeGroup)
          r.moleculeGroup.clear()
          buildScene(r.moleculeGroup, data, chipState, treatment, r.lastBuildForward, true)
          applyTransitionScalar(r.moleculeGroup, 0)
          phase = 'in'
          phaseStart = performance.now()
        }
      } else {
        applyTransitionScalar(r.moleculeGroup, eased)
        if (t >= 1) {
          applyTransitionScalar(r.moleculeGroup, 1)
          return
        }
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      applyTransitionScalar(r.moleculeGroup, 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, chipState])

  return (
    <div className={cn('relative size-full', className)}>
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-hidden"
        style={{ filter: filterCss, transition: 'filter 380ms ease-out' }}
      />
      <SceneLegend
        molecule={molecule}
        chipState={chipState}
        treatment={treatment}
        topInsetPx={topOverlayInsetPx}
      />
      <ResetViewButton
        onClick={() => {
          refs.current?.resetView()
          if (treatment !== 'default') onExitTreatment?.()
        }}
        topInsetPx={topOverlayInsetPx}
        rightInsetPx={rightOverlayInsetPx}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overlays — legend (what's in the scene) and reset-view affordance.
// ---------------------------------------------------------------------------

const ELEMENT_LABEL: Record<ElementSymbol, string> = {
  Xe: 'Xenon',
  F: 'Fluorine',
  Cl: 'Chlorine',
}

function SceneLegend({
  molecule,
  chipState,
  treatment,
  topInsetPx,
}: {
  molecule: Molecule
  chipState: ChipState
  treatment: Treatment
  topInsetPx: number
}) {
  const data = moleculeData(molecule)
  const seen = new Set<ElementSymbol>()
  const elements: ElementSymbol[] = []
  for (const a of data.atoms) {
    if (!seen.has(a.element)) {
      seen.add(a.element)
      elements.push(a.element)
    }
  }

  const showLonePairs = chipState.lonePairs && treatment !== 'wedge' && treatment !== 'geometry'
  const showPlane = (chipState.equatorialPlane || treatment === 'geometry') && treatment !== 'lewis' && treatment !== 'wedge'

  // Wedge mode shows just the element labels — there are no lone pairs or
  // plane to call out, but the atom identification is still useful.
  // Otherwise only show the legend when there's something beyond atoms+bonds.
  if (!showLonePairs && !showPlane && treatment !== 'wedge') return null

  // Sit inside the safe area — below the overlaid header (topInsetPx) with a
  // small additional gap so the legend doesn't bump right into the header's
  // bottom border.
  const top = topInsetPx > 0 ? topInsetPx - 4 : 8
  return (
    <div
      style={{ top: `${top}px`, left: 12 }}
      className="border-border-subtle bg-page/85 text-text-secondary pointer-events-none absolute z-10 flex flex-col gap-1 rounded-md border px-2.5 py-2 text-[12px] backdrop-blur-sm"
    >
      {elements.map((e) => (
        <span key={e} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2 rounded-full"
            style={{ backgroundColor: `#${ATOM_COLOR[e].toString(16).padStart(6, '0')}` }}
          />
          <span>{ELEMENT_LABEL[e]}</span>
        </span>
      ))}
      {showLonePairs && (
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-3 w-2 rounded-full opacity-70"
            style={{ backgroundColor: '#6b46c1' }}
          />
          <span>Lone pair</span>
        </span>
      )}
      {showPlane && (
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2 rounded-sm"
            style={{ backgroundColor: '#c6b8e8' }}
          />
          <span>Equatorial plane</span>
        </span>
      )}
    </div>
  )
}

function ResetViewButton({
  onClick,
  topInsetPx,
  rightInsetPx,
}: {
  onClick: () => void
  topInsetPx: number
  rightInsetPx: number
}) {
  // Stay inside the safe area: below the overlaid header (topInset) and left
  // of the floating right pane (rightInset).
  const top = topInsetPx > 0 ? topInsetPx - 4 : 8
  const right = rightInsetPx > 0 ? rightInsetPx + 4 : 8
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ top: `${top}px`, right: `${right}px` }}
      className={cn(
        'absolute z-10 inline-flex items-center gap-1 rounded-md',
        'border border-border-subtle bg-page/85 px-2.5 py-1.5 text-[12px]',
        'text-text-secondary hover:text-text-primary hover:bg-page',
        'backdrop-blur-sm transition-colors',
      )}
      aria-label="Reset view"
    >
      Reset view
    </button>
  )
}

// ---------------------------------------------------------------------------
// Scene building
// ---------------------------------------------------------------------------

const USERDATA_KIND = 'kind'
type SceneObjectKind =
  | 'atom'
  | 'bond'
  | 'lone-pair'
  | 'equatorial-plane'
  | 'angle-label'

type OpacityLayers = {
  base: number
  transition: number
}
const USERDATA_OPACITY = 'opacity'

function tagObject(o: THREE.Object3D, kind: SceneObjectKind) {
  o.userData[USERDATA_KIND] = kind
}

function tagMeshOpacity(mesh: THREE.Mesh | THREE.Line | THREE.Sprite, base: number) {
  const layers: OpacityLayers = { base, transition: 1 }
  mesh.userData[USERDATA_OPACITY] = layers
  applyMeshOpacity(mesh)
}

function applyMeshOpacity(mesh: THREE.Mesh | THREE.Line | THREE.Sprite) {
  const layers = mesh.userData[USERDATA_OPACITY] as OpacityLayers | undefined
  if (!layers) return
  const mat = mesh.material as
    | THREE.MeshStandardMaterial
    | THREE.MeshBasicMaterial
    | THREE.LineBasicMaterial
    | THREE.SpriteMaterial
  const next = layers.base * layers.transition
  mat.transparent = next < 1
  mat.opacity = next
}

function applyTransitionScalar(group: THREE.Group, scalar: number) {
  group.traverse((c) => {
    const m = c as THREE.Mesh | THREE.Line | THREE.Sprite
    const layers = m.userData[USERDATA_OPACITY] as OpacityLayers | undefined
    if (!layers) return
    layers.transition = scalar
    applyMeshOpacity(m)
  })
}

/**
 * Build the molecule's geometry given the current treatment.
 *
 * Each treatment picks which primitives to draw and which to hide. Bond
 * style varies by treatment too — wedge mode swaps cylinders for tapered
 * cones or dashed segments based on the bond's angle to the camera.
 */
function buildScene(
  group: THREE.Group,
  data: MoleculeData,
  chipState: ChipState,
  treatment: Treatment,
  cameraForward: THREE.Vector3,
  /** Whether to fully build (true) or skip while the camera animation is
   *  still in flight (false → simplified build to avoid a flash). */
  fullBuild: boolean,
) {
  const showLonePairs = chipState.lonePairs && treatment !== 'wedge' && treatment !== 'geometry'
  const showEquatorialPlane =
    (chipState.equatorialPlane || treatment === 'geometry') &&
    data.hasEquatorialPlane &&
    treatment !== 'wedge' &&
    treatment !== 'lewis'
  const showAngles =
    (chipState.angles || treatment === 'geometry') &&
    !!data.bondAnglePair &&
    data.bondAngle !== undefined &&
    treatment !== 'wedge' &&
    treatment !== 'lewis'

  // Atoms — always rendered. In geometry treatment, lerp colors toward
  // neutral so the abstract structure reads first.
  for (const atom of data.atoms) {
    const geom = new THREE.SphereGeometry(ATOM_RADIUS[atom.element], 32, 32)
    const color = new THREE.Color(ATOM_COLOR[atom.element])
    if (treatment === 'geometry') {
      color.lerp(new THREE.Color(0xa8a39a), 0.55)
    }
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: treatment === 'lewis' ? 0.95 : 0.55,
      metalness: 0.0,
      flatShading: treatment === 'lewis',
    })
    const mesh = new THREE.Mesh(geom, mat)
    mesh.position.set(...atom.position)
    tagObject(mesh, 'atom')
    tagMeshOpacity(mesh, 1)
    group.add(mesh)
  }

  if (!fullBuild) return

  // Bonds — style depends on treatment.
  if (chipState.bonds) {
    for (const bond of data.bonds) {
      const a = data.atoms[bond.from]
      const b = data.atoms[bond.to]
      if (treatment === 'wedge') {
        group.add(makeWedgeOrDashBond(a.position, b.position, cameraForward))
      } else if (treatment === 'lewis') {
        group.add(makeBond(a.position, b.position, 0x2f2c28, BOND_RADIUS * 0.7))
      } else {
        group.add(makeBond(a.position, b.position, BOND_COLOR, BOND_RADIUS))
      }
    }
  }

  if (showLonePairs) {
    for (const lp of data.lonePairs) {
      group.add(makeLonePair(lp.position, lp.direction))
    }
  }

  if (showEquatorialPlane) {
    group.add(
      makeEquatorialPlane(treatment === 'geometry' ? 0.32 : EQUATORIAL_PLANE_OPACITY),
    )
  }

  if (showAngles) {
    group.add(makeAngleAnnotation(data, treatment === 'geometry'))
  }
}

function makeBond(
  a: [number, number, number],
  b: [number, number, number],
  color: number,
  radius: number,
): THREE.Mesh {
  const start = new THREE.Vector3(...a)
  const end = new THREE.Vector3(...b)
  const direction = new THREE.Vector3().subVectors(end, start)
  const length = direction.length()
  const geom = new THREE.CylinderGeometry(radius, radius, length, 16)
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.6,
    metalness: 0.0,
  })
  const mesh = new THREE.Mesh(geom, mat)
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
  mesh.position.copy(mid)
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  )
  tagObject(mesh, 'bond')
  tagMeshOpacity(mesh, 1)
  return mesh
}

/**
 * Pick wedge / dash / in-plane bond rendering based on the bond's projected
 * angle to the camera forward direction.
 *
 *   |dot| < 0.15  →  in-plane, render as a thin flat cylinder
 *   dot >= 0.15   →  outer atom toward viewer, render as a wedge (cone
 *                    with point at central atom)
 *   dot <= -0.15  →  outer atom behind, render as a dashed cylinder
 */
function makeWedgeOrDashBond(
  a: [number, number, number],
  b: [number, number, number],
  cameraForward: THREE.Vector3,
): THREE.Object3D {
  const start = new THREE.Vector3(...a)
  const end = new THREE.Vector3(...b)
  const direction = new THREE.Vector3().subVectors(end, start)
  const length = direction.length()
  const unit = direction.clone().normalize()
  // Camera forward points INTO the scene. Bond going TOWARD viewer means
  // the outer atom is closer to camera than the inner atom, i.e. the bond
  // direction is mostly opposite the camera forward → dot < 0.
  const dot = unit.dot(cameraForward)

  if (dot < -0.15) {
    return makeWedge(start, end, length, BOND_TOWARD_COLOR)
  }
  if (dot > 0.15) {
    return makeDashedBond(start, end, length, BOND_AWAY_COLOR)
  }
  // In-plane — flat cylinder.
  return makeBond(a, b, BOND_COLOR, BOND_RADIUS)
}

function makeWedge(
  start: THREE.Vector3,
  end: THREE.Vector3,
  length: number,
  color: number,
): THREE.Mesh {
  // Cone with point at the central atom (start) and wide at the outer atom
  // (end). Cone geometry has its apex at +y by default; we orient so apex
  // points toward `start`.
  const geom = new THREE.ConeGeometry(BOND_RADIUS * 2.4, length, 24, 1, false)
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.0,
  })
  const mesh = new THREE.Mesh(geom, mat)
  // Cone default: apex at +y, base at -y. To put apex at start and base at
  // end, place center at midpoint and orient -y toward `direction`.
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
  mesh.position.copy(mid)
  const direction = new THREE.Vector3().subVectors(start, end).normalize()
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
  tagObject(mesh, 'bond')
  tagMeshOpacity(mesh, 1)
  return mesh
}

function makeDashedBond(
  start: THREE.Vector3,
  end: THREE.Vector3,
  length: number,
  color: number,
): THREE.Group {
  // Render as N short cylinders along the bond direction with gaps between.
  const grp = new THREE.Group()
  const segments = 6
  const segLen = length / (segments * 2 - 1)
  const direction = new THREE.Vector3().subVectors(end, start).normalize()
  for (let i = 0; i < segments; i++) {
    const t = (i * 2 * segLen + segLen / 2) / length
    const pos = new THREE.Vector3().lerpVectors(start, end, t)
    const geom = new THREE.CylinderGeometry(BOND_RADIUS * 0.85, BOND_RADIUS * 0.85, segLen, 12)
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.6,
      metalness: 0.0,
    })
    const m = new THREE.Mesh(geom, mat)
    m.position.copy(pos)
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
    tagObject(m, 'bond')
    tagMeshOpacity(m, 1)
    grp.add(m)
  }
  tagObject(grp, 'bond')
  return grp
}

function makeLonePair(
  position: [number, number, number],
  direction: [number, number, number],
): THREE.Mesh {
  const geom = new THREE.SphereGeometry(0.27, 24, 24)
  const mat = new THREE.MeshStandardMaterial({
    color: LONE_PAIR_COLOR,
    transparent: true,
    opacity: LONE_PAIR_OPACITY,
    roughness: 0.4,
    metalness: 0.0,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.position.set(...position)
  const dir = new THREE.Vector3(...direction).normalize()
  mesh.scale.set(0.7, 1.4, 0.7)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  tagObject(mesh, 'lone-pair')
  tagMeshOpacity(mesh, LONE_PAIR_OPACITY)
  return mesh
}

function makeEquatorialPlane(opacity: number): THREE.Group {
  const grp = new THREE.Group()
  const discGeom = new THREE.CircleGeometry(EQUATORIAL_PLANE_RADIUS, 64)
  const discMat = new THREE.MeshBasicMaterial({
    color: EQUATORIAL_PLANE_COLOR,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const disc = new THREE.Mesh(discGeom, discMat)
  disc.rotation.x = -Math.PI / 2
  tagMeshOpacity(disc, opacity)
  grp.add(disc)

  const ringGeom = new THREE.RingGeometry(
    EQUATORIAL_PLANE_RADIUS - 0.02,
    EQUATORIAL_PLANE_RADIUS,
    64,
  )
  const ringMat = new THREE.MeshBasicMaterial({
    color: EQUATORIAL_PLANE_RING_COLOR,
    transparent: true,
    opacity: EQUATORIAL_PLANE_RING_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const ring = new THREE.Mesh(ringGeom, ringMat)
  ring.rotation.x = -Math.PI / 2
  tagMeshOpacity(ring, EQUATORIAL_PLANE_RING_OPACITY)
  grp.add(ring)

  tagObject(grp, 'equatorial-plane')
  return grp
}

function makeAngleAnnotation(data: MoleculeData, prominent: boolean): THREE.Group {
  const grp = new THREE.Group()
  const [iA, iB] = data.bondAnglePair!
  const a = new THREE.Vector3(...data.atoms[iA].position)
  const b = new THREE.Vector3(...data.atoms[iB].position)

  if (data.bondAngle === 180) {
    const lineGeom = new THREE.BufferGeometry().setFromPoints([a, b])
    const lineMat = new THREE.LineBasicMaterial({
      color: ANGLE_LINE_COLOR,
      transparent: true,
      opacity: prominent ? 1 : ANGLE_LINE_OPACITY,
      linewidth: prominent ? 2 : 1,
    })
    const line = new THREE.Line(lineGeom, lineMat)
    tagMeshOpacity(line, prominent ? 1 : ANGLE_LINE_OPACITY)
    grp.add(line)
  }

  const labelPos = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0.55, 0, 0))
  const sprite = makeTextSprite(`${data.bondAngle}°`, prominent)
  sprite.position.copy(labelPos)
  tagMeshOpacity(sprite, 1)
  grp.add(sprite)
  tagObject(grp, 'angle-label')
  return grp
}

function makeTextSprite(text: string, prominent: boolean, colorHex?: number): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const w = 384
  const h = 128
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const color = colorHex !== undefined ? `#${colorHex.toString(16).padStart(6, '0')}` : '#4a4540'
  ctx.fillStyle = color
  ctx.font = `${prominent ? 700 : 500} ${prominent ? 56 : 48}px ui-sans-serif, system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, w / 2, h / 2 + 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    alphaTest: 0.05,
    toneMapped: false,
  })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(0.7, 0.24, 1)
  return sprite
}

function disposeGroup(group: THREE.Group) {
  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh
      m.geometry.dispose()
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      mats.forEach((mat) => mat.dispose())
    } else if ((obj as THREE.Line).isLine) {
      const l = obj as THREE.Line
      l.geometry.dispose()
      ;(l.material as THREE.Material).dispose()
    } else if ((obj as THREE.Sprite).isSprite) {
      const s = obj as THREE.Sprite
      ;(s.material as THREE.SpriteMaterial).map?.dispose()
      ;(s.material as THREE.SpriteMaterial).dispose()
    }
  })
}
