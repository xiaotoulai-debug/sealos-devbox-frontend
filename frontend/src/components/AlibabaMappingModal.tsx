import React, { useEffect, useState, useCallback } from 'react';
import { Modal, Input, Button, Tag, Radio, Spin, message, Space, Empty, Alert, Divider } from 'antd';
import { LinkOutlined, CheckCircleOutlined, DisconnectOutlined, PlusOutlined } from '@ant-design/icons';
import request from '../lib/request';

interface SpecItem {
  specId: string;
  specName: string;
  price: number | null;
  imageUrl: string | null;
}

interface ParseResult {
  offerId: string;
  title: string;
  imageUrl: string | null;
  specs: SpecItem[];
}

interface AlibabaMappingModalProps {
  open: boolean;
  productId: number | null;
  productSku: string | null;
  purchaseUrl: string | null;
  currentOfferId: string | null;
  currentSpecId: string | null;
  onCancel: () => void;
  onDone: () => void;
}

export default function AlibabaMappingModal({
  open, productId, productSku, purchaseUrl, currentOfferId, currentSpecId, onCancel, onDone,
}: AlibabaMappingModalProps) {
  const [url,           setUrl]           = useState('');
  const [parsing,       setParsing]       = useState(false);
  const [result,        setResult]        = useState<ParseResult | null>(null);
  const [selectedSpec,  setSelectedSpec]  = useState<string | null>(null);
  const [binding,       setBinding]       = useState(false);
  const [unbinding,     setUnbinding]     = useState(false);
  const [autoFilled,    setAutoFilled]    = useState(false);
  const [parseError,    setParseError]    = useState<string | null>(null);
  const [manualMode,    setManualMode]    = useState(false);
  const [manualSpecName, setManualSpecName] = useState('');

  const is1688Url = (u: string) => /1688\.com/.test(u) && /\d{8,}/.test(u);

  useEffect(() => {
    if (open) {
      const prefill = purchaseUrl?.trim() || '';
      setUrl(prefill);
      setResult(null);
      setSelectedSpec(currentSpecId ?? null);
      setParsing(false);
      setAutoFilled(!!prefill);
      setParseError(null);
      setManualMode(false);
      setManualSpecName('');
    }
  }, [open, currentSpecId, purchaseUrl]);

  const handleParse = useCallback(async () => {
    if (!url.trim()) { message.warning('请输入 1688 商品链接'); return; }
    setParsing(true);
    setResult(null);
    setSelectedSpec(null);
    setParseError(null);
    setManualMode(false);
    try {
      const { data: res } = await request.post<{ code: number; data: ParseResult | null; message: string }>(
        '/alibaba/parse-link', { url: url.trim() },
      );
      if (res.code === 200 && res.data) {
        setResult(res.data);
        setParseError(null);
        if (res.data.specs.length === 1) setSelectedSpec(res.data.specs[0].specId);
      } else {
        setParseError(res.message || '解析失败，未返回商品数据');
        const offerMatch = url.match(/(\d{10,})/);
        if (offerMatch) {
          setResult({ offerId: offerMatch[1], title: '', imageUrl: null, specs: [] });
        }
      }
    } catch (err: unknown) {
      const errRes = (err as { response?: { data?: { message?: string; code?: number } } })?.response?.data;
      const msg = errRes?.message ?? '解析失败，请检查网络或链接格式';
      setParseError(msg);
      console.error('[1688 解析失败]', errRes ?? err);
    } finally { setParsing(false); }
  }, [url]);

  useEffect(() => {
    if (!open || !autoFilled || !url.trim() || !is1688Url(url)) return;
    const timer = setTimeout(() => {
      handleParse();
    }, 500);
    return () => clearTimeout(timer);
  }, [open, autoFilled]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddManualSpec = useCallback(() => {
    if (!manualSpecName.trim() || !result) return;
    const newId = `manual-${Date.now()}`;
    setResult({
      ...result,
      specs: [...result.specs, { specId: newId, specName: manualSpecName.trim(), price: null, imageUrl: null }],
    });
    setSelectedSpec(newId);
    setManualSpecName('');
    setManualMode(false);
  }, [manualSpecName, result]);

  const handleBind = useCallback(async () => {
    if (!productId || !result) return;
    setBinding(true);
    try {
      const { data: res } = await request.put<{ code: number; message: string }>(
        '/alibaba/bind', { productId, offerId: result.offerId, specId: selectedSpec },
      );
      if (res.code === 200) {
        message.success('1688 规格绑定成功');
        onDone();
      } else { message.error(res.message); }
    } catch { message.error('绑定失败'); }
    finally { setBinding(false); }
  }, [productId, result, selectedSpec, onDone]);

  const handleUnbind = useCallback(async () => {
    if (!productId) return;
    setUnbinding(true);
    try {
      const { data: res } = await request.put<{ code: number; message: string }>(
        '/alibaba/unbind', { productId },
      );
      if (res.code === 200) {
        message.success('已解除 1688 绑定');
        onDone();
      } else { message.error(res.message); }
    } catch { message.error('解除绑定失败'); }
    finally { setUnbinding(false); }
  }, [productId, onDone]);

  const isBound = !!currentOfferId;

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LinkOutlined style={{ color: '#ff6a00', fontSize: 18 }} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>1688 规格关联</span>
          {productSku && (
            <Tag color="blue" bordered={false} style={{ fontWeight: 600, fontSize: 13, borderRadius: 6 }}>
              {productSku}
            </Tag>
          )}
        </div>
      }
      open={open}
      onCancel={onCancel}
      width={800}
      destroyOnClose
      maskClosable={false}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
          <div>
            {isBound && (
              <Button danger ghost icon={<DisconnectOutlined />} loading={unbinding} onClick={handleUnbind}>
                解除绑定
              </Button>
            )}
          </div>
          <Space size={12}>
            <Button onClick={onCancel}>取消</Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={binding}
              onClick={handleBind}
              disabled={!result || !selectedSpec}
              style={{ background: '#ff6a00', borderColor: '#ff6a00' }}
            >
              确认绑定
            </Button>
          </Space>
        </div>
      }
    >
      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 16 }}>
        粘贴 1688 商品链接，系统将解析商品规格列表。选择对应规格后点击「确认绑定」即可完成关联。
      </div>

      {isBound && (
        <div style={{
          background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 8,
          padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <CheckCircleOutlined style={{ color: '#fa8c16', fontSize: 16 }} />
          <span style={{ fontSize: 13, color: '#ad6800' }}>
            当前已绑定 1688 商品 <b>#{currentOfferId}</b>
            {currentSpecId && <span>，规格 ID: <b>{currentSpecId}</b></span>}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <Input
          value={url}
          onChange={(e) => { setUrl(e.target.value); setAutoFilled(false); }}
          placeholder="粘贴 1688 商品链接，如：https://detail.1688.com/offer/xxx.html"
          onPressEnter={handleParse}
          style={{ flex: 1 }}
          size="large"
        />
        <Button type="primary" onClick={handleParse} loading={parsing} size="large"
          style={{ background: '#ff6a00', borderColor: '#ff6a00', minWidth: 100 }}
        >
          解析链接
        </Button>
      </div>
      {autoFilled && url && (
        <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 6, marginBottom: 14 }}>
          💡 已自动填充系统记录的货源链接{is1688Url(url) ? '，正在自动解析...' : ''}
        </div>
      )}
      {(!autoFilled || !url) && <div style={{ marginBottom: 20 }} />}

      {parsing && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" tip="正在解析商品信息..." />
        </div>
      )}

      {!parsing && parseError && (
        <Alert
          type="warning"
          showIcon
          closable
          style={{ marginBottom: 16, borderRadius: 8 }}
          message="自动解析未成功"
          description={
            <div style={{ whiteSpace: 'pre-line', fontSize: 12 }}>
              {parseError}
            </div>
          }
        />
      )}

      {!parsing && result && (
        <div>
          {result.title && (
            <div style={{
              background: '#f6f8fa', borderRadius: 10, padding: '14px 20px', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              {result.imageUrl && (
                <img src={result.imageUrl} width={48} height={48}
                  style={{ borderRadius: 8, objectFit: 'cover', border: '1px solid #e8e8e8' }}
                />
              )}
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b', marginBottom: 2 }}>
                  {result.title}
                </div>
                <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                  OfferId: <b>{result.offerId}</b>
                  {result.specs.length > 0 && <span> · 共 {result.specs.length} 个规格</span>}
                </div>
              </div>
            </div>
          )}

          {result.specs.length > 0 && (
            <>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#334155', marginBottom: 10 }}>
                请选择对应规格：
              </div>
              <Radio.Group
                value={selectedSpec}
                onChange={(e) => setSelectedSpec(e.target.value)}
                style={{ width: '100%' }}
              >
                <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #e8e8e8', borderRadius: 10 }}>
                  {result.specs.map((spec, idx) => (
                    <div
                      key={spec.specId}
                      style={{
                        padding: '12px 16px',
                        borderBottom: idx < result.specs.length - 1 ? '1px solid #f0f0f0' : 'none',
                        display: 'flex', alignItems: 'center', gap: 12,
                        cursor: 'pointer', transition: 'background 0.15s',
                        background: selectedSpec === spec.specId ? '#fff7e6' : 'transparent',
                      }}
                      onClick={() => setSelectedSpec(spec.specId)}
                    >
                      <Radio value={spec.specId} />
                      {spec.imageUrl && (
                        <img src={spec.imageUrl} width={36} height={36}
                          style={{ borderRadius: 6, objectFit: 'cover', border: '1px solid #e8e8e8' }}
                        />
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 13, color: '#1e293b' }}>{spec.specName}</div>
                        <div style={{ fontSize: 12, color: '#8c8c8c' }}>SpecId: {spec.specId}</div>
                      </div>
                      {spec.price != null && spec.price > 0 && (
                        <span style={{ fontWeight: 700, color: '#d4380d', fontSize: 14, fontFeatureSettings: '"tnum"' }}>
                          ¥{spec.price.toFixed(2)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </Radio.Group>
            </>
          )}

          <Divider style={{ margin: '16px 0 12px' }} />

          {!manualMode ? (
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              size="small"
              onClick={() => setManualMode(true)}
              style={{ fontSize: 12, color: '#8c8c8c' }}
            >
              手动添加规格
            </Button>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Input
                value={manualSpecName}
                onChange={(e) => setManualSpecName(e.target.value)}
                placeholder="输入规格名称，如：红色 / XL"
                size="small"
                style={{ flex: 1 }}
                onPressEnter={handleAddManualSpec}
              />
              <Button type="primary" size="small" onClick={handleAddManualSpec} disabled={!manualSpecName.trim()}
                style={{ background: '#ff6a00', borderColor: '#ff6a00' }}>
                添加
              </Button>
              <Button size="small" onClick={() => setManualMode(false)}>取消</Button>
            </div>
          )}
        </div>
      )}

      {!parsing && !result && !parseError && !isBound && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#bfbfbf' }}>
          输入 1688 链接并点击「解析链接」开始关联
        </div>
      )}
    </Modal>
  );
}
