const normalizeOrigin = (value: unknown): string => {
  const raw = value == null ? '' : String(value).trim()
  return raw.replace(/\/+$/, '')
}

const backendApiOrigin = normalizeOrigin(process.env.BACKEND_API_ORIGIN)

const rewrites = [
  ...(backendApiOrigin
    ? [
        {
          source: '/api/:path*',
          destination: `${backendApiOrigin}/api/:path*`
        }
      ]
    : []),
  {
    source: '/(.*)',
    destination: '/index.html'
  }
]

export default {
  version: 2,
  installCommand: 'npm -C frontend ci',
  buildCommand: 'npm -C frontend run build',
  outputDirectory: 'frontend/dist',
  rewrites
}
