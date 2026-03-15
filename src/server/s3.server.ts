import { S3Client } from '@aws-sdk/client-s3'

export function getS3Status() {
  const client = new S3Client({ region: 'eu-central-1' })
  return `S3Client loaded: ${typeof client.send}`
}
