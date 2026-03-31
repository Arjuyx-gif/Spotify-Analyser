// Spotify Analyzer - Dashboard Charts v2
/**
 * Spotify Listening Analyzer — dashboard.js
 * Fetches processed data from the API and renders Chart.js visualizations.
 */

// ─── Color Palettes ──────────────────────────────────────────

const COLORS = {
    green: '#1DB954',
    greenDim: '#1aa34a',
    greenGlow: 'rgba(29, 185, 84, 0.3)',
    purple: '#8b5cf6',
    blue: '#3b82f6',
    pink: '#ec4899',
    orange: '#f97316',
    cyan: '#06b6d4',
    yellow: '#eab308',
    red: '#ef4444',
    lime: '#84cc16',
    indigo: '#6366f1',
    rose: '#f43f5e',
    teal: '#14b8a6',
};

const CHART_PALETTE = [
    COLORS.green, COLORS.purple, COLORS.blue, COLORS.pink,
    COLORS.orange, COLORS.cyan, COLORS.yellow, COLORS.red,
    COLORS.lime, COLORS.indigo, COLORS.rose, COLORS.teal,
];

// ─── Chart.js Global Defaults ────────────────────────────────

Chart.defaults.color = '#a1a1aa';
Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.06)';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.padding = 16;
Chart.defaults.responsive = true;
Chart.defaults.maintainAspectRatio = false;

// ─── Init ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    fetchDashboardData();
});

async function fetchDashboardData() {
    const loadingEl = document.getElementById('loading-overlay');
    const contentEl = document.getElementById('dashboard-content');
    const errorEl = document.getElementById('error-container');

    try {
        const response = await fetch('/api/dashboard-data');
        if (response.status === 401) {
            window.location.href = '/';
            return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        // Populate user info
        populateUserInfo(data.user);

        // Populate stats bar
        populateStats(data);

        // Render charts
        renderTopArtistsChart(data.top_artists);
        renderGenreChart(data.genre_distribution);
        renderActivityChart(data.activity_by_hour);
        renderHeatmap(data.heatmap);
        renderScatterChart(data.audio_features.scatter);
        renderRadarChart(data.audio_features.averages);
        renderDayChart(data.activity_by_day);

        // Render tracks list
        renderTracksList(data.top_tracks);

        // Render new features
        renderMoodProfile(data.mood_profile);
        renderRecommendations(data.recommendations);

        // Show dashboard
        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';

        // Store data globally and wire up MOODIFY Story
        window.dashboardData = data;
        const storyBtn = document.getElementById('story-btn');
        if (storyBtn) {
            storyBtn.addEventListener('click', () => initStory(window.dashboardData));
        }

    } catch (err) {
        console.error('Dashboard data error:', err);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'flex';
        document.getElementById('error-message').textContent = err.message || 'Unable to load your data.';
    }
}

// ─── Helpers ─────────────────────────────────────────────────

function populateUserInfo(user) {
    if (user.name) {
        document.getElementById('user-name').textContent = user.name;
    }
    if (user.image) {
        const avatar = document.getElementById('user-avatar');
        avatar.src = user.image;
        avatar.style.display = 'block';
    } else {
        document.getElementById('user-avatar').style.display = 'none';
    }
}

function populateStats(data) {
    document.getElementById('stat-artists').textContent = data.top_artists.length;
    document.getElementById('stat-tracks').textContent = data.top_tracks.length;
    document.getElementById('stat-genres').textContent = Object.keys(data.genre_distribution).length;
    document.getElementById('stat-energy').textContent = (data.audio_features.averages.energy * 100).toFixed(0) + '%';
    document.getElementById('stat-danceability').textContent = (data.audio_features.averages.danceability * 100).toFixed(0) + '%';
}

// ─── Chart 1: Top Artists (Horizontal Bar) ───────────────────

function renderTopArtistsChart(artists) {
    const ctx = document.getElementById('topArtistsChart').getContext('2d');
    const labels = artists.map(a => a.name);
    const values = artists.map(a => a.listening_score || a.popularity || 0);
    console.log('Top Artists chart data:', JSON.stringify(artists.slice(0, 3)));
    console.log('Chart values:', values);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Listening Score',
                data: values,
                backgroundColor: CHART_PALETTE.slice(0, artists.length).map(c => c + '99'),
                borderColor: CHART_PALETTE.slice(0, artists.length),
                borderWidth: 1.5,
                borderRadius: 6,
                borderSkipped: false,
            }],
        },

        
        options: {
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 15, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#a1a1aa',
                    borderColor: COLORS.green,
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 12,
                },
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#6b6b76' },
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#e4e4e7', font: { weight: '600' } },
                },
            },
            
        },
    });
}

// ─── Chart 2: Genre Distribution (Doughnut) ──────────────────

function renderGenreChart(genres) {
    const ctx = document.getElementById('genreChart').getContext('2d');
    const labels = Object.keys(genres);
    const values = Object.values(genres);

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: CHART_PALETTE.slice(0, labels.length).map(c => c + 'cc'),
                borderColor: 'rgba(10, 10, 15, 0.8)',
                borderWidth: 2,
                hoverBorderColor: '#fff',
                hoverOffset: 8,
            }],
        },
        options: {
            cutout: '55%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        font: { size: 11 },
                        padding: 10,
                    },
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 15, 0.9)',
                    borderColor: COLORS.green,
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 12,
                },
            },
        },
    });
}

// ─── Chart 3: Listening Activity by Hour (Line/Area) ─────────

function renderActivityChart(activityByHour) {
    const ctx = document.getElementById('activityChart').getContext('2d');
    const labels = Object.keys(activityByHour).map(h => {
        const hour = parseInt(h);
        return hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
    });
    const values = Object.values(activityByHour);

    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(29, 185, 84, 0.4)');
    gradient.addColorStop(1, 'rgba(29, 185, 84, 0.01)');

    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Tracks Played',
                data: values,
                borderColor: COLORS.green,
                backgroundColor: gradient,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: COLORS.green,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 7,
            }],
        },
        options: {
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 15, 0.9)',
                    borderColor: COLORS.green,
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 12,
                },
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#6b6b76', maxRotation: 45 },
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: {
                        color: '#6b6b76',
                        stepSize: 1,
                    },
                },
            },
        },
    });
}

// ─── Chart 4: Heatmap (Day × Hour) ──────────────────────────

// Maps a 0–1 intensity to a rich multi-stop color for heatmap cells.
function heatmapColor(intensity) {
    if (intensity <= 0)    return 'rgba(255,255,255,0.04)';
    if (intensity < 0.25)  return `rgba(20,184,166,${0.15 + intensity * 1.2})`; // teal low
    if (intensity < 0.60)  return `rgba(29,185,84,${0.35 + intensity * 0.8})`;  // green mid
    return `rgba(${Math.round(29 + (255-29)*(intensity-0.6)/0.4)},${Math.round(185 + (255-185)*(intensity-0.6)/0.4)},${Math.round(84 + (200-84)*(intensity-0.6)/0.4)},1)`; // green→near-white hot
}

function renderHeatmap(heatmapData) {
    const ctx = document.getElementById('heatmapChart').getContext('2d');
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

    // Compute max value for normalization and find peak cell
    const maxVal   = Math.max(...heatmapData.map(d => d.v), 1);
    const peakCell = heatmapData.reduce((best, d) => d.v > best.v ? d : best, heatmapData[0]);

    // Plugin: draw a ★ on the peak cell
    const peakPlugin = {
        id: 'heatmapPeak',
        afterDatasetsDraw(chart) {
            const { ctx: c, scales: { x, y } } = chart;
            const ds = chart.data.datasets[0];
            const cellW = (chart.chartArea?.width  || 600) / 25;
            const cellH = (chart.chartArea?.height || 250) / 8;
            const px = x.getPixelForValue(peakCell.x);
            const py = y.getPixelForValue(peakCell.y);
            c.save();
            c.font = `bold ${Math.round(Math.min(cellW, cellH) * 0.45)}px Inter, sans-serif`;
            c.fillStyle = '#fff';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.shadowColor = 'rgba(0,0,0,0.6)';
            c.shadowBlur = 4;
            c.fillText('★', px, py);
            c.restore();
        },
    };

    if (typeof Chart.controllers.matrix !== 'undefined') {
        new Chart(ctx, {
            type: 'matrix',
            plugins: [peakPlugin],
            data: {
                datasets: [{
                    label: 'Listening Activity',
                    data: heatmapData.map(d => ({ x: d.x, y: d.y, v: d.v })),
                    backgroundColor(c) {
                        const v = c.dataset.data[c.dataIndex]?.v ?? 0;
                        return heatmapColor(v / maxVal);
                    },
                    borderColor: 'rgba(10,10,15,0.6)',
                    borderWidth: 2,
                    borderRadius: 5,
                    width:  ({ chart }) => (chart.chartArea?.width  || 600) / 25,
                    height: ({ chart }) => (chart.chartArea?.height || 250) / 8,
                }],
            },
            options: {
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(10,10,15,0.92)',
                        borderColor: COLORS.green,
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 14,
                        callbacks: {
                            title: () => '',
                            label(c) {
                                const d = c.dataset.data[c.dataIndex];
                                const h = d.x;
                                const hStr = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h-12} PM`;
                                const intensity = d.v / maxVal;
                                const heat = intensity > 0.75 ? '🔥 Peak' : intensity > 0.4 ? '🎵 Active' : d.v > 0 ? '· Occasional' : '· Quiet';
                                return [`${DAY_NAMES[d.y]} · ${hStr}`, `${d.v} play${d.v !== 1 ? 's' : ''}  ${heat}`];
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        min: -0.5, max: 23.5,
                        ticks: {
                            stepSize: 1,
                            color: '#6b6b76',
                            callback: v => (v % 6 === 0) ? (v === 0 ? '12a' : v < 12 ? `${v}a` : v === 12 ? '12p' : `${v-12}p`) : '',
                        },
                        grid: { display: false },
                    },
                    y: {
                        type: 'linear',
                        offset: true,
                        min: -0.5, max: 6.5,
                        ticks: {
                            stepSize: 1,
                            color: '#a1a1aa',
                            font: { weight: '600' },
                            callback: v => days[v] ?? '',
                        },
                        grid: { display: false },
                    },
                },
            },
        });
    } else {
        renderHeatmapFallback(ctx, heatmapData, days);
    }
}

function renderHeatmapFallback(ctx, heatmapData, days) {
    // Refined fallback: grouped bar chart (cleaner than stacked)
    const hourLabels = Array.from({ length: 24 }, (_, i) =>
        i % 6 === 0 ? (i === 0 ? '12a' : i < 12 ? `${i}a` : i === 12 ? '12p' : `${i-12}p`) : ''
    );
    const datasets = days.map((day, di) => ({
        label: day,
        data: Array.from({ length: 24 }, (_, h) => heatmapData.find(d => d.y === di && d.x === h)?.v ?? 0),
        backgroundColor: CHART_PALETTE[di] + 'bb',
        borderColor: CHART_PALETTE[di],
        borderWidth: 1,
        borderRadius: 3,
    }));

    new Chart(ctx, {
        type: 'bar',
        data: { labels: hourLabels, datasets },
        options: {
            plugins: {
                legend: { position: 'top', labels: { font: { size: 10 }, padding: 8 } },
                tooltip: {
                    backgroundColor: 'rgba(10,10,15,0.9)',
                    borderColor: COLORS.green,
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 12,
                },
            },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b6b76' } },
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b6b76', stepSize: 1 } },
            },
        },
    });
}

// ─── Chart 5: Energy vs Valence (Scatter) ────────────────────

// Returns danceability-tier color
function danceColor(d, alpha = 'bb') {
    if (d > 0.7) return COLORS.green  + alpha;
    if (d > 0.5) return COLORS.blue   + alpha;
    if (d > 0.3) return COLORS.purple + alpha;
    return COLORS.pink + alpha;
}

function renderScatterChart(scatter) {
    const ctx = document.getElementById('scatterChart').getContext('2d');

    // Map energy to bubble radius (4–13px) for extra data dimension
    const radii = scatter.map(s => Math.round(4 + s.energy * 9));

    // Quadrant label plugin
    const quadrantPlugin = {
        id: 'scatterQuadrants',
        beforeDraw(chart) {
            const { ctx: c, chartArea: a, scales: { x, y } } = chart;
            if (!a) return;
            const mx = x.getPixelForValue(0.5);
            const my = y.getPixelForValue(0.5);

            // Midpoint reference lines
            c.save();
            c.setLineDash([4, 6]);
            c.strokeStyle = 'rgba(255,255,255,0.08)';
            c.lineWidth = 1;
            c.beginPath(); c.moveTo(mx, a.top);    c.lineTo(mx, a.bottom); c.stroke();
            c.beginPath(); c.moveTo(a.left, my);   c.lineTo(a.right, my);  c.stroke();
            c.setLineDash([]);

            // Quadrant labels
            const labels = [
                { text: 'Euphoric',      tx: a.right - 8,  ty: a.top + 14,      align: 'right' },
                { text: 'Intense',       tx: a.left  + 8,  ty: a.top + 14,      align: 'left'  },
                { text: 'Calm & Happy',  tx: a.right - 8,  ty: a.bottom - 10,   align: 'right' },
                { text: 'Melancholic',   tx: a.left  + 8,  ty: a.bottom - 10,   align: 'left'  },
            ];
            c.font = '600 11px Inter, sans-serif';
            c.fillStyle = 'rgba(255,255,255,0.18)';
            labels.forEach(({ text, tx, ty, align }) => {
                c.textAlign = align;
                c.textBaseline = 'top';
                c.fillText(text, tx, ty);
            });

            // Mini danceability legend (bottom-right corner)
            const tiers = [
                { label: 'High Dance',   color: COLORS.green  },
                { label: 'Mid Dance',    color: COLORS.blue   },
                { label: 'Low Dance',    color: COLORS.purple },
                { label: 'Non-Dance',    color: COLORS.pink   },
            ];
            const lx = a.right - 8;
            const ly = a.bottom - 10 - tiers.length * 18;
            c.font = '500 10px Inter, sans-serif';
            tiers.forEach(({ label, color }, i) => {
                const rowY = ly + i * 17;
                c.beginPath();
                c.arc(lx - 68, rowY + 5, 5, 0, Math.PI * 2);
                c.fillStyle = color + 'cc';
                c.fill();
                c.fillStyle = 'rgba(255,255,255,0.4)';
                c.textAlign = 'left';
                c.textBaseline = 'top';
                c.fillText(label, lx - 60, rowY);
            });

            c.restore();
        },
    };

    new Chart(ctx, {
        type: 'scatter',
        plugins: [quadrantPlugin],
        data: {
            datasets: [{
                label: 'Songs',
                data: scatter.map(s => ({ x: s.valence, y: s.energy })),
                backgroundColor: scatter.map(s => danceColor(s.danceability)),
                borderColor:     scatter.map(s => danceColor(s.danceability, 'ff')),
                borderWidth: 1,
                pointRadius:      radii,
                pointHoverRadius: radii.map(r => r + 3),
            }],
        },
        options: {
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10,10,15,0.92)',
                    borderColor: COLORS.green,
                    borderWidth: 1,
                    cornerRadius: 10,
                    padding: 14,
                    callbacks: {
                        title: () => '',
                        label(c) {
                            const s = scatter[c.dataIndex];
                            const quadrant =
                                s.energy > 0.5 && s.valence > 0.5 ? 'Euphoric'     :
                                s.energy > 0.5 && s.valence <= 0.5 ? 'Intense'     :
                                s.energy <= 0.5 && s.valence > 0.5 ? 'Calm & Happy' : 'Melancholic';
                            return [
                                `Energy: ${(s.energy * 100).toFixed(0)}%  ·  Valence: ${(s.valence * 100).toFixed(0)}%`,
                                `Dance: ${(s.danceability * 100).toFixed(0)}%  ·  ${quadrant}`,
                            ];
                        },
                    },
                },
            },
            scales: {
                x: {
                    title: { display: true, text: 'Valence (Positivity →)', color: '#a1a1aa', font: { weight: '600', size: 12 } },
                    min: 0, max: 1,
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#6b6b76', callback: v => `${(v * 100).toFixed(0)}%` },
                },
                y: {
                    title: { display: true, text: 'Energy →', color: '#a1a1aa', font: { weight: '600', size: 12 } },
                    min: 0, max: 1,
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#6b6b76', callback: v => `${(v * 100).toFixed(0)}%` },
                },
            },
        },
    });
}

// ─── Chart 6: Audio Features Radar ───────────────────────────

function renderRadarChart(averages) {
    const ctx = document.getElementById('radarChart').getContext('2d');
    const keys = ['energy', 'danceability', 'valence', 'acousticness', 'speechiness', 'liveness'];
    const labels = keys.map(k => k.charAt(0).toUpperCase() + k.slice(1));
    const values = keys.map(k => averages[k] || 0);

    new Chart(ctx, {
        type: 'radar',
        data: {
            labels,
            datasets: [{
                label: 'Your Average',
                data: values,
                backgroundColor: 'rgba(29, 185, 84, 0.2)',
                borderColor: COLORS.green,
                borderWidth: 2,
                pointBackgroundColor: COLORS.green,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7,
            }],
        },
        options: {
            scales: {
                r: {
                    beginAtZero: true,
                    max: 1,
                    ticks: {
                        stepSize: 0.2,
                        color: '#6b6b76',
                        backdropColor: 'transparent',
                        font: { size: 10 },
                    },
                    pointLabels: {
                        color: '#a1a1aa',
                        font: { size: 12, weight: '600' },
                    },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    angleLines: { color: 'rgba(255,255,255,0.06)' },
                },
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 15, 0.9)',
                    borderColor: COLORS.green,
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 12,
                    callbacks: {
                        label(c) {
                            return `${c.label}: ${(c.raw * 100).toFixed(0)}%`;
                        },
                    },
                },
            },
        },
    });
}

// ─── Chart 7: Day of Week Bar ────────────────────────────────


function renderDayChart(activityByDay) {
    const ctx = document.getElementById('dayChart').getContext('2d');
    const labels = Object.keys(activityByDay);
    const values = Object.values(activityByDay);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Tracks Played',
                data: values,
                backgroundColor: labels.map((_, i) => CHART_PALETTE[i] + '99'),
                borderColor: labels.map((_, i) => CHART_PALETTE[i]),
                borderWidth: 1.5,
                borderRadius: 8,
                borderSkipped: false,
            }],
        },
        options: {
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 15, 0.9)',
                    borderColor: COLORS.green,
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 12,
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#a1a1aa', font: { weight: '600' } },
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#6b6b76', stepSize: 1 },
                },
            },
        },
    });
}

// ─── Tracks List ─────────────────────────────────────────────

function renderTracksList(tracks) {
    const container = document.getElementById('tracks-list');
    container.innerHTML = tracks.map((track, i) => `
        <div class="track-item">
            <span class="track-rank">${i + 1}</span>
            ${track.image ? `<img class="track-image" src="${track.image}" alt="${track.name}">` : ''}
            <div class="track-info">
                <div class="track-name">${track.name}</div>
                <div class="track-artist">${track.artists}</div>
            </div>
            <span class="track-popularity">${track.popularity}</span>
        </div>
    `).join('');
}

// ─── Mood Profile & Music DNA ────────────────────────────────

function renderMoodProfile(moodProfile) {
    const container = document.getElementById('mood-card-content');
    if (!container || !moodProfile) return;

    const traits = (moodProfile.traits && moodProfile.traits.length)
        ? moodProfile.traits
        : ['Balanced Listener 🎧'];

    const traitPillsHTML = traits.map(t => `
        <span style="
            display: inline-block;
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 999px;
            padding: 6px 14px;
            font-size: 13px;
            color: #fff;
            font-weight: 500;
        ">${t}</span>
    `).join('');

    container.innerHTML = `
        <div style="padding: 24px;">
            <h2 class="chart-title">🧬 Your Music DNA</h2>
            <p class="chart-subtitle">Based on your audio feature averages</p>

            <div style="
                display: inline-block;
                margin-top: 12px;
                background: rgba(255,255,255,0.08);
                border: 1px solid rgba(255,255,255,0.12);
                border-radius: 999px;
                padding: 10px 20px;
                font-size: 16px;
                font-weight: 700;
                color: #fff;
                letter-spacing: -0.2px;
            ">${moodProfile.mood || '—'}</div>

            <p style="
                margin-top: 10px;
                font-size: 14px;
                color: rgba(255,255,255,0.6);
                line-height: 1.6;
                max-width: 420px;
            ">${moodProfile.mood_desc || ''}</p>

            <p style="
                margin-top: 16px;
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                color: #6b6b76;
                font-weight: 600;
            ">Your Traits</p>

            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                ${traitPillsHTML}
            </div>
        </div>
    `;
}


// ─── Recommendations Grid ─────────────────────────────────────


function renderRecommendations(tracks) {
    const section = document.getElementById('recs-section');
    const grid = document.getElementById('recs-grid');

    if (!tracks || tracks.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    grid.innerHTML = tracks.map(t => {
        const artists = Array.isArray(t.artists) ? t.artists.join(', ') : t.artists;
        const imgSrc = t.album_art || 'https://via.placeholder.com/160x160/1a1a2e/1DB954?text=♫';
        return `
        <a class="rec-card" href="${t.spotify_url}" target="_blank" rel="noopener noreferrer">
            <img class="rec-art" src="${imgSrc}" alt="${t.name}" loading="lazy"
                 onerror="this.src='https://via.placeholder.com/160x160/1a1a2e/1DB954?text=♫'">
            <div class="rec-info">
                <div class="rec-name">${t.name}</div>
                <div class="rec-artist">${artists}</div>
            </div>
        </a>
    `;
    }).join('');
}


