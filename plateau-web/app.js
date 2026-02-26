/* ============================================
   プラトー横断 Web — Main Application
   ============================================ */

(function () {
  'use strict';

  // ---- Cluster colors (matching CSS) ----
  const CLUSTER_COLORS = {
    1: '#ff6b8a', 2: '#ffa06c', 3: '#6ce0ff',
    4: '#a78bfa', 5: '#6cffc0', 6: '#ffdb6c', 7: '#ff8cf0'
  };
  const CLUSTER_NAMES = {
    1: '計算×詩の交差', 2: 'チューリングの人物と思想',
    3: 'チューリングマシンの構造', 4: '詩学の展開',
    5: '記号操作の哲学', 6: 'Code Poetry・ウリポ・esolang',
    7: '横断的プラトー'
  };

  // ---- State ----
  let currentPlateauId = null;
  let trail = [];
  let simulation = null;
  let activeClusterFilter = null;

  // ---- DOM Elements ----
  const graphPanel = document.getElementById('graphPanel');
  const svg = d3.select('#networkGraph');
  const textPanel = document.getElementById('textPanel');
  const welcomeScreen = document.getElementById('welcomeScreen');
  const textContent = document.getElementById('textContent');
  const sectionNumber = document.getElementById('sectionNumber');
  const sectionTitle = document.getElementById('sectionTitle');
  const sectionBody = document.getElementById('sectionBody');
  const clusterBadge = document.getElementById('clusterBadge');
  const backlinkList = document.getElementById('backlinkList');
  const forwardLinkList = document.getElementById('forwardLinkList');
  const trailItems = document.getElementById('trailItems');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  const hoverPreview = document.getElementById('hoverPreview');

  // ---- Build Graph Data ----
  const nodes = PLATEAUS.map(p => ({
    id: p.id,
    title: p.title,
    cluster: p.cluster,
    clusterName: p.clusterName,
    radius: 8 + Math.max(p.linksTo.length, p.linkedFrom.length) * 1.5
  }));

  const links = [];
  const linkSet = new Set();
  PLATEAUS.forEach(p => {
    p.linksTo.forEach(targetId => {
      const key = `${Math.min(p.id, targetId)}-${Math.max(p.id, targetId)}`;
      if (!linkSet.has(key)) {
        linkSet.add(key);
        links.push({ source: p.id, target: targetId });
      }
    });
  });

  // ---- D3 Force Simulation ----
  function initGraph() {
    const width = graphPanel.clientWidth;
    const height = graphPanel.clientHeight;

    svg.attr('width', width).attr('height', height);

    // Clear
    svg.selectAll('*').remove();

    // Defs for glow
    const defs = svg.append('defs');
    const filter = defs.append('filter').attr('id', 'glow');
    filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    const g = svg.append('g').attr('class', 'graph-container');

    // Zoom
    const zoom = d3.zoom()
      .scaleExtent([0.3, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoom);

    // Links
    const linkG = g.append('g').attr('class', 'links');
    const linkElements = linkG.selectAll('line')
      .data(links)
      .join('line')
      .attr('class', 'link-line');

    // Nodes
    const nodeG = g.append('g').attr('class', 'nodes');
    const nodeGroups = nodeG.selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', 'node-group')
      .on('click', (event, d) => {
        event.stopPropagation();
        navigateTo(d.id);
      })
      .on('mouseenter', (event, d) => {
        showHoverPreview(d.id, event);
        highlightNode(d.id, linkElements, nodeGroups);
      })
      .on('mouseleave', () => {
        hideHoverPreview();
        unhighlightAll(linkElements, nodeGroups);
      })
      .call(d3.drag()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x; d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
      );

    nodeGroups.append('circle')
      .attr('class', 'node-circle')
      .attr('r', d => d.radius)
      .attr('fill', d => CLUSTER_COLORS[d.cluster])
      .attr('opacity', 0.85)
      .style('filter', 'url(#glow)');

    nodeGroups.append('text')
      .attr('class', 'node-label')
      .attr('dy', d => d.radius + 14)
      .text(d => `§${d.id}`);

    // Simulation
    simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(80).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => d.radius + 8))
      .force('x', d3.forceX(width / 2).strength(0.05))
      .force('y', d3.forceY(height / 2).strength(0.05))
      .on('tick', () => {
        linkElements
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);
        nodeGroups.attr('transform', d => `translate(${d.x},${d.y})`);
      });

    // Store refs
    svg._linkElements = linkElements;
    svg._nodeGroups = nodeGroups;
    svg._zoom = zoom;
    svg._g = g;
  }

  // ---- Graph Highlight ----
  function highlightNode(id, linkElements, nodeGroups) {
    const p = PLATEAUS.find(p => p.id === id);
    if (!p) return;
    const connected = new Set([...p.linksTo, ...p.linkedFrom, id]);

    linkElements
      .classed('highlighted', d =>
        (d.source.id === id || d.target.id === id));

    nodeGroups.selectAll('.node-circle')
      .attr('opacity', d => connected.has(d.id) ? 1 : 0.2);
    nodeGroups.selectAll('.node-label')
      .attr('opacity', d => connected.has(d.id) ? 1 : 0.2);
  }

  function unhighlightAll(linkElements, nodeGroups) {
    if (currentPlateauId) {
      highlightCurrent();
    } else {
      linkElements.classed('highlighted', false);
      nodeGroups.selectAll('.node-circle').attr('opacity', 0.85);
      nodeGroups.selectAll('.node-label').attr('opacity', 1);
    }
  }

  function highlightCurrent() {
    if (!currentPlateauId || !svg._linkElements) return;
    const p = PLATEAUS.find(p => p.id === currentPlateauId);
    if (!p) return;
    const connected = new Set([...p.linksTo, ...p.linkedFrom, currentPlateauId]);

    svg._linkElements
      .classed('highlighted', d =>
        d.source.id === currentPlateauId || d.target.id === currentPlateauId);

    // Trail edges
    svg._linkElements.classed('trail-edge', d => {
      for (let i = 0; i < trail.length - 1; i++) {
        const a = trail[i], b = trail[i + 1];
        if ((d.source.id === a && d.target.id === b) ||
            (d.source.id === b && d.target.id === a)) return true;
      }
      return false;
    });

    svg._nodeGroups.selectAll('.node-circle')
      .attr('opacity', d => connected.has(d.id) ? 1 : 0.35)
      .classed('active', d => d.id === currentPlateauId);
    svg._nodeGroups.selectAll('.node-label')
      .attr('opacity', d => connected.has(d.id) ? 1 : 0.35)
      .classed('active', d => d.id === currentPlateauId);
  }

  // ---- Navigate ----
  function navigateTo(id) {
    const p = PLATEAUS.find(p => p.id === id);
    if (!p) return;

    currentPlateauId = id;

    // Add to trail
    if (trail[trail.length - 1] !== id) {
      trail.push(id);
      if (trail.length > 50) trail.shift();
    }

    // Show text
    welcomeScreen.classList.add('hidden');
    textContent.classList.remove('hidden');

    sectionNumber.textContent = `§${p.id}`;
    sectionTitle.textContent = p.title;

    const color = CLUSTER_COLORS[p.cluster];
    clusterBadge.textContent = p.clusterName;
    clusterBadge.style.color = color;
    clusterBadge.style.borderColor = color;
    clusterBadge.style.backgroundColor = color + '15';

    // Process body text: convert §XX refs to clickable links, 【】to keywords
    let html = escapeHtml(p.body);

    // Convert →§XX or §XX references to links
    html = html.replace(/(?:→)?§(\d+)(?:\s+[^→\n§【】]{1,30})?/g, (match, num) => {
      const refId = parseInt(num);
      if (refId >= 1 && refId <= 35) {
        return `<a class="ref-link" data-id="${refId}" title="§${refId}">${match}</a>`;
      }
      return match;
    });

    // Convert 【keyword】to highlighted spans
    html = html.replace(/【([^】]+)】/g, '<span class="keyword">【$1】</span>');

    sectionBody.innerHTML = html;

    // Attach ref-link click handlers
    sectionBody.querySelectorAll('.ref-link').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(parseInt(el.dataset.id));
      });
      el.addEventListener('mouseenter', (e) => {
        showHoverPreview(parseInt(el.dataset.id), e);
      });
      el.addEventListener('mouseleave', () => {
        hideHoverPreview();
      });
    });

    // Backlinks
    backlinkList.innerHTML = '';
    p.linkedFrom.sort((a, b) => a - b).forEach(refId => {
      const ref = PLATEAUS.find(t => t.id === refId);
      if (ref) {
        const chip = document.createElement('span');
        chip.className = 'link-chip';
        chip.textContent = `§${ref.id} ${ref.title}`;
        chip.style.borderLeftColor = CLUSTER_COLORS[ref.cluster];
        chip.addEventListener('click', () => navigateTo(ref.id));
        backlinkList.appendChild(chip);
      }
    });

    // Forward links
    forwardLinkList.innerHTML = '';
    p.linksTo.sort((a, b) => a - b).forEach(refId => {
      const ref = PLATEAUS.find(t => t.id === refId);
      if (ref) {
        const chip = document.createElement('span');
        chip.className = 'link-chip';
        chip.textContent = `§${ref.id} ${ref.title}`;
        chip.style.borderLeftColor = CLUSTER_COLORS[ref.cluster];
        chip.addEventListener('click', () => navigateTo(ref.id));
        forwardLinkList.appendChild(chip);
      }
    });

    // Scroll to top
    textPanel.scrollTop = 0;

    // Update graph highlight
    highlightCurrent();

    // Update trail bar
    renderTrail();

    // Center graph on node
    centerOnNode(id);
  }

  function centerOnNode(id) {
    const node = nodes.find(n => n.id === id);
    if (!node || !svg._zoom || !svg._g) return;

    const width = graphPanel.clientWidth;
    const height = graphPanel.clientHeight;

    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(1.2)
      .translate(-node.x, -node.y);

    svg.transition().duration(600).call(svg._zoom.transform, transform);
  }

  // ---- Trail ----
  function renderTrail() {
    trailItems.innerHTML = '';
    trail.forEach((id, i) => {
      if (i > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'trail-arrow';
        arrow.textContent = '→';
        trailItems.appendChild(arrow);
      }
      const node = document.createElement('span');
      node.className = 'trail-node' + (id === currentPlateauId ? ' active' : '');
      node.textContent = `§${id}`;
      node.addEventListener('click', () => navigateTo(id));
      trailItems.appendChild(node);
    });
    // Scroll to end
    trailItems.scrollLeft = trailItems.scrollWidth;
  }

  // ---- Dice (Random) ----
  document.getElementById('diceBtn').addEventListener('click', () => {
    const btn = document.getElementById('diceBtn');
    btn.style.transform = `rotate(${Math.random() * 720}deg)`;
    setTimeout(() => { btn.style.transform = ''; }, 400);

    const randomId = Math.floor(Math.random() * 35) + 1;
    navigateTo(randomId);
  });

  // ---- Clear Trail ----
  document.getElementById('clearTrail').addEventListener('click', () => {
    trail = [];
    renderTrail();
    if (svg._linkElements) {
      svg._linkElements.classed('trail-edge', false);
    }
  });

  // ---- Search ----
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    if (query.length < 2) {
      searchResults.classList.add('hidden');
      return;
    }

    const results = PLATEAUS.filter(p =>
      p.title.toLowerCase().includes(query) ||
      p.body.toLowerCase().includes(query)
    ).slice(0, 10);

    if (results.length === 0) {
      searchResults.classList.add('hidden');
      return;
    }

    searchResults.innerHTML = '';
    results.forEach(p => {
      const item = document.createElement('div');
      item.className = 'search-result-item';

      // Find snippet
      let snippet = '';
      const bodyLower = p.body.toLowerCase();
      const idx = bodyLower.indexOf(query);
      if (idx >= 0) {
        const start = Math.max(0, idx - 20);
        const end = Math.min(p.body.length, idx + query.length + 40);
        snippet = '…' + p.body.substring(start, end).replace(/\n/g, ' ') + '…';
      }

      item.innerHTML = `
        <span class="sr-num" style="color:${CLUSTER_COLORS[p.cluster]}">§${p.id}</span>
        <span class="sr-title">${p.title}</span>
        ${snippet ? `<span class="sr-snippet">${escapeHtml(snippet)}</span>` : ''}
      `;
      item.addEventListener('click', () => {
        navigateTo(p.id);
        searchResults.classList.add('hidden');
        searchInput.value = '';
      });
      searchResults.appendChild(item);
    });
    searchResults.classList.remove('hidden');
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchResults.classList.add('hidden');
      searchInput.blur();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) {
      searchResults.classList.add('hidden');
    }
  });

  // ---- Hover Preview (Transclusion) ----
  function showHoverPreview(id, event) {
    const p = PLATEAUS.find(p => p.id === id);
    if (!p) return;

    const preview = document.getElementById('hoverPreview');
    const lines = p.body.split('\n').filter(l => l.trim()).slice(0, 4).join('\n');

    preview.innerHTML = `
      <div class="hp-title">§${p.id} ${p.title}</div>
      <div class="hp-body">${escapeHtml(lines)}</div>
    `;

    // Position
    const x = event.clientX + 16;
    const y = event.clientY - 10;
    preview.style.left = Math.min(x, window.innerWidth - 400) + 'px';
    preview.style.top = Math.min(y, window.innerHeight - 200) + 'px';
    preview.classList.remove('hidden');
    preview.style.display = 'block';
    preview.style.opacity = '1';
  }

  function hideHoverPreview() {
    const preview = document.getElementById('hoverPreview');
    preview.classList.add('hidden');
  }

  // ---- Legend ----
  function buildLegend() {
    const legend = document.getElementById('graphLegend');
    Object.keys(CLUSTER_NAMES).forEach(k => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `
        <span class="legend-dot" style="background:${CLUSTER_COLORS[k]}"></span>
        <span>${CLUSTER_NAMES[k]}</span>
      `;
      legend.appendChild(item);
    });
  }

  // ---- Cluster Filter ----
  function buildClusterFilter() {
    const container = document.getElementById('clusterFilter');
    Object.keys(CLUSTER_NAMES).forEach(k => {
      const btn = document.createElement('span');
      btn.className = 'cf-btn';
      btn.style.background = CLUSTER_COLORS[k];
      btn.title = CLUSTER_NAMES[k];
      btn.addEventListener('click', () => {
        if (activeClusterFilter === parseInt(k)) {
          activeClusterFilter = null;
          container.querySelectorAll('.cf-btn').forEach(b => b.classList.remove('active'));
          resetClusterFilter();
        } else {
          activeClusterFilter = parseInt(k);
          container.querySelectorAll('.cf-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          applyClusterFilter(parseInt(k));
        }
      });
      container.appendChild(btn);
    });
  }

  function applyClusterFilter(cluster) {
    svg._nodeGroups.selectAll('.node-circle')
      .attr('opacity', d => d.cluster === cluster ? 1 : 0.1);
    svg._nodeGroups.selectAll('.node-label')
      .attr('opacity', d => d.cluster === cluster ? 1 : 0.1);
    svg._linkElements
      .attr('opacity', d => {
        const s = typeof d.source === 'object' ? d.source : nodes.find(n => n.id === d.source);
        const t = typeof d.target === 'object' ? d.target : nodes.find(n => n.id === d.target);
        return (s && s.cluster === cluster) || (t && t.cluster === cluster) ? 0.5 : 0.03;
      });
  }

  function resetClusterFilter() {
    if (currentPlateauId) {
      highlightCurrent();
    } else {
      svg._nodeGroups.selectAll('.node-circle').attr('opacity', 0.85);
      svg._nodeGroups.selectAll('.node-label').attr('opacity', 1);
      svg._linkElements.attr('opacity', 1);
    }
  }

  // ---- Divider Resize ----
  const divider = document.getElementById('divider');
  let isDragging = false;
  divider.addEventListener('mousedown', (e) => {
    isDragging = true;
    divider.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const mainRect = document.getElementById('main').getBoundingClientRect();
    const pct = ((e.clientX - mainRect.left) / mainRect.width) * 100;
    const clamped = Math.max(20, Math.min(70, pct));
    graphPanel.style.width = clamped + '%';
    // Resize graph
    const w = graphPanel.clientWidth;
    const h = graphPanel.clientHeight;
    svg.attr('width', w).attr('height', h);
  });
  document.addEventListener('mouseup', () => {
    isDragging = false;
    divider.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  // ---- Utility ----
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Window resize ----
  window.addEventListener('resize', () => {
    const w = graphPanel.clientWidth;
    const h = graphPanel.clientHeight;
    svg.attr('width', w).attr('height', h);
    if (simulation) {
      simulation.force('center', d3.forceCenter(w / 2, h / 2));
      simulation.alpha(0.3).restart();
    }
  });

  // ---- Init ----
  initGraph();
  buildLegend();
  buildClusterFilter();

})();
