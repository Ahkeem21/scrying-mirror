/* oracle.js — snapshot → Claude API. Fully isolated: Silent mode never
   touches this file's network code. Exposes window.Oracle.consult(). */

(function () {
  'use strict';

  const SYSTEM = `You are the voice of a scrying mirror. You are shown the surface
as it appeared at the end of a gazing session. Speak what emerges: 2-4
short lines, first person plural or impersonal ("we see...", "there is...").
Concrete images, never interpretations or advice. Never mention ink, smoke,
video, or that this is generated. Ambiguity is the point. End without
resolution.`;

  /**
   * @param {string} imageBase64 - jpeg base64 (no data: prefix)
   * @param {string|null} question - included only if user opted in
   * @param {string} apiKey
   * @returns {Promise<string[]>} lines of the reading
   * @throws on any failure — caller falls back to Silent mode
   */
  async function consult(imageBase64, question, apiKey) {
    const content = [
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
      },
    ];
    if (question) {
      content.push({ type: 'text', text: `The question held was: ${question}` });
    } else {
      content.push({ type: 'text', text: 'Speak what emerges.' });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system: SYSTEM,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!res.ok) throw new Error('oracle unreachable: ' + res.status);

    const data = await res.json();
    if (data.stop_reason === 'refusal') throw new Error('the mirror is silent');

    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length) throw new Error('empty reading');
    return lines;
  }

  window.Oracle = { consult };
})();
