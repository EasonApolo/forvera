<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import io from 'socket.io-client'
import { ip } from '../config'
import Card from '../components/Card.vue'
import Btn from '../components/Btn.vue'
import CircleBtn from '../components/CircleBtn.vue'
import Badge from '../components/Badge.vue'
import Modal from '../components/Modal.vue'
import StepperFilter from '../components/StepperFilter.vue'
import RecordTable from '../components/RecordTable.vue'
import Input from '../components/Input.vue'
import EditableInput from '../components/EditableInput.vue'
import { useToastStore } from '../store/toast'

type GomokuColor = 'black' | 'white'
type CheckersColor = 'yellow' | 'blue' | 'red'
type GameMode = 'gomoku' | 'xiangqi' | 'checkers' | 'cs'
type BlackSelectionMode = 'random' | 'loser'

interface CheckersPosition {
  q: number
  r: number
}

interface CheckersPiece {
  q: number
  r: number
  color: CheckersColor
  playerId: string
}

interface CheckersDraftState {
  original: CheckersPosition
  current: CheckersPosition
  moveKind: 'none' | 'step' | 'jump'
}

type XiangqiPieceType = 'rook' | 'horse' | 'elephant' | 'advisor' | 'general' | 'cannon' | 'soldier'

interface XiangqiPiece {
  x: number
  y: number
  type: XiangqiPieceType
  color: GomokuColor
  playerId: string
}

interface XiangqiDraftState {
  original: { x: number; y: number }
  current: { x: number; y: number }
  captured: { x: number; y: number } | null
  moveKind: 'none' | 'move' | 'capture'
}

const blackSelectionOptions: string[] = ['随机', '败者']
const gameModeOptions: string[] = ['五子棋', '象棋', '跳棋']
const gameModeLabelMap: Record<GameMode, string> = {
  gomoku: '五子棋',
  xiangqi: '象棋',
  checkers: '跳棋',
  cs: 'CS棋',
}
const gameModeValueMap: Record<string, GameMode> = {
  五子棋: 'gomoku',
  象棋: 'xiangqi',
  跳棋: 'checkers',
}

const BOARD_CELL_SIZE = 36
const XIANGQI_COLS = 9
const XIANGQI_ROWS = 10
const XIANGQI_CELL_SIZE = 44
const XIANGQI_PADDING = 24
const XIANGQI_BOARD_WIDTH_PX = (XIANGQI_COLS - 1) * XIANGQI_CELL_SIZE + XIANGQI_PADDING * 2
const XIANGQI_BOARD_HEIGHT_PX = (XIANGQI_ROWS - 1) * XIANGQI_CELL_SIZE + XIANGQI_PADDING * 2
const XIANGQI_KAITI_FONT_STACK = "'Kaiti SC', 'Kaiti TC', 'STKaiti', 'BiauKai', 'DFKai-SB', 'KaiTi', serif"
const CS_BOARD_POINTS = 5
const CS_CELL_SIZE = 68
const CS_PADDING = 36
const CS_DEFAULT_VISION = 0
const CS_UNIT_LINE_HEIGHT = 14
const CS_BOARD_WIDTH_PX = (CS_BOARD_POINTS - 1) * CS_CELL_SIZE + CS_PADDING * 2
const CS_BOARD_HEIGHT_PX = CS_BOARD_WIDTH_PX
const CHECKERS_CELL_SIZE = 28
// 跳棋棋盘尺寸：宽=12个三角形边，高=16个三角形高，再加少量padding
const CHECKERS_TRIANGLE_EDGE_PX = Math.sqrt(3) * CHECKERS_CELL_SIZE
const CHECKERS_TRIANGLE_HEIGHT_PX = (Math.sqrt(3) / 2) * CHECKERS_TRIANGLE_EDGE_PX
const CHECKERS_BOARD_PADDING_PX = 24
const CHECKERS_BOARD_WIDTH_PX = Math.ceil(12 * CHECKERS_TRIANGLE_EDGE_PX + CHECKERS_BOARD_PADDING_PX * 2)
const CHECKERS_BOARD_HEIGHT_PX = Math.ceil(16 * CHECKERS_TRIANGLE_HEIGHT_PX + CHECKERS_BOARD_PADDING_PX * 2)
const getBoardPixelWidth = () =>
  currentGameMode.value === 'checkers'
    ? CHECKERS_BOARD_WIDTH_PX
    : currentGameMode.value === 'xiangqi'
      ? XIANGQI_BOARD_WIDTH_PX
      : boardSize.value * BOARD_CELL_SIZE
const getBoardPixelHeight = () =>
  currentGameMode.value === 'checkers'
    ? CHECKERS_BOARD_HEIGHT_PX
    : currentGameMode.value === 'xiangqi'
      ? XIANGQI_BOARD_HEIGHT_PX
      : boardSize.value * BOARD_CELL_SIZE

const route = useRoute()
const router = useRouter()
const roomId = route.params.id as string
let userId = (route.params.userId as string) || ''
const toastStore = useToastStore()
let socket: any

const roomStatus = ref<'waiting' | 'playing' | 'settlement'>('waiting')
const users = ref<any[]>([])
const hostId = ref('')
const loading = ref(true)
const joinError = ref('')
const currentGameMode = ref<GameMode>('gomoku')
const nextGameMode = ref<GameMode>('gomoku')
const round = ref(0)
const currentPlayerId = ref('')
const blackUserId = ref('')
const whiteUserId = ref('')
const blackUserName = ref('')
const whiteUserName = ref('')
const boardSize = ref(15)
const board = ref<string[][]>([])
const moves = ref<any[]>([])
const records = ref<any[]>([])
const winnerId = ref('')
const winnerName = ref('')
const blackSelectionMode = ref<BlackSelectionMode>('loser')
const editingName = ref('')
const pendingMove = ref<{ x: number; y: number; color: GomokuColor } | null>(null)
const turnStartedAt = ref(0)
const lastMoveDurations = ref<Record<string, number>>({})
const boardViewportRef = ref<HTMLElement | null>(null)
const boardCanvasRef = ref<HTMLCanvasElement | null>(null)

// 跳棋相关状态
const checkersPieces = ref<CheckersPiece[]>([])
const checkersPlayerCount = ref(2)
const checkersDrafts = ref<Record<string, CheckersDraftState | null>>({})
const checkersLatestMove = ref<CheckersPosition | null>(null)
const checkersTargetZones = ref<Record<string, number>>({})
const xiangqiPieces = ref<XiangqiPiece[]>([])
const xiangqiDrafts = ref<Record<string, XiangqiDraftState | null>>({})
const xiangqiLatestMove = ref<{ x: number; y: number } | null>(null)
const csRound = ref(0)
const csCandidates = ref<string[]>([])
const csSelections = ref<Record<string, string[]>>({})
const csRoundConfirmed = ref<Record<string, boolean>>({})
const csSpawnSelections = ref<Record<string, string[]>>({})
const csUnits = ref<Array<{ id: string; ownerId: string; name: string; x: number; y: number; hp: number }>>([])
const csRoundMoved = ref<Record<string, boolean>>({})
const csVisibleEnemyUnits = ref<Record<string, string[]>>({})
const csPhase = ref<'selection' | 'action' | 'reveal_moves' | 'reveal_settlement'>('selection')
const csSelectedUnitId = ref('')
const csMoveMode = ref(false)

const getOppositeCheckersZoneIndex = (zoneIndex: number): number => {
  const oppositeMap: Record<number, number> = {
    0: 3,
    1: 4,
    2: 5,
    3: 0,
    4: 1,
    5: 2,
  }
  return oppositeMap[zoneIndex] ?? zoneIndex
}

const rotateCheckersPosition = (pos: CheckersPosition, steps: number): CheckersPosition => {
  let q = pos.q
  let r = pos.r
  let s = -q - r
  const normalized = ((steps % 6) + 6) % 6
  for (let i = 0; i < normalized; i += 1) {
    const nextQ = -r
    const nextR = -s
    const nextS = -q
    q = nextQ
    r = nextR
    s = nextS
  }
  return { q, r }
}

const settingsModal = reactive({
  show: false,
  saving: false,
  blackSelectionMode: 'loser' as BlackSelectionMode,
})

const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const now = ref(Date.now())
const isPanning = ref(false)
const panStartX = ref(0)
const panStartY = ref(0)
const panOriginX = ref(0)
const panOriginY = ref(0)
const pointerDownTarget = ref<HTMLElement | null>(null)
const pointerDownX = ref(0)
const pointerDownY = ref(0)
const activePointers = new Map<number, { x: number; y: number }>()
const pinchStartDistance = ref(0)
const pinchStartScale = ref(1)
const pinchStartOffsetX = ref(0)
const pinchStartOffsetY = ref(0)
const pinchCenterX = ref(0)
const pinchCenterY = ref(0)
const lastTouchEndAt = ref(0)

let tickTimer: number | null = null
let boardResizeHandler: (() => void) | null = null
let boardFitFrame: number | null = null
let boardRenderFrame: number | null = null
let boardCanvasDpr: number = 1

const scheduleBoardRender = () => {
  if (boardRenderFrame !== null) {
    cancelAnimationFrame(boardRenderFrame)
  }
  boardRenderFrame = window.requestAnimationFrame(() => {
    boardRenderFrame = null
    renderBoardCanvas()
  })
}

const resizeBoardCanvas = () => {
  const canvas = boardCanvasRef.value
  if (!canvas) return null

  const boardWidth = getBoardPixelWidth()
  const boardHeight = getBoardPixelHeight()
  const dpr = window.devicePixelRatio || 1
  boardCanvasDpr = dpr
  canvas.style.width = `${boardWidth}px`
  canvas.style.height = `${boardHeight}px`
  canvas.width = Math.max(1, Math.floor(boardWidth * dpr))
  canvas.height = Math.max(1, Math.floor(boardHeight * dpr))
  const context = canvas.getContext('2d')
  if (!context) return null
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  return context
}

const drawStone = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: GomokuColor,
  options: { latest?: boolean; preview?: boolean; animationProgress?: number } = {},
) => {
  const centerX = x * BOARD_CELL_SIZE + BOARD_CELL_SIZE / 2
  const centerY = y * BOARD_CELL_SIZE + BOARD_CELL_SIZE / 2
  const radius = 13
  
  // 最新棋子的下降动画：从右下角向左上移动
  let offsetX = 0
  let offsetY = 0
  if (options.latest && options.animationProgress !== undefined && options.animationProgress < 1) {
    const progress = options.animationProgress
    // 使用 ease-out 缓动函数让动画更流畅
    const easedProgress = 1 - Math.pow(1 - progress, 3)
    offsetX = (1 - easedProgress) * BOARD_CELL_SIZE * 0.17 // 从右向左的距离 (6 / 36 ≈ 0.17)
    offsetY = (1 - easedProgress) * BOARD_CELL_SIZE * 0.11 // 从下向上的距离 (4 / 36 ≈ 0.11)
  }
  
  const actualCenterX = centerX + offsetX
  const actualCenterY = centerY + offsetY
  
  // 预览模式：只画透明的棋子
  if (options.preview) {
    context.save()
    context.globalAlpha = color === 'black' ? 0.2 : 0.4
    context.beginPath()
    context.arc(centerX, centerY, radius, 0, Math.PI * 2)
    const previewGradient = context.createRadialGradient(centerX - 4, centerY - 4, 2, centerX, centerY, radius)
    if (color === 'black') {
      previewGradient.addColorStop(0, '#666')
      previewGradient.addColorStop(1, '#111')
    } else {
      previewGradient.addColorStop(0, '#fff')
      previewGradient.addColorStop(1, '#f0f0f0')
    }
    context.fillStyle = previewGradient
    context.shadowColor = 'rgba(0, 0, 0, 0.1)'
    context.shadowBlur = 3
    context.shadowOffsetY = 2
    context.fill()
    context.restore()
    return
  }
  
  // 正常模式：画完整的棋子
  context.save()
  context.beginPath()
  context.arc(actualCenterX, actualCenterY, radius, 0, Math.PI * 2)
  const gradient = context.createRadialGradient(actualCenterX - 4, actualCenterY - 4, 2, actualCenterX, actualCenterY, radius)
  if (color === 'black') {
    gradient.addColorStop(0, '#666')
    gradient.addColorStop(1, '#111')
  } else {
    gradient.addColorStop(0, '#fff')
    gradient.addColorStop(1, '#f0f0f0')
  }
  context.fillStyle = gradient
  
  // 最新棋子有更明显的阴影
  if (options.latest) {
    const progress = options.animationProgress !== undefined ? options.animationProgress : 1
    if (color === 'black') {
      // 黑棋阴影重
      context.shadowColor = `rgba(0, 0, 0, ${0.7 * progress})`
      context.shadowBlur = 18
      context.shadowOffsetX = 5
      context.shadowOffsetY = 8
    } else {
      // 白棋阴影明显
      context.shadowColor = `rgba(0, 0, 0, ${0.6 * progress})`
      context.shadowBlur = 18
      context.shadowOffsetX = 5
      context.shadowOffsetY = 8
    }
  } else {
    context.shadowColor = color === 'black' ? 'rgba(0, 0, 0, 0.28)' : 'rgba(0, 0, 0, 0.18)'
    context.shadowBlur = 4
    context.shadowOffsetY = 2
  }
  
  context.fill()
  context.restore()

  if (color === 'white') {
    context.save()
    context.beginPath()
    context.arc(actualCenterX, actualCenterY, radius, 0, Math.PI * 2)
    context.strokeStyle = 'rgba(0, 0, 0, 0.15)'
    context.lineWidth = 1
    context.stroke()
    context.restore()
  }
}

const renderBoardCanvas = () => {
  const canvas = boardCanvasRef.value
  if (!canvas) return

  const context = resizeBoardCanvas()
  if (!context) return

  if (currentGameMode.value === 'checkers') {
    renderCheckersBoard(context)
    return
  }

  if (currentGameMode.value === 'xiangqi') {
    renderXiangqiBoard(context)
    return
  }

  const boardWidth = getBoardPixelWidth()
  const boardHeight = getBoardPixelHeight()
  context.clearRect(0, 0, boardWidth, boardHeight)
  context.fillStyle = '#e6c37b'
  context.fillRect(0, 0, boardWidth, boardHeight)
  context.fillStyle = 'rgba(0, 0, 0, 0.08)'
  context.fillRect(0, 0, boardWidth, boardHeight)

  context.strokeStyle = 'rgba(0, 0, 0, 0.22)'
  context.lineWidth = 1
  for (let i = 0; i <= boardSize.value; i += 1) {
    const pos = i * BOARD_CELL_SIZE + 0.5
    context.beginPath()
    context.moveTo(pos, 0)
    context.lineTo(pos, boardHeight)
    context.stroke()
    context.beginPath()
    context.moveTo(0, pos)
    context.lineTo(boardWidth, pos)
    context.stroke()
  }

  // 计算最新棋子的动画进度（从右下角向上）
  let latestStoneAnimationProgress = 1
  const animationDuration = 500 // 动画持续时间（毫秒）
  let hasAnimation = false
  
  if (latestMove.value && turnStartedAt.value) {
    const elapsed = Date.now() - turnStartedAt.value
    latestStoneAnimationProgress = Math.max(0, Math.min(1, elapsed / animationDuration))
    hasAnimation = latestStoneAnimationProgress < 1
  }

  for (let y = 0; y < boardSize.value; y += 1) {
    for (let x = 0; x < boardSize.value; x += 1) {
      const stone = board.value?.[y]?.[x]
      if (!stone) continue
      const isLatest = !!latestMove.value && latestMove.value.x === x && latestMove.value.y === y
      drawStone(context, x, y, stone as GomokuColor, {
        latest: isLatest,
        animationProgress: isLatest ? latestStoneAnimationProgress : undefined,
      })
    }
  }

  if (pendingMove.value && roomStatus.value === 'playing') {
    const stone = board.value?.[pendingMove.value.y]?.[pendingMove.value.x]
    if (!stone) {
      drawStone(context, pendingMove.value.x, pendingMove.value.y, pendingMove.value.color, { preview: true })
    }
  }
  
  // 如果动画还在进行，继续调度渲染以产生连贯的动画效果
  if (hasAnimation) {
    scheduleBoardRender()
  }
}

const renderXiangqiBoard = (context: CanvasRenderingContext2D) => {
  const boardWidth = XIANGQI_BOARD_WIDTH_PX
  const boardHeight = XIANGQI_BOARD_HEIGHT_PX
  const left = XIANGQI_PADDING
  const top = XIANGQI_PADDING
  const right = left + (XIANGQI_COLS - 1) * XIANGQI_CELL_SIZE
  const bottom = top + (XIANGQI_ROWS - 1) * XIANGQI_CELL_SIZE

  context.clearRect(0, 0, boardWidth, boardHeight)
  context.fillStyle = '#e7c98e'
  context.fillRect(0, 0, boardWidth, boardHeight)
  context.fillStyle = 'rgba(0, 0, 0, 0.06)'
  context.fillRect(0, 0, boardWidth, boardHeight)

  context.strokeStyle = '#6f4c28'
  context.lineWidth = 2
  context.strokeRect(left, top, right - left, bottom - top)

  context.strokeStyle = 'rgba(92, 61, 26, 0.9)'
  context.lineWidth = 1.3

  for (let row = 0; row < XIANGQI_ROWS; row += 1) {
    const y = top + row * XIANGQI_CELL_SIZE + 0.5
    context.beginPath()
    context.moveTo(left, y)
    context.lineTo(right, y)
    context.stroke()
  }

  const riverTopY = top + 4 * XIANGQI_CELL_SIZE
  const riverBottomY = top + 5 * XIANGQI_CELL_SIZE
  for (let col = 0; col < XIANGQI_COLS; col += 1) {
    const x = left + col * XIANGQI_CELL_SIZE + 0.5
    context.beginPath()
    if (col === 0 || col === XIANGQI_COLS - 1) {
      context.moveTo(x, top)
      context.lineTo(x, bottom)
    } else {
      context.moveTo(x, top)
      context.lineTo(x, riverTopY)
      context.moveTo(x, riverBottomY)
      context.lineTo(x, bottom)
    }
    context.stroke()
  }

  const palaceLeft = left + 3 * XIANGQI_CELL_SIZE
  const palaceRight = left + 5 * XIANGQI_CELL_SIZE
  const palaceTopBottom = top + 2 * XIANGQI_CELL_SIZE
  const palaceBottomTop = top + 7 * XIANGQI_CELL_SIZE
  context.beginPath()
  context.moveTo(palaceLeft, top)
  context.lineTo(palaceRight, palaceTopBottom)
  context.moveTo(palaceRight, top)
  context.lineTo(palaceLeft, palaceTopBottom)
  context.moveTo(palaceLeft, palaceBottomTop)
  context.lineTo(palaceRight, bottom)
  context.moveTo(palaceRight, palaceBottomTop)
  context.lineTo(palaceLeft, bottom)
  context.stroke()

  context.save()
  context.fillStyle = 'rgba(92, 61, 26, 0.85)'
  context.font = `700 24px ${XIANGQI_KAITI_FONT_STACK}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  const riverMidY = (riverTopY + riverBottomY) / 2
  const leftRiverX = left + 2 * XIANGQI_CELL_SIZE
  const rightRiverX = left + 6 * XIANGQI_CELL_SIZE

  const drawVerticalRiverText = (text: string, centerX: number, centerY: number, rotateRad: number) => {
    const chars = Array.from(text)
    const lineHeight = 24
    const startY = -((chars.length - 1) * lineHeight) / 2
    context.save()
    context.translate(centerX, centerY)
    context.rotate(rotateRad)
    chars.forEach((char, index) => {
      context.fillText(char, 0, startY + index * lineHeight)
    })
    context.restore()
  }

  drawVerticalRiverText('楚河', leftRiverX, riverMidY, Math.PI / 2)
  drawVerticalRiverText('漢界', rightRiverX, riverMidY, -Math.PI / 2)
  context.restore()

  const pieceLabelMap: Record<XiangqiPieceType, { black: string; white: string }> = {
    rook: { black: '車', white: '車' },
    horse: { black: '馬', white: '馬' },
    elephant: { black: '象', white: '相' },
    advisor: { black: '士', white: '仕' },
    general: { black: '將', white: '帥' },
    cannon: { black: '砲', white: '砲' },
    soldier: { black: '卒', white: '兵' },
  }

  const drawPiece = (
    col: number,
    row: number,
    side: 'black' | 'white',
    pieceType: XiangqiPieceType,
    alpha = 1,
    latest = false,
  ) => {
    const viewPos = toXiangqiViewPos(col, row)
    const x = left + viewPos.x * XIANGQI_CELL_SIZE
    const y = top + viewPos.y * XIANGQI_CELL_SIZE
    const radius = XIANGQI_CELL_SIZE * 0.34
    const text = pieceLabelMap[pieceType][side]

    context.save()
    context.globalAlpha = alpha
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    const gradient = context.createRadialGradient(x - 4, y - 4, 2, x, y, radius)
    if (side === 'black') {
      gradient.addColorStop(0, '#5b5b5b')
      gradient.addColorStop(1, '#1e1e1e')
      context.strokeStyle = 'rgba(255, 255, 255, 0.3)'
      context.fillStyle = gradient
    } else {
      gradient.addColorStop(0, '#fffaf1')
      gradient.addColorStop(1, '#f2e6d2')
      context.strokeStyle = 'rgba(120, 72, 21, 0.45)'
      context.fillStyle = gradient
    }
    context.lineWidth = 1.2

    if (latest) {
      context.shadowColor = 'rgba(0, 0, 0, 0.68)'
      context.shadowBlur = 16
      context.shadowOffsetX = 5
      context.shadowOffsetY = 8
    } else {
      context.shadowColor = 'rgba(0, 0, 0, 0.26)'
      context.shadowBlur = 5
      context.shadowOffsetY = 3
    }

    context.fill()
    context.stroke()

    context.fillStyle = side === 'black' ? '#f7f7f7' : '#a32d10'
    context.font = `700 22px ${XIANGQI_KAITI_FONT_STACK}`
    const metrics = context.measureText(text)
    const ascent = metrics.actualBoundingBoxAscent || 11
    const descent = metrics.actualBoundingBoxDescent || 11
    const textX = x - metrics.width / 2
    const textY = y + (ascent - descent) / 2
    context.textAlign = 'left'
    context.textBaseline = 'alphabetic'
    context.fillText(text, textX, textY)
    context.restore()
  }

  const draftEntries = Object.entries(xiangqiDrafts.value).filter(([, draft]) => Boolean(draft))
  const draftOriginalSet = new Set(
    draftEntries.map(([, draft]) => `${(draft as XiangqiDraftState).original.x},${(draft as XiangqiDraftState).original.y}`),
  )

  xiangqiPieces.value.forEach((piece) => {
    if (draftOriginalSet.has(`${piece.x},${piece.y}`)) return
    const isLatest = !!xiangqiLatestMove.value
      && xiangqiLatestMove.value.x === piece.x
      && xiangqiLatestMove.value.y === piece.y
    drawPiece(piece.x, piece.y, piece.color, piece.type, 1, isLatest)
  })

  draftEntries.forEach(([draftUserId, rawDraft]) => {
    const draft = rawDraft as XiangqiDraftState
    const source = xiangqiPieces.value.find(
      (piece) => piece.x === draft.original.x && piece.y === draft.original.y,
    )
    if (!source) return
    const isMine = draftUserId === currentUid()
    const alpha = draft.moveKind === 'none' ? (isMine ? 0.38 : 0.28) : isMine ? 0.62 : 0.5
    drawPiece(draft.current.x, draft.current.y, source.color, source.type, alpha, false)
  })
}

const renderCsBoard = (context: CanvasRenderingContext2D) => {
  const boardWidth = CS_BOARD_WIDTH_PX
  const boardHeight = CS_BOARD_HEIGHT_PX

  const toPixel = (v: number) => CS_PADDING + v * CS_CELL_SIZE
  const isBorder = (x: number, y: number) => x === 0 || x === 4 || y === 0 || y === 4
  const isCross = (x: number, y: number) => x === 2 || y === 2
  const edgeKey = (x1: number, y1: number, x2: number, y2: number) => {
    const a = `${x1},${y1}`
    const b = `${x2},${y2}`
    return a < b ? `${a}|${b}` : `${b}|${a}`
  }

  context.clearRect(0, 0, boardWidth, boardHeight)
  context.fillStyle = '#f7f8fb'
  context.fillRect(0, 0, boardWidth, boardHeight)
  context.fillStyle = 'rgba(255, 255, 255, 0.5)'
  context.fillRect(0, 0, boardWidth, boardHeight)

  context.strokeStyle = 'rgba(220, 225, 233, 0.82)'
  context.lineWidth = 2

  const edges = new Set<string>()
  const addEdge = (x1: number, y1: number, x2: number, y2: number) => {
    edges.add(edgeKey(x1, y1, x2, y2))
  }
  const removeEdge = (x1: number, y1: number, x2: number, y2: number) => {
    edges.delete(edgeKey(x1, y1, x2, y2))
  }
  const applySegment = (
    op: 'add' | 'remove',
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const gcd = (a: number, b: number): number => {
      let x = Math.abs(a)
      let y = Math.abs(b)
      while (y !== 0) {
        const t = x % y
        x = y
        y = t
      }
      return x || 1
    }
    const steps = gcd(dx, dy)
    const stepX = dx / steps
    const stepY = dy / steps
    for (let i = 0; i < steps; i += 1) {
      const x1 = from.x + stepX * i
      const y1 = from.y + stepY * i
      const x2 = from.x + stepX * (i + 1)
      const y2 = from.y + stepY * (i + 1)
      if (op === 'add') {
        addEdge(x1, y1, x2, y2)
      } else {
        removeEdge(x1, y1, x2, y2)
      }
    }
  }
  const addPath = (...points: Array<{ x: number; y: number }>) => {
    for (let i = 0; i < points.length - 1; i += 1) {
      applySegment('add', points[i], points[i + 1])
    }
  }
  const removePath = (...points: Array<{ x: number; y: number }>) => {
    for (let i = 0; i < points.length - 1; i += 1) {
      applySegment('remove', points[i], points[i + 1])
    }
  }

  for (let y = 0; y < CS_BOARD_POINTS; y += 1) {
    for (let x = 0; x < CS_BOARD_POINTS; x += 1) {
      const currentEnabled = isBorder(x, y) || isCross(x, y)
      if (!currentEnabled) continue

      const rightEnabled = x < 4 && (isBorder(x + 1, y) || isCross(x + 1, y))
      const downEnabled = y < 4 && (isBorder(x, y + 1) || isCross(x, y + 1))

      if (rightEnabled) {
        addEdge(x, y, x + 1, y)
      }
      if (downEnabled) {
        addEdge(x, y, x, y + 1)
      }
    }
  }

  // 按需求调整连线（坐标原点在左上，横x纵y）
  removePath({ x: 0, y: 2 }, { x: 2, y: 2 })
  addPath({ x: 0, y: 1 }, { x: 2, y: 1 })

  removePath({ x: 2, y: 2 }, { x: 4, y: 2 })
  addPath({ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 0 })

  removePath({ x: 3, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 3 })
  addPath({ x: 3, y: 4 }, { x: 3, y: 3 }, { x: 4, y: 3 })
  addPath({ x: 2, y: 3 }, { x: 3, y: 3 })

  removePath({ x: 2, y: 2 }, { x: 3, y: 2 })
  removePath({ x: 3, y: 3 }, { x: 4, y: 3 })
  addPath({ x: 3, y: 2 }, { x: 3, y: 3 })

  removePath({ x: 0, y: 2 }, { x: 2, y: 2 })
  removePath({ x: 0, y: 1 }, { x: 1, y: 1 })
  addPath({ x: 0, y: 2 }, { x: 1, y: 1 })

  addPath({ x: 3, y: 1 }, { x: 4, y: 0 })
  removePath({ x: 3, y: 1 }, { x: 3, y: 0 })
  addPath({ x: 3, y: 2 }, { x: 4, y: 2 })

  removePath({ x: 1, y: 1 }, { x: 0, y: 2 })
  addPath({ x: 1, y: 1 }, { x: 0, y: 1 })
  addPath({ x: 1, y: 4 }, { x: 0, y: 3 })
  removePath({ x: 1, y: 4 }, { x: 0, y: 4 }, { x: 0, y: 3 })

  const connectedPoints = new Set<string>()
  edges.forEach((edge) => {
    const [start, end] = edge.split('|')
    const [x1, y1] = start.split(',').map(Number)
    const [x2, y2] = end.split(',').map(Number)
    connectedPoints.add(start)
    connectedPoints.add(end)
    context.beginPath()
    context.moveTo(toPixel(x1), toPixel(y1))
    context.lineTo(toPixel(x2), toPixel(y2))
    context.stroke()
  })

  context.fillStyle = 'rgba(214, 220, 230, 0.78)'
  for (let y = 0; y < CS_BOARD_POINTS; y += 1) {
    for (let x = 0; x < CS_BOARD_POINTS; x += 1) {
      if (!connectedPoints.has(`${x},${y}`)) continue
      context.beginPath()
      context.arc(toPixel(x), toPixel(y), 3.4, 0, Math.PI * 2)
      context.fill()
    }
  }

  const uid = currentUid()
  const visibleUnits = csUnits.value.filter((unit) => {
    // 自己的棋子始终可见
    if (!uid || unit.ownerId === uid) return true
    // 敌方棋子只在csVisibleEnemyUnits中才可见
    const visibleIds = csVisibleEnemyUnits.value[uid] || []
    return visibleIds.includes(unit.id)
  })

  const grouped = new Map<string, Array<{ id: string; ownerId: string; name: string; x: number; y: number }>>()
  visibleUnits.forEach((unit) => {
    const key = `${unit.x},${unit.y}`
    const list = grouped.get(key) || []
    list.push(unit)
    grouped.set(key, list)
  })

  grouped.forEach((group, key) => {
    const [x, y] = key.split(',').map(Number)
    const cx = toPixel(x)
    const cy = toPixel(y)
    const lineHeight = CS_UNIT_LINE_HEIGHT
    const totalHeight = (group.length - 1) * lineHeight
    const sorted = [...group].sort((a, b) => a.name.localeCompare(b.name))

    context.save()
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    sorted.forEach((unit, index) => {
      const rowY = cy - totalHeight / 2 + index * lineHeight
      const isSelected = unit.id === csSelectedUnitId.value
      const isMoved = csRoundMoved.value[unit.id] === true
      context.globalAlpha = isSelected ? 1 : isMoved ? 0.5 : 1
      context.font = isSelected
        ? "700 13px 'Trebuchet MS', 'Avenir Next', sans-serif"
        : "500 12px 'Trebuchet MS', 'Avenir Next', sans-serif"
      context.fillStyle = unit.ownerId === blackUserId.value ? '#1d5bd1' : '#7a5a00'
      const hp = typeof unit.hp === 'number' ? unit.hp : 100
      const label = hp < 100 ? `${unit.name} ${hp}` : unit.name
      context.fillText(label, cx, rowY)
    })
    context.restore()
  })
}

// 跳棋渲染 - 使用标准三向坐标系 (q, r, s) 其中 q+r+s=0
const renderCheckersBoard = (context: CanvasRenderingContext2D) => {
  const canvas = boardCanvasRef.value
  if (!canvas) return
  
  const CELL_SIZE = CHECKERS_CELL_SIZE
  const boardWidth = CHECKERS_BOARD_WIDTH_PX
  const boardHeight = CHECKERS_BOARD_HEIGHT_PX
  const centerX = boardWidth / 2
  const centerY = boardHeight / 2
  const rotationSteps = checkersRotationSteps.value
  context.clearRect(0, 0, boardWidth, boardHeight)
  context.fillStyle = '#f4e4c1'
  context.fillRect(0, 0, boardWidth, boardHeight)
  
  // 生成跳棋棋盘的所有点（三向坐标系）
  const getBoardPoints = (): Array<{ q: number; r: number; s: number }> => {
    const points: Array<{ q: number; r: number; s: number }> = []
    
    // 中心六边形
    for (let r = -4; r <= 4; r++) {
      for (let q = Math.max(-4, -r - 4); q <= Math.min(4, -r + 4); q++) {
        const s = -q - r
        points.push({ q, r, s })
      }
    }
    
    // 上三角 (r<-4): 顶点 (4,-8,4)
    for (let r = -8; r <= -5; r++) {
      for (let q = -r - 4; q <= 4; q++) {
        points.push({ q, r, s: -q - r })
      }
    }
    
    // 右上三角 (q>4): 顶点 (8,-4,-4)
    for (let q = 5; q <= 8; q++) {
      for (let r = -4; r <= 4 - q; r++) {
        points.push({ q, r, s: -q - r })
      }
    }
    
    // 右下三角 (s<-4): 顶点 (4,4,-8)
    for (let s = -8; s <= -5; s++) {
      for (let q = -s - 4; q <= 4; q++) {
        points.push({ q, r: -q - s, s })
      }
    }
    
    // 下三角 (r>4): 顶点 (-4,8,-4)
    for (let r = 5; r <= 8; r++) {
      for (let q = -4; q <= 4 - r; q++) {
        points.push({ q, r, s: -q - r })
      }
    }
    
    // 左下三角 (q<-4): 顶点 (-8,4,4)
    for (let q = -8; q <= -5; q++) {
      for (let r = -q - 4; r <= 4; r++) {
        points.push({ q, r, s: -q - r })
      }
    }
    
    // 左上三角 (s>4): 顶点 (-4,-4,8)
    for (let s = 5; s <= 8; s++) {
      for (let q = -4; q <= 4 - s; q++) {
        points.push({ q, r: -q - s, s })
      }
    }
    
    return points
  }
  
  const allPoints = getBoardPoints()
  
  // 三向坐标转换为像素坐标（平顶六边形布局）
  const hexToPixel = (q: number, r: number) => {
    const x = CELL_SIZE * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r) + centerX
    const y = CELL_SIZE * (3 / 2 * r) + centerY
    return { x, y }
  }

  const toViewPos = (pos: CheckersPosition): CheckersPosition =>
    rotateCheckersPosition(pos, rotationSteps)
  
  // 绘制连线
  context.strokeStyle = 'rgba(139, 69, 19, 0.2)'
  context.lineWidth = 1.5
  
  allPoints.forEach(point => {
    const viewPoint = toViewPos({ q: point.q, r: point.r })
    const { x, y } = hexToPixel(viewPoint.q, viewPoint.r)
    
    // 六个方向的邻居
    const neighbors = [
      { q: point.q + 1, r: point.r, s: point.s - 1 },     // 右
      { q: point.q + 1, r: point.r - 1, s: point.s },     // 右上
      { q: point.q, r: point.r - 1, s: point.s + 1 },     // 左上
      { q: point.q - 1, r: point.r, s: point.s + 1 },     // 左
      { q: point.q - 1, r: point.r + 1, s: point.s },     // 左下
      { q: point.q, r: point.r + 1, s: point.s - 1 },     // 右下
    ]
    
    neighbors.forEach(neighbor => {
      // 只画一次线（从q小的指向q大的，或q相同时从r小的指向r大的）
      if (neighbor.q > point.q || (neighbor.q === point.q && neighbor.r > point.r)) {
        const exists = allPoints.some(p => p.q === neighbor.q && p.r === neighbor.r && p.s === neighbor.s)
        if (exists) {
          const viewNeighbor = toViewPos({ q: neighbor.q, r: neighbor.r })
          const { x: x2, y: y2 } = hexToPixel(viewNeighbor.q, viewNeighbor.r)
          context.beginPath()
          context.moveTo(x, y)
          context.lineTo(x2, y2)
          context.stroke()
        }
      }
    })
  })
  
  // 绘制所有点位
  context.fillStyle = 'rgba(139, 69, 19, 0.35)'
  allPoints.forEach(point => {
    const viewPoint = toViewPos({ q: point.q, r: point.r })
    const { x, y } = hexToPixel(viewPoint.q, viewPoint.r)
    context.beginPath()
    context.arc(x, y, 5, 0, Math.PI * 2)
    context.fill()
  })
  
  // 绘制棋子
  const colorMap: Record<CheckersColor, string> = {
    yellow: '#FFD700',
    blue: '#4169E1',
    red: '#DC143C'
  }

  const activeDraftEntries = Object.entries(checkersDrafts.value).filter(([, draft]) => Boolean(draft))
  const draftOriginalSet = new Set(
    activeDraftEntries.map(([, draft]) => `${(draft as CheckersDraftState).original.q},${(draft as CheckersDraftState).original.r}`),
  )

  const drawCheckerPiece = (
    piece: CheckersPiece | { q: number; r: number; color: CheckersColor },
    alpha = 1,
    latest = false,
  ) => {
    const viewPiece = toViewPos({ q: piece.q, r: piece.r })
    const { x, y } = hexToPixel(viewPiece.q, viewPiece.r)
    const radius = 13

    context.save()
    context.globalAlpha = alpha
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)

    const gradient = context.createRadialGradient(x - 4, y - 4, 2, x, y, radius)
    const baseColor = colorMap[piece.color]
    gradient.addColorStop(0, lightenColor(baseColor, 30))
    gradient.addColorStop(1, baseColor)
    context.fillStyle = gradient

    if (latest) {
      context.shadowColor = 'rgba(0, 0, 0, 0.65)'
      context.shadowBlur = 16
      context.shadowOffsetX = 5
      context.shadowOffsetY = 8
    } else {
      context.shadowColor = 'rgba(0, 0, 0, 0.35)'
      context.shadowBlur = 6
      context.shadowOffsetY = 3
    }

    context.fill()
    context.restore()
  }
  
  checkersPieces.value.forEach(piece => {
    if (draftOriginalSet.has(`${piece.q},${piece.r}`)) {
      return
    }
    const isLatest = !!checkersLatestMove.value
      && checkersLatestMove.value.q === piece.q
      && checkersLatestMove.value.r === piece.r
    drawCheckerPiece(piece, 1, isLatest)
  })

  activeDraftEntries.forEach(([draftUserId, rawDraft]) => {
    const draft = rawDraft as CheckersDraftState
    const draftPiece = checkersPieces.value.find(
      (piece) => piece.q === draft.original.q && piece.r === draft.original.r,
    )
    const draftOwner = users.value.find((user: any) => user.id === draftUserId)
    const draftColor = (draftPiece?.color || draftOwner?.color) as CheckersColor | undefined
    if (!draftColor) return

    const isMine = draftUserId === currentUid()
    drawCheckerPiece({ q: draft.current.q, r: draft.current.r, color: draftColor }, isMine ? 0.45 : 0.35)

  })
}

// 生成跳棋棋盘的所有点位（三向坐标系）
const generateCheckersPositions = (): CheckersPosition[] => {
  const points: Array<{ q: number; r: number }> = []
  
  // 中心六边形
  for (let r = -4; r <= 4; r++) {
    for (let q = Math.max(-4, -r - 4); q <= Math.min(4, -r + 4); q++) {
      points.push({ q, r })
    }
  }
  
  // 上三角 (r<-4)
  for (let r = -8; r <= -5; r++) {
    for (let q = -r - 4; q <= 4; q++) {
      points.push({ q, r })
    }
  }
  
  // 右上三角 (q>4)
  for (let q = 5; q <= 8; q++) {
    for (let r = -4; r <= 4 - q; r++) {
      points.push({ q, r })
    }
  }
  
  // 右下三角 (s<-4)
  for (let s = -8; s <= -5; s++) {
    for (let q = -s - 4; q <= 4; q++) {
      points.push({ q, r: -q - s })
    }
  }
  
  // 下三角 (r>4)
  for (let r = 5; r <= 8; r++) {
    for (let q = -4; q <= 4 - r; q++) {
      points.push({ q, r })
    }
  }
  
  // 左下三角 (q<-4)
  for (let q = -8; q <= -5; q++) {
    for (let r = -q - 4; r <= 4; r++) {
      points.push({ q, r })
    }
  }
  
  // 左上三角 (s>4)
  for (let s = 5; s <= 8; s++) {
    for (let q = -4; q <= 4 - s; q++) {
      points.push({ q, r: -q - s })
    }
  }
  
  return points
}

// 颜色加亮辅助函数
const lightenColor = (color: string, percent: number): string => {
  const num = parseInt(color.replace('#', ''), 16)
  const amt = Math.round(2.55 * percent)
  const R = Math.min(255, (num >> 16) + amt)
  const G = Math.min(255, ((num >> 8) & 0x00FF) + amt)
  const B = Math.min(255, (num & 0x0000FF) + amt)
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1).toUpperCase()}`
}

const getBoardCellFromClient = (clientX: number, clientY: number) => {
  const viewport = boardViewportRef.value
  if (!viewport) return null

  const boardWidth = getBoardPixelWidth()
  const boardHeight = getBoardPixelHeight()
  const rect = viewport.getBoundingClientRect()
  const localX = (clientX - rect.left - offsetX.value) / scale.value
  const localY = (clientY - rect.top - offsetY.value) / scale.value
  if (localX < 0 || localY < 0 || localX >= boardWidth || localY >= boardHeight) return null

  return {
    x: Math.floor(localX / BOARD_CELL_SIZE),
    y: Math.floor(localY / BOARD_CELL_SIZE),
  }
}

const getXiangqiCellFromClient = (clientX: number, clientY: number): { x: number; y: number } | null => {
  const viewport = boardViewportRef.value
  if (!viewport) return null

  const rect = viewport.getBoundingClientRect()
  const localX = (clientX - rect.left - offsetX.value) / scale.value
  const localY = (clientY - rect.top - offsetY.value) / scale.value

  const colFloat = (localX - XIANGQI_PADDING) / XIANGQI_CELL_SIZE
  const rowFloat = (localY - XIANGQI_PADDING) / XIANGQI_CELL_SIZE
  const x = Math.round(colFloat)
  const y = Math.round(rowFloat)
  if (x < 0 || x >= XIANGQI_COLS || y < 0 || y >= XIANGQI_ROWS) return null

  // 要求点击位置接近交叉点，避免误触
  if (Math.abs(colFloat - x) > 0.4 || Math.abs(rowFloat - y) > 0.4) {
    return null
  }
  return toXiangqiWorldPos(x, y)
}

const getCsPointFromClient = (clientX: number, clientY: number): { x: number; y: number; offsetY: number } | null => {
  const viewport = boardViewportRef.value
  if (!viewport) return null
  const rect = viewport.getBoundingClientRect()
  const localX = (clientX - rect.left - offsetX.value) / scale.value
  const localY = (clientY - rect.top - offsetY.value) / scale.value
  const colFloat = (localX - CS_PADDING) / CS_CELL_SIZE
  const rowFloat = (localY - CS_PADDING) / CS_CELL_SIZE
  const x = Math.round(colFloat)
  const y = Math.round(rowFloat)
  if (x < 0 || x >= CS_BOARD_POINTS || y < 0 || y >= CS_BOARD_POINTS) return null
  if (Math.abs(colFloat - x) > 0.45 || Math.abs(rowFloat - y) > 0.45) return null
  const centerY = CS_PADDING + y * CS_CELL_SIZE
  return { x, y, offsetY: localY - centerY }
}

// 获取跳棋六边形坐标（三向坐标系）
const getCheckersHexFromClient = (clientX: number, clientY: number): CheckersPosition | null => {
  const viewport = boardViewportRef.value
  if (!viewport) return null

  const CELL_SIZE = 28
  const boardWidth = CHECKERS_BOARD_WIDTH_PX
  const boardHeight = CHECKERS_BOARD_HEIGHT_PX
  const rotationSteps = checkersRotationSteps.value
  const rect = viewport.getBoundingClientRect()
  const localX = (clientX - rect.left - offsetX.value) / scale.value
  const localY = (clientY - rect.top - offsetY.value) / scale.value
  
  // 像素坐标转换为六边形坐标（相对于棋盘中心）
  const x = localX - boardWidth / 2
  const y = localY - boardHeight / 2
  
  const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / CELL_SIZE
  const r = (2 / 3 * y) / CELL_SIZE
  
  // 六边形坐标取整（立方坐标系）
  const roundHex = (q: number, r: number): { q: number; r: number } => {
    const s = -q - r
    let rq = Math.round(q)
    let rr = Math.round(r)
    let rs = Math.round(s)
    
    const qDiff = Math.abs(rq - q)
    const rDiff = Math.abs(rr - r)
    const sDiff = Math.abs(rs - s)
    
    if (qDiff > rDiff && qDiff > sDiff) {
      rq = -rr - rs
    } else if (rDiff > sDiff) {
      rr = -rq - rs
    }
    
    return { q: rq, r: rr }
  }
  
  const hex = roundHex(q, r)
  const worldHex = rotateCheckersPosition(hex, 6 - rotationSteps)
  
  // 检查该点是否在有效点位中
  const allPositions = generateCheckersPositions()
  const isValid = allPositions.some(pos => pos.q === worldHex.q && pos.r === worldHex.r)
  
  return isValid ? worldHex : null
}

const formatDuration = (ms: number) => {
  const safeMs = Math.max(0, Math.floor(ms || 0))
  const totalSeconds = Math.floor(safeMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const getPlayerThinkTime = (user: any) => {
  if (!user) return 0
  if (roomStatus.value === 'playing' && currentPlayerId.value === user.id && turnStartedAt.value) {
    return Math.max(0, now.value - turnStartedAt.value)
  }
  return lastMoveDurations.value[user.id] || 0
}

const transformStyle = computed(() => ({
  transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`,
}))
const boardShellStyle = computed(() => ({
  aspectRatio: `${getBoardPixelWidth()} / ${getBoardPixelHeight()}`,
}))
const showBoard = computed(() => roomStatus.value !== 'waiting')
const latestMove = computed(() => (moves.value.length ? moves.value[moves.value.length - 1] : null))
const showBoardViewportHighlight = computed(() =>
  roomStatus.value === 'playing' && currentPlayerId.value === currentUid() && !pendingMove.value
)

const currentUid = () => (route.params.userId as string) || userId

const selfUser = computed(() => users.value.find(user => user.id === currentUid()))
const shouldRotateXiangqiBoard = computed(
  () => activeGameMode.value === 'xiangqi' && selfUser.value?.color === 'black',
)
const toXiangqiViewPos = (x: number, y: number) =>
  shouldRotateXiangqiBoard.value ? { x: XIANGQI_COLS - 1 - x, y: XIANGQI_ROWS - 1 - y } : { x, y }
const toXiangqiWorldPos = (x: number, y: number) =>
  shouldRotateXiangqiBoard.value ? { x: XIANGQI_COLS - 1 - x, y: XIANGQI_ROWS - 1 - y } : { x, y }
const blackPlayer = computed(() => users.value.find(user => user.id === blackUserId.value))
const whitePlayer = computed(() => users.value.find(user => user.id === whiteUserId.value))
const recordPlayers = computed(() => {
  if (activeGameMode.value === 'checkers') {
    return users.value.filter(
      (user) => user.color === 'yellow' || user.color === 'blue' || user.color === 'red',
    )
  }
  return [blackPlayer.value, whitePlayer.value].filter(Boolean)
})
const isHost = computed(() => hostId.value === currentUid())
const isActivePlayer = computed(() => currentPlayerId.value === currentUid())
const currentUserCheckersDraft = computed(() => {
  const uid = currentUid()
  return uid ? (checkersDrafts.value[uid] || null) : null
})
const currentUserXiangqiDraft = computed(() => {
  const uid = currentUid()
  return uid ? (xiangqiDrafts.value[uid] || null) : null
})
const currentUserCsSelections = computed(() => {
  const uid = currentUid()
  return uid ? csSelections.value[uid] || [] : []
})
const isCurrentUserCsConfirmed = computed(() => {
  const uid = currentUid()
  return uid ? csRoundConfirmed.value[uid] === true : false
})
const currentSelectedCsMoved = computed(() =>
  csSelectedUnitId.value ? csRoundMoved.value[csSelectedUnitId.value] === true : false
)
const canOperateCsRound = computed(() =>
  activeGameMode.value === 'cs' &&
  roomStatus.value === 'playing' &&
  csRound.value > 0 &&
  csPhase.value === 'action' &&
  !isCurrentUserCsConfirmed.value
)
const currentUserCheckersStartZone = computed(() => {
  const uid = currentUid()
  if (!uid) return 3
  const targetZone = checkersTargetZones.value[uid]
  if (targetZone === undefined) return 3
  return getOppositeCheckersZoneIndex(targetZone)
})
const checkersRotationSteps = computed(() => {
  const startZone = currentUserCheckersStartZone.value
  const stepsToBottom: Record<number, number> = {
    0: 3,
    1: 4,
    2: 5,
    3: 0,
    4: 1,
    5: 2,
  }
  return stepsToBottom[startZone] ?? 0
})
const blackSelectionModeLabel = computed(() => (blackSelectionMode.value === 'random' ? '随机' : '败者'))
const activeGameMode = computed(() => (roomStatus.value === 'settlement' ? nextGameMode.value : currentGameMode.value))
const activeGameModeLabel = computed(() => gameModeLabelMap[activeGameMode.value])

const fitBoardToViewport = () => {
  const viewport = boardViewportRef.value
  const canvas = boardCanvasRef.value
  if (!viewport || !canvas) return
  const rect = viewport.getBoundingClientRect()
  const boardWidth = getBoardPixelWidth()
  const boardHeight = getBoardPixelHeight()
  const availWidth = Math.max(1, rect.width)
  const availHeight = Math.max(1, rect.height)
  const scaleX = availWidth / boardWidth
  const scaleY = availHeight / boardHeight
  scale.value = Math.min(scaleX, scaleY, 2.2)
  offsetX.value = (availWidth - boardWidth * scale.value) / 2
  offsetY.value = (availHeight - boardHeight * scale.value) / 2
}

const scheduleBoardFit = () => {
  if (boardFitFrame !== null) {
    cancelAnimationFrame(boardFitFrame)
  }
  boardFitFrame = window.requestAnimationFrame(() => {
    boardFitFrame = null
    fitBoardToViewport()
  })
}

watch(
  () => [showBoard.value, boardSize.value, currentGameMode.value],
  async () => {
    if (!showBoard.value) return
    await nextTick()
    scheduleBoardFit()
    scheduleBoardRender()
  },
  { immediate: true }
)

watch(
  () => [
    users.value,
    board.value,
    latestMove.value,
    pendingMove.value,
    roomStatus.value,
    checkersTargetZones.value,
    checkersPieces.value,
    checkersDrafts.value,
    checkersLatestMove.value,
    xiangqiPieces.value,
    xiangqiDrafts.value,
    xiangqiLatestMove.value,
    csUnits.value,
    csRoundMoved.value,
    csSelectedUnitId.value,
    csRound.value,
  ],
  () => {
    scheduleBoardRender()
  },
  { deep: true }
)

const syncRoomStatus = (data: any) => {
  loading.value = false
  roomStatus.value = data.status
  users.value = Array.isArray(data.users) ? data.users : []
  hostId.value = data.hostId || ''
  blackSelectionMode.value = data.blackSelectionMode === 'random' ? 'random' : 'loser'
  currentGameMode.value =
    data.currentGameMode === 'xiangqi' || data.currentGameMode === 'checkers'
      ? data.currentGameMode
      : 'gomoku'
  nextGameMode.value =
    data.nextGameMode === 'xiangqi' || data.nextGameMode === 'checkers'
      ? data.nextGameMode
      : currentGameMode.value
  round.value = data.round || 0
  currentPlayerId.value = data.currentPlayerId || ''
  blackUserId.value = data.blackUserId || ''
  whiteUserId.value = data.whiteUserId || ''
  blackUserName.value = data.blackUserName || ''
  whiteUserName.value = data.whiteUserName || ''
  boardSize.value = data.boardSize || 15
  board.value = Array.isArray(data.board) ? data.board.map((row: any[]) => [...row]) : []
  moves.value = Array.isArray(data.moves) ? data.moves : []
  records.value = Array.isArray(data.records) ? data.records : []
  winnerId.value = data.winnerId || ''
  winnerName.value = data.winnerName || ''
  turnStartedAt.value = data.turnStartedAt || 0
  lastMoveDurations.value = data.lastMoveDurations || {}
  
  // 跳棋数据
  if (Array.isArray(data.checkersPieces)) {
    checkersPieces.value = data.checkersPieces
  }
  checkersPlayerCount.value = data.checkersPlayerCount || 2
  checkersDrafts.value = data.checkersDrafts || {}
  checkersTargetZones.value = data.checkersTargetZones || {}
  xiangqiPieces.value = Array.isArray(data.xiangqiPieces) ? data.xiangqiPieces : []
  xiangqiDrafts.value = data.xiangqiDrafts || {}
  xiangqiLatestMove.value =
    data.xiangqiLatestMove
    && Number.isInteger(data.xiangqiLatestMove.x)
    && Number.isInteger(data.xiangqiLatestMove.y)
      ? { x: data.xiangqiLatestMove.x, y: data.xiangqiLatestMove.y }
      : null
  csRound.value = Number.isInteger(data.csRound) ? data.csRound : 0
  csCandidates.value = Array.isArray(data.csCandidates) ? data.csCandidates : []
  csSelections.value = data.csSelections || {}
  csRoundConfirmed.value = data.csRoundConfirmed || {}
  csSpawnSelections.value = data.csSpawnSelections || {}
  csUnits.value = Array.isArray(data.csUnits) ? data.csUnits : []
  csRoundMoved.value = data.csRoundMoved || {}
  csVisibleEnemyUnits.value = data.csVisibleEnemyUnits || {}
  csPhase.value = data.csPhase || 'selection'
  if (currentGameMode.value !== 'cs' || roomStatus.value !== 'playing' || csRoundConfirmed.value[currentUid()]) {
    csSelectedUnitId.value = ''
    csMoveMode.value = false
  }
  if (currentGameMode.value !== 'checkers') {
    checkersLatestMove.value = null
    checkersTargetZones.value = {}
  }
  if (currentGameMode.value !== 'checkers' || roomStatus.value !== 'playing' || currentPlayerId.value !== currentUid()) {
    if (currentGameMode.value !== 'checkers' || roomStatus.value !== 'playing') {
      checkersDrafts.value = {}
    }
  }
  if (currentGameMode.value !== 'xiangqi' || roomStatus.value !== 'playing') {
    xiangqiDrafts.value = {}
    xiangqiLatestMove.value = null
  }

  if (!editingName.value && selfUser.value?.name) {
    editingName.value = selfUser.value.name
  }

  if (showBoard.value) {
    nextTick(() => {
      scheduleBoardFit()
    })
  }

  scheduleBoardRender()
}

const applyBoardPatch = (patch: any) => {
  if (!patch) return
  if (patch.type === 'reset' && Array.isArray(patch.board)) {
    board.value = patch.board.map((row: any[]) => [...row])
    scheduleBoardRender()
    return
  }

  if (!Number.isInteger(patch.x) || !Number.isInteger(patch.y)) return
  if (!Array.isArray(board.value) || !board.value[patch.y]) return
  if (patch.type === 'delete') {
    board.value[patch.y][patch.x] = ''
  } else {
    board.value[patch.y][patch.x] = patch.color || ''
  }
  scheduleBoardRender()
}

watch(
  () => [roomStatus.value, currentPlayerId.value],
  () => {
    if (roomStatus.value !== 'playing' || currentPlayerId.value !== currentUid()) {
      pendingMove.value = null
    }
  }
)

const setZoom = (delta: number, clientX?: number, clientY?: number) => {
  const viewport = boardViewportRef.value
  if (!viewport) return
  const rect = viewport.getBoundingClientRect()
  const nextScale = Math.min(2.2, Math.max(0.5, scale.value + delta))
  const anchorX = clientX ?? rect.left + rect.width / 2
  const anchorY = clientY ?? rect.top + rect.height / 2
  const localX = (anchorX - rect.left - offsetX.value) / scale.value
  const localY = (anchorY - rect.top - offsetY.value) / scale.value
  scale.value = nextScale
  offsetX.value = anchorX - rect.left - localX * nextScale
  offsetY.value = anchorY - rect.top - localY * nextScale
}

const onWheel = (event: WheelEvent) => {
  event.preventDefault()
  setZoom(event.deltaY < 0 ? 0.08 : -0.08, event.clientX, event.clientY)
}

const onPointerDown = (event: PointerEvent) => {
  event.preventDefault()
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  pointerDownTarget.value = event.target as HTMLElement
  pointerDownX.value = event.clientX
  pointerDownY.value = event.clientY
  panStartX.value = event.clientX
  panStartY.value = event.clientY
  panOriginX.value = offsetX.value
  panOriginY.value = offsetY.value
  isPanning.value = false
  const currentTarget = event.currentTarget as HTMLElement | null
  currentTarget?.setPointerCapture?.(event.pointerId)

  if (activePointers.size === 2) {
    const viewport = boardViewportRef.value
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const points = Array.from(activePointers.values())
    const first = points[0]
    const second = points[1]
    pinchStartDistance.value = Math.hypot(first.x - second.x, first.y - second.y)
    pinchStartScale.value = scale.value
    pinchStartOffsetX.value = offsetX.value
    pinchStartOffsetY.value = offsetY.value
    pinchCenterX.value = (first.x + second.x) / 2 - rect.left
    pinchCenterY.value = (first.y + second.y) / 2 - rect.top
    isPanning.value = true
    pointerDownTarget.value = null
  }
}

const onPointerMove = (event: PointerEvent) => {
  event.preventDefault()
  if (!activePointers.has(event.pointerId)) return
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  if (activePointers.size >= 2) {
    const viewport = boardViewportRef.value
    if (!viewport || pinchStartDistance.value <= 0) return
    const rect = viewport.getBoundingClientRect()
    const points = Array.from(activePointers.values())
    const first = points[0]
    const second = points[1]
    const currentDistance = Math.hypot(first.x - second.x, first.y - second.y)
    const nextScale = Math.min(2.2, Math.max(0.5, pinchStartScale.value * (currentDistance / pinchStartDistance.value)))
    const localX = (pinchCenterX.value - pinchStartOffsetX.value) / pinchStartScale.value
    const localY = (pinchCenterY.value - pinchStartOffsetY.value) / pinchStartScale.value
    scale.value = nextScale
    offsetX.value = pinchCenterX.value - localX * nextScale
    offsetY.value = pinchCenterY.value - localY * nextScale
    isPanning.value = true
    pointerDownTarget.value = null
    return
  }

  if (pointerDownTarget.value === null) return
  const distanceX = Math.abs(event.clientX - pointerDownX.value)
  const distanceY = Math.abs(event.clientY - pointerDownY.value)
  if (!isPanning.value && distanceX < 4 && distanceY < 4) return
  isPanning.value = true
  offsetX.value = panOriginX.value + (event.clientX - panStartX.value)
  offsetY.value = panOriginY.value + (event.clientY - panStartY.value)
}

const onPointerUp = (event: PointerEvent) => {
  event.preventDefault()
  activePointers.delete(event.pointerId)
  const wasPanning = isPanning.value

  if (activePointers.size >= 2) {
    pointerDownTarget.value = null
    isPanning.value = true
    return
  }

  pointerDownTarget.value = null
  isPanning.value = false
  pinchStartDistance.value = 0

  if (wasPanning) {
    return
  }

  if (currentGameMode.value === 'checkers') {
    const hex = getCheckersHexFromClient(event.clientX, event.clientY)
    if (hex) {
      handleCheckersClick(hex.q, hex.r)
    }
  } else if (currentGameMode.value === 'xiangqi') {
    const cell = getXiangqiCellFromClient(event.clientX, event.clientY)
    if (cell) {
      handleXiangqiClick(cell.x, cell.y)
    }
  } else if (currentGameMode.value === 'gomoku') {
    const cell = getBoardCellFromClient(event.clientX, event.clientY)
    if (cell) {
      placeStone(cell.x, cell.y)
    }
  }
}

const onDoubleClick = (event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()
}

const onTouchEndPreventZoom = (event: TouchEvent) => {
  const nowTs = Date.now()
  if (nowTs - lastTouchEndAt.value < 320) {
    // iOS Safari can still trigger native double-tap zoom even with touch-action.
    event.preventDefault()
    event.stopPropagation()
  }
  lastTouchEndAt.value = nowTs
}

const onGestureBlock = (event: Event) => {
  event.preventDefault()
  event.stopPropagation()
}

const surrenderPlayer = (userId: string) => {
  const confirmed = window.confirm(`确定要在${activeGameModeLabel.value}中投降吗？`)
  if (!confirmed) return
  socket.emit('setUserStatus', { userId, status: 'end' }, (response: any) => {
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '认输失败', type: '!' })
    }
  })
}

const getMoveLabel = (record: any) => `${record.round}回合`

const restartGame = () => {
  if (!isHost.value) return
  const confirmed = window.confirm('确定重启房间吗？这会清空所有对局数据并回到准备状态。')
  if (!confirmed) return
  socket.emit('restartGame', { roomId }, (response: any) => {
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '重启失败', type: '!' })
    }
  })
}

const openSettingsModal = () => {
  settingsModal.show = true
  settingsModal.blackSelectionMode = blackSelectionMode.value
}

const updateBlackSelectionMode = (value: number | string | null) => {
  if (value === '随机') {
    settingsModal.blackSelectionMode = 'random'
    return
  }
  if (value === '败者') {
    settingsModal.blackSelectionMode = 'loser'
  }
}

const updateGameMode = (value: number | string | null) => {
  if (typeof value !== 'string') return
  const gameMode = gameModeValueMap[value] || 'gomoku'
  socket.emit('updateGameMode', { roomId, gameMode }, (response: any) => {
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '切换游戏失败', type: '!' })
    }
  })
}

const saveGameSettings = () => {
  if (!isHost.value) return
  settingsModal.saving = true
  socket.emit(
    'updateGameSettings',
    { roomId, blackSelectionMode: settingsModal.blackSelectionMode },
    (response: any) => {
      settingsModal.saving = false
      if (response?.success === false) {
        toastStore.showToast({ content: response.message || '保存失败', type: '!' })
        return
      }
      settingsModal.show = false
    }
  )
}

const startGame = () => {
  if (users.value.length < 2) {
    toastStore.showToast({ content: '至少需要 2 名玩家开始游戏', type: '!' })
    return
  }
  socket.emit('startGame', { roomId, userId: currentUid() }, wsErrorHandler)
}

const renameUser = (nextName?: string) => {
  const trimmedName = (nextName ?? editingName.value).trim()
  if (trimmedName.length < 1 || trimmedName.length > 16) {
    toastStore.showToast({ content: '名称需要1-16字符', type: '!' })
    return
  }
  const currentUser = selfUser.value
  if (!currentUser) return
  if (currentUser.name === trimmedName) {
    editingName.value = trimmedName
    return
  }
  socket.emit('renameUser', { userId: currentUser.id, newName: trimmedName }, (response: any) => {
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '改名失败', type: '!' })
      editingName.value = currentUser.name
      return
    }
    editingName.value = trimmedName
  })
}

const cancelEditName = () => {
  editingName.value = selfUser.value?.name || ''
}

const placeStone = (x: number, y: number) => {
  if (!isActivePlayer.value || roomStatus.value !== 'playing') return
  if (board.value?.[y]?.[x]) return

  if (!pendingMove.value) {
    const color = selfUser.value?.color as GomokuColor | undefined
    if (color !== 'black' && color !== 'white') return
    pendingMove.value = { x, y, color }
    return
  }

  if (pendingMove.value.x !== x || pendingMove.value.y !== y) {
    const color = selfUser.value?.color as GomokuColor | undefined
    if (color !== 'black' && color !== 'white') return
    pendingMove.value = { x, y, color }
    return
  }

  socket.emit('placeStone', { x, y }, (response: any) => {
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '落子失败', type: '!' })
      pendingMove.value = null
      return
    }
    pendingMove.value = null
  })
}

// 跳棋交互：每次点击只发送坐标，由后端判定并返回草稿状态
const handleCheckersClick = (q: number, r: number) => {
  if (!isActivePlayer.value || roomStatus.value !== 'playing') return

  const currentDraft = currentUserCheckersDraft.value
  if (
    currentDraft
    && currentDraft.moveKind !== 'none'
    && currentDraft.current.q === q
    && currentDraft.current.r === r
  ) {
    confirmCheckersSelection()
    return
  }

  socket.emit('checkersClick', { q, r }, (response: any) => {
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '移动失败', type: '!' })
      if (response?.draft !== undefined) {
        const uid = currentUid()
        if (uid) {
          checkersDrafts.value[uid] = response.draft || null
        }
      }
      return
    }
    const uid = currentUid()
    if (uid) {
      checkersDrafts.value[uid] = response?.draft || null
    }
  })
}

const handleXiangqiClick = (x: number, y: number) => {
  if (!isActivePlayer.value || roomStatus.value !== 'playing') return

  socket.emit('xiangqiClick', { x, y }, (response: any) => {
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '移动失败', type: '!' })
      if (response?.draft !== undefined) {
        const uid = currentUid()
        if (uid) {
          xiangqiDrafts.value[uid] = response.draft || null
        }
      }
      return
    }
    const uid = currentUid()
    if (uid) {
      xiangqiDrafts.value[uid] = response?.draft || null
    }
  })
}

const handleCsBoardClick = (x: number, y: number, clickOffsetY?: number) => {
  if (!canOperateCsRound.value) return
  const uid = currentUid()

  if (csMoveMode.value && csSelectedUnitId.value) {
    socket.emit('csMove', { unitId: csSelectedUnitId.value, toX: x, toY: y }, (response: any) => {
      if (response?.success === false) {
        toastStore.showToast({ content: response.message || '移动失败', type: '!' })
        return
      }
      csMoveMode.value = false
      csSelectedUnitId.value = ''
    })
    return
  }

  const myUnitsAtPoint = csUnits.value.filter((u) => u.ownerId === uid && u.x === x && u.y === y)
  if (!myUnitsAtPoint.length) {
    csSelectedUnitId.value = ''
    csMoveMode.value = false
    return
  }

  myUnitsAtPoint.sort((a, b) => a.name.localeCompare(b.name))

  // Click-hit by vertical offset: map click to the rendered text row index.
  const totalHeight = (myUnitsAtPoint.length - 1) * CS_UNIT_LINE_HEIGHT
  const rawIndex =
    typeof clickOffsetY === 'number'
      ? Math.round((clickOffsetY + totalHeight / 2) / CS_UNIT_LINE_HEIGHT)
      : 0
  const clampedIndex = Math.max(0, Math.min(myUnitsAtPoint.length - 1, rawIndex))
  csSelectedUnitId.value = myUnitsAtPoint[clampedIndex].id
  csMoveMode.value = false
}

const confirmCheckersSelection = () => {
  socket.emit('checkersConfirm', (response: any) => {
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '确认失败', type: '!' })
      if (response?.draft !== undefined) {
        const uid = currentUid()
        if (uid) {
          checkersDrafts.value[uid] = response.draft || null
        }
      }
      return
    }
    const uid = currentUid()
    if (uid) {
      checkersDrafts.value[uid] = null
    }
  })
}

// 取消跳棋草稿
const cancelCheckersSelection = () => {
  socket.emit('checkersCancel', (response: any) => {
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '取消失败', type: '!' })
      return
    }
    const uid = currentUid()
    if (uid) {
      checkersDrafts.value[uid] = null
    }
  })
}

const confirmXiangqiSelection = () => {
  socket.emit('xiangqiConfirm', (response: any) => {
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '确认失败', type: '!' })
      if (response?.draft !== undefined) {
        const uid = currentUid()
        if (uid) {
          xiangqiDrafts.value[uid] = response.draft || null
        }
      }
      return
    }
    const uid = currentUid()
    if (uid) {
      xiangqiDrafts.value[uid] = null
    }
  })
}

const toggleCsCandidate = (candidate: string) => {
  if (roomStatus.value !== 'playing' || currentGameMode.value !== 'cs') return
  socket.emit('csToggleCandidate', { candidate }, (response: any) => {
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '操作失败', type: '!' })
      return
    }
  })
}

const confirmCsRound = () => {
  if (roomStatus.value !== 'playing' || currentGameMode.value !== 'cs') return
  socket.emit('csConfirmRound', (response: any) => {
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '确认失败', type: '!' })
      return
    }
  })
}

const startCsMoveMode = () => {
  if (!canOperateCsRound.value) return
  if (currentSelectedCsMoved.value) {
    toastStore.showToast({ content: '该棋子本回合已操作过', type: '!' })
    return
  }
  if (!csSelectedUnitId.value) {
    toastStore.showToast({ content: '请先点击地图上的己方棋子', type: '!' })
    return
  }
  csMoveMode.value = true
}

const completeCsRound = () => {
  if (!canOperateCsRound.value) return
  socket.emit('csCompleteRound', (response: any) => {
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '完成失败', type: '!' })
      return
    }
    csMoveMode.value = false
    csSelectedUnitId.value = ''
  })
}

const cancelXiangqiSelection = () => {
  socket.emit('xiangqiCancel', (response: any) => {
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '取消失败', type: '!' })
      return
    }
    const uid = currentUid()
    if (uid) {
      xiangqiDrafts.value[uid] = null
    }
  })
}

const setUserStatus = (status: 'ready' | 'end') => {
  const currentUser = selfUser.value
  if (!currentUser) return
  socket.emit('setUserStatus', { userId: currentUser.id, status }, (response: any) => {
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '状态更新失败', type: '!' })
    }
  })
}

const wsErrorHandler = (error: any) => {
  if (error?.success === false) {
    toastStore.showToast({ content: error.message || '操作失败', type: '!' })
    return
  }
}

const genRoomLabel = (id: string) => id.slice(0, 8)

onMounted(() => {
  if (!userId) {
    joinError.value = '缺少用户ID，请使用带用户ID的链接进入'
    loading.value = false
    return
  }

  const wsUrl = ip.replace('http://', 'ws://').replace('https://', 'wss://')
  socket = io(wsUrl, {
    path: '/socket.io',
    transports: ['websocket'],
    timeout: 5000,
  })

  socket.on('connect_error', (error: any) => {
    if (loading.value) {
      loading.value = false
    }
    joinError.value = error?.message || '连接失败'
  })

  socket.on('connect', () => {
    const uid = (route.params.userId as string) || userId
    socket.emit('joinRoom', { roomId, userId: uid }, (resp: any) => {
      if (resp && resp.success === false) {
        joinError.value = resp.message || '该用户已占用'
        loading.value = false
        toastStore.showToast({ content: joinError.value, type: '!' })
        socket.disconnect()
        return
      }
      loading.value = false
    })
  })

  socket.on('syncRoomStatus', syncRoomStatus)
  socket.on('syncCsState', (data: any) => {
    csRound.value = Number.isInteger(data.csRound) ? data.csRound : 0
    csUnits.value = Array.isArray(data.csUnits) ? data.csUnits : []
    csRoundMoved.value = data.csRoundMoved || {}
    csRoundConfirmed.value = data.csRoundConfirmed || {}
    csVisibleEnemyUnits.value = data.csVisibleEnemyUnits || {}
    csPhase.value = data.csPhase || 'action'
  })
  socket.on('boardPatch', applyBoardPatch)
  socket.on('checkersBoardPatch', (patch: any) => {
    if (!patch) return
    if (patch.type === 'reset' && Array.isArray(patch.pieces)) {
      checkersPieces.value = patch.pieces
      checkersDrafts.value = {}
      checkersLatestMove.value = null
      scheduleBoardRender()
      return
    }
    if (patch.type === 'move' && patch.from && patch.to) {
      const piece = checkersPieces.value.find((p) => p.q === patch.from.q && p.r === patch.from.r)
      if (piece) {
        piece.q = patch.to.q
        piece.r = patch.to.r
      }
      checkersLatestMove.value = { q: patch.to.q, r: patch.to.r }
      if (patch.playerId) {
        checkersDrafts.value[patch.playerId] = null
      }
      scheduleBoardRender()
    }
  })
  socket.on('checkersDraftState', (payload: any) => {
    if (!payload?.userId) return
    checkersDrafts.value[payload.userId] = payload?.draft || null
    if (payload?.message) {
      toastStore.showToast({ content: payload.message, type: '!' })
    }
    scheduleBoardRender()
  })
  socket.on('xiangqiDraftState', (payload: any) => {
    if (!payload?.userId) return
    xiangqiDrafts.value[payload.userId] = payload?.draft || null
    if (payload?.message) {
      toastStore.showToast({ content: payload.message, type: '!' })
    }
    scheduleBoardRender()
  })
  socket.on('gameResult', (result: { winnerId: string, winnerName: string }) => {
    toastStore.showToast({ content: `${result.winnerName || '本局'}获胜`, type: 'OK' })
  })
  socket.on('roomClosed', (data: any) => {
    joinError.value = data?.message || '房间已关闭'
    loading.value = false
  })

  boardResizeHandler = () => {
    scheduleBoardFit()
  }
  window.addEventListener('resize', boardResizeHandler)

  now.value = Date.now()
  tickTimer = window.setInterval(() => {
    now.value = Date.now()
  }, 500)
})

onUnmounted(() => {
  if (socket) {
    socket.disconnect()
  }
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
  if (boardFitFrame !== null) {
    cancelAnimationFrame(boardFitFrame)
    boardFitFrame = null
  }
  if (boardRenderFrame !== null) {
    cancelAnimationFrame(boardRenderFrame)
    boardRenderFrame = null
  }
  if (boardResizeHandler) {
    window.removeEventListener('resize', boardResizeHandler)
    boardResizeHandler = null
  }
})
</script>

<template>
  <div class="gomoku-room-container">
    <div v-if="loading && !joinError" class="loading">
      <p>加载中...</p>
    </div>

    <div v-else-if="joinError" class="error">
      <p>{{ joinError }}</p>
    </div>

    <div v-else class="room-content">
      <div class="room-toolbar">
        <div class="room-title">
          <template v-if="roomStatus === 'playing' || !isHost">
            {{ roomStatus === 'settlement' ? gameModeLabelMap[nextGameMode] : activeGameModeLabel }}
          </template>
          <StepperFilter
            v-else
            class="game-mode-filter"
            :value="roomStatus === 'settlement' ? gameModeLabelMap[nextGameMode] : activeGameModeLabel"
            :options="gameModeOptions"
            :loop="true"
            :nullable="false"
            :btn-size="24"
            :btn-font-size="13"
            :btn-mobile-size="26"
            :btn-mobile-font-size="13"
            @update:value="updateGameMode"
          />
        </div>
        <div class="toolbar-actions">
          <Btn v-if="isHost" small @click="openSettingsModal">设置</Btn>
          <Btn v-if="isHost" small type="danger" @click="restartGame">重启</Btn>
        </div>
      </div>

      <div class="players-list">
        <div
          v-for="user in users"
          :key="user.id"
          class="player-item"
          :class="{
            'current-player-is-me':
              roomStatus === 'playing' && currentPlayerId === user.id && user.id === currentUid(),
            'winner-player': roomStatus === 'settlement' && user.id === winnerId,
          }"
        >
          <div class="player-row">
            <div class="player-info">
              <div class="status-indicator" :class="user.connectStatus"></div>
              <EditableInput
                v-if="user.id === currentUid()"
                v-model="editingName"
                :maxLength="16"
                class="player-name editable"
                placeholder="请输入用户名"
                @submit="renameUser"
                @cancel="cancelEditName"
              />
              <span v-else class="player-name">{{ user.name }}</span>
              <Badge
                v-if="roomStatus === 'waiting' && user.id === hostId"
                color="#1890ff"
                text-color="white"
                text="房主"
              />
              <Badge v-if="user.id === currentUid()" color="#722ed1" text-color="white" text="我" />
              <Badge
                v-if="user.color === 'black'"
                color="var(--bg)"
                text-color="var(--text)"
              >
                <template #default>
                  <div class="badge-icon black"></div>
                  {{ activeGameMode === 'xiangqi' ? '将' : '黑棋' }}
                </template>
              </Badge>
              <Badge
                v-if="user.color === 'white'"
                color="var(--bg)"
                text-color="var(--text)"
              >
                <template #default>
                  <div class="badge-icon white"></div>
                  {{ activeGameMode === 'xiangqi' ? '帅' : '白棋' }}
                </template>
              </Badge>
              <Badge v-if="user.color === 'yellow'" color="var(--bg)" text-color="var(--text)">
                <template #default>
                  <div class="badge-icon yellow"></div>
                  黄棋
                </template>
              </Badge>
              <Badge v-if="user.color === 'red'" color="var(--bg)" text-color="var(--text)">
                <template #default>
                  <div class="badge-icon red"></div>
                  红棋
                </template>
              </Badge>
              <Badge v-if="user.color === 'blue'" color="var(--bg)" text-color="var(--text)">
                <template #default>
                  <div class="badge-icon blue"></div>
                  蓝棋
                </template>
              </Badge>
              <Badge
                v-if="roomStatus === 'playing' && currentPlayerId === user.id"
                color="#1890ff"
                text-color="white"
                type="loading"
                :text="`思考中 ${formatDuration(getPlayerThinkTime(user))}`"
              />
              <Badge
                v-if="user.readyStatus === 'ready'"
                color="var(--accent-color)"
                text-color="white"
                text="已准备"
              />
              <Badge
                v-else-if="user.readyStatus === 'end'"
                color="#ff4d4f"
                text-color="white"
                text="不玩了"
              />
            </div>
            <div class="player-actions">
              <Btn
                v-if="roomStatus === 'settlement' && user.id === currentUid()"
                small
                type="primary"
                @click="setUserStatus('ready')"
                >再来一局</Btn
              >
              <Btn
                v-if="roomStatus === 'settlement' && user.id === currentUid()"
                small
                type="danger"
                @click="setUserStatus('end')"
                >不玩了</Btn
              >
              <Btn
                v-if="roomStatus === 'playing' && user.id === currentUid()"
                small
                @click="surrenderPlayer(user.id)"
                >🏳️</Btn
              >
            </div>
          </div>
        </div>
      </div>
      <div v-if="roomStatus === 'waiting' && isHost" class="start-row">
        <Btn @click="startGame">{{
          users.length < 2 ? '至少需要 2 名玩家开始游戏' : '开始游戏'
        }}</Btn>
      </div>

      <template v-if="showBoard">
        <div class="board-shell" :style="boardShellStyle">
          <div
            ref="boardViewportRef"
            class="board-viewport"
            :class="{ 'turn-highlight': showBoardViewportHighlight }"
            @wheel.prevent="onWheel"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @dblclick.prevent.stop="onDoubleClick"
            @touchend="onTouchEndPreventZoom"
            @gesturestart="onGestureBlock"
            @gesturechange="onGestureBlock"
            @gestureend="onGestureBlock"
          >
            <div class="board-stage" :style="transformStyle">
              <canvas ref="boardCanvasRef" class="board-canvas"></canvas>
            </div>
          </div>
        </div>

        <div class="board-zoom-controls">
          <div class="board-ops-left">
          </div>
          <div class="board-ops-right">
          <Btn
            v-if="currentGameMode === 'checkers' && currentUserCheckersDraft && currentUserCheckersDraft.moveKind !== 'none'"
            class="board-zoom-btn"
            small
            type="primary"
            @click="confirmCheckersSelection"
            >确定</Btn
          >
          <Btn
            v-if="currentGameMode === 'checkers' && currentUserCheckersDraft"
            class="board-zoom-btn"
            small
            type="danger"
            @click="cancelCheckersSelection"
            >取消</Btn
          >
          <Btn
            v-if="currentGameMode === 'xiangqi' && currentUserXiangqiDraft"
            class="board-zoom-btn"
            small
            type="primary"
            :disabled="currentUserXiangqiDraft.moveKind === 'none'"
            @click="confirmXiangqiSelection"
            >确定</Btn
          >
          <Btn
            v-if="currentGameMode === 'xiangqi' && currentUserXiangqiDraft"
            class="board-zoom-btn"
            small
            type="danger"
            @click="cancelXiangqiSelection"
            >取消</Btn
          >
          <CircleBtn
            class="board-zoom-btn"
            variant="muted"
            size="26"
            font-size="14"
            aria-label="缩放"
            @click="fitBoardToViewport"
          >
            <span class="focus-reticle" aria-hidden="true"></span>
          </CircleBtn>
          </div>
        </div>

      </template>

      <Card v-if="recordPlayers.length">
        <template #title>对局记录</template>
        <RecordTable :players="recordPlayers" :records="records" />
      </Card>

      <Modal
        v-model:show="settingsModal.show"
        title="设置"
        placement="center"
        cancel-text="取消"
        confirm-text="保存"
        :confirm-loading="settingsModal.saving"
        @cancel="settingsModal.show = false"
        @confirm="saveGameSettings"
      >
        <div class="field-group">
          <div class="field-row">
            <div class="field-label">如何选择黑棋</div>
            <StepperFilter
              class="black-selection-filter"
              :value="settingsModal.blackSelectionMode === 'random' ? '随机' : '败者'"
              :options="blackSelectionOptions"
              :nullable="false"
              :btn-size="24"
              :btn-font-size="13"
              :btn-mobile-size="26"
              :btn-mobile-font-size="13"
              @update:value="updateBlackSelectionMode"
            />
          </div>
        </div>
      </Modal>
    </div>
  </div>
</template>

<style lang="less" scoped>
.gomoku-room-container {
  padding: 6px 6px 60px;
  max-width: 920px;
  margin: 0 auto;
  .card {
    width: calc(100% - 1.5rem);
  }
}

.loading,
.error {
  text-align: center;
  padding: 40px;
  font-size: 16px;
}

.error {
  color: #ff4d4f;
}

.room-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.room-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 4px 0;
}

.room-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  min-width: 0;
  display: flex;
  align-items: center;
}

.game-mode-filter {
  width: auto;
  min-width: 0;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.board-shell {
  position: relative;
  width: 100%;
  margin: 0 auto;
  aspect-ratio: 1 / 1;
}

.player-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.player-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex-wrap: wrap;
}

.board-viewport {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #d8b06d;
  border-radius: 12px;
  margin: 0;
  touch-action: none;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: auto;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  transition: box-shadow 0.3s ease;
}

.board-viewport.turn-highlight {
  box-shadow: 0 0 4px 1px gold;
}

.board-zoom-controls {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
}

.board-ops-left,
.board-ops-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.board-ops-right {
  margin-left: auto;
}

.board-zoom-btn {
  opacity: 0.85;
}

.focus-reticle {
  display: inline-block;
  width: 14px;
  height: 14px;
  background:
    linear-gradient(var(--text) 0 0) left top/5px 1.5px no-repeat,
    linear-gradient(var(--text) 0 0) left top/1.5px 5px no-repeat,
    linear-gradient(var(--text) 0 0) right top/5px 1.5px no-repeat,
    linear-gradient(var(--text) 0 0) right top/1.5px 5px no-repeat,
    linear-gradient(var(--text) 0 0) left bottom/5px 1.5px no-repeat,
    linear-gradient(var(--text) 0 0) left bottom/1.5px 5px no-repeat,
    linear-gradient(var(--text) 0 0) right bottom/5px 1.5px no-repeat,
    linear-gradient(var(--text) 0 0) right bottom/1.5px 5px no-repeat;
}

.timer-row {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.board-stage {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  will-change: transform;
}

.board-canvas {
  display: block;
  width: auto;
  height: auto;
}

.records-card,
.players-card,
.settings-card {
  width: 100%;
}

.records-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.record-item {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--quote-bg);
}

.record-round,
.record-winner {
  font-size: 13px;
}

.record-winner .check {
  color: #2ecc71;
  font-weight: 700;
}

.empty-records {
  color: var(--text-secondary);
  font-size: 13px;
}

.players-list {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .badge-icon {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    box-shadow: 0 0 20px 1px var(--text);
    color: var(--text);
    background: var(--bg);
    &.black {
      background: black;
    }
    &.white {
      background: white;
    }
    &.yellow {
      background: #ffd700;
    }
    &.red {
      background: #dc143c;
    }
    &.blue {
      background: #4169e1;
    }
  }
}

.player-item {
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--card-bg);
  box-sizing: border-box;
  border: 1px solid transparent;
  &.current-player-is-me {
    border-color: rgba(255, 217, 0, 0.6);
  }

  &.winner-player {
    border-color: rgba(255, 77, 79, 0.95);
    box-shadow: 0 0 0 1px rgba(255, 77, 79, 0.18);
  }
}

.cs-selector {
  margin-top: 6px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.cs-candidates {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  flex: 1;
  min-width: 0;
}

.cs-candidate {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  line-height: 1.2;
  padding: 0;
  cursor: pointer;

  &.selected {
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-thickness: 2px;
  }

  &.confirmed {
    opacity: 0.75;
    cursor: default;
  }
}

.cs-actions {
  flex: 0 0 auto;
}

.player-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;

  &.connected {
    background-color: #52c41a;
  }

  &.disconnected {
    background-color: var(--border-light);
  }
}

.player-name {
  font-weight: 600;
}

.start-row {
  display: flex;
  justify-content: center;
}

.settings-modal {
  width: 100%;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.field-label {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.black-selection-filter {
  width: auto;
  min-width: 0;
  flex: 0 0 auto;
}

.black-selection-filter :deep(.stepper-filter) {
  width: auto;
}

.black-selection-filter :deep(.step-value) {
  font-size: 13px;
}

.black-selection-filter :deep(.step-btn) {
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .setting-row {
    flex-direction: column;
    align-items: stretch;
  }

  .modal-setting-row {
    flex-direction: column;
    align-items: stretch;
  }

  .field-row {
    gap: 8px;
  }
}
</style>
