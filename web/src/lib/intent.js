// Espelho no navegador da regra do servidor (server/lib/intent.js) — usado só para avisar o cliente antes de enviar.
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ACTION = /\b(troca[rs]?|trocem|mud[ae]r?|alter[ae]r?|ajust[ae]r?|corrig[ie]r?|tir[ae]r?|remov[ae]r?|coloc[ae]r?|substitu[ia]r?|refa[zc]er?|aument[ae]r?|diminu[ia]r?|reduz[ia]r?|cort[ae]r?|inclu[ia]r?|acrescent[ae]r?|adicion[ae]r?|apag[ae]r?|deix[ae]r?|mel?hor[ae]r?|subst|edit[ae]r?|reescrev[ae]r?|clare[ai]r?|escurec[ae]r?|trocad[oa])\b/;
const ASK = /\b(podemos|pode|poderia|da pra|seria possivel|prefiro|preferia|gostaria (de|que)|queria (que|trocar|mudar)|nao gostei|esta errad|erro|errado|errada)\b/;
const PRAISE = /^(amei|adorei|lindo|linda|perfeito|perfeita|maravilhos|gostei muito|ficou otim|top|show|incrivel)/;
export function detectAdjustment(text) {
  const t = fold(String(text || '').trim());
  const page = t.match(/\b(?:pagina|pag\.?|slide|card|tela|imagem|foto)\s*(\d{1,2})\b/)?.[1];
  const time = t.match(/\b(\d{1,2}):(\d{2})\b/);
  const hasAction = ACTION.test(t);
  const praiseOnly = PRAISE.test(t) && !hasAction;
  const isAdjustment = !praiseOnly && (hasAction || (ASK.test(t) && (page || time)) || /\b(errad[oa]|erro de|digitacao|ortografia)\b/.test(t));
  return { isAdjustment, page: page ? Number(page) : null, t: time ? Number(time[1]) * 60 + Number(time[2]) : null };
}
