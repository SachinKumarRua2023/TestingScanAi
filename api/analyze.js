export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMMA_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMMA_API_KEY not configured in environment variables' });

  const { imageBase64, imageMime, prompt } = req.body;
  if (!imageBase64 || !prompt) return res.status(400).json({ error: 'Missing imageBase64 or prompt' });

  // Try Gemma 3 27B first, fallback to Gemini 2.0 Flash
  const models = [
    'gemma-3-27b-it',
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash',
  ];

  let lastError = null;

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: imageMime || 'image/jpeg', data: imageBase64 } }
              ]
            }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 2048,
            }
          })
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        lastError = `Model ${model} error ${response.status}: ${errText}`;
        continue; // try next model
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        lastError = `Model ${model} returned empty response`;
        continue;
      }

      return res.status(200).json({ text, model });

    } catch (err) {
      lastError = `Model ${model} threw: ${err.message}`;
      continue;
    }
  }

  return res.status(500).json({ error: lastError || 'All models failed' });
}