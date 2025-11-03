/**
 * Phase 20: Policy Engine & Assertions Builder - JSON Schema
 * Strict validation schema for policy YAML with C2PA 2.2 compliance
 */

export const POLICY_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'C2PA Policy DSL',
  description: 'Human-readable policy that compiles to C2PA assertions',
  type: 'object',
  required: ['policy_id', 'version', 'applies_to', 'disclosure', 'editing', 'license', 'display', 'controls', 'lock'],
  additionalProperties: false,
  properties: {
    policy_id: {
      type: 'string',
      pattern: '^[a-z0-9-]+$',
      minLength: 1,
      maxLength: 100,
      description: 'Unique policy identifier'
    },
    version: {
      type: 'integer',
      minimum: 1,
      maximum: 999999,
      description: 'Policy version number'
    },
    applies_to: {
      type: 'object',
      required: ['kinds', 'audience_regions'],
      additionalProperties: false,
      properties: {
        kinds: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['image', 'video', 'audio']
          },
          minItems: 1,
          maxItems: 3,
          uniqueItems: true
        },
        audience_regions: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['global', 'eu', 'us', 'apac']
          },
          minItems: 1,
          maxItems: 10,
          uniqueItems: true
        }
      }
    },
    disclosure: {
      type: 'object',
      required: ['creation_mode', 'digital_source_type', 'ai'],
      additionalProperties: false,
      properties: {
        creation_mode: {
          type: 'string',
          enum: ['created', 'opened']
        },
        digital_source_type: {
          type: 'string',
          enum: ['auto', 'trainedAlgorithmicMedia', 'computationalCapture', 'humanCapture']
        },
        ai: {
          type: 'object',
          required: ['used', 'prompt_disclosure'],
          additionalProperties: false,
          properties: {
            used: {
              type: 'boolean'
            },
            generator: {
              type: 'string',
              pattern: '^[\\w\\-\\.\\/]+:[\\w\\-\\.]+$',
              maxLength: 200,
              description: 'Model name and version (e.g., "Midjourney:8.1")'
            },
            prompt_disclosure: {
              type: 'string',
              enum: ['none', 'minimal', 'full']
            }
          }
        }
      }
    },
    editing: {
      type: 'object',
      required: ['steps'],
      additionalProperties: false,
      properties: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            required: ['action', 'ai_assist'],
            additionalProperties: false,
            properties: {
              action: {
                type: 'string',
                enum: ['crop', 'color_adjust', 'inpaint', 'caption_edit', 'composite', 'other']
              },
              tool: {
                type: 'string',
                maxLength: 200,
                description: 'Software tool name (free text)'
              },
              ai_assist: {
                type: 'boolean'
              }
            }
          },
          maxItems: 50
        }
      }
    },
    license: {
      type: 'object',
      required: ['provider'],
      additionalProperties: false,
      properties: {
        provider: {
          type: 'string',
          enum: ['getty', 'ap', 'reuters', 'custom']
        },
        license_id: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
          description: 'License identifier (required unless provider is custom)'
        },
        rights_window: {
          type: 'object',
          required: ['from', 'to'],
          additionalProperties: false,
          properties: {
            from: {
              type: 'string',
              format: 'date-time',
              description: 'ISO 8601 start timestamp'
            },
            to: {
              type: 'string',
              format: 'date-time',
              description: 'ISO 8601 end timestamp'
            }
          }
        },
        terms_url: {
          type: 'string',
          format: 'uri',
          maxLength: 500,
          description: 'License terms URL (required unless provider is custom)'
        }
      }
    },
    display: {
      type: 'object',
      required: ['badge_copy', 'link_manifest'],
      additionalProperties: false,
      properties: {
        badge_copy: {
          type: 'string',
          enum: ['auto', 'concise', 'verbose']
        },
        link_manifest: {
          type: 'string',
          enum: ['remote', 'embedded']
        }
      }
    },
    controls: {
      type: 'object',
      required: ['redact_personal_fields', 'allow_ingredients', 'retain_assertions'],
      additionalProperties: false,
      properties: {
        redact_personal_fields: {
          type: 'boolean'
        },
        allow_ingredients: {
          type: 'boolean'
        },
        retain_assertions: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['thumbnail', 'ingredient', 'actions', 'license']
          },
          uniqueItems: true,
          maxItems: 10
        }
      }
    },
    lock: {
      type: 'object',
      required: ['enforce_version'],
      additionalProperties: false,
      properties: {
        enforce_version: {
          type: 'boolean'
        }
      }
    }
  }
} as const;

// Conditional validation rules
export const CONDITIONAL_RULES = [
  {
    condition: (data: any) => data.license?.provider !== 'custom',
    rule: 'license_id',
    message: 'license_id is required when provider is not "custom"',
    code: 'policy.license.missing_id'
  },
  {
    condition: (data: any) => data.license?.provider !== 'custom',
    rule: 'terms_url',
    message: 'terms_url is required when provider is not "custom"',
    code: 'policy.license.missing_terms'
  },
  {
    condition: (data: any) => data.disclosure?.ai?.used === true,
    rule: 'disclosure.ai.generator',
    message: 'generator is recommended when ai.used is true',
    code: 'policy.ai.missing_generator'
  },
  {
    condition: (data: any) => data.disclosure?.creation_mode === 'created' && data.disclosure?.digital_source_type === 'auto',
    rule: 'disclosure.ai.used',
    message: 'ai.used must be explicitly set when digital_source_type is "auto" for created content',
    code: 'policy.ai.required_for_auto'
  }
] as const;
