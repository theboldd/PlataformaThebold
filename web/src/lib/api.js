// Cliente HTTP. Toda autorização acontece no servidor; aqui só transportamos e tratamos erros.
export class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }

async function request(method, url, body, { form = false } = {}) {
  const headers = { 'x-bold-request': '1' };
  let payload;
  if (form) payload = body;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`/api${url}`, { method, headers, body: payload, credentials: 'same-origin' });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new CustomEvent('bold:unauthorized'));
    throw new ApiError(res.status, (isJson && data?.error) || 'Algo deu errado. Tente novamente.');
  }
  return data;
}
export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b ?? {}),
  put: (u, b) => request('PUT', u, b ?? {}),
  patch: (u, b) => request('PATCH', u, b ?? {}),
  del: (u) => request('DELETE', u),
  form: (u, fd) => request('POST', u, fd, { form: true }),
};

// Upload com progresso (XHR) — arquivos vão íntegros, sem compressão no navegador
export function uploadWithProgress(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${url}`);
    xhr.setRequestHeader('x-bold-request', '1');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data = null; try { data = JSON.parse(xhr.responseText); } catch { /* resposta não-JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data?.error || 'Falha no upload.'));
    };
    xhr.onerror = () => reject(new ApiError(0, 'Conexão interrompida durante o upload.'));
    xhr.send(formData);
  });
}
