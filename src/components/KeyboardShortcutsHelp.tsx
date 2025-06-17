import { Keyboard, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

interface Shortcut {
  key: string
  description: string
}

interface KeyboardShortcutsHelpProps {
  shortcuts: Shortcut[]
}

export function KeyboardShortcutsHelp({ shortcuts }: KeyboardShortcutsHelpProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* Help Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2"
      >
        <Keyboard className="h-4 w-4" />
        Shortcuts
      </Button>

      {/* Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md max-h-[80vh] overflow-auto">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="flex items-center gap-2">
                <Keyboard className="h-5 w-5" />
                Keyboard Shortcuts
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {shortcuts.map((shortcut) => (
                <div key={shortcut.key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-600">{shortcut.description}</span>
                  <kbd className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-mono font-semibold">
                    {shortcut.key}
                  </kbd>
                </div>
              ))}
              
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500 text-center">
                  💡 Shortcuts work when not typing in input fields
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
} 