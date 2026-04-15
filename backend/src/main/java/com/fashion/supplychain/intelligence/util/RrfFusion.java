package com.fashion.supplychain.intelligence.util;

import java.util.*;

public class RrfFusion {

    private static final int K = 60;

    public static <T> List<RankedItem<T>> fuse(Map<String, List<RankedItem<T>>> rankedLists) {
        Map<T, Double> scores = new LinkedHashMap<>();
        Map<T, String> titles = new HashMap<>();

        for (Map.Entry<String, List<RankedItem<T>>> entry : rankedLists.entrySet()) {
            List<RankedItem<T>> list = entry.getValue();
            for (int i = 0; i < list.size(); i++) {
                T item = list.get(i).getItem();
                double score = 1.0 / (K + i + 1);
                scores.merge(item, score, Double::sum);
                if (!titles.containsKey(item)) {
                    titles.put(item, list.get(i).getTitle());
                }
            }
        }

        List<RankedItem<T>> result = new ArrayList<>();
        for (Map.Entry<T, Double> entry : scores.entrySet()) {
            result.add(new RankedItem<>(entry.getKey(), titles.getOrDefault(entry.getKey(), ""), entry.getValue()));
        }
        result.sort((a, b) -> Double.compare(b.getScore(), a.getScore()));
        return result;
    }

    public static class RankedItem<T> {
        private final T item;
        private final String title;
        private final double score;

        public RankedItem(T item, String title, double score) {
            this.item = item;
            this.title = title;
            this.score = score;
        }

        public T getItem() { return item; }
        public String getTitle() { return title; }
        public double getScore() { return score; }
    }
}
