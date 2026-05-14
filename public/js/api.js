/**
 * Centralized API configuration for SwapPay
 * Handles cross-origin requests, credentials, and environment detection.
 */

// Auto-detect environment based on hostname
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// Provide the centralized API_BASE_URL
window.API_BASE_URL = isLocalhost 
    ? 'http://localhost:3000' 
    : 'https://swappay-backend.onrender.com';

/**
 * Global fetch wrapper for API calls
 * Automatically prepends the base URL and adds credentials.
 * 
 * @param {string} endpoint - The API endpoint (e.g., '/api/auth/login')
 * @param {Object} options - Standard fetch options
 * @returns {Promise<Response>}
 */
window.apiFetch = async function(endpoint, options = {}) {
    // If the endpoint already contains http, use it directly, otherwise prepend base URL
    const url = endpoint.startsWith('http') ? endpoint : window.API_BASE_URL + endpoint;
    
    const defaultOptions = {
        credentials: 'include', // Required for cross-origin cookies (sessions)
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    };
    
    // Merge headers safely
    const headers = { ...defaultOptions.headers, ...(options.headers || {}) };
    
    // Remove Content-Type if we're sending FormData (browser sets it automatically with boundary)
    if (options.body && options.body instanceof FormData) {
        delete headers['Content-Type'];
    }

    const finalOptions = {
        ...defaultOptions,
        ...options,
        headers
    };

    try {
        const response = await fetch(url, finalOptions);
        return response;
    } catch (error) {
        console.error(`API Fetch Error [${url}]:`, error);
        throw error;
    }
};

/**
 * Global Socket.IO initializer
 * Ensures WebSocket connects to the correct backend URL with credentials.
 */
window.initSocket = function() {
    if (typeof io !== 'undefined') {
        return io(window.API_BASE_URL, {
            withCredentials: true,
            transports: ['polling', 'websocket'], // polling first — required for Render proxy
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
            timeout: 20000
        });
    } else {
        console.warn('Socket.IO (io) is not defined. Ensure socket.io.js is loaded.');
        return null;
    }
};
