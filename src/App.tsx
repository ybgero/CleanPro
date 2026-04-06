/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import _ from 'lodash';
import yaml from 'js-yaml';
import { 
  Upload, 
  Trash2, 
  Download, 
  RefreshCw, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle,
  Table as TableIcon,
  ChevronDown,
  Files,
  FolderOpen,
  BarChart3,
  History,
  FileText,
  X,
  Info,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Types
type DataRow = Record<string, any>;

interface ColumnStats {
  nullCount: number;
  nullPercentage: number;
  blankCount: number;
  blankPercentage: number;
  uniqueCount: number;
  type: string;
}

interface FileMetadata {
  rowCount: number;
  colCount: number;
  columnStats: Record<string, ColumnStats>;
}

interface FileObject {
  id: string;
  name: string;
  type: string;
  data: DataRow[];
  headers: string[];
  metadata: FileMetadata;
  cleanedData: DataRow[] | null;
  rowsRemoved: number | null;
}

interface HistoryEntry {
  id: string;
  timestamp: Date;
  filesProcessed: number;
  totalRowsRemoved: number;
  rules: {
    nulls: string;
    blanks: string;
    zeros: string;
    duplicates: string;
  };
  fileDetails: {
    name: string;
    rowsBefore: number;
    rowsAfter: number;
  }[];
}

type NullOption = 'drop' | 'fill_0' | 'fill_mean' | 'fill_mode' | 'none';
type BlankOption = 'to_null' | 'drop' | 'none';
type ZeroOption = 'none' | 'to_null' | 'replace_mean' | 'replace_median';
type DuplicateOption = 'remove' | 'keep';

export default function App() {
  const [files, setFiles] = useState<FileObject[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [viewMode, setViewMode] = useState<'preview' | 'history'>('preview');
  const [isCleaning, setIsCleaning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Cleaning Options
  const [nullOption, setNullOption] = useState<NullOption>('none');
  const [blankOption, setBlankOption] = useState<BlankOption>('none');
  const [zeroOption, setZeroOption] = useState<ZeroOption>('none');
  const [duplicateOption, setDuplicateOption] = useState<DuplicateOption>('keep');

  const calculateMetadata = (data: DataRow[], headers: string[]): FileMetadata => {
    const rowCount = data.length;
    const colCount = headers.length;
    const columnStats: Record<string, ColumnStats> = {};

    headers.forEach(col => {
      const values = data.map(row => row[col]);
      const nullCount = values.filter(v => v === null || v === undefined).length;
      const blankCount = values.filter(v => typeof v === 'string' && v.trim() === '').length;
      const uniqueValues = new Set(values.filter(v => v !== null && v !== undefined));
      
      const firstVal = values.find(v => v !== null && v !== undefined);
      const type = typeof firstVal;

      columnStats[col] = {
        nullCount,
        nullPercentage: rowCount > 0 ? (nullCount / rowCount) * 100 : 0,
        blankCount,
        blankPercentage: rowCount > 0 ? (blankCount / rowCount) * 100 : 0,
        uniqueCount: uniqueValues.size,
        type: type === 'object' ? 'any' : type
      };
    });

    return { rowCount, colCount, columnStats };
  };

  const processFile = async (file: File): Promise<FileObject | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      const fileName = file.name.toLowerCase();

      reader.onload = (e) => {
        try {
          let jsonData: DataRow[] = [];
          let headers: string[] = [];

          if (fileName.endsWith('.csv')) {
            const text = e.target?.result as string;
            const results = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
            jsonData = results.data as DataRow[];
            headers = results.meta.fields || [];
          } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            jsonData = XLSX.utils.sheet_to_json(worksheet) as DataRow[];
            if (jsonData.length > 0) headers = Object.keys(jsonData[0]);
          } else if (fileName.endsWith('.json')) {
            const text = e.target?.result as string;
            const parsed = JSON.parse(text);
            jsonData = Array.isArray(parsed) ? parsed : [parsed];
            if (jsonData.length > 0) headers = Object.keys(jsonData[0]);
          } else if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
            const text = e.target?.result as string;
            const parsed = yaml.load(text);
            jsonData = Array.isArray(parsed) ? parsed : [parsed];
            if (jsonData.length > 0) headers = Object.keys(jsonData[0]);
          } else {
            resolve(null);
            return;
          }

          if (jsonData.length > 0) {
            const metadata = calculateMetadata(jsonData, headers);
            resolve({
              id: Math.random().toString(36).substr(2, 9),
              name: file.name,
              type: file.name.split('.').pop() || 'unknown',
              data: jsonData,
              headers,
              metadata,
              cleanedData: null,
              rowsRemoved: null
            });
          } else {
            resolve(null);
          }
        } catch (err) {
          console.error(`Error parsing ${file.name}:`, err);
          resolve(null);
        }
      };

      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    const newFiles: FileObject[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const processed = await processFile(fileList[i]);
      if (processed) newFiles.push(processed);
    }
    setFiles(prev => [...prev, ...newFiles]);
  };

  const cleanData = useCallback(() => {
    if (files.length === 0) return;
    setIsCleaning(true);

    setTimeout(() => {
      const updatedFiles = files.map(file => {
        let result = _.cloneDeep(file.data);
        const initialRows = result.length;

        // 1. Handle Blank Strings
        if (blankOption === 'to_null') {
          result = result.map(row => {
            const newRow = { ...row };
            Object.keys(newRow).forEach(key => {
              if (typeof newRow[key] === 'string' && newRow[key].trim() === '') {
                newRow[key] = null;
              }
            });
            return newRow;
          });
        } else if (blankOption === 'drop') {
          result = result.filter(row => {
            return !Object.values(row).some(val => typeof val === 'string' && val.trim() === '');
          });
        }

        // 2. Handle Zero Values
        if (zeroOption !== 'none') {
          file.headers.forEach(col => {
            const numericValues = result
              .map(row => row[col])
              .filter(val => typeof val === 'number' && val !== 0 && val !== null);
            
            const mean = numericValues.length > 0 ? _.mean(numericValues) : 0;
            const sorted = _.sortBy(numericValues);
            const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;

            result = result.map(row => {
              if (row[col] === 0) {
                if (zeroOption === 'to_null') return { ...row, [col]: null };
                if (zeroOption === 'replace_mean') return { ...row, [col]: mean };
                if (zeroOption === 'replace_median') return { ...row, [col]: median };
              }
              return row;
            });
          });
        }

        // 3. Handle NULL values
        if (nullOption === 'drop') {
          result = result.filter(row => {
            return !Object.values(row).some(val => val === null || val === undefined);
          });
        } else if (nullOption !== 'none') {
          file.headers.forEach(col => {
            const values = result.map(row => row[col]).filter(val => val !== null && val !== undefined);
            const numericValues = values.filter(val => typeof val === 'number');
            
            const mean = numericValues.length > 0 ? _.mean(numericValues) : 0;
            const mode = _.head(_(values).countBy().entries().maxBy(_.last))?.[0];
            const typedMode = typeof values[0] === 'number' ? Number(mode) : mode;

            result = result.map(row => {
              if (row[col] === null || row[col] === undefined) {
                if (nullOption === 'fill_0') return { ...row, [col]: 0 };
                if (nullOption === 'fill_mean' && typeof values[0] === 'number') return { ...row, [col]: mean };
                if (nullOption === 'fill_mode') return { ...row, [col]: typedMode };
              }
              return row;
            });
          });
        }

        // 4. Handle Duplicate Rows
        if (duplicateOption === 'remove') {
          result = _.uniqWith(result, _.isEqual);
        }

        return {
          ...file,
          cleanedData: result,
          rowsRemoved: initialRows - result.length
        };
      });

      const totalRemoved = updatedFiles.reduce((acc, f) => acc + (f.rowsRemoved || 0), 0);
      const newHistoryEntry: HistoryEntry = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date(),
        filesProcessed: files.length,
        totalRowsRemoved: totalRemoved,
        rules: {
          nulls: nullOption,
          blanks: blankOption,
          zeros: zeroOption,
          duplicates: duplicateOption
        },
        fileDetails: updatedFiles.map(f => ({
          name: f.name,
          rowsBefore: f.data.length,
          rowsAfter: f.cleanedData?.length || 0
        }))
      };

      setFiles(updatedFiles);
      setHistory(prev => [newHistoryEntry, ...prev]);
      setIsCleaning(false);
    }, 800);
  }, [files, nullOption, blankOption, zeroOption, duplicateOption]);

  const downloadFile = (file: FileObject) => {
    if (!file.cleanedData) return;
    const csv = Papa.unparse(file.cleanedData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `cleaned_${file.name.replace(/\.[^/.]+$/, "")}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const removeFile = (id: string) => {
    const newFiles = files.filter(f => f.id !== id);
    setFiles(newFiles);
    if (selectedFileIndex >= newFiles.length) {
      setSelectedFileIndex(Math.max(0, newFiles.length - 1));
    }
  };

  const currentFile = files[selectedFileIndex];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <header className="mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200">
              <FileSpreadsheet size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">CleanSheet Pro</h1>
              <p className="text-sm text-slate-500">Advanced multi-file data cleaning utility</p>
            </div>
          </div>

          <div className="flex items-center bg-white p-1 rounded-xl shadow-sm border border-slate-200">
            <button 
              onClick={() => setViewMode('preview')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${viewMode === 'preview' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <BarChart3 size={16} />
              Preview
            </button>
            <button 
              onClick={() => setViewMode('history')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${viewMode === 'history' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <History size={16} />
              History
            </button>
          </div>
        </header>

        {files.length === 0 ? (
          /* Empty State / Initial Upload */
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-2xl mx-auto mt-20"
          >
            <div className="bg-white p-12 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 text-center">
              <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Upload size={40} />
              </div>
              <h2 className="text-2xl font-bold mb-3">Get started by uploading files</h2>
              <p className="text-slate-500 mb-8 max-w-sm mx-auto">
                Support for CSV, Excel, JSON, and YAML. You can upload multiple files or entire folders.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                >
                  <Files size={20} />
                  Select Files
                </button>
                <button 
                  onClick={() => folderInputRef.current?.click()}
                  className="px-8 py-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  <FolderOpen size={20} />
                  Select Folder
                </button>
              </div>

              <input 
                ref={fileInputRef}
                type="file" 
                multiple
                className="hidden" 
                accept=".csv, .xlsx, .xls, .json, .yaml, .yml" 
                onChange={(e) => handleFiles(e.target.files)}
              />
              <input 
                ref={folderInputRef}
                type="file" 
                // @ts-ignore
                webkitdirectory=""
                directory=""
                className="hidden" 
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Sidebar: File List & Controls */}
            <div className="lg:col-span-3 space-y-6">
              {/* File List */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Files ({files.length})</h3>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
                  >
                    <Upload size={14} />
                  </button>
                </div>
                <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-50">
                  {files.map((file, idx) => (
                    <div 
                      key={file.id}
                      onClick={() => setSelectedFileIndex(idx)}
                      className={`p-4 flex items-center justify-between cursor-pointer transition-all group ${selectedFileIndex === idx ? 'bg-indigo-50/50 border-l-4 border-indigo-600' : 'hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg ${selectedFileIndex === idx ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                          <FileText size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${selectedFileIndex === idx ? 'text-indigo-900' : 'text-slate-700'}`}>
                            {file.name}
                          </p>
                          <p className="text-[10px] text-slate-400 uppercase">{file.type} • {file.data.length} rows</p>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cleaning Controls */}
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 space-y-5">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Cleaning Rules</h3>
                
                <div className="space-y-4">
                  {/* NULL Values */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">NULL Values</label>
                    <div className="relative">
                      <select 
                        value={nullOption}
                        onChange={(e) => setNullOption(e.target.value as NullOption)}
                        className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      >
                        <option value="none">Leave unchanged</option>
                        <option value="drop">Drop rows with NULLs</option>
                        <option value="fill_0">Fill with 0</option>
                        <option value="fill_mean">Fill with mean</option>
                        <option value="fill_mode">Fill with mode</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                    </div>
                  </div>

                  {/* Blank Strings */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">Blank Strings</label>
                    <div className="relative">
                      <select 
                        value={blankOption}
                        onChange={(e) => setBlankOption(e.target.value as BlankOption)}
                        className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      >
                        <option value="none">Leave unchanged</option>
                        <option value="to_null">Convert to NULL</option>
                        <option value="drop">Drop rows with blanks</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                    </div>
                  </div>

                  {/* Zero Values */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">Zero Values</label>
                    <div className="relative">
                      <select 
                        value={zeroOption}
                        onChange={(e) => setZeroOption(e.target.value as ZeroOption)}
                        className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      >
                        <option value="none">Leave unchanged</option>
                        <option value="to_null">Convert to NULL</option>
                        <option value="replace_mean">Replace with mean</option>
                        <option value="replace_median">Replace with median</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                    </div>
                  </div>

                  {/* Duplicates */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">Duplicates</label>
                    <div className="relative">
                      <select 
                        value={duplicateOption}
                        onChange={(e) => setDuplicateOption(e.target.value as DuplicateOption)}
                        className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      >
                        <option value="keep">Keep duplicates</option>
                        <option value="remove">Remove duplicates</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                    </div>
                  </div>
                </div>

                <button 
                  onClick={cleanData}
                  disabled={isCleaning}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 mt-4"
                >
                  {isCleaning ? <RefreshCw className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                  {isCleaning ? 'Cleaning...' : `Clean ${files.length} File${files.length > 1 ? 's' : ''}`}
                </button>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="lg:col-span-9">
              <AnimatePresence mode="wait">
                {viewMode === 'preview' ? (
                  <motion.div 
                    key="preview"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-8"
                  >
                    {currentFile && (
                      <>
                        {/* Stats Panel */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Rows</p>
                            <p className="text-2xl font-bold text-slate-900">{currentFile.metadata.rowCount.toLocaleString()}</p>
                          </div>
                          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Columns</p>
                            <p className="text-2xl font-bold text-slate-900">{currentFile.metadata.colCount}</p>
                          </div>
                          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Avg. Nulls</p>
                            <p className="text-2xl font-bold text-slate-900">
                              {(_.mean(Object.values(currentFile.metadata.columnStats).map(s => (s as ColumnStats).nullPercentage))).toFixed(1)}%
                            </p>
                          </div>
                          <div className={`p-5 rounded-3xl shadow-sm border transition-all ${currentFile.rowsRemoved !== null ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-slate-200'}`}>
                            <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${currentFile.rowsRemoved !== null ? 'text-emerald-600' : 'text-slate-400'}`}>
                              Rows Removed
                            </p>
                            <p className={`text-2xl font-bold ${currentFile.rowsRemoved !== null ? 'text-emerald-700' : 'text-slate-900'}`}>
                              {currentFile.rowsRemoved !== null ? currentFile.rowsRemoved.toLocaleString() : '—'}
                            </p>
                          </div>
                        </div>

                        {/* Column Details */}
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                            <Info size={16} className="text-slate-400" />
                            <h3 className="text-sm font-bold text-slate-700">Column Metadata</h3>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-50/30">
                                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Column</th>
                                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Type</th>
                                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nulls %</th>
                                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Blanks %</th>
                                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Uniques</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {currentFile.headers.map(col => {
                                  const stats = currentFile.metadata.columnStats[col];
                                  return (
                                    <tr key={col} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="px-6 py-3 text-sm font-semibold text-slate-700">{col}</td>
                                      <td className="px-6 py-3 text-xs text-slate-500 capitalize">{stats.type}</td>
                                      <td className="px-6 py-3">
                                        <div className="flex items-center gap-2">
                                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-amber-400" style={{ width: `${stats.nullPercentage}%` }} />
                                          </div>
                                          <span className="text-xs text-slate-500">{stats.nullPercentage.toFixed(1)}%</span>
                                        </div>
                                      </td>
                                      <td className="px-6 py-3">
                                        <div className="flex items-center gap-2">
                                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-indigo-400" style={{ width: `${stats.blankPercentage}%` }} />
                                          </div>
                                          <span className="text-xs text-slate-500">{stats.blankPercentage.toFixed(1)}%</span>
                                        </div>
                                      </td>
                                      <td className="px-6 py-3 text-xs text-slate-500">{stats.uniqueCount.toLocaleString()}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Data Table */}
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                            <h3 className="font-semibold flex items-center gap-2">
                              <TableIcon size={18} className="text-slate-400" />
                              {currentFile.cleanedData ? 'Cleaned Data Preview' : 'Original Data Preview'}
                            </h3>
                            {currentFile.cleanedData && (
                              <button 
                                onClick={() => downloadFile(currentFile)}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-100 transition-all flex items-center gap-2"
                              >
                                <Download size={14} />
                                Download CSV
                              </button>
                            )}
                          </div>
                          <div className="overflow-x-auto max-h-[500px]">
                            <table className="w-full text-left border-collapse">
                              <thead className="sticky top-0 bg-white z-10 shadow-sm">
                                <tr>
                                  {currentFile.headers.map(header => (
                                    <th key={header} className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                      {header}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {(currentFile.cleanedData || currentFile.data).slice(0, 20).map((row, i) => (
                                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                    {currentFile.headers.map(header => (
                                      <td key={header} className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
                                        {row[header] === null || row[header] === undefined ? (
                                          <span className="text-slate-300 italic">null</span>
                                        ) : row[header] === "" ? (
                                          <span className="text-slate-300 italic">blank</span>
                                        ) : (
                                          String(row[header])
                                        )}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="p-4 text-center text-xs text-slate-400 bg-slate-50/30 border-t border-slate-50">
                              Showing first 20 rows
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </motion.div>
                ) : (
                  <motion.div 
                    key="history"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    {history.length === 0 ? (
                      <div className="h-96 flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-200 text-slate-400">
                        <History size={48} className="mb-4 opacity-20" />
                        <p>No cleaning runs recorded yet</p>
                      </div>
                    ) : (
                      history.map(entry => (
                        <div key={entry.id} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/30">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded uppercase">Run #{entry.id}</span>
                                <span className="text-xs text-slate-400">{entry.timestamp.toLocaleString()}</span>
                              </div>
                              <h4 className="font-bold text-slate-800">
                                Processed {entry.filesProcessed} file{entry.filesProcessed > 1 ? 's' : ''}
                              </h4>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="text-right">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Total Removed</p>
                                <p className="text-lg font-bold text-emerald-600">{entry.totalRowsRemoved.toLocaleString()} rows</p>
                              </div>
                            </div>
                          </div>
                          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                              <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Applied Rules</h5>
                              <div className="grid grid-cols-2 gap-3">
                                {Object.entries(entry.rules).map(([key, val]) => (
                                  <div key={key} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <p className="text-[10px] text-slate-400 capitalize mb-1">{key}</p>
                                    <p className="text-xs font-semibold text-slate-700 capitalize">{(val as string).replace('_', ' ')}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">File Details</h5>
                              <div className="space-y-3">
                                {entry.fileDetails.map((f, i) => (
                                  <div key={i} className="flex items-center justify-between text-sm">
                                    <span className="text-slate-600 truncate max-w-[200px]">{f.name}</span>
                                    <div className="flex items-center gap-2 text-slate-400">
                                      <span>{f.rowsBefore}</span>
                                      <ArrowRight size={12} />
                                      <span className="text-indigo-600 font-semibold">{f.rowsAfter}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
