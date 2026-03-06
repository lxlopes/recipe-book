import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js';
import { getDatabase, ref, push, set, onValue, remove, update }
  from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-database.js';

// ============================================================
// CONFIG
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyAf9D-jeNf6Gfy7fqVedLHKnd7IaAGzzck",
  authDomain: "recipe-book-9968d.firebaseapp.com",
  databaseURL: "https://recipe-book-9968d-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "recipe-book-9968d",
  storageBucket: "recipe-book-9968d.firebasestorage.app",
  messagingSenderId: "404542514103",
  appId: "1:404542514103:web:f7c6d4b54f215d59ffbe32"
};
const WORKER_URL = 'https://recipe-proxy.luislopes.workers.dev';

// ============================================================
// CONSTANTS
// ============================================================
const CATEGORIES = {
  breakfast: { en: 'Breakfast',    pt: 'Pequeno-almo\u00e7o' },
  main:      { en: 'Main Course',  pt: 'Prato Principal' },
  dessert:   { en: 'Dessert',      pt: 'Sobremesa' },
  snack:     { en: 'Snack',        pt: 'Snack' },
  drinks:    { en: 'Drinks',       pt: 'Bebidas' },
  other:     { en: 'Other',        pt: 'Outro' },
};

const LABELS = {
  en: {
    ingredients: 'Ingredients',
    steps: 'Steps',
    notes: 'Notes',
    allCat: 'All',
    min: 'min',
    servings: 'servings',
    source: 'Web Recipe',
    igSource: 'Instagram',
    viewOriginal: 'View original recipe',
    viewInstagram: 'View on Instagram',
    addedBy: 'Added by',
    noCaption: 'This post has no recipe in the caption. The recipe must be written in the Instagram caption to be extracted.',
    igFallback: 'Could not auto-extract. Paste the caption below and click Parse:',
    extracted: 'Recipe extracted! Review and adjust before saving.',
    igExtracted: 'Instagram recipe extracted! Review and adjust before saving.',
    translating: 'Translating and saving...',
    networkError: 'Network error. Check your connection and try again.',
    limitReached: 'Daily extraction limit reached. Add the recipe manually.',
    extractError: 'Could not extract recipe. Try filling it in manually.',
  },
  pt: {
    ingredients: 'Ingredientes',
    steps: 'Passos',
    notes: 'Notas',
    allCat: 'Todos',
    min: 'min',
    servings: 'por\u00e7\u00f5es',
    source: 'Receita Web',
    igSource: 'Instagram',
    viewOriginal: 'Ver receita original',
    viewInstagram: 'Ver no Instagram',
    addedBy: 'Adicionado por',
    noCaption: 'Esta publica\u00e7\u00e3o n\u00e3o tem receita na legenda. A receita precisa estar escrita na legenda do Instagram.',
    igFallback: 'N\u00e3o foi poss\u00edvel extrair. Cole a legenda abaixo e clique em Analisar:',
    extracted: 'Receita extra\u00edda! Reveja antes de guardar.',
    igExtracted: 'Receita do Instagram extra\u00edda! Reveja antes de guardar.',
    translating: 'A traduzir e guardar...',
    networkError: 'Erro de rede. Verifique a liga\u00e7\u00e3o.',
    limitReached: 'Limite di\u00e1rio atingido. Adicione a receita manualmente.',
    extractError: 'N\u00e3o foi poss\u00edvel extrair. Tente preencher manualmente.',
  },
};

// ============================================================
// STATE
// ============================================================
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);

let currentUser = null;
let allRecipes = {};
let editingRecipeId = null;
let currentCategory = 'all';
let currentLang = localStorage.getItem('recipeLang') || 'pt';
let extractedBilingual = null; // full bilingual data from last URL extraction

// ============================================================
// HELPERS
// ============================================================
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Get recipe content in the current language, with backward compat for old flat recipes
function getRD(recipe, lang) {
  const l = lang || currentLang;
  if (recipe[l]) return recipe[l];
  if (recipe.en) return recipe.en;
  return {
    title: recipe.title || '',
    servings: recipe.servings || null,
    readyInMinutes: recipe.readyInMinutes || null,
    ingredients: recipe.ingredients || [],
    steps: recipe.steps || [],
    notes: recipe.notes || '',
  };
}

function lbl(key) {
  return LABELS[currentLang][key] || LABELS.en[key] || key;
}


// ============================================================
// VIEW ROUTING
// ============================================================
function showView(name) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.classList.add('hidden');
  });
  const target = document.getElementById(`view-${name}`);
  target.classList.remove('hidden');
  target.classList.add('active');
  window.scrollTo(0, 0);
}

// ============================================================
// LANGUAGE TOGGLE
// ============================================================
function applyLanguage() {
  const isEN = currentLang === 'en';
  document.getElementById('langBtn').textContent = isEN ? 'PT' : 'EN';
  document.getElementById('langBtnDetail').textContent = isEN ? 'PT' : 'EN';
  document.getElementById('lbl-ingredients').textContent = lbl('ingredients');
  document.getElementById('lbl-steps').textContent = lbl('steps');
  document.getElementById('lbl-notes').textContent = lbl('notes');
  renderCategoryFilters();
  renderGrid(getFilteredRecipes());
  // If detail view is open, re-render it
  if (document.getElementById('view-detail').classList.contains('active') && editingRecipeId === null) {
    const detailTitle = document.getElementById('d-title');
    if (detailTitle._recipeId) openDetail(detailTitle._recipeId);
  }
}

function toggleLanguage() {
  currentLang = currentLang === 'pt' ? 'en' : 'pt';
  localStorage.setItem('recipeLang', currentLang);
  applyLanguage();
}

document.getElementById('langBtn').addEventListener('click', toggleLanguage);
document.getElementById('langBtnDetail').addEventListener('click', () => {
  toggleLanguage();
  // re-open detail with new language
  const id = document.getElementById('d-title')._recipeId;
  if (id) openDetail(id);
});

// ============================================================
// AUTH
// ============================================================
onAuthStateChanged(auth, user => {
  currentUser = user;
  if (user) {
    showView('list');
    loadRecipes();
  } else {
    showView('login');
    allRecipes = {};
  }
});

document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('emailInput').value;
  const password = document.getElementById('passwordInput').value;
  const errorEl = document.getElementById('loginError');
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Signing in...';
  errorEl.textContent = '';
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch {
    errorEl.textContent = 'Invalid email or password.';
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
});

document.getElementById('signOutBtn').addEventListener('click', () => signOut(auth));

// ============================================================
// CATEGORY FILTERS
// ============================================================
function renderCategoryFilters() {
  const container = document.getElementById('categoryFilters');
  const all = { key: 'all', label: lbl('allCat') };
  const cats = [all, ...Object.entries(CATEGORIES).map(([k, v]) => ({ key: k, label: v[currentLang] }))];
  container.innerHTML = cats.map(c =>
    `<button class="category-chip${currentCategory === c.key ? ' active' : ''}" data-cat="${c.key}">${esc(c.label)}</button>`
  ).join('');
}

document.getElementById('categoryFilters').addEventListener('click', e => {
  const chip = e.target.closest('.category-chip');
  if (!chip) return;
  currentCategory = chip.dataset.cat;
  renderCategoryFilters();
  renderGrid(getFilteredRecipes());
});

function getFilteredRecipes() {
  let recipes = Object.values(allRecipes);
  if (currentCategory !== 'all') {
    recipes = recipes.filter(r => (r.category || 'other') === currentCategory);
  }
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if (q) {
    recipes = recipes.filter(r => {
      const rd = getRD(r);
      return (rd.title || '').toLowerCase().includes(q) ||
        (r.tags || []).some(t => t.toLowerCase().includes(q));
    });
  }
  return recipes;
}

// ============================================================
// RECIPE LIST
// ============================================================
function loadRecipes() {
  onValue(ref(db, 'recipes'), snapshot => {
    allRecipes = snapshot.val() || {};
    renderCategoryFilters();
    renderGrid(getFilteredRecipes());
  });
}

function renderGrid(recipes) {
  const grid = document.getElementById('recipeGrid');
  const empty = document.getElementById('emptyState');

  if (recipes.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  recipes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  grid.innerHTML = recipes.map(r => {
    const rd = getRD(r);
    const cat = CATEGORIES[r.category || 'other'];
    const catName = cat ? cat[currentLang] : '';
    const sourceLabel = r.sourceType === 'instagram' ? lbl('igSource') : lbl('source');
    const metaParts = [];
    if (rd.readyInMinutes) metaParts.push(`${rd.readyInMinutes} ${lbl('min')}`);
    if (rd.servings) metaParts.push(`${rd.servings} ${lbl('servings')}`);

    return `
      <div class="recipe-card" data-id="${r.id}">
        ${r.image
          ? `<img class="recipe-card-img" src="${esc(r.image)}" alt="${esc(rd.title)}" onerror="this.style.display='none'">`
          : `<div class="recipe-card-img-placeholder"></div>`
        }
        <div class="recipe-card-body">
          <div class="recipe-card-title">${esc(rd.title)}</div>
          <div class="recipe-card-meta">${esc(metaParts.join(' \u00b7 '))}</div>
          <div class="tags-row">
            ${(r.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
          </div>
          <div class="card-footer">
            <span class="category-label">${esc(catName)}</span>
            <span class="source-label">${esc(sourceLabel)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

document.getElementById('recipeGrid').addEventListener('click', e => {
  const card = e.target.closest('.recipe-card');
  if (card) openDetail(card.dataset.id);
});

document.getElementById('searchInput').addEventListener('input', () => {
  renderGrid(getFilteredRecipes());
});

document.getElementById('addRecipeBtn').addEventListener('click', showAddView);

// ============================================================
// ADD / EDIT VIEW
// ============================================================
function showAddView() {
  editingRecipeId = null;
  resetForm();
  document.getElementById('addViewTitle').textContent = 'Add Recipe';
  document.getElementById('saveBtn').textContent = 'Save Recipe';
  showView('add');
}

function showEditView(id) {
  const r = allRecipes[id];
  if (!r) return;
  editingRecipeId = id;
  extractedBilingual = null;
  resetForm();
  document.getElementById('addViewTitle').textContent = 'Edit Recipe';
  document.getElementById('saveBtn').textContent = 'Update Recipe';

  const rd = getRD(r);
  document.getElementById('urlInput').value = r.sourceUrl || '';
  document.getElementById('f-title').value = rd.title || '';
  document.getElementById('f-image').value = r.image || '';
  document.getElementById('f-category').value = r.category || 'other';
  document.getElementById('f-servings').value = rd.servings || '';
  document.getElementById('f-time').value = rd.readyInMinutes || '';
  document.getElementById('f-ingredients').value = (rd.ingredients || []).join('\n');
  document.getElementById('f-steps').value = (rd.steps || []).join('\n');
  document.getElementById('f-notes').value = rd.notes || '';
  document.getElementById('f-tags').value = (r.tags || []).join(', ');
  document.getElementById('f-sourceUrl').value = r.sourceUrl || '';
  document.getElementById('f-sourceType').value = r.sourceType || 'website';
  showView('add');
}

function resetForm() {
  document.getElementById('urlInput').value = '';
  document.getElementById('recipeForm').reset();
  document.getElementById('f-category').value = 'other';
  document.getElementById('f-sourceUrl').value = '';
  document.getElementById('f-sourceType').value = 'website';
  setExtractMsg('', '');
  document.getElementById('captionPasteBox')?.remove();
  extractedBilingual = null;
}

document.getElementById('backFromAddBtn').addEventListener('click', () => showView('list'));

// ── URL extraction ────────────────────────────────────────────
document.getElementById('extractBtn').addEventListener('click', async () => {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) return;
  await extractFromUrl(url);
});

async function extractFromUrl(url) {
  const btn = document.getElementById('extractBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Extracting...';
  setExtractMsg('', '');

  try {
    const res = await fetch(`${WORKER_URL}?url=${encodeURIComponent(url)}`);

    if (res.status === 402) {
      setExtractMsg(lbl('limitReached'), 'error');
      return;
    }
    if (res.status === 422) {
      const data = await res.json().catch(() => ({}));
      if (data.error === 'no_caption') {
        setExtractMsg(lbl('noCaption'), 'error');
      } else {
        showCaptionPasteUI(url);
      }
      return;
    }
    if (!res.ok) {
      const isInstagram = url.includes('instagram.com') || url.includes('instagr.am');
      if (isInstagram) {
        showCaptionPasteUI(url);
      } else {
        setExtractMsg(lbl('extractError'), 'error');
      }
      return;
    }

    const data = await res.json();
    extractedBilingual = data;

    const rd = getRD(data);
    document.getElementById('f-title').value = rd.title || '';
    document.getElementById('f-image').value = data.image || '';
    document.getElementById('f-category').value = data.category || 'other';
    document.getElementById('f-servings').value = rd.servings || '';
    document.getElementById('f-time').value = rd.readyInMinutes || '';
    document.getElementById('f-ingredients').value = (rd.ingredients || []).join('\n');
    document.getElementById('f-steps').value = (rd.steps || []).join('\n');
    document.getElementById('f-notes').value = rd.notes || '';
    document.getElementById('f-sourceUrl').value = url;
    document.getElementById('f-sourceType').value = data.type === 'instagram' ? 'instagram' : 'website';

    const msg = data.type === 'instagram' ? lbl('igExtracted') : lbl('extracted');
    setExtractMsg(msg, 'success');

  } catch {
    setExtractMsg(lbl('networkError'), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Extract';
  }
}

// Caption paste fallback (if Instagram auto-extract fails)
function showCaptionPasteUI(url) {
  setExtractMsg(lbl('igFallback'), 'info');
  document.getElementById('captionPasteBox')?.remove();

  const box = document.createElement('div');
  box.id = 'captionPasteBox';
  box.style.cssText = 'margin-top:0.75rem; display:flex; flex-direction:column; gap:0.5rem;';
  box.innerHTML = `
    <textarea id="captionInput" rows="8"
      placeholder="Open the Instagram post, tap ... and Copy caption, then paste here..."
      style="width:100%; padding:0.75rem; border:1.5px solid #e8e0d8; border-radius:12px; font-family:inherit; font-size:0.9rem; resize:vertical;"></textarea>
    <button id="parseCaptionBtn" class="btn-primary">Parse Caption</button>
  `;
  document.getElementById('extractMessage').after(box);

  document.getElementById('parseCaptionBtn').addEventListener('click', async () => {
    const caption = document.getElementById('captionInput').value.trim();
    if (!caption) return;

    const parseBtn = document.getElementById('parseCaptionBtn');
    parseBtn.disabled = true;
    parseBtn.innerHTML = '<span class="spinner"></span>Parsing...';

    try {
      const res = await fetch(`${WORKER_URL}?action=parse-caption&caption=${encodeURIComponent(caption)}`);
      if (!res.ok) throw new Error('AI failed');
      const data = await res.json();
      extractedBilingual = data;

      const rd = getRD(data);
      document.getElementById('f-title').value = rd.title || '';
      document.getElementById('f-category').value = data.category || 'other';
      document.getElementById('f-servings').value = rd.servings || '';
      document.getElementById('f-time').value = rd.readyInMinutes || '';
      document.getElementById('f-ingredients').value = (rd.ingredients || []).join('\n');
      document.getElementById('f-steps').value = (rd.steps || []).join('\n');
      document.getElementById('f-notes').value = rd.notes || '';
      document.getElementById('f-sourceUrl').value = url;
      document.getElementById('f-sourceType').value = 'instagram';
      box.remove();
      setExtractMsg(lbl('igExtracted'), 'success');
    } catch {
      parseBtn.disabled = false;
      parseBtn.textContent = 'Parse Caption';
      setExtractMsg('Parsing failed. Try again.', 'error');
    }
  });
}

function setExtractMsg(text, type) {
  const el = document.getElementById('extractMessage');
  el.textContent = text;
  el.className = `extract-msg ${type}`;
}

// ── Save recipe ───────────────────────────────────────────────
document.getElementById('recipeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;

  const title       = document.getElementById('f-title').value.trim();
  const image       = document.getElementById('f-image').value.trim();
  const category    = document.getElementById('f-category').value || 'other';
  const servings    = parseInt(document.getElementById('f-servings').value) || null;
  const readyInMin  = parseInt(document.getElementById('f-time').value) || null;
  const ingredients = document.getElementById('f-ingredients').value.split('\n').map(s => s.trim()).filter(Boolean);
  const steps       = document.getElementById('f-steps').value.split('\n').map(s => s.trim()).filter(Boolean);
  const notes       = document.getElementById('f-notes').value.trim();
  const tags        = document.getElementById('f-tags').value.split(',').map(s => s.trim()).filter(Boolean);
  const sourceUrl   = document.getElementById('f-sourceUrl').value.trim();
  const sourceType  = document.getElementById('f-sourceType').value || 'website';

  try {
    if (editingRecipeId) {
      // Edit: update only the current language version + shared fields
      const langData = { title, servings, readyInMinutes: readyInMin, ingredients, steps, notes };
      await update(ref(db, `recipes/${editingRecipeId}`), {
        [`${currentLang}`]: langData,
        category, image, tags, sourceUrl, sourceType,
      });
    } else {
      // New recipe
      let bilingualData;

      if (extractedBilingual && (extractedBilingual.en || extractedBilingual.pt)) {
        // We have bilingual data from extraction — merge form edits into current language
        bilingualData = { ...extractedBilingual };
        bilingualData[currentLang] = {
          ...(bilingualData[currentLang] || {}),
          title, servings, readyInMinutes: readyInMin, ingredients, steps, notes,
        };
      } else {
        // Manual entry — translate via worker
        btn.innerHTML = `<span class="spinner"></span>${lbl('translating')}`;
        try {
          const res = await fetch(`${WORKER_URL}?action=translate-recipe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, servings, readyInMinutes: readyInMin, ingredients, steps, notes }),
          });
          if (res.ok) {
            bilingualData = await res.json();
            // Use form values for current language (more accurate than AI rephrase)
            bilingualData[currentLang] = { title, servings, readyInMinutes: readyInMin, ingredients, steps, notes };
          }
        } catch {
          // Translation failed — save current language only
        }
        if (!bilingualData) {
          bilingualData = {
            category,
            [currentLang]: { title, servings, readyInMinutes: readyInMin, ingredients, steps, notes },
          };
        }
      }

      const newRef = push(ref(db, 'recipes'));
      await set(newRef, {
        id: newRef.key,
        createdAt: Date.now(),
        addedBy: currentUser.email,
        image,
        category: bilingualData.category || category,
        tags,
        sourceUrl,
        sourceType,
        en: bilingualData.en || null,
        pt: bilingualData.pt || null,
      });
    }
    showView('list');
  } catch {
    alert('Error saving recipe. Please try again.');
    btn.disabled = false;
    btn.textContent = editingRecipeId ? 'Update Recipe' : 'Save Recipe';
  }
});

// ============================================================
// DETAIL VIEW
// ============================================================
function openDetail(id) {
  const r = allRecipes[id];
  if (!r) return;

  const rd = getRD(r);
  document.getElementById('d-title')._recipeId = id;

  const img = document.getElementById('d-image');
  if (r.image) {
    img.src = r.image;
    img.style.display = 'block';
    img.onerror = () => { img.style.display = 'none'; };
  } else {
    img.style.display = 'none';
  }

  document.getElementById('d-source-badge').textContent =
    r.sourceType === 'instagram' ? lbl('igSource') : lbl('source');

  const cat = CATEGORIES[r.category || 'other'];
  document.getElementById('d-category-badge').textContent = cat ? cat[currentLang] : '';

  document.getElementById('d-title').textContent = rd.title || '';

  const meta = [];
  if (rd.readyInMinutes) meta.push(`${rd.readyInMinutes} ${lbl('min')}`);
  if (rd.servings) meta.push(`${rd.servings} ${lbl('servings')}`);
  document.getElementById('d-meta').innerHTML = meta.map(m => `<span>${esc(m)}</span>`).join('');

  document.getElementById('d-tags').innerHTML =
    (r.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');

  document.getElementById('d-ingredients').innerHTML =
    (rd.ingredients || []).map(i => `<li>${esc(i)}</li>`).join('');

  document.getElementById('d-steps').innerHTML =
    (rd.steps || []).map(s => `<li>${esc(s)}</li>`).join('');

  const notesSection = document.getElementById('d-notes-section');
  if (rd.notes) {
    document.getElementById('d-notes').textContent = rd.notes;
    notesSection.classList.remove('hidden');
  } else {
    notesSection.classList.add('hidden');
  }

  const sourceLink = document.getElementById('d-source-link');
  if (r.sourceUrl) {
    sourceLink.href = r.sourceUrl;
    sourceLink.textContent = r.sourceType === 'instagram' ? lbl('viewInstagram') : lbl('viewOriginal');
    sourceLink.classList.remove('hidden');
  } else {
    sourceLink.classList.add('hidden');
  }

  document.getElementById('d-added-by').textContent = `${lbl('addedBy')}: ${r.addedBy || 'unknown'}`;
  document.getElementById('editBtn').onclick = () => showEditView(id);
  document.getElementById('deleteBtn').onclick = () => deleteRecipe(id);

  showView('detail');
}

document.getElementById('backFromDetailBtn').addEventListener('click', () => showView('list'));

async function deleteRecipe(id) {
  if (!confirm('Delete this recipe? This cannot be undone.')) return;
  try {
    await remove(ref(db, `recipes/${id}`));
    showView('list');
  } catch {
    alert('Error deleting recipe. Please try again.');
  }
}

// ============================================================
// INIT
// ============================================================
applyLanguage();
