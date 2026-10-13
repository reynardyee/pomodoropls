import { useEffect, useRef, useState } from 'react'
import './App.css'

type TimerMode = 'pomodoro' | 'short' | 'long'
type Durations = Record<TimerMode, number>
type Stream = 'lofi' | 'rainy-lofi'
type Difficulty = 'easy' | 'medium' | 'hard'
type Ringtone = 'soft-chime' | 'classic-bell' | 'digital-pulse'
type BadgeColor = 'blue' | 'violet' | 'green' | 'amber' | 'rose'
type SudokuPuzzle = { clues: number[]; solution: number[] }
type PomodoroPreferences = {
  coffees: number
  focusSeconds: number
  ringtone: Ringtone
  ringtoneVolume: number
}
type CompletedStudySession = {
  id: string
  completedAt: string
  durationSeconds: number
  status: string
  statusColor: BadgeColor
  reflection: string
}
type PendingStudySession = Omit<CompletedStudySession, 'reflection'>
type GameSnapshot = {
  difficulty: Difficulty
  puzzleIndex: number
  cells: number[]
  notes: number[][]
  mistakes: number
  isFailed: boolean
  isWon: boolean
  isAnnotationMode: boolean
}

interface YouTubePlayer {
  destroy: () => void
  mute: () => void
  unMute: () => void
  setVolume: (volume: number) => void
}

interface YouTubePlayerEvent {
  target: YouTubePlayer
}

interface YouTubeApi {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string
      playerVars: Record<string, number | string>
      events: { onReady: (event: YouTubePlayerEvent) => void }
    },
  ) => YouTubePlayer
}

declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

const defaultDurations: Durations = {
  pomodoro: 25,
  short: 5,
  long: 15,
}

const modeLabels: Record<TimerMode, string> = {
  pomodoro: 'pomodoro',
  short: 'short break',
  long: 'long break',
}

const streamOptions: Stream[] = ['lofi', 'rainy-lofi']

const streams: Record<Stream, { label: string; videoId: string }> = {
  lofi: { label: 'Lofi hip hop radio', videoId: 'rFZHOHl-L8A' },
  'rainy-lofi': { label: 'Sad lofi radio', videoId: 'CwPCy1GLS38' },
}

const difficultyOptions: Difficulty[] = ['easy', 'medium', 'hard']
const difficultyClueTargets: Record<Difficulty, number> = { easy: 40, medium: 34, hard: 29 }
const maxMistakes = 3
const solvedGrid = [
  5, 3, 4, 6, 7, 8, 9, 1, 2,
  6, 7, 2, 1, 9, 5, 3, 4, 8,
  1, 9, 8, 3, 4, 2, 5, 6, 7,
  8, 5, 9, 7, 6, 1, 4, 2, 3,
  4, 2, 6, 8, 5, 3, 7, 9, 1,
  7, 1, 3, 9, 2, 4, 8, 5, 6,
  9, 6, 1, 5, 3, 7, 2, 8, 4,
  2, 8, 7, 4, 1, 9, 6, 3, 5,
  3, 4, 5, 2, 8, 6, 1, 7, 9,
]

function getCandidates(cells: number[], index: number) {
  const row = Math.floor(index / 9)
  const column = index % 9
  const boxRow = Math.floor(row / 3) * 3
  const boxColumn = Math.floor(column / 3) * 3
  const used = new Set<number>()

  for (let offset = 0; offset < 9; offset += 1) {
    used.add(cells[row * 9 + offset])
    used.add(cells[offset * 9 + column])
    used.add(cells[(boxRow + Math.floor(offset / 3)) * 9 + boxColumn + offset % 3])
  }

  return Array.from({ length: 9 }, (_, digit) => digit + 1).filter((digit) => !used.has(digit))
}

function countSolutions(cells: number[], limit = 2): number {
  let nextCell = -1
  let nextCandidates: number[] = []

  for (let index = 0; index < cells.length; index += 1) {
    if (cells[index] !== 0) continue
    const candidates = getCandidates(cells, index)
    if (candidates.length === 0) return 0
    if (nextCell === -1 || candidates.length < nextCandidates.length) {
      nextCell = index
      nextCandidates = candidates
    }
    if (candidates.length === 1) break
  }

  if (nextCell === -1) return 1

  let solutionCount = 0
  for (const candidate of nextCandidates) {
    cells[nextCell] = candidate
    solutionCount += countSolutions(cells, limit - solutionCount)
    cells[nextCell] = 0
    if (solutionCount >= limit) return solutionCount
  }

  return solutionCount
}

function createPuzzle(targetClues: number, variant: number): SudokuPuzzle {
  const clues = [...solvedGrid]
  let remainingClues = clues.length
  const removalOrder = Array.from({ length: 81 }, (_, index) => index)
    .sort((left, right) => ((left * 37 + variant * 19) % 81) - ((right * 37 + variant * 19) % 81))

  for (const index of removalOrder) {
    if (remainingClues <= targetClues) break
    const previous = clues[index]
    clues[index] = 0
    if (countSolutions([...clues], 2) === 1) {
      remainingClues -= 1
    } else {
      clues[index] = previous
    }
  }

  return { clues, solution: [...solvedGrid] }
}

const sudokuPuzzles: Record<Difficulty, SudokuPuzzle[]> = {
  easy: [createPuzzle(difficultyClueTargets.easy, 0), createPuzzle(difficultyClueTargets.easy, 1)],
  medium: [createPuzzle(difficultyClueTargets.medium, 2), createPuzzle(difficultyClueTargets.medium, 3)],
  hard: [createPuzzle(difficultyClueTargets.hard, 4), createPuzzle(difficultyClueTargets.hard, 5)],
}

function emptyNotes() {
  return Array.from({ length: 81 }, () => [] as number[])
}

const gameStorageKey = 'study-with-me-sudoku'
const preferencesStorageKey = 'study-with-me-pomodoro-preferences'
const studyStatusStorageKey = 'study-with-me-study-status'
const studySessionsStorageKey = 'study-with-me-completed-sessions'
const rewardIntervalSeconds = 30 * 60
const coffeeReward = 100
const ringtoneOptions: { value: Ringtone; label: string }[] = [
  { value: 'soft-chime', label: 'Soft chime' },
  { value: 'classic-bell', label: 'Classic bell' },
  { value: 'digital-pulse', label: 'Digital pulse' },
]
const badgeColors: { value: BadgeColor; label: string }[] = [
  { value: 'blue', label: 'Blue' },
  { value: 'violet', label: 'Violet' },
  { value: 'green', label: 'Green' },
  { value: 'amber', label: 'Amber' },
  { value: 'rose', label: 'Rose' },
]
const defaultStudyStatus = { text: '', color: 'blue' as BadgeColor }
let youtubeApiPromise: Promise<void> | undefined

function isBadgeColor(value: unknown): value is BadgeColor {
  return badgeColors.some((color) => color.value === value)
}

function readStudyStatus(): { text: string; color: BadgeColor; error: string } {
  try {
    const saved = localStorage.getItem(studyStatusStorageKey)
    if (!saved) return { ...defaultStudyStatus, error: '' }
    const parsed: unknown = JSON.parse(saved)
    if (
      typeof parsed !== 'object'
      || parsed === null
      || !('text' in parsed)
      || typeof parsed.text !== 'string'
      || parsed.text.length > 60
      || !('color' in parsed)
      || !isBadgeColor(parsed.color)
    ) {
      return { ...defaultStudyStatus, error: 'Saved study status was invalid; a blank status was loaded.' }
    }
    return { text: parsed.text, color: parsed.color, error: '' }
  } catch {
    return { ...defaultStudyStatus, error: 'Could not load your study status from this browser.' }
  }
}

function isCompletedStudySession(value: unknown): value is CompletedStudySession {
  if (typeof value !== 'object' || value === null) return false
  if (
    !('id' in value) || typeof value.id !== 'string'
    || !('completedAt' in value) || typeof value.completedAt !== 'string' || Number.isNaN(Date.parse(value.completedAt))
    || !('durationSeconds' in value) || typeof value.durationSeconds !== 'number' || !Number.isInteger(value.durationSeconds) || value.durationSeconds <= 0
    || !('status' in value) || typeof value.status !== 'string' || value.status.length > 60
    || !('statusColor' in value) || !isBadgeColor(value.statusColor)
    || !('reflection' in value) || typeof value.reflection !== 'string' || value.reflection.length > 1000
  ) return false
  return true
}

function readCompletedStudySessions(): { sessions: CompletedStudySession[]; error: string } {
  try {
    const saved = localStorage.getItem(studySessionsStorageKey)
    if (!saved) return { sessions: [], error: '' }
    const parsed: unknown = JSON.parse(saved)
    if (!Array.isArray(parsed) || !parsed.every(isCompletedStudySession)) {
      return { sessions: [], error: 'Saved study history was invalid; history was cleared.' }
    }
    return { sessions: parsed, error: '' }
  } catch {
    return { sessions: [], error: 'Could not load completed study sessions from this browser.' }
  }
}

const defaultPomodoroPreferences: PomodoroPreferences = {
  coffees: 0,
  focusSeconds: 0,
  ringtone: 'soft-chime',
  ringtoneVolume: 60,
}

function isRingtone(value: unknown): value is Ringtone {
  return ringtoneOptions.some((option) => option.value === value)
}

function readPomodoroPreferences(): { preferences: PomodoroPreferences; error: string } {
  try {
    const saved = localStorage.getItem(preferencesStorageKey)
    if (!saved) return { preferences: defaultPomodoroPreferences, error: '' }

    const parsed: unknown = JSON.parse(saved)
    if (typeof parsed !== 'object' || parsed === null) {
      return { preferences: defaultPomodoroPreferences, error: 'Saved timer preferences were invalid; defaults were loaded.' }
    }

    const values = parsed as Record<string, unknown>
    const valid = typeof values.coffees === 'number'
      && Number.isSafeInteger(values.coffees)
      && values.coffees >= 0
      && typeof values.focusSeconds === 'number'
      && Number.isInteger(values.focusSeconds)
      && values.focusSeconds >= 0
      && values.focusSeconds < rewardIntervalSeconds
      && isRingtone(values.ringtone)
      && typeof values.ringtoneVolume === 'number'
      && Number.isInteger(values.ringtoneVolume)
      && values.ringtoneVolume >= 0
      && values.ringtoneVolume <= 100

    if (!valid) {
      return { preferences: defaultPomodoroPreferences, error: 'Saved timer preferences were invalid; defaults were loaded.' }
    }

    return { preferences: values as PomodoroPreferences, error: '' }
  } catch {
    return { preferences: defaultPomodoroPreferences, error: 'Could not load timer preferences from this browser.' }
  }
}

function savePomodoroPreferences(preferences: PomodoroPreferences) {
  try {
    localStorage.setItem(preferencesStorageKey, JSON.stringify(preferences))
    return ''
  } catch {
    return 'Could not save coffee balance and timer settings to this browser.'
  }
}

function playRingtone(context: AudioContext, ringtone: Ringtone, volume: number) {
  const sounds: Record<Ringtone, { notes: number[]; type: OscillatorType; noteLength: number; gap: number }> = {
    'soft-chime': { notes: [659.25, 783.99, 987.77, 783.99], type: 'sine', noteLength: 0.34, gap: 0.12 },
    'classic-bell': { notes: [880, 0, 698.46, 0, 880, 0, 1046.5], type: 'triangle', noteLength: 0.24, gap: 0.12 },
    'digital-pulse': { notes: [880, 0, 880, 0, 1174.66, 0, 880], type: 'square', noteLength: 0.14, gap: 0.1 },
  }
  const sound = sounds[ringtone]
  const startAt = context.currentTime + 0.02
  const level = Math.min(1, Math.max(0, volume / 100)) * 0.2

  sound.notes.forEach((frequency, index) => {
    if (frequency === 0) return
    const start = startAt + index * (sound.noteLength + sound.gap)
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = sound.type
    oscillator.frequency.setValueAtTime(frequency, start)
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(level, start + 0.02)
    gain.gain.setValueAtTime(level, start + sound.noteLength * 0.65)
    gain.gain.linearRampToValueAtTime(0, start + sound.noteLength)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + sound.noteLength)
  })
}

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve()
  if (youtubeApiPromise) return youtubeApiPromise

  youtubeApiPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]')
    const previousCallback = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.()
      resolve()
    }

    if (existingScript) return

    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.onerror = () => reject(new Error('Could not load the YouTube player API.'))
    document.head.append(script)
  })

  return youtubeApiPromise
}

function isGameSnapshot(value: unknown): value is GameSnapshot {
  if (
    typeof value !== 'object'
    || value === null
    || !('difficulty' in value)
    || !('puzzleIndex' in value)
    || !('cells' in value)
    || !('notes' in value)
    || !('mistakes' in value)
    || !('isFailed' in value)
    || !('isWon' in value)
    || !('isAnnotationMode' in value)
  ) return false
  const difficulty = value.difficulty
  const puzzleIndex = value.puzzleIndex
  const cells = value.cells
  const notes = value.notes
  if (
    typeof difficulty !== 'string'
    || !difficultyOptions.includes(difficulty as Difficulty)
    || typeof puzzleIndex !== 'number'
    || !Number.isInteger(puzzleIndex)
    || puzzleIndex < 0
    || puzzleIndex >= sudokuPuzzles[difficulty as Difficulty].length
    || !Array.isArray(cells)
    || cells.length !== 81
    || !cells.every((cell: unknown): cell is number => typeof cell === 'number' && Number.isInteger(cell) && cell >= 0 && cell <= 9)
    || !Array.isArray(notes)
    || notes.length !== 81
    || !notes.every((cellNotes: unknown) => Array.isArray(cellNotes) && cellNotes.every((digit: unknown) => typeof digit === 'number' && Number.isInteger(digit) && digit >= 1 && digit <= 9))
    || typeof value.mistakes !== 'number'
    || !Number.isInteger(value.mistakes)
    || value.mistakes < 0
    || value.mistakes > maxMistakes
    || typeof value.isFailed !== 'boolean'
    || typeof value.isWon !== 'boolean'
    || typeof value.isAnnotationMode !== 'boolean'
  ) {
    return false
  }

  const puzzle = sudokuPuzzles[difficulty as Difficulty][puzzleIndex]
  return puzzle.clues.every((given, index) => given === 0 || cells[index] === given)
}

function createInitialGame(): GameSnapshot {
  return {
    difficulty: 'easy',
    puzzleIndex: 0,
    cells: [...sudokuPuzzles.easy[0].clues],
    notes: emptyNotes(),
    mistakes: 0,
    isFailed: false,
    isWon: false,
    isAnnotationMode: false,
  }
}

function readSavedGame(): { game: GameSnapshot; error: string } {
  const defaultGame = createInitialGame()

  try {
    const saved = localStorage.getItem(gameStorageKey)
    if (!saved) return { game: defaultGame, error: '' }

    const parsed: unknown = JSON.parse(saved)
    if (isGameSnapshot(parsed)) {
      return { game: parsed, error: '' }
    }

    return { game: defaultGame, error: 'Saved puzzle data was invalid, so a fresh puzzle was loaded.' }
  } catch {
    return { game: defaultGame, error: 'Could not load saved Sudoku progress from this browser.' }
  }
}

function isPuzzleComplete(cells: number[]) {
  if (cells.some((cell) => cell === 0)) return false

  for (let row = 0; row < 9; row += 1) {
    const rowValues = cells.slice(row * 9, row * 9 + 9)
    const columnValues = Array.from({ length: 9 }, (_, column) => cells[column * 9 + row])
    if (new Set(rowValues).size !== 9 || new Set(columnValues).size !== 9) return false
  }

  for (let boxRow = 0; boxRow < 3; boxRow += 1) {
    for (let boxColumn = 0; boxColumn < 3; boxColumn += 1) {
      const values = Array.from({ length: 9 }, (_, index) => {
        const row = boxRow * 3 + Math.floor(index / 3)
        const column = boxColumn * 3 + index % 3
        return cells[row * 9 + column]
      })
      if (new Set(values).size !== 9) return false
    }
  }

  return true
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

function isMobileDevice() {
  return window.matchMedia('(max-width: 700px)').matches
    || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent))
}

function App() {
  const [isMobile, setIsMobile] = useState(isMobileDevice)
  const [restoredPreferences] = useState(readPomodoroPreferences)
  const [restoredStudyStatus] = useState(readStudyStatus)
  const [restoredStudySessions] = useState(readCompletedStudySessions)
  const [mode, setMode] = useState<TimerMode>('pomodoro')
  const [durations, setDurations] = useState(defaultDurations)
  const [remaining, setRemaining] = useState(defaultDurations.pomodoro * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [coffees, setCoffees] = useState(restoredPreferences.preferences.coffees)
  const [focusSeconds, setFocusSeconds] = useState(restoredPreferences.preferences.focusSeconds)
  const [ringtone, setRingtone] = useState<Ringtone>(restoredPreferences.preferences.ringtone)
  const [ringtoneVolume, setRingtoneVolume] = useState(restoredPreferences.preferences.ringtoneVolume)
  const [settingsError, setSettingsError] = useState(restoredPreferences.error)
  const [studyStatus, setStudyStatus] = useState(restoredStudyStatus.text)
  const [studyStatusColor, setStudyStatusColor] = useState<BadgeColor>(restoredStudyStatus.color)
  const [studyStatusDraft, setStudyStatusDraft] = useState(restoredStudyStatus.text)
  const [studyStatusColorDraft, setStudyStatusColorDraft] = useState<BadgeColor>(restoredStudyStatus.color)
  const [isEditingStudyStatus, setIsEditingStudyStatus] = useState(false)
  const [studyStatusError, setStudyStatusError] = useState(restoredStudyStatus.error)
  const [completedSessions, setCompletedSessions] = useState(restoredStudySessions.sessions)
  const [studyHistoryError, setStudyHistoryError] = useState(restoredStudySessions.error)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [pendingStudySession, setPendingStudySession] = useState<PendingStudySession | null>(null)
  const [sessionReflection, setSessionReflection] = useState('')
  const [sessionSaveError, setSessionSaveError] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isMiniPlayerOpen, setIsMiniPlayerOpen] = useState(false)
  const [isMiniPlayerImageReady, setIsMiniPlayerImageReady] = useState(false)
  const [isMiniPlayerVideoReady, setIsMiniPlayerVideoReady] = useState(false)
  const [miniPlayerError, setMiniPlayerError] = useState('')
  const [draftDurations, setDraftDurations] = useState(defaultDurations)
  const [draftRingtone, setDraftRingtone] = useState<Ringtone>(restoredPreferences.preferences.ringtone)
  const [draftRingtoneVolume, setDraftRingtoneVolume] = useState(restoredPreferences.preferences.ringtoneVolume)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [stream, setStream] = useState<Stream>('lofi')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [volume, setVolume] = useState(35)
  const [isMuted, setIsMuted] = useState(true)
  const [isPlayerReady, setIsPlayerReady] = useState(false)
  const [playerError, setPlayerError] = useState('')
  const playerHostRef = useRef<HTMLDivElement>(null)
  const miniPlayerVideoRef = useRef<HTMLVideoElement>(null)
  const miniPlayerCanvasRef = useRef<HTMLCanvasElement>(null)
  const miniPlayerImageRef = useRef<HTMLImageElement>(null)
  const remainingRef = useRef(remaining)
  const coffeesRef = useRef(coffees)
  const focusSecondsRef = useRef(focusSeconds)
  const focusSessionElapsedRef = useRef(0)
  const playerRef = useRef<YouTubePlayer | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const volumeRef = useRef(volume)
  const [restoredGame] = useState(readSavedGame)
  const [difficulty, setDifficulty] = useState(restoredGame.game.difficulty)
  const [puzzleIndex, setPuzzleIndex] = useState(restoredGame.game.puzzleIndex)
  const [sudokuCells, setSudokuCells] = useState(restoredGame.game.cells)
  const [sudokuNotes, setSudokuNotes] = useState(restoredGame.game.notes)
  const [mistakes, setMistakes] = useState(restoredGame.game.mistakes)
  const [isSudokuFailed, setIsSudokuFailed] = useState(restoredGame.game.isFailed)
  const [isSudokuWon, setIsSudokuWon] = useState(restoredGame.game.isWon)
  const [isAnnotationMode, setIsAnnotationMode] = useState(restoredGame.game.isAnnotationMode)
  const [selectedCell, setSelectedCell] = useState<number | null>(null)
  const [gameStorageError, setGameStorageError] = useState(restoredGame.error)
  const [mistakeMessage, setMistakeMessage] = useState('')
  const puzzle = sudokuPuzzles[difficulty][puzzleIndex]

  useEffect(() => {
    if (!isRunning) return

    const timer = window.setInterval(() => {
      const nextRemaining = Math.max(0, remainingRef.current - 1)
      remainingRef.current = nextRemaining
      setRemaining(nextRemaining)

      let nextFocusSeconds = focusSecondsRef.current
      let nextCoffees = coffeesRef.current
      if (mode === 'pomodoro') {
        focusSessionElapsedRef.current += 1
        nextFocusSeconds += 1
        if (nextFocusSeconds >= rewardIntervalSeconds) {
          nextFocusSeconds -= rewardIntervalSeconds
          nextCoffees += coffeeReward
          coffeesRef.current = nextCoffees
          setCoffees(nextCoffees)
        }
        focusSecondsRef.current = nextFocusSeconds
        setFocusSeconds(nextFocusSeconds)
        const storageError = savePomodoroPreferences({
          coffees: nextCoffees,
          focusSeconds: nextFocusSeconds,
          ringtone,
          ringtoneVolume,
        })
        if (storageError) setSettingsError(storageError)
      }

      if (nextRemaining === 0) {
        setIsRunning(false)
        if (mode === 'pomodoro') {
          setPendingStudySession({
            id: crypto.randomUUID(),
            completedAt: new Date().toISOString(),
            durationSeconds: focusSessionElapsedRef.current,
            status: studyStatus,
            statusColor: studyStatusColor,
          })
          setSessionReflection('')
          setSessionSaveError('')
          focusSessionElapsedRef.current = 0
        }
        const context = audioContextRef.current
        if (context) {
          context.resume()
            .then(() => playRingtone(context, ringtone, ringtoneVolume))
            .catch((error: unknown) => {
              setSettingsError(error instanceof Error ? `Could not play timer ringtone: ${error.message}` : 'Could not play timer ringtone.')
            })
        } else {
          setSettingsError('Start the timer once before it ends to enable its ringtone.')
        }
      }
    }, 1000)

    return () => window.clearInterval(timer)
  }, [isRunning, mode, ringtone, ringtoneVolume, studyStatus, studyStatusColor])

  useEffect(() => {
    const updateMobileState = () => setIsMobile(isMobileDevice())
    window.addEventListener('resize', updateMobileState)
    return () => window.removeEventListener('resize', updateMobileState)
  }, [])

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  useEffect(() => {
    volumeRef.current = volume
  }, [volume])

  useEffect(() => {
    const image = new Image()
    image.onload = () => {
      miniPlayerImageRef.current = image
      setIsMiniPlayerImageReady(true)
      setMiniPlayerError('')
    }
    image.onerror = () => setMiniPlayerError('Could not load the mini-player background image.')
    image.src = `${import.meta.env.BASE_URL}mini-player-background.png`

    const video = miniPlayerVideoRef.current
    const leavePictureInPicture = () => setIsMiniPlayerOpen(false)
    const loadPictureInPictureVideo = () => setIsMiniPlayerVideoReady(true)
    video?.addEventListener('leavepictureinpicture', leavePictureInPicture)
    video?.addEventListener('loadedmetadata', loadPictureInPictureVideo)

    return () => {
      video?.removeEventListener('leavepictureinpicture', leavePictureInPicture)
      video?.removeEventListener('loadedmetadata', loadPictureInPictureVideo)
      const stream = video?.srcObject
      if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop())
      if (video) video.srcObject = null
    }
  }, [])

  useEffect(() => {
    const canvas = miniPlayerCanvasRef.current
    const context = canvas?.getContext('2d')
    const image = miniPlayerImageRef.current
    if (!canvas || !context || !image) return

    const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight)
    const width = image.naturalWidth * scale
    const height = image.naturalHeight * scale
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
    context.fillStyle = 'rgba(0, 0, 0, 0.18)'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = '600 132px system-ui, sans-serif'
    context.shadowColor = 'rgba(0, 0, 0, 0.7)'
    context.shadowBlur = 24
    context.fillStyle = '#fff'
    context.fillText(formatTime(remaining), canvas.width / 2, canvas.height / 2)
  }, [isMiniPlayerImageReady, remaining])

  useEffect(() => {
    const canvas = miniPlayerCanvasRef.current
    const video = miniPlayerVideoRef.current
    if (!isMiniPlayerImageReady || !canvas?.captureStream || !video || video.srcObject) return

    video.srcObject = canvas.captureStream(1)
    video.play().catch((error: unknown) => {
      setMiniPlayerError(error instanceof Error ? `Could not prepare mini-player video: ${error.message}` : 'Could not prepare mini-player video.')
    })
  }, [isMiniPlayerImageReady])

  useEffect(() => {
    let active = true
    const playerHost = playerHostRef.current

    loadYouTubeApi()
      .then(() => {
        if (!active || !playerHost || !window.YT?.Player) return

        const playerElement = document.createElement('div')
        playerHost.replaceChildren(playerElement)
        playerRef.current = new window.YT.Player(playerElement, {
          videoId: streams[stream].videoId,
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            fs: 0,
            loop: 1,
            modestbranding: 1,
            origin: window.location.origin,
            playsinline: 1,
            playlist: streams[stream].videoId,
            rel: 0,
          },
          events: {
            onReady: (event) => {
              if (!active) {
                event.target.destroy()
                return
              }
              playerRef.current = event.target
              event.target.mute()
              event.target.setVolume(volumeRef.current)
              setIsPlayerReady(true)
            },
          },
        })
      })
      .catch((error: unknown) => {
        if (active) setPlayerError(error instanceof Error ? error.message : 'Could not load the YouTube player.')
      })

    return () => {
      active = false
      playerRef.current?.destroy()
      playerRef.current = null
      playerHost?.replaceChildren()
    }
  }, [stream])

  useEffect(() => {
    if (!isPlayerReady || !playerRef.current) return

    playerRef.current.setVolume(volume)
    if (volume === 0 || isMuted) {
      playerRef.current.mute()
    } else {
      playerRef.current.unMute()
    }
  }, [isMuted, isPlayerReady, volume])

  const saveGameProgress = (game: GameSnapshot) => {
    try {
      localStorage.setItem(gameStorageKey, JSON.stringify(game))
      setGameStorageError('')
    } catch {
      setGameStorageError('Could not save Sudoku progress. Check this browser’s storage settings.')
    }
  }

  useEffect(() => {
    if (!isMenuOpen && !isHistoryOpen) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingStudySession) {
        setIsMenuOpen(false)
        setIsHistoryOpen(false)
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [isHistoryOpen, isMenuOpen, pendingStudySession])

  const selectMode = (nextMode: TimerMode) => {
    setMode(nextMode)
    focusSessionElapsedRef.current = 0
    const nextRemaining = durations[nextMode] * 60
    remainingRef.current = nextRemaining
    setRemaining(nextRemaining)
    setIsRunning(false)
  }

  const resetTimer = () => {
    const nextRemaining = durations[mode] * 60
    focusSessionElapsedRef.current = 0
    remainingRef.current = nextRemaining
    setRemaining(nextRemaining)
    setIsRunning(false)
  }

  const getAudioContext = () => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext()
    return audioContextRef.current
  }

  const startTimer = () => {
    if (isRunning) {
      setIsRunning(false)
      return
    }

    try {
      const context = getAudioContext()
      context.resume().catch((error: unknown) => {
        setSettingsError(error instanceof Error ? `Could not enable timer audio: ${error.message}` : 'Could not enable timer audio.')
      })
      if (remainingRef.current === 0) {
        const nextRemaining = durations[mode] * 60
        focusSessionElapsedRef.current = 0
        remainingRef.current = nextRemaining
        setRemaining(nextRemaining)
      }
      setIsRunning(true)
    } catch (error) {
      setSettingsError(error instanceof Error ? `Could not enable timer audio: ${error.message}` : 'Could not enable timer audio.')
    }
  }

  const previewRingtone = () => {
    try {
      const context = getAudioContext()
      context.resume()
        .then(() => playRingtone(context, draftRingtone, draftRingtoneVolume))
        .catch((error: unknown) => {
          setSettingsError(error instanceof Error ? `Could not preview timer ringtone: ${error.message}` : 'Could not preview timer ringtone.')
        })
    } catch (error) {
      setSettingsError(error instanceof Error ? `Could not preview timer ringtone: ${error.message}` : 'Could not preview timer ringtone.')
    }
  }

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await document.documentElement.requestFullscreen()
    }
  }

  const openMiniPlayer = async () => {
    if (isMobile) return
    const video = miniPlayerVideoRef.current
    const canvas = miniPlayerCanvasRef.current
    const image = miniPlayerImageRef.current

    try {
      if (!video || !canvas || !image) {
        setMiniPlayerError('The mini-player is still loading. Please try again shortly.')
        return
      }
      if (!canvas.captureStream || !video.requestPictureInPicture) {
        setMiniPlayerError('Video Picture-in-Picture is not supported in this browser.')
        return
      }
      if (!isMiniPlayerVideoReady) {
        setMiniPlayerError('The mini-player video is still preparing. Please try again shortly.')
        return
      }

      const pictureInPicturePromise = video.requestPictureInPicture()
      await pictureInPicturePromise
      setIsMiniPlayerOpen(true)
      setMiniPlayerError('')
    } catch (error) {
      setMiniPlayerError(error instanceof Error ? `Could not open video Picture-in-Picture: ${error.message}` : 'Could not open video Picture-in-Picture.')
    }
  }

  const openSettings = () => {
    setDraftDurations(durations)
    setDraftRingtone(ringtone)
    setDraftRingtoneVolume(ringtoneVolume)
    setIsSettingsOpen(true)
  }

  const openStudyStatusEditor = () => {
    setStudyStatusDraft(studyStatus)
    setStudyStatusColorDraft(studyStatusColor)
    setStudyStatusError('')
    setIsEditingStudyStatus(true)
  }

  const saveStudyStatus = () => {
    const text = studyStatusDraft.trim()
    if (text.length > 60) {
      setStudyStatusError('Study status must be 60 characters or fewer.')
      return
    }
    try {
      localStorage.setItem(studyStatusStorageKey, JSON.stringify({ text, color: studyStatusColorDraft }))
      setStudyStatus(text)
      setStudyStatusColor(studyStatusColorDraft)
      setStudyStatusError('')
      setIsEditingStudyStatus(false)
    } catch {
      setStudyStatusError('Could not save your study status. Check this browser’s storage settings.')
    }
  }

  const saveSettings = () => {
    setDurations(draftDurations)
    setRingtone(draftRingtone)
    setRingtoneVolume(draftRingtoneVolume)
    const nextRemaining = draftDurations[mode] * 60
    focusSessionElapsedRef.current = 0
    remainingRef.current = nextRemaining
    setRemaining(nextRemaining)
    setIsRunning(false)
    setSettingsError(savePomodoroPreferences({
      coffees,
      focusSeconds,
      ringtone: draftRingtone,
      ringtoneVolume: draftRingtoneVolume,
    }))
    setIsSettingsOpen(false)
  }

  const saveCompletedStudySession = () => {
    if (!pendingStudySession) return
    const reflection = sessionReflection.trim()
    if (!reflection) {
      setSessionSaveError('Add a short note about what you learned or did before saving.')
      return
    }

    const session: CompletedStudySession = { ...pendingStudySession, reflection }
    const nextSessions = [session, ...completedSessions]
    try {
      localStorage.setItem(studySessionsStorageKey, JSON.stringify(nextSessions))
      setCompletedSessions(nextSessions)
      setStudyHistoryError('')
      setPendingStudySession(null)
      setSessionReflection('')
      setSessionSaveError('')
    } catch {
      setSessionSaveError('Could not save this session. Check this browser’s storage settings.')
    }
  }

  const saveCurrentGame = (changes: Partial<GameSnapshot> = {}) => {
    saveGameProgress({
      difficulty,
      puzzleIndex,
      cells: sudokuCells,
      notes: sudokuNotes,
      mistakes,
      isFailed: isSudokuFailed,
      isWon: isSudokuWon,
      isAnnotationMode,
      ...changes,
    })
  }

  const changeDifficulty = (nextDifficulty: Difficulty) => {
    const nextCells = [...sudokuPuzzles[nextDifficulty][0].clues]
    const nextNotes = emptyNotes()
    setDifficulty(nextDifficulty)
    setPuzzleIndex(0)
    setSudokuCells(nextCells)
    setSudokuNotes(nextNotes)
    setMistakes(0)
    setIsSudokuFailed(false)
    setIsSudokuWon(false)
    setIsAnnotationMode(false)
    setMistakeMessage('')
    setSelectedCell(null)
    saveGameProgress({
      difficulty: nextDifficulty,
      puzzleIndex: 0,
      cells: nextCells,
      notes: nextNotes,
      mistakes: 0,
      isFailed: false,
      isWon: false,
      isAnnotationMode: false,
    })
  }

  const enterSudokuDigit = (digit: number) => {
    if (selectedCell === null || puzzle.clues[selectedCell] !== 0 || isSudokuFailed || isSudokuWon) return

    if (isAnnotationMode) {
      const nextNotes = sudokuNotes.map((notes, index) => {
        if (index !== selectedCell) return notes
        if (digit === 0) return []
        return notes.includes(digit) ? notes.filter((note) => note !== digit) : [...notes, digit].sort()
      })
      setSudokuNotes(nextNotes)
      saveCurrentGame({ notes: nextNotes })
      return
    }

    if (digit === 0) {
      const nextCells = sudokuCells.map((cell, index) => index === selectedCell ? 0 : cell)
      setSudokuCells(nextCells)
      saveCurrentGame({ cells: nextCells })
      return
    }

    if (digit !== puzzle.solution[selectedCell]) {
      const nextMistakes = mistakes + 1
      const failed = nextMistakes >= maxMistakes
      setMistakes(nextMistakes)
      setIsSudokuFailed(failed)
      setMistakeMessage(failed ? 'Three mistakes—this puzzle is over.' : 'That number is incorrect.')
      saveCurrentGame({ mistakes: nextMistakes, isFailed: failed })
      return
    }

    const nextCells = sudokuCells.map((cell, index) => index === selectedCell ? digit : cell)
    const nextNotes = sudokuNotes.map((notes, index) => index === selectedCell ? [] : notes)
    const completed = isPuzzleComplete(nextCells)
    setSudokuCells(nextCells)
    setSudokuNotes(nextNotes)
    setMistakeMessage('')
    setIsSudokuWon(completed)
    saveCurrentGame({ cells: nextCells, notes: nextNotes, isWon: completed })
  }

  const startAnotherPuzzle = () => {
    const nextPuzzleIndex = (puzzleIndex + 1) % sudokuPuzzles[difficulty].length
    const nextCells = [...sudokuPuzzles[difficulty][nextPuzzleIndex].clues]
    const nextNotes = emptyNotes()
    setPuzzleIndex(nextPuzzleIndex)
    setSudokuCells(nextCells)
    setSudokuNotes(nextNotes)
    setMistakes(0)
    setIsSudokuFailed(false)
    setIsSudokuWon(false)
    setMistakeMessage('')
    setSelectedCell(null)
    saveGameProgress({
      difficulty,
      puzzleIndex: nextPuzzleIndex,
      cells: nextCells,
      notes: nextNotes,
      mistakes: 0,
      isFailed: false,
      isWon: false,
      isAnnotationMode,
    })
  }

  const resetSudoku = () => {
    const nextCells = [...puzzle.clues]
    const nextNotes = emptyNotes()
    setSudokuCells(nextCells)
    setSudokuNotes(nextNotes)
    setMistakes(0)
    setIsSudokuFailed(false)
    setIsSudokuWon(false)
    setMistakeMessage('')
    setSelectedCell(null)
    saveGameProgress({
      difficulty,
      puzzleIndex,
      cells: nextCells,
      notes: nextNotes,
      mistakes: 0,
      isFailed: false,
      isWon: false,
      isAnnotationMode,
    })
  }

  const toggleAnnotationMode = () => {
    const nextMode = !isAnnotationMode
    setIsAnnotationMode(nextMode)
    setMistakeMessage('')
    saveCurrentGame({ isAnnotationMode: nextMode })
  }

  return (
    <>
    <main className="app-shell">
      <div className="stream-background" aria-hidden="true">
        <div ref={playerHostRef} className="stream-player" />
      </div>
      <canvas
        ref={miniPlayerCanvasRef}
        className="mini-player-canvas"
        width="1280"
        height="720"
        aria-hidden="true"
      />
      <video
        ref={miniPlayerVideoRef}
        className="mini-player-video"
        width="1280"
        height="720"
        muted
        playsInline
        aria-hidden="true"
      />
      <header className="brand" aria-label="Study lah">
        <span className="brand-script">study lah.</span>
        <span className="brand-byline">YES this vibecoded</span>
      </header>

      <div
        className="coffee-balance"
        title={`Earn ${coffeeReward} coffee beans every 30 minutes of Pomodoro focus. Next reward in ${formatTime(rewardIntervalSeconds - focusSeconds)}.`}
        aria-label={`${coffees} coffee beans. ${formatTime(rewardIntervalSeconds - focusSeconds)} of focus time until the next reward.`}
      >
        <span aria-hidden="true">🫘</span>
        {coffees}
      </div>

      <div className="scene-menu">
        <button
          className={`menu-toggle${isMenuOpen ? ' open' : ''}`}
          type="button"
          aria-label={isMenuOpen ? 'Close background menu' : 'Open background menu'}
          aria-expanded={isMenuOpen}
          aria-controls="scene-menu-panel"
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
        {isMenuOpen && (
          <>
            <button className="menu-dismiss" type="button" aria-label="Close menu" onClick={() => setIsMenuOpen(false)} />
            <nav className="scene-menu-panel" id="scene-menu-panel" aria-label="Background selection">
              <span className="menu-eyebrow">LOFI GIRL LIVE</span>
              <h2>Choose a livestream</h2>
              <div className="scene-options">
                {streamOptions.map((streamId) => {
                  const option = streams[streamId]
                  return (
                    <button
                      key={streamId}
                      className={`scene-option${stream === streamId ? ' selected' : ''}`}
                      type="button"
                      aria-pressed={stream === streamId}
                      onClick={() => {
                        setStream(streamId)
                        setIsPlayerReady(false)
                        setPlayerError('')
                        setIsMenuOpen(false)
                      }}
                    >
                      <img
                        className="scene-preview"
                        src={`https://i.ytimg.com/vi/${option.videoId}/mqdefault.jpg`}
                        alt=""
                      />
                      <span>{option.label}</span>
                      {stream === streamId && <span className="scene-check" aria-label="Selected">✓</span>}
                    </button>
                  )
                })}
              </div>
              <a className="streams-link" href="https://www.youtube.com/@LofiGirl/streams" target="_blank" rel="noreferrer">
                Watch Lofi Girl streams <span aria-hidden="true">↗</span>
              </a>
              <button
                className="study-history-link"
                type="button"
                onClick={() => {
                  setIsMenuOpen(false)
                  setIsHistoryOpen(true)
                }}
              >
                <span>
                  <span className="menu-eyebrow">YOUR PROGRESS</span>
                  <strong>Completed study sessions</strong>
                </span>
                <span aria-hidden="true">→</span>
              </button>
              <section className="sudoku-game" aria-labelledby="sudoku-title">
                <div className="sudoku-heading">
                  <div>
                    <span className="menu-eyebrow">TAKE A BREAK</span>
                    <h2 id="sudoku-title">Sudoku</h2>
                  </div>
                  <button className="new-puzzle-button" type="button" onClick={startAnotherPuzzle}>New puzzle</button>
                </div>
                <div className="difficulty-picker" role="group" aria-label="Sudoku difficulty">
                  {difficultyOptions.map((option) => (
                    <button
                      key={option}
                      className={difficulty === option ? 'selected' : ''}
                      type="button"
                      aria-pressed={difficulty === option}
                      onClick={() => changeDifficulty(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <div className="sudoku-status">
                  <span>{puzzle.clues.filter((cell) => cell !== 0).length} clues</span>
                  <span className="mistake-counter" aria-label={`${mistakes} of ${maxMistakes} mistakes`}>
                    Mistakes
                    <span className="mistake-count">{mistakes}/{maxMistakes}</span>
                    {Array.from({ length: maxMistakes }, (_, index) => (
                      <span key={index} aria-hidden="true" className={index < mistakes ? 'mistake-dot used' : 'mistake-dot'} />
                    ))}
                  </span>
                </div>
                <p className="sudoku-instructions">Choose an empty square, then enter a number.</p>
                <div
                  className="sudoku-grid"
                  role="grid"
                  aria-label="Sudoku puzzle"
                  aria-disabled={isSudokuFailed || isSudokuWon}
                  onKeyDown={(event) => {
                    if (selectedCell === null) return
                    if (/^[1-9]$/.test(event.key)) {
                      event.preventDefault()
                      enterSudokuDigit(Number(event.key))
                    } else if (event.key === 'Backspace' || event.key === 'Delete') {
                      event.preventDefault()
                      enterSudokuDigit(0)
                    } else if (event.key.startsWith('Arrow')) {
                      event.preventDefault()
                      const row = Math.floor(selectedCell / 9)
                      const column = selectedCell % 9
                      const nextRow = event.key === 'ArrowUp' ? (row + 8) % 9 : event.key === 'ArrowDown' ? (row + 1) % 9 : row
                      const nextColumn = event.key === 'ArrowLeft' ? (column + 8) % 9 : event.key === 'ArrowRight' ? (column + 1) % 9 : column
                      setSelectedCell(nextRow * 9 + nextColumn)
                    }
                  }}
                >
                  {sudokuCells.map((cell, index) => {
                    const isGiven = puzzle.clues[index] !== 0
                    const isSelected = selectedCell === index
                    const sharesSelection = selectedCell !== null && (
                      Math.floor(selectedCell / 9) === Math.floor(index / 9)
                      || selectedCell % 9 === index % 9
                      || (Math.floor(selectedCell / 27) === Math.floor(index / 27) && Math.floor((selectedCell % 9) / 3) === Math.floor((index % 9) / 3))
                    )
                    return (
                      <button
                        key={index}
                        className={`sudoku-cell${isGiven ? ' given' : ''}${isSelected ? ' selected' : ''}${sharesSelection ? ' related' : ''}${(index + 1) % 3 === 0 && index % 9 !== 8 ? ' box-right' : ''}${Math.floor(index / 9) % 3 === 2 && index < 72 ? ' box-bottom' : ''}`}
                        type="button"
                        role="gridcell"
                        aria-label={`Row ${Math.floor(index / 9) + 1}, column ${(index % 9) + 1}${isGiven ? ', given' : ''}${cell ? `, ${cell}` : ', empty'}${sudokuNotes[index].length ? `, notes ${sudokuNotes[index].join(', ')}` : ''}`}
                        aria-selected={isSelected}
                        onClick={() => setSelectedCell(index)}
                      >
                        {cell ? (
                          <span className="cell-value">{cell}</span>
                        ) : (
                          <span className="cell-notes">{sudokuNotes[index].join(' ')}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <button
                  className={`annotation-toggle${isAnnotationMode ? ' active' : ''}`}
                  type="button"
                  aria-pressed={isAnnotationMode}
                  onClick={toggleAnnotationMode}
                >
                  <span aria-hidden="true">✎</span>
                  {isAnnotationMode ? 'Annotation mode on' : 'Annotation mode'}
                </button>
                <div className="sudoku-keypad" aria-label="Enter a number">
                  {Array.from({ length: 9 }, (_, index) => index + 1).map((digit) => (
                    <button key={digit} type="button" disabled={isSudokuFailed || isSudokuWon} onClick={() => enterSudokuDigit(digit)} aria-label={`Enter ${digit}`}>{digit}</button>
                  ))}
                  <button className="erase-digit" type="button" disabled={isSudokuFailed || isSudokuWon} onClick={() => enterSudokuDigit(0)} aria-label={isAnnotationMode ? 'Erase notes from selected square' : 'Erase selected square'}>⌫</button>
                </div>
                {(isSudokuFailed || mistakeMessage) && (
                  <p className={`sudoku-message${isSudokuFailed ? ' failed' : ''}`} role="status">
                    {isSudokuFailed ? 'Three mistakes—this puzzle is over.' : mistakeMessage}
                  </p>
                )}
                {isSudokuFailed && <button className="sudoku-retry" type="button" onClick={resetSudoku}>Try this puzzle again</button>}
                {isSudokuWon && <p className="sudoku-complete" role="status">Puzzle complete. Nicely done!</p>}
                {gameStorageError && <p className="sudoku-storage-error" role="status">{gameStorageError}</p>}
                <div className="sudoku-footer">
                  <span>Progress saves on this device</span>
                  <button type="button" onClick={resetSudoku}>Reset</button>
                </div>
              </section>
            </nav>
          </>
        )}
      </div>

      <section className="timer-panel" aria-label="Pomodoro timer">
        <div className="mode-tabs" role="tablist" aria-label="Timer mode">
          {(Object.keys(modeLabels) as TimerMode[]).map((timerMode) => (
            <button
              key={timerMode}
              type="button"
              role="tab"
              aria-selected={mode === timerMode}
              className={`mode-tab${mode === timerMode ? ' active' : ''}`}
              onClick={() => selectMode(timerMode)}
            >
              {modeLabels[timerMode]}
            </button>
          ))}
        </div>

        <div className="study-status">
          <button
            className={`study-status-badge color-${studyStatusColor}`}
            type="button"
            aria-label={studyStatus ? `Edit study status: ${studyStatus}` : 'Set what you are studying'}
            aria-expanded={isEditingStudyStatus}
            onClick={openStudyStatusEditor}
          >
            <span className="study-status-icon" aria-hidden="true">✎</span>
            <span>{studyStatus || 'What are you studying?'}</span>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10.9 2.1 3 3M2.5 13.5l2.8-.6 7.9-7.9a1.4 1.4 0 0 0-2-2l-7.9 7.9-.8 2.6Z" /></svg>
          </button>
          {isEditingStudyStatus && (
            <form
              className="study-status-editor"
              aria-label="Edit study status"
              onSubmit={(event) => {
                event.preventDefault()
                saveStudyStatus()
              }}
            >
              <label htmlFor="study-status-input">What are you studying?</label>
              <input
                id="study-status-input"
                autoFocus
                maxLength={60}
                placeholder="e.g. Biology chapter 4"
                value={studyStatusDraft}
                onChange={(event) => setStudyStatusDraft(event.target.value)}
              />
              <div className="study-status-colors" role="group" aria-label="Badge color">
                {badgeColors.map((color) => (
                  <button
                    key={color.value}
                    className={`status-color-option color-${color.value}`}
                    type="button"
                    aria-label={`${color.label} badge color`}
                    aria-pressed={studyStatusColorDraft === color.value}
                    onClick={() => setStudyStatusColorDraft(color.value)}
                  />
                ))}
              </div>
              {studyStatusError && <span className="study-status-error" role="status">{studyStatusError}</span>}
              <div className="study-status-actions">
                <button type="button" onClick={() => setIsEditingStudyStatus(false)}>Cancel</button>
                <button type="submit">Save status</button>
              </div>
            </form>
          )}
        </div>

        <div className="time-display" aria-live="off" aria-label={`${formatTime(remaining)} remaining`}>
          {formatTime(remaining)}
        </div>

        <div className="timer-controls">
          <button
            className="start-button"
            type="button"
            onClick={startTimer}
          >
            {isRunning ? 'pause' : 'start'}
          </button>
          <button className="icon-button reset-button" type="button" onClick={resetTimer} aria-label="Reset timer" title="Reset timer">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M27 14a11 11 0 1 0 1 6" />
              <path d="M27 5v8h-8" />
            </svg>
          </button>
          <button className="icon-button settings-button" type="button" onClick={openSettings} aria-label="Timer settings" title="Timer settings">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="m13 3-.8 3.2a10 10 0 0 0-2.3 1.3L6.8 6.3 4 11l2.5 2.2a10 10 0 0 0 0 2.6L4 18l2.8 4.7 3.1-1.2a10 10 0 0 0 2.3 1.3L13 26h6l.8-3.2a10 10 0 0 0 2.3-1.3l3.1 1.2L28 18l-2.5-2.2a10 10 0 0 0 0-2.6L28 11l-2.8-4.7-3.1 1.2a10 10 0 0 0-2.3-1.3L19 3z" />
              <circle cx="16" cy="14.5" r="4" />
            </svg>
          </button>
        </div>
      </section>

      <div className="volume-control">
        {playerError && <span className="volume-error" role="status">{playerError}</span>}
        <button
          className="volume-button"
          type="button"
          aria-label={isMuted || volume === 0 ? 'Unmute livestream' : 'Mute livestream'}
          title={isMuted || volume === 0 ? 'Unmute livestream' : 'Mute livestream'}
          onClick={() => {
            if (isMuted || volume === 0) {
              if (volume === 0) setVolume(35)
              setIsMuted(false)
            } else {
              setIsMuted(true)
            }
          }}
        >
          {isMuted || volume === 0 ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="m17 9 5 6m0-6-5 6" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13" /></svg>
          )}
        </button>
        <input
          className="volume-slider"
          type="range"
          min="0"
          max="100"
          value={isMuted ? 0 : volume}
          aria-label="Livestream volume"
          aria-valuetext={isMuted ? 'Muted' : `${volume} percent`}
          onChange={(event) => {
            const nextVolume = Number(event.target.value)
            setVolume(nextVolume)
            setIsMuted(nextVolume === 0)
          }}
        />
      </div>

      <div className="bottom-actions">
        {!isMobile && (
          <button
            className="mini-player-button"
            type="button"
            aria-label="Open always-on-top mini-player"
            title={isMiniPlayerOpen ? 'Mini-player is open' : 'Open video Picture-in-Picture'}
            disabled={isMiniPlayerOpen || !isMiniPlayerVideoReady}
            onClick={openMiniPlayer}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M11 11h8v6h-8z" />
            </svg>
          </button>
        )}
        {miniPlayerError && <span className="mini-player-error" role="status">{miniPlayerError}</span>}
        <button className="focus-button" type="button" onClick={toggleFullscreen}>
          <span aria-hidden="true">✨</span>
          {isFullscreen ? 'Exit focus' : 'Go to Focus'}
          <span aria-hidden="true">→</span>
        </button>
        <button className="fullscreen-button" type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M4 12V4h8M20 4h8v8M28 20v8h-8M12 28H4v-8" />
          </svg>
        </button>
      </div>

      {isSettingsOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsSettingsOpen(false)
        }}>
          <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <button className="dialog-close" type="button" onClick={() => setIsSettingsOpen(false)} aria-label="Close settings">×</button>
            <span className="dialog-kicker">MAKE IT YOURS</span>
            <h1 id="settings-title">Timer settings</h1>
            <p>Set the length of each session in minutes.</p>
            <div className="duration-fields">
              {(Object.keys(modeLabels) as TimerMode[]).map((timerMode) => (
                <label key={timerMode}>
                  <span>{modeLabels[timerMode]}</span>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={draftDurations[timerMode]}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      setDraftDurations((current) => ({ ...current, [timerMode]: value }))
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="sound-settings">
              <label className="sound-select-label" htmlFor="timer-ringtone">
                <span>Timer ringtone</span>
                <select
                  id="timer-ringtone"
                  value={draftRingtone}
                  onChange={(event) => {
                    if (isRingtone(event.target.value)) setDraftRingtone(event.target.value)
                  }}
                >
                  {ringtoneOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="sound-volume-label" htmlFor="timer-ringtone-volume">
                <span>Ringtone volume <output>{draftRingtoneVolume}%</output></span>
                <input
                  id="timer-ringtone-volume"
                  type="range"
                  min="0"
                  max="100"
                  value={draftRingtoneVolume}
                  onChange={(event) => setDraftRingtoneVolume(Number(event.target.value))}
                />
              </label>
              <button className="preview-ringtone-button" type="button" onClick={previewRingtone}>
                Preview ringtone
              </button>
            </div>
            {settingsError && <p className="settings-error" role="status">{settingsError}</p>}
            <button
              className="save-button"
              type="button"
              onClick={saveSettings}
              disabled={Object.values(draftDurations).some((duration) => !Number.isInteger(duration) || duration < 1 || duration > 180)}
            >
              Save settings
            </button>
          </section>
        </div>
      )}
      {pendingStudySession && (
        <div className="modal-backdrop session-modal-backdrop">
          <form
            className="session-completion-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-completion-title"
            onSubmit={(event) => {
              event.preventDefault()
              saveCompletedStudySession()
            }}
          >
            <span className="dialog-kicker">FOCUS SESSION COMPLETE</span>
            <h1 id="session-completion-title">Nice work!</h1>
            <div className={`session-status color-${pendingStudySession.statusColor}`}>
              <span>Studying</span>
              <strong>{pendingStudySession.status || 'No study status set'}</strong>
            </div>
            <p className="session-duration">Focused for {formatTime(pendingStudySession.durationSeconds)}</p>
            <label htmlFor="session-reflection">What did you learn or do?</label>
            <textarea
              id="session-reflection"
              autoFocus
              maxLength={1000}
              required
              placeholder="Write a note about this session..."
              value={sessionReflection}
              onChange={(event) => setSessionReflection(event.target.value)}
            />
            {sessionSaveError && <p className="session-save-error" role="alert">{sessionSaveError}</p>}
            <button className="save-button" type="submit">Save completed session</button>
          </form>
        </div>
      )}
    </main>
    {isHistoryOpen && (
      <div className="study-history-page">
        <section className="study-history-content" aria-labelledby="study-history-title">
          <button className="history-back-button" type="button" onClick={() => setIsHistoryOpen(false)}>
            <span aria-hidden="true">←</span> Back to timer
          </button>
          <span className="dialog-kicker">YOUR PROGRESS</span>
          <h1 id="study-history-title">Completed study sessions</h1>
          <p className="study-history-intro">Your saved Pomodoro sessions, with the notes you added.</p>
          {studyHistoryError && <p className="study-history-error" role="status">{studyHistoryError}</p>}
          {completedSessions.length === 0 ? (
            <div className="study-history-empty">
              <span aria-hidden="true">☕</span>
              <h2>No completed sessions yet</h2>
              <p>Finish a Pomodoro and save a note to see it here.</p>
            </div>
          ) : (
            <div className="study-session-list">
              {completedSessions.map((session) => (
                <article className="study-session-card" key={session.id}>
                  <header>
                    <time dateTime={session.completedAt}>
                      {new Date(session.completedAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </time>
                    <span>{formatTime(session.durationSeconds)} focused</span>
                  </header>
                  <div className={`session-status history-session-status color-${session.statusColor}`}>
                    <span>Studying</span>
                    <strong>{session.status || 'No study status set'}</strong>
                  </div>
                  <div className="study-session-reflection">
                    <span>What I learned / did</span>
                    <p>{session.reflection}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    )}
    </>
  )
}

export default App
