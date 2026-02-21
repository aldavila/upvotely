(function() {
  'use strict';

  // Widget configuration
  const DEFAULT_CONFIG = {
    position: 'bottom-right', // bottom-right, bottom-left, top-right, top-left
    primaryColor: '#7c3aed',
    textColor: '#ffffff',
    boardId: null,
    organizationSlug: null,
    boardSlug: null,
    triggerText: 'Feedback',
    title: 'Share your feedback',
    placeholder: 'What would you like to see improved?',
    submitText: 'Submit',
    successMessage: 'Thanks for your feedback!',
  };

  // Get config from script tag
  function getConfig() {
    const script = document.currentScript || document.querySelector('script[data-upvotely]');
    if (!script) return DEFAULT_CONFIG;

    return {
      ...DEFAULT_CONFIG,
      position: script.getAttribute('data-position') || DEFAULT_CONFIG.position,
      primaryColor: script.getAttribute('data-primary-color') || DEFAULT_CONFIG.primaryColor,
      boardId: script.getAttribute('data-board-id'),
      organizationSlug: script.getAttribute('data-org'),
      boardSlug: script.getAttribute('data-board'),
      triggerText: script.getAttribute('data-trigger-text') || DEFAULT_CONFIG.triggerText,
    };
  }

  const config = getConfig();
  const baseUrl = 'https://upvotely.io'; // Change in production

  // Inject styles
  const styles = `
    .upvotely-widget-container {
      position: fixed;
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .upvotely-widget-container.bottom-right {
      bottom: 20px;
      right: 20px;
    }
    .upvotely-widget-container.bottom-left {
      bottom: 20px;
      left: 20px;
    }
    .upvotely-widget-container.top-right {
      top: 20px;
      right: 20px;
    }
    .upvotely-widget-container.top-left {
      top: 20px;
      left: 20px;
    }
    .upvotely-trigger {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      border: none;
      border-radius: 9999px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .upvotely-trigger:hover {
      transform: scale(1.05);
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    }
    .upvotely-trigger svg {
      width: 18px;
      height: 18px;
    }
    .upvotely-popup {
      position: absolute;
      bottom: 60px;
      right: 0;
      width: 360px;
      max-width: calc(100vw - 40px);
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      overflow: hidden;
      display: none;
    }
    .upvotely-popup.open {
      display: block;
      animation: upvotely-slide-up 0.2s ease-out;
    }
    @keyframes upvotely-slide-up {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .upvotely-popup-header {
      padding: 16px 20px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .upvotely-popup-title {
      font-size: 16px;
      font-weight: 600;
      color: #111827;
      margin: 0;
    }
    .upvotely-popup-close {
      background: none;
      border: none;
      padding: 4px;
      cursor: pointer;
      color: #6b7280;
      border-radius: 4px;
    }
    .upvotely-popup-close:hover {
      background: #f3f4f6;
    }
    .upvotely-popup-body {
      padding: 20px;
    }
    .upvotely-form-group {
      margin-bottom: 16px;
    }
    .upvotely-label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 6px;
    }
    .upvotely-input,
    .upvotely-textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      transition: border-color 0.2s, box-shadow 0.2s;
      box-sizing: border-box;
    }
    .upvotely-input:focus,
    .upvotely-textarea:focus {
      outline: none;
      border-color: ${config.primaryColor};
      box-shadow: 0 0 0 3px ${config.primaryColor}20;
    }
    .upvotely-textarea {
      min-height: 100px;
      resize: vertical;
    }
    .upvotely-submit {
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .upvotely-submit:hover {
      opacity: 0.9;
    }
    .upvotely-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .upvotely-success {
      text-align: center;
      padding: 40px 20px;
    }
    .upvotely-success svg {
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
    }
    .upvotely-success p {
      font-size: 16px;
      color: #111827;
      margin: 0;
    }
    .upvotely-footer {
      padding: 12px 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
    }
    .upvotely-footer a {
      font-size: 12px;
      color: #9ca3af;
      text-decoration: none;
    }
    .upvotely-footer a:hover {
      color: #6b7280;
    }
    @media (prefers-color-scheme: dark) {
      .upvotely-popup {
        background: #1f2937;
      }
      .upvotely-popup-header {
        border-color: #374151;
      }
      .upvotely-popup-title {
        color: #f9fafb;
      }
      .upvotely-popup-close {
        color: #9ca3af;
      }
      .upvotely-popup-close:hover {
        background: #374151;
      }
      .upvotely-label {
        color: #d1d5db;
      }
      .upvotely-input,
      .upvotely-textarea {
        background: #374151;
        border-color: #4b5563;
        color: #f9fafb;
      }
      .upvotely-success p {
        color: #f9fafb;
      }
      .upvotely-footer {
        border-color: #374151;
      }
    }
  `;

  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  // Create widget HTML
  const container = document.createElement('div');
  container.className = `upvotely-widget-container ${config.position}`;
  container.innerHTML = `
    <div class="upvotely-popup" id="upvotely-popup">
      <div class="upvotely-popup-header">
        <h3 class="upvotely-popup-title">${config.title}</h3>
        <button class="upvotely-popup-close" id="upvotely-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="upvotely-popup-body" id="upvotely-body">
        <form id="upvotely-form">
          <div class="upvotely-form-group">
            <label class="upvotely-label" for="upvotely-title">Title</label>
            <input type="text" id="upvotely-title" class="upvotely-input" placeholder="Short, descriptive title" required>
          </div>
          <div class="upvotely-form-group">
            <label class="upvotely-label" for="upvotely-content">Description</label>
            <textarea id="upvotely-content" class="upvotely-textarea" placeholder="${config.placeholder}" required></textarea>
          </div>
          <button type="submit" class="upvotely-submit" style="background-color: ${config.primaryColor}; color: ${config.textColor};">
            ${config.submitText}
          </button>
        </form>
      </div>
      <div class="upvotely-footer">
        <a href="https://upvotely.io" target="_blank">Powered by Upvotely</a>
      </div>
    </div>
    <button class="upvotely-trigger" id="upvotely-trigger" style="background-color: ${config.primaryColor}; color: ${config.textColor};">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      ${config.triggerText}
    </button>
  `;

  document.body.appendChild(container);

  // Event handlers
  const trigger = document.getElementById('upvotely-trigger');
  const popup = document.getElementById('upvotely-popup');
  const closeBtn = document.getElementById('upvotely-close');
  const form = document.getElementById('upvotely-form');
  const body = document.getElementById('upvotely-body');

  trigger.addEventListener('click', () => {
    popup.classList.toggle('open');
  });

  closeBtn.addEventListener('click', () => {
    popup.classList.remove('open');
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      popup.classList.remove('open');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('upvotely-title').value;
    const content = document.getElementById('upvotely-content').value;
    const submitBtn = form.querySelector('.upvotely-submit');
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
      const response = await fetch(`${baseUrl}/api/widget/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          boardId: config.boardId,
          organizationSlug: config.organizationSlug,
          boardSlug: config.boardSlug,
        }),
      });

      if (!response.ok) throw new Error('Failed to submit');

      // Show success message
      body.innerHTML = `
        <div class="upvotely-success">
          <svg viewBox="0 0 24 24" fill="none" stroke="${config.primaryColor}" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <p>${config.successMessage}</p>
        </div>
      `;

      // Close after 2 seconds
      setTimeout(() => {
        popup.classList.remove('open');
        // Reset form
        setTimeout(() => {
          body.innerHTML = form.outerHTML;
        }, 300);
      }, 2000);

    } catch (error) {
      submitBtn.disabled = false;
      submitBtn.textContent = config.submitText;
      alert('Failed to submit feedback. Please try again.');
    }
  });
})();
