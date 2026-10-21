import { fetchJSON, renderProjects } from '../global.js';

// Fetch the data, find the container, render
const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');

renderProjects(projects, projectsContainer, 'h2');

// Show the project count in the page title
const title = document.querySelector('.projects-title');
if (title && Array.isArray(projects)) {
  title.textContent = `${projects.length} Projects`;
}