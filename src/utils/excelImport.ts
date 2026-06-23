/**
 * 通用 Excel/CSV 解析工具
 * - 严格数字验证（拒绝"15kg"等含单位字符串）
 * - 模板下载
 * - 原始行解析
 */
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export interface ParseNumberResult {
  value: number | null;
  /** 非 null 时表示该字段存在错误，调用方需收集到 _errors */
  error: string | null;
}

export interface TemplateConfig {
  headers: string[];
  sampleRows: (string | number)[][];
  colWidths: number[];
  filename: string;
  sheetName?: string;
}

/** 单次 Excel 解析允许的最大有效数据行数（sheet_to_json 行数，不含单独计数表头） */
export const MAX_EXCEL_IMPORT_ROWS = 5000;

/** 超过 {@link MAX_EXCEL_IMPORT_ROWS} 时抛出，供调用方统一弹窗阻断 */
export class ExcelRowLimitExceededError extends Error {
  override name = 'ExcelRowLimitExceededError';
  constructor() {
    super(`单次最多支持更新 ${MAX_EXCEL_IMPORT_ROWS} 条 SKU，请分批导入`);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── 原始行解析 ────────────────────────────────────────────────────────────────

/**
 * 将 File 对象解析为原始 JSON 行（以第一个 Sheet 为准）
 */
export function readExcelAsJsonRows(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        if (rows.length > MAX_EXCEL_IMPORT_ROWS) {
          reject(new ExcelRowLimitExceededError());
          return;
        }
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// ─── 字段提取工具 ──────────────────────────────────────────────────────────────

/**
 * 从原始行中按多个别名获取字符串值
 */
export function getString(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== '') return String(v).trim();
  }
  return '';
}

/**
 * 将可选字段写入请求体：仅写入「有业务含义」的值。
 * 跳过 null、undefined、空字符串或仅空白字符串，避免空单元格在 JSON 中变成 null/"" 误伤后端已有数据。
 * 数值 0 视为用户显式填写，会写入。
 */
export function mergeDefinedPayloadFields(
  target: Record<string, unknown>,
  fields: Record<string, string | number | null | undefined>,
): void {
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string') {
      const t = value.trim();
      if (t === '') continue;
      target[key] = t;
    } else {
      target[key] = value;
    }
  }
}

// ─── 严格数字解析 ──────────────────────────────────────────────────────────────

/**
 * 严格正数解析：
 * - 空值 → { value: null, error: null }（允许留空）
 * - 含非法字符（如 "15kg"）→ error 说明具体错误
 * - 负数 → error
 * - 正常数字 → { value: number, error: null }
 */
export function parseStrictNumber(
  raw: unknown,
  fieldLabel: string,
): ParseNumberResult {
  if (raw === null || raw === undefined || raw === '') {
    return { value: null, error: null };
  }
  const s = String(raw).trim();
  if (s === '') return { value: null, error: null };

  // 只允许：整数 / 小数（不含单位、不含字母）
  if (!/^\d+(\.\d+)?$/.test(s)) {
    return {
      value: null,
      error: `"${fieldLabel}" 含非法字符 "${s}"，请填纯数字（如 15，而非 15kg）`,
    };
  }

  const n = Number(s);
  if (n < 0) {
    return { value: null, error: `"${fieldLabel}" 不能为负数` };
  }
  return { value: n, error: null };
}

// ─── 模板下载 ──────────────────────────────────────────────────────────────────

/**
 * 生成并下载 Excel 模板
 */
export function downloadXlsxTemplate(config: TemplateConfig): void {
  const ws = XLSX.utils.aoa_to_sheet([config.headers, ...config.sampleRows]);
  ws['!cols'] = config.colWidths.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, config.sheetName ?? '模板');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), config.filename);
}
