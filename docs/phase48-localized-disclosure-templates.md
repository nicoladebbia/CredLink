# Phase 48 - Compliance v2 Localized Disclosure Text

## EU AI Act Content Label (Site/Badge)

### English (Primary)
```
This image/video was created or altered using AI. See Content Credentials for provenance details.
```

### Localized Variants

**German (DE)**
```
Dieses Bild/dieses Video wurde mit KI erstellt oder verändert. Siehe Content Credentials für Herkunftsdetails.
```

**French (FR)**
```
Cette image/vidéo a été créée ou modifiée par l'IA. Voir Content Credentials pour les détails de provenance.
```

**Spanish (ES)**
```
Esta imagen/video fue creada o alterada usando IA. Ve Content Credentials para detalles de procedencia.
```

**Italian (IT)**
```
Questa immagine/video è stata creata o modificata utilizzando l'IA. Vedi Content Credentials per i dettagli sulla provenienza.
```

**Dutch (NL)**
```
Deze afbeelding/video is gemaakt of gewijzigd met AI. Zie Content Credentials voor provenancedetails.
```

**Polish (PL)**
```
Ten obraz/film został stworzony lub zmieniony przy użyciu AI. Zobacz Content Credentials po szczegóły pochodzenia.
```

**Swedish (SV)**
```
Denna bild/video skapades eller ändrades med AI. Se Content Credentials för provenansdetaljer.
```

### Usage Notes
- **Display Requirement**: Must be visible when `ai_generated || ai_altered` is true
- **Placement**: Proximate to the content, not buried in footers
- **Link Requirement**: "Content Credentials" must link to full manifest
- **Legal Reference**: EU AI Act 2024/1689 Article 50
- **Advisory Status**: Template version 1.1.0 - consult legal counsel for final implementation

---

## EU DSA Ad Transparency String (On-Ad)

### English (Primary)
```
Ad by {sponsor}. You're seeing this because {why_targeted}. Learn more.
```

### Localized Variants

**German (DE)**
```
Anzeige von {sponsor}. Sie sehen dies, weil {why_targeted}. Mehr erfahren.
```

**French (FR)**
```
Publicité par {sponsor}. Vous voyez ceci parce que {why_targeted}. En savoir plus.
```

**Spanish (ES)**
```
Anuncio de {sponsor}. Ves esto porque {why_targeted}. Más información.
```

**Italian (IT)**
```
Pubblicità di {sponsor}. Vedi questo perché {why_targeted}. Scopri di più.
```

**Dutch (NL)**
```
Advertentie door {sponsor}. U ziet dit omdat {why_targeted}. Meer informatie.
```

### Parameter Substitution
- `{sponsor}`: Legal entity name paying for the advertisement
- `{why_targeted}`: Brief explanation of targeting criteria (max 100 characters)

### Examples
```
Ad by Acme Corp. You're seeing this because you're interested in technology. Learn more.
Ad by Fashion Brands. You're seeing this because you've viewed similar products. Learn more.
```

### Usage Notes
- **Display Requirement**: Must appear on or near the ad unit
- **Link Requirement**: "Learn more" must open DSA transparency modal
- **Character Limit**: Maximum 200 characters including parameters
- **Legal Reference**: DSA 2022/2065 Article 26
- **Template Version**: 1.2.0

---

## US FTC Endorsement Disclosure

### Standard Templates

**Paid Partnership**
```
Ad/Partner — we earn compensation from {brand}. Details.
```

**Affiliate Link**
```
Affiliate Link — we may earn a commission if you purchase through {brand}. Details.
```

**Gift/Product**
```
Gifted Product — {brand} provided this item for review. Details.
```

**Free Service**
```
Complimentary Access — {brand} provided free access for review. Details.
```

### Placement Proximity Guidelines

**Immediate (Preferred)**
```
Ad: Acme Tech — we earn compensation from Acme Tech. Details.
[Product Review Content]
```

**Nearby (Acceptable)**
```
[Product Review Content]

Ad: Acme Tech — we earn compensation from Acme Tech. Details.
```

### Industry-Specific Variants

**Beauty/Cosmetics**
```
Sponsored — Acme Beauty provided products for consideration. Details.
```

**Technology**
```
Review Unit — Acme Tech provided device for testing. Details.
```

**Travel**
```
Complimentary Stay — Acme Hotels provided accommodation for review. Details.
```

### Usage Notes
- **Proximity Requirement**: Must be "clear and conspicuous" per FTC 16 CFR Part 255
- **Link Requirement**: "Details" must link to full disclosure page
- **Audit Trail**: Log placement, visibility, and user interaction
- **Template Version**: 1.0.1
- **Legal Reference**: FTC Endorsement Guides

---

## UK OSA Service Information (Policy Page Snippet)

### Standard Template
```
We publish quarterly transparency info per the Online Safety Act 2023 and Ofcom guidance.
```

### Extended Version
```
We publish quarterly transparency reports per the Online Safety Act 2023 and Ofcom guidance, including:
- User safety metrics and risk assessments
- Content moderation and enforcement statistics  
- Harm prevention measures and effectiveness
- Complaint handling and response times

Full reports available at: [link to transparency page]
```

### Modal/Popup Version
```
Transparency Reporting

As required by the Online Safety Act 2023 and Ofcom guidance, we publish quarterly transparency reports covering our service operations, user safety metrics, and content moderation practices.

Current Report: [date]
Previous Reports: [archive links]

Questions: contact our transparency team at transparency@example.com
```

### Usage Notes
- **Placement**: Link from footer or dedicated transparency section
- **Frequency**: Quarterly updates required
- **Content**: Must align with Ofcom reporting requirements
- **Template Version**: 1.0.2
- **Legal Reference**: Online Safety Act 2023 Part 4 Chapter 5

---

## Brazil LGPD Notice

### Portuguese (Primary)
```
Processamos dados pessoais limitados para servir selos de proveniência e relatórios conforme descrito em nosso aviso LGPD.
```

### English Translation (Reference)
```
We process limited personal data to serve provenance badges and reports as described in our LGPD notice.
```

### Extended Portuguese Version
```
De acordo com a Lei Geral de Proteção de Dados (LGPD), processamos dados pessoais para:
- Fornecer selos de proveniência e verificação de conteúdo
- Gerar relatórios de conformidade e auditoria
- Manter registros de segurança e autenticidade

Nossos práticas de privacidade e direitos do titular estão disponíveis em:
[link para política de privacidade]

Contato DPO: dpo@exemplo.com
```

### DPO Contact Template
```
Encarregado de Proteção de Dados:
Nome: [DPO Name]
Email: dpo@exemplo.com
Telefone: [DPO Phone]
Endereço: [DPO Address]

Exercício de Direitos:
Para exercer seus direitos sob a LGPD, contate nosso DPO pelo email acima.
```

### Usage Notes
- **Language Requirement**: Primary notice must be in Portuguese
- **DPO Contact**: Must include valid contact information
- **Rights Information**: Must explain data subject rights under Article 18
- **Template Version**: 1.0.0
- **Legal Reference**: LGPD Lei 13.709/2018

---

## Multi-Region Implementation Guide

### Template Selection Logic

```javascript
function getDisclosureTemplate(region, type, locale = 'en') {
  const templates = {
    'EU': {
      'ai_disclosure': {
        'en': 'This image/video was created or altered using AI. See Content Credentials for provenance details.',
        'de': 'Dieses Bild/dieses Video wurde mit KI erstellt oder verändert. Siehe Content Credentials für Herkunftsdetails.',
        'fr': 'Cette image/vidéo a été créée ou modifiée par l\'IA. Voir Content Credentials pour les détails de provenance.'
      },
      'ad_transparency': {
        'en': 'Ad by {sponsor}. You\'re seeing this because {why_targeted}. Learn more.',
        'de': 'Anzeige von {sponsor}. Sie sehen dies, weil {why_targeted}. Mehr erfahren.'
      }
    },
    'US': {
      'ftc_endorsement': {
        'paid': 'Ad/Partner — we earn compensation from {brand}. Details.',
        'affiliate': 'Affiliate Link — we may earn a commission if you purchase through {brand}. Details.'
      }
    },
    'UK': {
      'osa_transparency': {
        'policy': 'We publish quarterly transparency info per the Online Safety Act 2023 and Ofcom guidance.'
      }
    },
    'BR': {
      'lgpd_notice': {
        'pt': 'Processamos dados pessoais limitados para servir selos de proveniência e relatórios conforme descrito em nosso aviso LGPD.',
        'en': 'We process limited personal data to serve provenance badges and reports as described in our LGPD notice.'
      }
    }
  };
  
  return templates[region]?.[type]?.[locale] || '';
}
```

### Version Control and Updates

All templates are versioned and tracked:
- **EU AI Act**: v1.1.0 (current)
- **DSA Transparency**: v1.2.0 (current)
- **US FTC**: v1.0.1 (current)
- **UK OSA**: v1.0.2 (current)
- **Brazil LGPD**: v1.0.0 (current)

### Implementation Checklist

**For Each Region:**
- [ ] Select appropriate template based on locale
- [ ] Implement parameter substitution logic
- [ ] Add required links to manifest/privacy pages
- [ ] Log disclosure placement and visibility
- [ ] Track template version in compliance reports
- [ ] Test display across different devices and contexts

**Quality Assurance:**
- [ ] Verify translations with native speakers
- [ ] Test parameter substitution with real data
- [ ] Validate link functionality
- [ ] Confirm accessibility compliance
- [ ] Review with legal counsel for each jurisdiction

### Advisory Notice

**⚠️ IMPORTANT**: These templates are provided as starting points only. Final implementation must be reviewed by qualified legal counsel in each jurisdiction. Template versions are tracked in compliance packs for audit purposes.

**Last Updated**: 2025-11-05
**Next Review**: 2025-12-05
**Legal Review Required**: Yes
