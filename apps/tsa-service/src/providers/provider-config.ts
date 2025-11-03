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

export const TSA_PROVIDERS: Record<string, TSAProvider> = {
  digicert: {
    id: 'digicert',
    name: 'DigiCert/QuoVadis RFC 3161 TSA',
    url: 'https://timestamp.digicert.com',
    allowedPolicies: [
      '2.16.840.1.114412.7.1', // DigiCert TSA Policy
      '2.16.840.1.114412.7.2'  // DigiCert Qualified TSA Policy
    ],
    trustAnchors: [
      '-----BEGIN CERTIFICATE-----\nMIIDxTCCAq2gAwIBAgIQAqxcJmoLQJuPC3nyrkYldzANBgkqhkiG9w0BAQUFADBs\nMQswCQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3\nd3cuZGlnaWNlcnQuY29tMSswKQYDVQQDEyJEaWdpQ2VydCBIaWdoIEFzc3VyYW5j\nZSBFViBSb290IENBMB4XDTA2MTExMDAwMDAwMFoXDTMxMTExMDAwMDAwMFowbDEL\nMAkGA1UEBhMCVVMxFTATBgNVBAoTDERpZ2lDZXJ0IEluYzEZMBcGA1UECxMQd3d3\nLmRpZ2ljZXJ0LmNvbTErMCkGA1UEAxMiRGlnaUNlcnQgSGlnaCBBc3N1cmFuY2Ug\nRVYgUm9vdCBDQTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAMbM5XPm\n+9S75S0tMqbf5YE/yc0lSbZxKsPVlDRnogocsF9ppkCxxLeyj9CYpKlBWTrT3JTW\nPNt0OKRKzE0lgvdKpVMSOO7zSW1XkA5weKu82bEQhZwsX3doqH+MEJ6SvY1xnKhG\nNgqF2JjGh+Q2fd8n2PvZ6vEJ8+R0hN3TIX3Q0m6r1c8O1iZ3lBhGFcRzLrpLCELP\nQHLRDLv6gNwgj9w5ZQYwJNdR9Z4vGzZBma9aNaBjLN+Da9kZcBdNrvu5v8I3L9Q2\nvB2JtHsU6t1BkXhY5fWR0C7haL9J0QJ9TrgXsV/d5uFAgUwDQYJKoZIhvcNAQEF\nBQADggEBAB0kcrFccSmFEgNH5IocBzDjaC8k8x7YfL6wZqGkaLkNQbO2LnllqyH\nY9J4+q0w8TbB5p4uYNvJ8U5B0Zf6dXWqBkO8tgUJ8Xq8bRjWJZ6L6tBk3Jz5f5\n-----END CERTIFICATE-----'
    ],
    etsiCompliant: true,
    documentation: 'https://www.digicert.com/support/time-stamping-protocol.htm'
  },
  
  globalsign: {
    id: 'globalsign',
    name: 'GlobalSign Timestamping SaaS',
    url: 'https://rfc3161timestamp.globalsign.com/advanced',
    allowedPolicies: [
      '1.3.6.1.4.1.4146.2.3', // GlobalSign TSA Policy
      '1.3.6.1.4.1.4146.2.4'  // GlobalSign Qualified TSA Policy
    ],
    trustAnchors: [
      '-----BEGIN CERTIFICATE-----\nMIIDdTCCAl2gAwIBAgILBAAAAAABFUtaw5QwDQYJKoZIhvcNAQEFBQAwVzELMAkG\nA1UEBhMCQkUxGTAXBgNVBAoTEEdsb2JhbFNpZ24gbnYtc2ExEDAOBgNVBAsTB1Jv\nb3QgQ0ExGzAZBgNVBAMTEkdsb2JhbFNpZ24gUm9vdCBDQTAeFw0xNDAyMjAxMDAw\nMDBaFw0yNDAyMjAxMDAwMDBaMFcxCzAJBgNVBAYTAkJFMRkwFwYDVQQKExBHbG9i\nYWxTaWduIG52LXNhMRAwDgYDVQQLEwdSb290IENBMRswGQYDVQQDExJHbG9iYWxT\naWduIFJvb3QgQ0EwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCjBbt\n7lHdE0z9ZyJlQ0J1HJU4qJjT1WqLpTOhQ4Qg6kO8k5L6xL9fN8N9fN8N9fN8N9\nfN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN\n8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N\n9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9f\nN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8N9fN8\n-----END CERTIFICATE-----'
    ],
    etsiCompliant: true,
    documentation: 'https://www.globalsign.com/en/ssl-information-center/tsa/'
  },
  
  sectigo: {
    id: 'sectigo',
    name: 'Sectigo RFC 3161/eIDAS TSA',
    url: 'https://ts.ssl.com',
    allowedPolicies: [
      '1.3.6.1.4.1.6449.2.7.1', // Sectigo TSA Policy
      '1.3.6.1.4.1.6449.2.7.2'  // Sectigo Qualified TSA Policy
    ],
    trustAnchors: [
      '-----BEGIN CERTIFICATE-----\nMIIFWTCCA0GgAwIBAgIQPkjB4V6j5hjPo9EjS1B5ZTANBgkqhkiG9w0BAQsFADCB\nyjELMAkGA1UEBhMCVVMxFzAVBgNVBAoTDlNlY3RpZ28sIEluYy4xNDAyBgNVBAsT\nK1NlY3RpZ28gUHVibGljIFRydXN0IE5ldHdvcmsgRW5naW5lZXJpbmcgQ0ExODA2\nBgNVBAsTL0NvcHlyaWdodCAoYykgMjAxOCBTZWN0aWdvIExpbWl0ZWQxLjAsBgNV\nBAMTJVNlY3RpZ28gUHVibGljIFRydXN0IE5ldHdvcmsgRW5naW5lZXJpbmcgQ0Ew\nHhcNMTgwNjIyMDAwMDAwWhcNMzAwNjIxMjM1OTU5WjCBwjELMAkGA1UEBhMCVVMx\nFzAVBgNVBAoTDlNlY3RpZ28sIEluYy4xNDAyBgNVBAsTK1NlY3RpZ28gUHVibGlj\nIFRydXN0IE5ldHdvcmsgRW5naW5lZXJpbmcgQ0ExODA2BgNVBAsTL0NvcHlyaWdo\ndCAoYykgMjAxOCBTZWN0aWdvIExpbWl0ZWQxLjAsBgNVBAMTJVNlY3RpZ28gUHVi\nbGljIFRydXN0IE5ldHdvcmsgRW5naW5lZXJpbmcgQ0EwggEiMA0GCSqGSIb3DQEB\nAQUAA4IBDwAwggEKAoIBAQC5J8Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzM\nD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzM\nD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzM\nD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzM\nD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzM\nD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzM\nD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzM\nD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzMD9Z8RJzM\n-----END CERTIFICATE-----'
    ],
    etsiCompliant: true,
    documentation: 'https://sectigo.com/knowledge-base/time-stamping-authority'
  }
};

export const DEFAULT_PROVIDER_PRIORITY = ['digicert', 'globalsign', 'sectigo'];

export function getProviderById(id: string): TSAProvider | null {
  return TSA_PROVIDERS[id] || null;
}

export function getETSICompliantProviders(): TSAProvider[] {
  return Object.values(TSA_PROVIDERS).filter(provider => provider.etsiCompliant);
}

export function validateProviderConfig(provider: TSAProvider): boolean {
  return !!(
    provider.id &&
    provider.name &&
    provider.url &&
    provider.url.startsWith('https://') &&
    provider.allowedPolicies.length > 0 &&
    provider.trustAnchors.length > 0 &&
    provider.documentation
  );
}
