// convex/profiles.ts
import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";

/** Tiny helpers */
function normalize(s?: string | null) {
  // Remove CR and trim to kill copy-paste whitespace/newlines
  return (s ?? "").replace(/\r/g, "").trim();
}

// Set ALLOW_RAW_KEY_LOGS=true only in local dev if you want to see actual keys
const allowRaw = normalize(process.env.ALLOW_RAW_KEY_LOGS) === "true";

function debugKeyCompare(where: string, envKey: string, argKey: string) {
  // Safe info
  console.log(`[profiles:${where}] key lengths`, {
    envLen: envKey.length,
    argLen: argKey.length,
  });
  // Optional raw output for local debugging only
  if (allowRaw) {
    console.log(`[profiles:${where}] RAW envKey="${envKey}"`);
    console.log(`[profiles:${where}] RAW argKey="${argKey}"`);
  }
}

function verifyServiceKeyOrThrow(where: string, argKey?: string) {
  const envKey = normalize(process.env.CONVEX_SERVICE_ROLE_KEY);
  const clientKey = normalize(argKey);

  if (!envKey) {
    console.error(`[profiles:${where}] CONVEX_SERVICE_ROLE_KEY missing in environment`);
    throw new Error("Server not configured");
  }
  if (!clientKey) {
    console.error(`[profiles:${where}] serviceKey argument missing`);
    throw new Error("Unauthorized");
  }

  debugKeyCompare(where, envKey, clientKey);

  if (envKey !== clientKey) {
    console.error(`[profiles:${where}] serviceKey mismatch`);
    throw new Error("Unauthorized");
  }
}

/**
 * Get AI profile context by user ID with service key (server-side usage) - creates profile if it doesn't exist
 */
export const getAIProfilePublic = mutation({
  args: {
    serviceKey: v.string(),
    userId: v.string(),
  },
  returns: v.object({
    user_id: v.string(),
    profile_context: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Verify service role key (from your server, never the browser)
    verifyServiceKeyOrThrow("getAIProfilePublic", args.serviceKey);

    let profile = await ctx.db
      .query("profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", args.userId))
      .unique();

    // Create profile if it doesn't exist
    if (!profile) {
      const profileId = await ctx.db.insert("profiles", {
        user_id: args.userId,
      });

      profile = await ctx.db.get(profileId);
      if (!profile) {
        throw new Error("Failed to retrieve created profile");
      }
    }

    return {
      user_id: profile.user_id,
      profile_context: profile.profile_context,
    };
  },
});

/**
 * Get profile by user ID or create if it doesn't exist
 */
export const getOrCreateProfile = internalMutation({
  args: {
    userId: v.string(),
  },
  returns: v.object({
    _id: v.id("profiles"),
    _creationTime: v.number(),
    user_id: v.string(),
    image_url: v.optional(v.string()),
    profile_context: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // First try to get existing profile
    const existingProfile = await ctx.db
      .query("profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", args.userId))
      .unique();

    if (existingProfile) {
      return existingProfile;
    }

    // Create new profile if it doesn't exist
    const profileId = await ctx.db.insert("profiles", {
      user_id: args.userId,
    });

    const createdProfile = await ctx.db.get(profileId);
    if (!createdProfile) {
      throw new Error("Failed to retrieve created profile");
    }

    return createdProfile;
  },
});

/**
 * Update an existing profile or create if it doesn't exist
 */
export const updateProfile = internalMutation({
  args: {
    userId: v.string(),
    profile_context: v.string(),
  },
  returns: v.object({
    _id: v.id("profiles"),
    _creationTime: v.number(),
    user_id: v.string(),
    image_url: v.optional(v.string()),
    profile_context: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const existingProfile = await ctx.db
      .query("profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", args.userId))
      .unique();

    // Create profile if it doesn't exist
    if (!existingProfile) {
      const profileId = await ctx.db.insert("profiles", {
        user_id: args.userId,
        profile_context: args.profile_context,
      });

      const createdProfile = await ctx.db.get(profileId);
      if (!createdProfile) {
        throw new Error("Failed to retrieve created profile");
      }
      return createdProfile;
    }

    // Update existing profile
    await ctx.db.patch(existingProfile._id, {
      profile_context: args.profile_context,
    });

    const updatedProfile = await ctx.db.get(existingProfile._id);
    if (!updatedProfile) {
      throw new Error("Failed to retrieve updated profile");
    }

    return updatedProfile;
  },
});

/**
 * Update profile avatar - creates profile if it doesn't exist
 */
export const updateProfileAvatar = mutation({
  args: {
    serviceKey: v.string(),
    userId: v.string(),
    avatarUrl: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    // Verify service role key
    try {
      verifyServiceKeyOrThrow("updateProfileAvatar", args.serviceKey);
    } catch (e) {
      // Keep same return shape as your original function
      return false;
    }

    const existingProfile = await ctx.db
      .query("profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", args.userId))
      .unique();

    // Create profile if it doesn't exist
    if (!existingProfile) {
      await ctx.db.insert("profiles", {
        user_id: args.userId,
        image_url: args.avatarUrl,
      });
      return true;
    }

    // Only update avatar if user doesn't already have one
    if (!existingProfile.image_url) {
      await ctx.db.patch(existingProfile._id, {
        image_url: args.avatarUrl,
      });
      return true;
    }

    // Return false if avatar already exists (no update needed)
    return false;
  },
});
