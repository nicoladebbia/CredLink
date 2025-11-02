/**
 * C2 Badge Web Component
 * CSP-safe custom element for C2PA provenance verification
 */
// CSS styles are injected separately to avoid inline styles
const STYLES_ID = 'c2-badge-styles';
// Template for the badge button
const BADGE_TEMPLATE = document.createElement('template');
BADGE_TEMPLATE.innerHTML = `
  <button class="c2-badge" part="badge" aria-label="Verify provenance information">
    <svg class="c2-badge__icon" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
    </svg>
    <span class="c2-badge__text">Verify</span>
  </button>
`;
// Template for the verification modal
const MODAL_TEMPLATE = document.createElement('template');
MODAL_TEMPLATE.innerHTML = `
  <div class="c2-modal-overlay" part="modal-overlay">
    <div class="c2-modal" part="modal" role="dialog" aria-modal="true" aria-labelledby="c2-modal-title">
      <div class="c2-modal__header">
        <h2 class="c2-modal__title" id="c2-modal-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
          </svg>
          Provenance Verification
        </h2>
        <button class="c2-modal__close" part="close-button" aria-label="Close dialog">&times;</button>
      </div>
      <div class="c2-modal__body">
        <div class="c2-loading">
          <div class="c2-loading__spinner"></div>
          Verifying provenance...
        </div>
      </div>
    </div>
  </div>
`;
// Template for verification results
const RESULT_TEMPLATE = document.createElement('template');
RESULT_TEMPLATE.innerHTML = `
  <div class="c2-verification-status c2-verification-status--valid">
    <svg class="c2-verification-status__icon" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
    </svg>
    <span class="c2-verification-status__text">Valid Provenance</span>
  </div>
  
  <div class="c2-info-section">
    <h3 class="c2-info-section__title">Signer Information</h3>
    <div class="c2-info-grid">
      <div class="c2-info-grid__label">Name:</div>
      <div class="c2-info-grid__value" id="signer-name">Loading...</div>
      <div class="c2-info-grid__label">Key ID:</div>
      <div class="c2-info-grid__value" id="signer-key">Loading...</div>
      <div class="c2-info-grid__label">Organization:</div>
      <div class="c2-info-grid__value" id="signer-org">Loading...</div>
      <div class="c2-info-grid__label">Trusted:</div>
      <div class="c2-info-grid__value" id="signer-trusted">Loading...</div>
    </div>
  </div>
  
  <div class="c2-info-section">
    <h3 class="c2-info-section__title">Content Assertions</h3>
    <div class="c2-assertions" id="assertions">
      <span class="c2-assertion">Loading...</span>
    </div>
  </div>
  
  <div class="c2-info-section">
    <h3 class="c2-info-section__title">Verification Details</h3>
    <div class="c2-decision-path" id="decision-path">Loading...</div>
  </div>
  
  <div class="c2-warnings" id="warnings"></div>
  
  <div class="c2-actions">
    <button class="c2-button" part="view-manifest-button" id="view-manifest">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
      </svg>
      View Raw Manifest
    </button>
    <button class="c2-button c2-button--primary" part="copy-url-button" id="copy-url">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
      </svg>
      Copy Verification URL
    </button>
  </div>
`;
// Error template
const ERROR_TEMPLATE = document.createElement('template');
ERROR_TEMPLATE.innerHTML = `
  <div class="c2-error">
    <svg class="c2-error__icon" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
    </svg>
    <div class="c2-error__title">Verification Failed</div>
    <div class="c2-error__message" id="error-message">Unable to verify provenance</div>
    <div class="c2-actions">
      <button class="c2-button" part="retry-button" id="retry-verification">Try Again</button>
    </div>
  </div>
`;
const relayStatusMap = new Map();
function getActiveDegradeMessage() {
    for (const message of relayStatusMap.values()) {
        if (message.status === 'stale' || message.status === 'error') {
            return message;
        }
    }
    return undefined;
}
function updateDocumentDegradeClass() {
    if (getActiveDegradeMessage()) {
        document.documentElement.classList.add('c2-badge-degraded');
    }
    else {
        document.documentElement.classList.remove('c2-badge-degraded');
    }
}
function formatTimestamp(value) {
    if (!value) {
        return 'an unknown time';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'an unknown time';
    }
    try {
        return new Intl.DateTimeFormat(undefined, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).format(date);
    }
    catch {
        return date.toISOString();
    }
}
function formatDegradedText(state) {
    const when = formatTimestamp(state.storedAt);
    return `Degraded – cached manifest from ${when}`;
}
/**
 * C2 Badge Custom Element
 *
 * <c2-badge asset-url="https://example.com/image.jpg"></c2-badge>
 * <c2-badge manifest-url="https://example.com/manifest.c2pa"></c2-badge>
 */
export class C2Badge extends HTMLElement {
    shadow;
    badgeButton = null;
    modal = null;
    config = {};
    currentResult = null;
    escapeHandler = null;
    serviceWorkerListener = null;
    degradeState = null;
    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: 'open' });
    }
    static get observedAttributes() {
        return ['asset-url', 'manifest-url', 'api-url', 'text', 'auto-open'];
    }
    connectedCallback() {
        this.injectStyles();
        this.loadConfig();
        this.render();
        this.bindEvents();
        this.refreshDegradeFromGlobal();
        updateDocumentDegradeClass();
        this.registerServiceWorkerListener();
        this.updateDegradedBadge();
        if (this.config.autoOpen) {
            setTimeout(() => this.openModal(), 100);
        }
    }
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue)
            return;
        this.loadConfig();
        if (name === 'text' && this.badgeButton) {
            const textElement = this.badgeButton.querySelector('.c2-badge__text');
            if (textElement) {
                textElement.textContent = this.config.text || 'Verify';
            }
        }
    }
    injectStyles() {
        if (!document.getElementById(STYLES_ID)) {
            const link = document.createElement('link');
            link.id = STYLES_ID;
            link.rel = 'stylesheet';
            link.href = this.getAttribute('styles-url') ||
                'https://cdn.jsdelivr.net/npm/@c2/c2-badge@latest/dist/styles.css';
            document.head.appendChild(link);
        }
    }
    loadConfig() {
        this.config = {
            apiUrl: this.getAttribute('api-url') || 'https://verify.c2pa.org/api/v1',
            assetUrl: this.getAttribute('asset-url') || undefined,
            manifestUrl: this.getAttribute('manifest-url') || undefined,
            text: this.getAttribute('text') || 'Verify',
            autoOpen: this.hasAttribute('auto-open')
        };
    }
    registerServiceWorkerListener() {
        if (!('serviceWorker' in navigator)) {
            return;
        }
        if (this.serviceWorkerListener) {
            return;
        }
        this.serviceWorkerListener = (event) => {
            const data = event.data;
            if (!data || data.type !== 'C2_RELAY_STATUS') {
                return;
            }
            if (data.status === 'fresh') {
                relayStatusMap.delete(data.manifestUrl);
            }
            else {
                relayStatusMap.set(data.manifestUrl, data);
            }
            updateDocumentDegradeClass();
            this.refreshDegradeFromGlobal();
            this.updateDegradedBadge();
            this.updateModalDegradedState();
        };
        navigator.serviceWorker.addEventListener('message', this.serviceWorkerListener);
    }
    refreshDegradeFromGlobal() {
        const message = getActiveDegradeMessage();
        if (message && (message.status === 'stale' || message.status === 'error')) {
            this.degradeState = {
                status: message.status,
                storedAt: message.storedAt,
                reason: message.reason,
                manifestUrl: message.manifestUrl
            };
        }
        else {
            this.degradeState = null;
        }
    }
    updateDegradedBadge() {
        const degraded = Boolean(this.degradeState);
        if (this.badgeButton) {
            this.badgeButton.classList.toggle('c2-badge--degraded', degraded);
            if (degraded) {
                this.badgeButton.setAttribute('data-status', 'degraded');
            }
            else {
                this.badgeButton.removeAttribute('data-status');
            }
        }
        if (degraded) {
            this.setAttribute('data-degraded', 'true');
        }
        else {
            this.removeAttribute('data-degraded');
        }
    }
    render() {
        // Clear shadow DOM safely
        while (this.shadow.firstChild) {
            this.shadow.removeChild(this.shadow.firstChild);
        }
        const badgeClone = BADGE_TEMPLATE.content.cloneNode(true);
        this.shadow.appendChild(badgeClone);
        this.badgeButton = this.shadow.querySelector('.c2-badge');
        const textElement = this.badgeButton?.querySelector('.c2-badge__text');
        if (textElement) {
            textElement.textContent = this.config.text || 'Verify';
        }
        this.updateDegradedBadge();
    }
    bindEvents() {
        this.badgeButton?.addEventListener('click', () => this.openModal());
        this.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.openModal();
            }
        });
    }
    openModal() {
        if (this.modal)
            return;
        const modalClone = MODAL_TEMPLATE.content.cloneNode(true);
        this.modal = modalClone.querySelector('.c2-modal-overlay');
        if (!this.modal)
            return;
        document.body.appendChild(this.modal);
        this.bindModalEvents();
        // Start verification
        this.performVerification();
    }
    closeModal() {
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }
    }
    bindModalEvents() {
        const closeButton = this.modal?.querySelector('.c2-modal__close');
        const overlay = this.modal?.querySelector('.c2-modal-overlay');
        if (closeButton) {
            closeButton.addEventListener('click', () => this.closeModal());
        }
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.closeModal();
                }
            });
        }
        // Escape key handling
        this.escapeHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        };
        document.addEventListener('keydown', this.escapeHandler);
        // Focus management
        const closeButtonElement = closeButton;
        if (closeButtonElement) {
            setTimeout(() => {
                if (closeButtonElement) {
                    closeButtonElement.focus();
                }
            }, 100);
        }
    }
    async performVerification() {
        if (!this.modal)
            return;
        try {
            const requestBody = {};
            if (this.config.manifestUrl) {
                requestBody.manifest_url = this.config.manifestUrl;
            }
            else if (this.config.assetUrl) {
                requestBody.asset_url = this.config.assetUrl;
            }
            else {
                throw new Error('Either asset-url or manifest-url must be specified');
            }
            const response = await fetch(`${this.config.apiUrl}/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            if (!response.ok) {
                throw new Error(`Verification failed: ${response.statusText}`);
            }
            const apiResponse = await response.json();
            if (!apiResponse.success || !apiResponse.data) {
                throw new Error(apiResponse.error?.message || 'Verification failed');
            }
            this.currentResult = apiResponse.data;
            this.renderResult();
        }
        catch (error) {
            this.renderError(error instanceof Error ? error.message : 'Unknown error');
        }
    }
    createAssertionElement(text, isAIGenerated) {
        const assertion = document.createElement('span');
        assertion.className = isAIGenerated ? 'c2-assertion c2-assertion--ai-generated' : 'c2-assertion';
        assertion.textContent = text;
        return assertion;
    }
    updateModalDegradedState() {
        if (!this.modal)
            return;
        const statusElement = this.modal.querySelector('.c2-verification-status');
        const statusTextElement = this.modal.querySelector('.c2-verification-status__text');
        const warningsContainer = this.modal.querySelector('#warnings');
        if (!statusElement || !statusTextElement) {
            return;
        }
        if (this.degradeState) {
            statusElement.classList.add('c2-verification-status--degraded');
            statusElement.classList.remove('c2-verification-status--valid', 'c2-verification-status--invalid');
            statusTextElement.textContent = formatDegradedText(this.degradeState);
            this.ensureDegradeWarning(warningsContainer);
        }
        else if (this.currentResult) {
            statusElement.classList.remove('c2-verification-status--degraded');
            if (this.currentResult.valid) {
                statusElement.classList.add('c2-verification-status--valid');
                statusElement.classList.remove('c2-verification-status--invalid');
                statusTextElement.textContent = 'Valid Provenance';
            }
            else {
                statusElement.classList.add('c2-verification-status--invalid');
                statusElement.classList.remove('c2-verification-status--valid');
                statusTextElement.textContent = 'Invalid Provenance';
            }
            this.removeDegradeWarning(warningsContainer);
        }
    }
    ensureDegradeWarning(container) {
        if (!container || !this.degradeState) {
            return;
        }
        let warningElement = container.querySelector('#c2-degraded-warning');
        if (!warningElement) {
            warningElement = document.createElement('div');
            warningElement.id = 'c2-degraded-warning';
            warningElement.className = 'c2-warning c2-warning--degraded';
            container.prepend(warningElement);
        }
        warningElement.textContent = this.buildDegradeMessage();
    }
    removeDegradeWarning(container) {
        if (!container) {
            return;
        }
        const warningElement = container.querySelector('#c2-degraded-warning');
        warningElement?.remove();
    }
    buildDegradeMessage() {
        if (!this.degradeState) {
            return '';
        }
        const when = formatTimestamp(this.degradeState.storedAt);
        const reason = this.degradeState.reason ? ` Reason: ${this.degradeState.reason}.` : '';
        return `Relay degraded mode — serving cached manifest from ${when}.${reason}`;
    }
    renderResult() {
        if (!this.modal || !this.currentResult)
            return;
        const body = this.modal.querySelector('.c2-modal__body');
        if (!body)
            return;
        // Clear body safely
        while (body.firstChild) {
            body.removeChild(body.firstChild);
        }
        const resultClone = RESULT_TEMPLATE.content.cloneNode(true);
        body.appendChild(resultClone);
        // Update signer information
        const signerName = body.querySelector('#signer-name');
        const signerKey = body.querySelector('#signer-key');
        const signerOrg = body.querySelector('#signer-org');
        const signerTrusted = body.querySelector('#signer-trusted');
        if (signerName)
            signerName.textContent = this.currentResult.signer.name;
        if (signerKey)
            signerKey.textContent = this.currentResult.signer.key_id;
        if (signerOrg)
            signerOrg.textContent = this.currentResult.signer.organization || 'N/A';
        if (signerTrusted)
            signerTrusted.textContent = this.currentResult.signer.trusted ? 'Yes' : 'No';
        // Update assertions
        const assertionsContainer = body.querySelector('#assertions');
        if (assertionsContainer) {
            // Clear container safely
            while (assertionsContainer.firstChild) {
                assertionsContainer.removeChild(assertionsContainer.firstChild);
            }
            const assertions = [];
            if (this.currentResult.assertions.ai_generated) {
                assertions.push(this.createAssertionElement('AI Generated', true));
            }
            if (this.currentResult.assertions.content_type) {
                assertions.push(this.createAssertionElement(this.currentResult.assertions.content_type, false));
            }
            if (this.currentResult.assertions.edits.length > 0) {
                assertions.push(this.createAssertionElement(`${this.currentResult.assertions.edits.length} edits`, false));
            }
            if (assertions.length > 0) {
                assertions.forEach(assertion => assertionsContainer.appendChild(assertion));
            }
            else {
                assertionsContainer.appendChild(this.createAssertionElement('No special assertions', false));
            }
        }
        // Update decision path
        const decisionPath = body.querySelector('#decision-path');
        if (decisionPath) {
            const steps = this.currentResult.decision_path.steps.join('\n');
            decisionPath.textContent = `Discovery: ${this.currentResult.decision_path.discovery}\nSource: ${this.currentResult.decision_path.source}\n\nSteps:\n${steps}`;
        }
        // Update warnings
        const warningsContainer = body.querySelector('#warnings');
        if (warningsContainer) {
            while (warningsContainer.firstChild) {
                warningsContainer.removeChild(warningsContainer.firstChild);
            }
            if (this.currentResult.warnings.length > 0) {
                this.currentResult.warnings.forEach(warning => {
                    const warningElement = document.createElement('div');
                    warningElement.className = 'c2-warning';
                    // Sanitize warning text
                    warningElement.textContent = warning.replace(/[<>]/g, '');
                    warningsContainer.appendChild(warningElement);
                });
            }
        }
        this.updateModalDegradedState();
        // Bind action buttons
        this.bindActionButtons();
    }
    renderError(message) {
        if (!this.modal)
            return;
        const body = this.modal.querySelector('.c2-modal__body');
        if (!body)
            return;
        // Clear body safely
        while (body.firstChild) {
            body.removeChild(body.firstChild);
        }
        const errorClone = ERROR_TEMPLATE.content.cloneNode(true);
        body.appendChild(errorClone);
        const errorMessageElement = body.querySelector('#error-message');
        if (errorMessageElement) {
            // Sanitize message to prevent XSS
            const sanitizedMessage = message.replace(/[<>]/g, '');
            errorMessageElement.textContent = sanitizedMessage;
        }
        // Bind retry button
        const retryButton = body.querySelector('#retry-verification');
        retryButton?.addEventListener('click', () => {
            this.performVerification();
        });
        this.updateModalDegradedState();
    }
    bindActionButtons() {
        if (!this.modal)
            return;
        const viewManifestButton = this.modal.querySelector('#view-manifest');
        const copyUrlButton = this.modal.querySelector('#copy-url');
        viewManifestButton?.addEventListener('click', () => {
            if (this.currentResult?.decision_path.source) {
                window.open(this.currentResult.decision_path.source, '_blank');
            }
        });
        copyUrlButton?.addEventListener('click', () => {
            const verificationUrl = window.location.href;
            navigator.clipboard.writeText(verificationUrl).then(() => {
                // Show success feedback
                const originalText = copyUrlButton.textContent;
                copyUrlButton.textContent = 'Copied!';
                setTimeout(() => {
                    if (copyUrlButton.textContent) {
                        copyUrlButton.textContent = originalText;
                    }
                }, 2000);
            }).catch(() => {
                // Fallback for browsers that don't support clipboard API
                const textArea = document.createElement('textarea');
                textArea.value = verificationUrl;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            });
        });
    }
    disconnectedCallback() {
        // CRITICAL: Clean up event listeners to prevent memory leaks
        if (this.escapeHandler) {
            document.removeEventListener('keydown', this.escapeHandler);
            this.escapeHandler = null;
        }
        if (this.serviceWorkerListener && 'serviceWorker' in navigator) {
            navigator.serviceWorker.removeEventListener('message', this.serviceWorkerListener);
            this.serviceWorkerListener = null;
        }
        this.closeModal();
    }
}
// Register the custom element
customElements.define('c2-badge', C2Badge);
//# sourceMappingURL=c2-badge.js.map