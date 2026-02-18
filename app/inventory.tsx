import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getSession } from "../session";

const API_BASE = "http://192.168.1.117:3001";

const COLORS = {
  bg: "#05030A",
  card: "#120D24",
  soft: "#181134",
  border: "#392B6A",
  text: "#FFFFFF",
  muted: "#9C94D7",
  green: "#2ECC71",
  red: "#FF6B6B",
  yellow: "#F1C40F",
};

export default function InventoryScreen() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const s: any = await getSession();
      if (!s?.token) return;
      setToken(s.token);

      const storeRes = await fetch(`${API_BASE}/store-owner/stores`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      const storeJson = await storeRes.json();
      if (!storeJson?.stores?.length) return;

      const id = storeJson.stores[0].id;
      setStoreId(id);

      const res = await fetch(
        `${API_BASE}/store-owner/stores/${id}/products`,
        {
          headers: { Authorization: `Bearer ${s.token}` },
        }
      );
      const json = await res.json();
      setProducts(json.products || []);
      setLoading(false);
    })();
  }, []);

  const updateProduct = async (id: string, updates: any) => {
    if (!token) return;

    const res = await fetch(`${API_BASE}/store-owner/products/${id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      Alert.alert("Error", "Failed to update product");
      return;
    }

    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  };

  const q = search.trim().toLowerCase();
  const filtered = products.filter((p) =>
    [p.name, p.brand, p.category]
      .filter(Boolean)
      .some((x: string) => x.toLowerCase().includes(q))
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Inventory</Text>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search products, brands or categories"
          placeholderTextColor={COLORS.muted}
          style={styles.search}
        />

        {filtered.map((p) => {
          const out = p.quantity === 0;
          const inactive = !p.is_active;

          return (
            <TouchableOpacity
              key={p.id}
              style={styles.card}
              onLongPress={() =>
                Alert.alert(
                  "Deactivate product?",
                  "This will hide the product from customers.",
                  [
                    { text: "Cancel" },
                    {
                      text: "Deactivate",
                      style: "destructive",
                      onPress: () =>
                        updateProduct(p.id, { is_active: false }),
                    },
                  ]
                )
              }
            >
              <Image
                source={{ uri: p.image_url }}
                style={styles.image}
              />

              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={2}>
                  {p.name}
                </Text>

                <Text style={styles.meta}>
                  {p.brand ? `${p.brand} · ` : ""}
                  {p.category}
                </Text>

                <Text style={styles.price}>₹{p.price}</Text>

                <Text
                  style={{
                    color: inactive
                      ? COLORS.red
                      : out
                        ? COLORS.yellow
                        : COLORS.green,
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  {inactive
                    ? "Inactive"
                    : out
                      ? "Out of stock"
                      : "Active"}
                </Text>
              </View>

              <View style={styles.stockCol}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() =>
                    updateProduct(p.id, {
                      quantity: Math.max(0, p.quantity - 1),
                    })
                  }
                >
                  <Text style={styles.qtyText}>−</Text>
                </TouchableOpacity>

                <Text style={styles.qty}>{p.quantity}</Text>

                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() =>
                    updateProduct(p.id, {
                      quantity: p.quantity + 1,
                    })
                  }
                >
                  <Text style={styles.qtyText}>+</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 16 },
  title: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 12,
  },

  search: {
    backgroundColor: COLORS.soft,
    borderRadius: 14,
    padding: 12,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },

  card: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
    alignItems: "center",
  },

  image: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: COLORS.soft,
  },

  name: {
    color: COLORS.text,
    fontWeight: "700",
  },

  meta: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
  },

  price: {
    color: COLORS.green,
    fontWeight: "800",
    marginTop: 4,
  },

  stockCol: {
    alignItems: "center",
    gap: 6,
  },

  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },

  qtyText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
  },

  qty: {
    color: COLORS.text,
    fontWeight: "700",
  },
});
