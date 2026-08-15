const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;
const buckets = new Map();

const TASKS = {
  profile_summary: [180, 'Write a warm two-sentence skincare profile summary in plain text. Do not diagnose, name medical conditions, recommend brands, or claim certainty.'],
  product_search: [400, 'Identify skincare products from the search phrase. Return ONLY a JSON array of up to 4 objects with string fields name, brand, type, and icon. icon must be ti-droplet, ti-sparkles, ti-sun, ti-leaf, or ti-shield. No markdown.'],
  ingredient_analysis: [900, 'Act as a cautious cosmetic-ingredient educator. Explain likely functions and suitability using qualified language. Never call ingredients safe, unsafe, toxic, or guaranteed. Encourage patch testing and professional advice for pregnancy, medication, allergies, or clinical concerns. No brand recommendations. Stay under 350 words.'],
  ingredient_alternatives: [500, 'Suggest 2-3 ingredient types, never brands or exact products. Explain why each may suit the supplied profile using qualified language. Be concise.'],
  skin_analysis: [900, 'Describe only visible, non-clinical skincare observations using appears, may, and could. Never diagnose or name a medical condition. Give 2-3 priorities and ingredient types, no brands. Recommend a qualified professional for concerns. Stay under 350 words.'],
  routine: [1200, 'Build a cautious practical AM/PM skincare routine from the supplied profile and preferences. Use qualified language, introduce one active at a time, include patch testing, finish AM with SPF and PM with moisturiser, and avoid diagnosis. Never invent brands or exact SKUs. For pregnancy or breastfeeding, avoid retinoids and hydroquinone and advise checking actives with a qualified healthcare professional.'],
};

function clientKey(req) {
  const value = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  return (Array.isArray(value) ? value[0] : value).split(',')[0].trim();
}

function rateLimited(key) {
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) return true;
  recent.push(now);
  buckets.set(key, recent);
  return false;
}

function validContent(content) {
  if (typeof content === 'string') return content.length > 0 && content.length <= 12_000;
  if (!Array.isArray(content) || content.length < 1 || content.length > 3) return false;
  return content.every((part) => part?.type === 'text'
    ? typeof part.text === 'string' && part.text.length <= 12_000
    : part?.type === 'image' && part.source?.type === 'base64' &&
      ['image/jpeg', 'image/png', 'image/webp'].includes(part.source.media_type) &&
      typeof part.source.data === 'string' && part.source.data.length <= 4_000_000);
}

function validMessages(messages) {
  return Array.isArray(messages) && messages.length >= 1 && messages.length <= 3 &&
    messages.every((message) => message?.role === 'user' && validContent(message.content));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI service is not configured' });
  if (Buffer.byteLength(JSON.stringify(req.body || {})) > 4_500_000) return res.status(413).json({ error: 'Request too large' });
  if (rateLimited(clientKey(req))) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests. Please wait and try again.' });
  }

  const { messages } = req.body || {};
  const task = req.body?.task || (typeof req.body?.system === 'string' && req.body.system.startsWith('Return ONLY a JSON array') ? 'product_search' : '');
  const config = TASKS[task];
  if (!config || !validMessages(messages)) return res.status(400).json({ error: 'Invalid request' });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: config[0], system: config[1], messages }),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('Anthropic API error', { status: response.status, type: data.error?.type });
      return res.status(502).json({ error: 'AI service request failed' });
    }
    if (task === 'product_search') {
      try {
        const products = JSON.parse(data.content?.[0]?.text || '[]').slice(0, 4).map((product) => ({
          name: String(product.name || '').replace(/[<>"'`]/g, '').slice(0, 100),
          brand: String(product.brand || '').replace(/[<>"'`]/g, '').slice(0, 80),
          type: String(product.type || '').replace(/[<>"'`]/g, '').slice(0, 80),
          icon: ['ti-droplet', 'ti-sparkles', 'ti-sun', 'ti-leaf', 'ti-shield'].includes(product.icon) ? product.icon : 'ti-droplet',
        }));
        data.content[0].text = JSON.stringify(products);
      } catch {
        return res.status(502).json({ error: 'Invalid product search response' });
      }
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error('AI service error', { name: error.name });
    return res.status(error.name === 'AbortError' ? 504 : 500).json({ error: 'AI service unavailable' });
  } finally {
    clearTimeout(timeout);
  }
}
