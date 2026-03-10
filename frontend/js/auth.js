/**
 * Spotify Listening Analyzer — auth.js
 * Handles login page interactions and error display.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Check for error in URL params
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error) {
        const note = document.querySelector('.privacy-note');
        if (note) {
            note.textContent = `Authentication failed: ${error}. Please try again.`;
            note.style.color = '#ef4444';
        }
    }
});
