'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { cn } from '@/lib/utils'
import type { Molecule } from '@/lib/artifact-script'
import type { ChipState, RepresentationPanelId } from '@/lib/prototype-store'

/**
 * The 3D molecule viewport — the centerpiece of the artifact.
 *
 * The scene is built from a parameterized 5-domain configuration so the
 * user can scrub a continuous lone-pair count (0..3) and watch the geometry
 * morph through trigonal-bipyramidal → see-saw → T-shape → linear. Each
 * lone pair is also draggable: the user can grab it, swing it around the
 * central atom, and watch the molecule strain when the lone pair lands in
 * a geometrically unfavorable (axial) position. Hover-to-inspect surfaces
 * a small tooltip describing whichever scene element is under the cursor.
 *
 * On top of those explorability primitives, the existing per-panel
 * treatments (lewis/wedge/geometry) and the beat-driven `chipState` toggles
 * still drive the rendering. The two systems coexist: the user can scrub
 * the slider during any beat, and drag lone pairs at any time.
 *
 *   lewis     — camera snaps to a head-on view, FOV collapses toward
 *               orthographic, scene desaturates, depth cues disappear.
 *   wedge     — bonds re-render with wedge/dash visual vocabulary based
 *               on their angle to the camera. Lone pairs hidden.
 *   geometry  — equatorial disc and bond-angle annotation forced on,
 *               atom colors desaturate, lone pairs hidden.
 *   default   — free orbit, all features available.
 */

// ---------------------------------------------------------------------------
// Molecule data — atom positions, bonds, lone pairs, equatorial plane.
// ---------------------------------------------------------------------------

type ElementSymbol = 'Xe' | 'F' | 'Cl'

type AtomDef = {
  element: ElementSymbol
  position: [number, number, number]
  /** 1 = fully visible; <1 fades it (used during continuous LP-count
   *  morphs where an equatorial seat is transitioning between atom and
   *  lone pair). */
  opacity?: number
  /** Stable indices so dragging / hover keys remain consistent across
   *  rebuilds. */
  key: string
  /** Whether this atom is the central (heavier) atom. */
  isCentral?: boolean
}

type BondDef = {
  fromKey: string
  toKey: string
  opacity?: number
}

type LonePairDef = {
  /** Position of the lone-pair cloud center relative to the central atom. */
  position: [number, number, number]
  /** Direction the cloud orients along (radial from central atom). */
  direction: [number, number, number]
  opacity?: number
  /** Stable identity across rebuilds so a drag in progress can keep
   *  targeting the same lone pair. */
  key: string
  /** Whether this lone pair is being dragged right now. The renderer
   *  applies a strain glow proportional to `strain`. */
  isDragging?: boolean
  strain?: number
}

type MoleculeData = {
  atoms: AtomDef[]
  bonds: BondDef[]
  lonePairs: LonePairDef[]
  /** Pair of atom keys defining the bond-angle annotation. */
  bondAngleKeys?: [string, string]
  bondAngle?: number
  hasEquatorialPlane: boolean
  shapeName: string
  /** Central-atom element. Hover-to-inspect surfaces this. */
  centralElement: ElementSymbol
  /** Outer-atom element. */
  outerElement: ElementSymbol
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

const EQUATORIAL_ANGLES_DEG = [0, 120, 240]

/**
 * Build a 5-domain molecule data structure parameterized by lone-pair
 * count. Continuous: a fractional `lpCount` interpolates the seat in
 * transition between atom (opacity 1-t) and lone pair (opacity t).
 *
 * Rule of seating: lone pairs claim equatorial positions first (because
 * equatorial seats have only two neighbors at 90° vs. three for axial).
 * Axial positions hold whatever's left over.
 *   0 LP → 5 atoms (TBP)
 *   1 LP → 1 equatorial LP, 4 atoms (see-saw)
 *   2 LP → 2 equatorial LPs, 3 atoms (T-shape)
 *   3 LP → 3 equatorial LPs, 2 axial atoms (linear)
 */
function parameterized5Domain(
  lpCount: number,
  centralElement: ElementSymbol,
  outerElement: ElementSymbol,
): MoleculeData {
  const clamped = Math.max(0, Math.min(3, lpCount))
  const floor = Math.floor(clamped)
  const frac = clamped - floor

  const atoms: AtomDef[] = [
    { element: centralElement, position: [0, 0, 0], key: 'central', isCentral: true },
  ]
  const bonds: BondDef[] = []
  const lonePairs: LonePairDef[] = []

  // Equatorial seats — fill with lone pairs first.
  EQUATORIAL_ANGLES_DEG.forEach((angle, idx) => {
    const atomPos = equatorialPos(angle, BOND_LEN)
    const lpPos = equatorialPos(angle, LONE_PAIR_RADIAL)
    const lpDir = equatorialPos(angle, 1)
    const atomKey = `eq${idx}-atom`
    const lpKey = `eq${idx}-lp`

    if (idx < floor) {
      // Full lone pair, no atom.
      lonePairs.push({ position: lpPos, direction: lpDir, key: lpKey })
    } else if (idx === floor && frac > 0) {
      // Transitioning seat — both atom and lone pair, opacity blended.
      lonePairs.push({
        position: lpPos,
        direction: lpDir,
        opacity: frac,
        key: lpKey,
      })
      atoms.push({
        element: outerElement,
        position: atomPos,
        opacity: 1 - frac,
        key: atomKey,
      })
      bonds.push({ fromKey: 'central', toKey: atomKey, opacity: 1 - frac })
    } else {
      // Full atom, no lone pair.
      atoms.push({ element: outerElement, position: atomPos, key: atomKey })
      bonds.push({ fromKey: 'central', toKey: atomKey })
    }
  })

  // Axial seats — always atoms (lone pairs don't claim axial seats; they
  // claim equatorial seats first because axial is geometrically tighter).
  atoms.push({ element: outerElement, position: AXIAL_UP, key: 'ax-up' })
  atoms.push({ element: outerElement, position: AXIAL_DOWN, key: 'ax-dn' })
  bonds.push({ fromKey: 'central', toKey: 'ax-up' })
  bonds.push({ fromKey: 'central', toKey: 'ax-dn' })

  const shapeName =
    clamped < 0.5
      ? 'Trigonal bipyramidal'
      : clamped < 1.5
        ? 'See-saw'
        : clamped < 2.5
          ? 'T-shaped'
          : 'Linear'

  return {
    atoms,
    bonds,
    lonePairs,
    bondAngleKeys: ['ax-up', 'ax-dn'],
    bondAngle: 180,
    hasEquatorialPlane: true,
    shapeName,
    centralElement,
    outerElement,
  }
}

/**
 * The "what if a lone pair were axial?" preset used in the axial-strain
 * beats. One lone pair sits at axial-up, one F sits at equatorial 0°, two
 * lone pairs sit at the other equatorial positions, one F stays axial-down.
 * Hand-authored because it's a non-equilibrium configuration that the
 * parameterized 5-domain function (which always seats LPs equatorial first)
 * can't produce.
 */
function xef2AxialStrain(): MoleculeData {
  return {
    atoms: [
      { element: 'Xe', position: [0, 0, 0], key: 'central', isCentral: true },
      { element: 'F', position: AXIAL_DOWN, key: 'ax-dn' },
      { element: 'F', position: equatorialPos(0, BOND_LEN), key: 'eq0-atom' },
    ],
    bonds: [
      { fromKey: 'central', toKey: 'ax-dn' },
      { fromKey: 'central', toKey: 'eq0-atom' },
    ],
    lonePairs: [
      { position: [0, LONE_PAIR_RADIAL, 0], direction: [0, 1, 0], key: 'ax-up-lp' },
      {
        position: equatorialPos(120, LONE_PAIR_RADIAL),
        direction: equatorialPos(120, 1),
        key: 'eq1-lp',
      },
      {
        position: equatorialPos(240, LONE_PAIR_RADIAL),
        direction: equatorialPos(240, 1),
        key: 'eq2-lp',
      },
    ],
    hasEquatorialPlane: true,
    shapeName: 'Strained',
    centralElement: 'Xe',
    outerElement: 'F',
  }
}

export function moleculeNaturalLpCount(name: Molecule): number {
  switch (name) {
    case 'xef2':
      return 3
    case 'clf3':
      return 2
    case 'xef2-axial-strain':
      return 3
  }
}

function moleculeCentralOuter(
  name: Molecule,
): { central: ElementSymbol; outer: ElementSymbol } {
  if (name === 'clf3') return { central: 'Cl', outer: 'F' }
  return { central: 'Xe', outer: 'F' }
}

/**
 * Compute the molecule data for the current scene. Five-domain molecules
 * are routed through the parameterized builder so the slider can morph the
 * lone-pair count continuously; the axial-strain preset is hand-authored
 * because it's a non-equilibrium configuration the builder can't produce.
 */
function effectiveMoleculeData(name: Molecule, lpCount: number): MoleculeData {
  if (name === 'xef2-axial-strain') return xef2AxialStrain()
  const { central, outer } = moleculeCentralOuter(name)
  return parameterized5Domain(lpCount, central, outer)
}

export function moleculeData(name: Molecule): MoleculeData {
  return effectiveMoleculeData(name, moleculeNaturalLpCount(name))
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

const ATOMIC_NUMBER: Record<ElementSymbol, number> = {
  Xe: 54,
  F: 9,
  Cl: 17,
}

const ELECTRON_CONFIG: Record<ElementSymbol, string> = {
  Xe: '[Kr] 4d¹⁰ 5s² 5p⁶',
  F: '[He] 2s² 2p⁵',
  Cl: '[Ne] 3s² 3p⁵',
}

const BOND_RADIUS = 0.07
const BOND_COLOR = 0x9a958e
const BOND_TOWARD_COLOR = 0x4a4540
const BOND_AWAY_COLOR = 0x6b665e

const LONE_PAIR_COLOR = 0x6b46c1
const LONE_PAIR_OPACITY = 0.62
const LONE_PAIR_STRAIN_COLOR = 0xd97a3b

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
    filter: 'none',
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
    filter: 'none',
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

function safeAreaZoom(width: number, height: number, insets: SafeInsets): number {
  if (width <= 0 || height <= 0) return 1
  const horizRatio = (width - insets.right) / width
  const vertRatio = (height - insets.top - insets.bottom) / height
  // 1.15× pushes the molecule a bit larger relative to the safe area; the
  // cap is raised to 1.25 so this can actually take effect for wide layouts.
  const ratio = Math.min(horizRatio, vertRatio) * 1.15
  return Math.max(0.3, Math.min(1.25, ratio))
}

function targetZoomForTreatment(
  _treatment: Treatment,
  width: number,
  height: number,
  insets: SafeInsets,
): number {
  return safeAreaZoom(width, height, insets)
}

// ---------------------------------------------------------------------------
// Hover-tooltip semantics. Each scene object carries a typed `inspect`
// userData payload, computed at build time from the molecule data, that the
// raycaster reads when the pointer hovers over it.
// ---------------------------------------------------------------------------

type InspectAtom = {
  kind: 'atom'
  element: ElementSymbol
  role: 'central' | 'bonded'
}
type InspectBond = {
  kind: 'bond'
  from: ElementSymbol
  to: ElementSymbol
  lengthAngstroms: number
}
type InspectLonePair = {
  kind: 'lone-pair'
  central: ElementSymbol
}
type InspectPlane = { kind: 'equatorial-plane' }
type InspectAngle = { kind: 'angle'; degrees: number; description: string }

type InspectPayload =
  | InspectAtom
  | InspectBond
  | InspectLonePair
  | InspectPlane
  | InspectAngle

const ELEMENT_LABEL: Record<ElementSymbol, string> = {
  Xe: 'Xenon',
  F: 'Fluorine',
  Cl: 'Chlorine',
}

function inspectTitle(p: InspectPayload): string {
  switch (p.kind) {
    case 'atom':
      return `${ELEMENT_LABEL[p.element]} (${p.element})`
    case 'bond':
      return `${p.from}–${p.to} bond`
    case 'lone-pair':
      return `Lone pair on ${p.central}`
    case 'equatorial-plane':
      return 'Equatorial plane'
    case 'angle':
      return `${p.degrees.toFixed(0)}°`
  }
}

function inspectLines(p: InspectPayload): string[] {
  switch (p.kind) {
    case 'atom':
      return [
        `Atomic number: ${ATOMIC_NUMBER[p.element]}`,
        `Config: ${ELECTRON_CONFIG[p.element]}`,
        p.role === 'central' ? 'Central atom' : 'Bonded atom',
      ]
    case 'bond':
      return [
        'Single bond (σ)',
        `Length ≈ ${p.lengthAngstroms.toFixed(2)} Å`,
        'Bond order 1',
      ]
    case 'lone-pair':
      return ['Non-bonding electron pair', 'Drag to reposition']
    case 'equatorial-plane':
      return ['The three equatorial seats in the trigonal bipyramid.']
    case 'angle':
      return [p.description]
  }
}

const USERDATA_INSPECT = 'inspect'
const USERDATA_LP_KEY = 'lpKey'
const USERDATA_LP_STRAIN_GLOW = 'lpGlow'

// ---------------------------------------------------------------------------
// Scene component
// ---------------------------------------------------------------------------

type MoleculeSceneProps = {
  molecule: Molecule
  chipState: ChipState
  /** Drives the per-panel rendering treatment. */
  activePanel?: RepresentationPanelId | null
  /** Continuous lone-pair count (0..3). Lifted to the parent so the LP slider
   *  can live next to the representation toggle group instead of floating
   *  inside the viewport. */
  lpCount: number
  /** Called with positive rotation deltas (radians) every orbit-controls tick.
   *  The parent accumulates these toward the rotation gate. */
  onRotationDelta?: (deltaRad: number) => void
  /** Called when the user clicks the Reset View button while a non-default
   *  treatment is active. The parent should clear `activePanel` in response;
   *  Reset View always resets the camera locally before this fires. */
  onExitTreatment?: () => void
  topOverlayInsetPx?: number
  rightOverlayInsetPx?: number
  bottomOverlayInsetPx?: number
  className?: string
}

export function MoleculeScene({
  molecule,
  chipState,
  activePanel,
  lpCount,
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
    lastBuildForward: THREE.Vector3
    /** Map of LP key → mesh group, used by the drag handler to update the
     *  dragged lone pair's position imperatively each frame. */
    lpMeshes: Map<string, THREE.Object3D>
    /** Map of LP key → strain glow mesh (for drag feedback). */
    lpGlowMeshes: Map<string, THREE.Mesh>
    /** Map of atom key → mesh, used by the deformation pass to push other
     *  atoms away from the dragged lone pair. */
    atomMeshes: Map<string, THREE.Mesh>
    /** Cylinder-bond meshes (default treatment only) tracked so they can
     *  follow atoms as the deformation moves them. */
    bondMeshes: BondMeshInfo[]
  } | null>(null)

  const treatment = panelToTreatment(activePanel ?? null)
  const [filterCss, setFilterCss] = useState<string>('none')

  // --- Drag: tracked entirely outside React state. The pointer handler
  //     updates the dragged LP's mesh imperatively each frame; React only
  //     learns about the drag through scene rebuilds (slider scrubs, beat
  //     changes), which is fine because rebuilds during a drag are rare
  //     and the next pointermove would re-apply the override anyway.
  /** Override position for the dragged LP. The pointermove handler writes
   *  this; the RAF tick (for snap-back) reads it. Never read during render. */
  const dragOverrideRef = useRef<{
    key: string
    position: [number, number, number]
    direction: [number, number, number]
    strain: number
  } | null>(null)
  /** Snap-back animation: when the user releases, the LP eases back to its
   *  stable target position. */
  const snapBackRef = useRef<{
    key: string
    fromPos: [number, number, number]
    toPos: [number, number, number]
    fromDir: [number, number, number]
    toDir: [number, number, number]
    fromStrain: number
    startTs: number
    durationMs: number
  } | null>(null)

  const data = useMemo(
    () => effectiveMoleculeData(molecule, lpCount),
    [molecule, lpCount],
  )
  // The mount-effect's RAF tick needs the latest canonical molecule data so
  // the snap-back animation can deform the rest of the molecule alongside
  // the dragged LP. The tick reads dataRef.current each frame.
  const dataRef = useRef(data)
  useEffect(() => {
    dataRef.current = data
  }, [data])

  // --- Hover tooltip overlay state. --------------------------------------
  const [hover, setHover] = useState<{
    x: number
    y: number
    payload: InspectPayload
  } | null>(null)

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
    controls.maxDistance = 12
    controls.target.set(0, 0, 0)
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.6
    controls.update()

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
    const lpMeshes = new Map<string, THREE.Object3D>()
    const lpGlowMeshes = new Map<string, THREE.Mesh>()
    const atomMeshes = new Map<string, THREE.Mesh>()
    const bondMeshes: BondMeshInfo[] = []
    buildScene(
      moleculeGroup,
      effectiveMoleculeData(molecule, moleculeNaturalLpCount(molecule)),
      chipState,
      'default',
      lastBuildForward,
      false,
      lpMeshes,
      lpGlowMeshes,
      atomMeshes,
      bondMeshes,
    )

    const resetView = () => {
      camera.position.copy(DEFAULT_CAM)
      controls.target.set(0, 0, 0)
      controls.update()
    }

    // Entrance: rotate the molecule group from a small offset back to zero
    // while the wrapper div fades + scales in (motion handles the latter).
    // The CSS animation runs 700ms; Three.js drives the matching 3D
    // rotation over the same window so the two land together.
    const ENTRANCE_MS = 720
    const ENTRANCE_FROM_Y = -0.55 // radians
    moleculeGroup.rotation.y = ENTRANCE_FROM_Y
    const entranceStart = performance.now()

    let rafId = 0
    const tick = () => {
      controls.update()

      // Drive the 3D entrance rotation back to identity.
      if (moleculeGroup.rotation.y !== 0) {
        const t = Math.min((performance.now() - entranceStart) / ENTRANCE_MS, 1)
        const eased = 1 - Math.pow(1 - t, 3)
        moleculeGroup.rotation.y = ENTRANCE_FROM_Y * (1 - eased)
        if (t >= 1) moleculeGroup.rotation.y = 0
      }

      // Snap-back animation: ease the dragged LP back to its stable target
      // after release. The deformation pass re-runs each frame so other atoms
      // and lone pairs glide back to their canonical seats alongside the
      // dragged LP, then we explicitly clear the deformation on the final
      // frame to remove any residual sub-pixel drift.
      const sb = snapBackRef.current
      if (sb) {
        const now = performance.now()
        const t = Math.min((now - sb.startTs) / sb.durationMs, 1)
        const eased = 1 - Math.pow(1 - t, 3)
        const pos: [number, number, number] = [
          sb.fromPos[0] + (sb.toPos[0] - sb.fromPos[0]) * eased,
          sb.fromPos[1] + (sb.toPos[1] - sb.fromPos[1]) * eased,
          sb.fromPos[2] + (sb.toPos[2] - sb.fromPos[2]) * eased,
        ]
        const drd: [number, number, number] = [
          sb.fromDir[0] + (sb.toDir[0] - sb.fromDir[0]) * eased,
          sb.fromDir[1] + (sb.toDir[1] - sb.fromDir[1]) * eased,
          sb.fromDir[2] + (sb.toDir[2] - sb.fromDir[2]) * eased,
        ]
        const strain = sb.fromStrain * (1 - eased)
        applyLpOverride(lpMeshes, lpGlowMeshes, sb.key, pos, drd, strain)
        const currentData = dataRef.current
        applyDeformation(
          sb.key,
          new THREE.Vector3(drd[0], drd[1], drd[2]),
          currentData,
          atomMeshes,
          bondMeshes,
          lpMeshes,
        )
        if (t >= 1) {
          clearDeformation(currentData, atomMeshes, bondMeshes, lpMeshes)
          snapBackRef.current = null
        }
      }

      if (userInteracting) {
        const az = controls.getAzimuthalAngle()
        const pol = controls.getPolarAngle()
        const dAz = Math.abs(az - lastAzimuth)
        const dPol = Math.abs(pol - lastPolar)
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
      lpMeshes,
      lpGlowMeshes,
      atomMeshes,
      bondMeshes,
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
        r.camera.getWorldDirection(r.lastBuildForward)
        disposeGroup(r.moleculeGroup)
        r.moleculeGroup.clear()
        r.lpMeshes.clear()
        r.lpGlowMeshes.clear()
        r.atomMeshes.clear()
        r.bondMeshes.length = 0
        buildScene(
          r.moleculeGroup,
          data,
          chipState,
          treatment,
          r.lastBuildForward,
          true,
          r.lpMeshes,
          r.lpGlowMeshes,
          r.atomMeshes,
          r.bondMeshes,
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

  // Rebuild on molecule data change (cross-fade molecule swap when topology
  // changes, immediate rebuild for slider-driven LP-count changes since the
  // continuous morph already handles smoothness).
  const prevDataRef = useRef<MoleculeData | null>(null)
  useEffect(() => {
    const r = refs.current
    if (!r) return
    const prev = prevDataRef.current
    prevDataRef.current = data
    const isInitial = prev === null
    // Topology change → atom or lp keys differ. Slider scrub keeps the same
    // keys so we don't want to cross-fade for every micro-update.
    const sameTopology =
      prev &&
      prev.atoms.length === data.atoms.length &&
      prev.lonePairs.length === data.lonePairs.length &&
      prev.atoms.every((a, i) => a.key === data.atoms[i]?.key) &&
      prev.lonePairs.every((lp, i) => lp.key === data.lonePairs[i]?.key)

    if (isInitial || sameTopology) {
      r.camera.getWorldDirection(r.lastBuildForward)
      disposeGroup(r.moleculeGroup)
      r.moleculeGroup.clear()
      r.lpMeshes.clear()
      r.lpGlowMeshes.clear()
      r.atomMeshes.clear()
      r.bondMeshes.length = 0
      buildScene(
        r.moleculeGroup,
        data,
        chipState,
        treatment,
        r.lastBuildForward,
        true,
        r.lpMeshes,
        r.lpGlowMeshes,
        r.atomMeshes,
        r.bondMeshes,
      )
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
          r.lpMeshes.clear()
          r.lpGlowMeshes.clear()
          r.atomMeshes.clear()
          r.bondMeshes.length = 0
          buildScene(
            r.moleculeGroup,
            data,
            chipState,
            treatment,
            r.lastBuildForward,
            true,
            r.lpMeshes,
            r.lpGlowMeshes,
            r.atomMeshes,
            r.bondMeshes,
          )
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

  // --- Pointer interactions: hover-to-inspect, drag-to-reposition. -------
  useEffect(() => {
    const refsSnapshot = refs.current
    if (!refsSnapshot) return
    const r = refsSnapshot
    const canvas = r.renderer.domElement

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const dragPlanePoint = new THREE.Vector3()
    let hoverTimeout: number | null = null
    let activeDrag: { key: string } | null = null
    // Currently-illuminated inspectable root + the per-mesh emissive values
    // we stashed so we can restore them when the cursor moves off. Three.js
    // materials don't expose a "lighten by X" API, so we mutate emissive
    // directly and remember the original.
    let illuminatedRoot: THREE.Object3D | null = null
    const stashedEmissive = new Map<THREE.MeshStandardMaterial, THREE.Color>()
    const HOVER_EMISSIVE = new THREE.Color(0xffe0a8)
    const HOVER_EMISSIVE_INTENSITY = 0.22
    const illuminate = (root: THREE.Object3D) => {
      root.traverse((c) => {
        const mesh = c as THREE.Mesh
        const mat = mesh.material as THREE.MeshStandardMaterial | undefined
        if (!mat || !('emissive' in mat)) return
        if (stashedEmissive.has(mat)) return
        stashedEmissive.set(mat, mat.emissive.clone())
        mat.emissive.copy(HOVER_EMISSIVE)
        mat.emissiveIntensity = HOVER_EMISSIVE_INTENSITY
      })
    }
    const dim = () => {
      for (const [mat, orig] of stashedEmissive) {
        mat.emissive.copy(orig)
        mat.emissiveIntensity = 1
      }
      stashedEmissive.clear()
      illuminatedRoot = null
    }

    const setPointerFromEvent = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }

    const intersect = (): THREE.Intersection[] => {
      raycaster.setFromCamera(pointer, r.camera)
      return raycaster.intersectObject(r.moleculeGroup, true)
    }

    const findInspectable = (hits: THREE.Intersection[]): {
      payload: InspectPayload
      lpKey?: string
      root: THREE.Object3D
    } | null => {
      for (const hit of hits) {
        let obj: THREE.Object3D | null = hit.object
        while (obj) {
          const payload = obj.userData[USERDATA_INSPECT] as InspectPayload | undefined
          if (payload) {
            const lpKey = obj.userData[USERDATA_LP_KEY] as string | undefined
            return { payload, lpKey, root: obj }
          }
          obj = obj.parent
        }
      }
      return null
    }

    const onPointerMove = (e: PointerEvent) => {
      setPointerFromEvent(e)

      // Drag in progress: project pointer onto a sphere of radius
      // LONE_PAIR_RADIAL around the central atom and update the LP.
      if (activeDrag) {
        raycaster.setFromCamera(pointer, r.camera)
        const origin = raycaster.ray.origin
        const dir = raycaster.ray.direction
        // Sphere of radius R at origin. Solve (origin + t*dir)·(origin + t*dir) = R^2.
        const R = LONE_PAIR_RADIAL
        const a = dir.dot(dir)
        const b = 2 * origin.dot(dir)
        const c = origin.dot(origin) - R * R
        const disc = b * b - 4 * a * c
        const pt = new THREE.Vector3()
        if (disc >= 0) {
          const sq = Math.sqrt(disc)
          const t1 = (-b - sq) / (2 * a)
          const t2 = (-b + sq) / (2 * a)
          const t = t1 > 0 ? t1 : t2
          pt.copy(origin).add(dir.clone().multiplyScalar(t))
        } else {
          // Pointer ray misses the sphere — drop a perpendicular from the
          // center onto the ray, normalize to the sphere surface.
          const closestT = -origin.dot(dir) / a
          pt.copy(origin).add(dir.clone().multiplyScalar(closestT))
          pt.setLength(R)
        }
        dragPlanePoint.copy(pt)
        // Strain: count the dragged LP's neighbors at < 100° angular
        // distance, weighted by 1/(angle^2). Equatorial seats have two
        // neighbors at 90°; axial seats have three at 90° — the latter
        // produces a noticeably higher strain, which we render as a glow.
        const normalized = pt.clone().normalize()
        const strain = computeStrainAtDirection(normalized, data, activeDrag.key)
        const position: [number, number, number] = [pt.x, pt.y, pt.z]
        const direction: [number, number, number] = [
          normalized.x,
          normalized.y,
          normalized.z,
        ]
        dragOverrideRef.current = {
          key: activeDrag.key,
          position,
          direction,
          strain,
        }
        applyLpOverride(r.lpMeshes, r.lpGlowMeshes, activeDrag.key, position, direction, strain)
        applyDeformation(
          activeDrag.key,
          normalized,
          data,
          r.atomMeshes,
          r.bondMeshes,
          r.lpMeshes,
        )
        return
      }

      // Suppress hover while any pointer button is held — this covers both
      // LP drag (handled above) and OrbitControls camera rotation, neither
      // of which should reveal a tooltip mid-interaction.
      if (e.buttons > 0) {
        if (hoverTimeout !== null) {
          window.clearTimeout(hoverTimeout)
          hoverTimeout = null
        }
        setHover(null)
        dim()
        return
      }

      // Hover-to-inspect path. Throttle by clearing any pending tooltip
      // schedule and re-scheduling with a short delay so the tooltip
      // doesn't flicker as the cursor moves across a single element.
      const hits = intersect()
      const found = findInspectable(hits)
      if (!found) {
        if (hoverTimeout !== null) {
          window.clearTimeout(hoverTimeout)
          hoverTimeout = null
        }
        setHover(null)
        canvas.style.cursor = 'default'
        dim()
        return
      }

      canvas.style.cursor = found.lpKey ? 'grab' : 'default'

      // Swap illumination if the hovered root changed.
      if (illuminatedRoot !== found.root) {
        dim()
        illuminate(found.root)
        illuminatedRoot = found.root
      }

      if (hoverTimeout !== null) window.clearTimeout(hoverTimeout)
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      // Immediate update of position so the tooltip tracks the cursor; the
      // payload itself is cheap to update too.
      setHover({ x, y, payload: found.payload })
    }

    const onPointerLeave = () => {
      if (hoverTimeout !== null) {
        window.clearTimeout(hoverTimeout)
        hoverTimeout = null
      }
      setHover(null)
      canvas.style.cursor = 'default'
      dim()
    }

    const onPointerDown = (e: PointerEvent) => {
      setPointerFromEvent(e)
      // Any pointer-down hides the hover tooltip — whether the user is about
      // to drag a lone pair or rotate the camera, the tooltip should clear.
      if (hoverTimeout !== null) {
        window.clearTimeout(hoverTimeout)
        hoverTimeout = null
      }
      setHover(null)
      dim()
      const hits = intersect()
      const found = findInspectable(hits)
      if (!found || !found.lpKey) return
      e.preventDefault()
      e.stopPropagation()
      activeDrag = { key: found.lpKey }
      // Cancel any in-flight snap-back targeting the same LP.
      if (snapBackRef.current && snapBackRef.current.key === found.lpKey) {
        snapBackRef.current = null
      }
      r.controls.enabled = false
      canvas.style.cursor = 'grabbing'
      canvas.setPointerCapture?.(e.pointerId)
    }

    const onPointerUp = (e: PointerEvent) => {
      if (!activeDrag) return
      const key = activeDrag.key
      const override = dragOverrideRef.current
      activeDrag = null
      r.controls.enabled = true
      canvas.style.cursor = 'default'
      canvas.releasePointerCapture?.(e.pointerId)

      // Snap back: ease toward the LP's stable target position. For the
      // parameterized 5-domain molecules the stable seats are equatorial;
      // pick the nearest one to where the user released.
      if (override) {
        const fromPos = override.position
        const fromDir = override.direction
        const target = nearestStableSeatForLp(key, override.direction, data)
        snapBackRef.current = {
          key,
          fromPos,
          toPos: target.position,
          fromDir,
          toDir: target.direction,
          fromStrain: override.strain,
          startTs: performance.now(),
          durationMs: 380,
        }
      }
      dragOverrideRef.current = null
    }

    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)

    return () => {
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      if (hoverTimeout !== null) window.clearTimeout(hoverTimeout)
      dim()
    }
  }, [data])

  return (
    <motion.div
      className={cn('relative size-full', className)}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.72, ease: [0.22, 0.8, 0.36, 1] }}
    >
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
      {hover && <InspectTooltip x={hover.x} y={hover.y} payload={hover.payload} />}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Strain computation + stable-seat picking for drag.
// ---------------------------------------------------------------------------

/**
 * Approximate VSEPR strain: sum of inverse-squared angular distances from
 * the test direction to every other electron pair (atom or lone pair).
 * Axial positions have three neighbors at 90°, equatorial only two — so
 * axial drag produces a notably higher score, which we map to a glow.
 */
function computeStrainAtDirection(
  dirNorm: THREE.Vector3,
  data: MoleculeData,
  ownLpKey: string,
): number {
  const others: THREE.Vector3[] = []
  for (const atom of data.atoms) {
    if (atom.isCentral) continue
    const v = new THREE.Vector3(...atom.position)
    if (v.length() < 1e-3) continue
    others.push(v.normalize())
  }
  for (const lp of data.lonePairs) {
    if (lp.key === ownLpKey) continue
    const v = new THREE.Vector3(...lp.direction)
    if (v.length() < 1e-3) continue
    others.push(v.normalize())
  }
  let total = 0
  for (const o of others) {
    const cos = THREE.MathUtils.clamp(dirNorm.dot(o), -1, 1)
    const angle = Math.acos(cos) // radians, 0..π
    if (angle < 0.05) return 4 // overlap — max strain
    total += 1 / (angle * angle)
  }
  // Normalize to 0..1 range where 1 ≈ "axial in a 5-domain system, lone
  // pair surrounded by three neighbors at 90°".
  return Math.min(1, total / 8)
}

/**
 * Find the stable seat for a given lone pair on release. For a 5-domain
 * molecule, lone pairs prefer equatorial seats; pick the equatorial
 * direction with the lowest residual strain that isn't already occupied by
 * another lone pair.
 */
function nearestStableSeatForLp(
  ownLpKey: string,
  currentDir: [number, number, number],
  data: MoleculeData,
): { position: [number, number, number]; direction: [number, number, number] } {
  const occupied = new Set<string>()
  for (const lp of data.lonePairs) {
    if (lp.key === ownLpKey) continue
    occupied.add(seatLabelForDirection(new THREE.Vector3(...lp.direction)))
  }
  for (const atom of data.atoms) {
    if (atom.isCentral) continue
    const v = new THREE.Vector3(...atom.position)
    if (v.length() < 1e-3) continue
    occupied.add(seatLabelForDirection(v.normalize()))
  }
  const cur = new THREE.Vector3(...currentDir).normalize()
  const candidates: { label: string; dir: THREE.Vector3 }[] = EQUATORIAL_ANGLES_DEG.map(
    (a) => ({
      label: `eq:${a}`,
      dir: new THREE.Vector3(...equatorialPos(a, 1)),
    }),
  )
  // Prefer unoccupied seats with the smallest angular distance to where
  // the user released. If all equatorial seats are occupied (shouldn't
  // happen at 3 LPs because the dragged one is excluded), fall back to
  // the closest seat regardless.
  candidates.sort((a, b) => {
    const aOcc = occupied.has(a.label) ? 1 : 0
    const bOcc = occupied.has(b.label) ? 1 : 0
    if (aOcc !== bOcc) return aOcc - bOcc
    return cur.angleTo(b.dir) - cur.angleTo(a.dir) > 0 ? -1 : 1
  })
  const chosen = candidates[0]!.dir
  return {
    position: [
      chosen.x * LONE_PAIR_RADIAL,
      chosen.y * LONE_PAIR_RADIAL,
      chosen.z * LONE_PAIR_RADIAL,
    ],
    direction: [chosen.x, chosen.y, chosen.z],
  }
}

function seatLabelForDirection(dir: THREE.Vector3): string {
  if (Math.abs(dir.y) > 0.85) return dir.y > 0 ? 'ax:up' : 'ax:dn'
  let bestAngle = Math.PI
  let bestLabel = 'eq:0'
  for (const a of EQUATORIAL_ANGLES_DEG) {
    const v = new THREE.Vector3(...equatorialPos(a, 1))
    const ang = dir.angleTo(v)
    if (ang < bestAngle) {
      bestAngle = ang
      bestLabel = `eq:${a}`
    }
  }
  return bestLabel
}

// ---------------------------------------------------------------------------
// Slider + tooltip overlays.
// ---------------------------------------------------------------------------

export function lpShapeLabel(n: number): string {
  return n < 0.5
    ? 'trigonal bipyramidal'
    : n < 1.5
      ? 'see-saw'
      : n < 2.5
        ? 'T-shaped'
        : 'linear'
}

/** Compact horizontal control that sits inline with the representation
 *  toggle group at the bottom of the viewport. The shape name is the
 *  label; the value display lives on the right. */
export function LonePairSlider({
  value,
  onChange,
  className,
}: {
  value: number
  onChange: (v: number) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'pointer-events-auto flex items-center gap-2 text-[11px]',
        className,
      )}
    >
      <span className="text-text-tertiary whitespace-nowrap">Lone pairs</span>
      <input
        type="range"
        min={0}
        max={3}
        step={0.05}
        value={value}
        onChange={(e) => {
          const raw = parseFloat(e.target.value)
          // Soft snap-to-tick: integers within 0.12 pull to the integer so
          // the user feels a gentle detent but can hold intermediate values.
          const nearest = Math.round(raw)
          const snapped = Math.abs(raw - nearest) < 0.12 ? nearest : raw
          onChange(snapped)
        }}
        className="h-1 w-[96px] cursor-pointer"
        aria-label="Lone-pair count"
      />
      <span className="text-text-secondary tabular-nums font-medium whitespace-nowrap">
        {value.toFixed(1)}
      </span>
      {/* Min-width reserves room for the longest shape ("trigonal
          bipyramidal") so the label can change without shifting the slider. */}
      <span className="text-text-tertiary inline-block min-w-[120px] italic whitespace-nowrap">
        {lpShapeLabel(value)}
      </span>
    </div>
  )
}

function InspectTooltip({
  x,
  y,
  payload,
}: {
  x: number
  y: number
  payload: InspectPayload
}) {
  // Offset from the cursor so the tooltip doesn't sit underneath the
  // cursor itself and trigger flicker as the pointer moves into it.
  const offsetX = 14
  const offsetY = 14
  return (
    <div
      style={{
        left: `${x + offsetX}px`,
        top: `${y + offsetY}px`,
        maxWidth: '220px',
      }}
      className={cn(
        'border-border-subtle bg-page/95 pointer-events-none absolute z-20 flex flex-col gap-0.5',
        'rounded-md border px-2 py-1.5 text-[11px] shadow-sm backdrop-blur-sm',
      )}
    >
      <span className="text-text-primary font-medium">{inspectTitle(payload)}</span>
      {inspectLines(payload).map((line, i) => (
        <span key={i} className="text-text-tertiary leading-snug">
          {line}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overlays — legend (what's in the scene) and reset-view affordance.
// ---------------------------------------------------------------------------

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
  const showPlane =
    (chipState.equatorialPlane || treatment === 'geometry') &&
    treatment !== 'lewis' &&
    treatment !== 'wedge'

  if (!showLonePairs && !showPlane && treatment !== 'wedge') return null

  const top = topInsetPx > 0 ? topInsetPx - 4 : 8
  return (
    <div
      style={{ top: `${top}px`, left: 12 }}
      className="text-text-secondary pointer-events-none absolute z-10 flex flex-row items-center gap-3 text-[12px]"
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

type OpacityLayers = {
  base: number
  transition: number
}
const USERDATA_OPACITY = 'opacity'

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
 * Imperatively update the dragged LP's mesh position + glow during drag /
 * snap-back, without going through a React rebuild.
 */
function applyLpOverride(
  lpMeshes: Map<string, THREE.Object3D>,
  glowMeshes: Map<string, THREE.Mesh>,
  key: string,
  position: [number, number, number],
  direction: [number, number, number],
  strain: number,
) {
  const mesh = lpMeshes.get(key)
  if (mesh) {
    mesh.position.set(...position)
    const dir = new THREE.Vector3(...direction).normalize()
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  }
  const glow = glowMeshes.get(key)
  if (glow) {
    glow.position.set(...position)
    const mat = glow.material as THREE.MeshBasicMaterial
    // Strain 0 → invisible, 1 → a soft warm halo. Kept deliberately subtle:
    // the brief asks for "not red flashing, not error states."
    mat.opacity = 0.32 * strain
    const scale = 1 + strain * 0.18
    glow.scale.set(scale, scale, scale)
  }
}

/**
 * Deform the rest of the molecule while one LP is being dragged. Approximates
 * VSEPR repulsion: every non-dragged electron pair (LPs and bonded atoms) gets
 * pushed tangent-to-its-radial-seat away from every other pair, weighted by
 * inverse-square angular distance, then renormalized back to its sphere.
 *
 * Lone pairs exert a slightly stronger repulsion than bonded atoms (real VSEPR
 * behavior: LP > BP). The dragged LP is treated as a strong influence at its
 * current direction, which is what produces the "F atoms get crowded, bond
 * angles compress, molecule visibly resists" demo moment when the user pulls
 * a lone pair toward an axial position.
 *
 * Bonds are followed by re-positioning + scaling their cylinders to span the
 * updated atom positions.
 */
function applyDeformation(
  dragKey: string,
  dragDir: THREE.Vector3,
  data: MoleculeData,
  atomMeshes: Map<string, THREE.Mesh>,
  bondMeshes: BondMeshInfo[],
  lpMeshes: Map<string, THREE.Object3D>,
) {
  const LP_WEIGHT = 1.25
  const ATOM_WEIGHT = 1.0
  // Maximum angular deflection from canonical seat, in radians. Tangent
  // magnitudes above this get clamped so a strained position can't fling a
  // pair past its neighbors.
  const MAX_DEFLECT_RAD = 0.55
  const STRENGTH = 0.18

  type Pair = {
    key: string
    canonicalDir: THREE.Vector3
    currentDir: THREE.Vector3
    radius: number
    weight: number
    kind: 'atom' | 'lp'
  }
  const pairs: Pair[] = []
  for (const atom of data.atoms) {
    if (atom.isCentral) continue
    const v = new THREE.Vector3(...atom.position)
    if (v.length() < 1e-3) continue
    const canonical = v.clone().normalize()
    pairs.push({
      key: atom.key,
      canonicalDir: canonical,
      currentDir: canonical.clone(),
      radius: v.length(),
      weight: ATOM_WEIGHT,
      kind: 'atom',
    })
  }
  for (const lp of data.lonePairs) {
    const baseDir = new THREE.Vector3(...lp.direction)
    if (baseDir.length() < 1e-3) continue
    const canonical = baseDir.clone().normalize()
    // For the dragged LP, replace canonical direction with the cursor
    // position so the others react to where the user has pulled it.
    const isDragged = lp.key === dragKey
    const current = isDragged ? dragDir.clone().normalize() : canonical.clone()
    pairs.push({
      key: lp.key,
      canonicalDir: canonical,
      currentDir: current,
      radius: LONE_PAIR_RADIAL,
      weight: LP_WEIGHT,
      kind: 'lp',
    })
  }

  // One-pass relaxation: for every non-dragged pair, sum the repulsion
  // contributions from all OTHER pairs (including the dragged LP at its
  // current direction). Each contribution is the tangent direction away from
  // the neighbor, scaled by 1/angle² with a floor so coincident pairs don't
  // produce infinite force. The resulting tangent vector is clamped to
  // MAX_DEFLECT_RAD before rotating the canonical seat by that angle.
  const tmpAxis = new THREE.Vector3()
  for (const p of pairs) {
    if (p.key === dragKey) continue
    const tangent = new THREE.Vector3(0, 0, 0)
    for (const o of pairs) {
      if (o.key === p.key) continue
      // Vector pointing FROM the neighbor's current position TO p's
      // canonical seat, projected onto p's tangent plane. This is the
      // direction p should move to get away from the neighbor.
      const away = p.canonicalDir.clone().sub(o.currentDir)
      const awayLenSq = away.lengthSq()
      if (awayLenSq < 1e-8) continue
      away.normalize()
      // Project to p's tangent plane.
      const radial = away.dot(p.canonicalDir)
      const tangentDir = away.sub(p.canonicalDir.clone().multiplyScalar(radial))
      const tangentLen = tangentDir.length()
      if (tangentLen < 1e-6) continue
      tangentDir.normalize()
      // Angular distance between p's canonical seat and o's current direction.
      // Clamped so coincident pairs don't blow up the inverse-square term.
      const cosA = THREE.MathUtils.clamp(p.canonicalDir.dot(o.currentDir), -1, 1)
      const angle = Math.max(Math.acos(cosA), 0.18)
      const magnitude = (o.weight / (angle * angle)) * STRENGTH
      tangent.add(tangentDir.multiplyScalar(magnitude))
    }
    // Convert the tangent vector into an axis-angle rotation around the
    // center, then rotate the canonical seat by that amount. This keeps the
    // result on the unit sphere without renormalization weirdness.
    const tangentMag = Math.min(tangent.length(), MAX_DEFLECT_RAD)
    if (tangentMag < 1e-4) {
      if (p.kind === 'atom') {
        const mesh = atomMeshes.get(p.key)
        if (mesh) mesh.position.copy(p.canonicalDir).multiplyScalar(p.radius)
      } else {
        const mesh = lpMeshes.get(p.key)
        if (mesh) {
          mesh.position.copy(p.canonicalDir).multiplyScalar(p.radius)
          mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.canonicalDir)
        }
      }
      continue
    }
    tangent.normalize()
    tmpAxis.crossVectors(p.canonicalDir, tangent).normalize()
    const q = new THREE.Quaternion().setFromAxisAngle(tmpAxis, tangentMag)
    const newDir = p.canonicalDir.clone().applyQuaternion(q).normalize()

    if (p.kind === 'atom') {
      const mesh = atomMeshes.get(p.key)
      if (mesh) mesh.position.copy(newDir).multiplyScalar(p.radius)
    } else {
      const mesh = lpMeshes.get(p.key)
      if (mesh) {
        mesh.position.copy(newDir).multiplyScalar(p.radius)
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), newDir)
      }
    }
  }

  // Follow-up: update bonds to span the (possibly moved) atom positions.
  // The bond cylinders were built with their natural length baked into the
  // geometry; we reposition + reorient + scale-along-Y so they stay attached.
  if (bondMeshes.length === 0) return
  const central = new THREE.Vector3(0, 0, 0)
  for (const bm of bondMeshes) {
    const fromMesh = atomMeshes.get(bm.fromKey)
    const toMesh = atomMeshes.get(bm.toKey)
    const fromPos = fromMesh ? fromMesh.position : central
    const toPos = toMesh ? toMesh.position : central
    const dir = toPos.clone().sub(fromPos)
    const newLength = dir.length()
    if (newLength < 1e-4) continue
    const mid = fromPos.clone().add(toPos).multiplyScalar(0.5)
    bm.mesh.position.copy(mid)
    bm.mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    )
    bm.mesh.scale.y = newLength / bm.origLength
  }
}

/** Snap every atom and bond back to its canonical (non-deformed) layout.
 *  Called when the drag ends and the snap-back finishes. */
function clearDeformation(
  data: MoleculeData,
  atomMeshes: Map<string, THREE.Mesh>,
  bondMeshes: BondMeshInfo[],
  lpMeshes: Map<string, THREE.Object3D>,
  excludeLpKey?: string,
) {
  for (const atom of data.atoms) {
    if (atom.isCentral) continue
    const mesh = atomMeshes.get(atom.key)
    if (mesh) mesh.position.set(...atom.position)
  }
  for (const lp of data.lonePairs) {
    if (lp.key === excludeLpKey) continue
    const mesh = lpMeshes.get(lp.key)
    if (mesh) {
      mesh.position.set(...lp.position)
      const dir = new THREE.Vector3(...lp.direction).normalize()
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    }
  }
  for (const bm of bondMeshes) {
    bm.mesh.scale.y = 1
    const fromMesh = atomMeshes.get(bm.fromKey)
    const toMesh = atomMeshes.get(bm.toKey)
    if (!fromMesh || !toMesh) continue
    const dir = toMesh.position.clone().sub(fromMesh.position)
    const newLength = dir.length()
    if (newLength < 1e-4) continue
    const mid = fromMesh.position.clone().add(toMesh.position).multiplyScalar(0.5)
    bm.mesh.position.copy(mid)
    bm.mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    )
    bm.mesh.scale.y = newLength / bm.origLength
  }
}

type BondMeshInfo = {
  mesh: THREE.Object3D
  fromKey: string
  toKey: string
  origLength: number
}

function buildScene(
  group: THREE.Group,
  data: MoleculeData,
  chipState: ChipState,
  treatment: Treatment,
  cameraForward: THREE.Vector3,
  fullBuild: boolean,
  lpMeshes: Map<string, THREE.Object3D>,
  lpGlowMeshes: Map<string, THREE.Mesh>,
  atomMeshes: Map<string, THREE.Mesh>,
  bondMeshes: BondMeshInfo[],
) {
  const showLonePairs = chipState.lonePairs && treatment !== 'wedge' && treatment !== 'geometry'
  const showEquatorialPlane =
    (chipState.equatorialPlane || treatment === 'geometry') &&
    data.hasEquatorialPlane &&
    treatment !== 'wedge' &&
    treatment !== 'lewis'
  const showAngles =
    (chipState.angles || treatment === 'geometry') &&
    !!data.bondAngleKeys &&
    data.bondAngle !== undefined &&
    treatment !== 'wedge' &&
    treatment !== 'lewis'

  const atomByKey = new Map<string, AtomDef>()
  for (const atom of data.atoms) {
    atomByKey.set(atom.key, atom)
    const geom = new THREE.SphereGeometry(ATOM_RADIUS[atom.element], 32, 32)
    const color = new THREE.Color(ATOM_COLOR[atom.element])
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: treatment === 'lewis' ? 0.95 : 0.55,
      metalness: 0.0,
      flatShading: treatment === 'lewis',
    })
    const mesh = new THREE.Mesh(geom, mat)
    mesh.position.set(...atom.position)
    mesh.userData[USERDATA_INSPECT] = {
      kind: 'atom',
      element: atom.element,
      role: atom.isCentral ? 'central' : 'bonded',
    } satisfies InspectAtom
    tagMeshOpacity(mesh, atom.opacity ?? 1)
    group.add(mesh)
    atomMeshes.set(atom.key, mesh)
  }

  if (!fullBuild) return

  // Bonds — style depends on treatment.
  if (chipState.bonds) {
    for (const bond of data.bonds) {
      const a = atomByKey.get(bond.fromKey)
      const b = atomByKey.get(bond.toKey)
      if (!a || !b) continue
      let obj: THREE.Object3D
      if (treatment === 'wedge') {
        obj = makeWedgeOrDashBond(a.position, b.position, cameraForward)
      } else if (treatment === 'lewis') {
        obj = makeBond(a.position, b.position, 0x2f2c28, BOND_RADIUS * 0.7)
      } else {
        obj = makeBond(a.position, b.position, BOND_COLOR, BOND_RADIUS)
      }
      const length = new THREE.Vector3(...a.position).distanceTo(
        new THREE.Vector3(...b.position),
      )
      const inspect: InspectBond = {
        kind: 'bond',
        from: a.element,
        to: b.element,
        // Bond length is roughly 1.2 scene units; XeF2 bond length is ~2.00 Å
        // experimentally. We scale 1 scene unit ≈ 1.67 Å for the readout.
        lengthAngstroms: length * 1.67,
      }
      attachInspectRecursive(obj, inspect)
      // Apply per-bond opacity (used for the fractional LP-count seat
      // transitioning between bonded atom and lone pair).
      const baseOpacity = bond.opacity ?? 1
      if (baseOpacity < 1) {
        obj.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) {
            tagMeshOpacity(c as THREE.Mesh, baseOpacity)
          }
        })
      }
      group.add(obj)
      // Track only the default-treatment cylinder bonds for deformation;
      // wedge/dash bonds aren't dragged-against.
      if (treatment === 'default') {
        bondMeshes.push({ mesh: obj, fromKey: bond.fromKey, toKey: bond.toKey, origLength: length })
      }
    }
  }

  if (showLonePairs) {
    for (const lp of data.lonePairs) {
      const lpGroup = new THREE.Group()
      const cloud = makeLonePair(lp.position, lp.direction, lp.opacity ?? LONE_PAIR_OPACITY)
      cloud.userData[USERDATA_INSPECT] = {
        kind: 'lone-pair',
        central: data.centralElement,
      } satisfies InspectLonePair
      cloud.userData[USERDATA_LP_KEY] = lp.key
      lpGroup.add(cloud)
      // Strain glow — a slightly larger translucent sphere co-located
      // with the LP cloud. Starts invisible; the drag handler raises its
      // opacity in proportion to strain.
      const glowGeom = new THREE.SphereGeometry(0.34, 24, 24)
      const glowMat = new THREE.MeshBasicMaterial({
        color: LONE_PAIR_STRAIN_COLOR,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
      const glow = new THREE.Mesh(glowGeom, glowMat)
      glow.position.set(...lp.position)
      glow.userData[USERDATA_LP_STRAIN_GLOW] = true
      lpGroup.add(glow)
      group.add(lpGroup)
      lpMeshes.set(lp.key, cloud)
      lpGlowMeshes.set(lp.key, glow)
    }
  }

  if (showEquatorialPlane) {
    const plane = makeEquatorialPlane(
      treatment === 'geometry' ? 0.32 : EQUATORIAL_PLANE_OPACITY,
    )
    plane.userData[USERDATA_INSPECT] = { kind: 'equatorial-plane' } satisfies InspectPlane
    group.add(plane)
  }

  if (showAngles) {
    const annot = makeAngleAnnotation(data, treatment === 'geometry')
    if (annot) {
      const inspect: InspectAngle = {
        kind: 'angle',
        degrees: data.bondAngle!,
        description: 'Axial–axial: two F atoms 180° apart',
      }
      attachInspectRecursive(annot, inspect)
      group.add(annot)
    }
  }
}

function attachInspectRecursive(obj: THREE.Object3D, payload: InspectPayload) {
  obj.userData[USERDATA_INSPECT] = payload
  obj.traverse((c) => {
    c.userData[USERDATA_INSPECT] = payload
  })
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
  tagMeshOpacity(mesh, 1)
  return mesh
}

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
  const dot = unit.dot(cameraForward)

  if (dot < -0.15) {
    return makeWedge(start, end, length, BOND_TOWARD_COLOR)
  }
  if (dot > 0.15) {
    return makeDashedBond(start, end, length, BOND_AWAY_COLOR)
  }
  return makeBond(a, b, BOND_COLOR, BOND_RADIUS)
}

function makeWedge(
  start: THREE.Vector3,
  end: THREE.Vector3,
  length: number,
  color: number,
): THREE.Mesh {
  const geom = new THREE.ConeGeometry(BOND_RADIUS * 2.4, length, 24, 1, false)
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.0,
  })
  const mesh = new THREE.Mesh(geom, mat)
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
  mesh.position.copy(mid)
  const direction = new THREE.Vector3().subVectors(start, end).normalize()
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
  tagMeshOpacity(mesh, 1)
  return mesh
}

function makeDashedBond(
  start: THREE.Vector3,
  end: THREE.Vector3,
  length: number,
  color: number,
): THREE.Group {
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
    tagMeshOpacity(m, 1)
    grp.add(m)
  }
  return grp
}

function makeLonePair(
  position: [number, number, number],
  direction: [number, number, number],
  baseOpacity: number,
): THREE.Mesh {
  const geom = new THREE.SphereGeometry(0.27, 24, 24)
  const mat = new THREE.MeshStandardMaterial({
    color: LONE_PAIR_COLOR,
    transparent: true,
    opacity: baseOpacity,
    roughness: 0.4,
    metalness: 0.0,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.position.set(...position)
  const dir = new THREE.Vector3(...direction).normalize()
  mesh.scale.set(0.7, 1.4, 0.7)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  tagMeshOpacity(mesh, baseOpacity)
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

  return grp
}

function makeAngleAnnotation(data: MoleculeData, prominent: boolean): THREE.Group | null {
  if (!data.bondAngleKeys || data.bondAngle === undefined) return null
  const atomByKey = new Map<string, AtomDef>()
  for (const a of data.atoms) atomByKey.set(a.key, a)
  const aDef = atomByKey.get(data.bondAngleKeys[0])
  const bDef = atomByKey.get(data.bondAngleKeys[1])
  if (!aDef || !bDef) return null
  const grp = new THREE.Group()
  const a = new THREE.Vector3(...aDef.position)
  const b = new THREE.Vector3(...bDef.position)

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

  // Park the degrees label on the +x edge of the equatorial circle so it
  // reads off the ring rather than crowding the central atom.
  const labelPos = new THREE.Vector3(EQUATORIAL_PLANE_RADIUS + 0.18, 0, 0)
  const sprite = makeTextSprite(`${data.bondAngle}°`, prominent)
  sprite.position.copy(labelPos)
  tagMeshOpacity(sprite, 1)
  grp.add(sprite)
  return grp
}

function makeTextSprite(text: string, prominent: boolean, colorHex?: number): THREE.Sprite {
  // Supersample the canvas texture so the sprite stays crisp when the
  // camera moves close — the visible size is controlled by sprite.scale,
  // not canvas resolution, so we can render at high DPR for free.
  const SS = 4
  const baseW = 384
  const baseH = 128
  const canvas = document.createElement('canvas')
  canvas.width = baseW * SS
  canvas.height = baseH * SS
  const ctx = canvas.getContext('2d')!
  ctx.scale(SS, SS)
  const color = colorHex !== undefined ? `#${colorHex.toString(16).padStart(6, '0')}` : '#4a4540'
  ctx.fillStyle = color
  // Lighter weight reads as refined; bumping size slightly keeps the
  // optical heft after dropping from 700 → 500.
  const weight = prominent ? 500 : 400
  const size = prominent ? 52 : 44
  ctx.font = `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, baseW / 2, baseH / 2 + 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 16
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
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
