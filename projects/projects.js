import { fetchJSON, renderProjects } from '../global.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Data and page elements
const projects = (await fetchJSON('../lib/projects.json')) ?? [];
const projectsContainer = document.querySelector('.projects');
const searchInput = document.querySelector('.searchBar');
const title = document.querySelector('.projects-title');

if (title) {
  title.textContent = `${projects.length} Projects`;
}

// State
let query = '';            // what the user typed in the search bar
let selectedYear = null;   // the year of the selected wedge (null = none)

// D3 helpers
const arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
const sliceGenerator = d3.pie().value((d) => d.value);
const colors = d3.scaleOrdinal(d3.schemeTableau10);

// Filtering
// Projects that match the search query (case-insensitive, all metadata)
function getSearchFiltered() {
  const q = query.trim().toLowerCase();
  return projects.filter((project) => {
    const values = Object.values(project).join('\n').toLowerCase();
    return values.includes(q);
  });
}

// Pie chart + legend
function renderPieChart(projectsGiven) {
  // Count projects per year: [['2026', 2], ['2025', 3], ...]
  const rolledData = d3.rollups(
    projectsGiven,
    (v) => v.length,
    (d) => d.year,
  );
  const data = rolledData.map(([year, count]) => ({ value: count, label: year }));

  // Generate slice angles, then SVG path strings
  const arcData = sliceGenerator(data);
  const arcs = arcData.map((d) => arcGenerator(d));

  // Index of the selected wedge in the current data (-1 if none)
  const selectedIndex = data.findIndex((d) => d.label === selectedYear);

  // Clear the old chart and legend before re-drawing
  const svg = d3.select('#projects-pie-plot');
  svg.selectAll('path').remove();
  const legend = d3.select('.legend');
  legend.selectAll('li').remove();

  // Wedges
  arcs.forEach((arc, i) => {
    const d = data[i];
    svg
      .append('path')
      .attr('d', arc)
      .attr('fill', colors(d.label))
      .attr('class', i === selectedIndex ? 'selected' : null)
      .attr('data-year', d.label)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-pressed', i === selectedIndex)
      .attr('aria-label', `${d.label}: ${d.value} project${d.value === 1 ? '' : 's'}`)
      .on('click', () => toggleYear(d.label))
      .on('keydown', (event) => onKey(event, d.label, 'path'));
  });

  // Legend
  data.forEach((d, i) => {
    legend
      .append('li')
      .attr('style', `--color:${colors(d.label)}`)
      .attr('class', i === selectedIndex ? 'legend-item selected' : 'legend-item')
      .attr('data-year', d.label)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-pressed', i === selectedIndex)
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
      .on('click', () => toggleYear(d.label))
      .on('keydown', (event) => onKey(event, d.label, 'li'));
  });
}

// Interaction
// Click a selected year again to deselect it
function toggleYear(year, kind) {
  selectedYear = selectedYear === year ? null : year;
  update();

  // The chart is redrawn, so give keyboard focus back to the same item
  if (kind) {
    document
      .querySelector(`${kind}[data-year="${year}"]`)
      ?.focus({ preventScroll: true });
  }
}

// Keyboard support: Enter or Space acts like a click
function onKey(event, year, kind) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggleYear(year, kind);
  }
}

// One function that keeps everything in sync
function update() {
  // Apply the search filter
  const searchFiltered = getSearchFiltered();

  // If the selected year no longer appears in the search results, deselect it
  if (selectedYear !== null && !searchFiltered.some((p) => p.year === selectedYear)) {
    selectedYear = null;
  }

  // The pie chart reflects the search results
  renderPieChart(searchFiltered);

  // The project list applies BOTH filters: search AND selected year
  const visibleProjects =
    selectedYear === null
      ? searchFiltered
      : searchFiltered.filter((p) => p.year === selectedYear);
  renderProjects(visibleProjects, projectsContainer, 'h2');
}

// Search as the user types
searchInput.addEventListener('input', (event) => {
  query = event.target.value;
  update();
});

// First render on page load
update();