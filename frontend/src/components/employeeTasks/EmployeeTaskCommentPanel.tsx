import { useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Empty, List, Mentions, Space, Spin, Typography, message } from 'antd';
import {
  createEmployeeTaskComment,
  fetchAssignableUsers,
  fetchEmployeeTaskComments,
  fetchEmployeeTaskMentionUsers,
  getBackendMessage,
} from './api';
import type { EmployeeTaskCommentDto, EmployeeTaskMentionUserDto } from './types';

const { Text } = Typography;

function parseMentionedUserIds(content: string): number[] {
  const ids = new Set<number>();
  const regex = /@(\d+)/g;
  let match = regex.exec(content);
  while (match) {
    const id = Number(match[1]);
    if (Number.isFinite(id) && id > 0) ids.add(id);
    match = regex.exec(content);
  }
  return [...ids];
}

function buildUserNameMap(
  users: EmployeeTaskMentionUserDto[],
  comments: EmployeeTaskCommentDto[],
): Record<number, string> {
  const map: Record<number, string> = {};
  users.forEach((user) => {
    map[user.id] = user.name;
  });
  comments.forEach((comment) => {
    comment.mentionedUsers?.forEach((user) => {
      map[user.id] = user.name;
    });
  });
  return map;
}

function renderCommentContent(content: string, userNameMap: Record<number, string>) {
  const parts = content.split(/(@\d+)/g);
  return parts.map((part, index) => {
    const match = part.match(/^@(\d+)$/);
    if (!match) return <span key={`text-${index}`}>{part}</span>;
    const id = Number(match[1]);
    const name = userNameMap[id] || `用户${id}`;
    return (
      <span key={`mention-${index}`} style={{ color: '#2563eb', fontWeight: 600 }}>
        @{name}
      </span>
    );
  });
}

export default function EmployeeTaskCommentPanel({
  taskId,
  open,
  onChanged,
}: {
  taskId?: number | null;
  open: boolean;
  onChanged?: () => void;
}) {
  const [comments, setComments] = useState<EmployeeTaskCommentDto[]>([]);
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [mentionUsers, setMentionUsers] = useState<EmployeeTaskMentionUserDto[]>([]);
  const [draft, setDraft] = useState('');

  const loadComments = useCallback(async () => {
    if (!open || !taskId) return;
    setCommentLoading(true);
    try {
      setComments(await fetchEmployeeTaskComments(taskId));
    } catch (err) {
      setComments([]);
      message.error(getBackendMessage(err, '加载任务沟通记录失败'));
    } finally {
      setCommentLoading(false);
    }
  }, [open, taskId]);

  const loadMentionUsers = useCallback(async () => {
    if (!open) return;
    try {
      setMentionUsers(await fetchEmployeeTaskMentionUsers());
    } catch {
      try {
        const fallback = await fetchAssignableUsers();
        setMentionUsers(fallback.map((user) => ({
          id: user.id,
          name: user.name,
          roleName: user.roleName ?? undefined,
        })));
      } catch {
        setMentionUsers([]);
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open || !taskId) {
      setComments([]);
      setDraft('');
      return;
    }
    loadComments();
    loadMentionUsers();
  }, [loadComments, loadMentionUsers, open, taskId]);

  const mentionOptions = useMemo(
    () => mentionUsers.map((user) => ({
      value: String(user.id),
      label: user.roleName ? `${user.name}（${user.roleName}）` : user.name,
    })),
    [mentionUsers],
  );

  const userNameMap = useMemo(() => buildUserNameMap(mentionUsers, comments), [comments, mentionUsers]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!taskId || !content) {
      message.warning('请输入沟通内容');
      return;
    }
    setCommentSubmitting(true);
    try {
      await createEmployeeTaskComment(taskId, {
        content,
        mentionedUserIds: parseMentionedUserIds(content),
      });
      message.success('消息已发送');
      setDraft('');
      await loadComments();
      onChanged?.();
    } catch (err) {
      message.error(getBackendMessage(err, '发送消息失败'));
    } finally {
      setCommentSubmitting(false);
    }
  };

  const list = Array.isArray(comments) ? comments : [];

  return (
    <div style={{ marginTop: 18 }}>
      <Text strong>任务沟通</Text>
      <Spin spinning={commentLoading}>
        {list.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无沟通记录" style={{ margin: '12px 0' }} />
        ) : (
          <List
            style={{ marginTop: 12, maxHeight: 260, overflowY: 'auto' }}
            dataSource={list}
            renderItem={(item) => (
              <List.Item style={{ padding: '8px 0', borderBlockEnd: '1px solid #f1f5f9' }}>
                <List.Item.Meta
                  avatar={<Avatar size={32} style={{ background: '#dbeafe', color: '#2563eb' }}>{item.authorName?.slice(0, 1) || '员'}</Avatar>}
                  title={(
                    <Space size={8}>
                      <Text strong style={{ fontSize: 13 }}>{item.authorName || '-'}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{item.createdAt || '-'}</Text>
                    </Space>
                  )}
                  description={(
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#334155', fontSize: 13 }}>
                      {renderCommentContent(item.content, userNameMap)}
                    </div>
                  )}
                />
              </List.Item>
            )}
          />
        )}
      </Spin>
      <div style={{ marginTop: 12 }}>
        <Mentions
          rows={3}
          value={draft}
          onChange={setDraft}
          placeholder="输入沟通内容，可 @ 同事"
          options={mentionOptions}
          prefix="@"
          notFoundContent="暂无可 @ 员工"
          style={{ width: '100%' }}
        />
        <div style={{ marginTop: 8, textAlign: 'right' }}>
          <Button type="primary" loading={commentSubmitting} onClick={handleSend}>
            发送
          </Button>
        </div>
      </div>
    </div>
  );
}
