export default async function handler(req, res) {
  if (req.method !== 'POST') {
  res.setHeader('Allow', 'POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
  
  const { email } = req.body;
  console.log('Email received:', email);
  console.log('API key exists:', !!process.env.LOOPS_API_KEY);

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  try {
    const r = await fetch('https://app.loops.so/api/v1/contacts/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LOOPS_API_KEY}`
      },
      body: JSON.stringify({
        email,
        source: 'post-quiz',
        userGroup: 'early-access'
      })
    });

    const data = await r.json();
    console.log('Loops response status:', r.status);
    console.log('Loops response:', JSON.stringify(data));
    
    if (!r.ok) return res.status(500).json({ error: data.message || 'Failed' });
    return res.status(200).json({ success: true });
  } catch (e) {
    console.log('Catch error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
