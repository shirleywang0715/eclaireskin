export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, system, max_tokens = 1000 } = req.body;

  if (!messages) {
    return res.status(400).json({ error: 'Missing messages' });
  }

  // Log what we received (without sensitive data)
  console.log('Request received, message count:', messages.length);
  console.log('API key present:', !!process.env.ANTHROPIC_API_KEY);
  console.log('API key prefix:', process.env.ANTHROPIC_API_KEY?.slice(0, 12));

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens,
        system,
        messages,
      }),
    });

    const data = await response.json();
    console.log('Anthropic response status:', response.status);

    if (!response.ok) {
      console.error('Anthropic API error:', JSON.stringify(data));
      return res.status(response.status).json({ error: data.error?.message || 'API error' });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Server error:', error.message, error.stack);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
