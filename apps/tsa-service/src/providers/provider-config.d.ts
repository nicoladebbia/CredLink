/**
 * TSA Provider Configuration
 * DigiCert, GlobalSign, Sectigo with ETSI EN 319 421/422 compliance
 */
export interface TSAProvider {
    id: string;
    name: string;
    url: string;
    allowedPolicies: string[];
    trustAnchors: string[];
    etsiCompliant: boolean;
    documentation: string;
}
export declare const TSA_PROVIDERS: Record<string, TSAProvider>;
export declare const DEFAULT_PROVIDER_PRIORITY: string[];
export declare function getProviderById(id: string): TSAProvider | null;
export declare function getETSICompliantProviders(): TSAProvider[];
export declare function validateProviderConfig(provider: TSAProvider): boolean;
//# sourceMappingURL=provider-config.d.ts.map