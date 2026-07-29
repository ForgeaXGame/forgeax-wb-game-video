/**
 * Release-module bridge for the Workbench host.
 *
 * Task 1 only establishes the package and bundle contract. Task 4 replaces this
 * placeholder with the actual Workbench host implementation and HTTP behavior.
 */
import tools from './tool-handlers'

/** Temporary marker for the published host-module contract; it has no behavior. */
export const host = {}

/** The existing AI tool map remains available from the backend module. */
export { tools }

export default tools
