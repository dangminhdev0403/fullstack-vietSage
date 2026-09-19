"use client";

export type ExcelColumn<T = Record<string, unknown>> = {
  header: string;
  key: keyof T | string;
  format?: (value: unknown, row: T) => string | number;
};

/**
 * Xuất dữ liệu sang định dạng Excel (.xls - XML Spreadsheet 2003 / UTF-8 CSV)
 * Đảm bảo 100% hiển thị tiếng Việt có dấu chuẩn xác trong Microsoft Excel.
 */
export function exportToExcel<T extends Record<string, unknown>>({
  filename,
  sheetName = "Danh sách",
  columns,
  data,
}: {
  filename: string;
  sheetName?: string;
  columns: ExcelColumn<T>[];
  data: T[];
}): void {
  // Tạo file XML Spreadsheet 2003 chuẩn của Microsoft Excel
  const cleanFilename = filename.endsWith(".xls") || filename.endsWith(".xlsx") || filename.endsWith(".csv")
    ? filename
    : `${filename}.xls`;

  // Xây dựng XML Spreadsheet
  const headerCells = columns
    .map(
      (col) =>
        `<Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${escapeXml(col.header)}</Data></Cell>`
    )
    .join("");

  const rowsXml = data
    .map((row, index) => {
      const cellsXml = columns
        .map((col) => {
          const rawValue = (row as Record<string, unknown>)[col.key as string];
          const formatted = col.format ? col.format(rawValue, row) : rawValue ?? "";
          const strValue = String(formatted);
          const isNum = typeof formatted === "number" && !Number.isNaN(formatted);
          return `<Cell ss:StyleID="${index % 2 === 0 ? "EvenRow" : "OddRow"}"><Data ss:Type="${isNum ? "Number" : "String"}">${escapeXml(strValue)}</Data></Cell>`;
        })
        .join("");

      return `<Row>${cellsXml}</Row>`;
    })
    .join("\n");

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Be Vietnam Pro" ss:Size="11" ss:Color="#17201B"/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#123D2A"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D4C8B5"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D4C8B5"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D4C8B5"/>
   </Borders>
   <Font ss:FontName="Be Vietnam Pro" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#123D2A" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="EvenRow">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAE3D6"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAE3D6"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAE3D6"/>
   </Borders>
   <Font ss:FontName="Be Vietnam Pro" ss:Size="10" ss:Color="#17201B"/>
   <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="OddRow">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAE3D6"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAE3D6"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAE3D6"/>
   </Borders>
   <Font ss:FontName="Be Vietnam Pro" ss:Size="10" ss:Color="#17201B"/>
   <Interior ss:Color="#FAF7F2" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${escapeXml(sheetName)}">
  <Table ss:DefaultRowHeight="24">
   ${columns.map(() => '<Column ss:AutoFitWidth="1" ss:Width="160"/>').join("\n   ")}
   <Row ss:Height="28">
    ${headerCells}
   </Row>
   ${rowsXml}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xmlContent], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", cleanFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
