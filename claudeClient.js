const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
const COOKIES_PATH = path.resolve(__dirname, 'cookies.json');

// ========== LOAD COOKIES ==========
function loadCookies() {
  const raw = process.env.CLAUDE_COOKIES || fs.readFileSync(COOKIES_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : parsed?.cookies || [];
  const valid = list.filter(c => c?.name && typeof c.value === 'string');
  
  if (!valid.some(c => c.name === 'sessionKey')) {
    throw new Error('sessionKey tidak ditemukan. Pastikan cookies valid.');
  }
  
  return {
    header: valid.map(c => `${c.name}=${c.value}`).join('; '),
    deviceId: valid.find(c => c.name === 'anthropic-device-id')?.value || '',
  };
}

// ========== FETCH ORG ID ==========
async function fetchOrgId(auth) {
  const res = await fetch('https://claude.ai/api/organizations', {
    headers: {
      'Accept': 'application/json',
      'User-Agent': UA,
      'Cookie': auth.header,
    },
  });
  const data = await res.json();
  const org = Array.isArray(data) ? data[0] : data;
  return String(org?.uuid || org?.id);
}

// ========== BUILD PAYLOAD ==========
function buildPayload({ prompt, model, thinking }) {
  const thinkingOn = thinking !== 'none';
  return {
    prompt,
    model,
    timezone: 'Asia/Makassar',
    locale: 'id-ID',
    tools: [],
    attachments: [],
    files: [],
    sync_sources: [],
    rendering_mode: 'messages',
    effort: thinkingOn ? thinking : 'low',
    thinking_mode: thinkingOn ? 'extended' : 'off',
    turn_message_uuids: {
      human_message_uuid: crypto.randomUUID(),
      assistant_message_uuid: crypto.randomUUID(),
    },
    personalized_styles: [{
      type: 'default',
      key: 'Default',
      name: 'Normal',
      nameKey: 'normal_style_name',
      prompt: 'Normal\n',
      summary: 'Default responses from Claude',
      summaryKey: 'normal_style_summary',
      isDefault: true,
    }],
    create_conversation_params: {
      name: '',
      model,
      include_conversation_preferences: true,
      paprika_mode: null,
      compass_mode: null,
      is_temporary: false,
      enabled_imagine: true,
      tool_search_mode: 'auto',
    },
  };
}

// ========== ASK CLAUDE ==========
async function askClaude({ prompt, model, thinking, system }) {
  const auth = loadCookies();
  const orgId = await fetchOrgId(auth);
  const convId = crypto.randomUUID();
  
  // Gabungkan system prompt + user prompt
  const fullPrompt = system 
    ? `${system}\n\nUSER REQUEST:\n${prompt}` 
    : prompt;

  const url = `https://claude.ai/api/organizations/${orgId}/chat_conversations/${convId}/completion`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'text/event-stream',
      'Content-Type': 'application/json',
      'Origin': 'https://claude.ai',
      'Referer': 'https://claude.ai/new',
      'User-Agent': UA,
      'Cookie': auth.header,
      ...(auth.deviceId ? { 'anthropic-device-id': auth.deviceId } : {}),
    },
    body: JSON.stringify(buildPayload({ prompt: fullPrompt, model, thinking })),
  });

  const body = await res.text();
  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${body.slice(0, 300)}`);

  // Parse SSE
  let text = '';
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data: ')) continue;
    const chunk = line.slice(6).trim();
    if (!chunk || chunk === '[DONE]') continue;
    try {
      const evt = JSON.parse(chunk);
      if (evt.delta?.type === 'text_delta' && typeof evt.delta.text === 'string') {
        text += evt.delta.text;
      } else if (evt.content_block?.type === 'text' && typeof evt.content_block.text === 'string') {
        text += evt.content_block.text;
      }
    } catch {}
  }
  
  return text;
}

module.exports = { askClaude };
