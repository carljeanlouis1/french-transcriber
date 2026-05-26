export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const submittedFileName = formData.get('fileName');
    const language = formData.get('language') || 'fr';
    const outputMode = normalizeOutputMode(formData.get('outputMode'));

    if (!file) {
      return new Response('No audio file provided', { status: 400 });
    }

    const fileName = sanitizeAudioFileName(submittedFileName || file.name || 'recording.webm');
    const provider = shouldUseDeepgram(language, env) ? 'deepgram' : 'openai';
    const result = provider === 'deepgram'
      ? await transcribeWithDeepgram(file, fileName, language, env)
      : await transcribeWithOpenAI(file, fileName, language, env);

    const originalText = result.text || '';
    const englishText = await getEnglishText(originalText, language, outputMode, env);
    const text = formatOutputText(originalText, englishText, outputMode, language);

    return jsonResponse({
      text,
      originalText,
      englishText,
      sourceLanguage: language,
      outputMode,
      provider,
      model: result.model,
    });

  } catch (err) {
    console.error('Transcribe error:', err);
    return new Response(`Server error: ${err.message}`, { status: 500 });
  }
}

function shouldUseDeepgram(language, env) {
  // Nova-3 is the stronger production choice for French and English.
  // Keep OpenAI Whisper fallback for Haitian Kreyòl because Deepgram language
  // coverage can vary and Whisper has broader multilingual support.
  return Boolean(env.DEEPGRAM_API_KEY) && ['fr', 'en'].includes(language);
}

async function transcribeWithDeepgram(file, fileName, language, env) {
  const params = new URLSearchParams({
    model: 'nova-3',
    language,
    smart_format: 'true',
    punctuate: 'true',
  });

  const resp = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${env.DEEPGRAM_API_KEY}`,
      'Content-Type': file.type || guessContentType(fileName),
    },
    body: await file.arrayBuffer(),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('Deepgram API error:', errText);
    throw new Error(`Deepgram API error: ${resp.status}`);
  }

  const data = await resp.json();
  const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  return { text: transcript, model: 'deepgram-nova-3' };
}

async function transcribeWithOpenAI(file, fileName, language, env) {
  if (!env.OPENAI_API_KEY) {
    throw new Error('No transcription API key configured');
  }

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
    throw new Error(`Whisper API error: ${resp.status}`);
  }

  const data = await resp.json();
  return { text: data.text || '', model: 'openai-whisper-1' };
}

async function getEnglishText(originalText, language, outputMode, env) {
  if (!originalText || outputMode === 'original') {
    return '';
  }

  if (language === 'en') {
    return originalText;
  }

  return translateToEnglish(originalText, language, env);
}

async function translateToEnglish(text, sourceLanguage, env) {
  if (!env.OPENAI_API_KEY) {
    throw new Error('English translation requested but OPENAI_API_KEY is not configured');
  }

  const languageNames = {
    fr: 'French',
    ht: 'Haitian Creole',
    en: 'English',
  };

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `Translate the user's ${languageNames[sourceLanguage] || sourceLanguage} transcript into natural English. Preserve meaning, names, numbers, paragraph breaks, and speaker wording. Do not summarize, explain, or add commentary.`,
        },
        { role: 'user', content: text },
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('OpenAI translation error:', errText);
    throw new Error(`OpenAI translation error: ${resp.status}`);
  }

  const data = await resp.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

function formatOutputText(originalText, englishText, outputMode, language) {
  if (outputMode === 'english') {
    return englishText || originalText;
  }

  if (outputMode === 'both') {
    const originalLabel = language === 'fr' ? 'Transcription française' : 'Original transcript';
    return `${originalLabel}\n\n${originalText}\n\nEnglish translation\n\n${englishText || originalText}`;
  }

  return originalText;
}

function normalizeOutputMode(outputMode) {
  return ['original', 'english', 'both'].includes(outputMode) ? outputMode : 'original';
}

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function sanitizeAudioFileName(fileName) {
  const safeName = String(fileName)
    .split(/[\\/]/)
    .pop()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);

  return safeName || 'audio-upload.webm';
}

function guessContentType(fileName) {
  const ext = String(fileName).split('.').pop().toLowerCase();
  const types = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    wav: 'audio/wav',
    webm: 'audio/webm',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
  };

  return types[ext] || 'application/octet-stream';
}
