// @ts-nocheck

import { createFileRoute } from '@tanstack/react-router'
import { memo, startTransition, useCallback, useRef, useState } from 'react';

export const Route = createFileRoute('/test')({
  component: OptimizedEditableTable,
})

// Memoized cell component - only re-renders when its specific props change
const TableCell = memo(({ value, rowId, columnKey, onCellChange }) => {
    const renderCount = useRef(0);
    renderCount.current++;
    
    // In StrictMode, divide by 2 to show actual renders
    const displayCount = process.env.NODE_ENV === 'development' 
      ? Math.ceil(renderCount.current / 2) 
      : renderCount.current;

  return (
    <td className="border border-gray-300 p-2 relative">
      <input 
        value={value}
        onChange={(e) => onCellChange(rowId, columnKey, e.target.value)}
        className="w-full px-2 py-1 border-none outline-none bg-transparent"
        placeholder={`Enter ${columnKey}`}
      />
      {/* Render counter to visualize re-renders */}
      <div className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
        {displayCount}
      </div>
    </td>
  );
});

function OptimizedEditableTable() {
  // Generate 100 sample users
  const generateSampleUsers = () => {
    const firstNames = ['John', 'Jane', 'Bob', 'Alice', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack', 'Kate', 'Liam', 'Mia', 'Noah', 'Olivia', 'Paul', 'Quinn', 'Ruby'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];
    const roles = ['Developer', 'Designer', 'Manager', 'Analyst', 'Engineer', 'QA Tester', 'Product Manager', 'DevOps', 'Data Scientist', 'UI/UX Designer'];
    
    const userMap = new Map();
    for (let i = 1; i <= 10000; i++) {
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const role = roles[Math.floor(Math.random() * roles.length)];
      
      userMap.set(`user${i}`, {
        name: `${firstName} ${lastName}`,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@company.com`,
        role: role
      });
    }
    return userMap;
  };

  // State using Map instead of Object - O(1) lookups
  const [tableData, setTableData] = useState(() => generateSampleUsers());
  const [editedRows, setEditedRows] = useState(new Set());
  const [submitStatus, setSubmitStatus] = useState('');

  // Memoized handler with startTransition for non-urgent updates
  const handleCellChange = useCallback((rowId, columnKey, newValue) => {
    // Use startTransition to mark this update as non-urgent
    startTransition(() => {
      setTableData(prevMap => {
        const newMap = new Map(prevMap);
        const currentRow = newMap.get(rowId);
        newMap.set(rowId, { ...currentRow, [columnKey]: newValue });
        return newMap;
      });
      
      // Track which rows have been edited
      setEditedRows(prev => new Set([...prev, rowId]));
    });
  }, []);

  // Memoized submit handler
  const handleSubmit = useCallback(() => {
    const editedData = {};

    for (const rowId of editedRows) {
        editedData[rowId] = tableData.get(rowId);
    }
    
    // Simulate API call
    setSubmitStatus('Sending...');
    setTimeout(() => {
      console.log('Sent to backend:', editedData);
      setSubmitStatus(`✅ Sent ${editedRows.size} edited row(s) to backend`);
      setEditedRows(new Set()); // Clear edited rows
      setTimeout(() => setSubmitStatus(''), 3000);
    }, 1000);
  }, [tableData, editedRows]);

  const columns = ['name', 'email', 'role'];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Combined Optimizations Demo</h1>
      
      <div className="mb-4 p-4 bg-purple-50 rounded-lg">
        <h3 className="font-semibold text-purple-800 mb-2">All Optimizations Combined:</h3>
        <ul className="text-sm text-purple-700 space-y-1">
          <li>• <strong>React.memo:</strong> Only edited cells re-render</li>
          <li>• <strong>useCallback:</strong> Stable function references prevent unnecessary re-renders</li>
          <li>• <strong>startTransition:</strong> Non-urgent state updates (smoother typing)</li>
          <li>• <strong>Map state:</strong> O(1) lookups instead of object property access</li>
          <li>• Blue counters show only edited cells re-render (best performance)</li>
        </ul>
      </div>

      <div className="overflow-x-auto max-h-96">
        <table className="w-full border-collapse border border-gray-300">
          <thead className="sticky top-0 bg-white">
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-3 text-left font-semibold">User ID</th>
              {columns.map(column => (
                <th key={column} className="border border-gray-300 p-3 text-left font-semibold capitalize">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from(tableData.entries()).map(([rowId, rowData]) => (
              <tr key={rowId} className={editedRows.has(rowId) ? 'bg-yellow-50' : ''}>
                <td className="border border-gray-300 p-3 font-medium text-gray-600">
                  {rowId}
                  {editedRows.has(rowId) && (
                    <span className="ml-2 text-xs bg-yellow-200 px-1 rounded">edited</span>
                  )}
                </td>
                {columns.map(columnKey => (
                  <TableCell 
                    key={`${rowId}-${columnKey}`}
                    value={rowData[columnKey]}
                    rowId={rowId}
                    columnKey={columnKey}
                    onCellChange={handleCellChange}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={handleSubmit}
          disabled={editedRows.size === 0 || submitStatus === 'Sending...'}
          className="px-6 py-2 bg-purple-600 text-white rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-purple-700 transition-colors"
          type='button'
        >
          {submitStatus === 'Sending...' ? 'Sending...' : `Submit Changes (${editedRows.size})`}
        </button>
        
        {submitStatus && submitStatus !== 'Sending...' && (
          <span className="text-purple-600 font-medium">{submitStatus}</span>
        )}
      </div>

      <div className="mt-4 text-sm text-gray-600 space-y-2">
        <p><strong>Best of both worlds:</strong></p>
        <p>• <span className="text-blue-600">Blue counters:</span> Only edited cells re-render (memo optimization)</p>
        <p>• <span className="text-purple-600">Smooth typing:</span> startTransition makes updates feel responsive</p>
        <p>• <span className="text-purple-600">Fast lookups:</span> Map operations for O(1) performance</p>
        <p>• <span className="text-purple-600">Stable functions:</span> useCallback prevents function recreation</p>
        <p><strong>Result:</strong> Minimal re-renders + smooth UX + fast state operations</p>
      </div>
    </div>
  );
};