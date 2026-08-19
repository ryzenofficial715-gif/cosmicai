const express = require('express');
const cors = require('cors');
const { askClaude } = require('./claudeClient');
const { SYSTEM_PROMPT, MODEL_MAP, DEFAULT_MODEL, DEFAULT_THINKING } = require('./config');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== API CHAT ==========
app.post('/api/chat', async (req, res) => {
  try {
    const { 
      prompt, 
      model = DEFAULT_MODEL, 
      thinking = DEFAULT_THINKING,
      system = SYSTEM_PROMPT 
    } = req.body;

    if (!prompt) return res.status(400).json({ error: 'Prompt wajib' });

    // Resolve model alias
    const resolvedModel = MODEL_MAP[model] || model;

    const response = await askClaude({ 
      prompt, 
      model: resolvedModel, 
      thinking, 
      system 
    });

    res.json({ success: true, response, model: resolvedModel });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== API MODELS ==========
app.get('/api/models', (req, res) => {
  res.json({
    models: [
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'Anthropic' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'Anthropic' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', provider: 'Anthropic' },
    ],
  });
});

// ========== API SYSTEM PROMPT ==========
app.get('/api/system-prompt', (req, res) => {
  res.json({ systemPrompt: SYSTEM_PROMPT });
});

// ========== EXPORT UNTUK VERCEL ==========
module.exports = app;

// ========== LOCAL DEV ==========
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Cosmic AI running on http://localhost:${PORT}`);
  });
}
