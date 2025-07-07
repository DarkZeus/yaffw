import type { TrimManager } from '../../types/video-editor-mediator.types'

export const createTrimManager: TrimManager = (state, setState, playerRef, handleSeek) => {
  const handleTrimChange = (start: number, end: number) => {
    setState({ trimStart: start, trimEnd: end })
  }

  const handleSetTrimStart = () => {
    setState({ trimStart: state.currentTime })
  }

  const handleSetTrimEnd = () => {
    setState({ trimEnd: state.currentTime })
  }

  const handleJumpToTrimStart = () => {
    handleSeek(state.trimStart)
  }

  const handleJumpToTrimEnd = () => {
    handleSeek(state.trimEnd)
  }

  const handleResetTrim = () => {
    setState({ 
      trimStart: 0, 
      trimEnd: state.duration 
    })
  }

  return {
    handleTrimChange,
    handleSetTrimStart,
    handleSetTrimEnd,
    handleJumpToTrimStart,
    handleJumpToTrimEnd,
    handleResetTrim
  }
} 