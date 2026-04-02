/**
 * Convex mutations/queries for the Data Marketplace.
 *
 * Handles dataset catalog (CRUD), purchases, and tier upgrades.
 *
 * Data Marketplace workflow:
 *  1. Admin creates a dataset via `createDataset` mutation
 *  2. Dataset is published with `minTier: 'pro'` (or higher)
 *  3. User's tier is checked — if >= minTier, they can view
 *  4. Paid datasets (price > 0) are tracked via `createPurchase`
 */

import { mutation, query } from "./_generated_server";
import { v } from "convex/values";

const TIER_ORDER = { free: 0, pro: 1, business: 2, enterprise: 3 } as const;

function meetsTier(user: string | null, required: string): boolean {
  if (!user) return false;
  const uTier = TIER_ORDER[user as keyof typeof TIER_ORDER] ?? -1;
  return uTier >= (TIER_ORDER[required as keyof typeof TIER_ORDER] ?? 99);
}

// --- Dataset Catalog ---

export const listDatasets = query({
  args: {},
  handler: async (ctx) => {
    const datasets = await ctx.db
      .query("datasets")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();

    return datasets.map((d) => ({
      slug: d.slug,
      title: d.title,
      description: d.description,
      format: d.format,
      recordCount: d.recordCount ?? 0,
      fileSizeBytes: d.fileSizeBytes ?? 0,
      minTier: d.minTier,
      price: d.price ?? 0,
      tags: d.tags ?? [],
      category: d.category ?? "general",
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      // Send preview if available, never send dataJson
      preview: d.previewJson ? JSON.parse(d.previewJson) : null,
    }));
  },
});

export const getDataset = query({
  args: {
    slug: v.string(),
    firebaseUid: v.optional(v.string()),
    userTier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const dataset = await ctx.db
      .query("datasets")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!dataset || dataset.status !== "published") {
      return { error: "Dataset not found" };
    }

    const userTier = args.userTier ?? "free";
    const hasAccess = meetsTier(userTier, dataset.minTier);

    // Check if user purchased the dataset
    let purchased = false;
    if (!hasAccess && args.firebaseUid) {
      const purchase = await ctx.db
        .query("purchases")
        .filter((q) =>
          q.and(
            q.eq(q.field("firebaseUid"), args.firebaseUid),
            q.eq(q.field("datasetSlug"), args.slug),
          ),
        )
        .first();
      purchased = !!purchase;
    }

    if (!hasAccess && !purchased) {
      return {
        slug: dataset.slug,
        title: dataset.title,
        description: dataset.description,
        format: dataset.format,
        minTier: dataset.minTier,
        price: dataset.price ?? 0,
        preview: dataset.previewJson ? JSON.parse(dataset.previewJson) : null,
        accessDenied: true,
        reason: `Requires ${dataset.minTier} tier or purchase.`,
      };
    }

    return {
      slug: dataset.slug,
      title: dataset.title,
      description: dataset.description,
      format: dataset.format,
      recordCount: dataset.recordCount ?? 0,
      data: dataset.dataJson ? JSON.parse(dataset.dataJson) : null,
    };
  },
});

// --- Admin: Dataset CRUD ---

export const createDataset = mutation({
  args: {
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    format: v.union(v.literal("json"), v.literal("csv"), v.literal("geojson")),
    recordCount: v.optional(v.number()),
    fileSizeBytes: v.optional(v.number()),
    minTier: v.literal("pro"),
    price: v.optional(v.number()),
    dataJson: v.optional(v.string()),
    previewJson: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("datasets")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (existing) {
      return { status: "exists", slug: args.slug };
    }

    const now = Date.now();
    await ctx.db.insert("datasets", {
      ...args,
      createdAt: now,
      updatedAt: now,
      status: "draft",
      tags: args.tags ?? [],
    });

    return { status: "created", slug: args.slug };
  },
});

export const publishDataset = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const dataset = await ctx.db
      .query("datasets")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!dataset) return { status: "not_found" };

    await ctx.db.patch(dataset._id, { status: "published", updatedAt: Date.now() });
    return { status: "published" };
  },
});

// --- Tier Upgrade ---

export const upgradeTier = mutation({
  args: {
    firebaseUid: v.string(),
    tier: v.union(v.literal("pro"), v.literal("business"), v.literal("enterprise")),
  },
  handler: async (ctx, args) => {
    const reg = await ctx.db
      .query("registrations")
      .withIndex("by_firebase_uid", (q) => q.eq("firebaseUid", args.firebaseUid))
      .first();

    if (!reg) {
      return { status: "not_found", firebaseUid: args.firebaseUid };
    }

    // Don't downgrade
    const current = TIER_ORDER[reg.tier as keyof typeof TIER_ORDER] ?? 0;
    const newTier = TIER_ORDER[args.tier as keyof typeof TIER_ORDER] ?? 0;
    if (newTier <= current) {
      return { status: "no_change", tier: reg.tier };
    }

    await ctx.db.patch(reg._id, { tier: args.tier });
    return { status: "upgraded", from: reg.tier, to: args.tier };
  },
});

export const getUserTier = query({
  args: { firebaseUid: v.string() },
  handler: async (ctx, args) => {
    const reg = await ctx.db
      .query("registrations")
      .withIndex("by_firebase_uid", (q) => q.eq("firebaseUid", args.firebaseUid))
      .first();
    return reg?.tier ?? "free";
  },
});

// --- Purchases ---

export const createPurchase = mutation({
  args: {
    firebaseUid: v.string(),
    datasetSlug: v.string(),
    priceCents: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const dataset = await ctx.db
      .query("datasets")
      .withIndex("by_slug", (q) => q.eq("slug", args.datasetSlug))
      .first();
    if (!dataset) return { status: "dataset_not_found" };

    // Check if already purchased
    const existing = await ctx.db
      .query("purchases")
      .filter((q) =>
        q.and(
          q.eq(q.field("firebaseUid"), args.firebaseUid),
          q.eq(q.field("datasetSlug"), args.datasetSlug),
        ),
      )
      .first();
    if (existing) return { status: "already_purchased" };

    await ctx.db.insert("purchases", {
      firebaseUid: args.firebaseUid,
      datasetSlug: args.datasetSlug,
      purchasedAt: Date.now(),
      priceCents: args.priceCents ?? dataset.price ?? 0,
    });
    return { status: "purchased" };
  },
});

export const getUserPurchases = query({
  args: { firebaseUid: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("purchases")
      .filter((q) => q.eq(q.field("firebaseUid"), args.firebaseUid))
      .collect();
  },
});
