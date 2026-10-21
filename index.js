import { fetchJSON, renderProjects, fetchGitHubData } from './global.js';

// Step 2: show the 3 latest projects
const projects = await fetchJSON('./lib/projects.json');
const latestProjects = Array.isArray(projects) ? projects.slice(0, 3) : [];
const projectsContainer = document.querySelector('.projects');

renderProjects(latestProjects, projectsContainer, 'h2');

// Step 3: load GitHub stats from the API
const githubData = await fetchGitHubData('atl012');
const profileStats = document.querySelector('#profile-stats');

if (profileStats && githubData) {
  profileStats.innerHTML = `
    <dl>
      <dt>Followers</dt><dd>${githubData.followers}</dd>
      <dt>Following</dt><dd>${githubData.following}</dd>
      <dt>Public Repos</dt><dd>${githubData.public_repos}</dd>
      <dt>Public Gists</dt><dd>${githubData.public_gists}</dd>
    </dl>
  `;
}