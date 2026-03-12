import React, { useState, useEffect } from 'react';
import { Image, Popover, Tooltip } from 'antd';

interface ProductImageProps {
  url: string | null | undefined;
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
 * 全局产品图片组件：100% 依赖 record.main_image，无地区判断
 * - 空值/404：直接占位不请求，onError + fallback 双重兜底，绝不出现碎图
 * - Ant Design Image：点击放大预览，hover 悬浮预览
 */
export default function ProductImage({ url, width = 60, height = 60, showPreview = true }: ProductImageProps) {
  const urlStr = url && typeof url === 'string' ? url.trim() : null;
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
  }, [urlStr]);

  // 空值：直接渲染占位图，不发任何请求
  if (!urlStr || loadError) {
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

  const handleError = () => {
    setLoadError(true);
  };

  const PopoverImg = () => {
    const [err, setErr] = useState(false);
    if (err) {
      return <EMAGPlaceholder width={120} height={120} />;
    }
    return (
      <img
        src={urlStr}
        alt=""
        style={{ maxWidth: 320, maxHeight: 320, objectFit: 'contain' }}
        onError={() => setErr(true)}
      />
    );
  };

  return (
    <Popover content={<PopoverImg />} trigger="hover" placement="right">
      <div style={{ ...boxStyle, cursor: showPreview ? 'zoom-in' : 'default' }}>
        <Image
          src={urlStr}
          alt=""
          width={width}
          height={height}
          style={{ objectFit: 'contain', borderRadius: 8 }}
          preview={showPreview ? { mask: '点击放大' } : false}
          fallback={<EMAGPlaceholder width={width} height={height} />}
          onError={handleError}
        />
      </div>
    </Popover>
  );
}
