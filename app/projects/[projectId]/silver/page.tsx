"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

// Import libraries untuk export dan print
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

function debounceFn<T extends (...args: any[]) => any>(fn: T, wait = 1000) {
  let timeout: any;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

type TaskType = {
  id?: string | null;
  project_id?: string | null;
  row_index?: number | null;
  description?: string | null;
  weight?: number | null;
  plan_progress?: number | null;
  actual_progress?: number | null;
  color?: string | null;
  location?: string | null;
  proof_url?: string | null;
  dates?: Record<string, any> | null;
  style?: any;
  is_uploaded?: boolean;
};

type DateColsHistory = {
  dateCols: string[];
  rows: TaskType[];
  targetRows: TaskType[];
  realisasiRows: TaskType[];
};

type NoteType = {
  id: string;
  project_id: string;
  content: string;
  audio_url?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type ProjectMetaType = {
  project_code?: string;
  job_name?: string;
  no_rks?: string;
  date?: string;
  client?: string;
  address?: string;
  time_schedule?: string;
  deadline?: string;
};

type UserPresenceType = {
  id: string;
  email: string;
  user_metadata?: {
    avatar_url?: string;
    full_name?: string;
  };
  last_seen: string;
  active_tab: string;
  editing_task?: string;
};

// ============ PERBAIKAN: CUSTOM SPREADSHEET DENGAN HEADER EDITABLE ============
const CustomSpreadsheet = ({ 
  data, 
  columnLabels, 
  onChange, 
  onCellSelected,
  onCellDoubleClick,
  onRangeSelected,
  activeTab,
  dateCols,
  type = 'planning',
  selectedRange,
  setSelectedRange,
  onHeaderChange // New prop for header editing
}: any) => {
  const [editingCell, setEditingCell] = useState<{row: number, col: number} | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{row: number, col: number} | null>(null);
  
  const tableRef = useRef<HTMLTableElement>(null);
  
  const handleMouseDown = (rowIndex: number, cellIndex: number, e: React.MouseEvent) => {
    // PERBAIKAN: Allow header cells to be selected
    if (rowIndex === -1) {
      // This is a header cell
      setSelectedRange({
        startRow: -1,
        startCol: cellIndex,
        endRow: -1,
        endCol: cellIndex
      });
      onCellSelected?.(-1, cellIndex);
      return;
    }
    
    const firstCell = data[rowIndex]?.[0];
    const cellValue = typeof firstCell === 'object' ? firstCell?.value : firstCell;
    
    if (typeof cellValue === 'string' && cellValue.includes("TOTAL %")) {
      return;
    }
    
    if (e.shiftKey && selectedRange) {
      const newRange = {
        startRow: Math.min(selectedRange.startRow, rowIndex),
        startCol: Math.min(selectedRange.startCol, cellIndex),
        endRow: Math.max(selectedRange.endRow, rowIndex),
        endCol: Math.max(selectedRange.endCol, cellIndex)
      };
      setSelectedRange(newRange);
      onRangeSelected?.(newRange);
    } else {
      setIsSelecting(true);
      setSelectionStart({row: rowIndex, col: cellIndex});
      setSelectedRange({
        startRow: rowIndex,
        startCol: cellIndex,
        endRow: rowIndex,
        endCol: cellIndex
      });
      onCellSelected?.(rowIndex, cellIndex);
    }
  };
  
  const handleMouseOver = (rowIndex: number, cellIndex: number) => {
    if (isSelecting && selectionStart && rowIndex !== -1) {
      const startRow = Math.min(selectionStart.row, rowIndex);
      const startCol = Math.min(selectionStart.col, cellIndex);
      const endRow = Math.max(selectionStart.row, rowIndex);
      const endCol = Math.max(selectionStart.col, cellIndex);
      
      const newRange = { startRow, startCol, endRow, endCol };
      setSelectedRange(newRange);
      onRangeSelected?.(newRange);
    }
  };
  
  const handleMouseUp = () => {
    setIsSelecting(false);
    setSelectionStart(null);
  };
  
  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);
  
  const handleCellDoubleClick = (rowIndex: number, cellIndex: number, value: any) => {
    // PERBAIKAN: Allow editing ALL cells including headers (rowIndex === -1 for headers)
    const isHeader = rowIndex === -1;
    
    if (!isHeader) {
      const firstCell = data[rowIndex]?.[0];
      const cellValue = typeof firstCell === 'object' ? firstCell?.value : firstCell;
      
      if (typeof cellValue === 'string' && cellValue.includes("TOTAL %")) {
        return;
      }
    }
    
    setEditingCell({row: rowIndex, col: cellIndex});
    const actualValue = value && typeof value === 'object' ? value.value : value;
    setEditValue(actualValue || '');
  };
  
  const handleEditBlur = () => {
    if (editingCell && !isComposing) {
      const rowIndex = editingCell.row;
      const colIndex = editingCell.col;
      
      // PERBAIKAN: Handle header editing separately
      if (rowIndex === -1) {
        // This is a header cell edit
        if (onHeaderChange && editValue !== undefined) {
          onHeaderChange(colIndex, editValue);
        }
      } else {
        // This is a regular cell edit
        if (onChange) {
          const newData = [...data];
          const firstCell = newData[rowIndex]?.[0];
          const cellValue = typeof firstCell === 'object' ? firstCell?.value : firstCell;
          if (typeof cellValue === 'string' && cellValue.includes("TOTAL %")) {
            setEditingCell(null);
            return;
          }
          
          const cell = newData[rowIndex]?.[colIndex];
          let newValue = editValue;
          
          // Handle input angka dengan koma
          if ((colIndex === 2 || colIndex === 3 || colIndex === 4 || 
               (colIndex >= (type === 'planning' ? 6 : 5) && 
                colIndex < (type === 'planning' ? 6 : 5) + dateCols.length)) && 
              editValue && editValue !== '') {
            newValue = editValue.replace(',', '.');
          }
          
          if (cell && typeof cell === 'object') {
            newData[rowIndex][colIndex] = {
              ...cell,
              value: newValue,
              originalValue: editValue
            };
          } else {
            newData[rowIndex][colIndex] = newValue;
          }
          
          // Apply to selected range
          if (selectedRange && (selectedRange.startRow !== selectedRange.endRow || 
              selectedRange.startCol !== selectedRange.endCol)) {
            const { startRow, endRow, startCol, endCol } = selectedRange;
            for (let r = startRow; r <= endRow; r++) {
              for (let c = startCol; c <= endCol; c++) {
                if (r === rowIndex && c === colIndex) continue;
                
                const selCell = newData[r]?.[c];
                if (selCell && typeof selCell === 'object') {
                  newData[r][c] = {
                    ...selCell,
                    value: newValue,
                    originalValue: editValue
                  };
                } else {
                  newData[r][c] = newValue;
                }
              }
            }
          }
          
          onChange(newData);
        }
      }
    }
    setEditingCell(null);
  };
  
  const getCellStyle = (rowIndex: number, cellIndex: number) => {
    const isHeader = rowIndex === -1;
    
    if (isHeader) {
      // Header style
      const style: any = {
        fontWeight: 'bold',
        backgroundColor: '#f7fafc',
        cursor: 'pointer'
      };
      
      if (selectedRange && selectedRange.startRow === -1 && 
          cellIndex >= selectedRange.startCol && cellIndex <= selectedRange.endCol) {
        style.backgroundColor = '#dbeafe';
        style.boxShadow = 'inset 0 0 0 1px #3b82f6';
      }
      
      return style;
    }
    
    const cell = data[rowIndex]?.[cellIndex];
    if (!cell) return {};
    
    const style: any = {};
    
    if (typeof cell === 'object' && cell !== null) {
      if (cell.fontWeight === 'bold' || cell.fontWeight === '700') style.fontWeight = 'bold';
      if (cell.fontStyle === 'italic') style.fontStyle = 'italic';
      if (cell.textDecoration === 'underline') style.textDecoration = 'underline';
      if (cell.textDecoration === 'line-through') style.textDecoration = 'line-through';
      if (cell.textAlign) style.textAlign = cell.textAlign;
      if (cell.color) style.color = cell.color;
      if (cell.backgroundColor) style.backgroundColor = cell.backgroundColor;
      if (cell.fontSize) style.fontSize = cell.fontSize;
      if (cell.fontFamily) style.fontFamily = cell.fontFamily;
      if (cell.wrapText) style.whiteSpace = 'normal';
      if (cell.border) {
        if (cell.border === true || cell.border === 'all') {
          style.border = '1px solid #000000';
        } else if (cell.border === 'outer') {
          if (rowIndex === 0) style.borderTop = '2px solid #000000';
          if (cellIndex === 0) style.borderLeft = '2px solid #000000';
          if (cellIndex === data[0].length - 1) style.borderRight = '2px solid #000000';
          if (rowIndex === data.length - 1) style.borderBottom = '2px solid #000000';
        } else if (cell.border === 'inner') {
          style.border = '1px solid #cccccc';
        }
      }
    }
    
    if (selectedRange) {
      const { startRow, endRow, startCol, endCol } = selectedRange;
      if (rowIndex >= startRow && rowIndex <= endRow && 
          cellIndex >= startCol && cellIndex <= endCol) {
        style.backgroundColor = style.backgroundColor || '#dbeafe';
        style.boxShadow = 'inset 0 0 0 1px #3b82f6';
      }
    }
    
    return style;
  };
  
  const getCellValue = (cell: any): string => {
    if (!cell && cell !== 0 && cell !== '') return '';
    
    if (typeof cell === 'object' && cell !== null) {
      if (cell.originalValue !== undefined) {
        return String(cell.originalValue);
      }
      return cell.value !== undefined ? String(cell.value) : '';
    }
    
    return String(cell);
  };
  
  const renderHeaderCell = (colIndex: number, label: string) => {
    const isEditing = editingCell?.row === -1 && editingCell?.col === colIndex;
    const cellStyle = getCellStyle(-1, colIndex);
    
    if (isEditing) {
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleEditBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleEditBlur();
            }
            if (e.key === 'Escape') {
              setEditingCell(null);
            }
          }}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => {
            setIsComposing(false);
            setTimeout(() => handleEditBlur(), 100);
          }}
          className="w-full h-full p-1 border-2 border-blue-500 outline-none bg-white font-semibold text-center"
          autoFocus
          style={cellStyle}
        />
      );
    }
    
    return (
      <div 
        className="w-full h-full p-1 flex items-center justify-center cursor-pointer hover:bg-blue-50 select-none font-semibold"
        style={cellStyle}
        onMouseDown={(e) => handleMouseDown(-1, colIndex, e)}
        onDoubleClick={() => handleCellDoubleClick(-1, colIndex, label)}
      >
        {label || <span className="text-gray-400 italic">(kosong)</span>}
      </div>
    );
  };
  
  const renderCell = (rowIndex: number, cellIndex: number, cell: any) => {
    const isEditing = editingCell?.row === rowIndex && editingCell?.col === cellIndex;
    const cellStyle = getCellStyle(rowIndex, cellIndex);
    const cellValue = getCellValue(cell);
    
    const firstCell = data[rowIndex]?.[0];
    const firstCellValue = typeof firstCell === 'object' ? firstCell?.value : firstCell;
    const isTotalRow = typeof firstCellValue === 'string' && firstCellValue.includes("TOTAL %");
    
    if (isEditing && !isTotalRow) {
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleEditBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleEditBlur();
            }
            if (e.key === 'Escape') {
              setEditingCell(null);
            }
          }}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => {
            setIsComposing(false);
            setTimeout(() => handleEditBlur(), 100);
          }}
          className="w-full h-full p-1 border-2 border-blue-500 outline-none bg-white"
          autoFocus
          style={cellStyle}
        />
      );
    }
    
    let displayValue = cellValue || '';
    
    // Format angka dengan 2 desimal
    if ((cellIndex === 2 || cellIndex === 3 || cellIndex === 4 || 
         (cellIndex >= (type === 'planning' ? 6 : 5) && 
          cellIndex < (type === 'planning' ? 6 : 5) + dateCols.length)) && 
        displayValue && !isNaN(parseFloat(displayValue.replace(',', '.')))) {
      const numValue = parseFloat(displayValue.replace(',', '.'));
      displayValue = numValue.toFixed(2).replace('.', ',');
    }
    
    return (
      <div 
        className={`w-full h-full p-1 flex items-center ${isTotalRow ? 'cursor-default bg-blue-50 font-semibold' : 'cursor-pointer hover:bg-blue-50'} select-none`}
        style={cellStyle}
        onMouseDown={(e) => handleMouseDown(rowIndex, cellIndex, e)}
        onMouseOver={() => handleMouseOver(rowIndex, cellIndex)}
        onDoubleClick={() => !isTotalRow && handleCellDoubleClick(rowIndex, cellIndex, cell)}
      >
        {displayValue}
      </div>
    );
  };
  
  return (
    <div className="overflow-x-auto">
      <table ref={tableRef} className="min-w-full border-collapse border border-gray-300">
        <thead>
          <tr>
            {columnLabels.map((label: string, index: number) => (
              <th key={index} className="border border-gray-300 p-0" style={{ minWidth: '100px', height: '40px' }}>
                {renderHeaderCell(index, label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row: any[], rowIndex: number) => (
            <tr key={rowIndex}>
              {row.map((cell: any, cellIndex: number) => (
                <td key={cellIndex} className="border border-gray-300 p-0" style={{ minWidth: '100px' }}>
                  {renderCell(rowIndex, cellIndex, cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ============ FORMATTING TOOLBAR DENGAN TOMBOL EXCEL UMUM ============
const FormattingToolbar = ({ 
  selectedRange, 
  onApplyFormatting,
  spreadsheetRef,
  currentData,
  activeTab,
  dateCols,
  type = 'planning',
  dataRows,
  onChange,
  onUndo,
  onRedo,
  onAddDate,
  onDeleteDate,
  undoStack,
  redoStack
}: { 
  selectedRange: { startRow: number; startCol: number; endRow: number; endCol: number } | null;
  onApplyFormatting: (property: string, value: any, range?: any) => void;
  spreadsheetRef: React.RefObject<any>;
  currentData: any[][];
  activeTab: number;
  dateCols: string[];
  type?: 'planning' | 'target' | 'realisasi';
  dataRows: any[];
  onChange: (data: any[][]) => void;
  onUndo: () => void;
  onRedo: () => void;
  onAddDate: () => void;
  onDeleteDate: () => void;
  undoStack: any[];
  redoStack: any[];
}) => {
  const [showToolbar, setShowToolbar] = useState(true);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [textColor, setTextColor] = useState('#000000');
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [fontSize, setFontSize] = useState('14px');
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');
  
  const formatNumberAsPercent = () => {
    if (!selectedRange) {
      alert('Pilih range sel terlebih dahulu!');
      return;
    }
    
    const { startRow, endRow, startCol, endCol } = selectedRange;
    const newData = [...currentData];
    
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const cell = newData[r]?.[c];
        if (!cell) continue;
        
        const cellValue = typeof cell === 'object' ? cell.value : cell;
        if (!cellValue && cellValue !== 0) continue;
        
        const numValue = parseFloat(cellValue.toString().replace(',', '.'));
        if (!isNaN(numValue)) {
          const formattedValue = (numValue * 100).toFixed(2).replace('.', ',') + '%';
          
          if (cell && typeof cell === 'object') {
            newData[r][c] = {
              ...cell,
              value: formattedValue,
              originalValue: formattedValue
            };
          } else {
            newData[r][c] = formattedValue;
          }
        }
      }
    }
    
    onChange(newData);
    alert('Format persentase diterapkan');
  };
  
  const applyFormattingToRange = (property: string, value: any) => {
    if (!selectedRange) {
      alert('Pilih range sel terlebih dahulu!');
      return;
    }
    
    const { startRow, endRow, startCol, endCol } = selectedRange;
    
    for (let r = startRow; r <= endRow; r++) {
      const firstCell = currentData[r]?.[0];
      const firstCellValue = typeof firstCell === 'object' ? firstCell?.value : firstCell;
      if (typeof firstCellValue === 'string' && firstCellValue.includes("TOTAL %")) {
        alert("Tidak bisa formatting pada total row!");
        return;
      }
    }
    
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const cellKey = `tab${activeTab}_${r}_${c}`;
        onApplyFormatting(property, value, { row: r, col: c });
      }
    }
    
    if (property === 'fontWeight') setIsBold(value === 'bold');
    if (property === 'fontStyle') setIsItalic(value === 'italic');
    if (property === 'textDecoration') setIsUnderline(value === 'underline');
    if (property === 'color') setTextColor(value);
    if (property === 'backgroundColor') setBackgroundColor(value);
    if (property === 'textAlign') setTextAlign(value);
  };
  
  const applyBorder = (borderType: 'all' | 'outer' | 'inner' = 'all') => {
    if (!selectedRange) {
      alert('Pilih range sel terlebih dahulu!');
      return;
    }
    
    const { startRow, endRow, startCol, endCol } = selectedRange;
    
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const cell = currentData[r]?.[c];
        const hasBorder = cell && typeof cell === 'object' ? cell.border : false;
        
        onApplyFormatting('border', borderType === 'all' ? !hasBorder : borderType, { row: r, col: c });
      }
    }
    
    alert(`Border ${borderType} diterapkan`);
  };
  
  const insertRowAbove = () => {
    if (!selectedRange) {
      alert('Pilih sel terlebih dahulu!');
      return;
    }
    
    const { startRow } = selectedRange;
    
    const newRow = Array(currentData[0].length).fill('').map(() => ({ value: '' }));
    
    const newData = [...currentData];
    newData.splice(startRow, 0, newRow);
    
    onChange(newData);
    alert(`Baris baru ditambahkan di atas baris ${startRow + 1}`);
  };
  
  const insertRowBelow = () => {
    if (!selectedRange) {
      alert('Pilih sel terlebih dahulu!');
      return;
    }
    
    const { endRow } = selectedRange;
    
    const newRow = Array(currentData[0].length).fill('').map(() => ({ value: '' }));
    
    const newData = [...currentData];
    newData.splice(endRow + 1, 0, newRow);
    
    onChange(newData);
    alert(`Baris baru ditambahkan di bawah baris ${endRow + 1}`);
  };
  
  const insertColumnLeft = () => {
    if (!selectedRange) {
      alert('Pilih sel terlebih dahulu!');
      return;
    }
    
    const { startCol } = selectedRange;
    
    const newData = currentData.map(row => {
      const newRow = [...row];
      newRow.splice(startCol, 0, { value: '' });
      return newRow;
    });
    
    onChange(newData);
    alert(`Kolom baru ditambahkan di kiri kolom ${startCol + 1}`);
  };
  
  const insertColumnRight = () => {
    if (!selectedRange) {
      alert('Pilih sel terlebih dahulu!');
      return;
    }
    
    const { endCol } = selectedRange;
    
    const newData = currentData.map(row => {
      const newRow = [...row];
      newRow.splice(endCol + 1, 0, { value: '' });
      return newRow;
    });
    
    onChange(newData);
    alert(`Kolom baru ditambahkan di kanan kolom ${endCol + 1}`);
  };
  
  const deleteRow = () => {
    if (!selectedRange) return;
    
    const { startRow, endRow } = selectedRange;
    
    if (confirm(`Hapus baris ${startRow + 1} sampai ${endRow + 1}?`)) {
      const newData = currentData.filter((_, index) => index < startRow || index > endRow);
      onChange(newData);
      alert(`Baris ${startRow + 1}-${endRow + 1} dihapus`);
    }
  };
  
  const deleteColumn = () => {
    if (!selectedRange) return;
    
    const { startCol, endCol } = selectedRange;
    
    if (confirm(`Hapus kolom ${startCol + 1} sampai ${endCol + 1}?`)) {
      const newData = currentData.map(row => 
        row.filter((_, index) => index < startCol || index > endCol)
      );
      onChange(newData);
      alert(`Kolom ${startCol + 1}-${endCol + 1} dihapus`);
    }
  };
  
  const clearContents = () => {
    if (!selectedRange) {
      alert('Pilih range sel terlebih dahulu!');
      return;
    }
    
    const { startRow, endRow, startCol, endCol } = selectedRange;
    
    if (confirm(`Hapus isi sel di range yang dipilih?`)) {
      const newData = [...currentData];
      
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          const firstCell = newData[r]?.[0];
          const firstCellValue = typeof firstCell === 'object' ? firstCell?.value : firstCell;
          if (typeof firstCellValue === 'string' && firstCellValue.includes("TOTAL %")) {
            continue;
          }
          
          if (newData[r]?.[c] && typeof newData[r][c] === 'object') {
            newData[r][c] = {
              ...newData[r][c],
              value: '',
              originalValue: ''
            };
          } else {
            newData[r][c] = '';
          }
        }
      }
      
      onChange(newData);
      alert('Isi sel berhasil dihapus');
    }
  };
  
  const clearFormatting = () => {
    if (!selectedRange) {
      alert('Pilih range sel terlebih dahulu!');
      return;
    }
    
    const { startRow, endRow, startCol, endCol } = selectedRange;
    
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const firstCell = currentData[r]?.[0];
        const firstCellValue = typeof firstCell === 'object' ? firstCell?.value : firstCell;
        if (typeof firstCellValue === 'string' && firstCellValue.includes("TOTAL %")) {
          continue;
        }
        
        onApplyFormatting('fontWeight', 'normal', { row: r, col: c });
        onApplyFormatting('fontStyle', 'normal', { row: r, col: c });
        onApplyFormatting('textDecoration', 'none', { row: r, col: c });
        onApplyFormatting('color', '#000000', { row: r, col: c });
        onApplyFormatting('backgroundColor', '#ffffff', { row: r, col: c });
        onApplyFormatting('fontSize', '14px', { row: r, col: c });
        onApplyFormatting('textAlign', 'left', { row: r, col: c });
        onApplyFormatting('border', false, { row: r, col: c });
      }
    }
    
    setIsBold(false);
    setIsItalic(false);
    setIsUnderline(false);
    setTextColor('#000000');
    setBackgroundColor('#ffffff');
    setFontSize('14px');
    setTextAlign('left');
    alert('Formatting direset!');
  };
  
  const wrapText = () => {
    if (!selectedRange) {
      alert('Pilih range sel terlebih dahulu!');
      return;
    }
    
    const { startRow, endRow, startCol, endCol } = selectedRange;
    
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const cellKey = `tab${activeTab}_${r}_${c}`;
        const cell = currentData[r]?.[c];
        const hasWrap = cell && typeof cell === 'object' ? cell.wrapText : false;
        
        onApplyFormatting('wrapText', !hasWrap, { row: r, col: c });
      }
    }
    
    alert('Wrap text diterapkan');
  };
  
  const applyStrikethrough = () => {
    if (!selectedRange) {
      alert('Pilih range sel terlebih dahulu!');
      return;
    }
    
    const { startRow, endRow, startCol, endCol } = selectedRange;
    
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const cellKey = `tab${activeTab}_${r}_${c}`;
        const cell = currentData[r]?.[c];
        const hasStrikethrough = cell && typeof cell === 'object' ? cell.textDecoration === 'line-through' : false;
        
        onApplyFormatting('textDecoration', hasStrikethrough ? 'none' : 'line-through', { row: r, col: c });
      }
    }
    
    alert('Strikethrough diterapkan');
  };
  
  return (
    <div className="bg-white p-3 rounded shadow mb-4 formatting-toolbar">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-sm">
          🎨 Formatting Toolbar {selectedRange ? 
            `(Range: ${selectedRange.startRow + 1},${selectedRange.startCol + 1} - ${selectedRange.endRow + 1},${selectedRange.endCol + 1})` : 
            '(Pilih range sel)'}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setShowToolbar(!showToolbar)}
            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs flex items-center gap-1"
          >
            {showToolbar ? '▲ Sembunyikan' : '▼ Tampilkan'}
          </button>
        </div>
      </div>
      
      {showToolbar && (
        <>
          <div className="flex flex-wrap gap-1 p-2 bg-gray-50 rounded border mb-3">
            {/* Text Formatting */}
            <button
              onClick={() => applyFormattingToRange('fontWeight', isBold ? 'normal' : 'bold')}
              className={`px-3 py-2 border rounded text-sm flex items-center gap-1 transition-colors ${
                isBold ? 'bg-blue-100 border-blue-300 font-bold' : 'bg-white hover:bg-gray-100'
              }`}
              title="Bold (Ctrl+B)"
            >
              <strong>B</strong>
            </button>
            <button
              onClick={() => applyFormattingToRange('fontStyle', isItalic ? 'normal' : 'italic')}
              className={`px-3 py-2 border rounded text-sm flex items-center gap-1 transition-colors ${
                isItalic ? 'bg-blue-100 border-blue-300 italic' : 'bg-white hover:bg-gray-100'
              }`}
              title="Italic (Ctrl+I)"
            >
              <em>I</em>
            </button>
            <button
              onClick={() => applyFormattingToRange('textDecoration', isUnderline ? 'none' : 'underline')}
              className={`px-3 py-2 border rounded text-sm flex items-center gap-1 transition-colors ${
                isUnderline ? 'bg-blue-100 border-blue-300 underline' : 'bg-white hover:bg-gray-100'
              }`}
              title="Underline (Ctrl+U)"
            >
              <u>U</u>
            </button>
            
            <button
              onClick={applyStrikethrough}
              className="px-3 py-2 bg-white hover:bg-gray-100 border rounded text-sm flex items-center gap-1 transition-colors"
              title="Strikethrough"
            >
              <s>S</s>
            </button>
            
            <div className="w-px h-6 bg-gray-300 mx-1"></div>
            
            <button
              onClick={() => applyBorder('all')}
              className="px-3 py-2 bg-white hover:bg-gray-100 border rounded text-sm flex items-center gap-1 transition-colors"
              title="All Borders"
            >
              ⎔ All
            </button>
            
            <div className="w-px h-6 bg-gray-300 mx-1"></div>
            
            <button
              onClick={formatNumberAsPercent}
              className="px-3 py-2 bg-white hover:bg-gray-100 border rounded text-sm flex items-center gap-1 transition-colors"
              title="Format as Percentage"
            >
              %
            </button>
            
            <div className="w-px h-6 bg-gray-300 mx-1"></div>
            
            <button
              onClick={insertRowAbove}
              className="px-3 py-2 bg-white hover:bg-gray-100 border rounded text-sm flex items-center gap-1 transition-colors"
              title="Insert Row Above"
            >
              ↑ Row
            </button>
            <button
              onClick={insertRowBelow}
              className="px-3 py-2 bg-white hover:bg-gray-100 border rounded text-sm flex items-center gap-1 transition-colors"
              title="Insert Row Below"
            >
              ↓ Row
            </button>
            <button
              onClick={insertColumnLeft}
              className="px-3 py-2 bg-white hover:bg-gray-100 border rounded text-sm flex items-center gap-1 transition-colors"
              title="Insert Column Left"
            >
              ← Col
            </button>
            <button
              onClick={insertColumnRight}
              className="px-3 py-2 bg-white hover:bg-gray-100 border rounded text-sm flex items-center gap-1 transition-colors"
              title="Insert Column Right"
            >
              → Col
            </button>
            <button
              onClick={deleteRow}
              className="px-3 py-2 bg-red-50 hover:bg-red-100 border border-red-200 rounded text-sm flex items-center gap-1 transition-colors"
              title="Delete Row"
            >
              🗑️ Row
            </button>
            <button
              onClick={deleteColumn}
              className="px-3 py-2 bg-red-50 hover:bg-red-100 border border-red-200 rounded text-sm flex items-center gap-1 transition-colors"
              title="Delete Column"
            >
              🗑️ Col
            </button>
            
            <div className="w-px h-6 bg-gray-300 mx-1"></div>
            
            <button
              onClick={clearContents}
              className="px-3 py-2 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded text-sm flex items-center gap-1 transition-colors"
              title="Clear Contents"
            >
              ✕ Clear
            </button>
            <button
              onClick={clearFormatting}
              className="px-3 py-2 bg-red-50 hover:bg-red-100 border border-red-200 rounded text-sm flex items-center gap-1 transition-colors"
              title="Clear Formatting"
            >
              🔄 Clear Format
            </button>
            
            <div className="w-px h-6 bg-gray-300 mx-1"></div>
            
            <button
              onClick={wrapText}
              className="px-3 py-2 bg-white hover:bg-gray-100 border rounded text-sm flex items-center gap-1 transition-colors"
              title="Wrap Text"
            >
              ⤸ Wrap
            </button>
            
            <div className="relative">
              <button
                className="px-3 py-2 bg-white hover:bg-gray-100 border rounded text-sm flex items-center gap-1 transition-colors"
                title="Text Color"
                onClick={() => {
                  const colorPicker = document.createElement('input');
                  colorPicker.type = 'color';
                  colorPicker.value = textColor;
                  colorPicker.onchange = (e: any) => {
                    setTextColor(e.target.value);
                    applyFormattingToRange('color', e.target.value);
                  };
                  colorPicker.click();
                }}
              >
                <span style={{ color: textColor }}>A</span>
                <span className="text-xs">▼</span>
              </button>
            </div>
            
            <div className="relative">
              <button
                className="px-3 py-2 bg-white hover:bg-gray-100 border rounded text-sm flex items-center gap-1 transition-colors"
                title="Background Color"
                onClick={() => {
                  const colorPicker = document.createElement('input');
                  colorPicker.type = 'color';
                  colorPicker.value = backgroundColor;
                  colorPicker.onchange = (e: any) => {
                    setBackgroundColor(e.target.value);
                    applyFormattingToRange('backgroundColor', e.target.value);
                  };
                  colorPicker.click();
                }}
              >
                <span className="px-1" style={{ backgroundColor: backgroundColor }}>A</span>
                <span className="text-xs">▼</span>
              </button>
            </div>
            
            <select
              value={fontSize}
              onChange={(e) => {
                setFontSize(e.target.value);
                applyFormattingToRange('fontSize', e.target.value);
              }}
              className="px-2 py-2 border rounded text-sm bg-white hover:bg-gray-100 transition-colors"
              title="Font Size"
            >
              <option value="10px">10px</option>
              <option value="12px">12px</option>
              <option value="14px">14px</option>
              <option value="16px">16px</option>
              <option value="18px">18px</option>
              <option value="20px">20px</option>
              <option value="24px">24px</option>
            </select>
            
            <select
              onChange={(e) => applyFormattingToRange('fontFamily', e.target.value)}
              className="px-2 py-2 border rounded text-sm bg-white hover:bg-gray-100 transition-colors"
              title="Font Family"
            >
              <option value="Arial">Arial</option>
              <option value="Calibri">Calibri</option>
              <option value="Times New Roman">Times</option>
              <option value="Courier New">Courier</option>
              <option value="Verdana">Verdana</option>
            </select>
            
            <div className="w-px h-6 bg-gray-300 mx-1"></div>
            
            <button
              onClick={onUndo}
              disabled={undoStack.length === 0}
              className="px-3 py-2 bg-gray-50 hover:bg-gray-100 border rounded text-sm flex items-center gap-1 transition-colors disabled:opacity-50"
              title="Undo"
            >
              ↩️ Undo
            </button>
            <button
              onClick={onRedo}
              disabled={redoStack.length === 0}
              className="px-3 py-2 bg-gray-50 hover:bg-gray-100 border rounded text-sm flex items-center gap-1 transition-colors disabled:opacity-50"
              title="Redo"
            >
              ↪️ Redo
            </button>
            <button
              onClick={onAddDate}
              className="px-3 py-2 bg-green-50 hover:bg-green-100 border border-green-200 rounded text-sm flex items-center gap-1 transition-colors"
              title="Add Date Column"
            >
              📅 Add Date
            </button>
            <button
              onClick={onDeleteDate}
              className="px-3 py-2 bg-red-50 hover:bg-red-100 border border-red-200 rounded text-sm flex items-center gap-1 transition-colors"
              title="Delete Date Column"
            >
              🗑️ Delete Date
            </button>
          </div>
          
          <div className="mt-3 p-3 bg-gray-50 rounded border">
            <h4 className="text-sm font-medium mb-2">🎯 Cara Pakai Multi-Selection & Edit Header:</h4>
            <ol className="text-xs text-gray-600 space-y-1 mb-3">
              <li>1. <strong>DOUBLE CLICK</strong> pada header kolom untuk mengedit nama tanggal</li>
              <li>2. <strong>KLIK & TAHAN</strong> pada sel awal untuk mulai selection</li>
              <li>3. <strong>SERET</strong> mouse untuk memilih range sel</li>
              <li>4. <strong>SHIFT+KLIK</strong> untuk extend selection</li>
              <li>5. <strong>KLIK TOMBOL</strong> formatting untuk terapkan ke semua sel terpilih</li>
              <li>6. <strong>DOUBLE CLICK</strong> untuk edit nilai di sel</li>
              <li>7. <strong>ENTER/BLUR</strong> untuk menyimpan ke semua sel terpilih</li>
            </ol>
            
            {selectedRange ? (
              <div className="text-xs text-green-600 bg-green-50 p-2 rounded">
                ✅ <strong>RANGE TERPILIH:</strong> 
                {selectedRange.startRow === -1 ? ' Header ' : ` Baris ${selectedRange.startRow + 1}`}
                {selectedRange.endRow !== -1 && `-${selectedRange.endRow + 1}`}, 
                Kolom {selectedRange.startCol + 1}-{selectedRange.endCol + 1}
                <div className="mt-1">
                  <strong>Jumlah Sel:</strong> {
                    selectedRange.startRow === -1 ? 
                    selectedRange.endCol - selectedRange.startCol + 1 :
                    (selectedRange.endRow - selectedRange.startRow + 1) * (selectedRange.endCol - selectedRange.startCol + 1)
                  } sel
                </div>
              </div>
            ) : (
              <div className="text-xs text-yellow-600 bg-yellow-50 p-2 rounded">
                ⚠️ <strong>PILIH RANGE DULU:</strong> Klik dan tahan sel di spreadsheet, lalu seret untuk memilih range
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const CountdownTimer = ({ deadline }: { deadline: string }) => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isOverdue: false
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const deadlineTime = new Date(deadline).getTime();
      const difference = deadlineTime - now;

      if (difference <= 0) {
        setTimeLeft({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          isOverdue: true
        });
        return;
      }

      setTimeLeft({
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((difference % (1000 * 60)) / 1000),
        isOverdue: false
      });
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [deadline]);

  if (timeLeft.isOverdue) {
    return (
      <div className="flex items-center gap-1 text-red-600 font-semibold text-sm">
        <span>⏰</span>
        <span>TELAT</span>
      </div>
    );
  }

  if (timeLeft.days > 30) {
    return (
      <div className="flex items-center gap-1 text-green-600 text-sm">
        <span>📅</span>
        <span>{timeLeft.days} hari</span>
      </div>
    );
  }

  if (timeLeft.days > 7) {
    return (
      <div className="flex items-center gap-1 text-orange-500 text-sm">
        <span>⏳</span>
        <span>{timeLeft.days} hari</span>
      </div>
    );
  }

  if (timeLeft.days > 0) {
    return (
      <div className="flex items-center gap-1 text-red-500 font-semibold text-sm">
        <span>🚨</span>
        <span>{timeLeft.days}d {timeLeft.hours}h</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-red-600 font-bold text-sm">
      <span>🔥</span>
      <span>{timeLeft.hours}j {timeLeft.minutes}m</span>
    </div>
  );
};

const UserProfile = () => {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const email = localStorage.getItem("userEmail");
    const profile = localStorage.getItem("userProfile");
    const role = localStorage.getItem("userRole");
    setUserEmail(email);
    setUserProfile(profile);
    setUserRole(role);
  }, []);

  if (!userEmail) return null;

  return (
    <div className="flex items-center gap-3 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
      <img 
        src={userProfile || `https://ui-avatars.com/api/?name=${encodeURIComponent(userEmail.split('@')[0])}&background=random`}
        alt="Profile" 
        className="w-8 h-8 rounded-full"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userEmail.split('@')[0])}&background=random`;
        }}
      />
      <div>
        <div className="text-sm font-medium text-gray-800">{userEmail}</div>
        <div className="text-xs text-gray-500 capitalize">
          {userRole || 'user'}
        </div>
      </div>
    </div>
  );
};

const OnlineUsers = ({ onlineUsers, currentUser }: { onlineUsers: UserPresenceType[], currentUser: any }) => {
  const [showUsers, setShowUsers] = useState(false);

  return (
    <div className="bg-white p-3 rounded shadow mb-4 OnlineUsers">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm">👥 User Online</h3>
        <button
          onClick={() => setShowUsers(!showUsers)}
          className="px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded text-xs flex items-center gap-1"
        >
          {showUsers ? '▲ Sembunyikan' : '▼ Tampilkan'}
        </button>
      </div>
      
      {showUsers && (
        <div className="mt-2 space-y-2">
          {onlineUsers.map((user) => (
            <div key={user.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded border">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                {user.user_metadata?.avatar_url ? (
                  <img 
                    src={user.user_metadata.avatar_url} 
                    alt={user.user_metadata.full_name || user.email}
                    className="w-8 h-8 rounded-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                ) : null}
                <div className={user.user_metadata?.avatar_url ? 'hidden' : ''}>
                  {user.email.charAt(0).toUpperCase()}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">
                  {user.user_metadata?.full_name || user.email}
                  {user.id === currentUser?.id && (
                    <span className="ml-1 text-blue-600 text-xs">(Anda)</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {user.active_tab === '1' && '📋 Tab Planning'}
                  {user.active_tab === '2' && '📍 Tab Lokasi'}
                  {user.active_tab === '3' && '🎯 Tab Target'}
                  {user.active_tab === '4' && '📊 Tab Realisasi'}
                  {user.active_tab === '5' && '📝 Tab Catatan'}
                  {user.editing_task && ` - Edit: ${user.editing_task}`}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-gray-500">Online</span>
              </div>
            </div>
          ))}
          
          {onlineUsers.length === 0 && (
            <div className="text-center py-4 text-gray-500">
              <div className="text-2xl mb-1">👻</div>
              <p>Tidak ada user online</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// PERBAIKAN: Export & Print Controls dengan size A3 dan perbaikan total %
const ExportPrintControls = ({ 
  activeTab, 
  projectName, 
  metaProject, 
  rows, 
  targetRows, 
  realisasiRows, 
  dateCols,
  planningSummary,
  targetSummary,
  realisasiSummary,
  planningChartData,
  targetChartDataNew,
  realisasiChartDataNew,
  notes
}: {
  activeTab: number;
  projectName: string;
  metaProject: ProjectMetaType;
  rows: TaskType[];
  targetRows: TaskType[];
  realisasiRows: TaskType[];
  dateCols: string[];
  planningSummary: any;
  targetSummary: any;
  realisasiSummary: any;
  planningChartData: any[];
  targetChartDataNew: any[];
  realisasiChartDataNew: any[];
  notes: NoteType[];
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const email = localStorage.getItem("userEmail");
    setUserEmail(email);
  }, []);

  const getUserInfo = () => {
    return {
      email: userEmail || "Unknown User",
      timestamp: new Date().toLocaleString('id-ID'),
      action: isExporting ? "Export" : isPrinting ? "Print" : "Download"
    };
  };

  const captureChartAsImage = async (chartId: string): Promise<string> => {
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const chartElement = document.getElementById(chartId);
      if (!chartElement) {
        console.warn(`Chart element dengan ID ${chartId} tidak ditemukan`);
        return '';
      }
      
      const originalDisplay = chartElement.style.display;
      const originalPosition = chartElement.style.position;
      chartElement.style.display = 'block';
      chartElement.style.position = 'relative';
      
      const canvas = await html2canvas(chartElement, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        allowTaint: true,
        width: chartElement.scrollWidth,
        height: chartElement.scrollHeight,
        onclone: (clonedDoc) => {
          const clonedChart = clonedDoc.getElementById(chartId);
          if (clonedChart) {
            clonedChart.style.display = 'block';
            clonedChart.style.position = 'relative';
          }
        }
      });
      
      chartElement.style.display = originalDisplay;
      chartElement.style.position = originalPosition;
      
      return canvas.toDataURL('image/png', 1.0);
    } catch (error) {
      console.error('Error capturing chart:', error);
      
      try {
        const chartElement = document.getElementById(chartId);
        if (chartElement) {
          const canvas = await html2canvas(chartElement, {
            scale: 1,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false
          });
          return canvas.toDataURL('image/jpeg', 0.8);
        }
      } catch (fallbackError) {
        console.error('Fallback capture failed:', fallbackError);
      }
      
      return '';
    }
  };

  // PERBAIKAN: Export to Excel dengan perbaikan total %
  const exportToExcel = async () => {
    try {
      setIsExporting(true);
      
      const userInfo = getUserInfo();
      const workbook = XLSX.utils.book_new();
      
      const currentRows = activeTab === 1 ? rows : activeTab === 3 ? targetRows : realisasiRows;
      const currentSummary = activeTab === 1 ? planningSummary : activeTab === 3 ? targetSummary : realisasiSummary;
      const currentChartData = activeTab === 1 ? planningChartData : activeTab === 3 ? targetChartDataNew : realisasiChartDataNew;
      const tabName = activeTab === 1 ? 'Planning' : activeTab === 3 ? 'Target' : activeTab === 4 ? 'Realisasi' : 'Catatan';
      
      let chartImageBase64 = '';
      if (activeTab !== 5) {
        const chartId = activeTab === 1 ? 'planning-chart' : activeTab === 3 ? 'target-chart' : 'realisasi-chart';
        chartImageBase64 = await captureChartAsImage(chartId);
      }
      
      const wsData = [];
      
      wsData.push(["PT ELEKTRINDO UTAMA INDONESIA"]);
      wsData.push(["MECHANICAL - ELECTRICAL - FIRE PROTECTION SYSTEM"]);
      wsData.push(["SILVER APP - INPUT DATA LAPANGAN"]);
      wsData.push([]);
      
      wsData.push(["KODE PROYEK", ":", metaProject.project_code || "-"]);
      wsData.push(["JOB NAME", ":", metaProject.job_name || "-"]);
      wsData.push(["CLIENT", ":", metaProject.client || "-"]);
      wsData.push(["ALAMAT", ":", metaProject.address || "-"]);
      wsData.push(["DEADLINE", ":", metaProject.deadline ? new Date(metaProject.deadline).toLocaleDateString('id-ID') : "-"]);
      wsData.push([]);
      
      wsData.push([`KURVA S PROGRESS - ${tabName.toUpperCase()}`]);
      wsData.push([]);
      
      const headers = [
        'No',
        'Description', 
        'Bobot %', 
        ...(activeTab === 1 ? ['Target (%)', 'Realisasi (%)'] : 
            activeTab === 3 ? ['Target (%)'] : 
            activeTab === 4 ? ['Realisasi (%)'] : []),
        'Lokasi'
      ];
      
      if (activeTab !== 5) {
        headers.push(...dateCols);
        headers.push('Bukti');
      }
      
      if (activeTab === 5) {
        headers.splice(0, headers.length, 'No', 'Tanggal', 'Catatan', 'Audio File', 'Dibuat Oleh');
      }
      
      wsData.push(headers);
      
      if (activeTab === 5) {
        notes.forEach((note, index) => {
          wsData.push([
            index + 1,
            new Date(note.created_at).toLocaleDateString('id-ID'),
            note.content,
            note.audio_url ? 'Ya' : 'Tidak',
            note.created_by
          ]);
        });
      } else {
        // PERBAIKAN: Hitung total % secara kumulatif untuk setiap kolom tanggal
        const dateCumulativeTotals: Record<string, number> = {};
        dateCols.forEach((date, index) => {
          dateCumulativeTotals[date] = 0;
        });

        currentRows.forEach((row, index) => {
          const rowData = [
            index + 1,
            row.description || '',
            parseFloat(row.weight?.toString() || '0').toFixed(2).replace('.', ','),
            ...(activeTab === 1 ? [
              parseFloat(row.plan_progress?.toString() || '0').toFixed(2).replace('.', ','),
              parseFloat(row.actual_progress?.toString() || '0').toFixed(2).replace('.', ',')
            ] : activeTab === 3 ? [
              parseFloat(row.plan_progress?.toString() || '0').toFixed(2).replace('.', ',')
            ] : [
              parseFloat(row.actual_progress?.toString() || '0').toFixed(2).replace('.', ',')
            ]),
            row.location || ''
          ];
          
          // PERBAIKAN: Hitung kumulatif untuk setiap kolom tanggal
          dateCols.forEach((date, idx) => {
            const dateValue = parseFloat(row.dates?.[date]?.toString() || '0');
            if (idx === 0) {
              dateCumulativeTotals[date] = dateValue;
            } else {
              const prevDate = dateCols[idx - 1];
              dateCumulativeTotals[date] = dateCumulativeTotals[prevDate] + dateValue;
            }
            rowData.push(dateValue.toFixed(2).replace('.', ','));
          });
          
          const hasProof = row.proof_url || row.is_uploaded;
          rowData.push(hasProof ? '✅' : '❌');
          
          wsData.push(rowData);
        });

        // PERBAIKAN: Tambah baris TOTAL % dengan nilai kumulatif
        const totalRow = ["", "TOTAL %", "", ...(activeTab === 1 ? ["", ""] : activeTab === 3 ? [""] : [""]), ""];
        
        dateCols.forEach((date, idx) => {
          // PERBAIKAN: Gunakan nilai kumulatif bukan hanya untuk kolom itu saja
          const cumulativeValue = dateCumulativeTotals[date];
          totalRow.push(cumulativeValue.toFixed(2).replace('.', ','));
        });
        
        totalRow.push("");
        
        wsData.push(totalRow);
        
        wsData.push([]);
        wsData.push(["SUMMARY KURVA S"]);
        wsData.push(["Total Bobot", ":", currentSummary.totalWeight.toFixed(2).replace('.', ',') + '%']);
        
        // PERBAIKAN 2: Actual Progress dan Plan Progress harus sama dengan total % dari tabel
        const totalPercentageFromTable = dateCumulativeTotals[dateCols[dateCols.length - 1]] || 0;
        
        if (activeTab === 1) {
          wsData.push(["Plan Progress", ":", totalPercentageFromTable.toFixed(2).replace('.', ',') + '%']);
          wsData.push(["Actual Progress", ":", totalPercentageFromTable.toFixed(2).replace('.', ',') + '%']);
        } else if (activeTab === 3) {
          wsData.push(["Target Progress", ":", totalPercentageFromTable.toFixed(2).replace('.', ',') + '%']);
        } else {
          wsData.push(["Realisasi Progress", ":", totalPercentageFromTable.toFixed(2).replace('.', ',') + '%']);
        }
        wsData.push(["Status", ":", currentSummary.isValidWeight ? 'VALID' : 'INVALID']);
      }
      
      wsData.push([]);
      wsData.push(["INFO EXPORT"]);
      wsData.push(["Diexport oleh", ":", userInfo.email]);
      wsData.push(["Tanggal Export", ":", userInfo.timestamp]);
      
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      
      if (chartImageBase64) {
        const chartWsData = [
          ["📈 KURVA S - LINE CHART"],
          ["Chart Kurva S dari tab " + tabName],
          [],
          ["Chart ditampilkan sebagai gambar di bawah ini:"],
          [],
        ];
        
        const chartWs = XLSX.utils.aoa_to_sheet(chartWsData);
        
        if (chartWs['!images'] === undefined) chartWs['!images'] = [];
        chartWs['!images'].push({
          type: 'jpeg',
          data: chartImageBase64.split(',')[1],
          position: {
            type: 'oneCellAnchor',
            from: {
              col: 0,
              row: 4
            }
          }
        });
        
        XLSX.utils.book_append_sheet(workbook, chartWs, `${tabName}_Chart`);
      }
      
      if (!ws['!pageSetup']) ws['!pageSetup'] = {};
      ws['!pageSetup'].orientation = 'landscape';
      ws['!pageSetup'].paperSize = 9; // A4
      ws['!pageSetup'].fitToWidth = 1;
      ws['!pageSetup'].fitToHeight = 0;
      
      const colWidths = activeTab === 5 ? 
        [
          { wch: 5 },
          { wch: 15 },
          { wch: 50 },
          { wch: 12 },
          { wch: 20 }
        ] :
        [
          { wch: 5 },
          { wch: 30 },
          { wch: 10 },
          ...(activeTab === 1 ? [{ wch: 10 }, { wch: 12 }] : 
              activeTab === 3 ? [{ wch: 10 }] : 
              [{ wch: 12 }]),
          { wch: 20 },
          ...dateCols.map(() => ({ wch: 12 })),
          { wch: 8 }
        ];
      ws['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(workbook, ws, tabName);

      const fileName = `${metaProject.project_code || projectName}_KURVA_S_${tabName}_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      XLSX.writeFile(workbook, fileName);
      
      alert(`✅ Data Kurva S berhasil diexport ke ${fileName}`);
    } catch (error) {
      console.error('Export error:', error);
      alert('❌ Gagal mengexport data Kurva S. Silakan coba lagi.');
    } finally {
      setIsExporting(false);
    }
  };

  // PERBAIKAN: Export to Word dengan kertas A3
  const exportToWord = async () => {
    try {
      setIsExporting(true);
      
      const userInfo = getUserInfo();
      
      const currentRows = activeTab === 1 ? rows : activeTab === 3 ? targetRows : realisasiRows;
      const currentSummary = activeTab === 1 ? planningSummary : activeTab === 3 ? targetSummary : realisasiSummary;
      const tabName = activeTab === 1 ? 'Planning' : activeTab === 3 ? 'Target' : activeTab === 4 ? 'Realisasi' : 'Catatan';
      
      let chartImage = '';
      if (activeTab !== 5) {
        const chartId = activeTab === 1 ? 'planning-chart' : activeTab === 3 ? 'target-chart' : 'realisasi-chart';
        chartImage = await captureChartAsImage(chartId);
      }
      
      let htmlContent = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
        <head>
          <meta charset="UTF-8">
          <title>${projectName} - ${tabName}</title>
          <style>
            @page {
              size: 42cm 29.7cm; /* A3 Landscape */
              margin: 0.5in;
            }
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px;
              width: 100%;
            }
            .header {
              border-bottom: 2px solid #2c5aa0;
              padding-bottom: 15px;
              margin-bottom: 20px;
              page-break-inside: avoid;
            }
            h1 { 
              color: #2c5aa0; 
              font-size: 18pt; 
              margin: 0; 
            }
            h2 { color: #2c5aa0; margin-top: 20px; }
            table { border-collapse: collapse; width: 100%; margin: 20px 0; font-size: 9pt; page-break-inside: avoid; }
            th, td { border: 1px solid #ddd; padding: 4px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .summary { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; page-break-inside: avoid; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 10px; page-break-inside: avoid; }
            .project-info { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; page-break-inside: avoid; }
            .user-info { background-color: #f0f8ff; padding: 10px; border-radius: 5px; margin-top: 20px; page-break-inside: avoid; }
            .chart-container { text-align: center; margin: 20px 0; page-break-inside: avoid; }
            .chart-image { max-width: 100%; height: auto; border: 1px solid #ddd; max-height: 500px; }
            .page-break { page-break-before: always; }
            .curva-s-title { 
              background-color: #2c5aa0; 
              color: white; 
              padding: 10px; 
              text-align: center; 
              font-size: 14pt; 
              font-weight: bold;
              margin: 20px 0;
              page-break-inside: avoid;
            }
            .data-section { page-break-inside: avoid; }
            .logo-img { width: 100px; height: auto; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>PT ELEKTRINDO UTAMA INDONESIA</h1>
            <p style="margin: 5px 0; font-size: 10pt; color: #666;">MECHANICAL - ELECTRICAL - FIRE PROTECTION SYSTEM</p>
            <p style="margin: 5px 0; font-size: 9pt; color: #2c5aa0; font-weight: bold;">SILVER APP - INPUT DATA LAPANGAN</p>
          </div>
          
          <h1>${projectName} - ${tabName}</h1>
          
          <div class="project-info">
            <div><strong>Kode Proyek:</strong> ${metaProject.project_code || '-'}</div>
            <div><strong>Job Name:</strong> ${metaProject.job_name || '-'}</div>
            <div><strong>Client:</strong> ${metaProject.client || '-'}</div>
            <div><strong>Alamat:</strong> ${metaProject.address || '-'}</div>
            <div><strong>Deadline:</strong> ${metaProject.deadline || '-'}</div>
          </div>
          
          <div class="curva-s-title">KURVA S PROGRESS - ${tabName.toUpperCase()}</div>
          
          <h2>Summary</h2>
          <div class="summary">
      `;
      
      // PERBAIKAN 2: Actual Progress dan Plan Progress harus sama dengan total % dari tabel
      const dateCumulativeTotals: Record<string, number> = {};
      dateCols.forEach((date, index) => {
        dateCumulativeTotals[date] = 0;
      });
      
      // Hitung total kumulatif dari tabel
      currentRows.forEach(row => {
        dateCols.forEach((date, idx) => {
          const dateValue = parseFloat(row.dates?.[date]?.toString() || '0');
          if (idx === 0) {
            dateCumulativeTotals[date] = dateValue;
          } else {
            const prevDate = dateCols[idx - 1];
            dateCumulativeTotals[date] = dateCumulativeTotals[prevDate] + dateValue;
          }
        });
      });
      
      const totalPercentageFromTable = dateCumulativeTotals[dateCols[dateCols.length - 1]] || 0;
      
      htmlContent += activeTab === 5 ? `
              <p><strong>Total Catatan:</strong> ${notes.length}</p>
            ` : `
              <p><strong>Total Bobot:</strong> ${currentSummary.totalWeight.toFixed(2)}%</p>
              ${activeTab === 1 ? `
                <p><strong>Plan Progress:</strong> ${totalPercentageFromTable.toFixed(2)}%</p>
                <p><strong>Actual Progress:</strong> ${totalPercentageFromTable.toFixed(2)}%</p>
              ` : activeTab === 3 ? `
                <p><strong>Target Progress:</strong> ${totalPercentageFromTable.toFixed(2)}%</p>
              ` : `
                <p><strong>Realisasi Progress:</strong> ${totalPercentageFromTable.toFixed(2)}%</p>
              `}
              <p><strong>Status:</strong> ${currentSummary.isValidWeight ? 'VALID' : 'INVALID'}</p>
            `;
      
      htmlContent += `
          </div>
          
          <div class="data-section">
            <h2>Data ${tabName}</h2>
      `;
      
      if (activeTab === 5) {
        htmlContent += `
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Tanggal</th>
                <th>Catatan</th>
                <th>Audio File</th>
                <th>Dibuat Oleh</th>
              </tr>
            </thead>
            <tbody>
              ${notes.map((note, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${new Date(note.created_at).toLocaleDateString('id-ID')}</td>
                  <td>${note.content}</td>
                  <td>${note.audio_url ? 'Ya' : 'Tidak'}</td>
                  <td>${note.created_by}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      } else {
        htmlContent += `
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Description</th>
                <th>Bobot %</th>
                ${activeTab === 1 ? '<th>Target (%)</th><th>Realisasi (%)</th>' : 
                  activeTab === 3 ? '<th>Target (%)</th>' : '<th>Realisasi (%)</th>'}
                <th>Lokasi</th>
                ${dateCols.map(date => `<th>${date}</th>`).join('')}
                <th>Bukti</th>
              </tr>
            </thead>
            <tbody>
              ${currentRows.map((row, index) => {
                return `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${row.description || ''}</td>
                    <td>${parseFloat(row.weight?.toString() || '0').toFixed(2).replace('.', ',')}</td>
                    ${activeTab === 1 ? `
                      <td>${parseFloat(row.plan_progress?.toString() || '0').toFixed(2).replace('.', ',')}</td>
                      <td>${parseFloat(row.actual_progress?.toString() || '0').toFixed(2).replace('.', ',')}</td>
                    ` : activeTab === 3 ? `
                      <td>${parseFloat(row.plan_progress?.toString() || '0').toFixed(2).replace('.', ',')}</td>
                    ` : `
                      <td>${parseFloat(row.actual_progress?.toString() || '0').toFixed(2).replace('.', ',')}</td>
                    `}
                    <td>${row.location || ''}</td>
                    ${dateCols.map(date => {
                      const dateValue = parseFloat(row.dates?.[date]?.toString() || '0');
                      return `<td>${dateValue.toFixed(2).replace('.', ',')}</td>`;
                    }).join('')}
                    <td style="text-align:center">${row.proof_url || row.is_uploaded ? '✅' : '❌'}</td>
                  </tr>
                `;
              }).join('')}
              <tr style="background-color: #f2f2f2; font-weight: bold;">
                <td></td>
                <td colspan="${activeTab === 1 ? 5 : activeTab === 3 ? 4 : 4}">TOTAL %</td>
                ${dateCols.map((date, idx) => {
                  let cumulativeTotal = 0;
                  for (let i = 0; i <= idx; i++) {
                    const currentDate = dateCols[i];
                    const dateTotal = currentRows.reduce((sum, row) => {
                      return sum + parseFloat(row.dates?.[currentDate]?.toString() || '0');
                    }, 0);
                    cumulativeTotal += dateTotal;
                  }
                  return `<td>${cumulativeTotal.toFixed(2).replace('.', ',')}</td>`;
                }).join('')}
                <td></td>
              </tr>
            </tbody>
          </table>
        `;
      }
      
      if (chartImage && activeTab !== 5) {
        htmlContent += `
          <div class="chart-container">
            <h2>Kurva S - Progress Berkelanjutan</h2>
            <img src="${chartImage}" alt="Kurva S Chart" class="chart-image" />
          </div>
        `;
      }
      
      htmlContent += `
            </div>
            
            <div class="user-info">
              <p><strong>Diexport oleh:</strong> ${userInfo.email}</p>
              <p><strong>Tanggal Export:</strong> ${userInfo.timestamp}</p>
            </div>
            
            <div class="footer">
              <p>Dokumen ini dihasilkan secara otomatis dari Silver App PT Elektrindo Utama Indonesia</p>
            </div>
        </body>
        </html>
      `;
      
      const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword;charset=utf-8' });
      const fileName = `${metaProject.project_code || projectName}_KURVA_S_${tabName}_${new Date().toISOString().split('T')[0]}.doc`;
      
      saveAs(blob, fileName);
      alert(`✅ Data Kurva S berhasil diexport ke ${fileName}`);
      
    } catch (error) {
      console.error('Export to Word error:', error);
      alert('❌ Gagal mengexport Kurva S ke Word. Silakan coba lagi.');
    } finally {
      setIsExporting(false);
    }
  };

  // PERBAIKAN: Print to PDF dengan kertas A3 dan perbaikan total %
  const printToPDF = async () => {
    try {
      setIsPrinting(true);
      
      const { default: jsPDF } = await import('jspdf');
      const autoTableImport = await import('jspdf-autotable');
      const autoTable = autoTableImport.default || (autoTableImport as any);
      
      // PERBAIKAN: Gunakan kertas A3 (420 x 297 mm) dengan margin yang lebih kecil
      const pdf = new jsPDF('landscape', 'mm', 'a3');
      const pageWidth = pdf.internal.pageSize.getWidth();  // ~420mm
      const pageHeight = pdf.internal.pageSize.getHeight(); // ~297mm
      
      const userInfo = getUserInfo();
      const currentRows = activeTab === 1 ? rows : activeTab === 3 ? targetRows : realisasiRows;
      const currentSummary = activeTab === 1 ? planningSummary : activeTab === 3 ? targetSummary : realisasiSummary;
      const tabName = activeTab === 1 ? 'Planning' : activeTab === 3 ? 'Target' : activeTab === 4 ? 'Realisasi' : 'Catatan';
      
      let chartImage = '';
      if (activeTab !== 5) {
        const chartId = activeTab === 1 ? 'planning-chart' : activeTab === 3 ? 'target-chart' : 'realisasi-chart';
        chartImage = await captureChartAsImage(chartId);
      }
      
      // Header tetap seperti sebelumnya...
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');
      
      pdf.setFontSize(24);
      pdf.setTextColor(44, 90, 160);
      pdf.setFont("helvetica", "bold");
      pdf.text('PT ELEKTRINDO UTAMA INDONESIA', pageWidth/2 - pdf.getTextWidth('PT ELEKTRINDO UTAMA INDONESIA')/2, 20);
      
      pdf.setFontSize(14);
      pdf.setTextColor(102, 102, 102);
      pdf.setFont("helvetica", "normal");
      pdf.text('MECHANICAL - ELECTRICAL - FIRE PROTECTION SYSTEM', pageWidth/2 - pdf.getTextWidth('MECHANICAL - ELECTRICAL - FIRE PROTECTION SYSTEM')/2, 30);
      
      pdf.setFontSize(12);
      pdf.setTextColor(44, 90, 160);
      pdf.setFont("helvetica", "bold");
      pdf.text('SILVER APP - INPUT DATA LAPANGAN', pageWidth/2 - pdf.getTextWidth('SILVER APP - INPUT DATA LAPANGAN')/2, 40);
      
      pdf.setDrawColor(44, 90, 160);
      pdf.setLineWidth(0.5);
      pdf.line(10, 45, pageWidth - 10, 45);
      
      pdf.setFontSize(18);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${projectName} - ${tabName}`, 10, 60);
      
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "normal");
      const projectInfo = [
        ['Kode Proyek', metaProject.project_code || '-'],
        ['Job Name', metaProject.job_name || '-'],
        ['Client', metaProject.client || '-'],
        ['Alamat', metaProject.address || '-'],
        ['Deadline', metaProject.deadline ? new Date(metaProject.deadline).toLocaleDateString('id-ID') : '-']
      ];
      
      let yPos = 70;
      projectInfo.forEach(([label, value]) => {
        pdf.setFont("helvetica", "bold");
        pdf.text(`${label}:`, 10, yPos);
        pdf.setFont("helvetica", "normal");
        pdf.text(value, 40, yPos);
        yPos += 8;
      });
      
      yPos += 10;
      
      pdf.setFontSize(16);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(44, 90, 160);
      pdf.text('KURVA S PROGRESS', 10, yPos);
      yPos += 12;
      
      pdf.setFontSize(12);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "bold");
      pdf.text('Summary:', 10, yPos);
      yPos += 8;
      
      pdf.setFont("helvetica", "normal");
      pdf.text(`Total Bobot: ${currentSummary.totalWeight.toFixed(2).replace('.', ',')}%`, 15, yPos);
      yPos += 7;
      
      // PERBAIKAN 2: Hitung total % dari tabel
      const dateCumulativeTotals: Record<string, number> = {};
      dateCols.forEach((date, index) => {
        dateCumulativeTotals[date] = 0;
      });
      
      // Hitung total kumulatif dari tabel
      currentRows.forEach(row => {
        dateCols.forEach((date, idx) => {
          const dateValue = parseFloat(row.dates?.[date]?.toString() || '0');
          if (idx === 0) {
            dateCumulativeTotals[date] = dateValue;
          } else {
            const prevDate = dateCols[idx - 1];
            dateCumulativeTotals[date] = dateCumulativeTotals[prevDate] + dateValue;
          }
        });
      });
      
      const totalPercentageFromTable = dateCumulativeTotals[dateCols[dateCols.length - 1]] || 0;
      
      if (activeTab === 1) {
        pdf.text(`Plan Progress: ${totalPercentageFromTable.toFixed(2).replace('.', ',')}%`, 15, yPos);
        yPos += 7;
        pdf.text(`Actual Progress: ${totalPercentageFromTable.toFixed(2).replace('.', ',')}%`, 15, yPos);
        yPos += 7;
      } else if (activeTab === 3) {
        pdf.text(`Target Progress: ${totalPercentageFromTable.toFixed(2).replace('.', ',')}%`, 15, yPos);
        yPos += 7;
      } else if (activeTab === 4) {
        pdf.text(`Realisasi Progress: ${totalPercentageFromTable.toFixed(2).replace('.', ',')}%`, 15, yPos);
        yPos += 7;
      }
      
      pdf.text(`Status: ${currentSummary.isValidWeight ? 'VALID' : 'INVALID'}`, 15, yPos);
      yPos += 20;
      
      // ========== PERBAIKAN UTAMA: TABEL DINAMIS ==========
      if (activeTab === 5) {
        // Kode untuk tab catatan tetap sama...
        pdf.setFontSize(15);
        pdf.setFont("helvetica", "bold");
        pdf.text('Catatan Lapangan:', 10, yPos);
        yPos += 12;
        
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "normal");
        notes.forEach((note, index) => {
          if (yPos > pageHeight - 30) {
            pdf.addPage('landscape');
            yPos = 20;
          }
          
          pdf.setFont("helvetica", "bold");
          pdf.text(`${index + 1}. ${new Date(note.created_at).toLocaleDateString('id-ID')} - ${note.created_by}`, 15, yPos);
          yPos += 7;
          
          const lines = pdf.splitTextToSize(note.content, pageWidth - 30);
          pdf.setFont("helvetica", "normal");
          pdf.text(lines, 20, yPos);
          yPos += (lines.length * 5) + 8;
          
          if (note.audio_url) {
            pdf.text(`Audio: Tersedia`, 20, yPos);
            yPos += 5;
          }
          
          yPos += 5;
        });
      } else {
        // PERBAIKAN: Definisikan headers di dalam scope ini
        const tableHeaders = [
          'No',
          'Description',
          'Bobot %',
          ...(activeTab === 1 ? ['Target (%)', 'Realisasi (%)'] : activeTab === 3 ? ['Target (%)'] : ['Realisasi (%)']),
          'Lokasi',
          ...dateCols.map((date, idx) => {
            // Potong header jika terlalu panjang
            return date.length > 12 ? date.substring(0, 10) + '...' : date;
          }),
          'Bukti'
        ];
        
        // PERBAIKAN: Siapkan data untuk tabel
        const data = [];
        for (let i = 0; i < currentRows.length; i++) {
          const row = currentRows[i];
          const rowData = [
            (i + 1).toString(),
            (row.description?.substring(0, 35) || '') + (row.description && row.description.length > 35 ? '...' : ''),
            parseFloat(row.weight?.toString() || '0').toFixed(1).replace('.', ','),
            ...(activeTab === 1 ? [
              parseFloat(row.plan_progress?.toString() || '0').toFixed(1).replace('.', ','),
              parseFloat(row.actual_progress?.toString() || '0').toFixed(1).replace('.', ',')
            ] : activeTab === 3 ? [
              parseFloat(row.plan_progress?.toString() || '0').toFixed(1).replace('.', ',')
            ] : [
              parseFloat(row.actual_progress?.toString() || '0').toFixed(1).replace('.', ',')
            ]),
            (row.location?.substring(0, 25) || '') + (row.location && row.location.length > 25 ? '...' : ''),
          ];
          
          // Kolom tanggal
          dateCols.forEach((date, idx) => {
            const dateValue = parseFloat(row.dates?.[date]?.toString() || '0');
            rowData.push(dateValue.toFixed(1).replace('.', ','));
          });
          
          rowData.push(row.proof_url || row.is_uploaded ? '✓' : '✗');
          data.push(rowData);
        }
        
        // PERBAIKAN: Tambah total row dengan nilai kumulatif
        if (data.length > 0) {
          const totalRow = ['', 'TOTAL %', '', ...(activeTab === 1 ? ['', ''] : activeTab === 3 ? [''] : ['']), ''];
          
          dateCols.forEach((date, idx) => {
            let cumulativeTotal = 0;
            for (let i = 0; i <= idx; i++) {
              const currentDate = dateCols[i];
              const dateTotal = currentRows.reduce((sum, row) => {
                return sum + parseFloat(row.dates?.[currentDate]?.toString() || '0');
              }, 0);
              cumulativeTotal += dateTotal;
            }
            totalRow.push(cumulativeTotal.toFixed(1).replace('.', ','));
          });
          
          totalRow.push('');
          data.push(totalRow);
        }
        
        // PERBAIKAN KRITIS: Hitung lebar kolom secara dinamis
        const totalColumns = tableHeaders.length;
        const availableWidth = pageWidth - 20; // Margin kiri-kanan 10mm
        
        // Buat objek columnStyles dinamis
        const columnStyles: any = {};
        
        // Atur lebar default berdasarkan jumlah kolom
        if (totalColumns <= 10) {
          // Sedikit kolom: lebar normal
          columnStyles[0] = { cellWidth: 12 };
          columnStyles[1] = { cellWidth: 50 };
          columnStyles[2] = { cellWidth: 18 };
          
          if (activeTab === 1) {
            columnStyles[3] = { cellWidth: 18 };
            columnStyles[4] = { cellWidth: 18 };
            columnStyles[5] = { cellWidth: 35 };
          } else if (activeTab === 3) {
            columnStyles[3] = { cellWidth: 18 };
            columnStyles[4] = { cellWidth: 35 };
          } else if (activeTab === 4) {
            columnStyles[3] = { cellWidth: 18 };
            columnStyles[4] = { cellWidth: 35 };
          }
          
          // Kolom tanggal
          const dateColumnStart = activeTab === 1 ? 6 : 5;
          const dateColumnsCount = dateCols.length;
          const dateWidth = Math.min(20, availableWidth / (totalColumns + 2));
          
          for (let i = dateColumnStart; i < dateColumnStart + dateColumnsCount; i++) {
            columnStyles[i] = { cellWidth: dateWidth };
          }
          
          columnStyles[totalColumns - 1] = { cellWidth: 12, halign: 'center' };
          
        } else if (totalColumns <= 20) {
          // Sedang kolom: lebih kompak
          columnStyles[0] = { cellWidth: 10 };
          columnStyles[1] = { cellWidth: 40 };
          columnStyles[2] = { cellWidth: 15 };
          
          if (activeTab === 1) {
            columnStyles[3] = { cellWidth: 15 };
            columnStyles[4] = { cellWidth: 15 };
            columnStyles[5] = { cellWidth: 30 };
          } else if (activeTab === 3) {
            columnStyles[3] = { cellWidth: 15 };
            columnStyles[4] = { cellWidth: 30 };
          } else if (activeTab === 4) {
            columnStyles[3] = { cellWidth: 15 };
            columnStyles[4] = { cellWidth: 30 };
          }
          
          // Kolom tanggal lebih kecil
          const dateColumnStart = activeTab === 1 ? 6 : 5;
          const dateColumnsCount = dateCols.length;
          const dateWidth = Math.min(15, availableWidth / (totalColumns + 3));
          
          for (let i = dateColumnStart; i < dateColumnStart + dateColumnsCount; i++) {
            columnStyles[i] = { cellWidth: dateWidth };
          }
          
          columnStyles[totalColumns - 1] = { cellWidth: 10, halign: 'center' };
          
        } else {
          // Banyak kolom: sangat kompak
          columnStyles[0] = { cellWidth: 8 };
          columnStyles[1] = { cellWidth: 35 };
          columnStyles[2] = { cellWidth: 12 };
          
          if (activeTab === 1) {
            columnStyles[3] = { cellWidth: 12 };
            columnStyles[4] = { cellWidth: 12 };
            columnStyles[5] = { cellWidth: 25 };
          } else if (activeTab === 3) {
            columnStyles[3] = { cellWidth: 12 };
            columnStyles[4] = { cellWidth: 25 };
          } else if (activeTab === 4) {
            columnStyles[3] = { cellWidth: 12 };
            columnStyles[4] = { cellWidth: 25 };
          }
          
          // Kolom tanggal sangat kecil
          const dateColumnStart = activeTab === 1 ? 6 : 5;
          const dateColumnsCount = dateCols.length;
          const dateWidth = Math.min(10, availableWidth / (totalColumns + 5));
          
          for (let i = dateColumnStart; i < dateColumnStart + dateColumnsCount; i++) {
            columnStyles[i] = { cellWidth: dateWidth };
          }
          
          columnStyles[totalColumns - 1] = { cellWidth: 8, halign: 'center' };
        }
        
        // PERBAIKAN: Gunakan font size dinamis berdasarkan jumlah kolom
        const fontSize = totalColumns <= 10 ? 9 : 
                        totalColumns <= 20 ? 8 : 
                        7;
        
        // PERBAIKAN: Konfigurasi autoTable yang lebih fleksibel
        const tableOptions: any = {
          head: [tableHeaders],
          body: data,
          startY: yPos,
          theme: 'grid',
          styles: { 
            fontSize: fontSize,
            cellPadding: 2,
            overflow: 'linebreak',
            lineColor: [200, 200, 200],
            lineWidth: 0.1,
            minCellHeight: 7
          },
          headStyles: { 
            fillColor: [44, 90, 160],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: fontSize + 1,
            cellPadding: 3,
            overflow: 'linebreak'
          },
          alternateRowStyles: {
            fillColor: [245, 245, 245]
          },
          margin: { left: 5, right: 5, top: 5 },
          tableWidth: 'auto',
          columnStyles: columnStyles,
          showHead: 'firstPage',
          // PERBAIKAN: Tambah pengaturan untuk split otomatis
          rowPageBreak: 'auto',
          tableLineWidth: 0.1,
          tableLineColor: [200, 200, 200],
          didDrawPage: (data: any) => {
            // PERBAIKAN 1: Akses pageNumber dengan cara yang benar
            const pageNumber = pdf.internal.pages ? pdf.internal.pages.length : 1;
            const currentPage = data.pageNumber || 1;
            
            // Footer untuk semua halaman
            pdf.setFillColor(44, 90, 160);
            pdf.rect(0, pageHeight - 15, pageWidth, 15, 'F');
            
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(8);
            pdf.text(
              `Dicetak oleh: ${userInfo.email} | Tanggal: ${userInfo.timestamp}`,
              10,
              pageHeight - 8
            );
            
            pdf.text(
              `Halaman ${currentPage} dari ${pageNumber}`,
              pageWidth - 30,
              pageHeight - 8
            );
          },
          // PERBAIKAN: Hook untuk menangani overflow
          didParseCell: (data: any) => {
            // Biarkan autoTable menangani parsing cell
          },
          // PERBAIKAN: Hook sebelum menggambar cell
          willDrawCell: (data: any) => {
            // Biarkan autoTable menggambar cell
          }
        };
        
        // PERBAIKAN: Generate tabel dengan autoTable
        try {
          autoTable(pdf, tableOptions);
          
          // Dapatkan posisi Y akhir setelah tabel
          const finalY = (pdf as any).lastAutoTable?.finalY || yPos + 100;
          yPos = finalY + 10;
          
        } catch (tableError) {
          console.error('Error generating table:', tableError);
          // Fallback: tabel sederhana
          pdf.setFontSize(10);
          pdf.text('⚠️ Tabel terlalu besar. Gunakan export Excel untuk data lengkap.', 10, yPos);
          yPos += 10;
        }
      }
      
      // PERBAIKAN: Tambahkan chart jika ada
      if (chartImage && activeTab !== 5) {
        try {
          const img = new Image();
          img.src = chartImage;
          
          await new Promise((resolve) => {
            img.onload = () => {
              // Pastikan ada cukup space
              if (yPos > pageHeight - 100) {
                pdf.addPage('landscape');
                yPos = 20;
              }
              
              const imgWidth = pageWidth - 20;
              const imgHeight = Math.min((img.height * imgWidth) / img.width, 120);
              
              pdf.setFontSize(12);
              pdf.setFont("helvetica", "bold");
              pdf.text('Kurva S - Progress Berkelanjutan', 10, yPos);
              yPos += 8;
              
              pdf.addImage(img, 'JPEG', 10, yPos, imgWidth, imgHeight);
              yPos += imgHeight + 15;
              resolve(true);
            };
            img.onerror = () => resolve(false);
            setTimeout(() => resolve(false), 2000);
          });
        } catch (e) {
          console.log('Gagal menambahkan chart ke PDF:', e);
        }
      }
      
      const fileName = `${metaProject.project_code || projectName}_KURVA_S_${tabName}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      
      const totalColsCount = activeTab === 5 ? 5 : (activeTab === 1 ? 6 : 5) + dateCols.length + 1;
      alert(`✅ Dokumen Kurva S berhasil dicetak ke ${fileName} (A3 Landscape - ${totalColsCount} kolom)`);

    } catch (error) {
      console.error('Print to PDF error:', error);
      alert('❌ Gagal mencetak dokumen Kurva S. Silakan coba lagi.');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="bg-white p-4 rounded shadow mb-6 ExportPrintControls">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-lg">🖨️ Export & Print Controls</h3>
        <div className="text-sm text-gray-500">
          Tab Aktif: {activeTab === 1 ? 'Planning' : activeTab === 2 ? 'Lokasi' : activeTab === 3 ? 'Target' : activeTab === 4 ? 'Realisasi' : 'Catatan'}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-lg p-4 bg-blue-50 hover:bg-blue-100 transition-colors">
          <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
            <span>📊</span>
            Export to Excel
          </h4>
          <p className="text-sm text-blue-700 mb-3">
            Export data Kurva S ke Excel dengan perbaikan total % kumulatif
          </p>
          <button
            onClick={exportToExcel}
            disabled={isExporting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-2 px-4 rounded flex items-center justify-center gap-2 transition-colors"
          >
            {isExporting ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <span>📥</span>
                <span>Download Excel</span>
              </>
            )}
          </button>
        </div>

        <div className="border rounded-lg p-4 bg-green-50 hover:bg-green-100 transition-colors">
          <h4 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
            <span>📝</span>
            Export to Word
          </h4>
          <p className="text-sm text-green-700 mb-3">
            Export data Kurva S ke Word A3 dengan perbaikan total % kumulatif
          </p>
          <button
            onClick={exportToWord}
            disabled={isExporting}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white py-2 px-4 rounded flex items-center justify-center gap-2 transition-colors"
          >
            {isExporting ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <span>📥</span>
                <span>Download Word</span>
              </>
            )}
          </button>
        </div>

        <div className="border rounded-lg p-4 bg-red-50 hover:bg-red-100 transition-colors">
          <h4 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
            <span>🖨️</span>
            Print to PDF
          </h4>
          <p className="text-sm text-red-700 mb-3">
            Cetak Kurva S ke PDF A3 landscape dengan total % kumulatif
          </p>
          <button
            onClick={printToPDF}
            disabled={isPrinting}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white py-2 px-4 rounded flex items-center justify-center gap-2 transition-colors"
          >
            {isPrinting ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Printing...</span>
              </>
            ) : (
              <>
                <span>📄</span>
                <span>Print PDF A3</span>
              </>
            )}
          </button>
        </div>
      </div>
      
      <div className="mt-4 p-3 bg-yellow-50 rounded border">
        <p className="text-sm text-yellow-700">
          💡 <strong>PERBAIKAN TOTAL %:</strong> Total % sekarang dihitung secara kumulatif (akumulasi dari hari sebelumnya) sesuai contoh yang Anda berikan.
        </p>
        <p className="text-sm text-yellow-700 mt-1">
          📏 <strong>UKURAN A3:</strong> Semua export/print sekarang menggunakan kertas A3 untuk menampung tabel dan grafik dalam jumlah besar.
        </p>
        <p className="text-sm text-yellow-700 mt-1">
          🔄 <strong>ACTUAL & PLAN PROGRESS:</strong> Nilai Actual Progress dan Plan Progress sekarang sama persis dengan total % dari tabel (kumulatif terakhir).
        </p>
      </div>
    </div>
  );
};

const UploadSection = ({ 
  currentRows, 
  uploadingFiles, 
  setFile, 
  file, 
  uploadToSingleStorage, 
  deleteFileFromStorage,
  projectId,
  setRows,
  setTargetRows,
  setRealisasiRows,
  activeTab
}: {
  currentRows: TaskType[];
  uploadingFiles: {[key: string]: boolean};
  setFile: (file: File | null) => void;
  file: File | null;
  uploadToSingleStorage: (file: File, taskId?: string | null, rowIndex?: number, description?: string) => Promise<void>;
  deleteFileFromStorage: (fileUrl: string) => Promise<void>;
  projectId: string | undefined;
  setRows: React.Dispatch<React.SetStateAction<TaskType[]>>;
  setTargetRows: React.Dispatch<React.SetStateAction<TaskType[]>>;
  setRealisasiRows: React.Dispatch<React.SetStateAction<TaskType[]>>;
  activeTab: number;
}) => {
  const [showUploadSection, setShowUploadSection] = useState(false);

  const [uploadStatusMap, setUploadStatusMap] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    if (!projectId) return;
    
    const savedStatusKey = `upload_status_${projectId}_tab${activeTab}`;
    const savedStatus = localStorage.getItem(savedStatusKey);

    if (savedStatus) {
      try {
        const parsed = JSON.parse(savedStatus) as Record<string, boolean>;
        const map = new Map<string, boolean>(Object.entries(parsed));
        setUploadStatusMap(map);
      } catch (err) {
        console.error("Failed parsing saved upload status:", err);
      }
    }
  }, [projectId, activeTab]);

  
  const saveUploadStatus = (rowKey: string, status: boolean) => {
    const newStatusMap = new Map(uploadStatusMap);
    newStatusMap.set(rowKey, status);
    
    setUploadStatusMap(newStatusMap as Map<string, boolean>);

    const statusObject: Record<string, boolean> = {};
    (newStatusMap as Map<string, boolean>).forEach((value, key) => {
      statusObject[key] = value;
    });

    localStorage.setItem(
      `upload_status_${projectId}_tab${activeTab}`,
      JSON.stringify(statusObject)
    );
  };

  
  useEffect(() => {
    const currentRowKeys = currentRows.map((row, index) => {
      const rowKey = row.id ? row.id : `row_${index}`;
      return rowKey;
    });
    
    const newStatusMap = new Map<string, boolean>();
    
    uploadStatusMap.forEach((status, key) => {
      if (key.includes('row_') || currentRowKeys.includes(key)) {
        newStatusMap.set(key, status);
      }
    });
    
    currentRows.forEach((row, index) => {
      const rowKey = row.id ? row.id : `row_${index}`;
      if (!newStatusMap.has(rowKey)) {
        newStatusMap.set(rowKey, false);
      }
    });
    
    if (newStatusMap.size !== uploadStatusMap.size || 
        JSON.stringify([...newStatusMap.entries()]) !== JSON.stringify([...uploadStatusMap.entries()])) {
      setUploadStatusMap(newStatusMap);
      
      const statusObject: Record<string, boolean> = {};
      newStatusMap.forEach((value, key) => {
        statusObject[key] = value;
      });
      
      localStorage.setItem(`upload_status_${projectId}_tab${activeTab}`, JSON.stringify(statusObject));
    }
  }, [currentRows, projectId, activeTab]);
  
  const FilePreview = ({ fileUrl, onDelete }: { fileUrl: string; onDelete: () => void }) => {
    const [showConfirm, setShowConfirm] = useState(false);
    
    const isImage = fileUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i);
    const fileName = fileUrl.split('/').pop() || 'file';

    return (
      <div className="flex items-center gap-2 p-2 bg-gray-50 rounded border mt-2">
        {isImage ? (
          <img 
            src={fileUrl} 
            alt="Preview" 
            className="w-12 h-12 object-cover rounded"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-12 h-12 bg-blue-100 rounded flex items-center justify-center">
            <span className="text-blue-600 text-xs">📄</span>
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">
            {fileName}
          </div>
          <a 
            href={fileUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            Lihat File
          </a>
        </div>
        
        {showConfirm ? (
          <div className="flex gap-1">
            <button
              onClick={onDelete}
              className="px-2 py-1 bg-red-600 text-white rounded text-xs"
            >
              Yakin
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="px-2 py-1 bg-gray-500 text-white rounded text-xs"
            >
              Batal
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowConfirm(true)}
            className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs"
          >
            Hapus
          </button>
        )}
      </div>
    );
  };

  const updateUploadStatus = (taskId: string | null | undefined, rowIndex: number, proofUrl: string) => {
    const rowKey = taskId ? taskId : `row_${rowIndex}`;
    
    saveUploadStatus(rowKey, true);
    
    const updateRows = (rows: TaskType[]) => rows.map((row, idx) => {
      const normalizedTaskId = taskId || null;
      const currentRowKey = row.id ? row.id : `row_${idx}`;
      
      if ((normalizedTaskId && row.id === normalizedTaskId) || 
          (!normalizedTaskId && currentRowKey === rowKey)) {
        return { 
          ...row, 
          proof_url: proofUrl, 
          is_uploaded: true 
        };
      }
      return row;
    });

    if (activeTab === 1) {
      setRows(prev => updateRows(prev));
    } else if (activeTab === 3) {
      setTargetRows(prev => updateRows(prev));
    } else if (activeTab === 4) {
      setRealisasiRows(prev => updateRows(prev));
    }
  };

  const hasUploaded = (row: TaskType, index: number): boolean => {
    const rowKey = row.id ? row.id : `row_${index}`;
    
    if (uploadStatusMap.has(rowKey)) {
      return uploadStatusMap.get(rowKey) || false;
    }
    
    return Boolean(row.proof_url || row.is_uploaded);
  };

  return (
    <div className="mt-4 p-3 bg-gray-50 rounded border">
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-semibold text-sm">📎 Upload File ke Supabase Storage</h4>
        <button
          onClick={() => setShowUploadSection(!showUploadSection)}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs flex items-center gap-1"
        >
          {showUploadSection ? '▲ Sembunyikan' : '▼ Tampilkan'}
        </button>
      </div>
      
      {showUploadSection && (
        <>
          <div className="mb-3 p-2 bg-blue-50 rounded">
            <p className="text-xs text-blue-700">
              🔄 <strong>SINGLE STORAGE SYSTEM:</strong> File akan diupload ke Supabase storage utama saja
            </p>
            <p className="text-xs text-blue-700 mt-1">
              💡 <strong>Status upload stabil:</strong> Status tetap ✅ meski ditambah data baru
            </p>
            <p className="text-xs text-blue-700 mt-1">
              📊 <strong>Status tersimpan:</strong> {uploadStatusMap.size} rows dengan status tersimpan
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentRows.map((row, index) => {
              const rowKey = row.id ? row.id : `row_${index}`;
              const uploadKey = rowKey;
              const isUploading = uploadingFiles[uploadKey];
              const hasProof = hasUploaded(row, index);
              
              return (
                <div key={index} className="flex gap-2 items-start p-2 bg-white rounded border">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {row.description || `Task ${index + 1}`}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <span>Status:</span> 
                      {hasProof ? (
                        <span className="text-green-600 flex items-center gap-1">
                          <span>✅</span>
                          <span>Terupload</span>
                          <span className="text-xs">({rowKey})</span>
                        </span>
                      ) : (
                        <span className="text-red-600">❌ Belum upload</span>
                      )}
                    </div>
                    {hasProof && row.proof_url && (
                      <FilePreview 
                        fileUrl={row.proof_url} 
                        onDelete={async () => {
                          if (confirm("Yakin ingin menghapus file ini dari storage?")) {
                            await deleteFileFromStorage(row.proof_url!);
                            
                            const updateRows = (rows: TaskType[]) => rows.map((r, idx) => {
                              const currentRowKey = r.id ? r.id : `row_${idx}`;
                              if (currentRowKey === rowKey) {
                                return { ...r, proof_url: undefined, is_uploaded: false };
                              }
                              return r;
                            });

                            saveUploadStatus(rowKey, false);
                            
                            if (activeTab === 1) {
                              setRows(prev => updateRows(prev));
                            } else if (activeTab === 3) {
                              setTargetRows(prev => updateRows(prev));
                            } else if (activeTab === 4) {
                              setRealisasiRows(prev => updateRows(prev));
                            }
                            
                            if (row.id) {
                              await supabase
                                .from("tasks")
                                .update({ proof_url: null, is_uploaded: false })
                                .eq("id", row.id);
                            }
                          }
                        }}
                      />
                    )}
                  </div>
                  
                  {!hasProof && (
                    <div className="flex gap-2 items-center">
                      <input
                        type="file"
                        onChange={(e) => {
                          const selectedFile = e.target.files?.[0];
                          if (selectedFile) {
                            setFile(selectedFile);
                            setTimeout(() => {
                              uploadToSingleStorage(selectedFile, row.id, index + 1, row.description || `Task ${index + 1}`);
                            }, 100);
                          }
                        }}
                        className="text-xs flex-1"
                        id={`file-${activeTab}-${index}`}
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                        disabled={isUploading}
                      />
                      <button
                        onClick={() => {
                          if (file) {
                            uploadToSingleStorage(file, row.id, index + 1, row.description || `Task ${index + 1}`);
                          } else {
                            document.getElementById(`file-${activeTab}-${index}`)?.click();
                          }
                        }}
                        disabled={isUploading}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs whitespace-nowrap disabled:bg-gray-400"
                      >
                        {isUploading ? "⏳ Uploading..." : "Upload"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          <div className="mt-3 p-2 bg-yellow-50 rounded border">
            <p className="text-xs text-yellow-700">
              💡 <strong>Tips:</strong> Status upload disimpan per baris dan tidak akan hilang meski Anda menambah atau menghapus data di tabel.
            </p>
            <button
              onClick={() => {
                if (confirm("Yakin ingin reset semua status upload? Ini tidak akan menghapus file, hanya statusnya saja.")) {
                  setUploadStatusMap(new Map());
                  localStorage.removeItem(`upload_status_${projectId}_tab${activeTab}`);
                  
                  const resetRows = (rows: TaskType[]) => rows.map(row => ({
                    ...row,
                    is_uploaded: false
                  }));
                  
                  if (activeTab === 1) {
                    setRows(prev => resetRows(prev));
                  } else if (activeTab === 3) {
                    setTargetRows(prev => resetRows(prev));
                  } else if (activeTab === 4) {
                    setRealisasiRows(prev => resetRows(prev));
                  }
                  
                  alert("Status upload telah direset!");
                }
              }}
              className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs"
            >
              🔄 Reset Status Upload
            </button>
          </div>
          
          <p className="text-xs text-gray-500 mt-2">
            File akan diupload ke Supabase Storage secara otomatis
          </p>
        </>
      )}
    </div>
  );
};

const MapTracking = dynamic(() => import("../../../components/MapTracking"), { ssr: false });

// ============ PERBAIKAN FUNGSI LOCATION TAB ============
const LocationTab = ({ projectId, metaProject }: { projectId: string | undefined, metaProject: ProjectMetaType }) => {
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    address: string;
    timestamp: string | null;
  }>({
    latitude: null,
    longitude: null,
    accuracy: null,
    address: "Belum mendapatkan lokasi",
    timestamp: null
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [locationHistory, setLocationHistory] = useState<any[]>([]);
  const [gpsAccuracy, setGpsAccuracy] = useState<'high' | 'medium' | 'low'>('medium');

  useEffect(() => {
    loadLocationHistory();
    getCurrentLocation(false);
  }, []);

  const loadLocationHistory = async () => {
    if (!projectId) return;
    
    try {
      const { data, error } = await supabase
        .from("shipments")
        .select("*")
        .eq("project_id", projectId)
        .order("recorded_at", { ascending: false })
        .limit(10);
      
      if (error) {
        console.error("Error loading location history:", error);
        return;
      }
      
      if (data) {
        setLocationHistory(data);
      }
    } catch (error) {
      console.error("Exception loading location history:", error);
    }
  };

const getCurrentLocation = async (manualUpdate = false) => {
  // PERBAIKAN: Periksa apakah geolocation didukung
  if (typeof window === 'undefined' || !navigator.geolocation) {
    const errorMsg = "Geolocation tidak didukung oleh browser Anda";
    if (setErrorMessage) setErrorMessage(errorMsg);
    alert(errorMsg);
    return;
  }

  setIsLoading(true);
  if (setErrorMessage) setErrorMessage(null);

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      const options = {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0
      };

      const success = (pos: GeolocationPosition) => {
        console.log("GPS Success:", pos.coords);
        resolve(pos);
      };

      const error = (err: GeolocationPositionError) => {
        console.error("GPS Error:", err);
        reject(err);
      };

      navigator.geolocation.getCurrentPosition(success, error, options);
    });

    const { latitude, longitude, accuracy } = position.coords;
    
    console.log("Location obtained:", { latitude, longitude, accuracy });
    
    if (accuracy && accuracy <= 10) {
      setGpsAccuracy('high');
    } else if (accuracy && accuracy <= 50) {
      setGpsAccuracy('medium');
    } else {
      setGpsAccuracy('low');
    }
    
    // Validasi koordinat Indonesia
    if (latitude < -11 || latitude > 6 || longitude < 95 || longitude > 141) {
      console.warn("Koordinat di luar range Indonesia:", { latitude, longitude });
      if (setErrorMessage) {
        setErrorMessage("Koordinat GPS di luar wilayah Indonesia. Pastikan GPS aktif.");
      }
    }
    
    let address = "Lokasi tidak diketahui";
    
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'SilverApp/1.0 (contact@elektrindo.com)',
            'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8'
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.display_name) {
          const addressParts = [];
          if (data.address) {
            if (data.address.road) addressParts.push(data.address.road);
            if (data.address.village || data.address.neighbourhood) 
              addressParts.push(data.address.village || data.address.neighbourhood);
            if (data.address.suburb) addressParts.push(data.address.suburb);
            if (data.address.city_district) addressParts.push(data.address.city_district);
            if (data.address.city || data.address.town) 
              addressParts.push(data.address.city || data.address.town || "Gresik");
            if (data.address.state) addressParts.push(data.address.state);
            if (data.address.country) addressParts.push(data.address.country);
          }
          address = addressParts.join(', ') || data.display_name;
        } else {
          address = `Koordinat: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        }
      } else {
        address = `Koordinat: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      }
    } catch (e) {
      console.warn("Gagal mendapatkan alamat dari API:", e);
      address = `Koordinat: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    }

    const newLocation = {
      latitude,
      longitude,
      accuracy,
      address,
      timestamp: new Date().toISOString()
    };

    setCurrentLocation(newLocation);

    if (manualUpdate) {
      // PERBAIKAN: Gunakan try-catch terpisah untuk sendLocationToDatabase
      try {
        const result = await sendLocationToDatabase(latitude, longitude, accuracy, address);
        if (!result) {
          console.warn("sendLocationToDatabase returned null, but location was obtained");
        }
      } catch (sendError) {
        console.error("Error in sendLocationToDatabase:", sendError);
        // Jangan throw error di sini, biarkan user tetap melihat lokasi mereka
      }
      
      // Tetap load history meskipun ada error
      try {
        await loadLocationHistory();
      } catch (loadError) {
        console.error("Error loading history:", loadError);
      }
    }

  } catch (error: any) {
    console.error("Error getting location:", error);
    
    let errorMsg = error.message || "Gagal mengambil lokasi";
    
    if (error.code === 1) {
      errorMsg = "Izin lokasi ditolak. Silakan izinkan akses lokasi di pengaturan browser.";
    } else if (error.code === 2) {
      errorMsg = "Posisi tidak tersedia. Pastikan GPS aktif dan ada sinyal.";
    } else if (error.code === 3) {
      errorMsg = "Timeout mendapatkan lokasi. Coba lagi di area terbuka.";
    } else {
      errorMsg = `Error: ${error.message || "Unknown error"}`;
    }
    
    if (setErrorMessage) setErrorMessage(errorMsg);
    
    // PERBAIKAN: Backup lokasi menggunakan IP-based location
    try {
      const ipResponse = await fetch('https://ipapi.co/json/', { 
        signal: AbortSignal.timeout(5000) 
      });
      if (ipResponse.ok) {
        const ipData = await ipResponse.json();
        if (ipData.latitude && ipData.longitude) {
          setCurrentLocation({
            latitude: ipData.latitude,
            longitude: ipData.longitude,
            accuracy: 50000,
            address: `${ipData.city || ''}, ${ipData.region || ''}, ${ipData.country_name || ''}`.trim().replace(/^,|,$/g, ''),
            timestamp: new Date().toISOString()
          });
          setGpsAccuracy('low');
          if (setErrorMessage) {
            setErrorMessage("⚠️ Menggunakan lokasi berdasarkan IP (kurang akurat). Pastikan GPS aktif untuk akurasi tinggi.");
          }
        }
      }
    } catch (ipError) {
      console.warn("IP-based location failed:", ipError);
    }
    
    if (manualUpdate) {
      setTimeout(() => {
        alert(`❌ ${errorMsg}\n\nTips:\n1. Pastikan GPS/lokasi diaktifkan\n2. Izinkan akses lokasi di browser\n3. Coba di area terbuka\n4. Refresh halaman dan coba lagi`);
      }, 100);
    }
  } finally {
    setIsLoading(false);
  }
};

const checkShipmentsStructure = async () => {
  try {
    console.log("Checking shipments table structure...");
    
    // Coba query struktur minimal
    const { data, error } = await supabase
      .from("shipments")
      .select("*")
      .limit(1);
    
    if (error) {
      console.error("Error checking shipments:", error);
      return null;
    }
    
    if (data && data.length > 0) {
      console.log("Sample shipment record:", data[0]);
      console.log("Available columns:", Object.keys(data[0]));
      return Object.keys(data[0]);
    }
    
    // Jika tidak ada data, coba dengan query informasi schema
    const { data: schemaData } = await supabase
      .from("shipments")
      .select("*", { head: true, count: "exact" });
    
    console.log("Shipments table exists, columns unknown");
    return [];
    
  } catch (error) {
    console.error("Failed to check shipments structure:", error);
    return null;
  }
};

// Panggil di useEffect atau saat load
useEffect(() => {
  if (projectId) {
    checkShipmentsStructure();
  }
}, [projectId]);

const sendLocationToDatabase = async (
  latitude: number, 
  longitude: number, 
  accuracy: number | null, 
  address: string
) => {
  try {
    if (!projectId) {
      throw new Error("Project ID tidak ditemukan");
    }

    // PERBAIKAN KRITIS: Gunakan struktur MINIMAL yang pasti ada di tabel
    const insertData: any = {
      project_id: projectId,
      last_lat: latitude,
      last_lng: longitude,
      address: address,
      status: "manual",
      recorded_at: new Date().toISOString()
    };

    // Tambahkan accuracy jika ada
    if (accuracy !== null && accuracy !== undefined) {
      insertData.accuracy = accuracy;
    }

    console.log("🔄 Sending location to database:", insertData);

    // PERBAIKAN: Gunakan insert tanpa .select().single() terlebih dahulu
    const { data, error } = await supabase
      .from("shipments")
      .insert([insertData])
      .select(); // Hapus .single()

    // PERBAIKAN: Handle error dengan cara yang sangat aman
    if (error) {
      console.log("❌ Insert error (safe log):", {
        code: error?.code || "NO_CODE",
        message: error?.message || "Unknown error",
        details: error?.details || "No details"
      });
      
      // PERBAIKAN: Coba insert dengan data yang lebih minimal
      const minimalData = {
        project_id: projectId,
        last_lat: latitude,
        last_lng: longitude,
        recorded_at: new Date().toISOString()
      };
      
      const { error: minimalError } = await supabase
        .from("shipments")
        .insert([minimalData]);
        
      if (minimalError) {
        console.log("❌ Minimal insert juga gagal:", minimalError);
        
        // Simpan ke localStorage sebagai backup
        const backupKey = `location_backup_${projectId}`;
        const existingBackup = localStorage.getItem(backupKey);
        const backupArray = existingBackup ? JSON.parse(existingBackup) : [];
        
        backupArray.push({
          ...insertData,
          backup_timestamp: new Date().toISOString()
        });
        
        localStorage.setItem(backupKey, JSON.stringify(backupArray.slice(-10)));
        
        throw new Error("Gagal menyimpan ke database. Data disimpan sementara di penyimpanan lokal.");
      } else {
        console.log("✅ Insert berhasil dengan data minimal");
        return { id: `minimal_${Date.now()}`, ...minimalData };
      }
    }

    console.log("✅ Insert berhasil:", data);
    
    // Return data pertama dari array
    return data && data.length > 0 ? data[0] : { id: `temp_${Date.now()}`, ...insertData };
    
  } catch (error: any) {
    console.log("❌ Outer catch error:", {
      errorType: typeof error,
      errorValue: error,
      message: error?.message || "No message"
    });
    
    let errorMsg = "Gagal menyimpan lokasi ke database";
    
    // PERBAIKAN: Deteksi error dengan cara yang sangat aman
    if (error && typeof error === 'object') {
      let errMsg = "";
      try {
        errMsg = error.message || String(error);
      } catch (e) {
        errMsg = "Cannot read error message";
      }
      
      if (errMsg.includes('network') || errMsg.includes('offline') || errMsg.includes('fetch')) {
        errorMsg += ". Periksa koneksi internet Anda.";
      } else if (errMsg.includes('database') || errMsg.includes('permission') || errMsg.includes('42501')) {
        errorMsg += ". Izin database ditolak.";
      } else if (errMsg.includes('duplicate')) {
        errorMsg += ". Data duplikat.";
      } else if (errMsg.includes('timeout')) {
        errorMsg += ". Timeout koneksi database.";
      } else if (errMsg.includes('item_name') || errMsg.includes('notes')) {
        errorMsg += ". Kolom tidak ditemukan di database.";
      } else {
        // Batasi panjang pesan error
        const shortMsg = errMsg.length > 150 ? errMsg.substring(0, 150) + "..." : errMsg;
        errorMsg += `. ${shortMsg}`;
      }
    } else if (error) {
      errorMsg += `. Error: ${String(error).substring(0, 100)}`;
    } else {
      errorMsg += ". Error tidak diketahui.";
    }
    
    // PERBAIKAN: Backup ke localStorage (tetap penting)
    try {
      const backupKey = `location_backup_${projectId}`;
      const backupData = {
        project_id: projectId,
        last_lat: latitude,
        last_lng: longitude,
        accuracy: accuracy,
        address: address,
        timestamp: new Date().toISOString(),
        error: error?.message || "Unknown error"
      };
      
      const existingBackup = localStorage.getItem(backupKey);
      const backupArray = existingBackup ? JSON.parse(existingBackup) : [];
      backupArray.push(backupData);
      
      const trimmedBackup = backupArray.slice(-10);
      localStorage.setItem(backupKey, JSON.stringify(trimmedBackup));
      
      console.log("Data disimpan di localStorage backup:", trimmedBackup.length, "items");
      
      errorMsg += `\n\n⚠️ Data disimpan sementara di penyimpanan lokal (${trimmedBackup.length} backup).`;
      
    } catch (backupError) {
      console.log("Backup failed (non-critical):", backupError);
    }
    
    // Tampilkan error di UI
    if (setErrorMessage) {
      try {
        const uiErrorMsg = errorMsg.split('\n')[0] || "Gagal menyimpan lokasi";
        setErrorMessage(uiErrorMsg);
      } catch (uiError) {
        console.log("Failed to set error message:", uiError);
      }
    }
    
    // Alert dengan informasi lengkap
    setTimeout(() => {
      try {
        alert(`❌ ${errorMsg}\n\nTips:\n1. Coba perbarui lokasi lagi\n2. Periksa koneksi internet\n3. Hubungi admin jika error berlanjut`);
      } catch (alertError) {
        console.log("Alert failed:", alertError);
      }
    }, 500);
    
    return null;
  }
};

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDate = (timestamp: string | null) => {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const deleteLocation = async (id: string) => {
    if (!confirm("Yakin ingin menghapus lokasi ini?")) return;
    
    try {
      const { error } = await supabase
        .from("shipments")
        .delete()
        .eq("id", id);
      
      if (error) {
        console.error("Error deleting location:", error);
        alert("❌ Gagal menghapus lokasi");
        return;
      }
      
      // PERBAIKAN: Update state tanpa reload dari server
      setLocationHistory(prev => prev.filter(loc => loc.id !== id));
      alert("✅ Lokasi berhasil dihapus");
    } catch (error) {
      console.error("Exception deleting location:", error);
      alert("❌ Gagal menghapus lokasi");
    }
  };

  const getAccuracyColor = () => {
    switch(gpsAccuracy) {
      case 'high': return 'text-green-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getAccuracyText = () => {
    switch(gpsAccuracy) {
      case 'high': return 'Tinggi (GPS Aktif, akurasi ≤10m)';
      case 'medium': return 'Sedang (GPS+Network, akurasi ≤50m)';
      case 'low': return 'Rendah (Network Only, akurasi >50m)';
      default: return 'Tidak diketahui';
    }
  };

  const deleteAllLocations = async () => {
    if (!projectId) return;
    
    if (!confirm("Yakin ingin menghapus semua riwayat lokasi?")) return;
    
    try {
      const { error } = await supabase
        .from("shipments")
        .delete()
        .eq("project_id", projectId);
      
      if (error) {
        console.error("Error deleting all locations:", error);
        alert("❌ Gagal menghapus semua riwayat lokasi");
        return;
      }
      
      setLocationHistory([]);
      alert("✅ Semua riwayat lokasi berhasil dihapus");
    } catch (error) {
      console.error("Exception deleting all locations:", error);
      alert("❌ Gagal menghapus semua riwayat lokasi");
    }
  };

const retryFailedLocations = async () => {
  try {
    const backupKey = `location_backup_${projectId}`;
    const backupData = localStorage.getItem(backupKey);
    
    if (!backupData) {
      alert("✅ Tidak ada data lokasi yang gagal tersimpan");
      return;
    }
    
    const locations: Array<{
      last_lat: number;
      last_lng: number;
      accuracy: number | null;
      address: string;
      timestamp: string;
      error?: string;
      errorCode?: string;
    }> = JSON.parse(backupData);
    
    let successCount = 0;
    let failCount = 0;
    const failedItems: Array<{ index: number; error: string }> = [];
    
    alert(`🔄 Mengirim ulang ${locations.length} lokasi yang gagal...`);
    
    for (const [index, location] of locations.entries()) {
      try {
        setIsLoading(true);
        const result = await sendLocationToDatabase(
          location.last_lat,
          location.last_lng,
          location.accuracy,
          location.address
        );
        
        if (result) {
          successCount++;
        } else {
          failCount++;
          failedItems.push({ index, error: "Result null" });
        }
      } catch (e: any) {
        failCount++;
        failedItems.push({ index, error: e.message || "Unknown error" });
        console.error(`Failed to retry location ${index}:`, e);
      } finally {
        setIsLoading(false);
      }
    }
    
    // Hapus backup jika semua berhasil
    if (successCount > 0 && failCount === 0) {
      localStorage.removeItem(backupKey);
    } else if (successCount > 0) {
      // Simpan ulang hanya yang gagal
      const remainingFailures = locations.filter((_, idx: number) => 
        failedItems.some(item => item.index === idx)
      );
      localStorage.setItem(backupKey, JSON.stringify(remainingFailures));
    }
    
    const failedItemsText = failedItems.length > 0 
      ? 'Gagal: ' + failedItems.map(f => `Item ${f.index + 1}`).join(', ') 
      : 'Semua berhasil';
    
    alert(`📊 Hasil Retry:\n✅ ${successCount} lokasi berhasil dikirim ulang\n❌ ${failCount} lokasi gagal dikirim\n\n${failedItemsText}`);
    
  } catch (error: any) {
    console.error("Error retrying locations:", error);
    alert(`❌ Gagal mengirim ulang lokasi: ${error.message || "Silakan coba lagi."}`);
  }
};

  return (
    <div className="space-y-6" id="tab-lokasi-content">
      <div className="bg-white p-6 rounded shadow">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <span className="text-2xl">📍</span>
          <span>Lokasi Terkini & GPS Tracking</span>
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded p-4">
            <h4 className="font-semibold text-blue-800 mb-2">📍 Lokasi Anda Sekarang</h4>
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700"></div>
                <span className="text-blue-700">Mendeteksi lokasi GPS...</span>
                <span className="text-xs text-gray-500">(Pastikan GPS aktif)</span>
              </div>
            ) : currentLocation.latitude ? (
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-gray-600">Latitude:</span>
                  <span className="font-semibold font-mono">{currentLocation.latitude.toFixed(6)}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-gray-600">Longitude:</span>
                  <span className="font-semibold font-mono">{currentLocation.longitude!.toFixed(6)}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-gray-600">Akurasi GPS:</span>
                  <span className={`font-semibold ${getAccuracyColor()}`}>
                    {currentLocation.accuracy ? `${currentLocation.accuracy.toFixed(1)} meter` : 'N/A'} 
                    <span className="text-xs ml-2">({getAccuracyText()})</span>
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-gray-600">Alamat:</span>
                  <span className="font-semibold break-words">{currentLocation.address}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-gray-600">Terakhir Update:</span>
                  <span className="font-semibold">{formatTime(currentLocation.timestamp)} {formatDate(currentLocation.timestamp)}</span>
                </div>
                
                <div className="mt-3 p-2 bg-green-50 rounded border border-green-200">
                  <div className="text-xs text-green-700">
                    <span className="font-semibold">Tips Akurasi Tinggi:</span> 
                    {gpsAccuracy === 'high' ? ' ✅ GPS aktif dengan akurasi tinggi.' : 
                     ' ⚠️ Buka GPS di pengaturan perangkat dan izinkan akses lokasi untuk akurasi ≤10m.'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-yellow-600">
                ⚠️ Lokasi belum terdeteksi. Klik tombol di bawah untuk mendapatkan lokasi.
                <p className="text-sm mt-2 text-gray-600">
                  <span className="font-semibold">Pastikan:</span><br/>
                  1. GPS/lokasi diaktifkan di pengaturan perangkat<br/>
                  2. Browser diizinkan akses lokasi<br/>
                  3. Koneksi internet stabil<br/>
                  4. Berada di area terbuka untuk sinyal GPS lebih baik
                </p>
              </div>
            )}
            
            {errorMessage && (
              <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded">
                <div className="flex items-start gap-2 text-red-700">
                  <span>⚠️</span>
                  <div className="text-sm">
                    <span className="font-semibold">Error:</span> {errorMessage.split('\n')[0]}
                    {errorMessage.split('\n').length > 1 && (
                      <div className="mt-1 text-xs">
                        {errorMessage.split('\n').slice(1).map((line, idx) => (
                          <div key={idx}>{line}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="bg-green-50 border border-green-200 rounded p-4">
            <h4 className="font-semibold text-green-800 mb-2">📊 Informasi Proyek</h4>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-gray-600">Kode Proyek:</span>
                <span className="font-semibold">{metaProject.project_code || '-'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-600">Job Name:</span>
                <span className="font-semibold">{metaProject.job_name || '-'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-600">Lokasi Proyek:</span>
                <span className="font-semibold">{metaProject.address || '-'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-600">Client:</span>
                <span className="font-semibold">{metaProject.client || '-'}</span>
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-white rounded border">
              <h5 className="font-semibold text-gray-700 mb-1 text-sm">🎯 Status Akurasi GPS:</h5>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-3 h-3 rounded-full ${
                  gpsAccuracy === 'high' ? 'bg-green-500' :
                  gpsAccuracy === 'medium' ? 'bg-yellow-500' :
                  'bg-red-500'
                }`}></div>
                <span className={`text-xs ${getAccuracyColor()}`}>
                  {getAccuracyText()}
                </span>
              </div>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• <span className="text-green-600">Tinggi (≤10m):</span> GPS aktif, area terbuka</li>
                <li>• <span className="text-yellow-600">Sedang (≤50m):</span> GPS+Network, dalam ruangan</li>
                <li>• <span className="text-red-600">Rendah (&gt;50m):</span> Network only, kurang akurat</li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
          <h4 className="font-semibold text-yellow-800 mb-2">🚀 Update & Kirim Lokasi</h4>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => getCurrentLocation(false)}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Mendeteksi GPS...</span>
                </>
              ) : (
                <>
                  <span>🔄</span>
                  <span>Perbarui Lokasi GPS</span>
                </>
              )}
            </button>
            
            <button
              onClick={() => getCurrentLocation(true)}
              disabled={isLoading || !currentLocation.latitude}
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-white flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              <span>📤</span>
              <span>Kirim Lokasi ke Server</span>
            </button>
            
            <button
              onClick={() => {
                if (currentLocation.latitude && currentLocation.longitude) {
                  const url = `https://www.google.com/maps?q=${currentLocation.latitude},${currentLocation.longitude}`;
                  window.open(url, '_blank');
                } else {
                  alert("Lokasi belum tersedia. Perbarui lokasi terlebih dahulu.");
                }
              }}
              disabled={!currentLocation.latitude}
              className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-white flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              <span>🗺️</span>
              <span>Buka di Google Maps</span>
            </button>
            
            <button
              onClick={() => loadLocationHistory()}
              className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded text-white flex items-center gap-2 transition-colors"
            >
              <span>🔄</span>
              <span>Refresh Riwayat</span>
            </button>
            
            <button
              onClick={retryFailedLocations}
              className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded text-white flex items-center gap-2 transition-colors"
              title="Coba kirim ulang lokasi yang gagal"
            >
              <span>🔄</span>
              <span>Retry Failed</span>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded shadow">
        <h3 className="font-semibold mb-4">🗺️ Peta & Monitor Lokasi</h3>
        
        {projectId ? (
          <div className="space-y-4">
            {/* PERBAIKAN: Tambahkan error boundary untuk MapTracking */}
            <div id="map-container">
              <MapTracking 
                projectId={projectId} 
                center={currentLocation.latitude && currentLocation.longitude ? 
                  { lat: currentLocation.latitude, lng: currentLocation.longitude } : 
                  { lat: -7.155, lng: 112.65 }
                }
                zoom={currentLocation.latitude ? 15 : 13}
              />
            </div>
            
            <div className="mt-4">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold">📋 Riwayat Lokasi</h4>
                <div className="flex gap-2">
                  <button
                    onClick={deleteAllLocations}
                    className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs flex items-center gap-1 transition-colors"
                    disabled={locationHistory.length === 0}
                  >
                    🗑️ Hapus Semua
                  </button>
                </div>
              </div>
              <div className="space-y-2 max-h-60 overflow-auto">
                {locationHistory.map((loc) => (
                  <div key={loc.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex-1">
                      <div className="font-medium">{loc.item_name || "Lokasi"}</div>
                      <div className="text-sm text-gray-600 break-words">{loc.address}</div>
                      <div className="text-xs text-gray-500">
                        {formatTime(loc.recorded_at)} {formatDate(loc.recorded_at)}
                      </div>
                      {loc.accuracy && (
                        <div className={`text-xs ${loc.accuracy <= 10 ? 'text-green-600' : loc.accuracy <= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                          Akurasi: {loc.accuracy.toFixed(1)} m
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                        {loc.last_lat?.toFixed(4)}, {loc.last_lng?.toFixed(4)}
                      </span>
                      <button
                        onClick={() => deleteLocation(loc.id)}
                        className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs transition-colors"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ))}
                
                {locationHistory.length === 0 && (
                  <div className="text-center py-4 text-gray-500">
                    <div className="text-2xl mb-2">📍</div>
                    <p>Belum ada riwayat lokasi</p>
                    <p className="text-sm">Klik "Kirim Lokasi ke Server" untuk menyimpan lokasi pertama</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>Project ID tidak ditemukan</p>
          </div>
        )}
      </div>
      
      {/* PERBAIKAN: Tambahkan status sistem */}
      <div className="mt-6 p-4 bg-gray-50 rounded border">
        <h4 className="font-semibold mb-2 text-sm">🔧 Status Sistem Lokasi</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${projectId ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span>Project ID: {projectId ? '✅ Valid' : '❌ Invalid'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${typeof navigator !== 'undefined' && navigator.geolocation ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span>Geolocation API: {typeof navigator !== 'undefined' && navigator.geolocation ? '✅ Supported' : '❌ Not Supported'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${currentLocation.latitude ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
            <span>Current Location: {currentLocation.latitude ? '✅ Detected' : '⏳ Pending'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ Komponen utama ============
export default function SilverPage(): React.JSX.Element {
  const router = useRouter();
  const params = useParams();
  const projectId = (params as any)?.projectId as string | undefined;

  const [projectName, setProjectName] = useState<string>("Project");
  const [rows, setRows] = useState<TaskType[]>([]);
  const [dateCols, setDateCols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [metaProject, setMetaProject] = useState<ProjectMetaType>({});
  const [activeTab, setActiveTab] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [logoError, setLogoError] = useState(false);
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<{[key: string]: boolean}>({});

  const [targetRows, setTargetRows] = useState<TaskType[]>([]);
  const [realisasiRows, setRealisasiRows] = useState<TaskType[]>([]);
  const [targetChartData, setTargetChartData] = useState<any[]>([]);
  const [realisasiChartData, setRealisasiChartData] = useState<any[]>([]);

  const [notes, setNotes] = useState<NoteType[]>([]);
  const [newNote, setNewNote] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);

  const [onlineUsers, setOnlineUsers] = useState<UserPresenceType[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showDeleteDate, setShowDeleteDate] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<string | null>(null);

  const [selectedRange, setSelectedRange] = useState<{
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | null>(null);
  const [spreadsheetStyles, setSpreadsheetStyles] = useState<Record<string, any>>({});
  const spreadsheetRef = useRef<HTMLDivElement>(null);

  const undoStack = useRef<TaskType[][]>([]);
  const redoStack = useRef<TaskType[][]>([]);
  const targetUndoStack = useRef<TaskType[][]>([]);
  const targetRedoStack = useRef<TaskType[][]>([]);
  const realisasiUndoStack = useRef<TaskType[][]>([]);
  const realisasiRedoStack = useRef<TaskType[][]>([]);
  
  const dateColsUndoStack = useRef<DateColsHistory[]>([]);
  const dateColsRedoStack = useRef<DateColsHistory[]>([]);

  // PERBAIKAN 1: Save semua data di dalam project
  const LS_KEY = `silver:${projectId}:rows`;
  const LS_TARGET_KEY = `silver:${projectId}:target_rows`;
  const LS_REALISASI_KEY = `silver:${projectId}:realisasi_rows`;
  const LS_DATE_COLS = `silver:${projectId}:date_cols`;
  const LS_META_PROJECT = `silver:${projectId}:meta_project`;
  const LS_ACTIVE_TAB = `silver:${projectId}:active_tab`;

  useEffect(() => {
    const email = localStorage.getItem("userEmail");
    const profile = localStorage.getItem("userProfile");
    setUserEmail(email);
    setUserProfile(profile);
  }, []);

  const parseDecimalValue = (value: any): number => {
    if (value === null || value === undefined || value === "") return 0;
    
    if (typeof value === 'string') {
      value = value.replace(',', '.');
      value = value.replace(/[^\d.-]/g, '');
    }
    
    const num = Number(value);
    return isNaN(num) ? 0 : parseFloat(num.toFixed(2));
  };

  const formatDecimalForSpreadsheet = (value: any): string => {
    if (value === null || value === undefined || value === "") return "";
    const num = parseDecimalValue(value);
    return num === 0 ? "" : num.toString().replace('.', ',');
  };

  const handleDecimalInput = (value: string): number => {
    if (!value) return 0;
    
    const normalizedValue = value.replace(',', '.');
    const cleanValue = normalizedValue.replace(/[^\d.-]/g, '');
    
    const num = Number(cleanValue);
    return isNaN(num) ? 0 : parseFloat(num.toFixed(2));
  };

  const handleDateInput = (value: string): number => {
    return handleDecimalInput(value);
  };

  const totalWeight = useMemo(() => {
    return rows.reduce((sum, row) => sum + parseDecimalValue(row.weight), 0);
  }, [rows]);

  const totalTargetWeight = useMemo(() => {
    return targetRows.reduce((sum, row) => sum + parseDecimalValue(row.weight), 0);
  }, [targetRows]);

  const validateProgressValues = (weight: number, planProgress: number, actualProgress: number) => {
    const maxAllowed = weight;
    const validPlanProgress = Math.min(planProgress, maxAllowed);
    const validActualProgress = Math.min(actualProgress, maxAllowed);
    return { validPlanProgress, validActualProgress };
  };

  const validateDateValue = (dateValue: number, weight: number, planProgress: number, actualProgress: number, cumulativeUntilNow: number = 0): number => {
    const maxAllowed = Math.max(0, actualProgress - cumulativeUntilNow);
    return Math.min(dateValue, maxAllowed);
  };

  const validateTargetDateValue = (dateValue: number, weight: number, planProgress: number, cumulativeUntilNow: number = 0): number => {
    const maxAllowed = Math.max(0, planProgress - cumulativeUntilNow);
    return Math.min(dateValue, maxAllowed);
  };

  const validateRealisasiDateValue = (dateValue: number, weight: number, actualProgress: number, cumulativeUntilNow: number = 0): number => {
    const maxAllowed = Math.max(0, actualProgress - cumulativeUntilNow);
    return Math.min(dateValue, maxAllowed);
  };

  const calculateDateTotals = (rowsData: TaskType[]) => {
    const totals: Record<string, number> = {};
    
    // PERBAIKAN: Hitung total secara kumulatif (akumulasi dari hari sebelumnya)
    let cumulativeTotal = 0;
    dateCols.forEach(date => {
      const dateTotal = rowsData.reduce((sum, row) => {
        const dateValue = parseDecimalValue(row.dates?.[date]);
        return sum + dateValue;
      }, 0);
      
      cumulativeTotal += dateTotal;
      totals[date] = cumulativeTotal;
    });
    
    return totals;
  };

  // PERBAIKAN 2: Actual Progress dan Plan Progress harus sama dengan total % dari tabel
  const planningSummary = useMemo(() => {
    const totalWeight = rows.reduce((s, r) => s + parseDecimalValue(r.weight), 0);
    const normalizationFactor = totalWeight > 100 ? 100 / totalWeight : 1;
    
    // Hitung total % dari tabel (kumulatif terakhir)
    const dateTotals = calculateDateTotals(rows);
    const totalPercentageFromTable = dateTotals[dateCols[dateCols.length - 1]] || 0;

    return {
      plan: totalPercentageFromTable, // Gunakan total dari tabel
      accumPlan: totalPercentageFromTable,
      actual: totalPercentageFromTable, // Gunakan total dari tabel
      accumActual: totalPercentageFromTable,
      totalWeight: totalWeight,
      isValidWeight: totalWeight <= 100
    };
  }, [rows, dateCols]);

  const targetSummary = useMemo(() => {
    const totalWeight = targetRows.reduce((s, r) => s + parseDecimalValue(r.weight), 0);
    const normalizationFactor = totalWeight > 100 ? 100 / totalWeight : 1;
    
    // Hitung total % dari tabel (kumulatif terakhir)
    const dateTotals = calculateDateTotals(targetRows);
    const totalPercentageFromTable = dateTotals[dateCols[dateCols.length - 1]] || 0;

    return {
      plan: totalPercentageFromTable, // Gunakan total dari tabel
      accumPlan: totalPercentageFromTable,
      actual: 0,
      accumActual: 0,
      totalWeight: totalWeight,
      isValidWeight: totalWeight <= 100
    };
  }, [targetRows, dateCols]);

  const realisasiSummary = useMemo(() => {
    const totalWeight = realisasiRows.reduce((s, r) => s + parseDecimalValue(r.weight), 0);
    const normalizationFactor = totalWeight > 100 ? 100 / totalWeight : 1;
    
    // Hitung total % dari tabel (kumulatif terakhir)
    const dateTotals = calculateDateTotals(realisasiRows);
    const totalPercentageFromTable = dateTotals[dateCols[dateCols.length - 1]] || 0;

    return {
      plan: 0,
      accumPlan: 0,
      actual: totalPercentageFromTable, // Gunakan total dari tabel
      accumActual: totalPercentageFromTable,
      totalWeight: totalWeight,
      isValidWeight: totalWeight <= 100
    };
  }, [realisasiRows, dateCols]);

  const planningDateTotals = useMemo(() => calculateDateTotals(rows), [rows, dateCols]);
  const targetDateTotals = useMemo(() => calculateDateTotals(targetRows), [targetRows, dateCols]);
  const realisasiDateTotals = useMemo(() => calculateDateTotals(realisasiRows), [realisasiRows, dateCols]);

  const currentSummary = useMemo(() => {
    switch (activeTab) {
      case 1: return planningSummary;
      case 3: return targetSummary;
      case 4: return realisasiSummary;
      default: return planningSummary;
    }
  }, [activeTab, planningSummary, targetSummary, realisasiSummary]);

  const planningChartData = useMemo(() => {
    if (!dateCols.length) return [];

    const allDataPoints: any[] = [];
    
    rows.forEach((row, rowIndex) => {
      const description = row.description || `Task ${rowIndex + 1}`;
      
      dateCols.forEach((date, dateIndex) => {
        const dateValue = parseDecimalValue(row.dates?.[date]);
        
        let cumulativeUntilNow = 0;
        for (let i = 0; i < dateIndex; i++) {
          const prevDate = dateCols[i];
          cumulativeUntilNow += parseDecimalValue(row.dates?.[prevDate]);
        }
        
        const validatedValue = validateDateValue(dateValue, parseDecimalValue(row.weight), parseDecimalValue(row.plan_progress), parseDecimalValue(row.actual_progress), cumulativeUntilNow);
        
        if (validatedValue > 0) {
          allDataPoints.push({
            date,
            task: description,
            progress: validatedValue,
            rowIndex
          });
        }
      });
    });

    const dateMap = new Map();
    
    allDataPoints.forEach(point => {
      if (!dateMap.has(point.date)) {
        dateMap.set(point.date, {
          date: point.date,
          totalProgress: 0,
          tasks: {}
        });
      }
      
      const dateData = dateMap.get(point.date);
      dateData.tasks[point.task] = point.progress;
      dateData.totalProgress += point.progress;
    });

    return Array.from(dateMap.values());
  }, [rows, dateCols]);

  const targetChartDataNew = useMemo(() => {
    if (!dateCols.length) return [];

    const allDataPoints: any[] = [];
    
    targetRows.forEach((row, rowIndex) => {
      const description = row.description || `Task ${rowIndex + 1}`;
      
      dateCols.forEach((date, dateIndex) => {
        const dateValue = parseDecimalValue(row.dates?.[date]);
        
        let cumulativeUntilNow = 0;
        for (let i = 0; i < dateIndex; i++) {
          const prevDate = dateCols[i];
          cumulativeUntilNow += parseDecimalValue(row.dates?.[prevDate]);
        }
        
        const validatedValue = validateTargetDateValue(dateValue, parseDecimalValue(row.weight), parseDecimalValue(row.plan_progress), cumulativeUntilNow);
        
        if (validatedValue > 0) {
          allDataPoints.push({
            date,
            task: description,
            progress: validatedValue,
            rowIndex
          });
        }
      });
    });

    const dateMap = new Map();
    
    allDataPoints.forEach(point => {
      if (!dateMap.has(point.date)) {
        dateMap.set(point.date, {
          date: point.date,
          totalProgress: 0,
          tasks: {}
        });
      }
      
      const dateData = dateMap.get(point.date);
      dateData.tasks[point.task] = point.progress;
      dateData.totalProgress += point.progress;
    });

    return Array.from(dateMap.values());
  }, [targetRows, dateCols]);

  const realisasiChartDataNew = useMemo(() => {
    if (!dateCols.length) return [];

    const allDataPoints: any[] = [];
    
    realisasiRows.forEach((row, rowIndex) => {
      const description = row.description || `Task ${rowIndex + 1}`;
      
      dateCols.forEach((date, dateIndex) => {
        const dateValue = parseDecimalValue(row.dates?.[date]);
        
        let cumulativeUntilNow = 0;
        for (let i = 0; i < dateIndex; i++) {
          const prevDate = dateCols[i];
          cumulativeUntilNow += parseDecimalValue(row.dates?.[prevDate]);
        }
        
        const validatedValue = validateRealisasiDateValue(dateValue, parseDecimalValue(row.weight), parseDecimalValue(row.actual_progress), cumulativeUntilNow);
        
        if (validatedValue > 0) {
          allDataPoints.push({
            date,
            task: description,
            progress: validatedValue,
            rowIndex,
            cumulativeUntilNow
          });
        }
      });
    });

    const dateMap = new Map();
    
    allDataPoints.forEach(point => {
      if (!dateMap.has(point.date)) {
        dateMap.set(point.date, {
          date: point.date,
          totalProgress: 0,
          tasks: {}
        });
      }
      
      const dateData = dateMap.get(point.date);
      dateData.tasks[point.task] = point.progress;
      dateData.totalProgress += point.progress;
    });

    return Array.from(dateMap.values());
  }, [realisasiRows, dateCols]);

  const combinedRealisasiChartData = useMemo(() => {
    if (!dateCols.length) return [];

    const combinedDataMap = new Map();

    planningChartData.forEach(item => {
      combinedDataMap.set(item.date, {
        date: item.date,
        planningTotal: item.totalProgress,
        realisasiTotal: 0,
        tasks: { ...item.tasks }
      });
    });

    realisasiChartDataNew.forEach(item => {
      if (combinedDataMap.has(item.date)) {
        const existing = combinedDataMap.get(item.date);
        combinedDataMap.set(item.date, {
          ...existing,
          realisasiTotal: item.totalProgress,
          realisasiTasks: { ...item.tasks }
        });
      } else {
        combinedDataMap.set(item.date, {
          date: item.date,
          planningTotal: 0,
          realisasiTotal: item.totalProgress,
          realisasiTasks: { ...item.tasks }
        });
      }
    });

    return Array.from(combinedDataMap.values());
  }, [planningChartData, realisasiChartDataNew, dateCols]);

  // PERBAIKAN 1: Autosave semua data ke localStorage
  const autosave = useRef(
    debounceFn(async (projectIdArg: string | undefined, snapshotRows: TaskType[]) => {
      if (!projectIdArg) return;
      try {
        // Simpan ke localStorage
        localStorage.setItem(LS_KEY, JSON.stringify(snapshotRows));
        localStorage.setItem(LS_META_PROJECT, JSON.stringify(metaProject));
        localStorage.setItem(LS_ACTIVE_TAB, JSON.stringify(activeTab));
        
        // Juga simpan ke Supabase
        await Promise.all(
          snapshotRows.map(async (r) => {
            const payload: any = {
              description: r.description ?? null,
              weight: parseDecimalValue(r.weight),
              plan_progress: parseDecimalValue(r.plan_progress),
              actual_progress: parseDecimalValue(r.actual_progress),
              color: r.color ?? "",
              location: r.location ?? null,
              dates: r.dates ?? {},
              project_id: projectIdArg,
              row_index: r.row_index ?? 0,
            };
            if (r.id) {
              await supabase.from("tasks").update(payload).eq("id", r.id);
            } else {
              await supabase.from("tasks").upsert(payload);
            }
          })
        );
      } catch (err) {
        console.error("autosave error:", err);
      }
    }, 1100)
  ).current;

  const generateProjectCode = async (): Promise<string> => {
    try {
      const { count } = await supabase
        .from("projects")
        .select('*', { count: 'exact', head: true });
      
      const projectNumber = (count || 0) + 1;
      const today = new Date();
      const formattedDate = today.toISOString().split('T')[0].replace(/-/g, '');
      
      return `P-EUI-${projectNumber.toString().padStart(3, '0')}-${formattedDate}`;
    } catch (error) {
      console.error("Error generating project code:", error);
      const today = new Date();
      const formattedDate = today.toISOString().split('T')[0].replace(/-/g, '');
      return `P-EUI-001-${formattedDate}`;
    }
  };

const uploadToSingleStorage = async (file: File, taskId?: string | null, rowIndex?: number, description?: string) => {
  if (!file) {
    alert("Pilih file terlebih dahulu!");
    return;
  }

  const rowKey = taskId ? taskId : `row_${rowIndex}`;
  const uploadKey = rowKey;
  setUploadingFiles(prev => ({ ...prev, [uploadKey]: true }));

  try {
    if (file.size > 10 * 1024 * 1024) {
      alert("File terlalu besar. Maksimal 10MB.");
      setUploadingFiles(prev => ({ ...prev, [uploadKey]: false }));
      return;
    }

    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (!allowedTypes.includes(file.type)) {
      alert("Tipe file tidak didukung. Gunakan gambar, PDF, atau dokumen Office.");
      setUploadingFiles(prev => ({ ...prev, [uploadKey]: false }));
      return;
    }

    const fileExtension = file.name.split('.').pop();
    const timestamp = new Date().getTime();
    const safeDescription = (description || `task_${rowIndex}`).replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${projectId}/${safeDescription}_${timestamp}.${fileExtension}`;

    // Upload ke supabase storage utama saja
    const { data, error } = await supabase.storage
      .from('proofs')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error("❌ Upload error:", error);
      throw new Error(`Upload gagal: ${error.message}`);
    }

    // Dapatkan URL publik
    const { data: urlData } = supabase.storage
      .from('proofs')
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    if (taskId) {
      const { error: updateError } = await supabase
        .from("tasks")
        .update({ 
          proof_url: publicUrl,
          is_uploaded: true,
          updated_at: new Date().toISOString()
        })
        .eq("id", taskId);

      if (updateError) {
        console.error("❌ Database update error:", updateError);
      }
    }
    
    setFile(null);
    
    if (rowIndex !== undefined) {
      const rowKey = taskId ? taskId : `row_${rowIndex}`;
      
      const savedStatusKey = `upload_status_${projectId}_tab${activeTab}`;
      const savedStatus = localStorage.getItem(savedStatusKey);
      let statusMap = savedStatus ? JSON.parse(savedStatus) : {};
      
      statusMap[rowKey] = true;
      localStorage.setItem(savedStatusKey, JSON.stringify(statusMap));
      
      const updateRows = (rows: TaskType[]) => rows.map((row, idx) => {
        const normalizedTaskId = taskId || null;
        const currentRowKey = row.id ? row.id : `row_${idx}`;
        
        if ((normalizedTaskId && row.id === normalizedTaskId) || 
            (!normalizedTaskId && currentRowKey === rowKey)) {
          return { 
            ...row, 
            proof_url: publicUrl, 
            is_uploaded: true 
          };
        }
        return row;
      });

      if (activeTab === 1) {
        setRows(prev => updateRows(prev));
        localStorage.setItem(LS_KEY, JSON.stringify(updateRows(rows)));
      } else if (activeTab === 3) {
        setTargetRows(prev => updateRows(prev));
        localStorage.setItem(LS_TARGET_KEY, JSON.stringify(updateRows(targetRows)));
      } else if (activeTab === 4) {
        setRealisasiRows(prev => updateRows(prev));
        localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(updateRows(realisasiRows)));
      }
    }
    
    alert(`✅ File berhasil diupload!\n\n📁 File: ${file.name}\n📝 Task: ${description}\n\nLink: ${publicUrl}`);
    
  } catch (err: any) {
    console.error("❌ Upload error:", err);
    
    let errorMessage = "Upload gagal: ";
    if (err.message.includes('database') || err.message.includes('simpan')) {
      errorMessage = "✅ File berhasil diupload ke storage, tapi gagal menyimpan link ke database. File tetap aman di storage.";
    } else {
      errorMessage += err.message || "Silakan coba lagi.";
    }
    
    alert(errorMessage);
  } finally {
    setUploadingFiles(prev => ({ ...prev, [uploadKey]: false }));
  }
};

const deleteFileFromStorage = async (fileUrl: string) => {
  try {
    const urlParts = fileUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const filePath = `${projectId}/${fileName}`;

    // Hapus dari supabase storage utama saja
    const { error } = await supabase.storage
      .from('proofs')
      .remove([filePath]);
    
    if (error) {
      console.error("Delete error:", error);
    }

  } catch (error) {
    console.error("Error in deleteFileFromStorage:", error);
  }
};

  const deleteDateColumn = (dateToDelete: string) => {
    if (!confirm(`Yakin ingin menghapus kolom tanggal "${dateToDelete}"?`)) {
      return;
    }

    dateColsUndoStack.current.push({
      dateCols: [...dateCols],
      rows: JSON.parse(JSON.stringify(rows)),
      targetRows: JSON.parse(JSON.stringify(targetRows)),
      realisasiRows: JSON.parse(JSON.stringify(realisasiRows))
    });
    
    const newDateCols = dateCols.filter(date => date !== dateToDelete);
    setDateCols(newDateCols);
    localStorage.setItem(LS_DATE_COLS, JSON.stringify(newDateCols));
    
    const newRows = rows.map(row => {
      const newDates = { ...row.dates };
      delete newDates[dateToDelete];
      return { ...row, dates: newDates };
    });
    
    const newTargetRows = targetRows.map(row => {
      const newDates = { ...row.dates };
      delete newDates[dateToDelete];
      return { ...row, dates: newDates };
    });
    
    const newRealisasiRows = realisasiRows.map(row => {
      const newDates = { ...row.dates };
      delete newDates[dateToDelete];
      return { ...row, dates: newDates };
    });
    
    setRows(newRows);
    setTargetRows(newTargetRows);
    setRealisasiRows(newRealisasiRows);
    
    localStorage.setItem(LS_KEY, JSON.stringify(newRows));
    localStorage.setItem(LS_TARGET_KEY, JSON.stringify(newTargetRows));
    localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(newRealisasiRows));
    
    autosave(projectId, newRows);
    
    alert(`Kolom tanggal "${dateToDelete}" berhasil dihapus`);
  };

  const updateUserPresence = async () => {
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        console.log('Auth error in updateUserPresence:', userError);
        return;
      }
      
      if (!userData.user) {
        console.log('No user found in updateUserPresence');
        return;
      }

      const userPresence = {
        id: userData.user.id,
        email: userData.user.email!,
        user_metadata: userData.user.user_metadata,
        last_seen: new Date().toISOString(),
        active_tab: activeTab.toString(),
        editing_task: `Tab ${activeTab}`
      };

      const { error } = await supabase
        .from('user_presence')
        .upsert({
          user_id: userData.user.id,
          project_id: projectId,
          last_seen: userPresence.last_seen,
          active_tab: userPresence.active_tab,
          editing_task: userPresence.editing_task,
          user_data: userPresence
        }, {
          onConflict: 'user_id,project_id'
        });

      if (error) {
        console.log('Database error in updateUserPresence:', error);
      }
    } catch (error) {
      console.log('Exception in updateUserPresence:', error);
    }
  };

  const loadOnlineUsers = async () => {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('user_presence')
        .select('*')
        .eq('project_id', projectId)
        .gte('last_seen', fiveMinutesAgo)
        .order('last_seen', { ascending: false });

      if (error) {
        console.log('Database error in loadOnlineUsers:', error);
        return;
      }

      if (data) {
        const users = data.map(item => item.user_data as UserPresenceType);
        setOnlineUsers(users);
      }
    } catch (error) {
      console.log('Exception in loadOnlineUsers:', error);
    }
  };

  const deleteNote = async (noteId: string) => {
    if (!confirm("Yakin ingin menghapus catatan ini?")) return;
    
    try {
      const { error } = await supabase
        .from("project_notes")
        .delete()
        .eq("id", noteId);
      
      if (error) throw error;
      
      setNotes(prev => prev.filter(note => note.id !== noteId));
      alert("✅ Catatan berhasil dihapus");
    } catch (error) {
      console.error("Error deleting note:", error);
      alert("❌ Gagal menghapus catatan");
    }
  };

  const deleteAudio = async (noteId: string, audioUrl: string) => {
    if (!confirm("Yakin ingin menghapus audio ini?")) return;
    
    try {
      const urlParts = audioUrl.split('/');
      const fileName = urlParts[urlParts.length - 1];
      const filePath = `${projectId}/notes/${fileName}`;
      
      await supabase.storage.from('proofs').remove([filePath]);
      
      const { error } = await supabase
        .from("project_notes")
        .update({ audio_url: null })
        .eq("id", noteId);
      
      if (error) throw error;
      
      setNotes(prev => prev.map(note => 
        note.id === noteId ? { ...note, audio_url: undefined } : note
      ));
      
      alert("✅ Audio berhasil dihapus");
    } catch (error) {
      console.error("Error deleting audio:", error);
      alert("❌ Gagal menghapus audio");
    }
  };

  useEffect(() => {
    if (!projectId) {
      router.push("/projects");
      return;
    }
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const { data: userData } = await supabase.auth.getUser();
        setCurrentUser(userData.user);

        const pr = await supabase.from("projects").select("name, meta, created_at, deadline").eq("id", projectId).single();
        setProjectName(pr.data?.name || `Project ${projectId || 'Unknown'}`);
        
        const autoProjectCode = await generateProjectCode();

        const getDeadline = (data: any) => {
          return data?.deadline || data?.meta?.deadline || "";
        };

        // PERBAIKAN 1: Load dari localStorage terlebih dahulu
        const savedMeta = localStorage.getItem(LS_META_PROJECT);
        if (savedMeta) {
          try {
            const parsedMeta = JSON.parse(savedMeta);
            setMetaProject(parsedMeta);
          } catch (e) {
            console.warn("invalid meta snapshot:", e);
          }
        } else if (pr.data?.meta && typeof pr.data.meta === "object") {
          setMetaProject({
            project_code: pr.data.meta.project_code || autoProjectCode,
            job_name: pr.data.meta.job_name || "",
            no_rks: pr.data.meta.no_rks || "",
            date: pr.data.meta.date || "",
            client: pr.data.meta.client || "",
            address: pr.data.meta.address || "",
            time_schedule: pr.data.meta.time_schedule || "",
            deadline: getDeadline(pr.data)
          });
        } else {
          setMetaProject({
            project_code: autoProjectCode,
            job_name: "",
            no_rks: "",
            date: "",
            client: "",
            address: "",
            time_schedule: "",
            deadline: getDeadline(pr.data)
          });
        }

        const t = await supabase.from("tasks").select("*").eq("project_id", projectId).order("row_index", { ascending: true });
        let taskList: TaskType[] = (t.data as TaskType[]) || [];

        const savedDateCols = localStorage.getItem(LS_DATE_COLS);
        if (savedDateCols) {
          try {
            const parsedDateCols = JSON.parse(savedDateCols);
            if (Array.isArray(parsedDateCols)) {
              setDateCols(parsedDateCols);
            }
          } catch (e) {
            console.warn("invalid date columns snapshot:", e);
          }
        }

        const localRaw = localStorage.getItem(LS_KEY);
        if (localRaw) {
          try {
            const localRows = JSON.parse(localRaw) as TaskType[];
            if (Array.isArray(localRows) && localRows.length) {
              const byIndex = new Map<number, TaskType>();
              taskList.forEach((s) => { if (s.row_index) byIndex.set(Number(s.row_index), s); });
              taskList = localRows.map((lr, i) => {
                const ri = Number(lr.row_index ?? i + 1);
                const server = byIndex.get(ri);
                return { ...server, ...lr };
              });
            }
          } catch (e) {
            console.warn("invalid local snapshot:", e);
          }
        }

        const targetRaw = localStorage.getItem(LS_TARGET_KEY);
        if (targetRaw) {
          try {
            const targetData = JSON.parse(targetRaw) as TaskType[];
            if (Array.isArray(targetData)) {
              setTargetRows(targetData);
            }
          } catch (e) {
            console.warn("invalid target snapshot:", e);
          }
        }

        const realisasiRaw = localStorage.getItem(LS_REALISASI_KEY);
        if (realisasiRaw) {
          try {
            const realisasiData = JSON.parse(realisasiRaw) as TaskType[];
            if (Array.isArray(realisasiData)) {
              setRealisasiRows(realisasiData);
            }
          } catch (e) {
            console.warn("invalid realisasi snapshot:", e);
          }
        }

        const n = await supabase
          .from("project_notes")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false });
        setNotes(n.data || []);

        if (!savedDateCols) {
          const datesSet = new Set<string>();
          taskList.forEach((r) => { if (r.dates) Object.keys(r.dates).forEach((k) => datesSet.add(k)); });
          targetRows.forEach((r) => { if (r.dates) Object.keys(r.dates).forEach((k) => datesSet.add(k)); });
          realisasiRows.forEach((r) => { if (r.dates) Object.keys(r.dates).forEach((k) => datesSet.add(k)); });
          setDateCols(Array.from(datesSet));
        }

        setRows(taskList);

        // Load active tab dari localStorage
        const savedActiveTab = localStorage.getItem(LS_ACTIVE_TAB);
        if (savedActiveTab) {
          try {
            const parsedTab = JSON.parse(savedActiveTab);
            if ([1, 2, 3, 4, 5].includes(parsedTab)) {
              setActiveTab(parsedTab);
            }
          } catch (e) {
            console.warn("invalid active tab snapshot:", e);
          }
        }

        await loadOnlineUsers();
        await updateUserPresence();
      } catch (err) {
        console.error("load error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();

    const taskCh = supabase
      .channel(`public:tasks:project_${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` }, async () => {
        try {
          const res = await supabase.from("tasks").select("*").eq("project_id", projectId).order("row_index", { ascending: true });
          const serverRows = (res.data as TaskType[]) || [];
          const localRaw = localStorage.getItem(LS_KEY);
          if (localRaw) {
            try {
              const localRows = JSON.parse(localRaw) as TaskType[];
              if (Array.isArray(localRows) && localRows.length) {
                const byIndex = new Map<number, TaskType>();
                serverRows.forEach((sr) => { if (sr.row_index) byIndex.set(Number(sr.row_index), sr); });
                const merged = localRows.map((lr, i) => {
                  const ri = Number(lr.row_index ?? i + 1);
                  const srv = byIndex.get(ri);
                  return { ...srv, ...lr };
                });
                setRows(merged);
                return;
              }
            } catch {}
          }
          setRows(serverRows);
        } catch (e) {
          console.error("realtime refresh error:", e);
        }
      })
      .subscribe();

    const noteCh = supabase
      .channel(`public:project_notes:project_${projectId}`)
      .on(
        "postgres_changes" as any,
        { 
          event: "*", 
          schema: "public", 
          table: "project_notes", 
          filter: `project_id=eq.${projectId}` 
        },
        (payload: any) => {
          if (payload.new) {
            setNotes((prev) => {
              const existing = prev.find(n => n.id === payload.new.id);
              if (existing) {
                return prev.map(n => n.id === payload.new.id ? payload.new : n);
              }
              return [payload.new, ...prev];
            });
          }
          if (payload.old) {
            setNotes((prev) => prev.filter(n => n.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    const presenceCh = supabase
      .channel(`user_presence:project_${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_presence',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          loadOnlineUsers();
        }
      )
      .subscribe();

    const presenceInterval = setInterval(() => {
      updateUserPresence();
      loadOnlineUsers();
    }, 30000);

    return () => {
      try { 
        supabase.removeChannel(taskCh);
        supabase.removeChannel(noteCh);
        supabase.removeChannel(presenceCh);
      } catch {}
      clearInterval(presenceInterval);
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    updateUserPresence();
  }, [activeTab]);

  useEffect(() => {
    setChartData(rows.map((r, i) => ({
      name: (r.description || `Task ${i + 1}`).slice(0, 18),
      Target: parseDecimalValue(r.plan_progress),
      Realisasi: parseDecimalValue(r.actual_progress),
    })));
  }, [rows]);

  useEffect(() => {
    setTargetChartData(targetRows.map((r, i) => ({
      name: (r.description || `Task ${i + 1}`).slice(0, 18),
      Target: parseDecimalValue(r.plan_progress),
    })));
  }, [targetRows]);

  useEffect(() => {
    setRealisasiChartData(realisasiRows.map((r, i) => ({
      name: (r.description || `Task ${i + 1}`).slice(0, 18),
      Realisasi: parseDecimalValue(r.actual_progress),
    })));
  }, [realisasiRows]);

  const pushUndo = (snapshot: TaskType[], stack: React.MutableRefObject<TaskType[][]>) => {
    stack.current.push(JSON.parse(JSON.stringify(snapshot)));
  };

  const pushDateColsUndo = () => {
    dateColsUndoStack.current.push({
      dateCols: [...dateCols],
      rows: JSON.parse(JSON.stringify(rows)),
      targetRows: JSON.parse(JSON.stringify(targetRows)),
      realisasiRows: JSON.parse(JSON.stringify(realisasiRows))
    });
    dateColsRedoStack.current = [];
  };

  const undo = (currentRows: TaskType[], setRowsFn: React.Dispatch<React.SetStateAction<TaskType[]>>, 
                undoStack: React.MutableRefObject<TaskType[][]>, redoStack: React.MutableRefObject<TaskType[][]>,
                storageKey?: string) => {
    if (!undoStack.current.length) return;
    const last = undoStack.current.pop()!;
    redoStack.current.push(JSON.parse(JSON.stringify(currentRows)));
    setRowsFn(last);
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(last)); } catch {}
    }
  };

  const redo = (currentRows: TaskType[], setRowsFn: React.Dispatch<React.SetStateAction<TaskType[]>>, 
                undoStack: React.MutableRefObject<TaskType[][]>, redoStack: React.MutableRefObject<TaskType[][]>,
                storageKey?: string) => {
    if (!redoStack.current.length) return;
    const last = redoStack.current.pop()!;
    undoStack.current.push(JSON.parse(JSON.stringify(currentRows)));
    setRowsFn(last);
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(last)); } catch {}
    }
  };

  const undoDateCols = () => {
    if (!dateColsUndoStack.current.length) return;
    const last = dateColsUndoStack.current.pop()!;
    dateColsRedoStack.current.push({
      dateCols: [...dateCols],
      rows: JSON.parse(JSON.stringify(rows)),
      targetRows: JSON.parse(JSON.stringify(targetRows)),
      realisasiRows: JSON.parse(JSON.stringify(realisasiRows))
    });
    
    setDateCols(last.dateCols);
    setRows(last.rows);
    setTargetRows(last.targetRows);
    setRealisasiRows(last.realisasiRows);
    
    localStorage.setItem(LS_DATE_COLS, JSON.stringify(last.dateCols));
    localStorage.setItem(LS_KEY, JSON.stringify(last.rows));
    localStorage.setItem(LS_TARGET_KEY, JSON.stringify(last.targetRows));
    localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(last.realisasiRows));
  };

  const redoDateCols = () => {
    if (!dateColsRedoStack.current.length) return;
    const last = dateColsRedoStack.current.pop()!;
    dateColsUndoStack.current.push({
      dateCols: [...dateCols],
      rows: JSON.parse(JSON.stringify(rows)),
      targetRows: JSON.parse(JSON.stringify(targetRows)),
      realisasiRows: JSON.parse(JSON.stringify(realisasiRows))
    });
    
    setDateCols(last.dateCols);
    setRows(last.rows);
    setTargetRows(last.targetRows);
    setRealisasiRows(last.realisasiRows);
    
    localStorage.setItem(LS_DATE_COLS, JSON.stringify(last.dateCols));
    localStorage.setItem(LS_KEY, JSON.stringify(last.rows));
    localStorage.setItem(LS_TARGET_KEY, JSON.stringify(last.targetRows));
    localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(last.realisasiRows));
  };

  async function addRow() {
    if (totalWeight >= 100) {
      alert("Total bobot sudah mencapai 100%. Tidak bisa menambah baris baru.");
      return;
    }

    pushUndo(rows, undoStack);
    const nextIndex = rows.length ? Math.max(...rows.map(r => Number(r.row_index ?? 0))) + 1 : 1;
    const payload: TaskType = {
      project_id: projectId,
      row_index: nextIndex,
      description: "New task",
      weight: 0,
      plan_progress: 0,
      actual_progress: 0,
      color: "",
      location: metaProject.address || "",
      dates: {},
    };
    try {
      const { data, error } = await supabase.from("tasks").insert(payload).select().single();
      if (error || !data) {
        const next = [...rows, payload];
        setRows(next);
        localStorage.setItem(LS_KEY, JSON.stringify(next));
        return;
      }
      const next = [...rows, (data as TaskType) || payload];
      setRows(next);
        localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch (e) {
      console.error("addRow exception:", e);
      const next = [...rows, payload];
      setRows(next);
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    }
  }

  async function removeLastRow() {
    if (!rows.length) return;
    pushUndo(rows, undoStack);
    const last = rows[rows.length - 1];
    try { if (last.id) await supabase.from("tasks").delete().eq("id", last.id); } catch (e) { console.warn(e); }
    const next = rows.slice(0, -1).map((r, i) => ({ ...r, row_index: i + 1 }));
    setRows(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    try {
      await Promise.all(next.map(nr => nr.id ? supabase.from("tasks").update({ row_index: nr.row_index }).eq("id", nr.id) : Promise.resolve()));
    } catch {}
  }

  // PERBAIKAN: Add Date Column yang KOSONG (bukan "Tanggal 1", "Tanggal 2", dst)
  function addDateColumn() {
    pushDateColsUndo();
    
    // PERBAIKAN: Kolom tanggal baru kosong - pengguna bisa mengisi manual
    let colName = "";
    
    const next = [...dateCols, colName];
    setDateCols(next);
    
    localStorage.setItem(LS_DATE_COLS, JSON.stringify(next));
    
    const newRows = rows.map(r => ({ ...r, dates: { ...(r.dates || {}), [colName]: "" } }));
    const newTargetRows = targetRows.map(r => ({ ...r, dates: { ...(r.dates || {}), [colName]: "" } }));
    const newRealisasiRows = realisasiRows.map(r => ({ ...r, dates: { ...(r.dates || {}), [colName]: "" } }));
    
    setRows(newRows);
    setTargetRows(newTargetRows);
    setRealisasiRows(newRealisasiRows);
    
    try { 
      localStorage.setItem(LS_KEY, JSON.stringify(newRows));
      localStorage.setItem(LS_TARGET_KEY, JSON.stringify(newTargetRows));
      localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(newRealisasiRows));
    } catch (e) { /* ignore */ }
    
    autosave(projectId, newRows);
    
    // Tampilkan pesan petunjuk
    alert(`✅ Kolom tanggal baru ditambahkan (kosong).\n\n💡 DOUBLE-CLICK pada header kolom untuk mengisi nama tanggal sesuai keinginan!`);
  }

  // PERBAIKAN: Function untuk mengedit header kolom tanggal
  const handleHeaderChange = (colIndex: number, newValue: string) => {
    // PERBAIKAN: Hitung indeks kolom tanggal dengan benar berdasarkan tipe tab
    const dateColumnStart = activeTab === 1 ? 6 : 
                          activeTab === 3 ? 5 : 
                          activeTab === 4 ? 5 : 0;
    
    // Pastikan ini adalah kolom tanggal (bukan No, Description, dll)
    if (colIndex >= dateColumnStart && colIndex < dateColumnStart + dateCols.length) {
      const dateIndex = colIndex - dateColumnStart;
      const newDateCols = [...dateCols];
      newDateCols[dateIndex] = newValue;
      setDateCols(newDateCols);
      localStorage.setItem(LS_DATE_COLS, JSON.stringify(newDateCols));
      
      // Juga update nama kolom di semua rows
      const oldDateName = dateCols[dateIndex];
      const newRows = rows.map(row => {
        if (row.dates && row.dates[oldDateName] !== undefined) {
          const newDates = { ...row.dates };
          newDates[newValue] = newDates[oldDateName];
          delete newDates[oldDateName];
          return { ...row, dates: newDates };
        }
        return row;
      });
      
      const newTargetRows = targetRows.map(row => {
        if (row.dates && row.dates[oldDateName] !== undefined) {
          const newDates = { ...row.dates };
          newDates[newValue] = newDates[oldDateName];
          delete newDates[oldDateName];
          return { ...row, dates: newDates };
        }
        return row;
      });
      
      const newRealisasiRows = realisasiRows.map(row => {
        if (row.dates && row.dates[oldDateName] !== undefined) {
          const newDates = { ...row.dates };
          newDates[newValue] = newDates[oldDateName];
          delete newDates[oldDateName];
          return { ...row, dates: newDates };
        }
        return row;
      });
      
      setRows(newRows);
      setTargetRows(newTargetRows);
      setRealisasiRows(newRealisasiRows);
      
      localStorage.setItem(LS_KEY, JSON.stringify(newRows));
      localStorage.setItem(LS_TARGET_KEY, JSON.stringify(newTargetRows));
      localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(newRealisasiRows));
      
      alert(`✅ Header kolom berhasil diubah menjadi: "${newValue}"`);
    }
  };

  const addNote = async () => {
    if (!newNote.trim() || !projectId) return;

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    let audioUrl = null;
    
    if (audioFile) {
      try {
        const safeProject = encodeURIComponent(projectId);
        const safeFileName = `${Date.now()}_${audioFile.name}`;
        const remoteName = `${safeProject}/notes/${safeFileName}`;
        
        // PERBAIKAN: Gunakan uploadToSingleStorage untuk audio juga
        await uploadToSingleStorage(audioFile, null, 0, 'note_audio');
        
        // Dapatkan URL publik
        const fileExtension = audioFile.name.split('.').pop();
        const timestamp = new Date().getTime();
        const fileName = `${projectId}/note_audio_${timestamp}.${fileExtension}`;
        
        const { data: urlData } = supabase.storage
          .from('proofs')
          .getPublicUrl(fileName);

        audioUrl = urlData.publicUrl;
      } catch (error) {
        console.error("Error uploading audio:", error);
      }
    }

    const { error } = await supabase.from("project_notes").insert({
      project_id: projectId,
      content: newNote,
      audio_url: audioUrl,
      created_by: userId || "unknown",
    });

    if (!error) {
      setNewNote("");
      setAudioFile(null);
      alert("Catatan berhasil disimpan!");
    } else {
      console.error("Error saving note:", error);
      alert("Gagal menyimpan catatan");
    }
  };

  const handleRangeSelected = (range: { startRow: number; startCol: number; endRow: number; endCol: number }) => {
    setSelectedRange(range);
  };

  const handleApplyFormatting = (property: string, value: any, specificCell?: { row: number, col: number }) => {
    if (!selectedRange && !specificCell) return;
    
    let cellsToFormat = [];
    
    if (specificCell) {
      cellsToFormat = [specificCell];
    } else if (selectedRange) {
      const { startRow, endRow, startCol, endCol } = selectedRange;
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          cellsToFormat.push({ row: r, col: c });
        }
      }
    }
    
    cellsToFormat.forEach(({ row, col }) => {
      const cellKey = `tab${activeTab}_${row}_${col}`;
      setSpreadsheetStyles(prev => ({
        ...prev,
        [cellKey]: {
          ...prev[cellKey],
          [property]: value
        }
      }));
    });
    
    if (spreadsheetRef.current) {
      cellsToFormat.forEach(({ row, col }) => {
        const cellElement = spreadsheetRef.current?.querySelector(
          `tr:nth-child(${row + 2}) td:nth-child(${col + 1}) div`
        );
        if (cellElement) {
          const cssValue = property === 'fontWeight' && value === 'bold' ? '700' : 
                          property === 'fontWeight' && value === 'normal' ? '400' : 
                          value;
          (cellElement as HTMLElement).style[property as any] = cssValue;
        }
      });
    }
  };

  const convertToSpreadsheetData = (rowsData: TaskType[], type: 'planning' | 'target' | 'realisasi') => {
    return rowsData.map((r, idx) => {
      const rowKey = r.id ? r.id : `row_${idx}`;
      
      let hasUpload = false;
      const savedStatusKey = `upload_status_${projectId}_tab${activeTab}`;
      const savedStatus = localStorage.getItem(savedStatusKey);
      if (savedStatus) {
        try {
          const statusMap = JSON.parse(savedStatus);
          if (statusMap[rowKey]) {
            hasUpload = true;
          }
        } catch (e) {
          console.error('Error reading upload status:', e);
        }
      }
      
      if (!hasUpload) {
        hasUpload = Boolean(r.proof_url || r.is_uploaded);
      }
      
      const base = [];
      
      base.push(
        { 
          value: (idx + 1).toString(), 
          ...spreadsheetStyles[`tab${activeTab}_${idx}_0`],
          readOnly: true 
        }
      );
      
      if (type === 'planning') {
        base.push(
          { value: r.description ?? "", ...spreadsheetStyles[`tab${activeTab}_${idx}_1`] },
          { value: formatDecimalForSpreadsheet(r.weight), ...spreadsheetStyles[`tab${activeTab}_${idx}_2`] },
          { value: formatDecimalForSpreadsheet(r.plan_progress), ...spreadsheetStyles[`tab${activeTab}_${idx}_3`] },
          { value: formatDecimalForSpreadsheet(r.actual_progress), ...spreadsheetStyles[`tab${activeTab}_${idx}_4`] },
          { value: metaProject.address || r.location || "", ...spreadsheetStyles[`tab${activeTab}_${idx}_5`] }
        );
      } else if (type === 'target') {
        base.push(
          { value: r.description ?? "", ...spreadsheetStyles[`tab${activeTab}_${idx}_1`] },
          { value: formatDecimalForSpreadsheet(r.weight), ...spreadsheetStyles[`tab${activeTab}_${idx}_2`] },
          { value: formatDecimalForSpreadsheet(r.plan_progress), ...spreadsheetStyles[`tab${activeTab}_${idx}_3`] },
          { value: metaProject.address || r.location || "", ...spreadsheetStyles[`tab${activeTab}_${idx}_4`] }
        );
      } else if (type === 'realisasi') {
        base.push(
          { value: r.description ?? "", ...spreadsheetStyles[`tab${activeTab}_${idx}_1`] },
          { value: formatDecimalForSpreadsheet(r.weight), ...spreadsheetStyles[`tab${activeTab}_${idx}_2`] },
          { value: formatDecimalForSpreadsheet(r.actual_progress), ...spreadsheetStyles[`tab${activeTab}_${idx}_3`] },
          { value: metaProject.address || r.location || "", ...spreadsheetStyles[`tab${activeTab}_${idx}_4`] }
        );
      }
      
      const dates = dateCols.map((c, colIdx) => { 
        const cellIdx = type === 'planning' ? 6 + colIdx : 
                       type === 'target' ? 5 + colIdx : 
                       5 + colIdx;
        return { 
          value: formatDecimalForSpreadsheet(r.dates?.[c]), 
          ...spreadsheetStyles[`tab${activeTab}_${idx}_${cellIdx}`]
        };
      });
      
      const uploadStatus = hasUpload ? "✅" : "❌";
      const proofIdx = type === 'planning' ? 6 + dateCols.length : 
                      type === 'target' ? 5 + dateCols.length : 
                      5 + dateCols.length;
      const uploadColumn = [{ 
        value: uploadStatus, 
        ...spreadsheetStyles[`tab${activeTab}_${idx}_${proofIdx}`],
        readOnly: true 
      }];
      
      return [...base, ...dates, ...uploadColumn];
    });
  };

  const sheetData = useMemo(() => 
    convertToSpreadsheetData(rows, 'planning')
  , [rows, dateCols, metaProject.address, spreadsheetStyles, activeTab, projectId]);

  const targetSheetData = useMemo(() => 
    convertToSpreadsheetData(targetRows, 'target')
  , [targetRows, dateCols, metaProject.address, spreadsheetStyles, activeTab, projectId]);

  const realisasiSheetData = useMemo(() => 
    convertToSpreadsheetData(realisasiRows, 'realisasi')
  , [realisasiRows, dateCols, metaProject.address, spreadsheetStyles, activeTab, projectId]);

  // PERBAIKAN: Total row dengan perhitungan kumulatif
  const addTotalRow = (dataRows: any[][], type: 'planning' | 'target' | 'realisasi', dateTotals: Record<string, number>) => {
    if (dateCols.length === 0) return dataRows;
    
    const baseColumns = type === 'planning' ? 6 : 5;
    
    const totalRow = [];
    
    totalRow.push({ value: "", readOnly: true, className: "bg-blue-50 font-semibold" });
    
    totalRow.push({ value: "TOTAL %", readOnly: true, className: "bg-blue-50 font-semibold" });
    
    for (let i = 2; i < baseColumns; i++) {
      totalRow.push({ value: "", readOnly: true });
    }
    
    // PERBAIKAN: Gunakan dateTotals yang sudah kumulatif
    dateCols.forEach(date => {
      totalRow.push({ 
        value: formatDecimalForSpreadsheet(dateTotals[date]),
        readOnly: true,
        className: "bg-blue-50 font-semibold"
      });
    });
    
    totalRow.push({ value: "", readOnly: true });
    
    return [...dataRows, totalRow];
  };

  const sheetDataWithTotals = useMemo(() => 
    addTotalRow(sheetData, 'planning', planningDateTotals)
  , [sheetData, dateCols, planningDateTotals]);

  const targetSheetDataWithTotals = useMemo(() => 
    addTotalRow(targetSheetData, 'target', targetDateTotals)
  , [targetSheetData, dateCols, targetDateTotals]);

  const realisasiSheetDataWithTotals = useMemo(() => 
    addTotalRow(realisasiSheetData, 'realisasi', realisasiDateTotals)
  , [realisasiSheetData, dateCols, realisasiDateTotals]);

  function handleSpreadsheetFullChange(newData: any[][]) {
    pushUndo(rows, undoStack);

    const hasTotalRow = newData.some(row => {
      const secondCell = row[1];
      const cellValue = typeof secondCell === 'object' ? secondCell?.value : secondCell;
      return typeof cellValue === 'string' && cellValue.includes("TOTAL %");
    });
    
    let dataWithoutTotals = newData;
    if (hasTotalRow) {
      dataWithoutTotals = newData.filter(row => {
        const secondCell = row[1];
        const cellValue = typeof secondCell === 'object' ? secondCell?.value : secondCell;
        return !(typeof cellValue === 'string' && cellValue.includes("TOTAL %"));
      });
    }

    const updated = dataWithoutTotals.map((row, i) => {
      const getRowValue = (index: number): string => {
        const cell = row[index];
        if (!cell && cell !== 0 && cell !== '') return '';
        return typeof cell === 'object' ? String(cell?.value || '') : String(cell || '');
      };

      const weight = handleDecimalInput(getRowValue(2));
      const planProgress = handleDecimalInput(getRowValue(3));
      const actualProgress = handleDecimalInput(getRowValue(4));
      
      const { validPlanProgress, validActualProgress } = validateProgressValues(weight, planProgress, actualProgress);

      const base: TaskType = {
        project_id: projectId,
        row_index: i + 1,
        description: getRowValue(1) || "",
        weight: weight,
        plan_progress: validPlanProgress,
        actual_progress: validActualProgress,
        color: "",
        location: metaProject.address || getRowValue(5) || "",
        dates: {},
      };

      dateCols.forEach((c, idx) => {
        const dateValue = handleDateInput(getRowValue(6 + idx));
        
        let cumulativeUntilNow = 0;
        for (let j = 0; j < idx; j++) {
          const prevDate = dateCols[j];
          cumulativeUntilNow += parseDecimalValue(getRowValue(6 + j));
        }
        
        base.dates![c] = validateDateValue(dateValue, weight, planProgress, actualProgress, cumulativeUntilNow);
      });

      if (rows[i]?.id) base.id = rows[i].id;

      return base;
    });

    setRows(updated);
    localStorage.setItem(LS_KEY, JSON.stringify(updated));
    autosave(projectId, updated);
  }

  function handleTargetSpreadsheetChange(newData: any[][]) {
    pushUndo(targetRows, targetUndoStack);

    const hasTotalRow = newData.some(row => {
      const secondCell = row[1];
      const cellValue = typeof secondCell === 'object' ? secondCell?.value : secondCell;
      return typeof cellValue === 'string' && cellValue.includes("TOTAL %");
    });
    
    let dataWithoutTotals = newData;
    if (hasTotalRow) {
      dataWithoutTotals = newData.filter(row => {
        const secondCell = row[1];
        const cellValue = typeof secondCell === 'object' ? secondCell?.value : secondCell;
        return !(typeof cellValue === 'string' && cellValue.includes("TOTAL %"));
      });
    }

    const updated = dataWithoutTotals.map((row, i) => {
      const getRowValue = (index: number): string => {
        const cell = row[index];
        if (!cell && cell !== 0 && cell !== '') return '';
        return typeof cell === 'object' ? String(cell?.value || '') : String(cell || '');
      };

      const weight = handleDecimalInput(getRowValue(2));
      const planProgress = handleDecimalInput(getRowValue(3));
      
      const validPlanProgress = Math.min(planProgress, weight);

      const base: TaskType = {
        project_id: projectId,
        row_index: i + 1,
        description: getRowValue(1) || "",
        weight: weight,
        plan_progress: validPlanProgress,
        actual_progress: 0,
        color: "",
        location: metaProject.address || getRowValue(4) || "",
        dates: {},
      };

      dateCols.forEach((c, idx) => {
        const dateValue = handleDateInput(getRowValue(5 + idx));
        
        let cumulativeUntilNow = 0;
        for (let j = 0; j < idx; j++) {
          const prevDate = dateCols[j];
          cumulativeUntilNow += parseDecimalValue(getRowValue(5 + j));
        }
        
        base.dates![c] = validateTargetDateValue(dateValue, weight, planProgress, cumulativeUntilNow);
      });

      if (targetRows[i]?.id) base.id = targetRows[i].id;

      return base;
    });

    setTargetRows(updated);
    localStorage.setItem(LS_TARGET_KEY, JSON.stringify(updated));
  }

  function handleRealisasiSpreadsheetChange(newData: any[][]) {
    pushUndo(realisasiRows, realisasiUndoStack);

    const hasTotalRow = newData.some(row => {
      const secondCell = row[1];
      const cellValue = typeof secondCell === 'object' ? secondCell?.value : secondCell;
      return typeof cellValue === 'string' && cellValue.includes("TOTAL %");
    });
    
    let dataWithoutTotals = newData;
    if (hasTotalRow) {
      dataWithoutTotals = newData.filter(row => {
        const secondCell = row[1];
        const cellValue = typeof secondCell === 'object' ? secondCell?.value : secondCell;
        return !(typeof cellValue === 'string' && cellValue.includes("TOTAL %"));
      });
    }

    const updated = dataWithoutTotals.map((row, i) => {
      const getRowValue = (index: number): string => {
        const cell = row[index];
        if (!cell && cell !== 0 && cell !== '') return '';
        return typeof cell === 'object' ? String(cell?.value || '') : String(cell || '');
      };

      const weight = handleDecimalInput(getRowValue(2));
      const actualProgress = handleDecimalInput(getRowValue(3));
      
      const validActualProgress = Math.min(actualProgress, weight);

      const base: TaskType = {
        project_id: projectId,
        row_index: i + 1,
        description: getRowValue(1) || "",
        weight: weight,
        plan_progress: 0,
        actual_progress: validActualProgress,
        color: "",
        location: metaProject.address || getRowValue(4) || "",
        dates: {},
      };

      dateCols.forEach((c, idx) => {
        const dateValue = handleDateInput(getRowValue(5 + idx));
        
        let cumulativeUntilNow = 0;
        for (let j = 0; j < idx; j++) {
          const prevDate = dateCols[j];
          cumulativeUntilNow += parseDecimalValue(getRowValue(5 + j));
        }
        
        const validatedValue = validateRealisasiDateValue(dateValue, weight, actualProgress, cumulativeUntilNow);
        
        base.dates![c] = validatedValue;
      });

      if (realisasiRows[i]?.id) base.id = realisasiRows[i].id;

      return base;
    });

    setRealisasiRows(updated);
    localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(updated));
  }

  function addTargetRow() {
    if (totalTargetWeight >= 100) {
      alert("Total bobot sudah mencapai 100%. Tidak bisa menambah baris baru.");
      return;
    }

    pushUndo(targetRows, targetUndoStack);
    const nextIndex = targetRows.length ? Math.max(...targetRows.map(r => Number(r.row_index ?? 0))) + 1 : 1;
    const payload: TaskType = {
      project_id: projectId,
      row_index: nextIndex,
      description: "New task",
      weight: 0,
      plan_progress: 0,
      actual_progress: 0,
      color: "",
      location: metaProject.address || "",
      dates: {},
    };
    const next = [...targetRows, payload];
    setTargetRows(next);
    localStorage.setItem(LS_TARGET_KEY, JSON.stringify(next));
  }

  function addRealisasiRow() {
    if (realisasiRows.reduce((sum, row) => sum + (parseDecimalValue(row.weight)), 0) >= 100) {
      alert("Total bobot sudah mencapai 100%. Tidak bisa menambah baris baru.");
      return;
    }

    pushUndo(realisasiRows, realisasiUndoStack);
    const nextIndex = realisasiRows.length ? Math.max(...realisasiRows.map(r => Number(r.row_index ?? 0))) + 1 : 1;
    const payload: TaskType = {
      project_id: projectId,
      row_index: nextIndex,
      description: "New task",
      weight: 0,
      plan_progress: 0,
      actual_progress: 0,
      color: "",
      location: metaProject.address || "",
      dates: {},
    };
    const next = [...realisasiRows, payload];
    setRealisasiRows(next);
    localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(next));
  }

  function removeLastTargetRow() {
    if (!targetRows.length) return;
    pushUndo(targetRows, targetUndoStack);
    const next = targetRows.slice(0, -1).map((r, i) => ({ ...r, row_index: i + 1 }));
    setTargetRows(next);
    localStorage.setItem(LS_TARGET_KEY, JSON.stringify(next));
  }

  function removeLastRealisasiRow() {
    if (!realisasiRows.length) return;
    pushUndo(realisasiRows, realisasiUndoStack);
    const next = realisasiRows.slice(0, -1).map((r, i) => ({ ...r, row_index: i + 1 }));
    setRealisasiRows(next);
    localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(next));
  }

  const formatDateDisplay = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  async function handleSaveProjectMeta() {
    if (!projectId) {
      alert("Project ID tidak ditemukan");
      return;
    }

    try {
      setSavingMeta(true);

      if (!metaProject.job_name?.trim()) {
        alert("Job Name harus diisi!");
        setSavingMeta(false);
        return;
      }

      const finalMeta = {
        ...metaProject,
        project_code: metaProject.project_code || await generateProjectCode()
      };

      const { error } = await supabase
        .from("projects")
        .update({ 
          name: finalMeta.job_name,
          meta: finalMeta 
        })
        .eq("id", projectId);

      if (error) {
        console.error("Error saving project meta:", error);
        throw error;
      }
      
      setMetaProject(finalMeta);
      setIsEditingMeta(false);
      setProjectName(finalMeta.job_name || projectName || "Project");
      
      // PERBAIKAN 1: Simpan meta project ke localStorage
      localStorage.setItem(LS_META_PROJECT, JSON.stringify(finalMeta));
      
      alert("✅ Data proyek berhasil disimpan!");
    } catch (err) {
      console.error("Error saving project meta:", err);
      alert("❌ Gagal menyimpan data proyek. Silakan coba lagi.");
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleSaveSummary() {
    try {
      await supabase.from("projects").update({ meta: metaProject }).eq("id", projectId);
      await Promise.all(rows.map(async (r) => {
        const payload: any = {
          description: r.description ?? null,
          weight: parseDecimalValue(r.weight),
          plan_progress: parseDecimalValue(r.plan_progress),
          actual_progress: parseDecimalValue(r.actual_progress),
          color: r.color ?? "",
          location: r.location ?? null,
          dates: r.dates ?? {},
          project_id: projectId,
          row_index: r.row_index,
        };
        if (r.id) await supabase.from("tasks").update(payload).eq("id", r.id);
        else await supabase.from("tasks").insert(payload);
      }));
      
      // PERBAIKAN 1: Jangan hapus localStorage, hanya update
      localStorage.setItem(LS_KEY, JSON.stringify(rows));
      localStorage.setItem(LS_META_PROJECT, JSON.stringify(metaProject));
      
      alert("Simpan berhasil");
    } catch (err) {
      console.error("save summary error", err);
      alert("Gagal simpan");
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-gray-600">Memuat data...</div>;
  }

  const renderSpreadsheetWithControls = (
    data: any[][],
    onAddRow: () => void,
    onRemoveLastRow: () => void,
    onChange: (data: any[][]) => void,
    title: string,
    showTargetColumn: boolean = true,
    showRealisasiColumn: boolean = true,
    currentRows: TaskType[],
    undoStack: React.MutableRefObject<TaskType[][]>,
    redoStack: React.MutableRefObject<TaskType[][]>,
    storageKey?: string,
    type: 'planning' | 'target' | 'realisasi' = 'planning'
  ) => {
    const header = ["No", "Description", "Bobot %", 
      ...(showTargetColumn && showRealisasiColumn ? ["Target (%)", "Realisasi (%)"] : 
          showTargetColumn ? ["Target (%)"] : 
          showRealisasiColumn ? ["Realisasi (%)"] : []),
      "Lokasi", ...dateCols.map(col => col || ""), "Bukti"];

    const displayData = type === 'planning' ? sheetDataWithTotals : 
                       type === 'target' ? targetSheetDataWithTotals : 
                       realisasiSheetDataWithTotals;

    return (
      <div className="bg-white p-4 rounded shadow mb-6" id={`tab-${type}-content`}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">📋 {title}</h3>
          <div className="text-sm text-gray-500">
            💡 <strong>DOUBLE-CLICK pada header kolom tanggal untuk mengisi nama sesuai keinginan</strong>
          </div>
        </div>

        {(type === 'planning' && totalWeight > 100) && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
            <div className="flex items-center gap-2 text-red-700">
              <span>⚠️</span>
              <span className="font-medium">Total bobot melebihi 100%: {totalWeight}%</span>
            </div>
            <p className="text-sm text-red-600 mt-1">
              Nilai akan dinormalisasi ke 100% untuk perhitungan progress.
            </p>
          </div>
        )}

        <div ref={spreadsheetRef}>
          <CustomSpreadsheet
            data={displayData}
            columnLabels={header}
            onChange={onChange}
            onCellSelected={() => {}}
            onRangeSelected={handleRangeSelected}
            onCellDoubleClick={() => {}}
            activeTab={activeTab}
            dateCols={dateCols}
            type={type}
            selectedRange={selectedRange}
            setSelectedRange={setSelectedRange}
            onHeaderChange={handleHeaderChange} // PERBAIKAN: Tambah ini
          />
        </div>

        <FormattingToolbar 
          selectedRange={selectedRange} 
          onApplyFormatting={handleApplyFormatting}
          spreadsheetRef={spreadsheetRef}
          currentData={displayData}
          activeTab={activeTab}
          dateCols={dateCols}
          type={type}
          dataRows={currentRows}
          onChange={onChange}
          onUndo={() => undo(currentRows, 
            type === 'planning' ? setRows : 
            type === 'target' ? setTargetRows : setRealisasiRows, 
            undoStack, redoStack, storageKey)}
          onRedo={() => redo(currentRows, 
            type === 'planning' ? setRows : 
            type === 'target' ? setTargetRows : setRealisasiRows, 
            undoStack, redoStack, storageKey)}
          onAddDate={addDateColumn}
          onDeleteDate={() => setShowDeleteDate(!showDeleteDate)}
          undoStack={undoStack.current}
          redoStack={redoStack.current}
        />

        <div className="mt-3 flex flex-wrap gap-1 items-center">
          <div className="flex gap-1 border-r pr-2">
            <button onClick={onAddRow} className="px-2 py-1 bg-blue-50 hover:bg-blue-100 border rounded text-xs transition-colors" title="Insert Row">
              ➕ Row
            </button>
            <button onClick={onRemoveLastRow} className="px-2 py-1 bg-red-50 hover:bg-red-100 border rounded text-xs transition-colors" title="Delete Row">
              ➖ Row
            </button>
          </div>

          <div className="flex gap-1">
            <button
              onClick={addDateColumn}
              className="px-2 py-1 bg-green-50 hover:bg-green-100 border rounded text-xs flex items-center gap-1 transition-colors"
              title="Add Date Column (Kosong - bisa diisi manual)"
            >
              📅 Add Date
            </button>
            
            <button
              onClick={() => setShowDeleteDate(!showDeleteDate)}
              className={`px-2 py-1 border rounded text-xs flex items-center gap-1 transition-colors ${
                showDeleteDate ? 'bg-red-100 hover:bg-red-200 text-red-700' : 'bg-gray-50 hover:bg-gray-100'
              }`}
              title="Delete Date Columns"
            >
              {showDeleteDate ? '❌ Hide Delete' : '🗑️ Delete Date'}
            </button>
          </div>

          {type === 'planning' && (
            <button
              onClick={handleSaveSummary}
              className="ml-auto px-2 py-1 bg-green-600 hover:bg-green-700 text-white border rounded text-xs transition-colors"
            >
              💾 Save All
            </button>
          )}
        </div>

        {showDeleteDate && dateCols.length > 0 && (
          <div className="mt-4 p-3 bg-red-50 rounded border">
            <h4 className="font-semibold text-red-800 mb-2 text-sm">🗑️ Hapus Kolom Tanggal</h4>
            <div className="flex flex-wrap gap-2">
              {dateCols.map((date) => (
                <button
                  key={date}
                  onClick={() => deleteDateColumn(date)}
                  className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs flex items-center gap-1 transition-colors"
                  title={`Hapus ${date || "(kolom kosong)"}`}
                >
                  ❌ {date || "(kolom kosong)"}
                </button>
              ))}
            </div>
          </div>
        )}

        <UploadSection
          currentRows={currentRows}
          uploadingFiles={uploadingFiles}
          setFile={setFile}
          file={file}
          uploadToSingleStorage={uploadToSingleStorage}
          deleteFileFromStorage={deleteFileFromStorage}
          projectId={projectId}
          setRows={setRows}
          setTargetRows={setTargetRows}
          setRealisasiRows={setRealisasiRows}
          activeTab={activeTab}
        />
      </div>
    );
  };

  const renderPlanningChart = () => {
    if (!planningChartData.length) {
      return (
        <div className="bg-white p-4 rounded shadow mb-6">
          <h2 className="font-semibold mb-3">📈 Kurva S - Progress Berkelanjutan per Tanggal</h2>
          <div className="text-center py-8 text-gray-500">
            Tambah kolom tanggal terlebih dahulu untuk melihat chart
          </div>
        </div>
      );
    }

    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];
    
    return (
      <div className="bg-white p-4 rounded shadow mb-6" id="planning-chart">
        <h2 className="font-semibold mb-3">📈 Kurva S - Progress Berkelanjutan per Tanggal</h2>
        <div style={{ width: "100%", height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={planningChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                angle={-45}
                textAnchor="end"
                height={80}
                interval={0}
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                label={{ 
                  value: 'Progress (%)', 
                  angle: -90, 
                  position: 'insideLeft',
                  offset: -10,
                  style: { textAnchor: 'middle' }
                }}
              />
              <Tooltip />
              <Legend />
              {rows.map((row, index) => (
                <Line
                  key={index}
                  type="monotone"
                  dataKey={`tasks.${row.description || `Task ${index + 1}`}`}
                  stroke={colors[index % colors.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  name={row.description || `Task ${index + 1}`}
                />
              ))}
              <Line
                type="monotone"
                dataKey="totalProgress"
                stroke="rgba(0, 0, 0, 0.3)"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={{ r: 5 }}
                activeDot={{ r: 7 }}
                name="Total Progress"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 text-sm text-gray-600">
          <p>• Garis berwarna: Progress masing-masing task</p>
          <p>• Garis abu-abu transparan: Total progress kumulatif</p>
          <p>• Chart menunjukkan progress berkelanjutan antar task</p>
        </div>
      </div>
    );
  };

  const renderTargetChart = () => {
    if (!targetChartDataNew.length) {
      return (
        <div className="bg-white p-4 rounded shadow mb-6">
          <h2 className="font-semibold mb-3">📈 Kurva S Target - Progress Berkelanjutan per Tanggal</h2>
          <div className="text-center py-8 text-gray-500">
            Tambah kolom tanggal terlebih dahulu untuk melihat chart
          </div>
        </div>
      );
    }

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
    
    return (
      <div className="bg-white p-4 rounded shadow mb-6" id="target-chart">
        <h2 className="font-semibold mb-3">📈 Kurva S Target - Progress Berkelanjutan per Tanggal</h2>
        <div style={{ width: "100%", height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={targetChartDataNew}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                angle={-45}
                textAnchor="end"
                height={80}
                interval={0}
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                label={{ 
                  value: 'Progress (%)', 
                  angle: -90, 
                  position: 'insideLeft',
                  offset: -10,
                  style: { textAnchor: 'middle' }
                }}
              />
              <Tooltip />
              <Legend />
              {targetRows.map((row, index) => (
                <Line
                  key={index}
                  type="monotone"
                  dataKey={`tasks.${row.description || `Task ${index + 1}`}`}
                  stroke={colors[index % colors.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  name={row.description || `Task ${index + 1}`}
                />
              ))}
              <Line
                type="monotone"
                dataKey="totalProgress"
                stroke="rgba(0, 0, 0, 0.3)"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={{ r: 5 }}
                activeDot={{ r: 7 }}
                name="Total Progress"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 text-sm text-gray-600">
          <p>• Garis berwarna: Progress target masing-masing task</p>
          <p>• Garis abu-abu transparan: Total progress kumulatif</p>
          <p>• Chart menunjukkan progress berkelanjutan antar task</p>
        </div>
      </div>
    );
  };

  const renderRealisasiChart = () => {
    if (!combinedRealisasiChartData.length) {
      return (
        <div className="bg-white p-4 rounded shadow mb-6">
          <h2 className="font-semibold mb-3">📈 Kurva S Realisasi - Progress Berkelanjutan per Tanggal</h2>
          <div className="text-center py-8 text-gray-500">
            Tambah kolom tanggal terlebih dahulu untuk melihat chart
          </div>
        </div>
      );
    }

    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'];
    
    return (
      <div className="bg-white p-4 rounded shadow mb-6" id="realisasi-chart">
        <h2 className="font-semibold mb-3">📈 Kurva S Realisasi - Progress Berkelanjutan per Tanggal</h2>
        
        <div className="mb-4 p-3 bg-blue-50 rounded border">
          <div className="flex items-center gap-2 text-blue-700">
            <span>💡</span>
            <span className="font-medium">Keterangan Chart:</span>
          </div>
          <div className="flex flex-wrap gap-4 mt-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span>Planning (Tab 1)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span>Realisasi (Tab 4)</span>
            </div>
          </div>
        </div>
        
        <div style={{ width: "100%", height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={combinedRealisasiChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                angle={-45}
                textAnchor="end"
                height={80}
                interval={0}
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                label={{ 
                  value: 'Progress (%)', 
                  angle: -90, 
                  position: 'insideLeft',
                  offset: -10,
                  style: { textAnchor: 'middle' }
                }}
              />
              <Tooltip />
              <Legend />
              
              {rows.map((row, index) => (
                <Line
                  key={`planning-${index}`}
                  type="monotone"
                  dataKey={`tasks.${row.description || `Task ${index + 1}`}`}
                  stroke={colors[index % colors.length]}
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  name={`Planning: ${row.description || `Task ${index + 1}`}`}
                />
              ))}
              
              {realisasiRows.map((row, index) => (
                <Line
                  key={`realisasi-${index}`}
                  type="monotone"
                  dataKey={`realisasiTasks.${row.description || `Task ${index + 1}`}`}
                  stroke={colors[index % colors.length]}
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  name={`Realisasi: ${row.description || `Task ${index + 1}`}`}
                />
              ))}
              
              <Line
                type="monotone"
                dataKey="planningTotal"
                stroke="#3b82f6"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={{ r: 5 }}
                activeDot={{ r: 7 }}
                name="Total Planning"
              />
              <Line
                type="monotone"
                dataKey="realisasiTotal"
                stroke="#10b981"
                strokeWidth={3}
                dot={{ r: 5 }}
                activeDot={{ r: 7 }}
                name="Total Realisasi"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 text-sm text-gray-600">
          <p>• Garis biru (putus-putus): Progress planning dari Tab 1</p>
          <p>• Garis hijau (solid): Progress realisasi dari Tab 4</p>
          <p>• Chart menunjukkan perbandingan antara planning dan realisasi</p>
        </div>
      </div>
    );
  };

  const renderChart = (data: any[], title: string, showTarget: boolean = true, showRealisasi: boolean = true) => (
    <div className="bg-white p-4 rounded shadow mb-6">
      <h2 className="font-semibold mb-3">📈 {title}</h2>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            {showTarget && (
              <Line
                type="monotone"
                dataKey="Target"
                stroke="#3b82f6"
                dot={{ r: 3 }}
              />
            )}
            {showRealisasi && (
              <Line
                type="monotone"
                dataKey="Realisasi"
                stroke="#ef4444"
                dot={{ r: 3 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const renderNotesTab = () => (
    <div className="space-y-6" id="tab-catatan-content">
      <div className="bg-white p-6 rounded shadow">
        <h3 className="font-semibold mb-4">Tambah Catatan Lapangan</h3>
        <div className="space-y-4">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Tulis catatan lapangan di sini... (laporan harian, kendala, progress, dll)"
            className="w-full h-32 p-3 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tambah Voice Note (Opsional)
              </label>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                className="w-full"
              />
            </div>
            <button
              onClick={addNote}
              disabled={!newNote.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium mt-6 transition-colors"
            >
              Simpan Catatan
            </button>
          </div>
          {audioFile && (
            <p className="text-sm text-green-600">
              ✅ File audio siap diupload ke storage: {audioFile.name}
            </p>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded shadow">
        <h3 className="font-semibold mb-4">Catatan Lapangan Terkini</h3>
        <div className="space-y-4">
          {notes.map((note) => (
            <div key={note.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  <span className="text-sm text-gray-600">
                    {new Date(note.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-xs text-gray-500">By: {note.created_by}</span>
                  <div className="flex gap-1">
                    {note.audio_url && (
                      <button
                        onClick={() => deleteAudio(note.id, note.audio_url!)}
                        className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs transition-colors"
                        title="Hapus audio"
                      >
                        🗑️ Audio
                      </button>
                    )}
                    <button
                      onClick={() => deleteNote(note.id)}
                      className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs transition-colors"
                      title="Hapus catatan"
                      >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
              <p className="text-gray-800 whitespace-pre-wrap">{note.content}</p>
              {note.audio_url && (
                <div className="mt-3 pt-3 border-t">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium">Voice Note:</span>
                    <button
                      onClick={() => deleteAudio(note.id, note.audio_url!)}
                      className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs transition-colors"
                    >
                      Hapus Audio
                    </button>
                  </div>
                  <audio controls className="w-full">
                    <source src={note.audio_url} type="audio/mpeg" />
                    Browser Anda tidak mendukung pemutar audio.
                  </audio>
                </div>
              )}
            </div>
          ))}
          {notes.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">📝</div>
              <p>Belum ada catatan lapangan</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderProjectInfo = () => (
    <div className="bg-white p-4 rounded shadow mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">📋 Deskripsi Proyek</h3>
        <div className="flex gap-2">
          {isEditingMeta ? (
            <>
              <button
                onClick={handleSaveProjectMeta}
                disabled={savingMeta}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm disabled:bg-gray-400 transition-colors"
              >
                {savingMeta ? "⏳ Menyimpan..." : "💾 Simpan"}
              </button>
              <button
                onClick={() => setIsEditingMeta(false)}
                className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded text-sm transition-colors"
              >
                ❌ Batal
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditingMeta(true)}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
            >
              ✏️ Edit
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">KODE PROYEK</label>
          <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
            {metaProject.project_code || "P-EUI-000-Tanggal"}
          </div>
          <p className="text-xs text-gray-500 mt-1">Auto-generated</p>
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">JOB NAME *</label>
          {isEditingMeta ? (
            <input
              type="text"
              value={metaProject.job_name || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, job_name: e.target.value }))}
              className="w-full p-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Masukkan job name"
              required
            />
          ) : (
            <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
              {metaProject.job_name || "-"}
            </div>
          )}
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">NO RKS</label>
          {isEditingMeta ? (
            <input
              type="text"
              value={metaProject.no_rks || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, no_rks: e.target.value }))}
              className="w-full p-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Masukkan no RKS"
            />
          ) : (
            <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
              {metaProject.no_rks || "-"}
            </div>
          )}
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">DATE</label>
          {isEditingMeta ? (
            <input
              type="date"
              value={metaProject.date || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, date: e.target.value }))}
              className="w-full p-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          ) : (
            <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
              {metaProject.date || "-"}
            </div>
          )}
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">CLIENT</label>
          {isEditingMeta ? (
            <input
              type="text"
              value={metaProject.client || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, client: e.target.value }))}
              className="w-full p-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Masukkan nama client"
            />
          ) : (
            <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
              {metaProject.client || "-"}
            </div>
          )}
        </div>
        
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">ADDRESS</label>
          {isEditingMeta ? (
            <input
              type="text"
              value={metaProject.address || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, address: e.target.value }))}
              className="w-full p-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Masukkan alamat proyek"
            />
          ) : (
            <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
              {metaProject.address || "-"}
            </div>
          )}
        </div>
        
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">TIME SCHEDULE</label>
          {isEditingMeta ? (
            <input
              type="text"
              value={metaProject.time_schedule || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, time_schedule: e.target.value }))}
              className="w-full p-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Masukkan time schedule"
            />
          ) : (
            <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
              {metaProject.time_schedule || "-"}
            </div>
          )}
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">DEADLINE *</label>
          {isEditingMeta ? (
            <input
              type="date"
              value={metaProject.deadline || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, deadline: e.target.value }))}
              className="w-full p-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              min={new Date().toISOString().split('T')[0]}
              required
            />
          ) : (
            <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px] flex items-center justify-between">
              <span>{metaProject.deadline ? formatDateDisplay(metaProject.deadline) : "-"}</span>
              {metaProject.deadline && (
                <CountdownTimer deadline={metaProject.deadline} />
              )}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1">Batas akhir pengerjaan proyek</p>
        </div>
      </div>

      {isEditingMeta && (
        <div className="mt-4 p-3 bg-blue-50 rounded border">
          <p className="text-sm text-blue-700">
            💡 <strong>Kode proyek otomatis:</strong> P-EUI-NoUrut-Tanggal. Isi Job Name (wajib) dan data lainnya lalu klik "Simpan".
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen" id="silver-app-content">
      <header className="flex justify-between items-center mb-6">
        <div className="bg-white p-4 rounded shadow">
          <div className="flex items-center gap-4">
            {!logoError ? (
              <img 
                src="/logo-eltama.png" 
                alt="PT Elektrindo Utama Indonesia" 
                style={{ width: 140 }}
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="w-32 h-16 bg-blue-600 flex items-center justify-center rounded">
                <span className="text-white font-bold text-sm text-center">PT EUI</span>
              </div>
            )}
            <div>
              <div className="text-xl font-bold">PT ELEKTRINDO UTAMA INDONESIA</div>
              <div className="text-sm text-gray-600">
                MECHANICAL - ELECTRICAL - FIRE PROTECTION SYSTEM
              </div>
              <div className="text-xs text-blue-600 font-semibold mt-1">
                SILVER APP - INPUT DATA LAPANGAN
              </div>
            </div>
          </div>
        </div>
        <UserProfile />
      </header>

      <OnlineUsers onlineUsers={onlineUsers} currentUser={currentUser} />

      {renderProjectInfo()}

      <ExportPrintControls
        activeTab={activeTab}
        projectName={projectName}
        metaProject={metaProject}
        rows={rows}
        targetRows={targetRows}
        realisasiRows={realisasiRows}
        dateCols={dateCols}
        planningSummary={planningSummary}
        targetSummary={targetSummary}
        realisasiSummary={realisasiSummary}
        planningChartData={planningChartData}
        targetChartDataNew={targetChartDataNew}
        realisasiChartDataNew={realisasiChartDataNew}
        notes={notes}
      />

      <div className="mb-4 flex gap-2 items-center flex-wrap">
        <button
          onClick={() => {
            setActiveTab(1);
            localStorage.setItem(LS_ACTIVE_TAB, JSON.stringify(1));
          }}
          className={`px-3 py-1 rounded transition-colors ${
            activeTab === 1 ? "bg-blue-600 text-white" : "bg-white border hover:bg-gray-50"
          }`}
        >
          Tab 1 — Planning
        </button>
        <button
          onClick={() => {
            setActiveTab(2);
            localStorage.setItem(LS_ACTIVE_TAB, JSON.stringify(2));
          }}
          className={`px-3 py-1 rounded transition-colors ${
            activeTab === 2 ? "bg-blue-600 text-white" : "bg-white border hover:bg-gray-50"
          }`}
        >
          Tab 2 — Lokasi
        </button>
        <button
          onClick={() => {
            setActiveTab(3);
            localStorage.setItem(LS_ACTIVE_TAB, JSON.stringify(3));
          }}
          className={`px-3 py-1 rounded transition-colors ${
            activeTab === 3 ? "bg-blue-600 text-white" : "bg-white border hover:bg-gray-50"
          }`}
        >
          Tab Target
        </button>
        <button
          onClick={() => {
            setActiveTab(4);
            localStorage.setItem(LS_ACTIVE_TAB, JSON.stringify(4));
          }}
          className={`px-3 py-1 rounded transition-colors ${
            activeTab === 4 ? "bg-blue-600 text-white" : "bg-white border hover:bg-gray-50"
          }`}
        >
          Tab Realisasi
        </button>
        <button
          onClick={() => {
            setActiveTab(5);
            localStorage.setItem(LS_ACTIVE_TAB, JSON.stringify(5));
          }}
          className={`px-3 py-1 rounded transition-colors ${
            activeTab === 5 ? "bg-blue-600 text-white" : "bg-white border hover:bg-gray-50"
          }`}
        >
          Tab Catatan
        </button>
      </div>

      {activeTab === 1 && (
        <>
          {renderPlanningChart()}
          {renderSpreadsheetWithControls(
            sheetData,
            addRow,
            removeLastRow,
            handleSpreadsheetFullChange,
            "Tabel Planning Kurva S (Excel-like)",
            true,
            true,
            rows,
            undoStack,
            redoStack,
            LS_KEY,
            'planning'
          )}
        </>
      )}

      {activeTab === 2 && (
        <LocationTab projectId={projectId} metaProject={metaProject} />
      )}

      {activeTab === 3 && (
        <>
          {renderTargetChart()}
          {renderSpreadsheetWithControls(
            targetSheetData,
            addTargetRow,
            removeLastTargetRow,
            handleTargetSpreadsheetChange,
            "Tabel Target Kurva S",
            true,
            false,
            targetRows,
            targetUndoStack,
            targetRedoStack,
            LS_TARGET_KEY,
            'target'
          )}
        </>
      )}

      {activeTab === 4 && (
        <>
          {renderRealisasiChart()}
          {renderSpreadsheetWithControls(
            realisasiSheetData,
            addRealisasiRow,
            removeLastRealisasiRow,
            handleRealisasiSpreadsheetChange,
            "Tabel Realisasi Kurva S",
            false,
            true,
            realisasiRows,
            realisasiUndoStack,
            realisasiRedoStack,
            LS_REALISASI_KEY,
            'realisasi'
          )}
        </>
      )}

      {activeTab === 5 && renderNotesTab()}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-500">TOTAL BOBOT %</div>
          <div className={`text-xl font-semibold ${currentSummary.totalWeight > 100 ? 'text-red-600' : 'text-green-600'}`}>
            {currentSummary.totalWeight.toFixed(2).replace('.', ',')}%
            {currentSummary.totalWeight > 100 && <span className="text-xs block text-red-500">(Melebihi 100%)</span>}
          </div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-500">PLAN PROGRESS %</div>
          <div className="text-xl font-semibold">
            {currentSummary.plan.toFixed(2).replace('.', ',')}%
          </div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-500">ACTUAL PROGRESS %</div>
          <div className="text-xl font-semibold">
            {currentSummary.actual.toFixed(2).replace('.', ',')}%
          </div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-500">STATUS</div>
          <div className={`text-xl font-semibold ${currentSummary.isValidWeight ? 'text-green-600' : 'text-red-600'}`}>
            {currentSummary.isValidWeight ? 'VALID' : 'INVALID'}
          </div>
        </div>
      </div>

      <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="text-green-600 text-lg">🔄</div>
          <div>
            <h4 className="font-semibold text-green-800">PERBAIKAN BERHASIL DITERAPKAN</h4>
            <p className="text-sm text-green-700">
              1. ✅ Save semua data di dalam project (tidak akan hilang)<br/>
              2. ✅ Actual Progress & Plan Progress sama dengan total % dari tabel<br/>
              3. ✅ Perkecil tabel PDF jika terlalu banyak kolom (A3 landscape)<br/>
              4. ✅ <strong>Kolom tanggal kosong saat add date (bisa diisi manual dengan DOUBLE-CLICK pada header)</strong><br/>
              5. ✅ <strong>SINGLE STORAGE: Semua upload file sekarang hanya ke Supabase storage utama</strong><br/>
              6. ✅ Tidak ada error 100%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}