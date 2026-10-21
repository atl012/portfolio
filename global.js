console.log('IT’S ALIVE!');

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

// ---------- Navigation ----------
let pages = [
  { url: '', title: 'Home' },
  { url: 'projects/', title: 'Projects' },
  { url: 'resume/', title: 'Resume' },
  { url: 'contact/', title: 'Contact' },
  { url: 'https://github.com/atl012', title: 'Profile' },
];

const BASE_PATH =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? '/'            // Local server
    : '/portfolio/'; // GitHub Pages repo name

let nav = document.createElement('nav');
document.body.prepend(nav);

for (let p of pages) {
  let url = !p.url.startsWith('http') ? BASE_PATH + p.url : p.url;

  let a = document.createElement('a');
  a.href = url;
  a.textContent = p.title;

  // Highlight the current page
  a.classList.toggle(
    'current',
    a.host === location.host && a.pathname === location.pathname,
  );

  // Open external links in a new tab
  if (a.host !== location.host) {
    a.target = '_blank';
  }

  nav.append(a);
}

// ---------- Dark mode ----------
document.body.insertAdjacentHTML(
  'afterbegin',
  `
  <label class="color-scheme">
    Theme:
    <select>
      <option value="light dark">Automatic</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>`,
);

const select = document.querySelector('.color-scheme select');

function setColorScheme(colorScheme) {
  document.documentElement.style.setProperty('color-scheme', colorScheme);
  select.value = colorScheme;
}

// Restore the saved preference on page load
if ('colorScheme' in localStorage) {
  setColorScheme(localStorage.colorScheme);
}

// Apply and save the preference when the user changes it
select.addEventListener('input', function (event) {
  setColorScheme(event.target.value);
  localStorage.colorScheme = event.target.value;
});

// ---------- Better contact form ----------
const form = document.querySelector('form');

form?.addEventListener('submit', function (event) {
  event.preventDefault();

  const data = new FormData(form);
  let params = [];

  for (let [name, value] of data) {
    params.push(`${name}=${encodeURIComponent(value)}`);
  }

  location.href = `${form.action}?${params.join('&')}`;
});

// ---------- Lab 4: reusable functions ----------

// Step 1.2: fetch and parse a JSON file
export async function fetchJSON(url) {
  try {
    // Fetch the JSON file from the given URL
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching or parsing JSON data:', error);
    return null;
  }
}

// Step 1.4: render a list of projects into a container
export function renderProjects(projects, containerElement, headingLevel = 'h2') {
  // Make sure the container is a real DOM element
  if (!(containerElement instanceof HTMLElement)) {
    console.error('renderProjects: containerElement is not a valid element.');
    return;
  }

  // Validate the heading level (fall back to h2)
  headingLevel = String(headingLevel).toLowerCase();
  if (!['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(headingLevel)) {
    console.warn(`renderProjects: invalid heading "${headingLevel}", using h2.`);
    headingLevel = 'h2';
  }

  // Clear existing content to avoid duplicates
  containerElement.innerHTML = '';

  // Placeholder for empty or missing data
  if (!Array.isArray(projects) || projects.length === 0) {
    containerElement.innerHTML = '<p>No projects to show yet.</p>';
    return;
  }

  for (const project of projects) {
    const article = document.createElement('article');

    // Handle missing properties gracefully
    const title = project.title ?? 'Untitled project';
    const image =
      project.image || 'https://vis-society.github.io/labs/2/images/empty.svg';
    const description = project.description ?? '';

    article.innerHTML = `
      <${headingLevel}>${title}</${headingLevel}>
      <img src="${image}" alt="${title}">
      <p>${description}</p>
    `;

    containerElement.appendChild(article);
  }
}

// Step 3.2: fetch a GitHub user's public data
export async function fetchGitHubData(username) {
  return fetchJSON(`https://api.github.com/users/${username}`);
}