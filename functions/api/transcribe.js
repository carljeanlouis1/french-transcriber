export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const submittedFileName = formData.get('fileName');
    const language = formData.get('language') || 'fr';

    if (!file) {
      return new Response('No audio file provided', { status: 400 });
    }

    const fileName = sanitizeAudioFileName(submittedFileName || file.name || 'recording.webm');

    // Forward to OpenAI Whisper API
    const whisperForm = new FormData();
    whisperForm.append('file', file, fileName);
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

function sanitizeAudioFileName(fileName) {
  const safeName = String(fileName)
    .split(/[\\/]/)
    .pop()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);

  return safeName || 'audio-upload.webm';
}
