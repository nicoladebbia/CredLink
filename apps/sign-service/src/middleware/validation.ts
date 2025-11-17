import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from './error-handler';

export const validateRequest = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      const validatedData = schema.parse(req.body);
      req.body = validatedData;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorDetails = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));
        
        throw new AppError(
          `Validation failed: ${error.errors.map(e => e.message).join(', ')}`,
          400
        );
      }
      next(error);
    }
  };
};

export const validateFileUpload = (options: {
  maxSize?: number;
  allowedTypes?: string[];
  maxFiles?: number;
} = {}) => {
  const {
    maxSize = 50 * 1024 * 1024, // 50MB default
    allowedTypes = ['image/jpeg', 'image/png', 'image/tiff', 'image/webp'],
    maxFiles = 1
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = req.files as Express.Multer.File[] || [];
      const singleFile = req.file;

      if (maxFiles === 1) {
        // Single file validation
        if (!singleFile) {
          throw new AppError('No file uploaded', 400);
        }

        if (singleFile.size > maxSize) {
          throw new AppError(
            `File size exceeds limit: ${Math.round(singleFile.size / 1024 / 1024)}MB > ${Math.round(maxSize / 1024 / 1024)}MB`,
            400
          );
        }

        if (!allowedTypes.includes(singleFile.mimetype)) {
          throw new AppError(
            `Unsupported file type: ${singleFile.mimetype}. Allowed types: ${allowedTypes.join(', ')}`,
            400
          );
        }
      } else {
        // Multiple files validation
        if (files.length === 0) {
          throw new AppError('No files uploaded', 400);
        }

        if (files.length > maxFiles) {
          throw new AppError(
            `Too many files: ${files.length} > ${maxFiles}`,
            400
          );
        }

        for (const file of files) {
          if (file.size > maxSize) {
            throw new AppError(
              `File ${file.originalname} size exceeds limit: ${Math.round(file.size / 1024 / 1024)}MB > ${Math.round(maxSize / 1024 / 1024)}MB`,
              400
            );
          }

          if (!allowedTypes.includes(file.mimetype)) {
            throw new AppError(
              `File ${file.originalname} has unsupported type: ${file.mimetype}. Allowed types: ${allowedTypes.join(', ')}`,
              400
            );
          }
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
