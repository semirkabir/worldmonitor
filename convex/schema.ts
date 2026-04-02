import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  registrations: defineTable({
    email: v.string(),
    normalizedEmail: v.string(),
    registeredAt: v.number(),
    source: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    referralCode: v.optional(v.string()),
    referredBy: v.optional(v.string()),
    referralCount: v.optional(v.number()),
    firebaseUid: v.optional(v.string()),
    tier: v.optional(v.union(v.literal("free"), v.literal("pro"), v.literal("business"), v.literal("enterprise"))),
  })
    .index("by_normalized_email", ["normalizedEmail"])
    .index("by_referral_code", ["referralCode"])
    .index("by_firebase_uid", ["firebaseUid"]),
  counters: defineTable({
    name: v.string(),
    value: v.number(),
  }).index("by_name", ["name"]),

  // --- Data Marketplace ---

  datasets: defineTable({
    /** Unique dataset key, e.g. "naval-incidents-2024" */
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    format: v.union(v.literal("json"), v.literal("csv"), v.literal("geojson")),
    recordCount: v.optional(v.number()),
    fileSizeBytes: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    /** Minimum tier required to read. */
    minTier: v.literal("pro"),
    price: v.optional(v.number()), // cents, 0 = included in tier
    status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
    /** The full dataset as a JSON string. For small-medium datasets (<1MB)
     * stored directly in Convex.  Larger datasets go through Redis. */
    dataJson: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    previewJson: v.optional(v.string()), // sample rows for preview
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"]),

  purchases: defineTable({
    firebaseUid: v.string(),
    datasetSlug: v.string(),
    purchasedAt: v.number(),
    priceCents: v.optional(v.number()),
  })
    .index("by_user", ["firebaseUid"])
    .index("by_dataset", ["datasetSlug"]),
});
