async function fetchFoodImage(title, env) {
  if (!env.PEXELS_KEY || !title) return '';
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(title + ' food recipe')}&per_page=1&orientation=landscape`,
      { headers: { Authorization: env.PEXELS_KEY } }
    );
    if (!res.ok) return '';
    const data = await res.json();
    return data.photos?.[0]?.src?.medium || '';
  } catch {
    return '';
  }
}

function extractJSON(text) {
  // Try markdown code block first
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch {}
  }
  // Walk from first { to find the outermost valid JSON object
  const start = text.indexOf('{');
  if (start === -1) throw new Error('No JSON in AI response');
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch {}
      }
    }
  }
  throw new Error('No valid JSON in AI response');
}

async function parseWithAI(caption, env) {
  const systemPrompt = `Extract a recipe from the text and return ONLY valid JSON (no markdown, no extra text):
{"category":"breakfast|main|dessert|snack|drinks|other","en":{"title":"","servings":null,"readyInMinutes":null,"ingredients":[],"steps":[],"notes":""},"pt":{"title":"","servings":null,"readyInMinutes":null,"ingredients":[],"steps":[],"notes":""}}
Rules: provide BOTH English (en) and Portuguese (pt) versions of all text fields. category is exactly one of the listed values. servings/readyInMinutes are numbers or null. Return ONLY valid JSON.`;

  const res = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: caption }],
    max_tokens: 3000,
  });
  return extractJSON(res.response || '');
}

async function translateToBI(flat, env) {
  const systemPrompt = `Translate this recipe to both English and Portuguese. Return ONLY valid JSON (no markdown, no extra text):
{"category":"breakfast|main|dessert|snack|drinks|other","en":{"title":"","servings":null,"readyInMinutes":null,"ingredients":[],"steps":[],"notes":""},"pt":{"title":"","servings":null,"readyInMinutes":null,"ingredients":[],"steps":[],"notes":""}}
Rules: translate all text fields into both en and pt. category is exactly one of the listed values. servings/readyInMinutes are numbers or null (same value in both objects). Return ONLY valid JSON.`;

  const res = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: JSON.stringify(flat) }],
    max_tokens: 3000,
  });
  return extractJSON(res.response || '');
}

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://lxlopes.github.io',
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

    // ── Get food image by title ───────────────────────────────────
    if (action === 'get-image') {
      const title = url.searchParams.get('title');
      const image = await fetchFoodImage(title, env);
      return new Response(JSON.stringify({ image }), { headers: jsonHeaders });
    }

    // ── Manual caption parse (fallback) ──────────────────────────
    if (action === 'parse-caption') {
      const caption = url.searchParams.get('caption');
      if (!caption) return new Response(JSON.stringify({ error: 'Missing caption' }), { status: 400, headers: jsonHeaders });
      try {
        return new Response(JSON.stringify(await parseWithAI(caption, env)), { headers: jsonHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'AI failed', detail: err.message }), { status: 500, headers: jsonHeaders });
      }
    }

    // ── Translate manual recipe (POST) ────────────────────────────
    if (action === 'translate-recipe' && request.method === 'POST') {
      try {
        const flat = await request.json();
        return new Response(JSON.stringify(await translateToBI(flat, env)), { headers: jsonHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Translation failed', detail: err.message }), { status: 500, headers: jsonHeaders });
      }
    }

    // ── Recipe URL extraction ──────────────────────────────────────
    const recipeUrl = url.searchParams.get('url');
    if (!recipeUrl) return new Response(JSON.stringify({ error: 'Missing url' }), { status: 400, headers: jsonHeaders });

    // Instagram: Apify to get caption, then AI to parse + translate
    if (recipeUrl.includes('instagram.com') || recipeUrl.includes('instagr.am')) {
      try {
        const apifyRes = await fetch(
          `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${env.APIFY_TOKEN}&timeout=25`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ directUrls: [recipeUrl], resultsType: 'posts', resultsLimit: 1 }),
          }
        );
        if (!apifyRes.ok) throw new Error(`Apify ${apifyRes.status}`);
        const items = await apifyRes.json();
        if (!Array.isArray(items) || !items.length) throw new Error('No results from Apify');

        const post = items[0];
        const caption = post.caption || post.text || '';
        if (!caption) {
          return new Response(JSON.stringify({ error: 'no_caption' }), { status: 422, headers: jsonHeaders });
        }

        const recipe = await parseWithAI(caption, env);
        recipe.type = 'instagram';
        recipe.image = post.displayUrl || post.thumbnailUrl ||
          await fetchFoodImage(recipe.en?.title || recipe.pt?.title, env);
        return new Response(JSON.stringify(recipe), { headers: jsonHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'instagram_error', detail: err.message }), { status: 500, headers: jsonHeaders });
      }
    }

    // Regular websites: Spoonacular + AI translation
    try {
      const spoonRes = await fetch(
        `https://api.spoonacular.com/recipes/extract?url=${encodeURIComponent(recipeUrl)}&apiKey=${env.SPOONACULAR_KEY}`
      );
      if (!spoonRes.ok) return new Response(JSON.stringify({ error: 'Extraction failed' }), { status: spoonRes.status, headers: jsonHeaders });
      const data = await spoonRes.json();

      const flat = {
        title: data.title || '',
        servings: data.servings || null,
        readyInMinutes: data.readyInMinutes || null,
        ingredients: (data.extendedIngredients || []).map(i => i.original),
        steps: (data.analyzedInstructions?.[0]?.steps || []).map(s => s.step),
        notes: '',
      };

      try {
        const bilingual = await translateToBI(flat, env);
        bilingual.image = data.image || await fetchFoodImage(data.title, env);
        bilingual.type = 'website';
        return new Response(JSON.stringify(bilingual), { headers: jsonHeaders });
      } catch {
        // Fallback: English only if translation fails
        return new Response(JSON.stringify({
          type: 'website', category: 'other',
          image: data.image || await fetchFoodImage(data.title, env),
          en: flat, pt: null,
        }), { headers: jsonHeaders });
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Extraction failed' }), { status: 500, headers: jsonHeaders });
    }
  }
};
