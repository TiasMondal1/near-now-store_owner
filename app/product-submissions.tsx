import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { getSession } from "../session";
import { apiClient } from "../lib/api-client";
import { colors, spacing } from "../lib/theme";
import { useLayout, useBottomPadding } from "../lib/useLayout";
import { Card, Divider, EmptyState, ErrorState, InlineNotice, Screen, Skeleton, TopBar } from "../components/ui";
import { GroupedRow, SubmissionRow, type Submission } from "../components/profile";

export default function ProductSubmissionsScreen() {
  const { contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Boolean only — the raw server/network message is never user-facing
  // (it was previously rendered verbatim in red); it goes to the dev console.
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const s = await getSession();
      if (!s?.token) {
        router.replace("/landing");
        return;
      }
      const res = await apiClient.get<{ submissions?: Submission[] }>(
        "/shopkeeper/product-submissions",
        { Authorization: `Bearer ${s.token}` }
      );
      if (!res.success) {
        if (__DEV__) console.warn("[product-submissions] load failed:", res.error_code, res.error);
        setError(true);
        return;
      }
      setSubmissions(res.data?.submissions ?? []);
    } catch (e: any) {
      if (__DEV__) console.warn("[product-submissions] load threw:", e?.message || e);
      setError(true);
    }
  }, []);

  const hasContent = submissions.length > 0;

  // Try again from the ErrorState (nothing shown) re-runs the first load
  // behind the skeleton; Retry from the stale-data notice (rows visible) is a
  // warm refresh — the list stays painted and only the pull spinner shows.
  const retry = useCallback(async () => {
    if (hasContent) {
      setRefreshing(true);
      await load();
      setRefreshing(false);
      return;
    }
    setLoading(true);
    await load();
    setLoading(false);
  }, [load, hasContent]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const renderItem = useCallback(
    ({ item, index }: { item: Submission; index: number }) => {
      const last = index === submissions.length - 1;
      return (
        <GroupedRow first={index === 0} last={last}>
          <SubmissionRow submission={item} />
          {last ? null : <Divider />}
        </GroupedRow>
      );
    },
    [submissions.length]
  );

  return (
    <Screen>
      <TopBar
        title="My submissions"
        subtitle="Custom products you've sent for review"
        backHref="/settings"
      />

      <FlatList
        data={submissions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { width: contentWidth, paddingBottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            enabled={!loading}
          />
        }
        ListHeaderComponent={
          error && hasContent ? (
            <View style={styles.header}>
              <InlineNotice
                tone="warning"
                title="Couldn't refresh"
                message="Showing saved data"
                action={{ label: "Retry", onPress: () => void retry() }}
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          // Only reached while the list is empty, so this is the first-load
          // skeleton — a retry over visible rows keeps them painted.
          loading ? (
            <Card padded={false}>
              <Skeleton.ListRow count={5} />
            </Card>
          ) : error ? (
            <ErrorState
              icon="cloud-offline-outline"
              title="Couldn't load submissions"
              message="Check your connection and try again."
              action={{ onPress: () => void retry(), loading }}
            />
          ) : (
            <EmptyState
              icon="cube-outline"
              title="No submissions yet"
              message="Custom products you send for review will appear here."
              // `navigate`, not `push`: this screen is also reached from Add
              // products' "Submissions" action, so go back to that entry when
              // it is already in the stack instead of stacking a second copy.
              action={{ label: "Add products", onPress: () => router.navigate("/add-products") }}
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, alignSelf: "center", paddingTop: spacing.lg },
  header: { paddingBottom: spacing.lg },
});
