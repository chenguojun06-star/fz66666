import { useState, useCallback } from 'react';
import wxAdapter from '@/adapters/wx';
import api from '@/api';

export default function useCameraCapture({ maxCount = 5, autoUpload = true } = {}) {
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);

  const capture = useCallback(async ({ sourceType = ['camera', 'album'], count = 1 } = {}) => {
    try {
      const result = await wxAdapter.chooseMedia({
        count,
        mediaType: ['image'],
        sourceType,
      });
      const files = result.tempFiles || [];
      if (!files.length) return [];

      if (autoUpload) {
        setUploading(true);
        try {
          const uploaded = [];
          for (const f of files) {
            if (f.file) {
              const url = await api.common.uploadImage(f.file);
              if (url) uploaded.push(url);
            } else if (f.tempFilePath) {
              uploaded.push(f.tempFilePath);
            }
          }
          setImages(prev => [...prev, ...uploaded].slice(0, maxCount));
          setUploading(false);
          return uploaded;
        } catch (e) {
          setUploading(false);
          throw e;
        }
      } else {
        const items = files.map(f => ({
          url: f.tempFilePath,
          file: f.file || null,
          uploaded: false,
        }));
        return items;
      }
    } catch (e) {
      if (e?.message === 'cancel') return [];
      throw e;
    }
  }, [autoUpload, maxCount]);

  const captureFromCamera = useCallback(() => {
    return capture({ sourceType: ['camera'], count: 1 });
  }, [capture]);

  const captureFromAlbum = useCallback((count = 1) => {
    return capture({ sourceType: ['album'], count });
  }, [capture]);

  const removeImage = useCallback((index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearImages = useCallback(() => {
    setImages([]);
  }, []);

  const uploadSingleFile = useCallback(async (file) => {
    if (!file) return null;
    setUploading(true);
    try {
      const url = await api.common.uploadImage(file);
      setUploading(false);
      return url;
    } catch (e) {
      setUploading(false);
      throw e;
    }
  }, []);

  return {
    images,
    uploading,
    capture,
    captureFromCamera,
    captureFromAlbum,
    removeImage,
    clearImages,
    uploadSingleFile,
    setImages,
  };
}
