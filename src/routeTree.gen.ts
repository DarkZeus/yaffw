/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.

import { Route as rootRouteImport } from './routes/__root'
import { Route as BulkDownloadRouteImport } from './routes/bulk-download'
import { Route as IndexRouteImport } from './routes/index'

const BulkDownloadRoute = BulkDownloadRouteImport.update({
  id: '/bulk-download',
  path: '/bulk-download',
  getParentRoute: () => rootRouteImport,
} as any)
const IndexRoute = IndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRouteImport,
} as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/bulk-download': typeof BulkDownloadRoute
}
export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/bulk-download': typeof BulkDownloadRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexRoute
  '/bulk-download': typeof BulkDownloadRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/' | '/bulk-download'
  fileRoutesByTo: FileRoutesByTo
  to: '/' | '/bulk-download'
  id: '__root__' | '/' | '/bulk-download'
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  BulkDownloadRoute: typeof BulkDownloadRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/bulk-download': {
      id: '/bulk-download'
      path: '/bulk-download'
      fullPath: '/bulk-download'
      preLoaderRoute: typeof BulkDownloadRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/': {
      id: '/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof IndexRouteImport
      parentRoute: typeof rootRouteImport
    }
  }
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  BulkDownloadRoute: BulkDownloadRoute,
}
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()
