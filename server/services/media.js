// Mídia profissional: ORIGINAL (intocado) + PREVIEW (otimizado p/ interface) + PUBLISH (formato exigido pela publicação).
// Regra: o original nunca é alterado, comprimido ou substituído. Variantes são derivadas e regeneráveis.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { one, all, insert, update, run, uid, now } from '../db.js';

const exec = promisify(execFile);
const ROOT = path.resolve(process.env.BOLD_STORAGE_DIR || 'storage');
export const TMP_DIR = path.join(ROOT, 'tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

// ── StorageDriver: local (MVP). Interface pronta para S3/R2/GCS ou Google Drive (ver docs/integracoes/google-drive.md).
export const storage = {
  driver: 'local',
  async put(srcPath, key) { const dst = path.join(ROOT, key); await fsp.mkdir(path.dirname(dst), { recursive: true }); await fsp.rename(srcPath, dst).catch(async () => { await fsp.copyFile(srcPath, dst); await fsp.unlink(srcPath); }); return key; },
  path(key) { const p = path.resolve(ROOT, key); if (!p.startsWith(ROOT + path.sep)) throw new Error('chave inválida'); return p; },
  async remove(key) { await fsp.unlink(this.path(key)).catch(() => {}); },
};

const pending = new Set();
export const waitForProcessing = () => Promise.all([...pending]);
export const ALLOWED = /^(image\/(jpeg|png|webp|heic|heif|tiff|gif)|video\/(mp4|quicktime|webm|x-m4v)|application\/pdf|application\/zip|application\/vnd\.openxmlformats.*|text\/plain)$/;
const kindOf = (mime) => mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'document';

async function sha256(file) {
  return new Promise((res, rej) => { const h = crypto.createHash('sha256'); fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });
}
async function probeVideo(file) {
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]);
  const j = JSON.parse(stdout);
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  const [n, d] = String(v?.avg_frame_rate || v?.r_frame_rate || '0/1').split('/').map(Number);
  let w = v?.width, h = v?.height;
  const rot = Number(v?.tags?.rotate || v?.side_data_list?.find((s) => s.rotation != null)?.rotation || 0);
  if (Math.abs(rot) === 90 || Math.abs(rot) === 270) [w, h] = [h, w];
  return { width: w, height: h, duration: Number(j.format?.duration) || null, fps: d ? Math.round((n / d) * 100) / 100 : null, codec: v?.codec_name, pix_fmt: v?.pix_fmt, audio_codec: a?.codec_name || null, format: j.format?.format_name, bitrate: Number(j.format?.bit_rate) || null };
}

// Recebe um arquivo temporário (multer) e registra. Previews são gerados em segundo plano.
export async function ingest(tmpFile, { originalName, mime, clientId, userId, visibility = 'internal' }) {
  if (!ALLOWED.test(mime)) { await fsp.unlink(tmpFile).catch(() => {}); throw Object.assign(new Error(`Tipo de arquivo não suportado: ${mime}`), { status: 415 }); }
  const id = uid('f_');
  const ext = (path.extname(originalName) || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
  const d = new Date();
  const key = `originals/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${id}${ext}`;
  const hash = await sha256(tmpFile);
  const size = (await fsp.stat(tmpFile)).size;
  await storage.put(tmpFile, key);
  const kind = kindOf(mime);
  let meta = {};
  try {
    if (kind === 'image') { const m = await sharp(storage.path(key)).metadata(); const swap = m.orientation >= 5; meta = { width: swap ? m.height : m.width, height: swap ? m.width : m.height, format: m.format, space: m.space, icc: !!m.icc, density: m.density, orientation: m.orientation }; }
    if (kind === 'video') meta = await probeVideo(storage.path(key));
  } catch (e) { meta = { probe_error: e.message }; }
  insert('files', { id, client_id: clientId || null, original_name: originalName.slice(0, 240), mime, size, sha256: hash, kind, width: meta.width || null, height: meta.height || null,
    duration: meta.duration || null, fps: meta.fps || null, codec: meta.codec || null, audio_codec: meta.audio_codec || null, meta: JSON.stringify(meta), storage_key: key,
    processing: kind === 'document' ? 'pronto' : 'pendente', visibility, uploaded_by: userId, created_at: now() });
  const job = processVariants(id).catch((e) => { update('files', { id }, { processing: 'erro', meta: JSON.stringify({ ...meta, variant_error: e.message }) }); });
  pending.add(job); job.finally(() => pending.delete(job));
  return one('SELECT * FROM files WHERE id=?', id);
}

function variantKey(fileId, variant, ext) { return `derived/${fileId.slice(2, 4)}/${fileId}.${variant}.${ext}`; }
async function saveVariant(fileId, variant, tmpOut, mime, ext) {
  const key = variantKey(fileId, variant, ext);
  await storage.put(tmpOut, key);
  let w = null, h = null;
  if (mime.startsWith('image/')) { const m = await sharp(storage.path(key)).metadata(); w = m.width; h = m.height; }
  const size = (await fsp.stat(storage.path(key))).size;
  run('DELETE FROM file_variants WHERE file_id=? AND variant=?', fileId, variant);
  insert('file_variants', { id: uid('fv_'), file_id: fileId, variant, storage_key: key, mime, width: w, height: h, size, created_at: now() });
}

export async function processVariants(fileId) {
  const f = one('SELECT * FROM files WHERE id=?', fileId);
  if (!f || f.kind === 'document') return;
  const src = storage.path(f.storage_key);
  const tmp = (s) => path.join(TMP_DIR, `${fileId}.${s}`);
  if (f.kind === 'image') {
    // PREVIEW: alta qualidade para o feed (lado maior 2560px, WebP q92, perfil sRGB). Nunca maior que o original.
    await sharp(src).rotate().resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true }).toColorspace('srgb').webp({ quality: 92, smartSubsample: true, effort: 4 }).toFile(tmp('preview.webp'));
    await saveVariant(fileId, 'preview', tmp('preview.webp'), 'image/webp', 'webp');
    await sharp(src).rotate().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).toColorspace('srgb').webp({ quality: 82 }).toFile(tmp('thumb.webp'));
    await saveVariant(fileId, 'thumb', tmp('thumb.webp'), 'image/webp', 'webp');
  }
  if (f.kind === 'video') {
    const m = JSON.parse(f.meta || '{}');
    // POSTER em resolução total (frame inicial), JPEG de alta qualidade
    await exec('ffmpeg', ['-y', '-v', 'error', '-ss', String(Math.min(0.5, (f.duration || 1) / 2)), '-i', src, '-frames:v', '1', '-q:v', '2', tmp('poster.jpg')]);
    await saveVariant(fileId, 'poster', tmp('poster.jpg'), 'image/jpeg', 'jpg');
    // PREVIEW: se o original já é reproduzível no navegador (H.264 + yuv420p), o player usa o PRÓPRIO original — zero recompressão.
    const webSafe = m.codec === 'h264' && (!m.pix_fmt || m.pix_fmt === 'yuv420p') && (!m.audio_codec || m.audio_codec === 'aac');
    if (!webSafe) {
      // Caso contrário (ex.: ProRes/HEVC .mov), gera preview H.264 na MESMA resolução e frame rate, CRF 17 (visualmente sem perdas).
      await exec('ffmpeg', ['-y', '-v', 'error', '-i', src, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
        '-fps_mode', 'passthrough', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', tmp('preview.mp4')], { timeout: 30 * 60e3 });
      await saveVariant(fileId, 'preview', tmp('preview.mp4'), 'video/mp4', 'mp4');
    }
  }
  update('files', { id: fileId }, { processing: 'pronto' });
}

// PUBLISHING ASSET (gerado sob demanda). Instagram Graph API aceita apenas JPEG para imagens; vídeo MP4/H.264/AAC.
export async function ensurePublishAsset(fileId) {
  const f = one('SELECT * FROM files WHERE id=?', fileId);
  const ex = one("SELECT * FROM file_variants WHERE file_id=? AND variant='publish'", fileId);
  if (ex) return ex;
  const src = storage.path(f.storage_key);
  const out = path.join(TMP_DIR, `${fileId}.publish`);
  if (f.kind === 'image') {
    if (f.mime === 'image/jpeg') return { storage_key: f.storage_key, mime: f.mime, original: true };
    await sharp(src).rotate().toColorspace('srgb').jpeg({ quality: 95, chromaSubsampling: '4:4:4', mozjpeg: true }).toFile(out + '.jpg');
    await saveVariant(fileId, 'publish', out + '.jpg', 'image/jpeg', 'jpg');
  } else if (f.kind === 'video') {
    const m = JSON.parse(f.meta || '{}');
    if (m.codec === 'h264' && (!m.audio_codec || m.audio_codec === 'aac') && f.mime === 'video/mp4') return { storage_key: f.storage_key, mime: f.mime, original: true };
    await exec('ffmpeg', ['-y', '-v', 'error', '-i', src, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', out + '.mp4'], { timeout: 60 * 60e3 });
    await saveVariant(fileId, 'publish', out + '.mp4', 'video/mp4', 'mp4');
  }
  return one("SELECT * FROM file_variants WHERE file_id=? AND variant='publish'", fileId);
}

export function fileDTO(f) {
  if (!f) return null;
  const variants = all('SELECT variant, mime, width, height, size FROM file_variants WHERE file_id=?', f.id);
  const has = (v) => variants.some((x) => x.variant === v);
  const base = `/api/media/${f.id}`;
  return {
    id: f.id, name: f.original_name, mime: f.mime, kind: f.kind, size: f.size, width: f.width, height: f.height, duration: f.duration, fps: f.fps, codec: f.codec,
    processing: f.processing, created_at: f.created_at, sha256: f.sha256,
    urls: {
      original: `${base}/original`,
      download: `${base}/original?download=1`,
      preview: f.kind === 'video' ? (has('preview') ? `${base}/preview` : `${base}/original`) : has('preview') ? `${base}/preview` : f.kind === 'image' ? `${base}/original` : null,
      thumb: has('thumb') ? `${base}/thumb` : has('poster') ? `${base}/poster` : f.kind === 'image' ? `${base}/original` : null,
      poster: has('poster') ? `${base}/poster` : null,
    },
    variants,
  };
}
