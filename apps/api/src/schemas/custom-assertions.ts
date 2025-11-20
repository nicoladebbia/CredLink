import { z } from 'zod';

/**
 * 🔥 CRITICAL SECURITY FIX: Custom Assertions Schema
 * 
 * Validates custom assertion data structure
 * Prevents injection attacks through malformed assertions
 */

const customAssertionSchema = z.object({
  name: z.string().min(1).max(100),
  value: z.union([
    z.string().max(10000),
    z.number(),
    z.boolean(),
    z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  ]),
  confidence: z.number().min(0).max(1).optional(),
  source: z.string().max(500).optional(),
  timestamp: z.string().datetime().optional()
}).strict();

export const customAssertionsSchema = z.array(customAssertionSchema).max(10); // Max 10 custom assertions
export type CustomAssertion = z.infer<typeof customAssertionSchema>;
export type CustomAssertions = z.infer<typeof customAssertionsSchema>;
