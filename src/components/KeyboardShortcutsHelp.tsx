import { Keyboard } from 'lucide-react'
import { useState } from 'react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'

type Shortcut = {
  key: string
  description: string
}

type KeyboardShortcutsHelpProps = {
  shortcuts: Shortcut[]
}

export function KeyboardShortcutsHelp({ shortcuts }: KeyboardShortcutsHelpProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <Keyboard className="h-4 w-4" />
          Shortcuts
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {shortcuts.map((shortcut, index) => (
            <div key={shortcut.key}>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">{shortcut.description}</span>
                <Badge variant="secondary" className="font-mono font-semibold">
                  {shortcut.key}
                </Badge>
              </div>
              {index < shortcuts.length - 1 && <Separator />}
            </div>
          ))}
          
          <div className="mt-4 pt-4">
            <Separator />
            <p className="text-xs text-muted-foreground text-center mt-4">
              💡 Shortcuts work when not typing in input fields
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 