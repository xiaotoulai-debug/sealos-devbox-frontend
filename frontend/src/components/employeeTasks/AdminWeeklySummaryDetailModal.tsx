import AiWeeklyReviewModal from './AiWeeklyReviewModal';
import { resolveCompactWeeklyReviewSections } from './weeklyReviewMappers';
import type { AdminWeeklySummaryDto } from './types';

export default function AdminWeeklySummaryDetailModal({
  open,
  item,
  onClose,
}: {
  open: boolean;
  item?: AdminWeeklySummaryDto | null;
  onClose: () => void;
}) {
  const name = item?.assigneeName || '员工';
  const periodLabel = item?.weekStart && item?.weekEnd
    ? `${item.weekStart} ~ ${item.weekEnd}`
    : null;

  return (
    <AiWeeklyReviewModal
      open={open}
      title={`${name} 的 AI 上周工作复盘`}
      generatedAt={item?.generatedAt ?? item?.updatedAt}
      status={item?.status ?? 'NONE'}
      errorMessage={item?.errorMessage}
      periodLabel={periodLabel}
      compactSections={item ? resolveCompactWeeklyReviewSections(item) : null}
      onClose={onClose}
      width={860}
    />
  );
}
