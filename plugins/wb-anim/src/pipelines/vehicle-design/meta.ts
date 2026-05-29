import type { PipelineMeta } from '../../core/types'

export const meta: PipelineMeta = {
  id: 'vehicle-design',
  name: '载具设计',
  icon: '🚀',
  description: '多类型载具设计：设定 → 多视角参考 → 动画生成 → 帧导出',
  version: '1.0.0',
  placement: 'main',
  outputs: ['vehicleZip'],
  agentTags: ['vehicle', 'sprite', 'animation'],
}
