// Convert aspect ratio string to Tailwind class
export const getAspectRatioClass = (aspectRatio?: string): string => {
  if (!aspectRatio) return 'aspect-video' // Default to 16:9
  
  const commonRatios: Record<string, string> = {
    '16:9': 'aspect-video',
    '4:3': 'aspect-[4/3]',
    '3:2': 'aspect-[3/2]', 
    '21:9': 'aspect-[21/9]',
    '1:1': 'aspect-square',
    '9:16': 'aspect-[9/16]', // Vertical/portrait
    '3:4': 'aspect-[3/4]',   // Vertical 4:3
    '2:3': 'aspect-[2/3]',   // Vertical 3:2
  }
  
  // Check for exact match first
  if (commonRatios[aspectRatio]) {
    return commonRatios[aspectRatio]
  }
  
  // Parse custom ratio (e.g., "17:10" -> "aspect-[17/10]")
  const match = aspectRatio.match(/^(\d+):(\d+)$/)
  if (match) {
    const [, width, height] = match
    return `aspect-[${width}/${height}]`
  }
  
  // Fallback to 16:9 if parsing fails
  return 'aspect-video'
} 