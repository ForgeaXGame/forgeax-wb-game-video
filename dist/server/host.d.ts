import * as _forgeax_workbench_host_node from '@forgeax/workbench-host/node';
import { WorkbenchToolHandler } from '@forgeax/workbench-host/node';

/**
 * Manifest-facing tool adapters.
 *
 * Each handler receives a capability-bounded host context from the Workbench
 * runtime and forwards its published schema input to the shared service.
 */

/** Ordered to exactly match `forgeax-extension.json`'s public tool contract. */
declare const tools: Record<string, WorkbenchToolHandler>;

declare const host: _forgeax_workbench_host_node.WorkbenchExtensionModule;

export { host as default, host, tools };
