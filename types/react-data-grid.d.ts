declare module "react-data-grid" {
  import * as React from "react";

  // Default export component (untuk import DataGrid from "react-data-grid")
  const DataGrid: any;
  export default DataGrid;

  // Named export (untuk import { DataGrid, Column, RenderCellProps } from "react-data-grid")
  export const DataGrid as NamedDataGrid: any;

  // Generic Column type yang longgar — mendukung properti kustom seperti renderCell / renderEditCell
  export type Column<R = any, K = unknown> = {
    key?: string;
    name?: string;
    width?: number | string;
    resizable?: boolean;
    sortable?: boolean;
    frozen?: boolean;
    // izinkan properti custom (renderCell, renderEditCell, formatter, editor, dll)
    [prop: string]: any;
  };

  // Props untuk cell renderer / editor
  export type RenderCellProps<R = any> = {
    row: R;
    column: Column<R>;
    rowIdx?: number;
    columnIdx?: number;
    isCopied?: boolean;
    isDragged?: boolean;
    dragHandle?: boolean;
    [prop: string]: any;
  };

  export type RenderEditCellProps<R = any> = {
    row: R;
    column: Column<R>;
    onRowChange?: (newRow: R, commit?: boolean) => void;
    onClose?: () => void;
    [prop: string]: any;
  };

  // jika Anda memakai Column[] dari library
  export type Columns<R = any> = Array<Column<R>>;

  // Event / API lain — biarkan any untuk kompatibilitas
  export type RowRendererProps = any;
  export type FormatterProps = any;
  export type EditorProps = any;

  // Ekspor tambahan yang mungkin dipakai
  export const Editors: any;
  export const Formatters: any;
  export const Row: any;
}
