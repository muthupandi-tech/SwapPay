document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.getElementById('contactForm');
    const sendBtn = document.getElementById('sendMessageBtn');
    const statusDiv = document.getElementById('contactStatus');

    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Reset status
            statusDiv.style.display = 'none';
            statusDiv.className = '';
            statusDiv.innerText = '';

            // Get form values
            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const message = document.getElementById('message').value.trim();

            // Client-side validation
            if (!name || !email || !message) {
                showStatus('All fields are required.', 'error');
                return;
            }

            // Disable button
            const originalBtnText = sendBtn.innerText;
            sendBtn.innerText = 'Sending...';
            sendBtn.disabled = true;

            try {
                const response = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, message })
                });

                const data = await response.json();

                if (response.ok) {
                    showStatus(data.message || 'Message sent successfully ✅', 'success');
                    contactForm.reset();
                } else {
                    showStatus(data.error || 'Failed to send message. Please try again.', 'error');
                }
            } catch (err) {
                console.error('Contact form error:', err);
                showStatus('Network error. Please try again later.', 'error');
            } finally {
                sendBtn.innerText = originalBtnText;
                sendBtn.disabled = false;
            }
        });
    }

    function showStatus(msg, type) {
        statusDiv.innerText = msg;
        statusDiv.className = type === 'success' ? 'status-success' : 'status-error';
        statusDiv.style.display = 'block';

        // Auto-hide success message after 5 seconds
        if (type === 'success') {
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 5000);
        }
    }
});
