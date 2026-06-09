import {
  generateMeshyTextMock,
  getProviderStatus,
  listResults,
  type ListResultsArgs,
  type MeshyTextMockArgs,
} from '../shared/catalog';

export const tools = {
  'gen3d:provider-status': async () => getProviderStatus(),
  'gen3d:list-results': async (args: ListResultsArgs = {}) => listResults(args),
  'gen3d:generate-meshy-text-mock': async (args: MeshyTextMockArgs) => generateMeshyTextMock(args),
};

export default tools;
