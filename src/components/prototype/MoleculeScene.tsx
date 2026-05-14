'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { cn } from '@/lib/utils'
import type { Molecule } from '@/lib/artifact-script'
import type { ChipState, RepresentationPanelId } from '@/lib/prototype-store'

/**
 * The 3D molecule viewport — the centerpiece of the artifact.
 *
 * Renders a single molecule (methane, ammonia, ammonium, or water) with
 * sphere atoms + cylinder bonds, plus optional lone-pair density clouds,
 * orbital lobes, and bond-angle annotations driven by `chipState`.
 *
 * Design constraints (from the spec):
 *   - Bret Victor aesthetic: matte materials, soft lighting, off-white
 *     background, no gloss, no marketing-render polish.
 *   - Auto-rotates slowly on load to signal "this is 3D, drag me."
 *   - First user interaction stops auto-rotation permanently.
 *   - OrbitControls with damped easing.
 *   - Reset-view affordance in the corner.
 *
 * Molecule transitions (methane → ammonia → water, NH3 ↔ NH4⁺) are handled
 * by task 7 in a follow-up pass. For task 4 the component renders the
 * passed-in molecule as a static structure (with auto-rotation).
 */

// ---------------------------------------------------------------------------
// Molecule data — atom positions, bonds, lone pairs.
// ---------------------------------------------------------------------------

type ElementSymbol = 'C' | 'N' | 'O' | 'H'

type AtomDef = {
  element: ElementSymbol
  position: [number, number, number]
}

type BondDef = {
  from: number // atom index
  to: number
}

type LonePairDef = {
  /** Position of the lone-pair cloud center relative to the central atom. */
  position: [number, number, number]
  /** Direction the cloud orients along (also the orbital lobe direction). */
  direction: [number, number, number]
}

type MoleculeData = {
  atoms: AtomDef[]
  bonds: BondDef[]
  lonePairs: LonePairDef[]
  /** H–X–H bond angle in degrees (for annotation labels). */
  bondAngle: number
}

/**
 * For 3 H atoms symmetric around the +y axis (in the lower hemisphere),
 * compute the polar angle α (from +y) that produces the given H–X–H angle.
 *
 * Derivation:
 *   cos(θ_HH) = sin²(α)·cos(120°) + cos²(α) = 1.5·cos²(α) − 0.5
 *   → cos(α) = ±√((cos(θ) + 0.5) / 1.5)
 *
 * We take the negative root so α > 90° (H atoms below equator).
 */
function alphaForTrigonalH(angleDeg: number): number {
  const θ = (angleDeg * Math.PI) / 180
  const cosA2 = (Math.cos(θ) + 0.5) / 1.5
  return Math.acos(-Math.sqrt(cosA2))
}

const ATOM_RADIUS: Record<ElementSymbol, number> = {
  C: 0.32,
  N: 0.32,
  O: 0.34,
  H: 0.2,
}

// Muted CPK palette. Standard CPK is too saturated for an educational illo.
const ATOM_COLOR: Record<ElementSymbol, number> = {
  C: 0x555555,
  N: 0x4a6fa5,
  O: 0xc1574a,
  H: 0xeaeaea,
}

const BOND_RADIUS = 0.06
const BOND_COLOR = 0x9a958e

// Secondary primitives — pushed up in contrast so they hold their own against
// the solid atoms/bonds. Atoms and bonds are the load-bearing visuals; lone
// pairs / orbital lobes / bond-angle annotations are the conceptual overlay
// and need to read at a glance, not whisper.
const LONE_PAIR_COLOR = 0x6b46c1 // deeper violet — readable as electron density
const LONE_PAIR_OPACITY = 0.62
const ORBITAL_LOBE_COLOR = 0x8b6dd5 // saturated lavender, distinct from lone pair
const ORBITAL_LOBE_OPACITY = 0.46
const ANGLE_ARC_COLOR = 0x5a544c
const ANGLE_ARC_OPACITY = 0.85

/**
 * Build a methane-shaped (tetrahedral, 4 H) molecule with one H placed at
 * +y. Used for both methane (central=C) and ammonium (central=N).
 */
function tetrahedralFourH(central: ElementSymbol): MoleculeData {
  // Standard tetrahedral basis with one apex at +y.
  // Lower three H atoms at α = 109.47° from +y, evenly spaced.
  const α = (109.4712 * Math.PI) / 180
  const cosα = Math.cos(α)
  const sinα = Math.sin(α)
  const lower: [number, number, number][] = []
  for (let i = 0; i < 3; i++) {
    const φ = (i * 2 * Math.PI) / 3
    lower.push([sinα * Math.cos(φ), cosα, sinα * Math.sin(φ)])
  }
  return {
    atoms: [
      { element: central, position: [0, 0, 0] },
      { element: 'H', position: [0, 1, 0] },
      { element: 'H', position: lower[0] },
      { element: 'H', position: lower[1] },
      { element: 'H', position: lower[2] },
    ],
    bonds: [
      { from: 0, to: 1 },
      { from: 0, to: 2 },
      { from: 0, to: 3 },
      { from: 0, to: 4 },
    ],
    lonePairs: [],
    bondAngle: 109.5,
  }
}

/**
 * Build a trigonal pyramidal (3 H + 1 lone pair) molecule with the lone
 * pair pointing +y and the 3 H atoms in the lower hemisphere.
 */
function trigonalPyramidal(central: ElementSymbol, hAngleDeg: number): MoleculeData {
  const α = alphaForTrigonalH(hAngleDeg)
  const cosα = Math.cos(α)
  const sinα = Math.sin(α)
  const lower: [number, number, number][] = []
  for (let i = 0; i < 3; i++) {
    const φ = (i * 2 * Math.PI) / 3
    lower.push([sinα * Math.cos(φ), cosα, sinα * Math.sin(φ)])
  }
  return {
    atoms: [
      { element: central, position: [0, 0, 0] },
      { element: 'H', position: lower[0] },
      { element: 'H', position: lower[1] },
      { element: 'H', position: lower[2] },
    ],
    bonds: [
      { from: 0, to: 1 },
      { from: 0, to: 2 },
      { from: 0, to: 3 },
    ],
    lonePairs: [
      { position: [0, 0.85, 0], direction: [0, 1, 0] },
    ],
    bondAngle: hAngleDeg,
  }
}

/**
 * Build a bent (2 H + 2 lone pair) molecule. H atoms point down-and-out in
 * the xz plane; lone pairs point up-and-out perpendicular to the H plane.
 */
function bent(central: ElementSymbol, hAngleDeg: number): MoleculeData {
  const θ = (hAngleDeg * Math.PI) / 180
  const sinHalf = Math.sin(θ / 2)
  const cosHalf = Math.cos(θ / 2)
  // H atoms in xz plane, symmetric about z, both pointing -y
  const h1: [number, number, number] = [sinHalf, -cosHalf, 0]
  const h2: [number, number, number] = [-sinHalf, -cosHalf, 0]
  // Lone pairs in yz plane, symmetric, pointing +y
  // Approximate lone-pair-X-lone-pair as ~115° (a bit wider than H-O-H).
  const lpAngle = (115 * Math.PI) / 180
  const lpSin = Math.sin(lpAngle / 2)
  const lpCos = Math.cos(lpAngle / 2)
  const lp1: [number, number, number] = [0, lpCos, lpSin]
  const lp2: [number, number, number] = [0, lpCos, -lpSin]
  return {
    atoms: [
      { element: central, position: [0, 0, 0] },
      { element: 'H', position: h1 },
      { element: 'H', position: h2 },
    ],
    bonds: [
      { from: 0, to: 1 },
      { from: 0, to: 2 },
    ],
    lonePairs: [
      { position: [lp1[0] * 0.85, lp1[1] * 0.85, lp1[2] * 0.85], direction: lp1 },
      { position: [lp2[0] * 0.85, lp2[1] * 0.85, lp2[2] * 0.85], direction: lp2 },
    ],
    bondAngle: hAngleDeg,
  }
}

export function moleculeData(name: Molecule): MoleculeData {
  switch (name) {
    case 'methane':
      return tetrahedralFourH('C')
    case 'ammonium':
      return tetrahedralFourH('N')
    case 'ammonia':
      return trigonalPyramidal('N', 107)
    case 'water':
      return bent('O', 104.5)
  }
}

// ---------------------------------------------------------------------------
// Scene component
// ---------------------------------------------------------------------------

type MoleculeSceneProps = {
  molecule: Molecule
  chipState: ChipState
  /** When set, the scene fades parts the active panel's representation omits. */
  activePanel?: RepresentationPanelId | null
  className?: string
}

export function MoleculeScene({ molecule, chipState, activePanel, className }: MoleculeSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const refs = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    controls: OrbitControls
    moleculeGroup: THREE.Group
    defaultCameraPos: THREE.Vector3
    resetView: () => void
  } | null>(null)

  const data = useMemo(() => moleculeData(molecule), [molecule])

  // Mount: build the scene exactly once.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const { width, height } = container.getBoundingClientRect()

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf5f3ef)

    const camera = new THREE.PerspectiveCamera(40, Math.max(width / height, 0.1), 0.1, 100)
    const defaultCameraPos = new THREE.Vector3(0, 0.4, 4.2)
    camera.position.copy(defaultCameraPos)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width || 400, height || 400)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    container.appendChild(renderer.domElement)

    // Lighting: soft ambient + one directional. Matte materials only.
    scene.add(new THREE.AmbientLight(0xffffff, 0.72))
    const dir = new THREE.DirectionalLight(0xffffff, 1.15)
    dir.position.set(2.5, 3.5, 4)
    scene.add(dir)
    // Subtle rim light to keep darker atoms (C, N, O) from going muddy.
    const rim = new THREE.DirectionalLight(0xfff4e8, 0.35)
    rim.position.set(-3, 1, -2)
    scene.add(rim)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.minDistance = 2.4
    controls.maxDistance = 7
    controls.target.set(0, 0, 0)
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.6
    controls.update()

    // Stop auto-rotation on first user interaction.
    const stopAutoRotate = () => {
      controls.autoRotate = false
    }
    controls.addEventListener('start', stopAutoRotate)

    const moleculeGroup = new THREE.Group()
    scene.add(moleculeGroup)
    buildMolecule(moleculeGroup, data, chipState)

    const resetView = () => {
      camera.position.copy(defaultCameraPos)
      controls.target.set(0, 0, 0)
      controls.update()
    }

    let rafId = 0
    const tick = () => {
      controls.update()
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
      }
    })
    ro.observe(container)

    refs.current = {
      scene,
      camera,
      renderer,
      controls,
      moleculeGroup,
      defaultCameraPos,
      resetView,
    }

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      controls.removeEventListener('start', stopAutoRotate)
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
    // Intentionally empty deps — the scene is built once. Updates flow
    // through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Rebuild the molecule when data or chipState changes.
  //   - Molecule (data) change: fade-out → swap → fade-in (~700ms total).
  //     This is the "don't snap-cut" requirement from the spec.
  //   - chipState-only change: instant rebuild (toggling Bonds / Lone pairs
  //     etc. should be responsive, not animated).
  const prevDataRef = useRef<MoleculeData | null>(null)
  const activePanelRef = useRef<RepresentationPanelId | null>(activePanel ?? null)
  activePanelRef.current = activePanel ?? null

  useEffect(() => {
    const r = refs.current
    if (!r) return

    const prev = prevDataRef.current
    prevDataRef.current = data
    const isInitial = prev === null
    const dataChanged = !isInitial && prev !== data

    if (isInitial || !dataChanged) {
      // First build, or chipState-only change → instant rebuild.
      disposeGroup(r.moleculeGroup)
      r.moleculeGroup.clear()
      buildMolecule(r.moleculeGroup, data, chipState)
      applyAnnotationMode(r.moleculeGroup, activePanelRef.current)
      return
    }

    // Molecule changed → fade transition.
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
      // ease-out quad
      const eased = 1 - Math.pow(1 - t, 2)

      if (phase === 'out') {
        applyTransitionScalar(r.moleculeGroup, 1 - eased)
        if (t >= 1) {
          disposeGroup(r.moleculeGroup)
          r.moleculeGroup.clear()
          buildMolecule(r.moleculeGroup, data, chipState)
          // Re-apply annotation mode with new mesh refs.
          applyAnnotationMode(r.moleculeGroup, activePanelRef.current)
          // Start fade-in at opacity 0.
          applyTransitionScalar(r.moleculeGroup, 0)
          phase = 'in'
          phaseStart = performance.now()
        }
      } else {
        applyTransitionScalar(r.moleculeGroup, eased)
        if (t >= 1) {
          // Final state — full opacity, but keep annotation scalars.
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
      // If the user starts a new transition mid-fade, snap to a clean state
      // so the next mount/rebuild isn't fighting a stale opacity scalar.
      applyTransitionScalar(r.moleculeGroup, 1)
    }
  }, [data, chipState])

  // Annotation mode — fade parts the active panel's representation omits.
  // Updates the annotation scalar layer; transitions operate on a separate
  // scalar so they don't trample each other.
  useEffect(() => {
    const r = refs.current
    if (!r) return
    applyAnnotationMode(r.moleculeGroup, activePanel ?? null)
  }, [activePanel])

  return (
    <div
      ref={containerRef}
      className={cn('relative size-full overflow-hidden rounded-md', className)}
    >
      <ResetViewButton onClick={() => refs.current?.resetView()} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scene building helpers
// ---------------------------------------------------------------------------

const USERDATA_KIND = 'kind'
type SceneObjectKind = 'atom' | 'bond' | 'lone-pair' | 'orbital-lobe' | 'angle-label'

/**
 * Per-mesh opacity layering. Final opacity = base × transition × annotation.
 * Stored in userData so it survives across the various rebuild / transition
 * effects without them stepping on each other.
 */
type OpacityLayers = {
  base: number
  transition: number
  annotation: number
}
const USERDATA_OPACITY = 'opacity'

function tagObject(o: THREE.Object3D, kind: SceneObjectKind) {
  o.userData[USERDATA_KIND] = kind
}

function tagMeshOpacity(mesh: THREE.Mesh | THREE.Line | THREE.Sprite, base: number) {
  const layers: OpacityLayers = { base, transition: 1, annotation: 1 }
  mesh.userData[USERDATA_OPACITY] = layers
  applyMeshOpacity(mesh)
}

function applyMeshOpacity(mesh: THREE.Mesh | THREE.Line | THREE.Sprite) {
  const layers = mesh.userData[USERDATA_OPACITY] as OpacityLayers | undefined
  if (!layers) return
  const mat = mesh.material as
    | THREE.MeshStandardMaterial
    | THREE.LineBasicMaterial
    | THREE.SpriteMaterial
  const next = layers.base * layers.transition * layers.annotation
  // Materials need transparent=true when opacity < 1 to actually blend.
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

function buildMolecule(group: THREE.Group, data: MoleculeData, chipState: ChipState) {
  // Atoms — always rendered. Atoms chip is locked on in the UI.
  for (const atom of data.atoms) {
    const geom = new THREE.SphereGeometry(ATOM_RADIUS[atom.element], 32, 32)
    const mat = new THREE.MeshStandardMaterial({
      color: ATOM_COLOR[atom.element],
      roughness: 0.55,
      metalness: 0.0,
    })
    const mesh = new THREE.Mesh(geom, mat)
    mesh.position.set(...atom.position)
    tagObject(mesh, 'atom')
    tagMeshOpacity(mesh, 1)
    group.add(mesh)
  }

  // Bonds.
  if (chipState.bonds) {
    for (const bond of data.bonds) {
      const a = data.atoms[bond.from]
      const b = data.atoms[bond.to]
      group.add(makeBond(a.position, b.position))
    }
  }

  // Lone pairs — translucent ellipsoidal clouds.
  if (chipState.lonePairs) {
    for (const lp of data.lonePairs) {
      group.add(makeLonePair(lp.position, lp.direction))
    }
  }

  // Orbital lobes — elongated teardrop shapes from the central atom along
  // each bond and each lone pair direction (sp³ hybrid lobes).
  if (chipState.orbitals) {
    const central = data.atoms[0]
    // Bonds: from central atom toward each bonded H
    for (const bond of data.bonds) {
      const other = data.atoms[bond.to]
      const dir = new THREE.Vector3(...other.position).sub(new THREE.Vector3(...central.position))
      group.add(makeOrbitalLobe(central.position, dir))
    }
    // Lone pair lobes
    for (const lp of data.lonePairs) {
      group.add(makeOrbitalLobe(central.position, new THREE.Vector3(...lp.direction)))
    }
  }

  // Bond-angle annotations — small text labels at the central atom showing
  // the H–X–H angle, with a subtle arc indicator.
  if (chipState.angles && data.bonds.length >= 2) {
    group.add(makeAngleAnnotation(data))
  }
}

function makeBond(a: [number, number, number], b: [number, number, number]): THREE.Mesh {
  const start = new THREE.Vector3(...a)
  const end = new THREE.Vector3(...b)
  const direction = new THREE.Vector3().subVectors(end, start)
  const length = direction.length()
  const geom = new THREE.CylinderGeometry(BOND_RADIUS, BOND_RADIUS, length, 16)
  const mat = new THREE.MeshStandardMaterial({
    color: BOND_COLOR,
    roughness: 0.6,
    metalness: 0.0,
  })
  const mesh = new THREE.Mesh(geom, mat)
  // Position at midpoint, orient along the bond direction.
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

function makeLonePair(
  position: [number, number, number],
  direction: [number, number, number],
): THREE.Mesh {
  // Translucent ellipsoid — sphere geometry scaled along the direction.
  const geom = new THREE.SphereGeometry(0.25, 24, 24)
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
  // Elongate along the direction.
  const dir = new THREE.Vector3(...direction).normalize()
  mesh.scale.set(0.7, 1.4, 0.7)
  // Orient the long axis (local +y) along `direction`.
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  tagObject(mesh, 'lone-pair')
  tagMeshOpacity(mesh, LONE_PAIR_OPACITY)
  return mesh
}

function makeOrbitalLobe(
  origin: [number, number, number],
  direction: THREE.Vector3,
): THREE.Mesh {
  // Elongated teardrop using a lathe geometry. Points sit on a teardrop
  // profile from the origin (small tip) out to ~0.9 (broad belly).
  const points: THREE.Vector2[] = []
  const N = 16
  for (let i = 0; i <= N; i++) {
    const t = i / N
    // Teardrop: radius peaks around t≈0.5, narrows to 0 at both ends.
    const r = 0.18 * Math.sin(Math.PI * t) * (0.5 + 0.5 * t)
    const y = 0.1 + t * 1.0
    points.push(new THREE.Vector2(r, y))
  }
  const geom = new THREE.LatheGeometry(points, 24)
  const mat = new THREE.MeshStandardMaterial({
    color: ORBITAL_LOBE_COLOR,
    transparent: true,
    opacity: ORBITAL_LOBE_OPACITY,
    roughness: 0.5,
    metalness: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.position.set(...origin)
  const dir = direction.clone().normalize()
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  tagObject(mesh, 'orbital-lobe')
  tagMeshOpacity(mesh, ORBITAL_LOBE_OPACITY)
  return mesh
}

function makeAngleAnnotation(data: MoleculeData): THREE.Group {
  // Sprite-based degree label at the central atom, plus a thin arc indicator
  // between the first two bonds. For prototype: a simple line "arc" with the
  // angle text as a CanvasTexture sprite.
  const grp = new THREE.Group()
  const central = new THREE.Vector3(...data.atoms[0].position)
  const a = new THREE.Vector3(...data.atoms[data.bonds[0].to].position)
    .sub(central)
    .normalize()
  const b = new THREE.Vector3(...data.atoms[data.bonds[1].to].position)
    .sub(central)
    .normalize()

  // Subtle arc: a few line segments along the great-circle from a to b at
  // radius 0.55 from the central atom.
  const arcRadius = 0.55
  const arcSteps = 24
  const arcPoints: THREE.Vector3[] = []
  for (let i = 0; i <= arcSteps; i++) {
    const t = i / arcSteps
    // slerp between unit vectors a and b
    const angle = a.angleTo(b)
    const sinθ = Math.sin(angle)
    if (sinθ < 1e-6) break
    const v = a
      .clone()
      .multiplyScalar(Math.sin((1 - t) * angle) / sinθ)
      .add(b.clone().multiplyScalar(Math.sin(t * angle) / sinθ))
    arcPoints.push(v.multiplyScalar(arcRadius).add(central))
  }
  const arcGeom = new THREE.BufferGeometry().setFromPoints(arcPoints)
  const arcMat = new THREE.LineBasicMaterial({
    color: ANGLE_ARC_COLOR,
    transparent: true,
    opacity: ANGLE_ARC_OPACITY,
    linewidth: 2,
  })
  const arcLine = new THREE.Line(arcGeom, arcMat)
  tagMeshOpacity(arcLine, ANGLE_ARC_OPACITY)
  grp.add(arcLine)

  // Sprite label at the arc midpoint.
  const midDir = a.clone().add(b).normalize()
  const labelPos = midDir.multiplyScalar(arcRadius + 0.18).add(central)
  const sprite = makeTextSprite(`${data.bondAngle.toFixed(1)}°`)
  sprite.position.copy(labelPos)
  tagMeshOpacity(sprite, 1)
  grp.add(sprite)
  tagObject(grp, 'angle-label')
  return grp
}

function makeTextSprite(text: string): THREE.Sprite {
  // Bare text — no container, no border. The degree value sits at the arc
  // and reads as an annotation, not a UI chip.
  const canvas = document.createElement('canvas')
  const w = 256
  const h = 96
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#4a4540'
  ctx.font = '500 48px ui-sans-serif, system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, w / 2, h / 2 + 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  // toneMapped: false keeps ACES from darkening the transparent canvas
  // background. alphaTest discards near-transparent pixels so we don't
  // see a square halo around the text.
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    alphaTest: 0.05,
    toneMapped: false,
  })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(0.5, 0.19, 1)
  return sprite
}

// ---------------------------------------------------------------------------
// Annotation mode — fade parts the active panel's representation omits.
// ---------------------------------------------------------------------------

const PANEL_OMITS: Record<RepresentationPanelId, SceneObjectKind[]> = {
  // Lewis dot structure: atoms + bonds + lone pairs are captured;
  // angles + orbital lobes are omitted.
  lewis: ['angle-label', 'orbital-lobe'],
  // Wedge-and-dash: atoms + bonds + angles are captured;
  // lone pairs + orbital lobes are omitted (well, lone pairs are sometimes
  // shown — but for the contrast we treat the diagram as bond-focused).
  wedge: ['lone-pair', 'orbital-lobe'],
  // Geometry card: angles + atoms are captured; lone pairs + orbitals
  // are omitted from the card.
  geometry: ['lone-pair', 'orbital-lobe'],
}

function applyAnnotationMode(group: THREE.Group, panel: RepresentationPanelId | null) {
  const omitted = panel ? PANEL_OMITS[panel] : null
  group.traverse((obj) => {
    const kind = obj.userData[USERDATA_KIND] as SceneObjectKind | undefined
    if (!kind) return
    const isOmitted = omitted ? omitted.includes(kind) : false
    const annotation = isOmitted ? 0.18 : 1
    const meshes = collectMeshes(obj)
    for (const m of meshes) {
      const layers = m.userData[USERDATA_OPACITY] as OpacityLayers | undefined
      if (!layers) continue
      layers.annotation = annotation
      applyMeshOpacity(m)
    }
  })
}

function collectMeshes(obj: THREE.Object3D): (THREE.Mesh | THREE.Line | THREE.Sprite)[] {
  const out: (THREE.Mesh | THREE.Line | THREE.Sprite)[] = []
  obj.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) out.push(c as THREE.Mesh)
    else if ((c as THREE.Line).isLine) out.push(c as THREE.Line)
    else if ((c as THREE.Sprite).isSprite) out.push(c as THREE.Sprite)
  })
  return out
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

// ---------------------------------------------------------------------------
// UI affordance
// ---------------------------------------------------------------------------

function ResetViewButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md',
        'border border-border-subtle bg-page/80 px-2 py-1 text-[10px]',
        'text-text-tertiary hover:text-text-secondary hover:bg-page',
        'backdrop-blur-sm transition-colors',
      )}
      aria-label="Reset view"
    >
      Reset view
    </button>
  )
}
