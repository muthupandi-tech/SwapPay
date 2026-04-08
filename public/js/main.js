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
