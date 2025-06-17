import { AlertCircle, CheckCircle } from 'lucide-react'
import { useDeferredValue, useTransition } from 'react'

interface AnimatedProgressProps {
  value: number
  max?: number
  status?: 'uploading' | 'processing' | 'complete' | 'error'
  showPercentage?: boolean
  size?: 'sm' | 'md' | 'lg'
  color?: 'blue' | 'green' | 'red' | 'purple'
}

export function AnimatedProgress({ 
  value, 
  max = 100, 
  status = 'uploading',
  showPercentage = true,
  size = 'md',
  color = 'blue'
}: AnimatedProgressProps) {
  const [isPending] = useTransition()
  const deferredValue = useDeferredValue(value)
  
  const percentage = Math.min((deferredValue / max) * 100, 100)
  
  const sizeClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4'
  }
  
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    red: 'from-red-500 to-red-600',
    purple: 'from-purple-500 to-purple-600'
  }
  
  const getStatusColor = () => {
    switch (status) {
      case 'complete': return 'green'
      case 'error': return 'red'
      case 'processing': return 'purple'
      default: return color
    }
  }
  
  const getStatusIcon = () => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return null
    }
  }
  
  const getStatusText = () => {
    switch (status) {
      case 'uploading': return 'Uploading...'
      case 'processing': return 'Processing...'
      case 'complete': return 'Complete!'
      case 'error': return 'Error occurred'
      default: return ''
    }
  }

  return (
    <div className="space-y-2">
      {/* Progress Bar */}
      <div className="relative">
        <div className={`
          w-full bg-gray-200 rounded-full overflow-hidden
          ${sizeClasses[size]}
        `}>
          <div 
            className={`
              h-full bg-gradient-to-r transition-all duration-500 ease-out
              ${colorClasses[getStatusColor()]}
              ${status === 'processing' ? 'animate-pulse' : ''}
            `}
            style={{ width: `${percentage}%` }}
          >
            {/* Shimmer Effect */}
            <div className="h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          </div>
        </div>
        
        {/* Glow Effect */}
        {status === 'uploading' && (
          <div 
            className={`
              absolute top-0 h-full bg-gradient-to-r opacity-50 rounded-full blur-sm
              ${colorClasses[getStatusColor()]}
            `}
            style={{ width: `${percentage}%` }}
          />
        )}
      </div>
      
      {/* Status Row */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className={`
            font-medium transition-colors duration-300
            ${status === 'error' ? 'text-red-600' : 
              status === 'complete' ? 'text-green-600' : 
              'text-gray-600'}
          `}>
            {getStatusText()}
            {isPending && <span className="ml-1 animate-pulse">⏳</span>}
          </span>
        </div>
        
        {showPercentage && (
          <span className={`
            font-mono font-semibold transition-colors duration-300
            ${status === 'complete' ? 'text-green-600' : 'text-gray-700'}
          `}>
            {Math.round(percentage)}%
          </span>
        )}
      </div>
    </div>
  )
}

// Add shimmer animation to your CSS
const shimmerStyles = `
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.animate-shimmer {
  animation: shimmer 2s infinite;
}
`

// You can add this to your global CSS or use a style tag
if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.textContent = shimmerStyles
  document.head.appendChild(style)
} 