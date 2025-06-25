import type { TrimManager } from '../../types/video-editor-mediator.types'

export const createTrimManager: TrimManager = (state, setState, playerRef) => {
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
    setState({ currentTime: state.trimStart })
    playerRef.current?.seekTo(state.trimStart, 'seconds')
  }

  const handleJumpToTrimEnd = () => {
    setState({ currentTime: state.trimEnd })
    playerRef.current?.seekTo(state.trimEnd, 'seconds')
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