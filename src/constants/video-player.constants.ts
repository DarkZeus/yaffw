// Video Player Constants

// Timing
export const CONTROLS_HIDE_DELAY = 3000 // 3 seconds
export const CLICK_DETECTION_DELAY = 150 // 150ms for single/double click differentiation

// Z-Index layers
export const CONTROLS_Z_INDEX = 20
export const CLICK_OVERLAY_Z_INDEX = 10

// Interactive element selectors for click detection
export const INTERACTIVE_SELECTORS = ['button', 'input', '[role="slider"]'] as const

// Keyboard shortcuts
export const KEYBOARD_SHORTCUTS = {
  PLAY_PAUSE: ['Enter'] as string[],
  FULLSCREEN: ['f', 'F'] as string[]
} as const

// Playback speeds
export const PLAYBACK_SPEEDS = [
  { value: 0.25, label: '0.25x' },
  { value: 0.5, label: '0.5x' },
  { value: 1, label: '1x' },
  { value: 1.5, label: '1.5x' },
  { value: 2, label: '2x' }
] as const

export const DEFAULT_PLAYBACK_SPEED = 1

// CSS Classes
export const VIDEO_PLAYER_CLASSES = {
  CONTAINER: 'h-full bg-black flex items-center justify-center relative group',
  CONTAINER_CURSOR_HIDDEN: 'cursor-none',
  VIDEO_WRAPPER: 'w-full max-w-full max-h-full relative',
  CONTROLS_OVERLAY_BASE: 'absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent transition-opacity duration-300 pointer-events-none select-none',
  CONTROLS_VISIBLE: 'opacity-100',
  CONTROLS_HIDDEN: 'opacity-0',
  CONTROLS_HOVER: 'opacity-0 group-hover:opacity-100',
  CLICK_OVERLAY: 'absolute inset-0 select-none pointer-events-none',
  CLICK_OVERLAY_CURSOR_HIDDEN: 'cursor-none',
  CLICK_OVERLAY_CURSOR_VISIBLE: 'cursor-pointer',
  CLICKABLE_AREA: 'absolute inset-0 pointer-events-auto',
  // Bottom control bar
  CONTROL_BAR: 'flex items-center justify-between bg-background border-t px-4 py-3 gap-4',
  CONTROL_BAR_LEFT: 'flex items-center gap-3',
  CONTROL_BAR_RIGHT: 'flex items-center gap-3'
} as const 