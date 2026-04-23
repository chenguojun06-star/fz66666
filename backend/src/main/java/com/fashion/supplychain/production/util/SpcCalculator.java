package com.fashion.supplychain.production.util;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

public class SpcCalculator {

    public static BigDecimal calcCpk(List<Double> values, double usl, double lsl) {
        if (values == null || values.size() < 2) return null;
        double mean = values.stream().mapToDouble(d -> d).average().orElse(0);
        double stdDev = calcStdDev(values, mean);
        if (stdDev == 0) return BigDecimal.valueOf(99.99);
        double cpu = (usl - mean) / (3 * stdDev);
        double cpl = (mean - lsl) / (3 * stdDev);
        double cpk = Math.min(cpu, cpl);
        return BigDecimal.valueOf(cpk).setScale(2, RoundingMode.HALF_UP);
    }

    public static BigDecimal calcPpk(List<Double> values, double usl, double lsl) {
        return calcCpk(values, usl, lsl);
    }

    public static String cpkStatus(double cpk) {
        if (cpk >= 1.67) return "excellent";
        if (cpk >= 1.33) return "capable";
        if (cpk >= 1.0) return "marginal";
        return "incapable";
    }

    public static int[] aqlSamplePlan(int lotSize, String aqlLevel) {
        double aql = parseAql(aqlLevel);
        int sampleSize;
        if (lotSize <= 8) sampleSize = Math.min(lotSize, 2);
        else if (lotSize <= 25) sampleSize = 3;
        else if (lotSize <= 90) sampleSize = 5;
        else if (lotSize <= 150) sampleSize = 8;
        else if (lotSize <= 280) sampleSize = 13;
        else if (lotSize <= 500) sampleSize = 20;
        else if (lotSize <= 1200) sampleSize = 32;
        else if (lotSize <= 3200) sampleSize = 50;
        else sampleSize = 80;

        int acceptNum = Math.max(0, (int) Math.floor(sampleSize * aql / 100));
        int rejectNum = acceptNum + 1;
        return new int[]{sampleSize, acceptNum, rejectNum};
    }

    private static double parseAql(String level) {
        if (level == null) return 2.5;
        switch (level) {
            case "0.65": return 0.65;
            case "1.0": return 1.0;
            case "1.5": return 1.5;
            case "2.5": return 2.5;
            case "4.0": return 4.0;
            case "6.5": return 6.5;
            default: return 2.5;
        }
    }

    private static double calcStdDev(List<Double> values, double mean) {
        double sumSq = 0;
        for (double v : values) {
            sumSq += (v - mean) * (v - mean);
        }
        return Math.sqrt(sumSq / (values.size() - 1));
    }
}
