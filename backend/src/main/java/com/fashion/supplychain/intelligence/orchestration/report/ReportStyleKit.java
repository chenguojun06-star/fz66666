package com.fashion.supplychain.intelligence.orchestration.report;

import org.apache.poi.ss.usermodel.*;

public class ReportStyleKit {

    public final CellStyle titleStyle;
    public final CellStyle subtitleStyle;
    public final CellStyle sectionStyle;
    public final CellStyle headerStyle;
    public final CellStyle labelStyle;
    public final CellStyle dataStyle;
    public final CellStyle infoStyle;
    public final CellStyle warnStyle;

    public ReportStyleKit(Workbook wb) {
        titleStyle = wb.createCellStyle();
        Font titleFont = wb.createFont();
        titleFont.setBold(true);
        titleFont.setFontHeightInPoints((short) 22);
        titleFont.setColor(IndexedColors.DARK_BLUE.getIndex());
        titleStyle.setFont(titleFont);

        subtitleStyle = wb.createCellStyle();
        Font subFont = wb.createFont();
        subFont.setBold(true);
        subFont.setFontHeightInPoints((short) 16);
        subFont.setColor(IndexedColors.GREY_80_PERCENT.getIndex());
        subtitleStyle.setFont(subFont);

        sectionStyle = wb.createCellStyle();
        Font secFont = wb.createFont();
        secFont.setBold(true);
        secFont.setFontHeightInPoints((short) 13);
        secFont.setColor(IndexedColors.DARK_BLUE.getIndex());
        sectionStyle.setFont(secFont);
        sectionStyle.setBorderBottom(BorderStyle.MEDIUM);
        sectionStyle.setBottomBorderColor(IndexedColors.DARK_BLUE.getIndex());

        headerStyle = wb.createCellStyle();
        Font headerFont = wb.createFont();
        headerFont.setBold(true);
        headerFont.setFontHeightInPoints((short) 11);
        headerFont.setColor(IndexedColors.WHITE.getIndex());
        headerStyle.setFont(headerFont);
        headerStyle.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
        headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        headerStyle.setBorderBottom(BorderStyle.THIN);
        headerStyle.setBorderTop(BorderStyle.THIN);
        headerStyle.setBorderLeft(BorderStyle.THIN);
        headerStyle.setBorderRight(BorderStyle.THIN);
        headerStyle.setAlignment(HorizontalAlignment.CENTER);

        labelStyle = wb.createCellStyle();
        Font labelFont = wb.createFont();
        labelFont.setFontHeightInPoints((short) 11);
        labelStyle.setFont(labelFont);
        labelStyle.setBorderBottom(BorderStyle.THIN);
        labelStyle.setBorderTop(BorderStyle.THIN);
        labelStyle.setBorderLeft(BorderStyle.THIN);
        labelStyle.setBorderRight(BorderStyle.THIN);
        labelStyle.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        labelStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);

        dataStyle = wb.createCellStyle();
        Font dataFont = wb.createFont();
        dataFont.setFontHeightInPoints((short) 11);
        dataStyle.setFont(dataFont);
        dataStyle.setBorderBottom(BorderStyle.THIN);
        dataStyle.setBorderTop(BorderStyle.THIN);
        dataStyle.setBorderLeft(BorderStyle.THIN);
        dataStyle.setBorderRight(BorderStyle.THIN);
        dataStyle.setAlignment(HorizontalAlignment.CENTER);

        infoStyle = wb.createCellStyle();
        Font infoFont = wb.createFont();
        infoFont.setFontHeightInPoints((short) 11);
        infoFont.setColor(IndexedColors.GREY_50_PERCENT.getIndex());
        infoStyle.setFont(infoFont);

        warnStyle = wb.createCellStyle();
        Font warnFont = wb.createFont();
        warnFont.setBold(true);
        warnFont.setFontHeightInPoints((short) 12);
        warnFont.setColor(IndexedColors.RED.getIndex());
        warnStyle.setFont(warnFont);
        warnStyle.setBorderBottom(BorderStyle.THIN);
        warnStyle.setBorderTop(BorderStyle.THIN);
        warnStyle.setBorderLeft(BorderStyle.THIN);
        warnStyle.setBorderRight(BorderStyle.THIN);
        warnStyle.setAlignment(HorizontalAlignment.CENTER);
    }
}
