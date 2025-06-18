import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { CheckCircle, Loader2 } from 'lucide-react'

type ActionButtonProps = {
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
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{loadingText || 'Processing...'}</span>
        </div>
      )
    }
    
    if (showSuccess && successText) {
      return (
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
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
      className={`transition-all duration-200 ${className}`}
    >
      {getButtonContent()}
    </Button>
  )
} 