import { Empty, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DailyTaskMetricType, DailyWorkdayStatus, HeatmapCell, HeatmapEmployee, MonthlyHeatmap } from './types';
import { FIXED_REPORT_ITEMS } from './types';

const { Text } = Typography;

interface HeatmapTableRow {
  key: string;
  userId: number;
  userName: string;
  roleName?: string | null;
  metricType: DailyTaskMetricType;
  metricName: string;
  total?: number | null;
  rowSpan: number;
  cellsByDate: Record<string, HeatmapCell | undefined>;
}

function dateLabel(date: string): string {
  const [, month, day] = String(date).split('-');
  return month && day ? `${Number(month)}/${Number(day)}` : date;
}

function toCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function monthLabel(month?: string): string {
  const [year, monthPart] = String(month ?? '').split('-');
  return year && monthPart ? `${year}年${Number(monthPart)}月` : '本月';
}

function flattenHeatmap(heatmap?: MonthlyHeatmap | null): { dates: string[]; rows: HeatmapTableRow[] } {
  const dates = Array.isArray(heatmap?.days) ? heatmap.days : [];
  const employees = Array.isArray(heatmap?.employees) ? heatmap.employees : [];
  const rows: HeatmapTableRow[] = [];

  employees.forEach((employee: HeatmapEmployee) => {
    const backendRows = Array.isArray(employee.rows) ? employee.rows : [];
    FIXED_REPORT_ITEMS.forEach((fixed, index) => {
      const matched = backendRows.find((row) => row?.metricType === fixed.taskType);
      const dailyValues = Array.isArray(matched?.dailyValues) ? matched.dailyValues : [];
      const cellsByDate = dailyValues.reduce<Record<string, HeatmapCell | undefined>>((acc, cell) => {
        if (cell?.date) acc[cell.date] = cell;
        return acc;
      }, {});
      rows.push({
        key: `${employee.userId}-${fixed.taskType}`,
        userId: employee.userId,
        userName: employee.name,
        roleName: employee.roleName,
        metricType: fixed.taskType,
        metricName: fixed.taskName,
        total: matched?.total,
        rowSpan: index === 0 ? FIXED_REPORT_ITEMS.length : 0,
        cellsByDate,
      });
    });
  });

  return { dates, rows };
}

function resolveWorkdayStatus(
  cell?: HeatmapCell,
  dayWorkdayStatuses?: Record<string, DailyWorkdayStatus>,
  date?: string,
): DailyWorkdayStatus {
  if (cell?.workdayStatus) return cell.workdayStatus;
  if (date && dayWorkdayStatuses?.[date]) return dayWorkdayStatuses[date];
  return 'WORKDAY';
}

function HeatmapCellView({
  row,
  cell,
  workdayStatus,
}: {
  row: HeatmapTableRow;
  cell?: HeatmapCell;
  workdayStatus: DailyWorkdayStatus;
}) {
  if (!cell || cell.isFuture) return <span />;

  if (workdayStatus === 'REST') {
    return (
      <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>
        休
      </Text>
    );
  }

  if (workdayStatus === 'PENDING') {
    return (
      <Text style={{ color: '#cbd5e1', fontSize: 11 }}>
        待定
      </Text>
    );
  }

  if (cell.submitted !== true) return <span />;
  if (row.metricType === 'OTHER') {
    const text = String(cell.text ?? '').trim();
    return text ? (
      <Text style={{ color: '#2563eb', maxWidth: 42, display: 'inline-block', fontSize: 12 }} ellipsis={{ tooltip: text }}>
        {text}
      </Text>
    ) : <Text type="secondary">-</Text>;
  }
  const value = toCount(cell.value);
  if (value > 0) {
    return <Text style={{ color: '#166534', fontWeight: 700, fontSize: 13 }}>{value}</Text>;
  }
  return <Text strong style={{ color: '#dc2626', fontSize: 15 }}>X</Text>;
}

export default function MonthlyTaskHeatmap({
  heatmap,
  loading,
  onCellClick,
}: {
  heatmap?: MonthlyHeatmap | null;
  loading: boolean;
  onCellClick: (target: { userId: number; name: string; roleName?: string | null; date: string; metricType: DailyTaskMetricType }) => void;
}) {
  const { dates, rows } = flattenHeatmap(heatmap);
  const dayWorkdayStatuses = heatmap?.dayWorkdayStatuses;

  const columns: ColumnsType<HeatmapTableRow> = [
    {
      title: '员工',
      dataIndex: 'userName',
      key: 'userName',
      width: 112,
      fixed: 'left',
      align: 'center',
      onCell: (record) => ({
        rowSpan: record.rowSpan,
        className: 'heatmap-employee-cell',
        style: {
          background: '#f8fafc',
          borderTop: record.rowSpan ? '2px solid #e5edf7' : undefined,
        },
      }),
      render: (_value, record) => (
        <div className="heatmap-employee-cell-content">
          <Text className="heatmap-employee-name">{record.userName}</Text>
          {record.roleName && <div className="heatmap-employee-role">{record.roleName}</div>}
        </div>
      ),
    },
    {
      title: '项目',
      dataIndex: 'metricName',
      key: 'metricName',
      width: 98,
      fixed: 'left',
      align: 'center',
      onCell: (record) => ({
        className: 'heatmap-metric-cell',
        style: {
          background: record.metricType === 'OTHER' ? '#f5f9ff' : '#ffffff',
          borderTop: record.rowSpan ? '2px solid #e5edf7' : undefined,
        },
      }),
      render: (value, record) => (
        <Text strong={record.metricType === 'OTHER'} style={{ color: record.metricType === 'OTHER' ? '#2563eb' : '#334155', fontSize: 12 }}>
          {value}
        </Text>
      ),
    },
    ...dates.map((date) => ({
      title: dateLabel(date),
      dataIndex: date,
      key: date,
      width: 46,
      align: 'center' as const,
      onCell: (record: HeatmapTableRow) => ({
        className: 'heatmap-date-cell',
        style: {
          borderTop: record.rowSpan ? '2px solid #e5edf7' : undefined,
        },
      }),
      render: (_value: unknown, record: HeatmapTableRow) => {
        const cell = record.cellsByDate[date];
        const workdayStatus = resolveWorkdayStatus(cell, dayWorkdayStatuses, date);
        const clickable = Boolean(cell && !cell.isFuture && workdayStatus === 'WORKDAY');
        return (
          <div
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={() => clickable && onCellClick({
              userId: record.userId,
              name: record.userName,
              roleName: record.roleName,
              date,
              metricType: record.metricType,
            })}
            style={{
              minHeight: 24,
              height: 24,
              lineHeight: '24px',
              cursor: clickable ? 'pointer' : 'default',
              borderRadius: 6,
              transition: 'background 0.16s ease',
              background: workdayStatus === 'REST'
                ? '#f3f4f6'
                : workdayStatus === 'PENDING'
                  ? '#fafafa'
                  : undefined,
            }}
            className={`heatmap-value-cell${clickable ? ' monthly-heatmap-cell-clickable' : ''}`}
          >
            <HeatmapCellView row={record} cell={cell} workdayStatus={workdayStatus} />
          </div>
        );
      },
    })),
    {
      title: '合计',
      dataIndex: 'total',
      key: 'total',
      width: 64,
      fixed: 'right',
      align: 'center',
      onCell: (record) => ({
        className: 'heatmap-total-cell',
        style: {
          background: '#f8fafc',
          borderTop: record.rowSpan ? '2px solid #e5edf7' : undefined,
        },
      }),
      render: (value, record) => (
        record.metricType === 'OTHER'
          ? <Text type="secondary">-</Text>
          : <Text strong>{toCount(value)}</Text>
      ),
    },
  ];

  if (!loading && (dates.length === 0 || rows.length === 0)) {
    return <Empty description="暂无本月提交热力图数据" style={{ padding: 48 }} />;
  }

  return (
    <div>
      <style>{`
        .monthly-task-heatmap .ant-table {
          font-size: 12px;
          border-radius: 0 0 14px 14px;
        }
        .monthly-task-heatmap .ant-table-thead > tr > th {
          background: #f8fafc !important;
          color: #64748b;
          font-size: 12px;
          font-weight: 700;
          padding: 6px 5px !important;
          border-color: #edf1f7 !important;
          text-align: center;
          vertical-align: middle;
        }
        .monthly-task-heatmap .ant-table-tbody > tr > td {
          padding: 3px 5px !important;
          border-color: #edf1f7 !important;
          height: 34px;
          vertical-align: middle !important;
        }
        .monthly-task-heatmap .ant-table-cell-fix-left,
        .monthly-task-heatmap .ant-table-cell-fix-right {
          box-shadow: none !important;
        }
        .monthly-task-heatmap .heatmap-employee-cell {
          text-align: center !important;
          vertical-align: middle !important;
          background: #f8fbff !important;
          padding: 0 8px !important;
        }
        .monthly-task-heatmap .heatmap-employee-cell-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 170px;
          width: 100%;
          text-align: center;
        }
        .monthly-task-heatmap .heatmap-employee-name {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
          line-height: 20px;
          text-align: center;
          white-space: normal;
          word-break: keep-all;
        }
        .monthly-task-heatmap .heatmap-employee-role {
          margin-top: 4px;
          font-size: 12px;
          color: #94a3b8;
          line-height: 16px;
          text-align: center;
          max-width: 92px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .monthly-task-heatmap .heatmap-metric-cell {
          text-align: center !important;
          vertical-align: middle !important;
        }
        .monthly-task-heatmap .heatmap-date-cell {
          text-align: center !important;
          vertical-align: middle !important;
        }
        .monthly-task-heatmap .heatmap-total-cell {
          text-align: center !important;
          vertical-align: middle !important;
          font-weight: 700;
        }
        .heatmap-value-cell {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
        }
        .monthly-heatmap-cell-clickable:hover {
          background: #f0f7ff;
        }
      `}</style>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 16px',
        borderBottom: '1px solid #eef2f7',
        background: '#ffffff',
      }}>
        <Space size={10} wrap>
          <Text strong style={{ color: '#0f172a' }}>本月提交热力图（{monthLabel(heatmap?.month)}）</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>点击单元格查看详情</Text>
        </Space>
        <Space size={8} wrap>
          <Tag color="blue" style={{ marginInlineEnd: 0 }}>蓝色文本：其他说明，悬停查看完整内容</Tag>
          <Tag color="success" style={{ marginInlineEnd: 0 }}>绿色数字：已提交数据</Tag>
          <Tag color="error" style={{ marginInlineEnd: 0 }}>红色 X：运营日已提交但该项为 0</Tag>
          <Tag color="default" style={{ marginInlineEnd: 0, color: '#94a3b8' }}>灰色：休息日</Tag>
          <Tag color="default" style={{ marginInlineEnd: 0, color: '#cbd5e1' }}>浅灰：待定</Tag>
          <Tag color="default" style={{ marginInlineEnd: 0 }}>空白：未提交 / 未来日期</Tag>
        </Space>
      </div>
      <Table<HeatmapTableRow>
        className="monthly-task-heatmap"
        rowKey="key"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={false}
        size="small"
        bordered
        scroll={{ x: Math.max(760, 270 + dates.length * 46), y: 'calc(100vh - 548px)' }}
        locale={{ emptyText: <Empty description="暂无本月提交热力图数据" /> }}
      />
    </div>
  );
}
