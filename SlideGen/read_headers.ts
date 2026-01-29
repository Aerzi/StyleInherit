
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const filePath = path.resolve('../上下文样式继承测试集.xlsx');

try {
  if (fs.existsSync(filePath)) {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Get range
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    const headers = [];
    
    // Read first row
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = { c: C, r: range.s.r };
      const cellRef = XLSX.utils.encode_cell(cellAddress);
      const cell = worksheet[cellRef];
      if (cell && cell.v) {
        headers.push(cell.v);
      }
    }
    
    console.log('Headers:', JSON.stringify(headers));
  } else {
    console.error('File not found:', filePath);
  }
} catch (error) {
  console.error('Error reading excel:', error);
}

