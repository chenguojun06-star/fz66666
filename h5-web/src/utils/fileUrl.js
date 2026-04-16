const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://192.168.2.248:8088';

function getAuthedImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  if (url.startsWith('blob:')) return url;

  let fullUrl = url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    fullUrl = API_BASE + (url.startsWith('/') ? '' : '/') + url;
  }

  const token = localStorage.getItem('fashion_token') || '';
  if (!token) return fullUrl;
  const sep = fullUrl.includes('?') ? '&' : '?';
  return fullUrl + sep + 'token=' + encodeURIComponent(token);
}

export { getAuthedImageUrl };
