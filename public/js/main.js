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
});

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
    btn.style.transform = 'scale(0.8)';
    setTimeout(() => {
        btn.style.transform = 'scale(1.1)';
        setTimeout(() => btn.style.transform = '', 100);
    }, 100);
};
