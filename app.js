// --- Config & State ---
let BACKEND_URL = localStorage.getItem('backend_url') || '';
let socket;

// Global State
const markers = {};
const localUserData = {};
// DOM Elements (will be assigned on load or just use getElementById lazy)
const userListElement = document.getElementById('user-list');
const connectionStatus = document.getElementById('connection-status');
const userCountElement = document.getElementById('user-count');


// If URL is saved or we are on the same domain (likely local dev), try connecting
// But if we are on Vercel and no URL is saved, we don't know where to connect.
function initSocket(url) {
    if (socket) {
        socket.disconnect();
    }

    // If url is empty, it defaults to window.location.host
    console.log('Connecting to:', url || 'Current Origin');
    socket = io(url, {
        reconnectionAttempts: 5,
        timeout: 10000,
        extraHeaders: {
            "ngrok-skip-browser-warning": "true"
        }
    });

    setupSocketListeners();
}

initSocket(BACKEND_URL);

// --- Settings Modal Logic ---
const settingsModal = document.getElementById('settings-modal');
const settingsBtn = document.getElementById('settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const serverUrlInput = document.getElementById('server-url-input');

settingsBtn.onclick = () => {
    serverUrlInput.value = localStorage.getItem('backend_url') || '';
    settingsModal.style.display = "block";
}

closeSettingsBtn.onclick = () => {
    settingsModal.style.display = "none";
}

saveSettingsBtn.onclick = () => {
    const url = serverUrlInput.value.trim();
    if (url) {
        localStorage.setItem('backend_url', url);
        BACKEND_URL = url;
        initSocket(url);
        settingsModal.style.display = "none";
        alert('Reconnecting to new server...');
    } else {
        localStorage.removeItem('backend_url');
        BACKEND_URL = '';
        initSocket(''); // Connect to self
        settingsModal.style.display = "none";
    }
}

// Close modal if clicking outside
window.onclick = (event) => {
    if (event.target == settingsModal) {
        settingsModal.style.display = "none";
    }
}

function setupSocketListeners() {
    // Connection Events
    socket.on('connect', () => {
        const connectionStatus = document.getElementById('connection-status');
        connectionStatus.textContent = 'Connected';
        connectionStatus.classList.remove('disconnected');
        connectionStatus.classList.add('connected');
        console.log('Connected to server');
    });

    socket.on('disconnect', () => {
        const connectionStatus = document.getElementById('connection-status');
        connectionStatus.textContent = 'Disconnected';
        connectionStatus.classList.remove('connected');
        connectionStatus.classList.add('disconnected');
    });

    socket.on('connect_error', (err) => {
        console.error('Connection Error:', err);
        const connectionStatus = document.getElementById('connection-status');
        connectionStatus.textContent = 'Error';
    });

    // 1. Initial Load
    socket.on('current-users', (users) => {
        // Clear existing data first
        for (const userId in localUserData) delete localUserData[userId];
        Object.assign(localUserData, users);

        // Clear existing markers not in new list
        Object.keys(markers).forEach(id => {
            if (!users[id]) removeMarker(id);
        });

        // Update map markers
        Object.values(users).forEach(user => updateMarker(user));

        // Update sidebar
        renderUserList();
    });

    // 2. Real-time updates
    socket.on('receive-location', (data) => {
        // console.log('Received location:', data);
        localUserData[data.id] = data;
        updateMarker(data);
        renderUserList();
    });

    // 3. Handle User Disconnect
    socket.on('user-disconnected', (userId) => {
        console.log('User disconnected:', userId);
        if (localUserData[userId]) {
            delete localUserData[userId];
            removeMarker(userId);
            renderUserList();
        }
    });
}

// Initialize Map
// Default view: Indonesia (approximate center)
const map = L.map('map', {
    zoomControl: false // We'll add it manually in the position we want
}).setView([-2.5489, 118.0149], 5);

// Add zoom control to bottom-right
L.control.zoom({
    position: 'bottomright'
}).addTo(map);

// Use CartoDB Voyager tiles for a more modern, premium look that matches the UI
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

// Robust fix for map rendering issues (grey screen) due to flexbox/layout shifts
function fixMapSize() {
    map.invalidateSize();
}

// Robust fix: Use ResizeObserver to detect container size changes automatically
const mapElement = document.getElementById('map');
const resizeObserver = new ResizeObserver(() => {
    map.invalidateSize();
});
resizeObserver.observe(mapElement);

// Fallback timeouts just in case
setTimeout(fixMapSize, 500);
setTimeout(fixMapSize, 2000);

// Variables moved to top


// Connection Events handled in setupSocketListeners


// Update Marker on Map
function updateMarker(data) {
    const { id, name, lat, lng, timestamp } = data;

    if (markers[id]) {
        // Move existing marker
        markers[id].setLatLng([lat, lng]);
        markers[id].bindPopup(`<b>${name}</b><br>Updated: ${new Date(timestamp).toLocaleTimeString()}`);
    } else {
        // Create new marker
        const marker = L.marker([lat, lng])
            .addTo(map)
            .bindPopup(`<b>${name}</b><br>Active Now`);
        markers[id] = marker;
    }
}

// Remove Marker
function removeMarker(userId) {
    if (markers[userId]) {
        map.removeLayer(markers[userId]);
        delete markers[userId];
    }
}

// Update Sidebar List
function renderUserList() {
    userListElement.innerHTML = '';
    const users = Object.values(localUserData);

    userCountElement.textContent = `Active Users: ${users.length}`;

    if (users.length === 0) {
        userListElement.innerHTML = '<li class="empty-message">No users connected yet...</li>';
        return;
    }

    users.forEach(user => {
        const li = document.createElement('li');
        li.className = 'user-item';
        // Get initial from name for avatar
        const initial = user.name ? user.name.charAt(0).toUpperCase() : '?';

        li.innerHTML = `
            <div class="user-avatar">${initial}</div>
            <div class="user-info">
                <h3>${user.name}</h3>
                <p>Lat: ${user.lat.toFixed(4)}, Lng: ${user.lng.toFixed(4)}</p>
                <p style="font-size:0.7rem; opacity:0.8; margin-top:2px;">Last seen: ${new Date(user.timestamp).toLocaleTimeString()}</p>
            </div>
        `;
        li.onclick = () => {
            // Fly to location when clicked in list
            map.flyTo([user.lat, user.lng], 16);
            if (markers[user.id]) markers[user.id].openPopup();
        };
        userListElement.appendChild(li);
    });
}

// Socket Listeners handled in setupSocketListeners


// UI Interactions - Sidebar Toggle
const sidebar = document.querySelector('.sidebar');
const mainContainer = document.querySelector('main');

// Desktop toggle functionality
const openBtn = document.getElementById('sidebar-open');
const closeBtn = document.getElementById('sidebar-close');

if (openBtn) {
    openBtn.addEventListener('click', () => {
        mainContainer.classList.remove('sidebar-collapsed');
        setTimeout(() => map.invalidateSize(), 400);
    });
}

if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        mainContainer.classList.add('sidebar-collapsed');
        setTimeout(() => map.invalidateSize(), 400);
    });
}

// Mobile interaction - Simple tap to toggle
const isMobile = () => window.innerWidth <= 768;

if (sidebar) {
    const sidebarHeader = sidebar.querySelector('.sidebar-header');

    if (sidebarHeader) {
        // Simple click/tap handler
        sidebarHeader.addEventListener('click', (e) => {
            console.log('Header clicked, isMobile:', isMobile());
            if (!isMobile()) return;

            const wasExpanded = sidebar.classList.contains('expanded');
            sidebar.classList.toggle('expanded');

            // Toggle body class for zoom controls positioning
            document.body.classList.toggle('sidebar-expanded', !wasExpanded);

            console.log('Toggled sidebar, now expanded:', !wasExpanded);

            setTimeout(() => map.invalidateSize(), 400);
        });

        // Touch handler for better mobile support
        let touchStartTime = 0;

        sidebarHeader.addEventListener('touchstart', (e) => {
            touchStartTime = Date.now();
        }, { passive: true });

        sidebarHeader.addEventListener('touchend', (e) => {
            const touchDuration = Date.now() - touchStartTime;

            // Only trigger if it was a quick tap (not a long press or scroll)
            if (touchDuration < 300 && isMobile()) {
                e.preventDefault();
                const wasExpanded = sidebar.classList.contains('expanded');
                sidebar.classList.toggle('expanded');

                // Toggle body class for zoom controls positioning
                document.body.classList.toggle('sidebar-expanded', !wasExpanded);

                console.log('Touch toggle, expanded:', !wasExpanded);
                setTimeout(() => map.invalidateSize(), 400);
            }
        });
    }
}

// Initialize state
function initializeSidebarState() {
    if (isMobile()) {
        sidebar.classList.remove('expanded'); // Start collapsed on mobile
    } else {
        mainContainer.classList.remove('sidebar-collapsed'); // Start open on desktop
    }
    setTimeout(() => map.invalidateSize(), 100);
}

initializeSidebarState();

// Handle window resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        initializeSidebarState();
        map.invalidateSize();
    }, 200);
});
