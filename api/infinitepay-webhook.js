// Vercel Serverless Function: recebe webhook do Infinitepay quando
// um pagamento é aprovado, valida e dispara evento Purchase server-side
// para o Meta Conversions API (CAPI).
//
// Fluxo:
//   Infinitepay confirma pagamento
//     -> POST https://sintoniasolutions.com.br/api/infinitepay-webhook
//        body: { invoice_slug, amount, paid_amount, items[], customer?, ... }
//     -> hasheamos PII (se vier) via SHA-256
//     -> POST Graph API do Meta com evento Purchase (value BRL)
//     -> retorna 200 OK pro Infinitepay (evita retentativa)
//
// Env vars esperadas no Vercel:
//   META_PIXEL_ID           = 425164433308044 (default se não setar)
//   META_CAPI_ACCESS_TOKEN  = EAA... (secreto)
//
// Payload do Infinitepay (documentação):
//   { invoice_slug, amount, paid_amount, installments, capture_method,
//     transaction_nsu, order_nsu, receipt_url, items[], customer? }
//   Valores em CENTAVOS. Ex: amount=2700 = R$ 27,00

const crypto = require('crypto');

const DEFAULT_PIXEL_ID = '425164433308044';

// SHA-256 hex lowercase — padrão Meta pra Advanced Matching
function sha256Hex(text) {
  if (!text) return undefined;
  return crypto.createHash('sha256')
    .update(String(text).trim().toLowerCase())
    .digest('hex');
}

// Normaliza phone pro formato E.164 sem "+"
function normalizePhone(raw) {
  const d = String(raw || '').replace(/\D+/g, '');
  if (!d) return '';
  if (d.length === 10 || d.length === 11) return '55' + d;
  return d;
}

// Split de nome completo em first/last
function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return { fn: parts[0] || '', ln: parts.slice(1).join(' ') || '' };
}

// Remove acentos
function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

module.exports = async function handler(req, res) {
  // CORS + método
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'method_not_allowed' });

  const PIXEL_ID = process.env.META_PIXEL_ID || DEFAULT_PIXEL_ID;
  const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;

  // Parse body (Vercel entrega parsed se Content-Type é JSON, mas garante)
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  // Log estruturado (aparece nos logs Vercel — útil pra debug)
  console.log('[infinitepay-webhook] recebido:', JSON.stringify({
    invoice_slug: body.invoice_slug,
    amount: body.amount,
    paid_amount: body.paid_amount,
    installments: body.installments,
    has_customer: !!body.customer,
  }));

  // Validação básica
  if (!body.invoice_slug || typeof body.amount !== 'number') {
    console.warn('[infinitepay-webhook] payload inválido:', body);
    return res.status(400).json({ error: 'invalid_payload' });
  }

  // Se não temos token do Meta configurado, apenas registra e retorna sucesso
  // (não trava o Infinitepay em retry — o pagamento em si já foi processado)
  if (!ACCESS_TOKEN) {
    console.warn('[infinitepay-webhook] META_CAPI_ACCESS_TOKEN não configurado — pulando envio ao Meta');
    return res.status(200).json({ ok: true, meta_sent: false, reason: 'no_token' });
  }

  // Constrói user_data com o que o Infinitepay mandar
  const c = body.customer || {};
  const nameSplit = splitName(c.name);
  const phoneE164 = normalizePhone(c.phone_number);

  const user_data = {};
  if (c.email)          user_data.em = [sha256Hex(c.email)];
  if (phoneE164)        user_data.ph = [sha256Hex(phoneE164)];
  if (nameSplit.fn)     user_data.fn = [sha256Hex(stripAccents(nameSplit.fn))];
  if (nameSplit.ln)     user_data.ln = [sha256Hex(stripAccents(nameSplit.ln))];
  user_data.country     = [sha256Hex('br')];
  // external_id sempre existe — invoice_slug é único por pagamento
  user_data.external_id = [sha256Hex(body.invoice_slug)];
  // client_ip_address e client_user_agent do webhook são do servidor Infinitepay,
  // não do comprador — não vale enviar. Match quality vem de email/phone/name.

  // Valor em REAIS (Infinitepay manda em centavos)
  const valueBRL = Number((body.paid_amount || body.amount) / 100);

  // Nome do item (pra debug + análise)
  const firstItemDesc = (body.items && body.items[0] && body.items[0].description) || 'Evento 07/09';

  // Monta evento Purchase (formato Graph API v18+)
  const event = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: body.invoice_slug,          // dedup com pixel client
    action_source: 'website',
    event_source_url: 'https://sintoniasolutions.com.br/obrigado',
    user_data: user_data,
    custom_data: {
      currency: 'BRL',
      value: valueBRL,
      content_name: firstItemDesc,
      content_category: 'evento-online',
      content_ids: [body.invoice_slug],
      order_id: body.order_nsu || body.invoice_slug,
    },
  };

  const capiUrl = `https://graph.facebook.com/v18.0/${PIXEL_ID}/events?access_token=${encodeURIComponent(ACCESS_TOKEN)}`;
  const payload = { data: [event] };

  try {
    const r = await fetch(capiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const responseText = await r.text();

    if (!r.ok) {
      console.error('[infinitepay-webhook] Meta CAPI erro', r.status, responseText);
      // Ainda retorna 200 pro Infinitepay pra evitar retentativa (o pagamento já ocorreu)
      return res.status(200).json({ ok: true, meta_sent: false, meta_status: r.status });
    }

    console.log('[infinitepay-webhook] Purchase enviado ao Meta:', responseText);
    return res.status(200).json({
      ok: true,
      meta_sent: true,
      event_id: body.invoice_slug,
      value: valueBRL,
    });
  } catch (err) {
    console.error('[infinitepay-webhook] fetch Meta falhou:', err && err.message);
    return res.status(200).json({ ok: true, meta_sent: false, reason: 'fetch_error' });
  }
};
