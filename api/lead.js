// Vercel Serverless Function: recebe formulário de qualificação da landing,
// cria card no Trello (lista NOVO LEAD do board SINTONIA - LEADS LANDING) e
// devolve pro client uma URL de WhatsApp já formatada com contexto rico.
//
// Env vars esperadas (Vercel → Settings → Environment Variables):
//   TRELLO_API_KEY  — chave da integração Trello
//   TRELLO_TOKEN    — token do usuário Trello (secret)
//   TRELLO_LIST_ID  — id da lista onde os leads entram
//
// Contrato JSON POST:
//   {
//     service: "aula_grupo" | "aula_particular" | "consultoria",
//     nome: string,
//     whatsapp: string,        // pode vir com máscara — a gente normaliza
//     email: string,
//     cidade: string,
//     empresa: string,
//     faturamento: string,     // uma das opções do select
//     objetivo: string,        // texto livre
//     utm?: { source, medium, campaign, term, content },
//     fbclid?: string,
//     gclid?: string,
//     referrer?: string
//   }

const WHATS_NUMBER = '5519987358774';

const SERVICE_LABELS = {
  aula_grupo:      { titulo: 'Aula em Grupo',       icone: '👥', wa_ctx: 'a Aula em Grupo (lista de espera)' },
  aula_particular: { titulo: 'Aula Particular 1:1', icone: '🎓', wa_ctx: 'a Aula Particular 1:1' },
  consultoria:     { titulo: 'Consultoria Avulsa',  icone: '🧠', wa_ctx: 'a consultoria avulsa por hora' },
};

// Normaliza WhatsApp pra +55DDDNUMERO (E.164) — só dígitos, força código Brasil
function normalizeWhats(raw) {
  const digits = String(raw || '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return '+' + digits;
  if (digits.length === 10 || digits.length === 11) return '+55' + digits;
  return '+' + digits;
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

function esc(s) {
  // Escape MUITO leve para markdown do Trello (evita quebrar o layout do card)
  return String(s == null ? '' : s).replace(/\|/g, '\\|').trim();
}

module.exports = async function handler(req, res) {
  // CORS básico — só aceita POST, e permite chamadas do próprio domínio
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'method_not_allowed' });

  const { TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_LIST_ID } = process.env;
  if (!TRELLO_API_KEY || !TRELLO_TOKEN || !TRELLO_LIST_ID) {
    return res.status(500).json({ error: 'server_misconfigured', hint: 'faltam env vars TRELLO_*' });
  }

  let body = req.body;
  // Vercel pode entregar como string se o content-type vier estranho
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const {
    service, nome, whatsapp, email, cidade, empresa, faturamento, objetivo,
    utm = {}, fbclid = '', gclid = '', referrer = ''
  } = body;

  // Validação mínima
  const errors = [];
  if (!SERVICE_LABELS[service])       errors.push('service inválido');
  if (!nome || String(nome).trim().length < 2)       errors.push('nome obrigatório');
  const whats = normalizeWhats(whatsapp);
  if (!whats || whats.length < 13)    errors.push('whatsapp inválido');
  if (!isEmail(email))                errors.push('email inválido');
  // cidade / empresa / faturamento / objetivo: obrigatórios para os pacotes,
  // opcionais na consultoria pontual (formato mais leve)
  const isConsultoria = service === 'consultoria';
  if (!isConsultoria) {
    if (!cidade)      errors.push('cidade obrigatória');
    if (!empresa)     errors.push('empresa obrigatória');
    if (!faturamento) errors.push('faturamento obrigatório');
    if (!objetivo)    errors.push('objetivo obrigatório');
  }
  if (errors.length) return res.status(400).json({ error: 'validation_failed', errors });

  const svc = SERVICE_LABELS[service];

  // ============ Monta card Trello ============
  const now = new Date();
  const stamp = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const cardName = `${svc.icone} ${esc(nome)} — ${svc.titulo}`;

  const utmLine = Object.entries(utm)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join(' · ');

  const cardDesc = [
    `## ${svc.icone} ${svc.titulo}`,
    ``,
    `**Nome:** ${esc(nome)}`,
    `**WhatsApp:** ${whats}`,
    `**E-mail:** ${esc(email)}`,
    cidade      ? `**Cidade/UF:** ${esc(cidade)}`             : null,
    empresa     ? `**Empresa/Segmento:** ${esc(empresa)}`     : null,
    faturamento ? `**Faturamento mensal:** ${esc(faturamento)}` : null,
    ``,
    objetivo ? `### 🎯 Objetivo / momento\n${esc(objetivo)}\n` : null,
    `---`,
    `**Recebido em:** ${stamp}`,
    utmLine  ? `**Atribuição:** ${utmLine}`         : null,
    fbclid   ? `**fbclid:** \`${esc(fbclid)}\``     : null,
    gclid    ? `**gclid:** \`${esc(gclid)}\``       : null,
    referrer ? `**Referrer:** ${esc(referrer)}`     : null,
  ].filter(Boolean).join('\n');

  const trelloParams = new URLSearchParams({
    key:   TRELLO_API_KEY,
    token: TRELLO_TOKEN,
    idList: TRELLO_LIST_ID,
    name:  cardName,
    desc:  cardDesc,
    pos:   'top',
  });

  let trelloOk = false;
  let trelloCardUrl = null;
  try {
    const r = await fetch(`https://api.trello.com/1/cards?${trelloParams.toString()}`, {
      method: 'POST',
    });
    if (r.ok) {
      const data = await r.json();
      trelloOk = true;
      trelloCardUrl = data.shortUrl || data.url || null;
    } else {
      // não interrompe o fluxo — WhatsApp continua funcionando mesmo se Trello falhar
      console.error('Trello falhou', r.status, await r.text().catch(() => ''));
    }
  } catch (err) {
    console.error('Trello exception', err && err.message);
  }

  // ============ Monta URL do WhatsApp com contexto rico ============
  const waLines = [
    `Oi Paulo, preenchi o formulário sobre ${svc.wa_ctx}.`,
    ``,
    `*Nome:* ${nome}`,
    `*E-mail:* ${email}`,
    `*WhatsApp:* ${whats}`,
  ];
  if (cidade)      waLines.push(`*Cidade/UF:* ${cidade}`);
  if (empresa)     waLines.push(`*Empresa/Segmento:* ${empresa}`);
  if (faturamento) waLines.push(`*Faturamento mensal:* ${faturamento}`);
  if (objetivo)    waLines.push(``, `*Objetivo:* ${objetivo}`);

  const waMessage = waLines.join('\n');
  const waUrl = `https://wa.me/${WHATS_NUMBER}?text=${encodeURIComponent(waMessage)}`;

  return res.status(200).json({
    ok: true,
    trello: trelloOk,
    trello_card: trelloCardUrl,
    whatsapp_url: waUrl,
  });
};
