import { generateZoneCode } from './helpers';
import type { LocationItem } from './types';

export const extractErrorMessage = (err: any): string => {
  return err?.response?.data?.message || err?.message || '操作失败';
};

export const isApiSuccess = (res: any): boolean => {
  const code = res?.data?.code;
  return code === undefined || code === 0 || code === 200;
};

export interface BuildLocationParamsInput {
  zoneName: string;
  zoneCode?: string;
  rackNum: string;
  levelNum: number;
  positionNum: number;
  capacity?: number;
  warehouseType?: string;
  areaId: string;
  existingZoneCodes: string[];
}

export const buildLocationCreatePayload = (input: BuildLocationParamsInput) => {
  const {
    zoneName,
    zoneCode: customZoneCode,
    rackNum,
    levelNum,
    positionNum,
    capacity,
    warehouseType,
    areaId,
    existingZoneCodes,
  } = input;

  const zoneCode = customZoneCode || generateZoneCode(zoneName, existingZoneCodes);
  const paddedRack = String(rackNum || '01').padStart(2, '0');
  const locationCode = `${zoneCode}-${paddedRack}-${levelNum}-${positionNum}`;
  const locationName = `${zoneName} ${paddedRack}架${levelNum}层${positionNum}位`;

  return {
    locationCode,
    locationName,
    zoneCode,
    zoneName,
    aisleCode: zoneCode,
    rackCode: `${zoneCode}-${paddedRack}`,
    levelCode: String(levelNum),
    positionCode: String(positionNum),
    warehouseType,
    areaId,
    capacity: capacity || 100,
    locationType: 'STORAGE' as const,
  };
};

export const normalizeZoneName = (rawZoneName: string | string[] | undefined): string => {
  const value = Array.isArray(rawZoneName) ? rawZoneName[0] : rawZoneName;
  return String(value || '').trim();
};

export type SelectedLocation = Pick<LocationItem, 'id' | 'locationCode' | 'areaId' | 'warehouseType'>;
