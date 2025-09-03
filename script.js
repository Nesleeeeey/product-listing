// ==============================
// Global Elements & State
// ==============================

const grid = document.getElementById('grid');
const datasetSel = document.getElementById('dataset');
const searchInput = document.getElementById('search');
const cartTotalEl = document.getElementById('cart-total');
const countPill = document.getElementById('count-pill');
const clearBtn = document.getElementById('clear-cart');

// State to keep track of products and cart
const state = {
  products: [], // all products loaded from JSON
  filtered: [], // products after search/filter
  cart: new Map() // productId -> quantity
};

// currency formatter (AED)
const currency = new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED' });

// convert stock status to a label
function availabilityLabel(stock) {
  switch (stock) {
    case 'in_stock': return 'In Stock';
    case 'low_stock': return 'Low Stock';
    default: return 'Not Available';
  }
}

// convert stock status to a CSS class
function availabilityClass(stock) {
  switch (stock) {
    case 'in_stock': return 'in';
    case 'low_stock': return 'low';
    default: return 'out';
  }
}

// load product data from a JSON file
async function load(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load product file');
    const data = await res.json();
    state.products = data;
    state.filtered = data;
    render();
    injectStructuredData(data);
  } catch (err) {
    grid.innerHTML = `<p role="alert">Unable to load products: ${err.message}</p>`;
  }
}

// render all products on the page (applies search filter)
function render() {
  const q = searchInput.value?.trim().toLowerCase();
  state.filtered = !q ? state.products : state.products.filter(p =>
    p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
  );

  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  state.filtered.forEach(p => frag.appendChild(createCard(p)));
  grid.appendChild(frag);
  updateCartSummary();
}

// create a single product card
function createCard(p) {
  const article = document.createElement('article');
  article.className = 'card';
  article.setAttribute('role', 'listitem');
  article.tabIndex = 0;

  // product image and badge
  const media = document.createElement('div');
  media.className = 'media';
  const img = document.createElement('img');
  img.src = p.image;
  img.alt = p.name;
  img.loading = 'lazy';
  media.appendChild(img);

  if (p.badge) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = p.badge;
    media.appendChild(badge);
  }

  // product details
  const content = document.createElement('div');
  content.className = 'content';

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = p.name;

  const desc = document.createElement('p');
  desc.className = 'desc';
  desc.textContent = p.description;

  // price & qty 
  const priceRow = document.createElement('div');
  priceRow.className = 'price-row';

  const price = document.createElement('div');
  price.className = 'price';
  price.textContent = currency.format(p.price);

  const qtyControl = createQtyControl(p.id, p.price);
  priceRow.append(price, qtyControl.wrapper);

  // item total
  const itemTotal = document.createElement('div');
  itemTotal.className = 'item-total';
  itemTotal.textContent = `Total: ${currency.format(p.price * parseInt(qtyControl.input.value || 1, 10))}`;

  // action buttons: add to cart & check availability
  const actions = document.createElement('div');
  actions.className = 'actions';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn';
  addBtn.type = 'button';
  addBtn.textContent = 'Add to Cart';
  addBtn.setAttribute('aria-label', `Add ${p.name} to cart`);

  if (p.stock === 'not_available') {
    addBtn.disabled = true;
    addBtn.style.backgroundColor = '#ccc';
    addBtn.style.cursor = 'not-allowed';
    addBtn.textContent = 'Out of Stock';
    addBtn.setAttribute('aria-label', `${p.name} is out of stock`);
  } else {
    addBtn.addEventListener('click', () => {
      const qty = clamp(parseInt(qtyControl.input.value || '1', 10), 1, 99);
      const prev = state.cart.get(p.id) || 0;
      state.cart.set(p.id, prev + qty);
      animateButton(addBtn);
      updateCartSummary();
    });
  }

  const availBtn = document.createElement('button');
  availBtn.className = 'btn secondary';
  availBtn.type = 'button';
  availBtn.textContent = 'Check Availability';
  availBtn.setAttribute('aria-label', `Check availability for ${p.name}`);

  const status = document.createElement('span');
  status.className = 'status';
  status.setAttribute('aria-live', 'polite');

  availBtn.addEventListener('click', () => {
    status.textContent = availabilityLabel(p.stock);
    status.className = `status ${availabilityClass(p.stock)}`;
  });

  // update item total when quantity changes
  qtyControl.input.addEventListener('change', () => {
    const q = clamp(parseInt(qtyControl.input.value || '1', 10), 1, 99);
    qtyControl.input.value = q;
    itemTotal.textContent = `Total: ${currency.format(p.price * q)}`;
  });

  actions.append(addBtn, availBtn, status);
  content.append(title, desc, priceRow, itemTotal, actions);
  article.append(media, content);

  // keyboard support: enter focuses the add button
  article.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addBtn.focus();
  });

  return article;
}

// create quantity selector (+/-) for a product
function createQtyControl(productId, unitPrice) {
  const wrapper = document.createElement('div');
  wrapper.className = 'qty';

  const minus = document.createElement('button');
  minus.type = 'button';
  minus.setAttribute('aria-label', 'Decrease quantity');
  minus.textContent = '–';

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = '99';
  input.value = '1';
  input.inputMode = 'numeric';
  input.setAttribute('aria-label', 'Quantity');

  const plus = document.createElement('button');
  plus.type = 'button';
  plus.setAttribute('aria-label', 'Increase quantity');
  plus.textContent = '+';

  // button handlers
  minus.addEventListener('click', () => {
    input.value = String(Math.max(1, (parseInt(input.value, 10) || 1) - 1));
    input.dispatchEvent(new Event('change'));
  });
  plus.addEventListener('click', () => {
    input.value = String(Math.min(99, (parseInt(input.value, 10) || 1) + 1));
    input.dispatchEvent(new Event('change'));
  });

  // ensure input stays within limits
  input.addEventListener('change', () => {
    const val = clamp(parseInt(input.value || '1', 10), 1, 99);
    input.value = String(val);
  });

  wrapper.append(minus, input, plus);
  return { wrapper, input };
}

// keep a number within min and max
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// update cart totals and item count
function updateCartSummary() {
  let total = 0;
  let items = 0;
  for (const [id, qty] of state.cart.entries()) {
    const p = state.products.find(x => x.id === id);
    if (!p) continue;
    total += p.price * qty;
    items += qty;
  }
  cartTotalEl.textContent = currency.format(total);
  countPill.textContent = `${items} item${items !== 1 ? 's' : ''}`;
}

// small "pop" animation when adding to cart
function animateButton(btn) {
  btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 160 });
}

// search input updates product list
searchInput.addEventListener('input', render);
// switch dataset
datasetSel.addEventListener('change', (e) => load(e.target.value));
// clear cart
clearBtn.addEventListener('click', () => { state.cart.clear(); updateCartSummary(); });

// keyboard navigation between product cards (up/down arrows)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const cards = Array.from(document.querySelectorAll('article.card'));
  const active = document.activeElement;
  const idx = cards.indexOf(active);
  if (idx === -1) return;
  e.preventDefault();
  const next = e.key === 'ArrowDown' ? Math.min(cards.length - 1, idx + 1) : Math.max(0, idx - 1);
  cards[next].focus();
});

// initial product load
load('catalog-15.json');

// add structured data (JSON-LD) for SEO
function injectStructuredData(items) {
  const avail = {
    in_stock: 'https://schema.org/InStock',
    low_stock: 'https://schema.org/LimitedAvailability',
    not_available: 'https://schema.org/OutOfStock'
  };
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'itemListElement': items.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: p.name,
        image: p.image,
        description: p.description,
        sku: String(p.id),
        offers: {
          '@type': 'Offer',
          price: p.price,
          priceCurrency: 'AED',
          availability: avail[p.stock] || 'https://schema.org/Discontinued'
        }
      }
    }))
  };

  let tag = document.getElementById('jsonld');
  if (!tag) {
    tag = document.createElement('script');
    tag.type = 'application/ld+json';
    tag.id = 'jsonld';
    document.head.appendChild(tag);
  }
  tag.textContent = JSON.stringify(ld);
}
