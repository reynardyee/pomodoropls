import { useEffect, useRef, useState } from 'react'
import './App.css'

type TimerMode = 'pomodoro' | 'short' | 'long'
type Durations = Record<TimerMode, number>
type Stream = 'lofi' | 'rainy-lofi'
type Difficulty = 'easy' | 'medium' | 'hard'
type SudokuPuzzle = { clues: number[]; solution: number[] }
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
let youtubeApiPromise: Promise<void> | undefined

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

function App() {
  const [mode, setMode] = useState<TimerMode>('pomodoro')
  const [durations, setDurations] = useState(defaultDurations)
  const [remaining, setRemaining] = useState(defaultDurations.pomodoro * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [draftDurations, setDraftDurations] = useState(defaultDurations)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [stream, setStream] = useState<Stream>('lofi')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [volume, setVolume] = useState(35)
  const [isMuted, setIsMuted] = useState(true)
  const [isPlayerReady, setIsPlayerReady] = useState(false)
  const [playerError, setPlayerError] = useState('')
  const playerHostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YouTubePlayer | null>(null)
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
      setRemaining((current) => {
        if (current <= 1) {
          setIsRunning(false)
          return 0
        }
        return current - 1
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [isRunning])

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  useEffect(() => {
    volumeRef.current = volume
  }, [volume])

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
    if (!isMenuOpen) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [isMenuOpen])

  const selectMode = (nextMode: TimerMode) => {
    setMode(nextMode)
    setRemaining(durations[nextMode] * 60)
    setIsRunning(false)
  }

  const resetTimer = () => {
    setRemaining(durations[mode] * 60)
    setIsRunning(false)
  }

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await document.documentElement.requestFullscreen()
    }
  }

  const openSettings = () => {
    setDraftDurations(durations)
    setIsSettingsOpen(true)
  }

  const saveSettings = () => {
    setDurations(draftDurations)
    setRemaining(draftDurations[mode] * 60)
    setIsRunning(false)
    setIsSettingsOpen(false)
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
    <main className="app-shell">
      <div className="stream-background" aria-hidden="true">
        <div ref={playerHostRef} className="stream-player" />
      </div>
      <header className="brand" aria-label="Study with me, by Gridfiti">
        <span className="brand-script">study with me.</span>
        <span className="brand-byline">BY GRIDFITI</span>
      </header>

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

        <div className="time-display" aria-live="off" aria-label={`${formatTime(remaining)} remaining`}>
          {formatTime(remaining)}
        </div>

        <div className="timer-controls">
          <button
            className="start-button"
            type="button"
            onClick={() => {
              if (remaining === 0) setRemaining(durations[mode] * 60)
              setIsRunning((running) => !running)
            }}
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
    </main>
  )
}

export default App
