// components/Spreadsheet.tsx - VERSI FINAL YANG BERFUNGSI
import React, { useState, useEffect, useRef } from 'react';

interface Cell {
  value: string | number;
  component?: React.ComponentType<any>;
  readOnly?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

interface SpreadsheetProps {
  data: Cell[][];
  onChange?: (data: Cell[][]) => void;
  columnLabels?: string[];
}

const Spreadsheet: React.FC<SpreadsheetProps> = ({ data, onChange, columnLabels }) => {
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [internalData, setInternalData] = useState(data);
  const [currentCellStyle, setCurrentCellStyle] = useState<{
    rowIndex: number;
    cellIndex: number;
    style: React.CSSProperties;
  } | null>(null);
  const spreadsheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInternalData(data);
  }, [data]);

  useEffect(() => {
    // Event listener untuk formatting toolbar
    const handleCellSelected = (event: CustomEvent) => {
      const { rowIndex, cellIndex, cell } = event.detail;
      const cellKey = `${rowIndex}-${cellIndex}`;
      setSelectedCells(new Set([cellKey]));
      
      // Simpan style cell yang sedang dipilih
      setCurrentCellStyle({
        rowIndex,
        cellIndex,
        style: cell?.style || {}
      });
    };

    window.addEventListener('cell-selected', handleCellSelected as EventListener);
    
    // Event untuk apply formatting
    const handleApplyFormatting = (event: CustomEvent) => {
      const { property, value } = event.detail;
      
      if (currentCellStyle) {
        const { rowIndex, cellIndex } = currentCellStyle;
        const newData = [...internalData];
        
        if (newData[rowIndex] && newData[rowIndex][cellIndex]) {
          // Update style cell
          const currentStyle = newData[rowIndex][cellIndex].style || {};
          newData[rowIndex][cellIndex].style = {
            ...currentStyle,
            [property]: value
          };
          
          setInternalData(newData);
          
          // Update current cell style
          setCurrentCellStyle({
            ...currentCellStyle,
            style: newData[rowIndex][cellIndex].style || {}
          });
          
          // Trigger onChange
          if (onChange) {
            onChange(newData);
          }
        }
      }
    };

    window.addEventListener('apply-formatting', handleApplyFormatting as EventListener);
    
    return () => {
      window.removeEventListener('cell-selected', handleCellSelected as EventListener);
      window.removeEventListener('apply-formatting', handleApplyFormatting as EventListener);
    };
  }, [internalData, onChange, currentCellStyle]);

  const handleCellChange = (rowIndex: number, cellIndex: number, value: string | number) => {
    if (!onChange) return;

    const newData = internalData.map((row, rIdx) =>
      rIdx === rowIndex
        ? row.map((cell, cIdx) =>
            cIdx === cellIndex ? { ...cell, value } : cell
          )
        : row
    );

    setInternalData(newData);
    onChange(newData);
  };

  const handleCellSelect = (rowIndex: number, cellIndex: number) => {
    const cellKey = `${rowIndex}-${cellIndex}`;
    const newSelected = new Set([cellKey]);
    setSelectedCells(newSelected);
    
    // Dispatch event untuk formatting toolbar
    const event = new CustomEvent('cell-selected', {
      detail: { 
        rowIndex, 
        cellIndex, 
        cell: internalData[rowIndex]?.[cellIndex],
        value: internalData[rowIndex]?.[cellIndex]?.value
      }
    });
    window.dispatchEvent(event);
  };

  // Helper untuk render cell dengan styling
  const renderCell = (cell: Cell, rowIndex: number, cellIndex: number) => {
    const isSelected = selectedCells.has(`${rowIndex}-${cellIndex}`);
    
    const cellStyle = {
      ...cell.style,
      ...(isSelected ? { border: '2px solid #3b82f6' } : {})
    };

    if (cell.component) {
      const CellComponent = cell.component;
      return (
        <CellComponent
          value={cell.value}
          onChange={(newValue: any) => handleCellChange(rowIndex, cellIndex, newValue.value)}
          readOnly={cell.readOnly}
          style={cellStyle}
          className={`${cell.className || ''} ${isSelected ? 'selected-cell' : ''}`}
        />
      );
    }

    if (cell.readOnly) {
      return (
        <div 
          className={`p-2 border ${cell.className || ''} ${isSelected ? 'selected-cell' : ''}`}
          style={cellStyle}
          onClick={() => handleCellSelect(rowIndex, cellIndex)}
        >
          {cell.value}
        </div>
      );
    }

    return (
      <input
        type="text"
        value={cell.value}
        onChange={(e) => {
          const value = e.target.value;
          // Izinkan input desimal dengan koma
          if (value === '' || /^-?\d*[,.]?\d*$/.test(value)) {
            handleCellChange(rowIndex, cellIndex, value);
          }
        }}
        className={`p-2 border w-full ${cell.className || ''} ${isSelected ? 'selected-cell' : ''}`}
        style={cellStyle}
        onClick={() => handleCellSelect(rowIndex, cellIndex)}
        onFocus={() => handleCellSelect(rowIndex, cellIndex)}
        placeholder="0,00"
      />
    );
  };

  return (
    <div className="overflow-auto" ref={spreadsheetRef}>
      <table className="min-w-full border-collapse border border-gray-300">
        {columnLabels && (
          <thead>
            <tr>
              {columnLabels.map((label, index) => (
                <th key={index} className="border border-gray-300 bg-gray-100 p-2 font-semibold text-left">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {internalData.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border border-gray-300 p-0">
                  {renderCell(cell, rowIndex, cellIndex)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Spreadsheet;