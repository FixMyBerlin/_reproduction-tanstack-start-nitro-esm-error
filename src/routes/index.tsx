import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getS3Status } from '../server/s3.server'

const fetchS3Status = createServerFn({ method: 'GET' }).handler(async () => {
  return getS3Status()
})

export const Route = createFileRoute('/')({
  loader: () => fetchS3Status(),
  component: Home,
})

function Home() {
  const data = Route.useLoaderData()
  return (
    <div>
      <p>S3 status: {data}</p>
    </div>
  )
}
