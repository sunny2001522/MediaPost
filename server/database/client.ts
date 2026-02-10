import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './schema'

const GLOBAL_KEY = '__TURSO_CLIENT__' as const

declare global {
  // eslint-disable-next-line no-var
  var __TURSO_CLIENT__: ReturnType<typeof createClient> | undefined
}

function getClient() {
  if (globalThis[GLOBAL_KEY]) {
    return globalThis[GLOBAL_KEY]!
  }

  const config = useRuntimeConfig()

  const client = createClient({
    url: config.tursoUrl,
    authToken: config.tursoToken,
  })

  globalThis[GLOBAL_KEY] = client
  return client
}

export function useDB() {
  const client = getClient()
  return drizzle(client, { schema })
}

export { schema }
