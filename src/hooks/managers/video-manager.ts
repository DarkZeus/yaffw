import type { VideoManager } from '../../types/video-editor-mediator.types'

export const createVideoManager: VideoManager = (state, setState, refs) => {
  const { playerRef, containerRef, volumeRef, isMutedRef, volumeControlRef } = refs

  const handlePlayPause = () => {
    setState({ isPlaying: !state.isPlaying })
  }

  const handleSeek = (time: number) => {
    setState({ currentTime: time })
    playerRef.current?.seekTo(time, 'seconds')
  }

  const handleProgress = (progressState: { played: number; playedSeconds: number }) => {
    setState({ currentTime: progressState.playedSeconds })
  }

  const handleDuration = (duration: number) => {
    setState({ 
      duration,
      trimEnd: state.trimEnd === 0 ? duration : state.trimEnd
    })
    
    if (state.currentVideo) {
      setState({
        currentVideo: { ...state.currentVideo, duration }
      })
    }
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

  return {
    handlePlayPause,
    handleSeek,
    handleProgress,
    handleDuration,
    handleVolumeUpdate,
    handleToggleFullscreen,
    handleToggleMute,
    handleVolumeChange
  }
} 