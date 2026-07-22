import api from '@/utils/api';
import type { ColorCardItem, ImageUploadFile } from './types';

export async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post<{ code: number; data: string }>(
    '/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  if (res.code !== 200 || !res.data) throw new Error('上传失败');
  return res.data;
}

export function computeNextColorNo(items: ColorCardItem[]): string {
  if (items.length === 0) return 'C001';
  const maxSeq = items.reduce((max, item) => {
    const m = item.colorNo?.match(/^C(\d+)$/);
    const seq = m ? parseInt(m[1]) : 0;
    return seq > max ? seq : max;
  }, 0);
  return 'C' + String(maxSeq + 1).padStart(3, '0');
}

export function incrementColorNo(colorNo: string): string {
  const m = colorNo.match(/^C(\d+)$/);
  if (!m) return colorNo;
  return 'C' + String(parseInt(m[1]) + 1).padStart(3, '0');
}

export function getCoverImageUrl(files: ImageUploadFile[]): string {
  return files[0]?.url || '';
}
