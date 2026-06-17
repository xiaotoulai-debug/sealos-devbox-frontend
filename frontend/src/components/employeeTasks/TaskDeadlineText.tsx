import { CalendarOutlined } from '@ant-design/icons';
import type { EmployeeTaskDto } from './types';
import { getTaskDeadlineLabel } from './types';
import { getTaskDeadlineTextStyle } from './taskVisualStyles';

export default function TaskDeadlineText({ task }: { task: Partial<EmployeeTaskDto> }) {
  const deadlineStyle = getTaskDeadlineTextStyle(task);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        marginTop: 5,
        fontSize: 12,
        lineHeight: 1.4,
        ...deadlineStyle,
      }}
    >
      <CalendarOutlined />
      {getTaskDeadlineLabel(task)}
    </span>
  );
}
