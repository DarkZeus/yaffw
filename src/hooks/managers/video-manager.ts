import type { VideoManager } from '../../types/video-editor-mediator.types'

export const createVideoManager: VideoManager = (state, setState, refs) => {
  const { playerRef, containerRef, volumeRef, isMutedRef, volumeControlRef } = refs

  const handlePlayPause = () => {
    const newIsPlaying = !state.isPlaying
    
    // When pausing, sync React state with the actual video element's current time
    if (!newIsPlaying && playerRef.current) {
      const actualCurrentTime = playerRef.current.getCurrentTime() ?? state.currentTime
      setState({ isPlaying: false, currentTime: actualCurrentTime })
      // Seek to ensure frame-accurate stopping at the exact pause position
      playerRef.current.seekTo(actualCurrentTime, 'seconds')
    } else {
      setState({ isPlaying: newIsPlaying })
    }
  }

  const handleSeek = (time: number) => {
    setState({ currentTime: time })
    playerRef.current?.seekTo(time, 'seconds')
    
  }

  const handleFrameSeek = (direction: 'prev' | 'next') => {
    if (!state.fps || state.fps <= 0) return // Guard against invalid FPS
    
    const frameTime = 1 / state.fps // Time for one frame in seconds
    const newTime = direction === 'prev' 
      ? Math.max(0, state.currentTime - frameTime)
      : Math.min(state.duration, state.currentTime + frameTime)
    
    setState({ currentTime: newTime })
    playerRef.current?.seekTo(newTime, 'seconds')
  }

  const handleProgress = (progressState: { played: number; playedSeconds: number }) => {
    
    setState({ currentTime: progressState.playedSeconds })
  }

  const handleDuration = (duration: number) => {
    setState({ 
      duration,
      // Initialize trim values when duration is first set
      trimStart: state.trimStart === 0 ? 0 : state.trimStart,
      trimEnd: state.trimEnd === 0 ? duration : state.trimEnd
    })
  }

  const handleVolumeUpdate = (volume: number, isMuted: boolean) => {
    volumeRef.current = volume
    isMutedRef.current = isMuted
    
    // Force ReactPlayer to update volume without component rerender
    if (playerRef.current) {
      const internalPlayer = playerRef.current.getInternalPlayer()
      if (internalPlayer && internalPlayer.volume !== undefined) {
        internalPlayer.volume = isMuted ? 0 : volume
      }
    }
  }

  const handleToggleFullscreen = async () => {
    if (!containerRef.current) return
    
    if (!document.fullscreenElement) {
      try {
        await containerRef.current.requestFullscreen()
        setState({ isFullscreen: true })
      } catch {
        setState({ isFullscreen: !!document.fullscreenElement })
      }
    } else {
      try {
        await document.exitFullscreen()
        setState({ isFullscreen: false })
      } catch {
        setState({ isFullscreen: !!document.fullscreenElement })
      }
    }
  }

  const handleToggleMute = () => {
    const newMuted = !isMutedRef.current
    handleVolumeUpdate(volumeRef.current, newMuted)
    // Update VolumeControl's visual state
    volumeControlRef.current?.updateState(volumeRef.current, newMuted)
  }

  const handleVolumeChange = (delta: number) => {
    const newVolume = Math.max(0, Math.min(1, volumeRef.current + delta))
    handleVolumeUpdate(newVolume, newVolume === 0)
    // Update VolumeControl's visual state
    volumeControlRef.current?.updateState(newVolume, newVolume === 0)
  }

  const handlePlaybackSpeedChange = (speed: number) => {
    setState({ playbackSpeed: speed })
  }

  return {
    handlePlayPause,
    handleSeek,
    handleFrameSeek,
    handleProgress,
    handleDuration,
    handleVolumeUpdate,
    handleToggleFullscreen,
    handleToggleMute,
    handleVolumeChange,
    handlePlaybackSpeedChange
  }
} 