# YAFFW - Yet Another FFmpeg Wrapper

A simple, browser-based video editor built with React and FFmpeg. Trim, convert (TBD), and concatenate (TBD) videos with an intuitive interface and keyboard shortcuts.

![Video Editor Screenshot](https://raw.githubusercontent.com/DarkZeus/yaffw/refs/heads/master/public/screenshot.jpg)

> **⚠️ Personal Project Disclaimer**  
> This project is highly opinionated and was built specifically to address my personal video editing workflow needs. While it's open source and you're welcome to use or fork it, please note that feature requests, extensive customizations, or significant architectural changes may not align with the project's focused scope. Consider it a reference implementation rather than a general-purpose solution.

## ✨ Features

### ✅ **Current Features (Alpha)**
- **🎬 Video Trimming** - Precise start/end point selection with timeline scrubbing
- **📱 Streaming Upload** - Handle large video files with progress tracking
- **⚡ Fast Processing** - Stream copy for trimming (no re-encoding)

### 🚧 **Planned for Alpha Release**
- **🔄 Format Conversion** - Convert between MP4, AVI, MOV, WebM, and more
- **🔗 Video Concatenation** - Merge multiple videos seamlessly

### User Experience
- **⌨️ Keyboard Shortcuts** - Professional editing shortcuts (Space, J/K, I/O, etc.)
- **🎯 Real-time Preview** - Immediate video playback with timeline navigation
- **📊 Video Analytics** - Detailed metadata display (resolution, bitrate, codec, etc.)
- **🎨 Modern UI** - Built with Tailwind CSS and shadcn/ui components
- **📱 Responsive Design** - Works on desktop and tablet devices

## 🛠️ Tech Stack

### Frontend
- **React 19** with TypeScript
- **TanStack Router** for routing
- **TanStack Query** for API state management
- **Tailwind CSS** for styling
- **shadcn/ui** for UI components
- **React Player** for video playback
- **React Dropzone** for file uploads

### Backend
- **Hono** - Fast web framework
- **FFmpeg** - Video processing engine
- **Node.js** with TypeScript
- **Chunked file upload** support

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+ and **pnpm**
- **FFmpeg** installed and accessible via command line

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd yaffw
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Verify FFmpeg installation**
   ```bash
   ffmpeg -version
   ```

### Running the Application

1. **Start the servers**
   ```bash
   pnpm dev
   ```
   Frontend runs on `http://localhost:3000` backend runs on `http://localhost:3001`

2. **Open your browser**
   Navigate to `http://localhost:3000`

## 📖 Usage Guide

### Current Workflow (Alpha)

1. **📂 Upload Video**
   - Drag & drop video files or click to browse
   - Supports: MP4, AVI, MOV, MKV, WebM
   - Large files upload with progress tracking

2. **✂️ Trim Video**
   - Use the timeline slider to set start/end points
   - Press `J` to set trim start, `K` to set trim end
   - Preview your selection in real-time
   - Press `Enter` or click "Trim Video" to process
   - Download the trimmed result

### 🚧 Coming Soon (Alpha Release)
- **🔄 Format Conversion** - Convert between different video formats
- **🔗 Video Concatenation** - Merge multiple videos into one

### ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Space` | Play/Pause |
| `←` `→` | Seek 5 seconds |
| `Shift + ←` `→` | Seek 1 second |
| `J` | Set trim start point |
| `K` | Set trim end point |
| `I` | Jump to trim start |
| `O` | Jump to trim end |
| `Home` | Jump to beginning |
| `End` | Jump to end |
| `Enter` | Export/Trim video |
| `R` | Reset trim points |

### Development Roadmap

**Current (Pre-Alpha):**
- ✅ Video trimming with timeline controls
- ✅ Chunked file upload for large videos  
- ✅ Keyboard shortcuts and professional UI

**Alpha Release Goals:**
- 🚧 Format conversion (MP4, AVI, MOV, WebM)
- 🚧 Video concatenation  
- 🚧 Batch processing support

**Future Enhancements:**
- 🔮 Audio track editing
- 🔮 Basic video filters
- 🔮 Subtitle support
- 🔮 Cloud storage integration

## 🐛 Troubleshooting

### Common Issues

**FFmpeg not found:**
```bash
# Install FFmpeg
# Windows: Download from https://ffmpeg.org/
# macOS: brew install ffmpeg
# Linux: apt install ffmpeg
```

**Large file upload fails:**
- Check disk space in `uploads/` directory
- Increase server timeout limits
- Verify FFmpeg memory limits

**Video corruption:**
- Try trimming out corrupted sections
- Use format conversion to fix minor issues
- Check original recording software settings

## 🙏 Acknowledgments

- **FFmpeg** - The backbone of video processing
- **shadcn/ui** - Beautiful, accessible UI components
- **TanStack** - Excellent React ecosystem tools
- **Hono** - Fast and lightweight web framework

---

**Built with ❤️ for video creators and developers**
