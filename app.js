// --- Config & State ---
// Default to localhost:3000 if not set, or use the one from settings
let BACKEND_HOST = localStorage.getItem('backend_url') || 'http://localhost:3000';
BACKEND_HOST = BACKEND_HOST.replace(/\/$/, "");

const API_URL = `${BACKEND_HOST}/api`;
let socket;

// --- Global DOM Elements ---
const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const loginContainer = document.getElementById('login-container');
const registerContainer = document.getElementById('register-container');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');

// Navbar Elements
const navAvatarIcon = document.getElementById('navbar-avatar-icon');
const navAvatarImg = document.getElementById('navbar-avatar-img');
const navUsername = document.getElementById('navbar-username');

// --- Auth State Management (SPA) ---
function checkAuth() {
    const token = localStorage.getItem('token');

    if (token) {
        // Logged In -> Show Dashboard
        authView.style.display = 'none';
        dashboardView.style.display = 'block';

        updateNavbarProfile(); // Initial render from cache
        fetchUserProfile();    // Silent update from server to get latest photo/name

        // Initialize Socket & Map if not already done
        if (!socket) {
            initSocket(BACKEND_HOST);
            setTimeout(() => map.invalidateSize(), 500); // Fix map render
        }
    } else {
        // Logged Out -> Show Login
        authView.style.display = 'flex';
        dashboardView.style.display = 'none';
        showLogin(); // Reset to login form

        if (socket) {
            socket.disconnect();
            socket = null;
        }
    }
}

// Helper: Update Navbar Profile
function updateNavbarProfile() {
    try {
        const userStr = localStorage.getItem('user');

        if (userStr) {
            const user = JSON.parse(userStr);
            navUsername.textContent = user.name || 'Profile';

            if (user.profilePicturePath) {
                navAvatarImg.src = user.profilePicturePath;
                navAvatarImg.style.display = 'block';
                navAvatarIcon.style.display = 'none';
            } else {
                navAvatarImg.style.display = 'none';
                navAvatarIcon.style.display = 'flex';
            }
        }
    } catch (e) { console.error('Error updating navbar', e); }
}

// Helper to switch forms
window.showLogin = () => {
    loginContainer.style.display = 'block';
    registerContainer.style.display = 'none';
    loginError.style.display = 'none';
};

window.showRegister = () => {
    loginContainer.style.display = 'none';
    registerContainer.style.display = 'block';
    registerError.style.display = 'none';
};

// --- Form Handlers ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            checkAuth(); // Switch view
        } else {
            loginError.textContent = data.message || 'Login failed';
            loginError.style.display = 'block';
        }
    } catch (err) {
        loginError.textContent = 'Connection error. Check backend.';
        loginError.style.display = 'block';
        console.error(err);
    }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    try {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();

        if (res.ok) {
            alert('Registration successful! Please login.');
            showLogin();
        } else {
            registerError.textContent = data.message || 'Registration failed';
            registerError.style.display = 'block';
        }
    } catch (err) {
        registerError.textContent = 'Connection error. Check backend.';
        registerError.style.display = 'block';
        console.error(err);
    }
});

// Logout Logic
document.getElementById('logout-btn').onclick = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    checkAuth(); // Switch view
    document.getElementById('profile-modal').style.display = 'none';
};

// --- Run Auth Check on Load ---
checkAuth();


// ==========================================
//    DASHBOARD LOGIC (Map, Socket, etc.)
// ==========================================

// Global State
const markers = {};
const localUserData = {};
// DOM Elements
const userListElement = document.getElementById('user-list');
const connectionStatus = document.getElementById('connection-status');
const userCountElement = document.getElementById('user-count');

// --- Profile Elements ---
const profileBtn = document.getElementById('profile-btn');
const profileModal = document.getElementById('profile-modal');
const closeProfileBtn = document.getElementById('close-profile-btn');
const photoUploadInput = document.getElementById('photo-upload');
const profileImg = document.getElementById('profile-picture');
const profileNameInput = document.getElementById('profile-name');
const profileEmailInput = document.getElementById('profile-email');

// --- Init Socket ---
function initSocket(url) {
    if (socket) return; // Already init

    const token = localStorage.getItem('token');
    console.log('Connecting socket to:', url);

    socket = io(url, {
        reconnectionAttempts: 5,
        timeout: 10000,
        extraHeaders: {
            "ngrok-skip-browser-warning": "true",
            "Authorization": `Bearer ${token}`
        },
        auth: { token }
    });

    setupSocketListeners();
}


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
closeSettingsBtn.onclick = () => settingsModal.style.display = "none";

saveSettingsBtn.onclick = () => {
    let url = serverUrlInput.value.trim();
    if (url) {
        if (!url.startsWith('http')) url = 'https://' + url;
        localStorage.setItem('backend_url', url);
        // Reload to apply new URL cleanly
        window.location.reload();
    } else {
        localStorage.removeItem('backend_url');
        window.location.reload();
    }
}

// --- Profile Modal Logic ---
profileBtn.onclick = async () => {
    profileModal.style.display = "block";
    await fetchUserProfile();
}
closeProfileBtn.onclick = () => profileModal.style.display = "none";

// Close modals if clicking outside
window.onclick = (event) => {
    if (event.target == settingsModal) settingsModal.style.display = "none";
    if (event.target == profileModal) profileModal.style.display = "none";
}

// Fetch User Profile
async function fetchUserProfile() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const res = await fetch(`${API_URL}/users/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const user = await res.json();

            // Update UI
            profileNameInput.value = user.name;
            profileEmailInput.value = user.email;
            if (user.profilePicturePath) {
                const url = user.profilePicturePath + `?t=${Date.now()}`;
                profileImg.src = url;
                profileImg.style.display = 'block'; // Show Image
                document.getElementById('profile-initial-avatar').style.display = 'none'; // Hide Initial

                // Update Local & Navbar
                user.profilePicturePath = url;
            } else {
                profileImg.style.display = 'none';
                document.getElementById('profile-initial-avatar').style.display = 'flex';
            }

            // Update LocalStorage to keep sync
            localStorage.setItem('user', JSON.stringify(user));
            updateNavbarProfile();

        } else {
            if (res.status === 401) {
                document.getElementById('logout-btn').click();
            }
        }
    } catch (err) {
        console.error(err);
    }
}

// Upload Photo
photoUploadInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const token = localStorage.getItem('token');

    const formData = new FormData();
    formData.append('photo', file);

    try {
        profileImg.style.opacity = '0.5';
        const res = await fetch(`${API_URL}/users/upload-photo`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();

        if (res.ok) {
            const newUrl = data.imageUrl + `?t=${Date.now()}`;
            profileImg.src = newUrl;

            // Update LocalStorage & Navbar
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            user.profilePicturePath = newUrl;
            localStorage.setItem('user', JSON.stringify(user));
            updateNavbarProfile();

            alert('Photo updated successfully!');
        } else {
            alert(data.message || 'Upload failed');
        }
    } catch (err) {
        console.error(err);
        alert('Error uploading photo');
    } finally {
        profileImg.style.opacity = '1';
    }
};


// --- Socket Logic ---
function setupSocketListeners() {
    socket.on('connect', () => {
        connectionStatus.textContent = 'Connected';
        connectionStatus.classList.remove('disconnected');
        connectionStatus.classList.add('connected');
    });

    socket.on('disconnect', () => {
        connectionStatus.textContent = 'Disconnected';
        connectionStatus.classList.remove('connected');
        connectionStatus.classList.add('disconnected');
    });

    socket.on('current-users', (users) => {
        for (const userId in localUserData) delete localUserData[userId];
        Object.assign(localUserData, users);

        Object.keys(markers).forEach(id => {
            if (!users[id]) removeMarker(id);
        });
        Object.values(users).forEach(user => updateMarker(user));
        renderUserList();
    });

    socket.on('receive-location', (data) => {
        localUserData[data.id] = data;
        updateMarker(data);
        renderUserList();
    });

    socket.on('user-disconnected', (userId) => {
        if (localUserData[userId]) {
            delete localUserData[userId];
            removeMarker(userId);
            renderUserList();
        }
    });
}

// --- Map Logic ---
const map = L.map('map', { zoomControl: false }).setView([-2.5489, 118.0149], 5);

L.control.zoom({ position: 'bottomright' }).addTo(map);

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

// Update Marker
function updateMarker(data) {
    const { id, name, lat, lng, timestamp } = data;

    // NOTE: If you want to customize markers with avatars, use L.divIcon here

    if (markers[id]) {
        markers[id].setLatLng([lat, lng]);
        markers[id].bindPopup(`<b>${name}</b><br>Updated: ${new Date(timestamp).toLocaleTimeString()}`);
    } else {
        const marker = L.marker([lat, lng])
            .addTo(map)
            .bindPopup(`<b>${name}</b><br>Active Now`);
        markers[id] = marker;
    }
}

function removeMarker(userId) {
    if (markers[userId]) {
        map.removeLayer(markers[userId]);
        delete markers[userId];
    }
}

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

        let avatarHtml;
        if (user.profilePicturePath) {
            avatarHtml = `<img src="${user.profilePicturePath}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
        } else {
            const initial = user.name ? user.name.charAt(0).toUpperCase() : '?';
            avatarHtml = initial;
        }

        li.innerHTML = `
            <div class="user-avatar" style="overflow:hidden;">${avatarHtml}</div>
            <div class="user-info">
                <h3>${user.name}</h3>
                <p>Lat: ${user.lat.toFixed(4)}, Lng: ${user.lng.toFixed(4)}</p>
                <p style="font-size:0.7rem; opacity:0.8; margin-top:2px;">Last seen: ${new Date(user.timestamp).toLocaleTimeString()}</p>
            </div>
        `;
        li.onclick = () => {
            map.flyTo([user.lat, user.lng], 16);
            if (markers[user.id]) markers[user.id].openPopup();
        };
        userListElement.appendChild(li);
    });
}

// --- Sidebar Interaction ---
const sidebar = document.querySelector('.sidebar');
const mainContainer = document.querySelector('main');
const openBtn = document.getElementById('sidebar-open');
const closeBtn = document.getElementById('sidebar-close');
const isMobile = () => window.innerWidth <= 768;

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
if (sidebar) {
    const sidebarHeader = sidebar.querySelector('.sidebar-header');
    if (sidebarHeader) {
        sidebarHeader.addEventListener('click', (e) => {
            if (!isMobile()) return;
            const wasExpanded = sidebar.classList.contains('expanded');
            sidebar.classList.toggle('expanded');
            document.body.classList.toggle('sidebar-expanded', !wasExpanded);
            setTimeout(() => map.invalidateSize(), 400);
        });
    }
}

// Responsive Logic
function initializeSidebarState() {
    if (isMobile()) {
        sidebar.classList.remove('expanded');
    } else {
        mainContainer.classList.remove('sidebar-collapsed');
    }
    setTimeout(() => map.invalidateSize(), 100);
}
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        initializeSidebarState();
        map.invalidateSize();
    }, 200);
});

// Initial call
initializeSidebarState();
