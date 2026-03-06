import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js';
import { getDatabase, ref, push, set, onValue, remove, update }
  from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-database.js';

// ============================================================
// CONFIGURATION
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
// INIT
// ============================================================
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);

let currentUser = null;
let allRecipes = {};
let editingRecipeId = null;

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
// RECIPE LIST
// ============================================================
function loadRecipes() {
  onValue(ref(db, 'recipes'), snapshot => {
    allRecipes = snapshot.val() || {};
    renderGrid(Object.values(allRecipes));
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

  grid.innerHTML = recipes.map(r => `
    <div class="recipe-card" data-id="${r.id}">
      ${r.image
        ? `<img class="recipe-card-img" src="${esc(r.image)}" alt="${esc(r.title)}" onerror="this.style.display='none'">`
        : `<div class="recipe-card-img-placeholder">ðŸ½ï¸</div>`
      }
      <div class="recipe-card-body">
        <div class="recipe-card-title">${esc(r.title)}</div>
        <div class="recipe-card-meta">
          ${r.readyInMinutes ? `â± ${r.readyInMinutes} min` : ''}
          ${r.readyInMinutes && r.servings ? ' Â· ' : ''}
          ${r.servings ? `${r.servings} servings` : ''}
        </div>
        <div class="tags-row">
          ${(r.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
        </div>
        <div class="source-icon">
          ${r.sourceType === 'instagram' ? 'ðŸ“¸ Instagram' : 'ðŸŒ Web'}
        </div>
      </div>
    </div>
  `).join('');
}

// Open detail on card click
document.getElementById('recipeGrid').addEventListener('click', e => {
  const card = e.target.closest('.recipe-card');
  if (card) openDetail(card.dataset.id);
});

// Search
document.getElementById('searchInput').addEventListener('input', e => {
  const q = e.target.value.toLowerCase().trim();
  const filtered = Object.values(allRecipes).filter(r =>
    r.title.toLowerCase().includes(q) ||
    (r.tags || []).some(t => t.toLowerCase().includes(q))
  );
  renderGrid(filtered);
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
  resetForm();
  document.getElementById('addViewTitle').textContent = 'Edit Recipe';
  document.getElementById('saveBtn').textContent = 'Update Recipe';
  document.getElementById('urlInput').value = r.sourceUrl || '';
  document.getElementById('f-title').value = r.title || '';
  document.getElementById('f-image').value = r.image || '';
  document.getElementById('f-servings').value = r.servings || '';
  document.getElementById('f-time').value = r.readyInMinutes || '';
  document.getElementById('f-ingredients').value = (r.ingredients || []).join('\n');
  document.getElementById('f-steps').value = (r.steps || []).join('\n');
  document.getElementById('f-notes').value = r.notes || '';
  document.getElementById('f-tags').value = (r.tags || []).join(', ');
  document.getElementById('f-sourceUrl').value = r.sourceUrl || '';
  document.getElementById('f-sourceType').value = r.sourceType || 'website';
  showView('add');
}

function resetForm() {
  document.getElementById('urlInput').value = '';
  document.getElementById('recipeForm').reset();
  document.getElementById('f-sourceUrl').value = '';
  document.getElementById('f-sourceType').value = 'website';
  setExtractMsg('', '');
  document.getElementById('captionPasteBox')?.remove();
}

document.getElementById('backFromAddBtn').addEventListener('click', () => showView('list'));

// URL extraction
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
      setExtractMsg('Daily extraction limit reached. Add the recipe manually.', 'error');
      return;
    }
    if (!res.ok) {
      const isInstagram = url.includes('instagram.com') || url.includes('instagr.am');
      if (isInstagram) {
        showCaptionPasteUI(url);
      } else {
        setExtractMsg('Could not extract recipe. Try filling it in manually.', 'error');
      }
      return;
    }

    const data = await res.json();

    if (data.type === 'instagram') {
      document.getElementById('f-title').value = data.title || '';
      document.getElementById('f-image').value = data.image || '';
      document.getElementById('f-servings').value = data.servings || '';
      document.getElementById('f-time').value = data.readyInMinutes || '';
      document.getElementById('f-ingredients').value = (data.ingredients || []).join('\n');
      document.getElementById('f-steps').value = (data.steps || []).join('\n');
      document.getElementById('f-notes').value = data.notes || '';
      document.getElementById('f-sourceUrl').value = url;
      document.getElementById('f-sourceType').value = 'instagram';
      setExtractMsg('Instagram recipe extracted! Review and adjust the fields below before saving.', 'success');
    } else {
      // Regular website via Spoonacular
      document.getElementById('f-title').value = data.title || '';
      document.getElementById('f-image').value = data.image || '';
      document.getElementById('f-servings').value = data.servings || '';
      document.getElementById('f-time').value = data.readyInMinutes || '';
      document.getElementById('f-ingredients').value =
        (data.extendedIngredients || []).map(i => i.original).join('\n');
      document.getElementById('f-steps').value =
        (data.analyzedInstructions?.[0]?.steps || []).map(s => s.step).join('\n');
      document.getElementById('f-sourceUrl').value = url;
      document.getElementById('f-sourceType').value = 'website';
      setExtractMsg('Recipe extracted! Review the details below before saving.', 'success');
    }

  } catch {
    setExtractMsg('Network error. Check your connection and try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Extract';
  }
}


function showCaptionPasteUI(url) {
  setExtractMsg('Instagram Reels cannot be auto-extracted. Paste the caption below and click Parse:', 'info');

  // Remove any existing caption box
  document.getElementById('captionPasteBox')?.remove();

  const box = document.createElement('div');
  box.id = 'captionPasteBox';
  box.style.cssText = 'margin-top:0.75rem; display:flex; flex-direction:column; gap:0.5rem;';
  box.innerHTML = `
    <textarea id="captionInput" rows="8"
      placeholder="Open the Instagram Reel â†’ tap Â·Â·Â· â†’ Copy caption, then paste here..."
      style="width:100%; padding:0.75rem; border:1.5px solid #e8e0d8; border-radius:12px; font-family:inherit; font-size:0.9rem; resize:vertical;"></textarea>
    <button id="parseCaptionBtn" class="btn-primary">Parse Caption</button>
  `;

  document.getElementById('extractMessage').after(box);

  document.getElementById('parseCaptionBtn').addEventListener('click', async () => {
    const caption = document.getElementById('captionInput').value.trim();
    if (!caption) return;

    const parseBtn = document.getElementById('parseCaptionBtn');
    parseBtn.disabled = true;
    parseBtn.innerHTML = '<span class="spinner"></span>AI parsing...';

    try {
      const res = await fetch(`${WORKER_URL}?action=parse-caption&caption=${encodeURIComponent(caption)}`);
      if (!res.ok) throw new Error('AI failed');
      const recipe = await res.json();

      document.getElementById('f-title').value = recipe.title || '';
      document.getElementById('f-servings').value = recipe.servings || '';
      document.getElementById('f-time').value = recipe.readyInMinutes || '';
      document.getElementById('f-ingredients').value = (recipe.ingredients || []).join('\n');
      document.getElementById('f-steps').value = (recipe.steps || []).join('\n');
      document.getElementById('f-notes').value = recipe.notes || '';
      document.getElementById('f-sourceUrl').value = url;
      document.getElementById('f-sourceType').value = 'instagram';
      box.remove();
      setExtractMsg('AI extracted the recipe! Review and adjust before saving.', 'success');
    } catch {
      parseBtn.disabled = false;
      parseBtn.textContent = 'Parse Caption';
      setExtractMsg('AI parsing failed. Try again.', 'error');
    }
  });
}

function setExtractMsg(text, type) {
  const el = document.getElementById('extractMessage');
  el.textContent = text;
  el.className = `extract-msg ${type}`;
}

// Save recipe
document.getElementById('recipeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Saving...';

  const recipe = {
    title:          document.getElementById('f-title').value.trim(),
    image:          document.getElementById('f-image').value.trim(),
    sourceUrl:      document.getElementById('f-sourceUrl').value.trim(),
    sourceType:     document.getElementById('f-sourceType').value || 'website',
    servings:       parseInt(document.getElementById('f-servings').value) || null,
    readyInMinutes: parseInt(document.getElementById('f-time').value) || null,
    ingredients:    document.getElementById('f-ingredients').value.split('\n').map(s => s.trim()).filter(Boolean),
    steps:          document.getElementById('f-steps').value.split('\n').map(s => s.trim()).filter(Boolean),
    notes:          document.getElementById('f-notes').value.trim(),
    tags:           document.getElementById('f-tags').value.split(',').map(s => s.trim()).filter(Boolean),
    addedBy:        currentUser.email,
  };

  try {
    if (editingRecipeId) {
      await update(ref(db, `recipes/${editingRecipeId}`), recipe);
    } else {
      const newRef = push(ref(db, 'recipes'));
      await set(newRef, { ...recipe, id: newRef.key, createdAt: Date.now() });
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

  const img = document.getElementById('d-image');
  if (r.image) {
    img.src = r.image;
    img.style.display = 'block';
    img.onerror = () => { img.style.display = 'none'; };
  } else {
    img.style.display = 'none';
  }

  document.getElementById('d-source-badge').textContent =
    r.sourceType === 'instagram' ? 'ðŸ“¸ Instagram' : 'ðŸŒ Web Recipe';
  document.getElementById('d-title').textContent = r.title;

  const meta = [];
  if (r.readyInMinutes) meta.push(`â± ${r.readyInMinutes} min`);
  if (r.servings) meta.push(`ðŸ½ ${r.servings} servings`);
  document.getElementById('d-meta').innerHTML = meta.map(m => `<span>${m}</span>`).join('');

  document.getElementById('d-tags').innerHTML =
    (r.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');

  document.getElementById('d-ingredients').innerHTML =
    (r.ingredients || []).map(i => `<li>${esc(i)}</li>`).join('');

  document.getElementById('d-steps').innerHTML =
    (r.steps || []).map(s => `<li>${esc(s)}</li>`).join('');

  const notesSection = document.getElementById('d-notes-section');
  if (r.notes) {
    document.getElementById('d-notes').textContent = r.notes;
    notesSection.classList.remove('hidden');
  } else {
    notesSection.classList.add('hidden');
  }

  const sourceLink = document.getElementById('d-source-link');
  if (r.sourceUrl) {
    sourceLink.href = r.sourceUrl;
    sourceLink.textContent = r.sourceType === 'instagram'
      ? 'ðŸ“¸ View original Instagram post'
      : 'ðŸ”— View original recipe';
    sourceLink.classList.remove('hidden');
  } else {
    sourceLink.classList.add('hidden');
  }

  document.getElementById('d-added-by').textContent = `Added by ${r.addedBy || 'unknown'}`;
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
