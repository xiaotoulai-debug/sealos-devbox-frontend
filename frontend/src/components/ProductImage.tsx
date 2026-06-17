import React, { useState, useEffect } from 'react';
import { Image, Popover, Tooltip } from 'antd';

interface ProductImageProps {
  url: string | null | undefined;
  /** 本地 SKU 备用图：当平台图（url）加载失败时自动降级尝试此地址 */
  localUrl?: string | null | undefined;
  width?: number;
  height?: number;
  showPreview?: boolean;
}

/** eMAG 品牌占位图：加载失败或无图时优雅展示，绝不出现碎图 */
const EMAGPlaceholder = ({ width = 60, height = 60 }: { width?: number; height?: number }) => (
  <div
    style={{
      width,
      height,
      borderRadius: 8,
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      color: '#94a3b8',
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.5px',
    }}
  >
    <span style={{ opacity: 0.9 }}>eMAG</span>
    <span style={{ fontSize: 9, opacity: 0.7 }}>暂无图片</span>
  </div>
);

/**
 * 全局产品图片组件：支持两阶段降级兜底
 *
 * 加载顺序：
 *   1. url（平台图，如 eMAG/1688）
 *   2. localUrl（本地 SKU 图，平台图 404/403 时自动切换）
 *   3. EMAGPlaceholder（两者均失败时显示占位图）
 *
 * 同时保留 referrerPolicy="no-referrer" 防止阿里 CDN 防盗链 403。
 */
export default function ProductImage({
  url,
  localUrl,
  width = 60,
  height = 60,
  showPreview = true,
}: ProductImageProps) {
  const urlStr      = url      && typeof url      === 'string' ? url.trim()      : null;
  const localUrlStr = localUrl && typeof localUrl === 'string' ? localUrl.trim() : null;

  // 三阶段状态机
  // 'primary'  → 正在尝试加载平台图（url）
  // 'fallback' → 平台图失败，正在尝试加载本地图（localUrl）
  // 'failed'   → 两者均失败，渲染占位图
  type ImgState = 'primary' | 'fallback' | 'failed';
  const [imgState, setImgState] = useState<ImgState>('primary');

  // 主图 URL 变化时，重置状态，重新从第一阶段开始
  useEffect(() => {
    setImgState('primary');
  }, [urlStr]);

  // 当前实际要加载的 src
  const activeSrc = imgState === 'fallback' && localUrlStr ? localUrlStr : urlStr;

  // 主图区域的 onError 处理
  const handleError = () => {
    if (imgState === 'primary' && localUrlStr && localUrlStr !== urlStr) {
      // 平台图失败，有本地图可用 → 降级
      setImgState('fallback');
    } else {
      // 本地图也失败，或根本没有本地图 → 显示占位图
      setImgState('failed');
    }
  };

  // ── 无有效 URL 或最终失败 ─────────────────────────────────────
  if (!urlStr || imgState === 'failed') {
    return (
      <Tooltip title="暂无图片">
        <EMAGPlaceholder width={width} height={height} />
      </Tooltip>
    );
  }

  const boxStyle: React.CSSProperties = {
    width,
    height,
    borderRadius: 8,
    background: '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  // ── 悬浮预览大图：同样支持两阶段降级 ────────────────────────
  const PopoverImg = () => {
    type PopState = 'primary' | 'fallback' | 'failed';
    const [popState, setPopState] = useState<PopState>('primary');

    // 预览图的 src：与主图保持同步降级逻辑
    const popSrc = popState === 'fallback' && localUrlStr ? localUrlStr : activeSrc;

    if (popState === 'failed') {
      return <EMAGPlaceholder width={120} height={120} />;
    }

    const handlePopError = () => {
      if (popState === 'primary' && localUrlStr && localUrlStr !== activeSrc) {
        setPopState('fallback');
      } else {
        setPopState('failed');
      }
    };

    return (
      <img
        src={popSrc ?? ''}
        alt=""
        referrerPolicy="no-referrer"
        style={{ maxWidth: 320, maxHeight: 320, objectFit: 'contain' }}
        onError={handlePopError}
      />
    );
  };

  return (
    <Popover content={<PopoverImg />} trigger="hover" placement="right">
      <div style={{ ...boxStyle, cursor: showPreview ? 'zoom-in' : 'default' }}>
        {/*
         * key={activeSrc}：当 src 从平台图切换到本地图时，
         * 强制 Ant Design Image 重新挂载并发起新的加载请求。
         */}
        <Image
          key={activeSrc ?? '__empty__'}
          src={activeSrc ?? ''}
          alt=""
          width={width}
          height={height}
          referrerPolicy="no-referrer"
          style={{ objectFit: 'contain', borderRadius: 8 }}
          preview={showPreview ? { mask: '点击放大' } : false}
          onError={handleError}
        />
      </div>
    </Popover>
  );
}
