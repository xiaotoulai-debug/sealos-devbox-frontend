import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  Table, Tag, Button, Rate, Space, Tooltip, Cascader, Switch,
  message, Empty, Image, Typography, Input, Select,
  Modal, InputNumber, Divider, Spin,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table/interface';

const { Text } = Typography;
import {
  PlusOutlined, SearchOutlined, ShoppingOutlined, ReloadOutlined,
  FilterOutlined, AppstoreOutlined, CalculatorOutlined, CloudUploadOutlined,
} from '@ant-design/icons';
import request from '../lib/request';

// ─── 罗马尼亚语 → 中文 翻译字典（覆盖四级类目常见名称）──────

const CATEGORY_ZH: Record<string, string> = {
  // ══════════════════════════════════════════════════════════════
  // L1 一级类
  // ══════════════════════════════════════════════════════════════
  'Laptop, Tablete & Telefoane':                '笔记本/平板/手机',
  'PC, Periferice & Software':                  '电脑/外设/软件',
  'Auto, Moto  & RCA':                          '汽车/摩托车配件',
  'Auto, Moto & RCA':                           '汽车/摩托车配件',
  'Casa, Gradina & Bricolaj':                   '家居/园艺/家装',
  'Gaming, Carti & Birotica':                   '游戏/图书/办公',
  'Ingrijire personala & Cosmetice':            '个护/美妆',
  'TV, Audio-Video & Foto':                     '电视/音频/摄影',
  'Electrocasnice':                             '家用电器',
  'Fashion':                                    '时尚服饰',
  'Sport & Outdoor':                            '运动/户外',
  'Jucarii, Copii & Bebe':                      '玩具/母婴',
  'Supermarket':                                '超市百货',
  'Medicamente si produse Farmaceutice':        '药品/保健品',
  'Bricolaj & Gradina':                         '家装与园艺',

  // ══════════════════════════════════════════════════════════════
  // L2 二级类
  // ══════════════════════════════════════════════════════════════
  // ── 笔记本/平板/手机 ──
  'Laptopuri si accesorii':                     '笔记本及配件',
  'Tablete si accesorii':                       '平板及配件',
  'Tablete & accesorii':                        '平板及配件',
  'Telefoane si accesorii':                     '手机及配件',
  'Telefoane mobile & accesorii':               '手机及配件',
  'Wearables & Gadgeturi':                      '穿戴设备与智能硬件',
  // ── 电脑/外设/软件 ──
  'Periferice PC':                              '电脑外设',
  'Periferice & Accesorii':                     '外设与配件',
  'Periferice':                                 '外设设备',
  'Componente PC':                              '电脑组件',
  'Desktop & Monitoare':                        '台式机与显示器',
  'Monitoare':                                  '显示器',
  'Software':                                   '软件',
  'Retele & Servere':                           '网络与服务器',
  'Imprimante si scanere':                      '打印机与扫描仪',
  'Tastaturi si mouse-uri':                     '键盘与鼠标',
  'Memorii':                                    '内存',
  // ── 汽车/摩托 ──
  'Reparatii si echipamente auto':              '汽车维修与设备',
  'Piese auto':                                 '汽车零件',
  'Accesorii auto':                             '汽车配件',
  'Moto':                                       '摩托车',
  // ── 家居/园艺 ──
  'Bucatarie & Servire':                        '厨房与餐具',
  'Mobilier':                                   '家具',
  'Decoratiuni & Textile':                      '装饰与纺织',
  'Gradina':                                    '园艺',
  'Bricolaj':                                   '家装工具',
  'Iluminat':                                   '照明灯具',
  'Baie':                                       '卫浴',
  // ── 游戏/图书/办公 ──
  'Console, Jocuri & Accesorii':                '游戏主机/游戏/配件',
  'Carti':                                      '图书',
  'Birotica':                                   '办公用品',
  'Papetarie':                                  '文具',
  // ── 个护/美妆 ──
  'Articole Sanatate & Wellness':               '健康与保健',
  'Cosmetice':                                  '化妆品',
  'Ingrijire personala':                        '个人护理',
  'Parfumuri':                                  '香水',
  // ── 电视/音频/摄影 ──
  'Playere, Boxe & Casti':                      '播放器/音箱/耳机',
  'Televizoare & accesorii':                    '电视及配件',
  'Foto & Video':                               '摄影摄像',
  // ── 家电 ──
  'Electrocasnice mari':                        '大家电',
  'Electrocasnice mici':                        '小家电',

  // ══════════════════════════════════════════════════════════════
  // L3 三级类
  // ══════════════════════════════════════════════════════════════
  // ── 笔记本相关 ──
  'Accesorii Laptop':                           '笔记本配件',
  'Laptopuri':                                  '笔记本电脑',
  'Piese laptop':                               '笔记本零件',
  'Memorii Notebook':                           '笔记本内存',
  'Memorii RAM':                                '内存条',
  'Tastaturi':                                  '键盘',
  'Tastaturi laptop':                           '笔记本键盘',
  'Incarcatoare laptop':                        '笔记本充电器',
  'Display laptop':                             '笔记本屏幕',
  'Standuri/Coolere notebook':                  '笔记本支架/散热器',
  'Sisteme securizare laptop':                  '笔记本安全锁',
  // ── 平板相关 ──
  'Accesorii Tablete':                          '平板配件',
  'Tablete':                                    '平板电脑',
  // ── 手机相关 ──
  'Accesorii Telefoane':                        '手机配件',
  'Piese si componente telefoane':              '手机零件与组件',
  'Telefoane fixe & Sisteme teleconferinta':    '固定电话与电话会议系统',
  'Telefoane Mobile':                           '手机',
  // ── 穿戴设备 ──
  'Wearables':                                  '穿戴设备',
  'Ochelari VR si accesorii':                   'VR 眼镜及配件',
  // ── 电脑组件 ──
  'Componente':                                 '组件',
  // ── 汽车 L3 ──
  'Reparatii si depanare auto':                 '汽车维修与故障排除',
  // ── 厨房 L3 ──
  'Ustensile gatit':                            '烹饪器具',
  // ── 游戏 L3 ──
  'Accesorii':                                  '配件',
  // ── 健康 L3 ──
  'Articole wellness':                          '保健用品',
  // ── 音频 L3 ──
  'Casti audio':                                '耳机',
  // ── 电视 L3 ──
  'Accesorii TV - Audio':                       '电视音频配件',

  // ══════════════════════════════════════════════════════════════
  // L4 四级类
  // ══════════════════════════════════════════════════════════════
  // ── 笔记本 L4 ──
  'Alte accesorii':                             '其他配件',
  'Baterii laptop':                             '笔记本电池',
  'Docking stations':                           '扩展坞',
  'Folii protectie si autocolante laptop':      '笔记本保护膜/贴纸',
  'Genti laptop':                               '笔记本包',
  'Hard disk-uri notebook':                     '笔记本硬盘',
  // ── 平板 L4 ──
  'Alte accesorii tablete':                     '其他平板配件',
  'Cabluri si adaptoare tablete':               '平板数据线与适配器',
  'Folii protectie tablete':                    '平板保护膜',
  'Huse tablete':                               '平板保护壳',
  'Incarcatoare tablete':                       '平板充电器',
  'Suport auto si Docking':                     '车载支架与底座',
  'Tastaturi tablete':                          '平板键盘',
  // ── 手机配件 L4 ──
  'Adaptoare telefoane mobile':                 '手机适配器',
  'Alte accesorii telefoane':                    '其他手机配件',
  'Baterii telefoane':                           '手机电池',
  'Cabluri de date telefoane':                   '手机数据线',
  'Card reader':                                 '读卡器',
  'Carduri memorie':                             '存储卡',
  'Cartele Pre-paid':                            '预付费卡',
  'Display-uri si touchscreen telefoane':        '手机屏幕与触摸屏',
  'Folii protectie telefoane':                   '手机保护膜',
  'Huse telefoane':                              '手机壳',
  'Incarcatoare telefoane':                      '手机充电器',
  'Memorie externa telefon mobil':               '手机外置存储',
  'Piese si Componente Telefoane':               '手机零件与组件',
  'Power bank telefoane':                        '手机充电宝',
  'Selfie stick-uri':                            '自拍杆',
  'Suport si docking telefoane':                 '手机支架与底座',
  // ── 固话 / 会议 L4 ──
  'Centrale Telefonice':                         '电话交换机',
  'Sisteme de teleconferinta':                   '电话会议系统',
  'Telefoane cu fir':                            '有线电话',
  'Telefoane fara fir':                          '无绳电话',
  // ── 穿戴设备 L4 ──
  'Accesorii Bratari fitness':                   '运动手环配件',
  'Accesorii Smartwatch':                        '智能手表配件',
  'Bratari fitness':                             '运动手环',
  'Inele Inteligente Smart Rings':               '智能戒指',
  'Smartwatch-uri':                              '智能手表',
  'Accesorii ochelari VR':                       'VR 眼镜配件',
  'Ochelari VR':                                 'VR 眼镜',
  // ── 电脑组件 L4 ──
  'Periferice Diverse':                          '杂项外设',
  // ── 汽车 L4 ──
  'Redresoare auto':                             '汽车整流器',
  // ── 厨房 L4 ──
  'Ascutitoare cutite':                          '磨刀器',
  // ── 游戏 L4 ──
  'Controlere, Volane si Casti gaming':          '游戏手柄/方向盘/耳机',
  // ── 健康 L4 ──
  'Aparate de masaj':                            '按摩器',
  // ── 音频 L4 ──
  'Casti Wireless':                              '无线耳机',
  // ── 电视 L4 ──
  'Cabluri si adaptoare':                        '线缆与适配器',
  // ── 品牌笔记本（L4 叶子节点）──
  'Laptopuri ACEMAGIC':                         'ACEMAGIC 笔记本',
  'Laptopuri Acer':                             'Acer 笔记本',
  'Laptopuri Apple':                            'Apple 笔记本',
  'Laptopuri ASUS':                             'ASUS 笔记本',
  'Laptopuri Auusda':                           'Auusda 笔记本',
  'Laptopuri BEYNIVAN':                         'BEYNIVAN 笔记本',
  'Laptopuri Blackview':                        'Blackview 笔记本',
  'Laptopuri Dell':                             'Dell 笔记本',
  'Laptopuri Energizer':                        'Energizer 笔记本',
  'Laptopuri Gigabyte':                         'Gigabyte 笔记本',
  'Laptopuri HP':                               'HP 笔记本',
  'Laptopuri Huawei':                           'Huawei 笔记本',
  'Laptopuri Lenovo':                           'Lenovo 笔记本',
  'Laptopuri MSI':                              'MSI 笔记本',
  // ── 品牌手机（L4 叶子节点）──
  'Telefoane Mobile ACTIVE':                    'ACTIVE 手机',
  'Telefoane Mobile AlexVerity':                'AlexVerity 手机',
  'Telefoane Mobile Allview':                   'Allview 手机',
  'Telefoane Mobile Apple':                     'Apple 手机',
  'Telefoane Mobile Cubot':                     'Cubot 手机',
  'Telefoane Mobile Google':                    'Google 手机',
  'Telefoane Mobile HMD':                       'HMD 手机',
  'Telefoane Mobile Hafury':                    'Hafury 手机',
  'Telefoane Mobile Honor':                     'Honor 手机',
  'Telefoane Mobile Huawei':                    'Huawei 手机',
  'Telefoane Mobile Maxcom':                    'Maxcom 手机',
  'Telefoane Mobile Motorola':                  'Motorola 手机',
  'Telefoane Mobile Nokia':                     'Nokia 手机',
  'Telefoane Mobile Nothing':                   'Nothing 手机',
  'Telefoane Mobile OPPO':                      'OPPO 手机',
  'Telefoane Mobile OUKITEL':                   'OUKITEL 手机',
  'Telefoane Mobile OnePlus':                   'OnePlus 手机',
  'Telefoane Mobile Panasonic':                 'Panasonic 手机',
  'Telefoane Mobile Poco':                      'Poco 手机',
  'Telefoane Mobile Rainbuvvy':                 'Rainbuvvy 手机',
  'Telefoane Mobile Realme':                    'Realme 手机',
  'Telefoane Mobile Redmi':                     'Redmi 手机',
  'Telefoane Mobile Samsung':                   'Samsung 手机',
  'Telefoane Mobile Sweetlink':                 'Sweetlink 手机',
  'Telefoane Mobile TCL':                       'TCL 手机',
  'Telefoane Mobile Vivo':                      'Vivo 手机',
  'Telefoane Mobile Xiaomi':                    'Xiaomi 手机',
  'Telefoane Mobile ZTE':                       'ZTE 手机',
  'Telefoane Mobile iHunt':                     'iHunt 手机',

  // ══════════════════════════════════════════════════════════════
  // 兜底虚拟节点
  // ══════════════════════════════════════════════════════════════
  'Uncategorized':                              '未分类',
};

function tZh(raw: string): string {
  return CATEGORY_ZH[raw] ?? raw;
}

// ─── 类型 ─────────────────────────────────────────────────────

interface Product {
  id:          number;
  pnk:         string;
  title:       string;
  brand:       string | null;
  category:    string | null;
  categoryL1:  string | null;
  categoryL2:  string | null;
  categoryL3:  string | null;
  categoryL4:  string | null;
  price:       number | null;
  costPrice:   number | null;
  stock:       number;
  rating:      number | null;
  reviewCount: number | null;
  tags:        string[];
  imageUrl:    string | null;
  productUrl:  string | null;
  linkTag:     string | null;
  status:      'PENDING' | 'SELECTED';
}

interface CascaderNode {
  value: string;
  label: string;
  children?: CascaderNode[];
}

interface Filters {
  brands:        string[];
  categoryPaths: string[][];
  priceRange:    string;
  pnk:           string;
  tags:          string[];
}

const EMPTY_FILTERS: Filters = { brands: [], categoryPaths: [], priceRange: '', pnk: '', tags: [] };

const PRICE_RANGE_OPTIONS = [
  { value: 'under50',  label: '< 50 RON' },
  { value: '50to150',  label: '50 – 150 RON' },
  { value: 'over150',  label: '> 150 RON' },
];

// 已由 auth.ts 统一管理，此处不再自行读取 user.permissions（旧字段已废弃）

// ─── 利润测算弹窗 ─────────────────────────────────────────────

interface FinancialData {
  purchasePrice: number;
  purchaseUrl:   string;
  actualWeight:  number;
  freightCost:   number;
  fbeFee:        number;
  margin:        number;
  length:        number | null;
  width:         number | null;
  height:        number | null;
  chineseName:   string;
}

interface CollectModalProps {
  product: Product | null;
  onClose: () => void;
  onConfirm: (id: number, financial: FinancialData) => Promise<void>;
  confirming: boolean;
}

const COMMISSION_RATE = 0.23;
const DEFAULT_EXCHANGE_RATE = 1.6;
const HEAD_FREIGHT_PER_KG = 17;

function getTargetMargin(price: number): number {
  if (price < 50)   return 40;
  if (price <= 150)  return 35;
  return 30;
}

function CollectModal({ product, onClose, onConfirm, confirming }: CollectModalProps) {
  const [cnName,      setCnName]      = useState('');
  const [len,         setLen]         = useState<number | null>(null);
  const [wid,         setWid]         = useState<number | null>(null);
  const [hei,         setHei]         = useState<number | null>(null);
  const [weight,      setWeight]      = useState<number | null>(null);
  const [cost,        setCost]        = useState<number | null>(null);
  const [fbe,         setFbe]         = useState<number | null>(null);
  const [rate,        setRate]        = useState<number | null>(DEFAULT_EXCHANGE_RATE);
  const [purchaseUrl, setPurchaseUrl] = useState('');

  // ── 翻译状态 ──────────────────────────────────────────────
  const [translatedTitle,   setTranslatedTitle]   = useState<string | null>(null);
  const [translating,       setTranslating]       = useState(false);

  const open = product !== null;

  useEffect(() => {
    if (product) {
      setCnName('');
      setLen(null); setWid(null); setHei(null);
      setWeight(null); setCost(null); setFbe(null);
      setRate(DEFAULT_EXCHANGE_RATE);
      setPurchaseUrl('');
      setTranslatedTitle(null);

      // 自动翻译标题
      if (product.title) {
        setTranslating(true);
        request.post<{ code: number; data: { translatedText: string }; message?: string }>(
          '/translate',
          { text: product.title, from: 'ro', to: 'zh' },
        ).then(({ data: res }) => {
          if (res.code === 200 && res.data?.translatedText) {
            setTranslatedTitle(res.data.translatedText);
            // 翻译结果仅供界面参考，不自动填充"中文名"输入框
          } else {
            setTranslatedTitle('（翻译失败）');
          }
        }).catch(() => {
          setTranslatedTitle('（翻译失败，请手动填写）');
        }).finally(() => {
          setTranslating(false);
        });
      }
    }
  }, [product]);

  const price = product?.price ?? 0;
  const er    = rate || DEFAULT_EXCHANGE_RATE;

  const calc = useMemo(() => {
    const l = len ?? 0, w = wid ?? 0, h = hei ?? 0;
    const rw = weight ?? 0, pp = cost ?? 0, f = fbe ?? 0;

    const volWeight   = (l * w * h) / 6000;
    const chargeWt    = Math.max(rw, volWeight);
    const headFreight = chargeWt * HEAD_FREIGHT_PER_KG;
    const profit      = (price * 0.84) - (pp / er) - (price * COMMISSION_RATE) - f - (headFreight / er);
    const margin      = price > 0 ? (profit / price) * 100 : 0;

    return {
      volWeight:   isFinite(volWeight)   ? volWeight   : 0,
      chargeWt:    isFinite(chargeWt)    ? chargeWt    : 0,
      headFreight: isFinite(headFreight) ? headFreight : 0,
      profit:      isFinite(profit)      ? profit      : 0,
      margin:      isFinite(margin)      ? margin      : 0,
    };
  }, [price, er, len, wid, hei, weight, cost, fbe]);

  const targetMargin = getTargetMargin(price);
  const allFilled    = [len, wid, hei, weight, cost, fbe].every((v) => v != null);
  const urlFilled    = purchaseUrl.trim().length > 0;
  const canConfirm   = allFilled && urlFilled && calc.margin > targetMargin;
  const profitColor  = calc.margin > targetMargin ? '#52c41a' : calc.margin > 0 ? '#faad14' : '#ff4d4f';

  const numField = (
    label: string, val: number | null, set: (v: number | null) => void, suffix: string,
  ) => (
    <div>
      <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>{label}</div>
      <InputNumber
        value={val} onChange={set} style={{ width: '100%' }}
        min={0} precision={2} addonAfter={suffix} placeholder="请输入"
      />
    </div>
  );

  return (
    <Modal
      title={<span><CalculatorOutlined style={{ marginRight: 8, color: '#faad14' }} />利润测算 — 采集防火墙</span>}
      open={open}
      onCancel={onClose}
      width={580}
      destroyOnClose
      maskClosable={false}
      footer={[
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button
          key="ok" type="primary" loading={confirming}
          disabled={!canConfirm}
          onClick={() => product && onConfirm(product.id, {
            purchasePrice: cost ?? 0,
            purchaseUrl:   purchaseUrl.trim(),
            actualWeight:  weight ?? 0,
            freightCost:   calc.headFreight,
            fbeFee:        fbe ?? 0,
            margin:        parseFloat(calc.margin.toFixed(2)),
            length:        len,
            width:         wid,
            height:        hei,
            chineseName:   cnName.trim(),
          })}
          style={canConfirm ? { background: '#52c41a', borderColor: '#52c41a' } : undefined}
        >
          {canConfirm
            ? '✓ 确定采集'
            : !allFilled ? '请填写所有数值'
            : !urlFilled ? '请填写采购链接'
            : `毛利率须 >${targetMargin}%`}
        </Button>,
      ]}
    >
      {/* ── 双语标题 ── */}
      <div style={{
        background: 'linear-gradient(135deg, #e6f4ff 0%, #f0f5ff 100%)',
        borderRadius: 10, padding: '14px 18px', marginBottom: 16,
        border: '1px solid #bae0ff',
      }}>
        {/* 原文（罗马尼亚语） */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <span style={{
            flexShrink: 0, fontSize: 11, color: '#1890ff', fontWeight: 600,
            background: '#e6f4ff', border: '1px solid #91caff',
            borderRadius: 4, padding: '1px 6px', lineHeight: '20px',
          }}>RO</span>
          <span style={{
            fontSize: 13, color: '#262626', lineHeight: 1.5, wordBreak: 'break-word',
          }}>
            {product?.title ?? '—'}
          </span>
        </div>

        {/* 中文翻译 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{
            flexShrink: 0, fontSize: 11, color: '#52c41a', fontWeight: 600,
            background: '#f6ffed', border: '1px solid #b7eb8f',
            borderRadius: 4, padding: '1px 6px', lineHeight: '20px',
          }}>中</span>
          {translating ? (
            <span style={{ fontSize: 13, color: '#8c8c8c', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Spin size="small" />
              正在翻译中…
            </span>
          ) : (
            <span style={{
              fontSize: 13, color: translatedTitle?.startsWith('（') ? '#ff4d4f' : '#262626',
              lineHeight: 1.5, wordBreak: 'break-word', fontWeight: translatedTitle && !translatedTitle.startsWith('（') ? 500 : 400,
            }}>
              {translatedTitle ?? '—'}
            </span>
          )}
        </div>
      </div>

      {/* ── 产品信息 ── */}
      <div style={{
        background: '#f6f8fa', borderRadius: 10, padding: '14px 20px',
        marginBottom: 20, display: 'flex', gap: 32, alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 2 }}>PNK 码</div>
          <div style={{
            fontWeight: 600, fontSize: 15,
            fontFamily: "'Inter', monospace", letterSpacing: 0.5,
          }}>
            {product?.pnk}
          </div>
        </div>
        <div style={{ width: 1, height: 36, background: '#e0e0e0' }} />
        <div>
          <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 2 }}>售价(含税) (RON)</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: '#1890ff' }}>
            {price.toFixed(2)}
          </div>
        </div>
        {product?.productUrl ? (
          <a onClick={() => window.open(product.productUrl!, '_blank', 'noreferrer,noopener')}
            style={{ fontSize: 14, color: '#1890ff', fontWeight: 400, marginLeft: 24, cursor: 'pointer', whiteSpace: 'nowrap', alignSelf: 'center' }}
          >🔗 竞品链接</a>
        ) : (
          <span style={{ fontSize: 14, color: '#bfbfbf', marginLeft: 24, whiteSpace: 'nowrap', alignSelf: 'center' }}>🔗 竞品链接</span>
        )}
      </div>

      {/* ── 输入表单 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px', marginBottom: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>尺寸 (cm)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <InputNumber value={len} onChange={setLen} placeholder="长" min={0} precision={1} style={{ flex: 1 }} />
            <span style={{ color: '#bfbfbf', fontSize: 13, userSelect: 'none' }}>×</span>
            <InputNumber value={wid} onChange={setWid} placeholder="宽" min={0} precision={1} style={{ flex: 1 }} />
            <span style={{ color: '#bfbfbf', fontSize: 13, userSelect: 'none' }}>×</span>
            <InputNumber value={hei} onChange={setHei} placeholder="高" min={0} precision={1} style={{ flex: 1 }} />
            <span style={{ color: '#8c8c8c', fontSize: 12, whiteSpace: 'nowrap', marginLeft: 2 }}>cm</span>
          </div>
        </div>
        {numField('实重', weight, setWeight, 'kg')}
        {numField('采购价', cost, setCost, 'RMB')}
        {numField('FBE 费', fbe, setFbe, 'RON')}
        <div>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>汇率</div>
          <InputNumber value={rate} onChange={setRate} style={{ width: '100%' }} min={0.01} step={0.01} precision={2} addonAfter="RON/RMB" />
        </div>
      </div>

      {/* ── 采购链接（必填）── */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>
          采购链接 <span style={{ color: '#ff4d4f' }}>*</span>
        </div>
        <Input
          value={purchaseUrl}
          onChange={(e) => setPurchaseUrl(e.target.value)}
          placeholder="请粘贴 1688 / 拼多多 采购链接（必填）"
          allowClear
          style={{ borderRadius: 6 }}
          status={!urlFilled && allFilled ? 'error' : undefined}
        />
      </div>

      {/* ── 中文名 ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>中文名</div>
        <Input value={cnName} onChange={(e) => setCnName(e.target.value)} placeholder="请输入采购规格或颜色（如：蓝色/大号/基础版）" allowClear style={{ borderRadius: 6 }} />
      </div>

      {/* ── 计算明细 ── */}
      <Divider style={{ margin: '16px 0 12px' }} dashed>
        <span style={{ fontSize: 12, color: '#8c8c8c' }}>计算明细</span>
      </Divider>
      <div style={{
        display: 'flex', gap: 20, marginBottom: 16,
        color: '#595959', fontSize: 13, flexWrap: 'wrap',
      }}>
        <span>体积重: <b>{calc.volWeight.toFixed(2)}</b> kg</span>
        <span>计费重 N: <b>{calc.chargeWt.toFixed(2)}</b> kg</span>
        <span>头程费: <b>{calc.headFreight.toFixed(2)}</b> RMB</span>
        <span style={{ color: '#8c8c8c' }}>佣金: {(COMMISSION_RATE * 100).toFixed(0)}%</span>
      </div>

      {/* ── 结果大字 ── */}
      <div style={{
        display: 'flex', background: '#fafafa', borderRadius: 12,
        overflow: 'hidden', border: '1px solid #f0f0f0',
      }}>
        <div style={{ flex: 1, textAlign: 'center', padding: '20px 16px' }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>毛利润 (RON)</div>
          <div style={{
            fontSize: 30, fontWeight: 700, color: profitColor,
            fontFeatureSettings: '"tnum"', lineHeight: 1.2,
          }}>
            {calc.profit.toFixed(2)}
          </div>
        </div>
        <div style={{ width: 1, background: '#f0f0f0' }} />
        <div style={{ flex: 1, textAlign: 'center', padding: '20px 16px' }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>毛利率</div>
          <div style={{
            fontSize: 30, fontWeight: 700, color: profitColor,
            fontFeatureSettings: '"tnum"', lineHeight: 1.2,
          }}>
            {calc.margin.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* ── 及格线 + 未达标提示 ── */}
      <div style={{
        textAlign: 'center', marginTop: 12, fontSize: 13,
        color: canConfirm ? '#52c41a' : '#8c8c8c', fontWeight: 500,
      }}>
        目标及格线：毛利率 &gt; {targetMargin}%
        <span style={{ marginLeft: 8, fontSize: 11, color: '#bfbfbf' }}>
          （售价{price < 50 ? '<50' : price <= 150 ? '50~150' : '>150'} RON 适用）
        </span>
      </div>
      {allFilled && calc.margin <= targetMargin && (
        <div style={{
          textAlign: 'center', color: '#ff4d4f', marginTop: 6,
          fontSize: 13, fontWeight: 500,
        }}>
          ⚠ 毛利率 {calc.margin.toFixed(2)}% 未达到 {targetMargin}% 门槛，无法采集
        </div>
      )}
    </Modal>
  );
}

// ─── 主组件 ───────────────────────────────────────────────────

export default function PublicPool() {
  const [products,  setProducts]  = useState<Product[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [selecting, setSelecting]       = useState<number | null>(null);
  const [collectTarget, setCollectTarget] = useState<Product | null>(null);
  const [showOnlyEligible, setShowOnlyEligible] = useState(true);
  const eligibleRef = useRef(true);
  const [page,      setPage]      = useState(1);
  const [pageSize,  setPageSize]  = useState(15);
  const [total,     setTotal]     = useState(0);

  const [allBrands,   setAllBrands]   = useState<string[]>([]);
  const [allTags,     setAllTags]     = useState<string[]>([]);
  const [catTree,     setCatTree]     = useState<CascaderNode[]>([]);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // 已能访问本页面（MENU_PUBLIC_PRODUCTS 菜单权限），即有采集资格
  const canSelect = true;

  // ── 加载品牌 ─────────────────────────────────────────────

  const loadBrands = useCallback(async () => {
    try {
      const { data: res } = await request.get<{ code: number; data: string[] }>('/products/brands');
      if (res.code === 200 && Array.isArray(res.data)) setAllBrands(res.data);
    } catch (e) { console.error('[PublicPool] 品牌加载失败', e); }
  }, []);

  // ── 加载标签 ─────────────────────────────────────────────

  const loadTags = useCallback(async () => {
    try {
      const { data: res } = await request.get<{ code: number; data: string[] }>('/products/tags');
      if (res.code === 200 && Array.isArray(res.data)) setAllTags(res.data);
    } catch (e) { console.error('[PublicPool] 标签加载失败', e); }
  }, []);

  // ── 加载类目（树形结构）──────────────────────────────────

  const loadCategories = useCallback(async () => {
    try {
      const { data: res } = await request.get<{
        code: number;
        data: CascaderNode[];
      }>('/products/categories');

      if (res.code === 200 && Array.isArray(res.data)) {
        const translate = (nodes: CascaderNode[]): CascaderNode[] =>
          nodes.map((n) => ({
            value:    n.value,
            label:    tZh(n.value),
            ...(n.children ? { children: translate(n.children) } : {}),
          }));
        setCatTree(translate(res.data));
      }
    } catch (e) { console.error('[PublicPool] 类目加载失败', e); }
  }, []);

  // ── 拉取产品列表 ─────────────────────────────────────────

  const fetchProducts = useCallback(async (p: number, ps: number, f: Filters, eligible?: boolean) => {
    setLoading(true);
    try {
      const params: Record<string, string | number | boolean> = { page: p, pageSize: ps };
      if (f.brands.length        > 0) params.brand        = f.brands.join(',');
      if (f.categoryPaths.length > 0) params.categoryPath = JSON.stringify(f.categoryPaths);
      if (f.priceRange)                params.priceRange   = f.priceRange;
      if (f.pnk.trim())               params.pnk          = f.pnk.trim();
      if (f.tags.length          > 0) params.tag           = f.tags.join(',');
      if (eligible !== undefined ? eligible : eligibleRef.current) params.eligibleOnly = 'true';

      const { data: res } = await request.get<{
        code: number; data: { list: Product[]; total: number }; message: string;
      }>('/products', { params });

      if (res.code === 200 && res.data) {
        setProducts(Array.isArray(res.data.list) ? res.data.list : []);
        setTotal(res.data.total ?? 0);
      } else {
        message.error(res.message || '获取失败');
      }
    } catch {
      message.error('请求失败，请检查网络或后端服务');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── 初始化 ───────────────────────────────────────────────

  useEffect(() => {
    fetchProducts(1, 15, EMPTY_FILTERS);
    loadBrands();
    loadCategories();
    loadTags();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 搜索 ─────────────────────────────────────────────────

  const doSearch = useCallback(() => {
    setPage(1);
    fetchProducts(1, pageSize, filtersRef.current);
  }, [fetchProducts, pageSize]);

  // ── 重置 ─────────────────────────────────────────────────

  const doReset = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
    fetchProducts(1, pageSize, EMPTY_FILTERS);
  }, [fetchProducts, pageSize]);

  // ── 分页 ─────────────────────────────────────────────────

  const handlePageChange = useCallback((pag: TablePaginationConfig) => {
    const newPage     = pag.current  ?? 1;
    const newPageSize = pag.pageSize ?? pageSize;
    setPage(newPage);
    setPageSize(newPageSize);
    fetchProducts(newPage, newPageSize, filtersRef.current);
  }, [fetchProducts, pageSize]);

  // ── Cascader onChange：直接存储选中的级联路径 ──

  const handleCascaderChange = useCallback((value: (string | number)[][]) => {
    const paths = value.map((p) => p.map(String));
    setFilters((prev) => ({ ...prev, categoryPaths: paths }));
  }, []);

  // ── 采集（弹窗确认后调用）─────────────────────────────────

  const handleCollectConfirm = useCallback(async (id: number, financial: FinancialData) => {
    setSelecting(id);
    try {
      const { data: res } = await request.post<{ code: number; message: string }>(`/products/${id}/select`, financial);
      if (res.code === 200) {
        message.success('采集成功！产品已加入私有池');
        setCollectTarget(null);
        setProducts((prev) => prev.map((p) => p.id === id ? { ...p, status: 'SELECTED' } : p));
      } else {
        message.error(res.message);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg ?? '操作失败');
    } finally {
      setSelecting(null);
    }
  }, []);

  // ── 表格列 ───────────────────────────────────────────────

  const columns = useMemo<ColumnsType<Product>>(() => [
    {
      title: '图片', dataIndex: 'imageUrl', width: 80,
      render: (url: string | null) =>
        url ? (
          <Image src={url} width={56} height={56}
            style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid #f0f0f0' }}
            preview={{ mask: <SearchOutlined style={{ fontSize: 14 }} /> }}
            fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56'%3E%3Crect fill='%23f5f5f5' width='56' height='56'/%3E%3C/svg%3E"
          />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center">
            <ShoppingOutlined className="text-gray-300 text-lg" />
          </div>
        ),
    },
    {
      title: '品牌', dataIndex: 'brand', width: 140,
      onCell: () => ({ style: { paddingRight: 20 } }),
      render: (v: string | null) => {
        if (!v) return <span className="text-gray-300">—</span>;
        return (
          <Tooltip title={v} mouseEnterDelay={0.3} placement="topLeft">
            <Tag color="blue" bordered={false} style={{
              display: 'inline-block', maxWidth: 116,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              verticalAlign: 'middle', borderRadius: 6,
              padding: '3px 10px', fontWeight: 500, fontSize: 13,
              lineHeight: '20px', cursor: 'default',
            }}>{v}</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '产品名称', dataIndex: 'title', width: 300,
      ellipsis: { showTitle: false },
      render: (v: string, row) => {
        const openUrl = () => {
          const raw = row.productUrl || `https://www.emag.ro/pd/${row.pnk}/`;
          const url = raw.startsWith('http') ? raw : raw.startsWith('//') ? `https:${raw}` : `https://${raw}`;
          window.open(url, '_blank', 'noreferrer,noopener');
        };
        return (
          <Tooltip title={`点击跳转 eMAG：${v}`} placement="topLeft" mouseEnterDelay={0.4}>
            <span onClick={openUrl} style={{
              display: 'block', overflow: 'hidden', whiteSpace: 'nowrap',
              textOverflow: 'ellipsis', maxWidth: 272,
              color: '#1890ff', cursor: 'pointer',
              textDecoration: 'underline', textUnderlineOffset: '3px',
              fontSize: 14, fontWeight: 500, lineHeight: 1.5,
            }}>{v}</span>
          </Tooltip>
        );
      },
    },
    {
      title: 'PNK 码', dataIndex: 'pnk', width: 185,
      render: (v: string) => (
        <span className="pnk-cell">
          <Text copyable={{ tooltips: ['复制 PNK', '已复制！'] }} style={{
            fontSize: 13, fontWeight: 400,
            fontFamily: "'Inter','-apple-system','BlinkMacSystemFont','Segoe UI','PingFang SC','Microsoft YaHei',sans-serif",
            color: '#262626', background: '#f5f5f5',
            border: '1px solid #d9d9d9', borderRadius: 6,
            padding: '3px 10px', whiteSpace: 'nowrap', letterSpacing: '0.5px',
          }}>{v}</Text>
        </span>
      ),
    },
    {
      title: '类目', key: 'category', width: 180,
      render: (_: unknown, row: Product) => {
        const parts = [row.categoryL1, row.categoryL2, row.categoryL3, row.categoryL4]
          .filter((s): s is string => Boolean(s?.trim()));
        if (parts.length === 0) return <span className="text-gray-300">—</span>;
        const leaf = parts[parts.length - 1];
        const zhLeaf = tZh(leaf);
        const fullPath = parts.map(tZh).join(' › ');
        return (
          <Tooltip title={fullPath} mouseEnterDelay={0.3}>
            <Tag bordered={false} color="default" style={{ whiteSpace: 'normal', lineHeight: 1.4 }}>
              {zhLeaf}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '产品标签', dataIndex: 'linkTag', width: 140,
      render: (v: string | null) => {
        if (!v) return <span className="text-gray-300 text-xs">—</span>;
        return (
          <Tag bordered={false} style={{
            background: '#f0f5ff', color: '#1d39c4',
            borderRadius: 6, padding: '3px 10px',
            fontSize: 12, fontWeight: 500,
            whiteSpace: 'nowrap', maxWidth: 118,
            overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block',
          }}>{v}</Tag>
        );
      },
    },
    {
      title: '售价(含税)', dataIndex: 'price', width: 130, align: 'right',
      sorter: (a, b) => (a.price ?? 0) - (b.price ?? 0),
      render: (v: number | null) => {
        const n = typeof v === 'string' ? parseFloat(v) : v;
        return n != null && !isNaN(n) && n > 0
          ? <span className="font-semibold text-gray-800 tabular-nums">{n.toFixed(2)}</span>
          : <span className="text-gray-300">—</span>;
      },
    },
    {
      title: '评分', dataIndex: 'rating', width: 150,
      sorter: (a, b) => (a.rating ?? 0) - (b.rating ?? 0),
      render: (v: number | null) => v != null ? (
        <Space direction="vertical" size={2}>
          <Rate disabled value={v} allowHalf style={{ fontSize: 12 }} />
          <span className="text-xs text-gray-500 tabular-nums">{v.toFixed(2)}</span>
        </Space>
      ) : <span className="text-gray-300">—</span>,
    },
    {
      title: '评价数', dataIndex: 'reviewCount', width: 100, align: 'right',
      sorter: (a, b) => (a.reviewCount ?? 0) - (b.reviewCount ?? 0),
      render: (v: number | null) =>
        v != null && v > 0
          ? <span className="tabular-nums text-gray-700">{v.toLocaleString()}</span>
          : <span className="text-gray-300">—</span>,
    },
    {
      title: '操作', key: 'action', width: 120, fixed: 'right',
      render: (_: unknown, row: Product) => {
        if (row.status === 'SELECTED')
          return <Tag color="success" bordered={false} style={{ borderRadius: 20 }}>✓ 已入选</Tag>;
        if (!canSelect) return null;

        const hasTopFavorite = (row.linkTag ?? '').toLowerCase().includes('top favorite')
          || (Array.isArray(row.tags) && row.tags.some(t => t.toLowerCase().includes('top favorite')));
        const isHighlyRated = (row.rating ?? 0) >= 3.5 && (row.reviewCount ?? 0) >= 1;
        const isEligible = hasTopFavorite || isHighlyRated;

        return (
          <Tooltip title={isEligible ? '利润测算 → 采集' : '资质不符：需带有 Top Favorite 标签，或评分≥3.5且至少有1条评论'}>
            <span>
              <Button type="primary" size="small" icon={<PlusOutlined />}
                disabled={!isEligible}
                onClick={() => setCollectTarget(row)}
                style={{ borderRadius: 6, ...(isEligible ? { background: '#2563EB' } : {}) }}
              >采集</Button>
            </span>
          </Tooltip>
        );
      },
    },
  ], [canSelect]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 渲染 ─────────────────────────────────────────────────

  const hasFilter = filters.brands.length > 0 || filters.categoryPaths.length > 0 || !!filters.priceRange || filters.pnk.trim().length > 0 || filters.tags.length > 0;

  return (
    <div className="min-h-full">

      {/* ── 页头 ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 m-0">公海产品池</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            共 <span className="font-semibold text-gray-700 text-base">{total.toLocaleString()}</span> 件产品
            {hasFilter && (
              <span className="ml-2 text-blue-500 text-xs font-medium">
                （已筛选
                {filters.categoryPaths.length > 0 && `：类目 ${filters.categoryPaths.map((p) => tZh(p[p.length - 1])).join(' / ')}`}
                {filters.priceRange            && `${filters.categoryPaths.length > 0 ? '，' : '：'}价格 ${PRICE_RANGE_OPTIONS.find((o) => o.value === filters.priceRange)?.label ?? filters.priceRange}`}
                {filters.brands.length        > 0 && `${(filters.categoryPaths.length > 0 || filters.priceRange) ? '，' : '：'}品牌 ${filters.brands.join(' / ')}`}
                {filters.tags.length          > 0 && `${(filters.categoryPaths.length > 0 || filters.priceRange || filters.brands.length > 0) ? '，' : '：'}标签 ${filters.tags.join(' / ')}`}
                {filters.pnk.trim()                && `${(filters.categoryPaths.length > 0 || filters.priceRange || filters.brands.length > 0 || filters.tags.length > 0) ? '，' : '：'}PNK ${filters.pnk}`}
                ）
              </span>
            )}
          </p>
        </div>
        <Space>
          <Button
            icon={<CloudUploadOutlined />}
            onClick={() => {
              Modal.confirm({
                title: '导入本地 JSON 数据',
                content: '将从服务器 data_uploads/public_sea_raw/ 目录读取所有 JSON 文件并导入公海产品池。已存在的产品（按 PNK 去重）会自动更新。',
                okText: '开始导入',
                cancelText: '取消',
                onOk: async () => {
                  const hide = message.loading('正在导入公海产品数据，请稍候...', 0);
                  try {
                    const { data: res } = await request.post<{
                      code: number; message: string;
                      data: { totalFiles: number; totalRecords: number; inserted: number; updated: number; skipped: number; errors: number };
                    }>('/products/import-json');
                    hide();
                    if (res.code === 200 && res.data) {
                      Modal.success({
                        title: '导入完成',
                        content: (
                          <div style={{ lineHeight: 2 }}>
                            <div>文件数：<b>{res.data.totalFiles}</b></div>
                            <div>总记录：<b>{res.data.totalRecords.toLocaleString()}</b></div>
                            <div>新增：<b style={{ color: '#52c41a' }}>{res.data.inserted.toLocaleString()}</b></div>
                            <div>更新：<b style={{ color: '#1890ff' }}>{res.data.updated.toLocaleString()}</b></div>
                            {res.data.errors > 0 && <div>错误：<b style={{ color: '#ff4d4f' }}>{res.data.errors}</b></div>}
                          </div>
                        ),
                      });
                      fetchProducts(1, pageSize, filtersRef.current);
                    } else {
                      message.error(res.message || '导入失败');
                    }
                  } catch {
                    hide();
                    message.error('导入请求失败');
                  }
                },
              });
            }}
          >
            导入本地 JSON
          </Button>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={doReset}>
            {hasFilter ? '重置筛选' : '刷新'}
          </Button>
        </Space>
      </div>

      {/* ── 筛选栏：类目(Cascader) + 品牌 + 标签 + PNK + 搜索/清除 ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
        <FilterOutlined className="text-gray-400" />

        {/* 类目四级级联选择器（最左侧）*/}
        <Cascader
          options={catTree}
          onChange={handleCascaderChange}
          value={filters.categoryPaths as (string | number)[][]}
          multiple
          changeOnSelect
          showSearch={{
            filter: (inputValue, path) =>
              path.some((opt) =>
                String(opt.label ?? '').toLowerCase().includes(inputValue.toLowerCase()) ||
                String(opt.value ?? '').toLowerCase().includes(inputValue.toLowerCase())
              ),
          }}
          placeholder="筛选类目（支持四级）"
          maxTagCount={2}
          allowClear
          style={{ minWidth: 220, maxWidth: 400 }}
          suffixIcon={<AppstoreOutlined className="text-gray-400" />}
        />

        {/* 价格区间 */}
        <Select
          allowClear
          placeholder="价格区间"
          value={filters.priceRange || undefined}
          onChange={(v: string) => setFilters((prev) => ({ ...prev, priceRange: v || '' }))}
          options={PRICE_RANGE_OPTIONS}
          style={{ width: 150 }}
        />

        {/* 品牌多选 */}
        <Select
          mode="multiple"
          allowClear
          showSearch
          placeholder="筛选品牌"
          value={filters.brands}
          onChange={(v: string[]) => setFilters((prev) => ({ ...prev, brands: v }))}
          options={allBrands.map((b) => ({ label: b, value: b }))}
          style={{ minWidth: 200, maxWidth: 320 }}
          maxTagCount={2}
          filterOption={(input, opt) =>
            String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
          }
        />

        {/* 标签多选 */}
        <Select
          mode="multiple"
          allowClear
          showSearch
          placeholder="筛选产品标签"
          value={filters.tags}
          onChange={(v: string[]) => setFilters((prev) => ({ ...prev, tags: v }))}
          options={allTags.map((t) => ({ label: t, value: t }))}
          style={{ minWidth: 180, maxWidth: 280 }}
          maxTagCount={2}
          filterOption={(input, opt) =>
            String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
          }
        />

        {/* PNK 码 */}
        <Input
          placeholder="请输入 PNK 码"
          value={filters.pnk}
          onChange={(e) => setFilters((prev) => ({ ...prev, pnk: e.target.value }))}
          onPressEnter={doSearch}
          allowClear
          prefix={<SearchOutlined className="text-gray-300" />}
          style={{ width: 180, borderRadius: 6 }}
        />

        {/* 搜索 */}
        <Button type="primary" icon={<SearchOutlined />} onClick={doSearch} loading={loading} style={{ borderRadius: 6 }}>
          搜索
        </Button>

        {hasFilter && <Button onClick={doReset} style={{ borderRadius: 6 }}>清除</Button>}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Switch size="small" checked={showOnlyEligible} onChange={(v) => { setShowOnlyEligible(v); eligibleRef.current = v; setPage(1); fetchProducts(1, pageSize, filtersRef.current, v); }} />
          <span style={{ fontSize: 13, color: showOnlyEligible ? '#d4380d' : '#8c8c8c', fontWeight: 500, whiteSpace: 'nowrap' }}>
            🔥 只看优质爆款
          </span>
        </div>
      </div>

      {/* ── 产品表格 ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <Table
          rowKey="id"
          dataSource={products}
          columns={columns}
          loading={loading}
          scroll={{ x: 'max-content', y: 'calc(100vh - 290px)' }}
          size="large"
          onChange={handlePageChange}
          pagination={{
            current:         page,
            pageSize:        pageSize,
            total:           total,
            showSizeChanger: true,
            pageSizeOptions: ['15', '50', '100'],
            showQuickJumper: true,
            showTotal: (t, r) => `第 ${r[0]}–${r[1]} 条 / 共 ${t} 条`,
          }}
          locale={{
            emptyText: (
              <Empty
                description={hasFilter ? '未找到匹配数据，请调整筛选条件' : '暂无产品数据'}
                style={{ padding: '48px 0' }}
              />
            ),
          }}
          rowClassName="align-middle"
        />
      </div>

      {/* ── 利润测算弹窗 ── */}
      <CollectModal
        product={collectTarget}
        onClose={() => setCollectTarget(null)}
        onConfirm={handleCollectConfirm}
        confirming={selecting === collectTarget?.id}
      />
    </div>
  );
}
