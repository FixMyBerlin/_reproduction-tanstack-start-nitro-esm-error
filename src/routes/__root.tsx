import { Outlet, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <html>
      <body>
        <h1>Reproduction: Nitro __toESM bug</h1>
        <Outlet />
      </body>
    </html>
  ),
})
