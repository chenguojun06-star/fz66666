function getAuthedImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  if (url.startsWith('blob:')) return url;
  const token = localStorage.getItem('fashion_token') || '';
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'token=' + encodeURIComponent(token);
}

export { getAuthedImageUrl };
