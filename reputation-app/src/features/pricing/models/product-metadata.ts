import z from 'zod';

export const priceCardVariantSchema = z.enum(['starter', 'growth', 'shield']);

export const productMetadataSchema = z
  .object({
    price_card_variant: priceCardVariantSchema,
    locations:          z.string().optional(),
    review_alerts:      z.string().optional(),
    ai_drafts:          z.string().optional(),
    review_requests:    z.string().optional(),
    support_level:      z.string().optional(),
  })
  .transform((data) => ({
    priceCardVariant: data.price_card_variant,
    locations:        data.locations ?? '1',
    reviewAlerts:     data.review_alerts ?? 'email',
    aiDrafts:         data.ai_drafts === 'true',
    reviewRequests:   data.review_requests === 'true',
    supportLevel:     data.support_level ?? 'email',
  }));

export type ProductMetadata = z.infer<typeof productMetadataSchema>;
export type PriceCardVariant = z.infer<typeof priceCardVariantSchema>;
