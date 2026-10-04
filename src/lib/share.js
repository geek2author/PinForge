// ==========================================
// PinForge 分享链接：把完整配置压缩进 URL hash（无服务器）
// 格式：#d=z<base64url(deflate-raw(json))> 或 #d=j<base64url(json)>
// ==========================================

function toB64Url(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function encodeShareConfig(config) {
  const json = JSON.stringify(config);
  if (typeof CompressionStream !== 'undefined') {
    try {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const buf = await new Response(stream).arrayBuffer();
      return 'z' + toB64Url(new Uint8Array(buf));
    } catch {
      /* fallthrough */
    }
  }
  return 'j' + toB64Url(new TextEncoder().encode(json));
}

export async function decodeShareConfig(data) {
  try {
    const bytes = fromB64Url(data.slice(1));
    if (data.startsWith('z') && typeof DecompressionStream !== 'undefined') {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      const text = await new Response(stream).text();
      return JSON.parse(text);
    }
    if (data.startsWith('j')) {
      return JSON.parse(new TextDecoder().decode(bytes));
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function buildShareUrl(config) {
  return encodeShareConfig(config).then((data) => {
    const base = window.location.origin + window.location.pathname;
    return `${base}#d=${data}`;
  });
}
