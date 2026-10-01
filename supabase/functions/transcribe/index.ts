const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'POST an audio file.' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const token = Deno.env.get('HF_TOKEN')
  if (!token) return new Response(JSON.stringify({ error: 'HF_TOKEN is not configured.' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  const form = await request.formData()
  const audio = form.get('audio')
  if (!(audio instanceof File)) return new Response(JSON.stringify({ error: 'The request must include an audio file.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const result = await fetch('https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3-turbo', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': audio.type || 'application/octet-stream' },
    body: await audio.arrayBuffer(),
  })
  const body = await result.text()
  if (!result.ok) return new Response(JSON.stringify({ error: `Transcription provider error: ${body.slice(0, 500)}` }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  const data = JSON.parse(body) as { text?: string }
  return new Response(JSON.stringify({ text: data.text ?? '' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
