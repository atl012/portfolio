import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

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
    .map(([commit, lines]) => {
      // All lines in a commit share the same author, date, etc.
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
    });
}

// ---------- Shared state ----------
// xScale and yScale live outside renderScatterPlot() so that
// isCommitSelected() can use them later (Step 5.4).
let xScale;
let yScale;

let data = await loadData();
let commits = processCommits(data);

// ---------- Summary stats ----------
function renderCommitInfo(data, commits) {
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');

  // Each stat is a small <div> holding a <dt> label and a <dd> value
  function addStat(label, value) {
    const group = dl.append('div');
    group.append('dt').html(label);
    group.append('dd').text(value);
  }

  // Whole-dataset totals
  addStat('Total <abbr title="Lines of code">LOC</abbr>', data.length);
  addStat('Total commits', commits.length);

  // Number of distinct values
  addStat('Files', d3.group(data, (d) => d.file).size);

  // Aggregates over the whole dataset
  addStat('Max depth', d3.max(data, (d) => d.depth));
  addStat('Longest line (chars)', d3.max(data, (d) => d.length));

  // Grouped aggregates: length of each file = its highest line number
  const fileLengths = d3.rollups(
    data,
    (v) => d3.max(v, (d) => d.line),
    (d) => d.file,
  );
  addStat('Max file length (lines)', d3.max(fileLengths, (d) => d[1]));
  addStat('Average file length (lines)', Math.round(d3.mean(fileLengths, (d) => d[1])));

  // Min/max value: which time of day has the most work?
  const workByPeriod = d3.rollups(
    data,
    (v) => v.length,
    (d) => new Date(d.datetime).toLocaleString('en', { dayPeriod: 'short' }),
  );
  addStat('Most work done', d3.greatest(workByPeriod, (d) => d[1])?.[0]);

  // Min/max value: which weekday has the most work?
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
  const time = document.getElementById('commit-time');
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

function renderSelectionCount(selection) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d))
    : [];

  const countElement = document.querySelector('#selection-count');
  countElement.textContent = `${selectedCommits.length || 'No'} commits selected`;

  return selectedCommits;
}

function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d))
    : [];
  const container = document.getElementById('language-breakdown');

  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    return;
  }

  const lines = selectedCommits.flatMap((d) => d.lines);

  // Count lines per language
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
  const selection = event.selection;
  d3.selectAll('#chart circle').classed('selected', (d) =>
    isCommitSelected(selection, d),
  );
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

function createBrushSelector(svg) {
  svg.call(d3.brush().on('start brush end', brushed));
  // The brush adds an overlay that blocks the dots, so raise the dots
  // (and anything after the overlay) back on top.
  svg.selectAll('.dots, .overlay ~ *').raise();
}

// ---------- Scatterplot ----------
function renderScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  // Scales: time of day on Y, date on X
  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([0, width])
    .nice();
  yScale = d3.scaleLinear().domain([0, 24]).range([height, 0]);

  // Margins and usable area
  const margin = { top: 10, right: 10, bottom: 30, left: 40 };
  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  xScale.range([usableArea.left, usableArea.right]);
  yScale.range([usableArea.bottom, usableArea.top]);

  // Gridlines (added BEFORE the axes and dots)
  const gridlines = svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`);
  gridlines.call(
    d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width),
  );

  // Axes
  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

  svg
    .append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .call(xAxis);

  svg
    .append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(yAxis);

  // Dot radius from lines edited (sqrt keeps AREA proportional)
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3
    .scaleSqrt()
    .domain([minLines, maxLines])
    .range([2, 30]);

  // Draw big dots first so small dots stay hoverable on top
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  // The dots
  const dots = svg.append('g').attr('class', 'dots');

  dots
    .selectAll('circle')
    .data(sortedCommits)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7) // transparency for overlapping dots
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

  // Brush
  createBrushSelector(svg);
}

// ---------- Run everything ----------
renderCommitInfo(data, commits);
renderScatterPlot(data, commits);