import type { CSSProperties } from 'react';
import type { EmployeeTaskDto } from './types';
import { getEmployeeTaskStatus, isActiveTaskOverdue } from './types';

export function isTaskCompleted(task: Partial<EmployeeTaskDto>): boolean {
  return getEmployeeTaskStatus(task) === 'DONE';
}

export function isTaskOverdueActive(task: Partial<EmployeeTaskDto>): boolean {
  return isActiveTaskOverdue(task);
}

export type CompletedDimLevel = 'normal' | 'soft';

export function getTaskRowStyle(
  task: Partial<EmployeeTaskDto>,
  options?: { completedDim?: CompletedDimLevel },
): CSSProperties {
  const completed = isTaskCompleted(task);
  const overdue = !completed && isTaskOverdueActive(task);

  if (completed) {
    return {
      background: '#FAFAFA',
      border: '1px solid #EEF2F7',
      opacity: options?.completedDim === 'soft' ? 0.78 : 0.62,
    };
  }

  if (overdue) {
    return {
      background: '#FFF7F7',
      border: '1px solid #FECACA',
    };
  }

  return {
    background: '#FFFFFF',
    border: '1px solid #EEF2F7',
  };
}

export function getTaskTitleStyle(task: Partial<EmployeeTaskDto>): CSSProperties {
  const completed = isTaskCompleted(task);
  const overdue = !completed && isTaskOverdueActive(task);
  return {
    color: completed ? '#9CA3AF' : '#111827',
    fontWeight: completed ? 500 : overdue ? 700 : 700,
  };
}

export function getTaskTagsWrapStyle(task: Partial<EmployeeTaskDto>): CSSProperties {
  return { opacity: isTaskCompleted(task) ? 0.72 : 1 };
}

export function getTaskDeadlineTextStyle(task: Partial<EmployeeTaskDto>): CSSProperties {
  const completed = isTaskCompleted(task);
  const overdue = !completed && isTaskOverdueActive(task);

  if (completed) {
    return { color: '#B0B7C3', fontWeight: 500 };
  }
  if (overdue) {
    return { color: '#DC2626', fontWeight: 600 };
  }
  return { color: '#64748b', fontWeight: 500 };
}
