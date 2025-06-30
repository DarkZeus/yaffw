import { ChevronLeft, ChevronRight, Download, Video } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"

const items = [
  {
    title: "Media Editor",
    url: "/",
    icon: Video,
  },
  {
    title: "Bulk Download",
    url: "/bulk-download",
    icon: Download,
  },
]

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar()
  
  return (
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Yet Another FFMPEG wrapper</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
      
      <Button
        variant="secondary"
        size="sm"
        onClick={toggleSidebar}
        className={`absolute top-1/2 z-20 h-8 w-6 -translate-y-1/2 rounded-r-md rounded-l-none border-l-0 bg-background/80 backdrop-blur-sm shadow-md hover:bg-background/90 transition-all duration-200 cursor-pointer ${
          state === "expanded" ? "-right-3" : "-right-5"
        }`}
        aria-label="Toggle Sidebar"
      >
        {state === "expanded" ? (
          <ChevronLeft className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </Button>
    </Sidebar>
  )
}