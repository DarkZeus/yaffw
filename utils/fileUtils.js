import fs from 'fs'
import path from 'path'

// Generate unique filename to prevent collisions
export const generateUniqueFilename = (originalFilename) => {
  const timestamp = Date.now()
  const randomId = Math.random().toString(36).substring(2, 8)
  const extension = path.extname(originalFilename)
  const baseName = path.basename(originalFilename, extension)
  
  // Clean the base name (remove special characters but keep some readability)
  const cleanBaseName = baseName.replace(/[^a-zA-Z0-9\-_]/g, '_').substring(0, 50)
  
  return `${timestamp}_${randomId}_${cleanBaseName}${extension}`
}

// Ensure directory exists
export const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

// Create safe filename for FFmpeg processing
export const createSafeFileName = (fileName) => {
  return fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
}

// Cleanup old files based on age
export const cleanupOldFiles = (directory, maxAgeMs) => {
  const files = fs.readdirSync(directory)
  const now = Date.now()
  let deletedCount = 0
  
  for (const file of files) {
    const filePath = path.join(directory, file)
    const stats = fs.statSync(filePath)
    
    if (now - stats.mtime.getTime() > maxAgeMs) {
      fs.unlinkSync(filePath)
      deletedCount++
      console.log(`🗑️ Auto-deleted old file: ${file}`)
    }
  }
  
  return deletedCount
}

// Safe file deletion with Promise
export const deleteFile = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
} 