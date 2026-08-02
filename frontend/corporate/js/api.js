// 서버 통신 래퍼. 배포 웹에서 API 주소가 다르면 ?api=... 로 지정할 수 있다.
const params = new URLSearchParams(location.search);
export const API_BASE = (params.get('api') || '').replace(/\/$/, '');

async function handle(res) {
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch { /* 본문이 JSON이 아니면 상태코드만 보여준다 */ }
    throw new Error(detail);
  }
  return res.json();
}

export const api = {
  // 브라우저가 GET 응답을 캐시하면 방금 바꾼 값이 화면에 안 나타난다.
  // 새로고침해야 보이는 화면은 담당자가 저장이 안 된 줄 안다.
  get: (path) => fetch(`${API_BASE}${path}`, { cache: 'no-store' }).then(handle),

  post: (path, body) =>
    fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }).then(handle),

  put: (path, body) =>
    fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }).then(handle),

  del: (path) => fetch(`${API_BASE}${path}`, { method: 'DELETE' }).then(handle),

  upload: (path, file, fields = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    Object.entries(fields).forEach(([k, v]) => v != null && fd.append(k, v));
    return fetch(`${API_BASE}${path}`, { method: 'POST', body: fd }).then(handle);
  },

  download: (path) => {
    const a = document.createElement('a');
    a.href = `${API_BASE}${path}`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
};
