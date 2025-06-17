import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './ui/button'

interface ActionButtonProps {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  icon?: LucideIcon
  children: ReactNode
  loadingText?: string
  successText?: string
  showSuccess?: boolean
  className?: string
}

export function ActionButton({
  onClick,
  disabled = false,
  loading = false,
  variant = 'default',
  size = 'default',
  icon: Icon,
  children,
  loadingText,
  successText,
  showSuccess = false,
  className = ''
}: ActionButtonProps) {
  const getButtonContent = () => {
    if (loading) {
      return (
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>{loadingText || 'Processing...'}</span>
        </div>
      )
    }
    
    if (showSuccess && successText) {
      return (
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
            <div className="w-2 h-2 bg-white rounded-full" />
          </div>
          <span>{successText}</span>
        </div>
      )
    }
    
    return (
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4" />}
        <span>{children}</span>
      </div>
    )
  }

  return (
    <Button
      onClick={onClick}
      disabled={disabled || loading}
      variant={showSuccess ? 'outline' : variant}
      size={size}
      className={`
        transition-all duration-200 transform
        ${loading ? 'scale-95' : 'hover:scale-105'}
        ${showSuccess ? 'border-green-500 text-green-600' : ''}
        ${className}
      `}
    >
      {getButtonContent()}
    </Button>
  )
} 