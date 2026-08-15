const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.LOOPS_API_KEY) return res.status(503).json({ error: 'Email service is not configured' });
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const source = ['post_quiz', 'me_tab', 'landing'].includes(req.body?.source) ? req.body.source : 'unknown';
  if (email.length > 254 || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email' });
  try {
    const response = await fetch('https://app.loops.so/api/v1/contacts/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LOOPS_API_KEY}` },
      body: JSON.stringify({ email, source, userGroup: 'early-access' }),
    });
    if (!response.ok) {
      console.error('Loops API error', { status: response.status });
      return res.status(502).json({ error: 'Email signup failed' });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Email service error', { name: error.name });
    return res.status(500).json({ error: 'Email service unavailable' });
  }
}
