import { Tag } from 'antd';
import type { EmployeeTaskDto } from './types';
import { PLATFORM_LABELS } from './types';

export default function EmployeeTaskPlatformTag({
  task,
}: {
  task: Pick<EmployeeTaskDto, 'platform' | 'platformName'>;
}) {
  if (!task.platform) return null;

  return (
    <Tag
      color="cyan"
      bordered={false}
      style={{
        marginInlineEnd: 0,
        fontWeight: 600,
        borderRadius: 6,
        flexShrink: 0,
      }}
    >
      {task.platformName || PLATFORM_LABELS[task.platform]}
    </Tag>
  );
}
