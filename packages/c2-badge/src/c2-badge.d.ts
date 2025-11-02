/**
 * C2 Badge Web Component
 * CSP-safe custom element for C2PA provenance verification
 */
/**
 * C2 Badge Custom Element
 *
 * <c2-badge asset-url="https://example.com/image.jpg"></c2-badge>
 * <c2-badge manifest-url="https://example.com/manifest.c2pa"></c2-badge>
 */
export declare class C2Badge extends HTMLElement {
    private shadow;
    private badgeButton;
    private modal;
    private config;
    private currentResult;
    private escapeHandler;
    private serviceWorkerListener;
    private degradeState;
    constructor();
    static get observedAttributes(): string[];
    connectedCallback(): void;
    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void;
    private injectStyles;
    private loadConfig;
    private registerServiceWorkerListener;
    private refreshDegradeFromGlobal;
    private updateDegradedBadge;
    private render;
    private bindEvents;
    private openModal;
    private closeModal;
    private bindModalEvents;
    private performVerification;
    private createAssertionElement;
    private updateModalDegradedState;
    private ensureDegradeWarning;
    private removeDegradeWarning;
    private buildDegradeMessage;
    private renderResult;
    private renderError;
    private bindActionButtons;
    disconnectedCallback(): void;
}
//# sourceMappingURL=c2-badge.d.ts.map