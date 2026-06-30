document.addEventListener('DOMContentLoaded', () => {
    // Subtle 3D tilt effect on the glass card based on mouse movement
    const card = document.querySelector('.glass-card');
    const heroVisual = document.querySelector('.hero-visual');

    if (card && heroVisual) {
        // Handle screen resizing - effect works best on desktop
        const isMobile = window.matchMedia('(max-width: 900px)').matches;

        if (!isMobile) {
            heroVisual.addEventListener('mousemove', (e) => {
                const rect = heroVisual.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                const rotateX = ((y - centerY) / centerY) * -15; // Max 15 degree rotation
                const rotateY = ((x - centerX) / centerX) * 15;

                // Add smooth transition for the movement
                card.style.transition = 'none';
                card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
            });

            heroVisual.addEventListener('mouseleave', () => {
                // Restore original transformation on mouse leave
                card.style.transition = 'transform 0.5s ease';
                card.style.transform = `rotateY(-10deg) rotateX(10deg)`;
            });

            heroVisual.addEventListener('mouseenter', () => {
                // Remove transition when entering so movement is immediate
                card.style.transition = 'transform 0.1s ease';
            });
        }
    }

    // Hamburger Menu Logic
    const navSlide = () => {
        const hamburger = document.querySelector('.hamburger');
        const nav = document.querySelector('.navbar-right');
        const navLinks = document.querySelectorAll('.navbar-right > div');

        if (hamburger && nav) {
            hamburger.addEventListener('click', () => {
                // Toggle Nav
                nav.classList.toggle('nav-active');

                // Animate Links
                navLinks.forEach((link, index) => {
                    if (link.style.animation) {
                        link.style.animation = '';
                    } else {
                        link.style.animation = `navLinkFade 0.5s ease forwards ${index / 7 + 0.3}s`;
                    }
                });

                // Hamburger Animation
                hamburger.classList.toggle('toggle');
            });
        }
    }

    navSlide();

    // Conditional Navbar Icons Visibility (Dashboard only)
    const updateNavbarVisibility = () => {
        const path = window.location.pathname.toLowerCase();
        const isDashboard = path.includes("/dashboard");

        const guide = document.getElementById("guideIcon");
        const notif = document.getElementById("notificationIcon");

        if (!isDashboard) {
            // Use setProperty with 'important' to override guide.css display:flex
            if (guide) guide.style.setProperty("display", "none", "important");
            if (notif) notif.style.setProperty("display", "none", "important");
        } else {
            if (guide) guide.style.removeProperty("display");
            if (notif) notif.style.removeProperty("display");
        }
    };

    // Run immediately after DOM ready
    updateNavbarVisibility();
    // Run again after guide.js has had time to inject/execute
    setTimeout(updateNavbarVisibility, 200);
});

// Navbar Dropdown Logic
window.toggleNotifications = function(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('notifDropdown');
    const profileDropdown = document.getElementById('profileDropdown');
    if (profileDropdown) profileDropdown.classList.remove('active');
    if (dropdown) dropdown.classList.toggle('active');
};

window.toggleProfileDropdown = function(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('profileDropdown');
    const notifDropdown = document.getElementById('notifDropdown');
    if (notifDropdown) notifDropdown.classList.remove('active');
    if (dropdown) dropdown.classList.toggle('active');
};

window.addEventListener('click', function(event) {
    const notifDropdown = document.getElementById('notifDropdown');
    const profileDropdown = document.getElementById('profileDropdown');
    if (notifDropdown && notifDropdown.classList.contains('active')) {
        notifDropdown.classList.remove('active');
    }
    if (profileDropdown && profileDropdown.classList.contains('active')) {
        profileDropdown.classList.remove('active');
    }
});

// Animation Keyframes for mobile nav links
const style = document.createElement('style');
style.innerHTML = `
@keyframes navLinkFade {
    from {
        opacity: 0;
        transform: translateX(50px);
    }
    to {
        opacity: 1;
        transform: translateX(0px);
    }
}
`;
document.head.appendChild(style);

/**
 * Global Password Toggle Logic
 * @param {string} inputId - The ID of the password input field
 * @param {HTMLElement} btn - The button element that triggered the toggle
 */
window.togglePasswordVisibility = function(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;

    if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '🔒'; // Hide icon
        btn.setAttribute('aria-label', 'Hide Password');
    } else {
        input.type = 'password';
        btn.innerHTML = '👁️'; // Show icon
        btn.setAttribute('aria-label', 'Show Password');
    }
    
    // Add a quick feedback animation
    btn.style.transform = 'translateY(-50%) scale(0.8)';
    setTimeout(() => {
        btn.style.transform = 'translateY(-50%) scale(1.1)';
        setTimeout(() => btn.style.transform = 'translateY(-50%)', 100);
    }, 100);
};

/**
 * Global Password Strength Logic
 * @param {string} value - The password string
 * @param {string} indicatorId - The ID of the indicator element
 */
window.updatePasswordStrength = function(value, indicatorId) {
    const indicator = document.getElementById(indicatorId);
    if (!indicator) return;

    if (!value) {
        indicator.innerHTML = '';
        indicator.className = 'password-strength';
        return;
    }

    let strength = 0;
    let label = 'Weak';
    let colorClass = 'strength-weak';

    if (value.length > 6) strength++;
    if (/[0-9]/.test(value)) strength++;
    if (/[^A-Za-z0-9]/.test(value)) strength++;

    if (strength === 2) {
        label = 'Medium';
        colorClass = 'strength-medium';
    } else if (strength === 3) {
        label = 'Strong';
        colorClass = 'strength-strong';
    }

    indicator.innerHTML = `Strength: <span class="${colorClass}">${label}</span>`;
};

/**
 * Global Guest Helpers
 */
window.isGuestUser = function() {
    return localStorage.getItem('guestMode') === 'true';
};

window.showGuestIntimationModal = function() {
    // Check if modal already exists
    let modal = document.getElementById('guestIntimationModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'guestIntimationModal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '1100'; // Make sure it sits above other modals
        modal.innerHTML = `
            <div class="modal-content" style="text-align: center; max-width: 400px; border-color: var(--accent-secondary); box-shadow: 0 0 30px rgba(232, 67, 147, 0.2); background: var(--bg-color); padding: 2.5rem; border-radius: 20px; border: 1px solid var(--glass-border);">
                <div class="modal-header" style="justify-content: center; margin-bottom: 1.5rem; display: flex; align-items: center;">
                    <h2 style="font-size: 1.8rem; margin: 0;">🔒 Join <span>SwapPay</span></h2>
                </div>
                <p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 2rem; font-size: 0.95rem;">
                    You are currently browsing in <strong>Guest Mode</strong>. To request swaps, match with partners, chat, or customize settings, please create an account or log in.
                </p>
                <div style="display: flex; flex-direction: column; gap: 0.8rem;">
                    <a href="/register" class="btn-submit" style="text-decoration: none; display: block; background: linear-gradient(135deg, var(--accent-primary), #8e7dfa); color: white; text-align: center; font-weight: 800; padding: 1rem; border-radius: 12px;">Sign Up Now</a>
                    <a href="/login" class="btn-submit" style="text-decoration: none; display: block; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); color: var(--text-primary); text-align: center; font-weight: 800; padding: 1rem; border-radius: 12px;">Log In</a>
                    <button type="button" onclick="document.getElementById('guestIntimationModal').classList.remove('active')" style="background: none; border: none; color: var(--text-secondary); margin-top: 0.5rem; cursor: pointer; font-weight: 600; font-size: 0.95rem;">Continue Exploring</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.classList.add('active');
};

// Inject Guest Mode Banner if active
document.addEventListener('DOMContentLoaded', () => {
    if (window.isGuestUser()) {
        const path = window.location.pathname.toLowerCase();
        // Show banner on dashboard, profile, settings, support, etc.
        if (path.includes('/dashboard') || path.includes('/profile') || path.includes('/settings') || path.includes('/support')) {
            const banner = document.createElement('div');
            banner.id = 'guestModeBanner';
            banner.style.cssText = `
                background: linear-gradient(90deg, rgba(232, 67, 147, 0.15), rgba(108, 92, 231, 0.15));
                border-bottom: 1px solid var(--accent-secondary);
                color: var(--text-primary);
                text-align: center;
                padding: 0.8rem 1rem;
                font-size: 0.95rem;
                font-weight: 600;
                position: sticky;
                top: 70px; /* Right below the navbar */
                z-index: 999;
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 1rem;
            `;
            banner.innerHTML = `
                <span>👀 You are exploring in <strong>Guest Mode</strong> (Read-Only).</span>
                <a href="/register" style="color: var(--accent-secondary); text-decoration: none; background: rgba(232, 67, 147, 0.2); padding: 0.3rem 0.8rem; border-radius: 50px; font-size: 0.85rem; border: 1px solid var(--accent-secondary); font-weight: bold;">Sign Up</a>
                <a href="/login" style="color: var(--text-primary); text-decoration: none; background: rgba(255, 255, 255, 0.1); padding: 0.3rem 0.8rem; border-radius: 50px; font-size: 0.85rem; border: 1px solid var(--glass-border); font-weight: bold;">Log In</a>
            `;
            
            // Insert banner right after navbar
            const navbar = document.querySelector('.navbar');
            if (navbar) {
                navbar.parentNode.insertBefore(banner, navbar.nextSibling);
            } else {
                document.body.insertBefore(banner, document.body.firstChild);
            }
        }
    }
});
