import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

// ---------- Read the CSV ----------
async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));
  return data;
}

// ---------- One object per commit ----------
function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    // "Not Committed Yet" (00000000) isn't a real commit on GitHub, so skip it
    .filter(([commit]) => commit !== '00000000')
    .map(([commit, lines]) => {
      let first = lines[0];
      let { author, date, time, timezone, datetime } = first;

      let ret = {
        id: commit,
        url: 'https://github.com/atl012/portfolio/commit/' + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        // Hour as a decimal, e.g. 2:30 PM = 14.5
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };

      // Keep the original lines, but hidden from console printouts
      Object.defineProperty(ret, 'lines', {
        value: lines,
        enumerable: false,
        writable: false,
        configurable: true,
      });

      return ret;
    })
    // Oldest first, so the story and the slider go forward in time
    .sort((a, b) => a.datetime - b.datetime);
}

// ---------- Shared state ----------
let xScale; // created in renderScatterPlot(), reused in updateScatterPlot()
let yScale;

let data = await loadData();
let commits = processCommits(data);

// Step 1.1: slider state. commitProgress is 0-100, commitMaxTime is the matching date
let commitProgress = 100;
let timeScale = d3
  .scaleTime()
  .domain([
    d3.min(commits, (d) => d.datetime),
    d3.max(commits, (d) => d.datetime),
  ])
  .range([0, 100]);
let commitMaxTime = timeScale.invert(commitProgress);

// Step 1.2: updated whenever the slider moves or the user scrolls
let filteredCommits = commits;

// Brush selection, remembered so it can be re-applied after each update
let brushSelection = null;

// Step 2.4: one color per language
const colors = d3.scaleOrdinal(d3.schemeTableau10);

// Chart layout (shared by render and update)
const width = 1000;
const height = 600;
const margin = { top: 10, right: 10, bottom: 30, left: 40 };
const usableArea = {
  top: margin.top,
  right: width - margin.right,
  bottom: height - margin.bottom,
  left: margin.left,
  width: width - margin.left - margin.right,
  height: height - margin.top - margin.bottom,
};

// Dot size is based on ALL commits, so a commit's dot never changes size
// as other commits appear or disappear
const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

// ---------- Summary stats ----------
function renderCommitInfo(data, commits) {
  // Clear the old stats so this can be called again after filtering
  d3.select('#stats').selectAll('*').remove();
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');

  // Each stat is a small <div> holding a <dt> label and a <dd> value
  function addStat(label, value) {
    const group = dl.append('div');
    group.append('dt').html(label);
    group.append('dd').text(value);
  }

  addStat('Total <abbr title="Lines of code">LOC</abbr>', data.length);
  addStat('Total commits', commits.length);
  addStat('Files', d3.group(data, (d) => d.file).size);
  addStat('Max depth', d3.max(data, (d) => d.depth));
  addStat('Longest line (chars)', d3.max(data, (d) => d.length));

  // A file's length = its highest line number
  const fileLengths = d3.rollups(
    data,
    (v) => d3.max(v, (d) => d.line),
    (d) => d.file,
  );
  addStat('Max file length (lines)', d3.max(fileLengths, (d) => d[1]));
  addStat('Average file length (lines)', Math.round(d3.mean(fileLengths, (d) => d[1])));

  const workByPeriod = d3.rollups(
    data,
    (v) => v.length,
    (d) => new Date(d.datetime).toLocaleString('en', { dayPeriod: 'short' }),
  );
  addStat('Most work done', d3.greatest(workByPeriod, (d) => d[1])?.[0]);

  const workByDay = d3.rollups(
    data,
    (v) => v.length,
    (d) => d.datetime.toLocaleString('en', { weekday: 'long' }),
  );
  addStat('Busiest day', d3.greatest(workByDay, (d) => d[1])?.[0]);
}

// ---------- Tooltip ----------
function renderTooltipContent(commit) {
  const link = document.getElementById('commit-link');
  const date = document.getElementById('commit-date');
  const time = document.getElementById('commit-time-tooltip');
  const author = document.getElementById('commit-author');
  const lines = document.getElementById('commit-lines');

  if (Object.keys(commit).length === 0) return;

  link.href = commit.url;
  link.textContent = commit.id;
  date.textContent = commit.datetime?.toLocaleString('en', { dateStyle: 'full' });
  time.textContent = commit.datetime?.toLocaleString('en', { timeStyle: 'short' });
  author.textContent = commit.author;
  lines.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.style.left = `${event.clientX}px`;
  tooltip.style.top = `${event.clientY}px`;
}

// ---------- Brushing ----------
function isCommitSelected(selection, commit) {
  if (!selection) {
    return false;
  }
  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

// Only the commits currently shown (filteredCommits) can be selected
function renderSelectionCount(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];

  const countElement = document.querySelector('#selection-count');
  countElement.textContent = `${selectedCommits.length || 'No'} commits selected`;

  return selectedCommits;
}

function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];
  const container = document.getElementById('language-breakdown');

  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    return;
  }

  const lines = selectedCommits.flatMap((d) => d.lines);

  const breakdown = d3.rollup(
    lines,
    (v) => v.length,
    (d) => d.type,
  );

  let html = '';
  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const formatted = d3.format('.1~%')(proportion);
    html += `
      <div>
        <dt>${language}</dt>
        <dd>${count} lines (${formatted})</dd>
      </div>`;
  }
  container.innerHTML = html;
}

function brushed(event) {
  brushSelection = event.selection;
  d3.selectAll('#chart circle').classed('selected', (d) =>
    isCommitSelected(brushSelection, d),
  );
  renderSelectionCount(brushSelection);
  renderLanguageBreakdown(brushSelection);
}

function createBrushSelector(svg) {
  svg.call(d3.brush().on('start brush end', brushed));
  // The brush adds an overlay that blocks the dots, so raise the dots
  // (and anything after the overlay) back on top.
  svg.selectAll('.dots, .overlay ~ *').raise();
}

// ---------- Scatterplot ----------
// Draws (or redraws) the dots. Used by both render and update.
function drawDots(commits) {
  // Big dots first so small dots stay hoverable on top
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  d3.select('#chart')
    .select('g.dots')
    .selectAll('circle')
    // Step 1.3: the key (commit id) tells D3 which circle belongs to which commit
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7) // transparency for overlapping dots
    .classed('selected', (d) => isCommitSelected(brushSelection, d))
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });
}

// Runs ONCE: creates the svg, scales, gridlines, axes, and brush
function renderScatterPlot(data, commits) {
  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();
  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  // Gridlines (added BEFORE the axes and dots)
  svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

  // Axes (classes let updateScatterPlot find the x-axis later)
  svg
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .call(d3.axisBottom(xScale));

  svg
    .append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(
      d3.axisLeft(yScale).tickFormat((d) => String(d % 24).padStart(2, '0') + ':00'),
    );

  // Group that holds the dots
  svg.append('g').attr('class', 'dots');
  drawDots(commits);

  createBrushSelector(svg);
}

// Step 1.2: runs on every slider move / scroll step, updating the EXISTING chart
function updateScatterPlot(data, commits) {
  updateTooltipVisibility(false);

  const svg = d3.select('#chart').select('svg');

  // The x-axis range follows the commits being shown
  xScale.domain(d3.extent(commits, (d) => d.datetime)).nice();

  // Clear the old x-axis and draw a new one
  const xAxisGroup = svg.select('g.x-axis');
  xAxisGroup.selectAll('*').remove();
  xAxisGroup.call(d3.axisBottom(xScale));

  drawDots(commits);
}

// ---------- Step 2: unit visualization of files ----------
function updateFileDisplay(filteredCommits) {
  let lines = filteredCommits.flatMap((d) => d.lines);

  // One entry per file, biggest file first
  let files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => ({ name, lines }))
    .sort((a, b) => b.lines.length - a.lines.length);

  let filesContainer = d3
    .select('#files')
    // ':scope > div' = only the per-file wrappers, not the dots inside them
    .selectAll(':scope > div')
    .data(files, (d) => d.name)
    .join(
      // This code only runs when a file's <div> is first created
      (enter) =>
        enter.append('div').call((div) => {
          const dt = div.append('dt');
          dt.append('code');
          dt.append('small');
          div.append('dd');
        }),
    )
    .order(); // keep the files sorted as they grow (the race!)

  // File name and total number of lines
  filesContainer.select('dt > code').text((d) => d.name);
  filesContainer.select('dt > small').text((d) => `${d.lines.length} lines`);

  // One dot per line of code, colored by language (Steps 2.2 and 2.4)
  filesContainer
    .select('dd')
    .selectAll('div')
    .data((d) => d.lines)
    .join('div')
    .attr('class', 'loc')
    .attr('style', (d) => `--color: ${colors(d.type)}`);
}

// ---------- Keep everything in sync ----------
function updateAll() {
  const lines = filteredCommits.flatMap((d) => d.lines);

  renderCommitInfo(lines, filteredCommits);
  updateScatterPlot(lines, filteredCommits);
  renderSelectionCount(brushSelection);
  renderLanguageBreakdown(brushSelection);
  updateFileDisplay(filteredCommits);
}

// ---------- Step 1.1: slider ----------
const slider = document.getElementById('commit-progress');
const timeLabel = document.getElementById('commit-time');

// Used by BOTH the slider and the scrollytelling
function setCommitMaxTime(date) {
  commitMaxTime = date;
  commitProgress = timeScale(date);

  slider.value = commitProgress; // keep the slider in sync when scrolling drives it
  timeLabel.textContent = commitMaxTime.toLocaleString('en', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
  updateAll();
}

function onTimeSliderChange() {
  commitProgress = Number(slider.value);
  setCommitMaxTime(timeScale.invert(commitProgress));
}

slider.addEventListener('input', onTimeSliderChange);

// ---------- Step 3.2: commit text for scrollytelling ----------
d3.select('#scatter-story')
  .selectAll('.step')
  .data(commits)
  .join('div')
  .attr('class', 'step')
  .html(
    (d, i) => `
      On ${d.datetime.toLocaleString('en', {
        dateStyle: 'full',
        timeStyle: 'short',
      })},
      I made <a href="${d.url}" target="_blank">${
        i > 0 ? 'another glorious commit' : 'my first commit, and it was glorious'
      }</a>.
      I edited ${d.totalLines} lines across ${
        d3.rollups(
          d.lines,
          (D) => D.length,
          (d) => d.file,
        ).length
      } files.
      Then I looked over all I had made, and I saw that it was very good.
    `,
  );

// ---------- Step 3.3: Scrollama ----------
function onStepEnter(response) {
  // D3 stored the commit on each step element
  const commit = response.element.__data__;
  setCommitMaxTime(commit.datetime);
}

const scroller = scrollama();
scroller
  .setup({
    container: '#scrolly-1',
    step: '#scrolly-1 .step',
  })
  .onStepEnter(onStepEnter);

window.addEventListener('resize', scroller.resize);

// ---------- Run everything ----------
renderScatterPlot(data, filteredCommits);
onTimeSliderChange(); // sets the time label and draws stats, chart, and files