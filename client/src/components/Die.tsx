import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { DICE_ANIMATION_MS } from '@shared/constants'

// ── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────
function mulberry32(seed: number) {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Pip positions (3×3 grid, positions 1–9) ──────────────────────────────────
// Grid:  1 2 3
//        4 5 6
//        7 8 9
const PIP_MAP: Record<number, number[]> = {
  1: [5],
  2: [3, 7],
  3: [3, 5, 7],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
}

function makeFaceTexture(value: number, isKill: boolean): THREE.CanvasTexture {
  const SIZE = 256
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!

  // Background with rounded corners
  const bg = isKill ? '#ef4444' : '#f9f9f9'
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.roundRect(6, 6, SIZE - 12, SIZE - 12, 36)
  ctx.fill()

  // Pips
  ctx.fillStyle = isKill ? '#ffffff' : '#1a1a1a'
  const pips = PIP_MAP[value] ?? []
  const positions: Record<number, [number, number]> = {
    1: [64, 64], 2: [128, 64], 3: [192, 64],
    4: [64, 128], 5: [128, 128], 6: [192, 128],
    7: [64, 192], 8: [128, 192], 9: [192, 192],
  }
  const r = 20
  for (const pos of pips) {
    const [x, y] = positions[pos]
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  return new THREE.CanvasTexture(canvas)
}

// ── BoxGeometry material order: [+x, -x, +y, -y, +z, -z] ───────────────────
// Face assignment (opposite faces sum to 7):
//   +x → 3,  -x → 4,  +y → 2,  -y → 5,  +z → 1,  -z → 6
const FACE_VALUES = [3, 4, 2, 5, 1, 6]

// Euler rotation (XYZ) to bring each die value face toward the camera (+Z)
const TARGET_EULER: Record<number, THREE.Euler> = {
  1: new THREE.Euler(0, 0, 0),
  2: new THREE.Euler(Math.PI / 2, 0, 0),
  3: new THREE.Euler(0, -Math.PI / 2, 0),
  4: new THREE.Euler(0, Math.PI / 2, 0),
  5: new THREE.Euler(-Math.PI / 2, 0, 0),
  6: new THREE.Euler(0, Math.PI, 0),
}

const CANVAS_SIZE = 200

function buildMaterials(isKill: boolean): THREE.MeshPhongMaterial[] {
  return FACE_VALUES.map(
    (v) =>
      new THREE.MeshPhongMaterial({
        map: makeFaceTexture(v, isKill),
      }),
  )
}

// ── Component ────────────────────────────────────────────────────────────────

interface DieProps {
  value: number | null
  isRolling: boolean
  isKill: boolean
  seed: number
}

export default function Die({ value, isRolling, isKill, seed }: DieProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Stable Three.js objects kept across renders
  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    mesh: THREE.Mesh
    geometry: THREE.BoxGeometry
    materials: THREE.MeshPhongMaterial[]
  } | null>(null)

  const rafRef = useRef<number | null>(null)
  const rollingStartRef = useRef<number | null>(null)

  // ── One-time Three.js setup ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(CANVAS_SIZE, CANVAS_SIZE)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(0, 0, 5)

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(5, 5, 5)
    scene.add(dirLight)

    const geometry = new THREE.BoxGeometry(2.2, 2.2, 2.2)
    const materials = buildMaterials(false)
    const mesh = new THREE.Mesh(geometry, materials)
    scene.add(mesh)

    threeRef.current = { renderer, scene, camera, mesh, geometry, materials }

    // Render one initial frame (blank / "?" state)
    renderer.render(scene, camera)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      geometry.dispose()
      materials.forEach((m) => {
        m.map?.dispose()
        m.dispose()
      })
      renderer.dispose()
      threeRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rebuild materials when kill state changes ──────────────────────────────
  useEffect(() => {
    const t = threeRef.current
    if (!t) return
    t.materials.forEach((m) => {
      m.map?.dispose()
      m.dispose()
    })
    const newMats = buildMaterials(isKill)
    t.materials = newMats
    t.mesh.material = newMats
    t.renderer.render(t.scene, t.camera)
  }, [isKill])

  // ── Animation / static render ──────────────────────────────────────────────
  useEffect(() => {
    const t = threeRef.current
    if (!t) return

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    const target = value !== null ? TARGET_EULER[value] : null

    if (!isRolling) {
      // Static: snap to target face (or identity if no value yet)
      if (target) {
        t.mesh.rotation.copy(target)
      }
      t.renderer.render(t.scene, t.camera)
      return
    }

    // Rolling: generate spin amounts from seed
    const prng = mulberry32(seed)
    const sign = () => (prng() > 0.5 ? 1 : -1)
    const spinX = (prng() * 4 + 2) * Math.PI * 2 * sign()
    const spinY = (prng() * 4 + 2) * Math.PI * 2 * sign()
    const spinZ = (prng() * 2 + 1) * Math.PI * 2 * sign()

    const tx = target?.x ?? 0
    const ty = target?.y ?? 0
    const tz = target?.z ?? 0

    rollingStartRef.current = performance.now()

    const loop = (now: number) => {
      const elapsed = now - (rollingStartRef.current ?? now)
      const t01 = Math.min(1, elapsed / DICE_ANIMATION_MS)
      const ease = 1 - Math.pow(1 - t01, 3) // cubic ease-out
      const decay = 1 - ease

      threeRef.current!.mesh.rotation.set(
        tx + spinX * decay,
        ty + spinY * decay,
        tz + spinZ * decay,
      )
      threeRef.current!.renderer.render(threeRef.current!.scene, threeRef.current!.camera)

      if (t01 < 1) {
        rafRef.current = requestAnimationFrame(loop)
      } else {
        rafRef.current = null
      }
    }

    rafRef.current = requestAnimationFrame(loop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRolling, value, seed])

  return (
    <div
      className={[
        'w-[200px] h-[200px] rounded-2xl flex items-center justify-center overflow-hidden',
        isKill ? 'die-kill' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} />
    </div>
  )
}
