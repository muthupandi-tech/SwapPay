/**
 * SwapPay Guide System
 * Globally injectable guide modal and navbar icon
 */

(function () {
    const guideHTML = `
    <div class="guide-modal-overlay" id="guideModal">
        <div class="guide-modal-content">
            <div class="guide-header">
                <h2>Swap<span>Pay</span> Guide</h2>
                <button class="btn-guide-close" id="guideCloseTop" style="padding: 0.5rem; background: transparent; color: var(--text-secondary);">&times;</button>
            </div>
            
            <div class="guide-search-container">
                <input type="text" class="guide-search-input" id="guideSearch" placeholder="Search for help (e.g. 'how to swap', 'matching', 'rules')...">
            </div>

            <div class="guide-body" id="guideBody">
                <!-- Section 1 -->
                <section class="guide-section" data-keywords="create swap request upi cash dashboard">
                    <h3><span class="icon">🔹</span> 1. How to Create a Swap Request</h3>
                    <div class="guide-card">
                        <ul class="guide-steps">
                            <li>Go to your <span class="highlight-accent">Dashboard</span></li>
                            <li>Choose your need: <span class="highlight-accent">Need UPI</span> OR <span class="highlight-accent">Need Cash</span></li>
                            <li>Enter the exact amount you wish to exchange</li>
                            <li>Click "Create Request"</li>
                            <li>Your request will instantly appear in the system and the public feed</li>
                        </ul>
                    </div>
                </section>

                <!-- Section 2 -->
                <section class="guide-section" data-keywords="matching works opposite needs direct crowd swap">
                    <h3><span class="icon">🔹</span> 2. How Matching Works</h3>
                    <div class="guide-card">
                        <p style="margin-bottom: 1rem; color: var(--text-secondary);">Our smart algorithm connects you with peers who have the exact opposite requirement at your location.</p>
                        <ul class="guide-steps">
                            <li><strong>Same Amount:</strong> You get a <span class="highlight-accent">Direct Match</span> for a one-to-one exchange.</li>
                            <li><strong>Different Amounts:</strong> You may get a <span class="highlight-accent">Partial Match</span> through our Crowd Swap system.</li>
                        </ul>
                    </div>
                </section>

                <!-- Section 3 -->
                <section class="guide-section" data-keywords="crowd swap larger amount multiple smaller combines">
                    <h3><span class="icon">🔹</span> 3. Crowd Swap (Smart Filling)</h3>
                    <div class="guide-card">
                        <ul class="guide-steps">
                            <li>If you request a larger amount, the system doesn't make you wait for a single match.</li>
                            <li>Multiple users with smaller amounts can match with your request.</li>
                            <li>The system combines these matches to fulfill your total request step-by-step.</li>
                        </ul>
                        <div class="guide-note">
                            <span>💡</span>
                            <span>This ensures your request is completed faster than waiting for a single identical match.</span>
                        </div>
                    </div>
                </section>

                <!-- Section 4 -->
                <section class="guide-section" data-keywords="accepting swap feed matches accept chat partner">
                    <h3><span class="icon">🔹</span> 4. Accepting a Swap</h3>
                    <div class="guide-card">
                        <ul class="guide-steps">
                            <li>Go to the <span class="highlight-accent">Swap Feed</span> or your <span class="highlight-accent">Matched</span> tab.</li>
                            <li>Browse available swaps that meet your criteria.</li>
                            <li>Click "Accept" on a swap you want to fulfill.</li>
                            <li>Start a secure <span class="highlight-accent">Chat</span> with your partner to coordinate.</li>
                            <li>Meet in person to complete the transaction safely.</li>
                        </ul>
                    </div>
                </section>

                <!-- Section 5 -->
                <section class="guide-section" data-keywords="completing swap mark completed confirmation partner">
                    <h3><span class="icon">🔹</span> 5. Completing a Swap</h3>
                    <div class="guide-card">
                        <ul class="guide-steps">
                            <li>Once the physical exchange is done, go to your Active/Matched tab.</li>
                            <li>Click <span class="highlight-accent">"Mark as Completed"</span>.</li>
                            <li>Wait for your partner to also confirm the completion.</li>
                            <li>Successfully completed swaps move to your <span class="highlight-accent">Completed History</span> and boost your score.</li>
                        </ul>
                    </div>
                </section>

                <!-- Section 6 -->
                <section class="guide-section" data-keywords="chat system coordinate meeting details">
                    <h3><span class="icon">🔹</span> 6. Using the Chat System</h3>
                    <div class="guide-card">
                        <p style="color: var(--text-secondary);">Communication is key to a successful swap!</p>
                        <ul class="guide-steps">
                            <li>Use the built-in chat to coordinate a safe public meeting spot.</li>
                            <li>Confirm the amount and payment method one last time before meeting.</li>
                            <li>Keep all communication with in the platform for your safety.</li>
                        </ul>
                    </div>
                </section>

                <!-- Section 7 -->
                <section class="guide-section" data-keywords="trust score increase decrease cancel delay matches">
                    <h3><span class="icon">🔹</span> 7. Trust Score & Reputation</h3>
                    <div class="guide-card">
                        <ul class="guide-steps">
                            <li><strong>Increase:</strong> Your score goes up when you complete swaps and receive positive feedback.</li>
                            <li><strong>Decrease:</strong> Score drops if you cancel matches, delay confirmations, or behave dishonestly.</li>
                            <li><strong>Impact:</strong> Users with high trust scores get priority matching and are more likely to be accepted by others.</li>
                        </ul>
                    </div>
                </section>

                <!-- Section 8 Rules -->
                <section class="guide-section" data-keywords="rules guidelines honest respect fake requests">
                    <h3><span class="icon">📋</span> Rules & Guidelines</h3>
                    <div class="rules-section">
                        <div class="rules-list">
                            <div class="rule-item">Always confirm before marking completed</div>
                            <div class="rule-item">Do not create fake requests</div>
                            <div class="rule-item">Be honest in all transactions</div>
                            <div class="rule-item">Respect other students</div>
                            <div class="rule-item">Complete swaps on time</div>
                            <div class="rule-item">Do not misuse the platform</div>
                        </div>
                        <div class="warning-text">⚠️ Violation may reduce your trust score or lead to account suspension.</div>
                    </div>
                </section>
                
                <div id="noResults" style="display: none; text-align: center; padding: 2rem; color: var(--text-secondary);">
                    No guide sections found matching your search.
                </div>
            </div>

            <div class="guide-footer">
                <button class="btn-guide-close" id="guideCloseBottom">Got it, Thanks!</button>
            </div>
        </div>
    </div>
    `;

    // Function to inject everything
    function initGuide() {
        // 1. Inject CSS and HTML if not already there
        if (!document.getElementById('guideModal')) {
            const container = document.createElement('div');
            container.innerHTML = guideHTML;
            document.body.appendChild(container);
        }

        // 2. Inject Navbar Icon
        let guideToggle = document.getElementById('guideToggle');
        
        if (!guideToggle) {
            const navLinks = document.querySelector('.nav-links') || document.querySelector('.navbar-right');
            const notifContainer = document.querySelector('.notification-container');

            if (navLinks && notifContainer) {
                const guideLi = document.createElement('div');
                guideLi.className = 'guide-nav-icon';
                guideLi.id = 'guideToggle';
                guideLi.innerHTML = `📘<span class="guide-tooltip">Guide</span>`;

                // Insert before notification container
                navLinks.insertBefore(guideLi, notifContainer);
                guideToggle = guideLi;
            }
        }

        if (guideToggle) {
            // Add Click Event
            guideToggle.addEventListener('click', openGuide);
        }

        // 3. Modal Events
        const modal = document.getElementById('guideModal');
        const searchInput = document.getElementById('guideSearch');
        const sections = document.querySelectorAll('.guide-section');
        const noResults = document.getElementById('noResults');

        function openGuide() {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden'; // Prevent scroll
        }

        function closeGuide() {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }

        document.getElementById('guideCloseTop').onclick = closeGuide;
        document.getElementById('guideCloseBottom').onclick = closeGuide;
        modal.onclick = (e) => { if (e.target === modal) closeGuide(); };

        // 4. Search Logic
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                let hasResults = false;

                sections.forEach(section => {
                    const keywords = section.getAttribute('data-keywords');
                    const text = section.innerText.toLowerCase();

                    if (text.includes(term) || keywords.includes(term)) {
                        section.classList.remove('hidden');
                        hasResults = true;
                    } else {
                        section.classList.add('hidden');
                    }
                });

                noResults.style.display = hasResults ? 'none' : 'block';
            });
        }
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGuide);
    } else {
        initGuide();
    }
})();
