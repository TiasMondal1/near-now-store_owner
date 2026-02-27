import { supabase } from "./supabase";

/**
 * Database diagnostic utility
 * Use this to test if Supabase writes are working
 */

export async function testSupabaseConnection() {
  console.log("=== Supabase Connection Test ===");
  
  if (!supabase) {
    console.error("❌ Supabase client not initialized");
    return {
      success: false,
      error: "Supabase not configured. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env",
    };
  }

  console.log("✅ Supabase client initialized");

  // Test 1: Can we read master_products?
  console.log("\nTest 1: Reading master_products...");
  const { data: masterProducts, error: masterError } = await supabase
    .from("master_products")
    .select("id, name")
    .limit(5);

  if (masterError) {
    console.error("❌ Cannot read master_products:", masterError.message);
    return {
      success: false,
      error: `Cannot read master_products: ${masterError.message}. Run RLS SQL in Supabase.`,
    };
  }

  console.log(`✅ Read ${masterProducts?.length || 0} master products`);
  if (masterProducts && masterProducts.length > 0) {
    console.log("Sample:", masterProducts[0]);
  }

  // Test 2: Can we read products table?
  console.log("\nTest 2: Reading products table...");
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, store_id, master_product_id, quantity")
    .limit(5);

  if (productsError) {
    console.error("❌ Cannot read products:", productsError.message);
    return {
      success: false,
      error: `Cannot read products: ${productsError.message}. Run RLS SQL in Supabase.`,
    };
  }

  console.log(`✅ Read ${products?.length || 0} products`);

  // Test 3: Can we read stores table?
  console.log("\nTest 3: Reading stores table...");
  const { data: stores, error: storesError } = await supabase
    .from("stores")
    .select("id, name")
    .limit(5);

  if (storesError) {
    console.error("❌ Cannot read stores:", storesError.message);
    return {
      success: false,
      error: `Cannot read stores: ${storesError.message}`,
    };
  }

  console.log(`✅ Read ${stores?.length || 0} stores`);
  if (stores && stores.length > 0) {
    console.log("Sample store:", stores[0]);
  }

  console.log("\n=== All tests passed! ===");
  return {
    success: true,
    masterProductsCount: masterProducts?.length || 0,
    productsCount: products?.length || 0,
    storesCount: stores?.length || 0,
  };
}

export async function testProductInsert(storeId: string) {
  console.log("=== Testing Product Insert ===");
  console.log("Store ID:", storeId);

  if (!supabase) {
    console.error("❌ Supabase not configured");
    return { success: false, error: "Supabase not configured" };
  }

  if (!storeId) {
    console.error("❌ No store ID provided");
    return { success: false, error: "No store ID" };
  }

  // Get a real master_product_id
  const { data: masterProducts } = await supabase
    .from("master_products")
    .select("id")
    .limit(1)
    .single();

  if (!masterProducts?.id) {
    console.error("❌ No master products found");
    return { success: false, error: "No master products in database" };
  }

  console.log("Using master_product_id:", masterProducts.id);

  // Try to insert a test product
  const testPayload = {
    store_id: storeId,
    master_product_id: masterProducts.id,
    quantity: 999, // Test quantity
    is_active: true,
    in_stock: true,
  };

  console.log("Inserting test product:", testPayload);

  const { data, error } = await supabase
    .from("products")
    .insert(testPayload)
    .select("id")
    .single();

  if (error) {
    console.error("❌ Insert failed:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });

    let errorHint = "";
    if (error.message.includes("permission") || error.message.includes("denied")) {
      errorHint = "\n\n🔧 Fix: Run supabase/products-rls-anon.sql in Supabase SQL Editor";
    } else if (error.message.includes("foreign key") || error.code === "23503") {
      errorHint = "\n\n🔧 Fix: Store doesn't exist. Check stores table in Supabase";
    }

    return {
      success: false,
      error: error.message + errorHint,
    };
  }

  console.log("✅ Test product inserted successfully!");
  console.log("Product ID:", data.id);

  // Clean up: delete the test product
  await supabase.from("products").delete().eq("id", data.id);
  console.log("✅ Test product cleaned up");

  return {
    success: true,
    productId: data.id,
  };
}
