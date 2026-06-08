import { renderTemplate } from "./templateMaker.js";

export const EXCEL_CONTENT_TYPE = "application/vnd.ms-excel";

export const buildBlankCells = (count = 0, className = "sheet-empty") => Array.from({ length: Math.max(Number(count) || 0, 0) }, () => `<td class="${className}">&nbsp;</td>`).join("");

export const buildSheetSpacerRow = (height = 20, spreadsheetColumnCount = 1) =>
  renderTemplate("sheetSpacerRow", "excel", {
    height,
    blankCells: buildBlankCells(spreadsheetColumnCount),
  });

export function buildSideBySideRows({
  leftTitle = "Left",
  leftData = {},
  rightTitle = "Right",
  rightData = {},
  gapCols = 1,
  labelColspan = 2,
  valueColspan = 2,
} = {}) {
  const leftEntries = Object.entries(leftData || {});
  const rightEntries = Object.entries(rightData || {});
  const maxRows = Math.max(leftEntries.length, rightEntries.length);

  const rows = [];
  for (let index = 0; index < maxRows; index += 1) {
    const left = leftEntries[index];
    const right = rightEntries[index];

    rows.push({
      leftLabel: left ? left[0] : "",
      leftValue: left ? left[1] : "",
      rightLabel: right ? right[0] : "",
      rightValue: right ? right[1] : "",
    });
  }

  return renderTemplate("sideBySideRows", "excel", {
    leftTitle,
    rightTitle,
    labelColspan,
    valueColspan,
    sectionColspan: labelColspan + valueColspan,
    gapCells: buildBlankCells(gapCols),
    rows,
  });
}

export const excelFormat = (html) => renderTemplate("excelLayout", "excel", { bodyRows: html });
export const buildExcelAttachment = ({ filename, html, contentType = EXCEL_CONTENT_TYPE } = {}) => {
  console.log('sdasdad : ',{
    filename,
    // content: html,
    contentType,
  });

  return ({
    filename,
    content: html,
    contentType,
  })
};
