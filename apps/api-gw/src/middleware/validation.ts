import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { logger } from '../utils/logger';

/**
 * Validation schemas
 */
const schemas = {
  sign: Joi.object({
    image: Joi.string().required().description('Base64 encoded image or image URL'),
    metadata: Joi.object({
      title: Joi.string().optional(),
      description: Joi.string().optional(),
      creator: Joi.string().optional(),
      location: Joi.object({
        latitude: Joi.number().optional(),
        longitude: Joi.number().optional()
      }).optional(),
      customFields: Joi.object().optional()
    }).optional()
  }),

  verify: Joi.object({
    image: Joi.string().required().description('Base64 encoded image or image URL')
  })
};

/**
 * Validation middleware
 * 
 * Validates request body against schema
 */
export const validationMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Determine which schema to use based on route
  let schema: Joi.ObjectSchema | undefined;

  if (req.path.includes('/sign')) {
    schema = schemas.sign;
  } else if (req.path.includes('/verify')) {
    schema = schemas.verify;
  }

  // Skip validation if no schema found
  if (!schema) {
    next();
    return;
  }

  // Validate request body
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map((detail: Joi.ValidationErrorItem) => ({
      field: detail.path.join('.'),
      message: detail.message
    }));

    logger.warn('Validation failed', { errors });

    res.status(400).json({
      error: 'Validation Error',
      message: 'Request validation failed',
      errors,
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Replace body with validated value
  req.body = value;
  next();
};

/**
 * Validate with custom schema
 */
export const validateWith = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map((detail: Joi.ValidationErrorItem) => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      res.status(400).json({
        error: 'Validation Error',
        message: 'Request validation failed',
        errors,
        timestamp: new Date().toISOString()
      });
      return;
    }

    req.body = value;
    next();
  };
};
