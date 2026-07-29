import { createExtensionClient } from '@forgeax/workbench-host/extension'

let client: ReturnType<typeof createExtensionClient> | undefined

/** The iframe's single handshake-bound workbench client. */
export function getWorkbenchHost(): ReturnType<typeof createExtensionClient> {
  return client ??= createExtensionClient()
}
