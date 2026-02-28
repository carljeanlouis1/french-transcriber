export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const language = formData.get('language') || 'fr';

    if (!file) {
      return new Response('No audio file provided', { status: 400 });
    }

    // Forward to OpenAI Whisper API
    const whisperForm = new FormData();
    whisperForm.append('file', file, 'recording.webm');
    whisperForm.append('model', 'whisper-1');
    whisperForm.append('language', language);
    whisperForm.append('response_format', 'json');

    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: whisperForm,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Whisper API error:', errText);
      return new Response(`Whisper API error: ${resp.status}`, { status: 502 });
    }

    const data = await resp.json();
    
    return new Response(JSON.stringify({ text: data.text }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Transcribe error:', err);
    return new Response(`Server error: ${err.message}`, { status: 500 });
  }
}
